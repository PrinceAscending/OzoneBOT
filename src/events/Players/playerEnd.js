module.exports = {
  name: "playerEnd",
  run: async (client, player) => {
    try {
      const message = player.data.get("nowPlayingMessage");
      if (message) {
        await message.delete().catch(() => { });
        player.data.delete("nowPlayingMessage");
      }
      // History is recorded in playerStart (when the next track begins) —
      // pushing here too would duplicate the same track in the history.
      // Radio vs Autoplay: ensure only one mode controls queue replenishment
      const isRadio = Boolean(player.data?.get("radioStation"));
      const isAutoplay = Boolean(player.data?.get("autoplay"));

      if (isRadio) {
        try {
          const { maybeRefill } = require("../../utils/radio");
          await maybeRefill(client, player);
        } catch (e) {
          client.logger?.log(`[Radio] playerEnd hook error: ${e.message}`, "error");
        }
      } else if (isAutoplay) {
        try {
          const { attemptAutoplay } = require("../../utils/playerUtils");
          await attemptAutoplay(client, player);
        } catch (e) {
          client.logger?.log(`[Autoplay] playerEnd hook error: ${e.message}`, "error");
        }
      }
      if (!player.queue?.current && !player.playing) {
        const { syncVoiceChannelStatus } = require("../../utils/voiceChannelStatus");
        await syncVoiceChannelStatus(client, player, { state: "idle" });
        if (!player.queue || player.queue.length === 0) {
          client.queuePersistence?.clearPlayerState(player.guildId);
        } else {
          client.queuePersistence?.savePlayerState(player);
        }
      } else {
        client.queuePersistence?.savePlayerState(player);
      }
    } catch (error) {
      console.error("Error in playerEnd event:", error);
    }
  },
};
