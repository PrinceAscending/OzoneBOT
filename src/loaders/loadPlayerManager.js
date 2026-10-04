

const { Kazagumo, Plugins, KazagumoTrack, KazagumoPlayer } = require("kazagumo");
const { Connectors, LoadType } = require("shoukaku");
const NodeRouter = require("../engine/NodeRouter");
const QueuePersistence = require("../engine/QueuePersistence");
const PlayerMigrationService = require("../engine/PlayerMigrationService");

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
  // Initialize resilient multi-node mesh engines
  client.nodeRouter = new NodeRouter(client);
  client.queuePersistence = new QueuePersistence(client);
  client.migrationService = new PlayerMigrationService(client);

  const shoukakuOptions = {
    ...client.config.node_options,
    nodeResolver: (nodes, connection) => client.nodeRouter.getOptimalNode(connection?.guildId),
  };

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
    shoukakuOptions
  );

  // Wrap createPlayer to automatically honor NodeRouter and user/guild node preferences
  const originalCreatePlayer = manager.createPlayer.bind(manager);
  manager.createPlayer = async function (options) {
    if (!options.nodeName && options.guildId) {
      const optimal = client.nodeRouter.getOptimalNode(options.guildId);
      if (optimal) {
        options.nodeName = optimal.name;
      }
    } else if (options.nodeName) {
      const requested = manager.shoukaku.nodes.get(options.nodeName);
      if (!requested || requested.state !== 1) {
        const fallback = client.nodeRouter?.getOptimalNode(options.guildId);
        if (fallback) {
          options.nodeName = fallback.name;
        }
      }
    }
    if (options.shardId === undefined && options.guildId) {
      const guild = client.guilds.cache.get(options.guildId);
      if (guild) options.shardId = guild.shardId;
    }
    const player = await originalCreatePlayer(options);
    if (player) {
      player.state = 1;
    }
    return player;
  };

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
      .sort((a, b) => (client.nodeRouter?.calculateScore(a) ?? 0) - (client.nodeRouter?.calculateScore(b) ?? 0));

    // Build ordered list of candidate nodes to attempt
    const candidateNodes = [];
    if (options.nodeName) {
      const requestedNode = this.shoukaku.nodes.get(options.nodeName);
      if (requestedNode && requestedNode.state === 1) candidateNodes.push(requestedNode);
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
        const res = await node.rest.resolve(searchQuery).catch((err) => {
          client.nodeRouter?.addPenalty(node.name, 15);
          return null;
        });

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
    const rawType = String(res.loadType || "").toLowerCase();
    switch (rawType) {
      case "track":
        return {
          type: "TRACK",
          tracks: [new KazagumoTrack(res.data, requester)]
        };
      case "playlist":
        return {
          type: "PLAYLIST",
          playlistName: res.data?.info?.name || "Playlist",
          tracks: (res.data?.tracks || []).map((track) => new KazagumoTrack(track, requester))
        };
      case "search": {
        const rawTracks = Array.isArray(res.data) ? res.data : (res.data?.tracks || []);
        return {
          type: "SEARCH",
          tracks: rawTracks.map((track) => new KazagumoTrack(track, requester))
        };
      }
      default:
        return { type: "SEARCH", tracks: [] };
    }
  }

  client.manager = manager;
  return manager;
};