const manifest = Object.freeze({
  check: { name: "oz_check", file: "check.png" },
  cross: { name: "oz_cross", file: "cross.png" },
  info: { name: "oz_info", file: "info.png" },
  warn: { name: "oz_warn", file: "warn.png" },
  star: { name: "oz_star", file: "star.png" },
  dot: { name: "oz_dot", file: "dot.png" },
  load: { name: "oz_loading", file: "loading.png" },
  pause: { name: "oz_pause", file: "pause.png" },
  play: { name: "oz_play", file: "play.png" },
  stop: { name: "oz_stop", file: "stop.png" },
  voldown: { name: "oz_voldown", file: "voldown.png" },
  volup: { name: "oz_volup", file: "volup.png" },
  skip: { name: "oz_skip", file: "skip.png" },
  previous: { name: "oz_previous", file: "previous.png" },
  shuffle: { name: "oz_shuffle", file: "shuffle.png" },
  loop: { name: "oz_loop", file: "loop.png" },
  autoplay: { name: "oz_autoplay", file: "autoplay.png" },
  music: { name: "oz_music", file: "music.png" },
  config: { name: "oz_config", file: "config.png" },
  utility: { name: "oz_utility", file: "utility.png" },
  filters: { name: "oz_filters", file: "filters.png" },
  home: { name: "oz_home", file: "home.png" },
  dance: { name: "oz_dance", file: "dance.png" },
  youtube: { name: "oz_youtube", file: "youtube.png" },
  spotify: { name: "oz_spotify", file: "spotify.png" },
  ytmusic: { name: "oz_ytmusic", file: "ytmusic.png" },
  applemusic: { name: "oz_applemusic", file: "applemusic.png" },
  deezer: { name: "oz_deezer", file: "deezer.png" },
  jiosaavn: { name: "oz_jiosaavn", file: "jiosaavn.png" },
  like: { name: "oz_favourite", file: "favourite.png" },
  favourite: { name: "oz_favourite", file: "favourite.png" },
});

const registry = Object.fromEntries(Object.keys(manifest).map((key) => [key, ""]));

const MENTION_PATTERN = /^<a?:(\w+):(\d+)>$/;

Object.defineProperty(registry, "manifest", {
  value: manifest,
  enumerable: false,
  writable: false,
});

/* Convert a registry emoji (mention string) into the object form required by
   select menu options / component emoji fields. Falls back to the raw string
   for unicode emojis, and to undefined when the emoji is not synced yet. */
Object.defineProperty(registry, "resolvable", {
  value: (name) => {
    const value = registry[name];
    if (!value) return undefined;
    const match = MENTION_PATTERN.exec(value);
    if (!match) return value;
    return { name: match[1], id: match[2], animated: value.startsWith("<a:") };
  },
  enumerable: false,
  writable: false,
});

/* Guarded emoji application for builders: .setEmoji("") and .setEmoji(undefined)
   BOTH throw ValidationError in discord.js — a failed emoji sync would
   otherwise crash whole commands (help, restart, blacklist). This no-ops when
   the emoji is not synced yet, so commands degrade gracefully. */
Object.defineProperty(registry, "setBuilderEmoji", {
  value: (builder, name) => {
    const value = registry[name];
    if (value && builder && typeof builder.setEmoji === "function") {
      try {
        builder.setEmoji(value);
      } catch { /* malformed mention — never brick a command over an emoji */ }
    }
    return builder;
  },
  enumerable: false,
  writable: false,
});

module.exports = registry;
