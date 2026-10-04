const { ActivityType, REST, Routes } = require("discord.js");
const { syncApplicationEmojis } = require("../../utils/applicationEmojis");

module.exports = {
  name: "clientReady",
  run: async (client) => {
    client.emojiReady = syncApplicationEmojis(client);
    try {
      await client.emojiReady;
    } catch (error) {
      client.logger.log(`[Emoji sync] ${error.message}`, "error");
    }

    client.logger.log(`${client.user.username} is now online.`, "ready");
    client.logger.log(
      `Ready on ${client.guilds.cache.size} servers, for a total of ${client.users.cache.size} users`,
      "ready",
    );

    if (client.slashCommands.size > 0) {
      const rest = new REST({ version: "10" }).setToken(client.token);
      try {
        const commands = Array.from(client.slashCommands.values()).map((cmd) => {
          const commandData = {
            name: cmd.name,
            description: cmd.description,
            options: cmd.options || [],
          };

          if (cmd.owner) {
            commandData.default_member_permissions = "8";
            commandData.dm_permission = false;
          }

          return commandData;
        });

        client.logger.log(`Deploying ${commands.length} slash commands...`, "cmd");

        await rest.put(Routes.applicationCommands(client.user.id), {
          body: commands,
        });

        client.logger.log(`Successfully deployed ${commands.length} slash commands.`, "cmd");
      } catch (error) {
        console.error("Error deploying slash commands:", error);
      }
    } else {
      console.log("\nWARNING: No slash commands to deploy! client.slashCommands.size = 0\n");
    }

    // Status rotation. Store the handle and unref it so it doesn't keep
    // the process alive on shutdown, and so it can be cleared on restart.
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      const guildCount = client.guilds.cache.size;
      const activeTrack = [...(client.manager?.players?.values() || [])].find((p) => p.queue?.current)?.queue?.current;

      const statuses = [
        `O-ZONE RADIO · ON AIR`,
        `${guildCount} servers · ${totalMembers} listeners`,
        `${client.commands?.size || 59} commands · made by prince`,
        `24/7 music · AI · server tools`,
        `OZONE — the only station you need`,
      ];

      if (activeTrack) {
        const title = activeTrack.title.length > 40 ? `${activeTrack.title.substring(0, 40)}…` : activeTrack.title;
        statuses.splice(1, 0, `${title} — ${activeTrack.author}`);
      }

      // Rotate sequentially — random picks kept repeating the same status.
      statusIndex = (statusIndex + 1) % statuses.length;
      const status = statuses[statusIndex];

      try {
        client.user.setPresence({
          activities: [
            {
              name: "OZONE Radio",
              // For ActivityType.Custom, Discord renders `state` — putting the
              // text in `name` (the old behaviour) displayed an empty status.
              state: status,
              type: ActivityType.Custom,
            },
          ],
          status: "online",
        });
      } catch (err) {
        client.logger.log(`[Presence] Failed to set: ${err.message}`, "warn");
      }
    }, 10000);
    statusInterval.unref?.();
    client._statusInterval = statusInterval;

    setTimeout(async () => {
      const TwoFourSeven = require("../../schema/247");
      let entries;
      try {
        entries = await TwoFourSeven.find();
      } catch (e) {
        client.logger.log(`[247 Reconnect] DB read failed: ${e.message}`, "error");
        return;
      }
      if (!entries || entries.length === 0) return;

      // Process in small concurrent batches — the old per-guild sleep made
      // recovery take N seconds; this gets a 200-guild bot back online in ~5s.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const BATCH = 5;

      for (let i = 0; i < entries.length; i += BATCH) {
        const slice = entries.slice(i, i + BATCH);
        await Promise.allSettled(slice.map(async (data) => {
          try {
            const p = client.manager?.players?.get(data.Guild);
            const guild = client.guilds.cache.get(data.Guild);
            const botMember = guild?.members?.me || guild?.members?.cache?.get(client.user?.id);
            if (p && p.state !== 4 && p.state !== 5 && botMember?.voice?.channelId === data.VoiceId) return;

            await client.reconnect247Guild(data.Guild);
          } catch (e) {
            client.logger.log(
              `[247 Reconnect] failed for guild ${data.Guild}: ${e?.message || e}`,
              "warn"
            );
          }
        }));
        await sleep(300);
      }

      // Reschedule pending music alarms
      try {
        const Alarm = require("../../schema/alarm");
        const { scheduleAlarmExecution } = require("../../commands/Music/alarm");
        const pendingAlarms = await Alarm.find({ triggered: false, triggerAt: { $gt: new Date() } });
        for (const alarm of pendingAlarms) {
          scheduleAlarmExecution(client, alarm);
        }
        if (pendingAlarms.length > 0) {
          client.logger.log(`[Alarms] Restored and scheduled ${pendingAlarms.length} pending alarm(s)`, "ready");
        }
      } catch (err) {
        client.logger.log(`[Alarms] Error restoring alarms: ${err.message}`, "warn");
      }
    }, 5000);
  },
};

