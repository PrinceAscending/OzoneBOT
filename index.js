// Early Warning Suppression
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('The ready event has been renamed to clientReady')) {
    return;
  }
});

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({ connect: { timeout: 30_000 } }));

const MusicBot = require("./src/structures/MusicClient");
const Logger = require("./src/utils/logger");

const client = new MusicBot();
module.exports = client;

client.connect();

process.env.SHELL = process.platform === "win32" ? "powershell" : "bash";

// Improved Error Handling with Logger
process.on("unhandledRejection", (reason, p) => {
  // Filter known Lavalink/Undici timeouts and Kazagumo duplicate connect to avoid log spam
  if (reason && (reason.code === 'UND_ERR_CONNECT_TIMEOUT' || (reason.message && reason.message.includes('fetch failed')))) {
    Logger.log("[Lavalink Error] Connection timeout or fetch failed. Node might be down.", "warn");
    return;
  }
  if (reason && reason.message && reason.message.includes('Player is already connected')) {
    Logger.log("[Kazagumo] Player already connected, ignoring duplicate connect call.", "debug");
    return;
  }

  Logger.log(`[Unhandled Rejection] Reason: ${reason}`, "error");
  console.error(reason, p); // Keep console.error for stack trace details

  // Session Cleanup Logic
  if (reason && reason.message && reason.message.includes('Session not found')) {
    Logger.log("[Session Error] Lavalink session lost, attempting cleanup...", "warn");

    if (reason.path && typeof reason.path === 'string') {
      const guildIdMatch = reason.path.match(/\/players\/(\d+)/);
      if (guildIdMatch && guildIdMatch[1]) {
        const guildId = guildIdMatch[1];
        Logger.log(`[Session Error] Cleaning up player for guild ${guildId}`, "warn");

        try {
          if (client.manager && client.manager.players.has(guildId)) {
            const player = client.manager.players.get(guildId);
            if (player && typeof player.destroy === "function") {
              // destroy() tears the player down properly (leaves the voice
              // channel) instead of leaving a stale entry in the map.
              player.destroy().catch(() => {});
            } else {
              client.manager.players.delete(guildId);
            }
          }
          if (client.voiceHealthMonitor) {
            client.voiceHealthMonitor.stopMonitoring(guildId);
          }
        } catch (cleanupError) {
          Logger.log(`[Session Error] Cleanup failed: ${cleanupError}`, "error");
        }
      }
    }
  }
});

process.on("uncaughtException", (err, origin) => {
  Logger.log(`[Uncaught Exception] ${err}`, "error");
  console.error(origin, err);
});

process.on("uncaughtExceptionMonitor", (err, origin) => {
  Logger.log(`[Uncaught Exception Monitor] ${err}`, "error");
  console.error(origin, err);
});

// Graceful Shutdown
async function gracefulShutdown(signal) {
  Logger.log(`[System] Received ${signal}. Starting graceful shutdown...`, "warn");
  try {
    if (client.voiceHealthMonitor) {
      client.voiceHealthMonitor.stopAll();
    }
    if (client.manager?.players) {
      for (const [guildId, player] of client.manager.players) {
        try {
          await player.destroy();
        } catch {}
      }
    }
    const mongoose = require("mongoose");
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.close();
    }
    await client.destroy();
    Logger.log("[System] Graceful shutdown complete.", "ready");
    process.exit(0);
  } catch (err) {
    Logger.log(`[System] Error during shutdown: ${err.message}`, "error");
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
