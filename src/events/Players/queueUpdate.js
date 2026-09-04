const { refreshNowPlayingMessage } = require("./playerStart");

module.exports = {
  name: "queueUpdate",
  run: async (client, player) => {
    // Radio top-up: whenever the queue drops to the refill threshold, the
    // station silently adds the next batch — seamless broadcast.
    try {
      const { maybeRefill } = require("../../utils/radio");
      await maybeRefill(client, player);
    } catch (e) {
      client.logger?.log(`[Radio] queueUpdate hook error: ${e.message}`, "error");
    }

    const pending = player.data?.get("queueUiRefresh");
    if (pending) clearTimeout(pending);

    const timeout = setTimeout(() => {
      player.data?.delete("queueUiRefresh");
      refreshNowPlayingMessage(client, player).catch((error) => {
        client.logger?.log(`[Player] Queue UI refresh failed: ${error.message}`, "warn");
      });
    }, 150);
    timeout.unref?.();
    player.data?.set("queueUiRefresh", timeout);
  },
};
