const QueuePersistenceModel = require("../schema/queuepersistence");

/**
 * QueuePersistence provides rock-solid state management for active queues,
 * track positions, playback settings, and node choices across restarts,
 * cluster respawns, and node failovers.
 */
class QueuePersistence {
  constructor(client) {
    this.client = client;
    this.memoryCache = new Map(); // guildId -> snapshot
    this.saveTimeouts = new Map(); // guildId -> timeout
    this.SAVE_DEBOUNCE_MS = 1500;
  }

  /**
   * Serialize a KazagumoTrack or raw track into clean JSON
   */
  serializeTrack(track) {
    if (!track) return null;
    return {
      title: track.title || "Unknown Title",
      author: track.author || "Unknown Artist",
      length: track.length || 0,
      identifier: track.identifier || "",
      isSeekable: Boolean(track.isSeekable),
      isStream: Boolean(track.isStream),
      uri: track.uri || "",
      thumbnail: track.thumbnail || track.artworkUrl || "",
      realUri: track.realUri || track.uri || "",
      requester: track.requester
        ? {
            id: track.requester.id || track.requester,
            username: track.requester.username || "User",
          }
        : null,
      track: track.track || "", // Raw Lavalink base64 string
    };
  }

  /**
   * Captures a complete snapshot of player state
   */
  captureSnapshot(player) {
    if (!player || !player.guildId) return null;

    const currentTrack = player.queue?.current ? this.serializeTrack(player.queue.current) : null;
    const queue = (player.queue || []).map((t) => this.serializeTrack(t)).filter(Boolean);

    // Current playback position in ms
    const position = player.shoukaku?.position ?? player.position ?? 0;

    return {
      guildId: player.guildId,
      voiceId: player.voiceId,
      textId: player.textId,
      currentTrack,
      position: Math.max(0, position),
      queue,
      volume: player.volume ?? 80,
      loop: player.loop ?? "none",
      filters: player.filters || {},
      autoplay: Boolean(player.data?.get("autoplay")),
      sessionSource: player.data?.get("sessionSource") || "ytmsearch",
      selectedNode: player.node?.name || null,
      radioStation: player.data?.get("radioStation") || null,
      lastActive: Date.now(),
    };
  }

  /**
   * Saves player state to memory immediately, and schedules debounced DB write
   */
  savePlayerState(player, immediate = false) {
    if (!player || !player.guildId) return;

    const snapshot = this.captureSnapshot(player);
    if (!snapshot) return;

    this.memoryCache.set(player.guildId, snapshot);

    if (this.saveTimeouts.has(player.guildId)) {
      clearTimeout(this.saveTimeouts.get(player.guildId));
      this.saveTimeouts.delete(player.guildId);
    }

    const persistToDb = async () => {
      try {
        await QueuePersistenceModel.findOneAndUpdate(
          { guildId: player.guildId },
          snapshot,
          { upsert: true, returnDocument: "after" }
        );
      } catch (err) {
        this.client.logger?.log?.(`[QueuePersistence] Failed to persist state for ${player.guildId}: ${err.message}`, "warn");
      }
    };

    if (immediate) {
      persistToDb().catch(() => {});
    } else {
      const timer = setTimeout(persistToDb, this.SAVE_DEBOUNCE_MS);
      timer.unref?.();
      this.saveTimeouts.set(player.guildId, timer);
    }
  }

  /**
   * Retrieves player state from memory or persistent DB
   */
  async getPlayerState(guildId) {
    if (!guildId) return null;

    if (this.memoryCache.has(guildId)) {
      return this.memoryCache.get(guildId);
    }

    try {
      const doc = await QueuePersistenceModel.findOne({ guildId }).lean();
      if (doc) {
        this.memoryCache.set(guildId, doc);
        return doc;
      }
    } catch (err) {
      this.client.logger?.log?.(`[QueuePersistence] Error reading state for ${guildId}: ${err.message}`, "warn");
    }

    return null;
  }

  /**
   * Removes saved state when player is intentionally cleared/stopped
   */
  async clearPlayerState(guildId) {
    if (!guildId) return;

    this.memoryCache.delete(guildId);
    if (this.saveTimeouts.has(guildId)) {
      clearTimeout(this.saveTimeouts.get(guildId));
      this.saveTimeouts.delete(guildId);
    }

    try {
      await QueuePersistenceModel.deleteOne({ guildId });
    } catch {}
  }
}

module.exports = QueuePersistence;
