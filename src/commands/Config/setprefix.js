const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");
const db = require("../../schema/prefix.js");
const emoji = require("../../emojis");

module.exports = {
  name: "setprefix",
  category: "Config",
  description: "Sets a custom prefix for this server.",
  args: true,
  usage: "<new-prefix>",
  aliases: ["prefix"],
  botPerms: ["EmbedLinks"],
  userPerms: ["ManageGuild"],
  owner: false,
  cooldown: 3,
  slashOptions: [
    {
      name: "setprefix",
      description: "Set new prefix [max 3 characters]",
      type: 3,
      required: true
    }
  ],
  async slashExecute(interaction, client) {
    // Defer immediately: the legacy execute() below awaits a DB read (prefix
    // lookup) before its first reply, which could blow the 3s ack window.
    await interaction.deferReply();

    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) {
          return await interaction.editReply(options);
        } else if (interaction.replied) {
          return await interaction.followUp(options);
        } else {
          return await interaction.reply(options);
        }
      },
    };

    const args = [];
    if (interaction.options) {
      const options = interaction.options.data;
      for (const option of options) {
        if (option.value !== undefined) {
          args.push(option.value.toString());
        }
      }
    }

    // Resolve the guild's CURRENT prefix from the DB (not the global default)
    // so `oldPrefix` is recorded correctly for slash users.
    let prefix = client.prefix;
    try {
      const current = await db.findOne({ Guild: interaction.guild.id });
      if (current?.Prefix) prefix = current.Prefix;
    } catch { /* fall back to the global default */ }
    return this.execute(interactionWrapper, args, client, prefix);
  },

  async execute(message, args, client, prefix) {
    const data = await db.findOne({ Guild: message.guild.id });
    const newPrefix = args.join(" ");

    if (!newPrefix) {
      const { formatCommandHelp } = require("../../utils/commandHelp");
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    if (newPrefix.length > 3) {
      const warnDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Prefix can't exceed 3 characters.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(warnDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (!data) {
      const newData = new db({
        Guild: message.guild.id,
        Prefix: newPrefix,
        oldPrefix: prefix,
      });
      try {
        await newData.save();
      } catch (err) {
        console.error(err);

        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} An error occurred while saving the prefix:**\n\`\`\`\n${err.message}\`\`\`\n\n**Note:** If you see a duplicate key error, please contact the bot administrator to clean the database.`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }
    } else {
      data.oldPrefix = prefix;
      data.Prefix = newPrefix;
      try {
        await data.save();
      } catch (err) {
        console.error(err);

        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} An error occurred while updating the prefix:**\n\`\`\`\n${err.message}\`\`\``);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }

    const successDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.check} Prefix updated to \`${newPrefix}\`**`);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(successDisplay);

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },
};
