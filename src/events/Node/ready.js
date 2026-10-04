const db = require("../../schema/247");

module.exports = {
  name: "ready",
  run: async (client, name) => {
    client.logger.log(`Lavalink "${name}" connected.`, "ready");

    // Guard against multiple nodes running concurrent scans
    if (client._isNodeReconnectScanning) {
      return;
    }
    client._isNodeReconnectScanning = true;

    try {
      const maindata = await db.find();
      if (!maindata || maindata.length === 0) return;

      client.logger.log(
        `[NodeReady:${name}] Checking ${maindata.length} 24/7 guild(s)...`,
        "ready"
      );

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      for (const data of maindata) {
        try {
          // If a healthy player already exists and is connected, skip
          const p = client.manager?.players?.get(data.Guild);
          const guild = client.guilds.cache.get(data.Guild);
          const botMember = guild?.members?.me || guild?.members?.cache?.get(client.user?.id);
          if (p && p.state !== 4 && p.state !== 5 && botMember?.voice?.channelId === data.VoiceId) continue;

          await client.reconnect247Guild(data.Guild);
          await sleep(400);
        } catch (e) {
          client.logger.log(`[NodeReady] Error checking guild ${data.Guild}: ${e.message}`, "warn");
        }
      }
    } catch (err) {
      client.logger.log(`[NodeReady] Error during 24/7 check: ${err.message}`, "error");
    } finally {
      client._isNodeReconnectScanning = false;
    }
  },
};
