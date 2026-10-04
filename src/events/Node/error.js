const { safeDestroyPlayer } = require("../../utils/playerUtils");
const lastErrorTime = new Map();
const ERROR_THROTTLE_MS = 60000;

module.exports = {
  name: "error",
  run: async (client, name, error) => {
    const errorKey = `${name}_${error.code || error.message}`;
    const now = Date.now();
    const lastTime = lastErrorTime.get(errorKey) || 0;

    if (error.code === 'ETIMEDOUT' || error.message?.includes('ETIMEDOUT')) {
      if (now - lastTime < ERROR_THROTTLE_MS) {
        return;
      }
      lastErrorTime.set(errorKey, now);
      client.logger.log(`Lavalink "${name}" connection timeout (will retry automatically)`, "warn");
      return;
    }

    client.logger.log(`Lavalink "${name}" error ${error}`, "error");
    client.nodeRouter?.addPenalty(name, 30);

    if (error && error.message && error.message.includes('Session not found')) {
      client.logger.log(`Session lost for node "${name}", migrating affected players to healthy nodes...`, "warn");

      const affected = [...(client.manager?.players?.values() || [])].filter(
        (p) => p.shoukaku?.node?.name === name || p.node?.name === name
      );

      if (client.migrationService && affected.length > 0) {
        await client.migrationService.migratePlayersFromNode(name, affected);
      } else {
        for (const player of affected) {
          try {
            client.voiceHealthMonitor?.stopMonitoring(player.guildId);
            await safeDestroyPlayer(player);
          } catch (cleanupError) {
            client.logger.log(`Error cleaning up player ${player.guildId}: ${cleanupError.message}`, "error");
          }
        }
      }
    }
  },
};
