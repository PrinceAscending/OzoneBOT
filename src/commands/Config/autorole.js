const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const AutoRole = require("../../schema/autorole");
const { successPayload, warnPayload, infoPayload } = require("../../utils/responses");

module.exports = {
  name: "autorole",
  aliases: ["joinrole"],
  category: "Config",
  description: "Configure roles automatically given to new members upon joining.",
  cooldown: 5,
  userPerms: ["ManageRoles"],
  botPerms: ["ManageRoles"],
  slashOptions: [
    {
      name: "add",
      description: "Add an autorole for new members",
      type: 1,
      options: [
        {
          name: "role",
          description: "Role to assign on join",
          type: 8,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remove an autorole",
      type: 1,
      options: [
        {
          name: "role",
          description: "Role to remove from autorole list",
          type: 8,
          required: true,
        },
      ],
    },
    {
      name: "show",
      description: "Show current autoroles",
      type: 1,
    },
    {
      name: "clear",
      description: "Clear all autoroles for this server",
      type: 1,
    },
  ],

  async slashExecute(interaction, client) {
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
        if (interaction.deferred) return await interaction.editReply(options);
        if (interaction.replied) return await interaction.followUp(options);
        return await interaction.reply(options);
      },
    };

    const args = [subcommand];
    if (role) args.push(role.id);
    return this.execute(interactionWrapper, args, client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const action = args[0]?.toLowerCase();

    if (action === "add" || action === "set") {
      const rawRole = args[1];
      const roleId = rawRole?.replace(/[<@&>]/g, "");
      const role = roleId && message.guild.roles.cache.get(roleId);

      if (!role) {
        return message.reply(warnPayload("Please provide a valid role to add to autoroles."));
      }

      const me = message.guild.members.me;
      if (role.comparePositionTo(me.roles.highest) >= 0) {
        return message.reply(warnPayload("That role is higher than or equal to my highest role; I won't be able to assign it."));
      }

      let data = await AutoRole.findOne({ guildId: message.guild.id });
      if (!data) {
        data = new AutoRole({ guildId: message.guild.id, roles: [] });
      }

      if (data.roles.includes(role.id)) {
        return message.reply(infoPayload(`${role} is already in the autorole list.`));
      }

      data.roles.push(role.id);
      await data.save();

      return message.reply(successPayload(`Added ${role} to autoroles. New members will receive this role.`));
    }

    if (action === "remove" || action === "del") {
      const rawRole = args[1];
      const roleId = rawRole?.replace(/[<@&>]/g, "");
      const data = await AutoRole.findOne({ guildId: message.guild.id });

      if (!data || !data.roles.length) {
        return message.reply(infoPayload("There are no autoroles configured for this server."));
      }

      if (!roleId || !data.roles.includes(roleId)) {
        return message.reply(warnPayload("That role is not in the autoroles list."));
      }

      data.roles = data.roles.filter((r) => r !== roleId);
      await data.save();

      return message.reply(successPayload(`Removed <@&${roleId}> from autoroles.`));
    }

    if (action === "clear") {
      await AutoRole.deleteOne({ guildId: message.guild.id });
      return message.reply(successPayload("Cleared all autoroles for this server."));
    }

    if (action === "show" || action === "list") {
      const data = await AutoRole.findOne({ guildId: message.guild.id });
      if (!data || !data.roles.length) {
        return message.reply(infoPayload("No autoroles are currently configured for this server."));
      }

      const rolesList = data.roles.map((id, i) => `\`${i + 1}.\` <@&${id}>`).join("\n");
      const card = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### 🛡️ Configured Autoroles (${data.roles.length})\n${rolesList}\n\n` +
            `-# New members joining the server will automatically receive these roles.`
          )
        );

      return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
    }

    const usage = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 🛡️ Autorole Management\n` +
        `\`${prefix || client.prefix}autorole add <@role>\` — Add an autorole\n` +
        `\`${prefix || client.prefix}autorole remove <@role>\` — Remove an autorole\n` +
        `\`${prefix || client.prefix}autorole show\` — List active autoroles\n` +
        `\`${prefix || client.prefix}autorole clear\` — Clear all autoroles`
      )
    );

    return message.reply({ components: [usage], flags: MessageFlags.IsComponentsV2 });
  },
};
