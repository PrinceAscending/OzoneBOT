const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");

module.exports = {
  name: "playerException",
  run: async (client, player, reason) => {
    const errorMsg = reason?.exception?.message || reason?.message || String(reason || "Track playback exception");
    client.logger?.log(`[Player Exception] Guild ${player?.guildId}: ${errorMsg}`, "warn");

    if (!player) return;

    try {
      const channel = client.channels.cache.get(player.textId);
      if (channel) {
        const errorCard = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${client.emoji.cross || ""} Playback Exception:** ${errorMsg.substring(0, 100)}. Skipping track...`
            )
          );

        channel.send({
          components: [errorCard],
          flags: MessageFlags.IsComponentsV2,
        }).then((msg) => {
          setTimeout(() => msg.delete().catch(() => {}), 8000);
        }).catch(() => {});
      }

      // Auto-skip failed track
      if (player.queue?.length > 0 || player.queue?.current) {
        await player.skip().catch(() => {});
      }
    } catch (err) {
      client.logger?.log(`[Player Exception Handler] Recovery failed: ${err.message}`, "error");
    }
  },
};
