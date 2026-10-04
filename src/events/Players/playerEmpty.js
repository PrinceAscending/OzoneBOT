module.exports = {
  name: "playerEmpty",
  run: async (client, player) => {
    const isRadio = Boolean(player.data?.get("radioStation"));
    const isAutoplay = Boolean(player.data?.get("autoplay"));

    if (isRadio) {
      // Radio: queue hit empty — top the station back up and keep broadcasting.
      try {
        const { maybeRefill, refillQueue } = require("../../utils/radio");
        let added = await maybeRefill(client, player);
        if (added === 0 && player?.data?.get("radioStation")) {
          // maybeRefill skips when the threshold gate fails on an empty queue —
          // force one last refill round before letting the station die.
          added = await refillQueue(client, player, client.user);
        }
        if (added > 0 && !player.playing && !player.paused) {
          await player.play().catch((e) => {
            client.logger?.log(`[Radio] restart play failed: ${e.message}`, "error");
          });
        }
      } catch (e) {
        client.logger?.log(`[Radio] playerEmpty hook error: ${e.message}`, "error");
      }
    } else if (isAutoplay) {
      try {
        const { attemptAutoplay } = require("../../utils/playerUtils");
        await attemptAutoplay(client, player);
      } catch (e) {
        client.logger?.log(`[Autoplay] playerEmpty hook error: ${e.message}`, "error");
      }
    }
    if (!player.queue?.current && !player.playing) {
      const { syncVoiceChannelStatus } = require("../../utils/voiceChannelStatus");
      await syncVoiceChannelStatus(client, player, { state: "idle" });
    }
  },
};
