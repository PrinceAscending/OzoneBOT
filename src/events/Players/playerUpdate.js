const { refreshNowPlayingMessage } = require("./playerStart");

const UPDATE_THROTTLE_MS = 4000;

module.exports = {
  name: "playerUpdate",
  run: async (client, player, data) => {
    if (!player?.data) return;
    const message = player.data.get("nowPlayingMessage");
    if (!message) return;

    // Track ended or playback stopped: drop the stored reference and stop updating.
    if (!player.playing || !player.queue?.current) {
      player.data.delete("nowPlayingMessage");
      player.data.delete("npLastUpdate");
      return;
    }

    // Progress is frozen while paused; the pause button already refreshes the card.
    if (player.paused || player.shoukaku?.paused) return;

    const now = Date.now();
    const lastUpdate = player.data.get("npLastUpdate") || 0;
    if (now - lastUpdate < UPDATE_THROTTLE_MS) return;
    player.data.set("npLastUpdate", now);

    const position = player.shoukaku?.position ?? data?.state?.position ?? 0;

    try {
      await refreshNowPlayingMessage(client, player, { position });
    } catch (error) {
      player.data.delete("nowPlayingMessage");
      player.data.delete("npLastUpdate");
      client.logger?.log(`[Player] Now-playing progress update failed: ${error.message}`, "warn");
    }
  },
};