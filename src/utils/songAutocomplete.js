/**
 * Shared autocomplete helper for song-query commands (/play, /playnext, ...).
 *
 * Why this exists:
 * - Discord requires an autocomplete response within 3 seconds. The old per-command
 *   handlers did a MongoDB read (UserPreferences) and then a Lavalink search, with a
 *   2.5s timer that only covered the search — total time routinely blew past 3s,
 *   causing DiscordAPIError 10062 ("Unknown interaction") spam and missing suggestions.
 * - This module enforces a hard total deadline, caches the user's search-engine
 *   preference and recent results in memory, and falls back to stale results when the
 *   Lavalink node is slow or down, so users always get something useful.
 */

const UserPreferences = require("../schema/userpreferences");
const { convertTime } = require("./convert");

const DEFAULT_ENGINE = "ytmsearch";
const PREF_TTL_MS = 5 * 60 * 1000; // how long a cached user preference is trusted
const PREF_FETCH_CAP_MS = 300; // hard cap on the DB read inside the hot path
const SEARCH_FRESH_TTL_MS = 60 * 1000; // results served to the next keystroke
const SEARCH_STALE_MAX_AGE_MS = 10 * 60 * 1000; // stale results still served as fallback
const TOTAL_DEADLINE_MS = 2500; // total budget from handler start (must stay < 3000)
const MAX_CACHE_ENTRIES = 400;

const prefCache = new Map(); // userId -> { engine, at }
const searchCache = new Map(); // `${engine}:${query}` -> { choices, at }

const URL_RE = /^https?:\/\//i;
const URL_HOSTS = ["youtube.com", "youtu.be", "spotify.com", "music.apple.com", "deezer.com", "jiosaavn.com"];

const isUrl = (value) => {
  if (URL_RE.test(value)) return true;
  try {
    const host = new URL(value.startsWith("http") ? value : `http://${value}`).hostname.toLowerCase();
    return URL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
};

const isExpiredInteraction = (error) => Boolean(error && (error.code === 10062 || error.code === "10062"));

/** Bound a promise by a timeout; rejections and timeouts resolve to `fallback`. */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/** Drop expired entries, then the oldest, until the map fits under MAX_CACHE_ENTRIES. */
function prune(map, maxAge) {
  if (map.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now - entry.at >= maxAge) map.delete(key);
  }
  if (map.size > MAX_CACHE_ENTRIES) {
    const entries = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < entries.length && map.size > MAX_CACHE_ENTRIES; i++) map.delete(entries[i][0]);
  }
}

// ---- user preference cache -------------------------------------------------

function getCachedEngine(userId) {
  const entry = prefCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at >= PREF_TTL_MS) {
    prefCache.delete(userId);
    return null;
  }
  return entry.engine;
}

function setCachedEngine(userId, engine) {
  prefCache.set(userId, { engine, at: Date.now() });
  prune(prefCache, PREF_TTL_MS);
}

/** Call after any write to UserPreferences so the next keystroke re-reads fresh data. */
function invalidateUserPref(userId) {
  prefCache.delete(userId);
}

// ---- search result cache ---------------------------------------------------

function getCachedChoices(cacheKey, allowStale = false) {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age < SEARCH_FRESH_TTL_MS) return entry.choices;
  if (allowStale && age < SEARCH_STALE_MAX_AGE_MS) return entry.choices;
  // Only evict entries that are beyond the stale window — a fresh-only lookup
  // must not destroy data the stale fallback may still need.
  if (age >= SEARCH_STALE_MAX_AGE_MS) searchCache.delete(cacheKey);
  return null;
}

function setCachedChoices(cacheKey, choices) {
  searchCache.set(cacheKey, { choices, at: Date.now() });
  prune(searchCache, SEARCH_STALE_MAX_AGE_MS);
}

// ---- choice building -------------------------------------------------------

const SOURCE_LABELS = {
  ytsearch: "YouTube",
  ytmsearch: "YouTube Music",
  spsearch: "Spotify",
  amsearch: "Apple Music",
  dzsearch: "Deezer",
  jssearch: "JioSaavn",
};

const sourceLabel = (engine) => SOURCE_LABELS[engine] || engine || "Search";

/** Collapse newlines and runs of whitespace into single spaces, then trim. */
function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/** Cap a choice name at Discord's 100-char limit, adding an ellipsis. */
function capLabel(text, max = 100) {
  if (text.length <= max) return text;
  return `${text.substring(0, max - 3)}...`;
}

/** "Artist - Title" when both exist, otherwise the title alone. */
function buildLabel(track) {
  const title = normalizeText(track.title);
  const author = normalizeText(track.author);
  if (title && author) return capLabel(`${author} - ${title}`);
  return capLabel(title || "Unknown");
}

/** Short description: "3:45 · YouTube" (duration skipped for 0/unknown, e.g. live). */
function buildDescription(track, engine) {
  const parts = [];
  if (track.length > 0) parts.push(convertTime(track.length));
  parts.push(sourceLabel(engine));
  return parts.join(" · ");
}

/** Dedupe keys: a track is a duplicate if its identifier OR its title+artist repeats. */
function trackDedupeKeys(track) {
  const keys = [`t:${normalizeText(track.title).toLowerCase()}|${normalizeText(track.author).toLowerCase()}`];
  if (track.identifier) keys.push(`id:${track.identifier}`);
  return keys;
}

/** Exact title match first, then prefix matches, then the rest (stable order). */
function rankTracks(tracks, query) {
  const normalizedQuery = normalizeText(query).toLowerCase();
  const exact = [];
  const prefix = [];
  const rest = [];
  for (const track of tracks) {
    const title = normalizeText(track.title).toLowerCase();
    if (title === normalizedQuery) exact.push(track);
    else if (title.startsWith(normalizedQuery)) prefix.push(track);
    else rest.push(track);
  }
  return [...exact, ...prefix, ...rest];
}

function buildChoices(tracks, engine, query) {
  // Dedupe first so ranking/slicing sees only unique tracks.
  const seen = new Set();
  const unique = [];
  for (const track of tracks || []) {
    const keys = trackDedupeKeys(track);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    unique.push(track);
  }
  return rankTracks(unique, query)
    .slice(0, 25)
    .map((track) => {
      const rawValue = track.uri || track.identifier || `${engine}:${track.title}`;
      return {
        name: buildLabel(track),
        description: buildDescription(track, engine),
        // Keep the value intact — long URLs must stay valid queries. Discord's
        // autocomplete limit applies to the choice name, not the value.
        value: rawValue,
      };
    });
}

/** Single fallback choice that still lets the user submit their raw input. */
function buildFallbackChoice(rawValue) {
  return [{ name: "No results found", value: rawValue }];
}

async function respondEmpty(interaction) {
  try {
    await interaction.respond([]);
  } catch {
    // The interaction expired (10062) or was already responded to — nothing to do.
  }
}

async function respondChoices(interaction, choices) {
  if (!choices || choices.length === 0) return respondEmpty(interaction);
  try {
    await interaction.respond(choices);
  } catch (error) {
    if (!isExpiredInteraction(error)) {
      console.error("songAutocomplete: failed to respond:", error);
    }
  }
}

// ---- main handler ----------------------------------------------------------

async function handleSongAutocomplete(interaction, client) {
  const focusedValue = interaction.options.getFocused();
  if (!focusedValue || focusedValue.length < 2) return respondEmpty(interaction);
  if (isUrl(focusedValue)) return respondEmpty(interaction);

  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  const remaining = () => deadline - Date.now();

  // Cache-first: if we already have fresh results for this user + query, respond
  // instantly without any awaits (besides the final respond call).
  let engine = getCachedEngine(interaction.user.id) || DEFAULT_ENGINE;
  let cacheKey = `${engine}:${focusedValue}`;
  let choices = getCachedChoices(cacheKey);
  if (choices) return respondChoices(interaction, choices);

  // Load the user's preferred search engine (memory cache or a capped DB read).
  if (!getCachedEngine(interaction.user.id)) {
    const fetched = await withTimeout(
      UserPreferences.findOne({ userId: interaction.user.id }),
      Math.min(PREF_FETCH_CAP_MS, remaining()),
      null,
    );
    // `fetched === null` here means the DB answered "no preferences" (a timeout
    // would also resolve null, but then caching the default is harmless).
    setCachedEngine(interaction.user.id, fetched?.musicSource || DEFAULT_ENGINE);
  }
  engine = getCachedEngine(interaction.user.id) || DEFAULT_ENGINE;
  cacheKey = `${engine}:${focusedValue}`;

  choices = getCachedChoices(cacheKey);
  if (choices) return respondChoices(interaction, choices);

  if (remaining() <= 0) {
    const stale = getCachedChoices(cacheKey, true);
    if (stale) return respondChoices(interaction, stale);
    return respondChoices(interaction, buildFallbackChoice(focusedValue));
  }

  const searchResult = await withTimeout(
    client.manager.search(focusedValue, { engine, requester: interaction.user }),
    Math.max(100, remaining()),
    { type: "SEARCH", tracks: [] },
  );

  const tracks = searchResult?.tracks || [];
  if (tracks.length > 0) {
    choices = buildChoices(tracks, engine, focusedValue);
    if (choices.length > 0) {
      setCachedChoices(cacheKey, choices);
      return respondChoices(interaction, choices);
    }
  }

  // Fresh search produced nothing or hit the deadline — serve stale results if any.
  const stale = getCachedChoices(cacheKey, true);
  if (stale) return respondChoices(interaction, stale);
  // Nothing at all: give the user a single choice so they can still submit the raw query.
  return respondChoices(interaction, buildFallbackChoice(focusedValue));
}

module.exports = {
  handleSongAutocomplete: async (interaction, client) => {
    try {
      await handleSongAutocomplete(interaction, client);
    } catch (error) {
      if (!isExpiredInteraction(error)) {
        console.error("songAutocomplete: unexpected error:", error);
      }
      try {
        await respondChoices(interaction, buildFallbackChoice(interaction.options.getFocused()));
      } catch {
        await respondEmpty(interaction);
      }
    }
  },
  invalidateUserPref,
};
