module.exports = {
  name: "disconnect",
  run: async (client, name, players, moved) => {
    try {
      if (moved) return;

      const manager = client.manager;
      if (!manager) return;

      const targets = Array.isArray(players) && players.length > 0
        ? players
        : [...manager.players.values()].filter(
            (player) => player.shoukaku?.node?.name === name || player.node?.name === name
          );

      if (client.migrationService && targets.length > 0) {
        client.logger?.log?.(
          `[Disconnect] Initiating auto-failover migration for ${targets.length} player(s) on node "${name}"`,
          "warn"
        );
        await client.migrationService.migratePlayersFromNode(name, targets);
      } else {
        for (const target of targets) {
          try {
            const guildId = target?.guildId;
            if (!guildId) continue;
            const kazagumoPlayer = manager.players.get(guildId);
            if (kazagumoPlayer) {
              await kazagumoPlayer.destroy();
            }
          } catch (err) {
            client.logger?.log?.(
              `[Disconnect] Cleanup error for player ${target?.guildId || "unknown"}: ${err?.message || err}`,
              "warn"
            );
          }
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