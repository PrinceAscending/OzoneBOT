

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
    const allNodes = [...this.shoukaku.nodes.values()];
    const connectedNodes = allNodes
      .filter((n) => n.state === 1)
      .sort((a, b) => (a.stats?.players || 0) - (b.stats?.players || 0));

    // Build ordered list of candidate nodes to attempt
    const candidateNodes = [];
    if (options.nodeName) {
      const requestedNode = this.shoukaku.nodes.get(options.nodeName);
      if (requestedNode) candidateNodes.push(requestedNode);
    }
    for (const n of connectedNodes) {
      if (!candidateNodes.some((c) => c.name === n.name)) {
        candidateNodes.push(n);
      }
    }
    if (candidateNodes.length === 0 && allNodes.length > 0) {
      candidateNodes.push(allNodes[0]);
    }
    if (candidateNodes.length === 0) return { type: "SEARCH", tracks: [] };

    const isUrl = /^https?:\/\//.test(query);
    let resolvedQuery = query;

    if (isUrl && (query.includes("youtube.com") || query.includes("youtu.be"))) {
      const videoId =
        query.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:&|#|$)/)?.[1] ||
        query.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1];
      if (videoId) {
        resolvedQuery = `intitle:${videoId}`;
      }
    }

    const primaryEngine = options.engine || this.defaultSearchEngine;
    const searchEngineList = isUrl
      ? [null]
      : [primaryEngine, ...fallbackEngines.filter((engine) => engine !== primaryEngine)];

    for (const node of candidateNodes) {
      if (node.state !== 1 && candidateNodes.length > 1 && candidateNodes.indexOf(node) === 0) {
        continue;
      }

      for (const engine of searchEngineList) {
        const searchQuery = engine ? `${engine}:${resolvedQuery}` : resolvedQuery;
        const res = await node.rest.resolve(searchQuery).catch(() => null);

        if (res && res.loadType !== LoadType.ERROR && res.data) {
          const result = processSearchResult(res, options.requester);
          if (result.tracks && result.tracks.length > 0) {
            return result;
          }
        }
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