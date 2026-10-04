module.exports = {
  name: "playerClosed",
  run: async (client, player, data) => {
    client.logger?.log(
      `[Player Closed] Guild ${player?.guildId}: Code ${data?.code || "unknown"}, Reason: ${data?.reason || "none"}, byRemote: ${data?.byRemote}`,
      "warn"
    );

    // Delete now playing message if active
    if (player?.data) {
      const message = player.data.get("nowPlayingMessage");
      if (message) {
        message.delete().catch(() => {});
        player.data.delete("nowPlayingMessage");
      }
    }
  },
};
