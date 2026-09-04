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

  const header = `### ${client.emoji.home || "🏠"} ${guild.name}\n` +
    `-# ID: \`${guild.id}\` • Created on ${formatTimestamp(guild.createdTimestamp)}`;

  const details =
    `**👑 Owner:** ${owner ? `${owner.user.tag} (<@${owner.id}>)` : "Unknown"}\n` +
    `**👥 Members:** \`${guild.memberCount.toLocaleString()}\` total\n` +
    `**💬 Channels:** \`${textChannels}\` text • \`${voiceChannels}\` voice (${guild.channels.cache.size} total)\n` +
    `**🛡️ Roles:** \`${rolesCount}\` roles • **😀 Emojis:** \`${emojisCount}\` emojis\n` +
    `**🚀 Boost Status:** Level \`${boostTier}\` (\`${boostCount}\` boosts)\n` +
    `**🔒 Verification Level:** \`${guild.verificationLevel}\``;

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
    .setAccentColor(0x5865F2)
    .addSectionComponents(section);

  return container;
}
