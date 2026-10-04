const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags,
  ChannelType,
} = require("discord.js");

function formatTimestamp(timestamp) {
  return `<t:${Math.floor(timestamp / 1000)}:D> (<t:${Math.floor(timestamp / 1000)}:R>)`;
}

module.exports = {
  name: "serverinfo",
  aliases: ["si", "server", "guildinfo"],
  category: "Information",
  description: "View detailed statistics and information about this Discord server.",
  cooldown: 5,
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    const card = await buildServerInfoCard(interaction.guild, client);
    return interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, _args, client) {
    const card = await buildServerInfoCard(message.guild, client);
    return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },
};

async function buildServerInfoCard(guild, client) {
  const owner = await guild.fetchOwner().catch(() => null);
  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;
  const rolesCount = guild.roles.cache.size;
  const emojisCount = guild.emojis.cache.size;
  const boostCount = guild.premiumSubscriptionCount || 0;
  const boostTier = guild.premiumTier || 0;

  const dot = client.emoji?.dot ? `${client.emoji.dot} ` : "";
  const header = `### ${client.emoji.home || ""} ${guild.name}\n` +
    `-# ID: \`${guild.id}\` • Created on ${formatTimestamp(guild.createdTimestamp)}`;

  const details =
    `${dot}**Owner:** ${owner ? `${owner.user.tag} (<@${owner.id}>)` : "Unknown"}\n` +
    `${dot}**Members:** \`${guild.memberCount.toLocaleString()}\` total\n` +
    `${dot}**Channels:** \`${textChannels}\` text • \`${voiceChannels}\` voice (${guild.channels.cache.size} total)\n` +
    `${dot}**Roles:** \`${rolesCount}\` roles • **Emojis:** \`${emojisCount}\` emojis\n` +
    `${dot}**Boost Status:** Level \`${boostTier}\` (\`${boostCount}\` boosts)\n` +
    `${dot}**Verification Level:** \`${guild.verificationLevel}\``;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(header),
      new TextDisplayBuilder().setContent(details)
    );

  const iconUrl = guild.iconURL({ dynamic: true, size: 256 });
  if (iconUrl) {
    section.setThumbnailAccessory((thumb) => thumb.setURL(iconUrl));
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x0A0B0E)
    .addSectionComponents(section);

  return container;
}
