const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require("discord.js");
const { get, MAX_AGE_MS } = require("../../utils/snipeStore");

module.exports = {
  name: "editsnipe",
  aliases: ["es"],
  category: "Utility",
  cooldown: 3,
  description: "Snipe the last edited message in this channel (shows the original).",
  args: false,
  usage: "",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    const reply = await buildEditSnipe(client, interaction.channel);
    return interaction.reply({ ...reply, flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  },

  async execute(message, args, client) {
    const reply = await buildEditSnipe(client, message.channel);
    return message.reply({ ...reply, flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  },
};

async function buildEditSnipe(client, channel) {
  const snipe = get(client, "editSnipes", channel.id);
  if (!snipe) {
    return {
      components: [new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.info} No edited messages to snipe here.**\n-# Edits are remembered for ${Math.round(MAX_AGE_MS / 60000)} minutes.`,
        ),
      )],
    };
  }

  const secondsAgo = Math.floor(snipe.at / 1000);
  const oldContent = snipe.oldContent?.trim();
  const newContent = snipe.newContent?.trim();

  const lines = [
    `### ${client.emoji.warn} Edited message`,
    `**${client.emoji.dot} Author** <@${snipe.author?.id || "unknown"}>`,
    `**${client.emoji.dot} Edited** <t:${secondsAgo}:R>`,
    `**${client.emoji.dot} Before**\n>>> ${(oldContent || "(empty)").slice(0, 1200)}`,
  ];
  if (newContent) lines.push(`**${client.emoji.dot} After**\n>>> ${newContent.slice(0, 1200)}`);

  const card = new ContainerBuilder()
    .setAccentColor(0xF0B232)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
    .addSeparatorComponents(new SeparatorBuilder());

  return { components: [card] };
}
