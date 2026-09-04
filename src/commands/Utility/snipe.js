const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require("discord.js");
const { get, MAX_AGE_MS } = require("../../utils/snipeStore");

module.exports = {
  name: "snipe",
  aliases: ["s"],
  category: "Utility",
  cooldown: 3,
  description: "Snipe the last deleted message in this channel.",
  args: false,
  usage: "",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    const reply = await buildSnipe(client, interaction.channel);
    return interaction.reply({ ...reply, flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  },

  async execute(message, args, client) {
    const reply = await buildSnipe(client, message.channel);
    return message.reply({ ...reply, flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  },
};

async function buildSnipe(client, channel) {
  const snipe = get(client, "snipes", channel.id);
  if (!snipe) {
    return {
      components: [new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.info} Nothing to snipe here.**\n-# Deleted messages are remembered for ${Math.round(MAX_AGE_MS / 60000)} minutes.`,
        ),
      )],
    };
  }

  const secondsAgo = Math.floor(snipe.at / 1000);
  const content = snipe.content?.trim();
  const lines = [
    `### ${client.emoji.cross} Sniped message`,
    `**${client.emoji.dot} Author** <@${snipe.author?.id || "unknown"}>`,
    `**${client.emoji.dot} Deleted** <t:${secondsAgo}:R>`,
  ];
  if (content) lines.push(`**${client.emoji.dot} Content**\n>>> ${content.slice(0, 1500)}`);
  if (snipe.image) lines.push(`**${client.emoji.dot} Attachment** ${snipe.image}`);
  if (!content && !snipe.image) lines.push(`**${client.emoji.dot} Content** — (empty message)`);

  const card = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
    .addSeparatorComponents(new SeparatorBuilder());

  return { components: [card] };
}
