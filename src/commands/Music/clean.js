const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const { pruneChannel, scheduleDelete } = require("../../utils/autoClean");
const { errorPayload, warnPayload } = require("../../utils/responses");

module.exports = {
  name: "clean",
  aliases: ["purgebot", "cleanbot", "prunebot", "wipebot", "clearbot"],
  category: "Music",
  description: "Immediately sweeps recent bot spam and command messages from the channel.",
  usage: "[amount (1-100)]",
  cooldown: 5,
  userPerms: ["ManageMessages"],
  botPerms: ["ManageMessages", "ReadMessageHistory"],
  slashOptions: [
    {
      name: "amount",
      description: "Number of recent messages to scan and clean (default: 50, max: 100)",
      type: 4,
      required: false,
      min_value: 1,
      max_value: 100,
    },
  ],

  async slashExecute(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply(warnPayload("You need the `Manage Messages` permission to use this command.", { ephemeral: true }));
    }

    const amount = interaction.options.getInteger("amount") || 50;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
      const result = await pruneChannel(interaction.channel, amount, client);
      return interaction.editReply({
        content: `**${client.emoji?.check || ""} Swept \`${result.count}\` bot & command messages from <#${interaction.channelId}>.**`,
      });
    } catch (err) {
      return interaction.editReply(errorPayload(err.message || "Failed to prune messages."));
    }
  },

  async execute(message, args, client, prefix) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply(warnPayload("You need the `Manage Messages` permission to clean messages."));
    }

    const amount = parseInt(args[0], 10) || 50;
    const clampedAmount = Math.min(100, Math.max(1, amount));

    try {
      // Also delete the command message itself
      if (message.deletable) await message.delete().catch(() => {});

      const result = await pruneChannel(message.channel, clampedAmount, client);

      const card = new ContainerBuilder()
        .setAccentColor(0x00FF66)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${client.emoji?.check || ""} Chat Cleaned!\n` +
            `Swept **${result.count}** inactive bot & command messages from <#${message.channel.id}>.\n` +
            `-# This notice will auto-destruct in 5 seconds.`
          )
        );

      const noticeMsg = await message.channel.send({
        components: [card],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => null);

      if (noticeMsg) {
        scheduleDelete(noticeMsg, 5);
      }
    } catch (err) {
      return message.channel.send(errorPayload(err.message || "Failed to clean channel messages."));
    }
  },
};
