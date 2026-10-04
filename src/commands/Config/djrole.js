const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");
const DJRoleSchema = require("../../schema/djrole");
const { formatCommandHelp } = require("../../utils/commandHelp");

module.exports = {
  name: "djrole",
  aliases: ["dj"],
  category: "Config",
  description: "Set, remove or show the DJ role for this server",
  cooldown: 5,
  args: false,
  usage: "set <role> | remove | show",
  userPerms: ["ManageRoles"],
  owner: false,
  dj: false,
  slashOptions: [
    {
      name: "set",
      description: "Set the DJ role",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role to use as the DJ role",
          type: 8,
          required: true
        }
      ]
    },
    {
      name: "remove",
      description: "Remove the DJ role",
      type: 1
    },
    {
      name: "show",
      description: "Show the current DJ role",
      type: 1
    }
  ],

  async slashExecute(interaction, client) {
    // Defer immediately: execute() does DB writes before its first reply and
    // a slow Mongo read could otherwise blow the 3s ack window.
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const role = interaction.options.getRole("role");

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

    const args = [subcommand];
    if (role) args.push(role.id);
    return this.execute(interactionWrapper, args, client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const action = args[0]?.toLowerCase();

    if (action === "set") {
      const rawRole = args[1];
      const roleId = rawRole?.replace(/[<@&>]/g, "");
      const role = roleId && message.guild.roles.cache.get(roleId);
      if (!role) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} Please provide a valid role.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      await DJRoleSchema.findOneAndUpdate(
        { guildId: message.guild.id },
        { guildId: message.guild.id, roleId: role.id },
        { upsert: true, new: true }
      );

      const successDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.check} DJ role set to ${role}.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(successDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (action === "remove") {
      const result = await DJRoleSchema.deleteOne({ guildId: message.guild.id });

      if (!result.deletedCount) {
        const infoDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.info} No DJ role is set for this server.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(infoDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const successDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.check} DJ role removed.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(successDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (action === "show") {
      const doc = await DJRoleSchema.findOne({ guildId: message.guild.id });

      const role = doc?.roleId && message.guild.roles.cache.get(doc.roleId);
      const showDisplay = new TextDisplayBuilder()
        .setContent(doc?.roleId
          ? `**${client.emoji.check} The DJ role is ${role ?? `<@&${doc.roleId}>`}.**`
          : `**${client.emoji.info} No DJ role is set for this server.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(showDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    return message.reply(formatCommandHelp(this, message.author, prefix));
  }
};
