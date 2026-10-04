const { fetch } = require("undici");

/**
 * NodeRouter manages multi-node health, latency scoring, load balancing,
 * user/guild node preferences, and intelligent failover for Lavalink nodes.
 */
class NodeRouter {
  constructor(client) {
    this.client = client;
    this.latencies = new Map(); // nodeName -> latency in ms
    this.penalties = new Map(); // nodeName -> penalty score (decays over time)
    this.guildAffinity = new Map(); // guildId -> nodeName
    this.pingInterval = null;
    this.decayInterval = null;

    this.PING_INTERVAL_MS = 15000;
    this.PENALTY_DECAY_MS = 30000;

    this._startMonitoring();
  }

  get shoukaku() {
    return this.client.manager?.shoukaku;
  }

  get nodes() {
    if (!this.shoukaku?.nodes) return [];
    return [...this.shoukaku.nodes.values()];
  }

  /**
   * Starts periodic health probes and penalty decay timers
   */
  _startMonitoring() {
    this.pingInterval = setInterval(() => {
      this.probeAllNodes().catch(() => {});
    }, this.PING_INTERVAL_MS);
    this.pingInterval.unref?.();

    this.decayInterval = setInterval(() => {
      this._decayPenalties();
    }, this.PENALTY_DECAY_MS);
    this.decayInterval.unref?.();
  }

  /**
   * Pings a Lavalink node over HTTP REST to measure response latency
   */
  async probeNode(node) {
    if (!node || node.state !== 1) {
      this.latencies.set(node?.name, 9999);
      return 9999;
    }

    const start = Date.now();
    try {
      const protocol = node.secure ? "https" : "http";
      const url = `${protocol}://${node.url}/v4/info`;
      
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: node.auth,
          "User-Agent": "OZONE-NodeRouter/3.0",
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const latency = Date.now() - start;
        const current = this.latencies.get(node.name);
        // Exponential moving average: 70% current, 30% new
        const smoothed = current ? Math.round(current * 0.3 + latency * 0.7) : latency;
        this.latencies.set(node.name, smoothed);
        return smoothed;
      } else {
        this.addPenalty(node.name, 10);
        return 9999;
      }
    } catch (err) {
      this.addPenalty(node.name, 25);
      this.latencies.set(node.name, 9999);
      return 9999;
    }
  }

  /**
   * Probes all configured nodes concurrently
   */
  async probeAllNodes() {
    const nodes = this.nodes;
    if (!nodes.length) return;
    await Promise.allSettled(nodes.map((node) => this.probeNode(node)));
  }

  /**
   * Adds penalty score to an unstable node (e.g. timeout, search error, 404)
   */
  addPenalty(nodeName, points = 20) {
    const current = this.penalties.get(nodeName) || 0;
    this.penalties.set(nodeName, Math.min(current + points, 500));
  }

  /**
   * Gradually decays penalties over time for recovered nodes
   */
  _decayPenalties() {
    for (const [name, penalty] of this.penalties.entries()) {
      if (penalty <= 5) {
        this.penalties.delete(name);
      } else {
        this.penalties.set(name, Math.floor(penalty * 0.7));
      }
    }
  }

  /**
   * Calculates a composite load & health score for a node.
   * Lower score = better health & lighter load.
   */
  calculateScore(node) {
    if (!node || node.state !== 1) return 999999;

    const latency = this.latencies.get(node.name) ?? 80;
    const penalty = this.penalties.get(node.name) ?? 0;

    const stats = node.stats || {};
    const players = stats.players || 0;
    const playing = stats.playingPlayers || 0;
    const cores = stats.cpu?.cores || 1;
    const systemLoad = (stats.cpu?.systemLoad || 0) * 100;
    const lavalinkLoad = (stats.cpu?.lavalinkLoad || 0) * 100;

    const mem = stats.memory || {};
    const memUsed = mem.used || 0;
    const memTotal = mem.reservable || mem.allocated || 1;
    const memPercent = (memUsed / memTotal) * 100;

    // Load per CPU core
    const playerLoadScore = (players / Math.max(cores, 1)) * 15;
    const cpuScore = Math.max(systemLoad, lavalinkLoad) * 2;
    const memScore = memPercent * 0.5;
    const latencyScore = latency * 1.2;
    const penaltyScore = penalty * 40;

    return Math.round(playerLoadScore + cpuScore + memScore + latencyScore + penaltyScore);
  }

  /**
   * Selects the optimal Lavalink node for a guild.
   * Considers user/guild preference, health, latency, and load.
   */
  getOptimalNode(guildId = null, preferredNodeName = null) {
    const connectedNodes = this.nodes.filter((n) => n.state === 1);
    if (!connectedNodes.length) {
      return this.nodes[0] || null;
    }

    // Check explicit preference (User choice or Guild config)
    const targetName = preferredNodeName || (guildId ? this.guildAffinity.get(guildId) : null);
    if (targetName && targetName !== "auto") {
      const preferred = connectedNodes.find((n) => n.name.toLowerCase() === targetName.toLowerCase());
      if (preferred) {
        const penalty = this.penalties.get(preferred.name) || 0;
        // If preferred node is not severely degraded (penalty < 100), honor user choice!
        if (penalty < 100) {
          return preferred;
        }
      }
    }

    // Rank all healthy nodes by composite health score
    const scored = connectedNodes.map((node) => ({
      node,
      score: this.calculateScore(node),
    }));

    scored.sort((a, b) => a.score - b.score);
    const optimal = scored[0]?.node || connectedNodes[0];

    if (guildId && optimal) {
      this.guildAffinity.set(guildId, optimal.name);
    }

    return optimal;
  }

  /**
   * Sets sticky guild affinity for a specific node
   */
  setGuildAffinity(guildId, nodeName) {
    if (!guildId) return;
    if (!nodeName || nodeName === "auto") {
      this.guildAffinity.delete(guildId);
    } else {
      this.guildAffinity.set(guildId, nodeName);
    }
  }

  /**
   * Returns rich status metrics for all nodes (useful for /node command and UI)
   */
  getAllNodesStatus() {
    return this.nodes.map((node, index) => {
      const isConnected = node.state === 1;
      const latency = this.latencies.get(node.name) ?? (isConnected ? 0 : 9999);
      const penalty = this.penalties.get(node.name) ?? 0;
      const score = this.calculateScore(node);
      const stats = node.stats || {};

      let status = "Disconnected";
      let statusColor = 0xED4245; // Red
      if (isConnected) {
        if (penalty > 80 || (stats.cpu?.systemLoad || 0) > 0.85) {
          status = "Degraded";
          statusColor = 0xFEE75C; // Yellow
        } else {
          status = "Healthy";
          statusColor = 0x57F287; // Green
        }
      } else if (node.state === 0) {
        status = "Connecting";
        statusColor = 0x5865F2; // Blurple
      }

      const mem = stats.memory || {};
      const cpu = stats.cpu || {};

      return {
        index: index + 1,
        name: node.name,
        url: node.url,
        state: node.state,
        status,
        statusColor,
        isConnected,
        latency,
        penalty,
        score,
        players: stats.players || 0,
        playingPlayers: stats.playingPlayers || 0,
        uptime: Number(stats.uptime) || 0,
        memoryUsedMb: Math.round((mem.used || 0) / 1024 / 1024),
        memoryFreeMb: Math.round((mem.free || 0) / 1024 / 1024),
        memoryTotalMb: Math.round((mem.reservable || mem.allocated || 0) / 1024 / 1024),
        cpuCores: cpu.cores || 1,
        systemCpuPercent: Math.round((cpu.systemLoad || 0) * 100),
        lavalinkCpuPercent: Math.round((cpu.lavalinkLoad || 0) * 100),
      };
    });
  }

  destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.decayInterval) clearInterval(this.decayInterval);
  }
}

module.exports = NodeRouter;
