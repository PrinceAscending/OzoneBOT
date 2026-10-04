const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const VoiceRole = require("../../schema/voicerole");
const { successPayload, warnPayload, infoPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

module.exports = {
  name: "voicerole",
  aliases: ["vcrole"],
  category: "Config",
  description: "Set a temporary role assigned to users while they are in a voice channel.",
  usage: "set <@role> | remove | show",
  cooldown: 5,
  userPerms: ["ManageRoles"],
  botPerms: ["ManageRoles"],
  slashOptions: [
    {
      name: "set",
      description: "Set the voice role",
      type: 1,
      options: [
        {
          name: "role",
          description: "Role to assign while user is in VC",
          type: 8,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remove the configured voice role",
      type: 1,
    },
    {
      name: "show",
      description: "Show the current voice role",
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

    if (action === "set") {
      const rawRole = args[1];
      const roleId = rawRole?.replace(/[<@&>]/g, "");
      const role = roleId && message.guild.roles.cache.get(roleId);

      if (!role) {
        return message.reply(warnPayload("Please specify a valid role to set as the voice role."));
      }

      const me = message.guild.members.me;
      if (role.comparePositionTo(me.roles.highest) >= 0) {
        return message.reply(warnPayload("That role is higher than or equal to my highest role; I won't be able to assign it."));
      }

      await VoiceRole.findOneAndUpdate(
        { guildId: message.guild.id },
        { guildId: message.guild.id, roleId: role.id },
        { upsert: true, new: true }
      );

      return message.reply(successPayload(`Voice role set to ${role}. Users will receive this role when entering any voice channel.`));
    }

    if (action === "remove" || action === "off" || action === "disable") {
      const res = await VoiceRole.deleteOne({ guildId: message.guild.id });
      if (!res.deletedCount) {
        return message.reply(infoPayload("No voice role is currently configured for this server."));
      }
      return message.reply(successPayload("Voice role has been disabled and removed."));
    }

    if (action === "show" || action === "status") {
      const doc = await VoiceRole.findOne({ guildId: message.guild.id });
      if (!doc?.roleId) {
        return message.reply(infoPayload("No voice role is currently set for this server."));
      }

      const role = message.guild.roles.cache.get(doc.roleId);
      const card = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${client.emoji?.config || ""} Current Voice Role: ${role ? `<@&${role.id}>` : `<@&${doc.roleId}>`}\n` +
            `-# This role is automatically assigned when members join voice and removed when they leave.`
          )
        );

      return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
    }

    return message.reply(formatCommandHelp(this, message.author, prefix));
  },
};
