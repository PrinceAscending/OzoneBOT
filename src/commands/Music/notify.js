const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const SongAlert = require("../../schema/songalert");
const { successPayload, warnPayload, infoPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

module.exports = {
  name: "notify",
  aliases: ["alert", "songalert", "tracknotify"],
  category: "Music",
  description: "Get notified whenever your favorite song or artist starts playing in this server.",
  usage: "add <keyword> | remove <keyword> | list | clear",
  cooldown: 5,
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "add",
      description: "Subscribe to alerts for an artist or song name",
      type: 1,
      options: [
        {
          name: "keyword",
          description: "Artist or song name to watch for",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remove an active song or artist alert",
      type: 1,
      options: [
        {
          name: "keyword",
          description: "Keyword to remove",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "list",
      description: "View your active song alerts in this server",
      type: 1,
    },
    {
      name: "clear",
      description: "Clear all your active song alerts in this server",
      type: 1,
    },
  ],

  async slashExecute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const keyword = interaction.options.getString("keyword")?.toLowerCase().trim();

    return handleNotify({
      client,
      guild: interaction.guild,
      user: interaction.user,
      action: subcommand,
      keyword,
      reply: (o) => interaction.reply(o),
    });
  },

  async execute(message, args, client, prefix) {
    const action = args[0]?.toLowerCase();
    const keyword = args.slice(1).join(" ").toLowerCase().trim();

    if (!action || !["add", "set", "remove", "delete", "del", "list", "show", "clear"].includes(action)) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    return handleNotify({
      client,
      guild: message.guild,
      user: message.author,
      action,
      keyword,
      prefix,
      reply: (o) => message.reply(o),
    });
  },
};

async function handleNotify({ client, guild, user, action, keyword, prefix = "^", reply }) {
  if (action === "add" || action === "set") {
    if (!keyword || keyword.length < 2) {
      return reply(warnPayload("Please specify an artist or track name (minimum 2 letters)."));
    }

    const count = await SongAlert.countDocuments({ guildId: guild.id, userId: user.id });
    if (count >= 15) {
      return reply(warnPayload("You have reached the maximum limit of 15 alerts per server."));
    }

    try {
      await SongAlert.create({
        guildId: guild.id,
        userId: user.id,
        keyword,
      });

      return reply(successPayload(`Alert created for **"${keyword}"**! OZONE will notify you when it plays in this server.`));
    } catch {
      return reply(infoPayload(`You already have an active alert for **"${keyword}"**.`));
    }
  }

  if (action === "remove" || action === "delete" || action === "del") {
    if (!keyword) {
      return reply(warnPayload("Please specify the alert keyword you want to remove."));
    }

    const res = await SongAlert.deleteOne({ guildId: guild.id, userId: user.id, keyword });
    if (!res.deletedCount) {
      return reply(warnPayload(`No active alert matching **"${keyword}"** found.`));
    }

    return reply(successPayload(`Removed alert for **"${keyword}"**.`));
  }

  if (action === "list" || action === "show") {
    const alerts = await SongAlert.find({ guildId: guild.id, userId: user.id }).lean();
    if (!alerts.length) {
      return reply(infoPayload("You don't have any active song alerts in this server. Add one with `/notify add <keyword>`."));
    }

    const list = alerts.map((a, i) => `\`${i + 1}.\` **${a.keyword}**`).join("\n");
    const card = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${client.emoji?.info || ""} Your Active Alerts (${alerts.length})\n${list}\n\n` +
          `-# You will receive a notification whenever any song matching these keywords starts playing.`
        )
      );

    return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  }

  if (action === "clear") {
    const res = await SongAlert.deleteMany({ guildId: guild.id, userId: user.id });
    return reply(successPayload(`Cleared all **${res.deletedCount}** alerts for this server.`));
  }

  return reply(warnPayload(`Unknown action. Use \`/notify add\`, \`/notify remove\`, or \`/notify list\`.`));
}
