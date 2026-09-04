

const { Kazagumo, Plugins, KazagumoTrack, KazagumoPlayer } = require("kazagumo");
const { Connectors, LoadType } = require("shoukaku");

const searchEngines = {
  DEEZER: "dzsearch",
  SPOTIFY: "spsearch",
  YOUTUBE: "ytsearch",
  JIO_SAAVAN: "jssearch",
  APPLE_MUSIC: "amsearch",
  YOUTUBE_MUSIC: "ytmsearch"
};

const fallbackEngines = ["ytmsearch", "amsearch", "spsearch", "ytsearch"];

module.exports = function loadPlayerManager(client) {
  const manager = new Kazagumo(
    {
      defaultSearchEngine: client.config.node_source,
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      }
    },
    new Connectors.DiscordJS(client),
    client.config.nodes,
    client.config.node_options
  );

  KazagumoPlayer.prototype.search = function (query, options = {}) {
    return this.kazagumo.search(query, { ...options, nodeName: this.node?.name });
  };

  manager.shoukaku.on("ready", (name, resumed) => {
    const node = manager.shoukaku.nodes.get(name);
    client.logger?.log(`Lavalink node "${name}" ready. Resumed: ${resumed}. SessionID: ${node?.sessionId}`, "debug");
  });

  manager.searchEngines = searchEngines;

  manager.defaultSearchEngine = client.config.node_source;

  manager.search = async function (query, options = {}) {
    // Honor an explicit nodeName (player.search always passes the player's own
    // node); otherwise pick the first CONNECTED node, falling back to any node.
    let node = options.nodeName ? this.shoukaku.nodes.get(options.nodeName) : null;
    if (!node) {
      const nodes = [...this.shoukaku.nodes.values()];
      node = nodes.find((n) => n.state === 1) || nodes[0];
    }
    if (!node) return { type: "SEARCH", tracks: [] };

    const isUrl = /^https?:\/\//.test(query);

    if (isUrl) {
      const directRes = await node.rest.resolve(query).catch(() => null);
      if (directRes && directRes.loadType !== LoadType.ERROR) {
        return processSearchResult(directRes, options.requester);
      }

      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        // Only extract a video id from real YouTube URLs: a `v=` query param
        // (watch URLs) or a youtu.be/<id> path. The old `(?:v=|\/)` pattern
        // could match any 11-char path segment of a non-YouTube URL.
        const videoId =
          query.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:&|#|$)/)?.[1] ||
          query.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1];
        if (videoId) {
          query = `intitle:${videoId}`;
        }
      }
    }

    // Primary engine first, then fallbacks — never including the primary again
    // (the old Set-based dedupe kept the default engine in the list, so it was
    // searched twice).
    const primaryEngine = options.engine || this.defaultSearchEngine;
    const searchEngineList = [primaryEngine, ...fallbackEngines.filter((engine) => engine !== primaryEngine)];

    for (const engine of searchEngineList) {
      const searchQuery = `${engine}:${query}`;
      const res = await node.rest.resolve(searchQuery).catch(() => null);

      if (res && res.loadType !== LoadType.ERROR && res.data) {
        return processSearchResult(res, options.requester);
      }
    }

    return { type: "SEARCH", tracks: [] };
  };

  function processSearchResult(res, requester) {
    switch (res.loadType) {
      case LoadType.TRACK:
        return {
          type: "TRACK",
          tracks: [new KazagumoTrack(res.data, requester)]
        };
      case LoadType.PLAYLIST:
        return {
          type: "PLAYLIST",
          playlistName: res.data.info.name,
          tracks: res.data.tracks.map((track) => new KazagumoTrack(track, requester))
        };
      case LoadType.SEARCH:
        return {
          type: "SEARCH",
          tracks: res.data.map((track) => new KazagumoTrack(track, requester))
        };
      default:
        return { type: "SEARCH", tracks: [] };
    }
  }

  client.manager = manager;
  return manager;
};