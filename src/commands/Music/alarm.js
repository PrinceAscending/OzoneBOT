const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const Alarm = require("../../schema/alarm");
const { errorPayload, warnPayload, successPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

// In-memory timers map
const activeTimers = new Map();

function scheduleAlarmExecution(client, alarmDoc) {
  const delay = Math.max(0, new Date(alarmDoc.triggerAt).getTime() - Date.now());
  const timer = setTimeout(async () => {
    try {
      activeTimers.delete(alarmDoc._id.toString());
      const doc = await Alarm.findById(alarmDoc._id);
      if (!doc || doc.triggered) return;
      doc.triggered = true;
      await doc.save();

      const guild = client.guilds.cache.get(doc.guildId);
      if (!guild) return;

      const voiceChannel = guild.channels.cache.get(doc.voiceId);
      const textChannel = guild.channels.cache.get(doc.textId);

      if (voiceChannel && voiceChannel.isVoiceBased()) {
        let player = client.manager.players.get(doc.guildId);
        if (!player) {
          player = await client.manager.createPlayer({
            guildId: doc.guildId,
            voiceId: doc.voiceId,
            textId: doc.textId,
            volume: 80,
            deaf: true,
          });
          client.voiceHealthMonitor?.startMonitoring(player);
        }

        const res = await player.search(doc.song, { requester: client.user }).catch(() => null);
        if (res?.tracks?.length) {
          player.queue.add(res.tracks[0]);
          if (!player.playing && !player.paused) {
            await player.play().catch(() => {});
          }
        }
      }

      if (textChannel) {
        const ringCard = new ContainerBuilder()
          .setAccentColor(0xE67E22)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ⏰ ALARM RINGING — <@${doc.userId}>!\n` +
              `**Label:** ${doc.label}\n` +
              `**Now Playing:** *${doc.song}* in <#${doc.voiceId}>`
            )
          );

        textChannel.send({
          content: `<@${doc.userId}>`,
          components: [ringCard],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    } catch (err) {
      client.logger?.log(`[Alarm] Trigger failed: ${err.message}`, "error");
    }
  }, delay);

  timer.unref?.();
  activeTimers.set(alarmDoc._id.toString(), timer);
}

module.exports = {
  name: "alarm",
  aliases: ["musicalarm", "wake", "timer"],
  category: "Music",
  description: "Schedule a music alarm that joins VC and plays your chosen track after a delay.",
  cooldown: 5,
  usage: "<minutes> <song title> | list | cancel",
  inVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],
  slashOptions: [
    {
      name: "set",
      description: "Set a new music alarm",
      type: 1,
      options: [
        {
          name: "minutes",
          description: "Minutes from now until alarm rings",
          type: 4,
          required: true,
          min_value: 1,
          max_value: 1440,
        },
        {
          name: "song",
          description: "Song name or URL to play when alarm rings",
          type: 3,
          required: true,
        },
        {
          name: "label",
          description: "Optional reminder label (e.g. 'Study break over')",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: "list",
      description: "List your active alarms in this server",
      type: 1,
    },
    {
      name: "cancel",
      description: "Cancel all your pending alarms in this server",
      type: 1,
    },
  ],

  async slashExecute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (subcommand === "set") {
      const minutes = interaction.options.getInteger("minutes");
      const song = interaction.options.getString("song");
      const label = interaction.options.getString("label") || "Music Alarm";

      return createAlarm({
        client,
        guild: interaction.guild,
        channel: interaction.channel,
        member: interaction.member,
        minutes,
        song,
        label,
        reply: (opts) => interaction.editReply(opts),
      });
    }

    if (subcommand === "list") {
      return listAlarms({ guild: interaction.guild, user: interaction.user, reply: (opts) => interaction.editReply(opts) });
    }

    if (subcommand === "cancel") {
      return cancelAlarms({ guild: interaction.guild, user: interaction.user, reply: (opts) => interaction.editReply(opts) });
    }
  },

  async execute(message, args, client, prefix) {
    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      return listAlarms({ guild: message.guild, user: message.author, reply: (opts) => message.reply(opts) });
    }

    if (sub === "cancel" || sub === "clear") {
      return cancelAlarms({ guild: message.guild, user: message.author, reply: (opts) => message.reply(opts) });
    }

    const minutes = parseInt(args[0], 10);
    const song = args.slice(1).join(" ").trim();

    if (isNaN(minutes) || minutes < 1 || !song) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    return createAlarm({
      client,
      guild: message.guild,
      channel: message.channel,
      member: message.member,
      minutes,
      song,
      label: "Music Alarm",
      reply: (opts) => message.reply(opts),
    });
  },
  scheduleAlarmExecution,
};

async function createAlarm({ client, guild, channel, member, minutes, song, label, reply }) {
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    return reply(warnPayload("You must be in a voice channel so OZONE knows where to ring!"));
  }

  const triggerAt = new Date(Date.now() + minutes * 60 * 1000);
  const doc = await Alarm.create({
    guildId: guild.id,
    userId: member.id,
    voiceId: voiceChannel.id,
    textId: channel.id,
    song,
    triggerAt,
    label,
  });

  scheduleAlarmExecution(client, doc);

  const timestamp = Math.floor(triggerAt.getTime() / 1000);
  const card = new ContainerBuilder()
    .setAccentColor(0x2ECC71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${client.emoji?.check || ""} Alarm Scheduled!\n` +
        `**Rings In:** \`${minutes} minute${minutes === 1 ? "" : "s"}\` (<t:${timestamp}:R>)\n` +
        `**Song:** *${song}*\n` +
        `**Channel:** <#${voiceChannel.id}>\n` +
        `**Label:** *${label}*`
      )
    );

  return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
}

async function listAlarms({ guild, user, reply }) {
  const alarms = await Alarm.find({ guildId: guild.id, userId: user.id, triggered: false, triggerAt: { $gt: new Date() } }).lean();
  if (!alarms.length) {
    return reply(warnPayload("You have no pending alarms in this server."));
  }

  const list = alarms.map((a, i) => {
    const ts = Math.floor(new Date(a.triggerAt).getTime() / 1000);
    return `\`${i + 1}.\` **${a.song}** in <#${a.voiceId}> — rings <t:${ts}:R> (*${a.label}*)`;
  }).join("\n");

  const card = new ContainerBuilder()
    .setAccentColor(0x3498DB)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${client.emoji?.info || ""} Your Active Alarms (${alarms.length})\n${list}`
      )
    );

  return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
}

async function cancelAlarms({ guild, user, reply }) {
  const alarms = await Alarm.find({ guildId: guild.id, userId: user.id, triggered: false });
  for (const a of alarms) {
    const t = activeTimers.get(a._id.toString());
    if (t) clearTimeout(t);
    activeTimers.delete(a._id.toString());
  }
  const res = await Alarm.deleteMany({ guildId: guild.id, userId: user.id, triggered: false });
  return reply(successPayload(`Cancelled **${res.deletedCount}** pending alarm(s).`));
}
