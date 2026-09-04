module.exports = {
  name: "disconnect",
  run: async (client, name, players, moved) => {
    try {
      if (moved) return;

      const manager = client.manager;
      if (!manager) return;

      // moveOnDisconnect is disabled in config, so players on the dead node
      // are neither moved nor destroyed. Destroy them here so /play can
      // recreate a clean player on another node.
      const targets = Array.isArray(players) && players.length > 0
        ? players
        : [...manager.players.values()].filter(
            (player) => player.shoukaku?.node?.name === name
          );

      for (const target of targets) {
        try {
          const guildId = target?.guildId;
          if (!guildId) continue;
          const kazagumoPlayer = manager.players.get(guildId);
          if (kazagumoPlayer) {
            await kazagumoPlayer.destroy();
            client.logger?.log?.(
              `[Disconnect] Destroyed player for guild ${guildId} (node "${name}" disconnected)`,
              "warn"
            );
          }
        } catch (err) {
          client.logger?.log?.(
            `[Disconnect] Failed to destroy player ${target?.guildId || "unknown"}: ${err?.message || err}`,
            "warn"
          );
        }
      }

      client.logger.log(`Lavalink ${name}: Disconnected`, "warn");
    } catch (error) {
      client.logger?.log?.(
        `[Disconnect] Error handling node disconnect: ${error?.message || error}`,
        "error"
      );
    }
  },
};