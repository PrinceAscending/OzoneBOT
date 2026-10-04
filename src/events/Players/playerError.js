const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");

module.exports = {
  name: "playerError",
  run: async (client, player, error) => {
    client.logger?.log(`[Player Error] Guild ${player?.guildId}: ${error?.message || error}`, "error");

    if (!player) return;

    try {
      const channel = client.channels.cache.get(player.textId);
      if (channel) {
        const errorCard = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${client.emoji.cross || ""} Playback Error:** Failed to play track. Skipping to next track...`
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
      client.logger?.log(`[Player Error Handler] Recovery failed: ${err.message}`, "error");
    }
  },
};
