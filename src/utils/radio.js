/**
 * OZONE Radio — endless themed stations.
 *
 * A "station" is a seeded search query + a colour + a vibe. When enabled, the
 * station refills the queue automatically whenever it runs low (via the
 * queueUpdate/playerEmpty hooks below), so the music literally never stops —
 * unlike autoplay, it keeps a consistent genre/mood and shows a branded card.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require("discord.js");
const emoji = require("../emojis");

const STATIONS = Object.freeze({
  lofi:      { label: "Lofi Beats",        query: "lofi hip hop beats",        color: 0x8B7BD8, desc: "Chill beats to relax / study to" },
  bollywood: { label: "Bollywood Hits",    query: "bollywood top hits",        color: 0xE86A92, desc: "Non-stop desi masala" },
  punjabi:   { label: "Punjabi Heat",      query: "punjabi hits",              color: 0xF0B232, desc: "Bhangra and desi hip-hop" },
  edm:       { label: "EDM Zone",          query: "edm festival hits",         color: 0x00C2A8, desc: "Festival energy, always" },
  bhakti:    { label: "Bhakti Sangam",     query: "bhakti songs peaceful",     color: 0xF5871F, desc: "Devotional calm" },
  sad:       { label: "Sad Hours",         query: "sad songs hindi english",   color: 0x5B7FBF, desc: "For the 2am feelings" },
  party:     { label: "Party Central",     query: "party dance hits",          color: 0xE0426E, desc: "Turn the VC into a club" },
  gym:       { label: "Gym Beast Mode",    query: "workout gym motivation music", color: 0xD64141, desc: "Lift heavy things" },
  sleep:     { label: "Sleep Ambience",    query: "sleep ambient music",       color: 0x4C5C75, desc: "Drift off gently" },
  romantic:  { label: "Romance Radio",     query: "romantic love songs",       color: 0xFF7EB6, desc: "Date-night frequencies" },
});

const REFILL_THRESHOLD = 2;    // refill when queue has ≤ 2 tracks left
const REFILL_BATCH = 3;        // add up to 3 station tracks per top-up
const HISTORY_KEY = "radioHistory";

function stationFor(name) {
  return STATIONS[String(name || "").toLowerCase()] || null;
}

function stationNames() {
  return Object.keys(STATIONS);
}

/** Avoid repeating recent station tracks — store a small rolling list of identifiers. */
function wasRecentlyPlayed(player, track) {
  const recent = player.data.get(HISTORY_KEY) || [];
  return recent.includes(track.identifier || track.uri);
}

function rememberTrack(player, track, limit = 25) {
  const recent = player.data.get(HISTORY_KEY) || [];
  recent.push(track.identifier || track.uri);
  player.data.set(HISTORY_KEY, recent.slice(-limit));
}

/** Pick a random seed rotation so each top-up explores the station. */
function seedQuery(station, attempt = 0) {
  const rotations = [station.query, `${station.query} mix`, `${station.query} top`, `${station.query} best`, `${station.query} radio`];
  return rotations[attempt % rotations.length];
}

async function refillQueue(client, player, fallbackRequester) {
  const stationName = player.data.get("radioStation");
  if (!stationName) return 0;
  const station = stationFor(stationName);
  if (!station) {
    player.data.delete("radioStation");
    return 0;
  }

  let added = 0;
  try {
    for (let attempt = 0; attempt < 5 && added < REFILL_BATCH; attempt++) {
      const query = seedQuery(station, attempt + Math.floor(Math.random() * 3));
      const res = await player.search(query, { requester: fallbackRequester || client.user }).catch(() => null);
      const tracks = (res?.tracks || []).filter((t) => t && !wasRecentlyPlayed(player, t));
      for (const track of tracks) {
        if (added >= REFILL_BATCH) break;
        player.queue.add(track);
        rememberTrack(player, track);
        added++;
      }
    }
  } catch (error) {
    client.logger?.log(`[Radio] Station refill failed in guild ${player.guildId}: ${error.message}`, "warn");
  }
  return added;
}

/** Called from the queueUpdate / playerEmpty hooks to keep the station alive. */
async function maybeRefill(client, player) {
  if (!player?.data?.get("radioStation")) return 0;
  // Music Quiz has priority over the station while it runs.
  if (player.data.get("quiz")) return 0;
  const queueLow = (player.queue?.length || 0) <= REFILL_THRESHOLD;
  if (!queueLow) return 0;
  return refillQueue(client, player, client.user);
}

function stationCard(client, player, station, extras = {}) {
  const requester = extras.requester ? `\n**${emoji.dot} Tuned by** <@${extras.requester}>` : "";
  const current = player?.queue?.current;
  const nowLine = current
    ? `\n**${emoji.music} On air now** [${String(current.title).slice(0, 60)}](${current.uri})`
    : `\n**${emoji.music} Warming up the signal…**`;
  const upNextCount = player?.queue?.length || 0;

  return new ContainerBuilder()
    .setAccentColor(station.color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${emoji.autoplay || "📡"} ${station.label} — OZONE Radio\n` +
      `-# ${station.desc}${requester}`,
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${nowLine}\n` +
      `**${emoji.dot} Up next** \`${upNextCount}\` station tracks queued\n` +
      `**${emoji.dot} Stop** \`/radio off\` — the station signs off`,
    ));
}

module.exports = {
  STATIONS,
  stationFor,
  stationNames,
  maybeRefill,
  refillQueue,
  stationCard,
  REFILL_THRESHOLD,
};
