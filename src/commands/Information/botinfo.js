const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags,
  version: djsVersion,
} = require("discord.js");
const os = require("os");

function formatUptime(uptimeSeconds) {
  const d = Math.floor(uptimeSeconds / (3600 * 24));
  const h = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  const s = Math.floor(uptimeSeconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

module.exports = {
  name: "botinfo",
  aliases: ["bi", "about", "info"],
  category: "Information",
  description: "View technical details, system uptime, and specifications of OZONE.",
  cooldown: 5,
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    const card = buildBotInfoCard(client);
    return interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, _args, client) {
    const card = buildBotInfoCard(client);
    return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },
};

function buildBotInfoCard(client) {
  const uptime = formatUptime(process.uptime());
  const totalGuilds = client.guilds.cache.size;
  const totalUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
  const totalPlayers = client.manager?.players?.size || 0;
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const ping = Math.round(client.ws.ping);

  const header = `### ⚡ OZONE v1.0.0 — System Specifications\n` +
    `-# High Performance Discord Music & AI Bot powered by Lavalink`;

  const stats =
    `**🌐 Servers:** \`${totalGuilds.toLocaleString()}\` servers\n` +
    `**👥 Listeners:** \`${totalUsers.toLocaleString()}\` users\n` +
    `**🎵 Active Players:** \`${totalPlayers}\` streams\n` +
    `**⏱️ Uptime:** \`${uptime}\`\n` +
    `**📶 Latency:** \`${ping}ms\`\n` +
    `**💾 RAM Usage:** \`${memory} MB\`\n` +
    `**⚙️ Platform:** \`Node.js ${process.version}\` • \`discord.js v${djsVersion}\`\n` +
    `**🖥️ Cluster:** \`#${client.clusterInfo?.CLUSTER ?? 0}\` / \`${client.clusterInfo?.CLUSTER_COUNT ?? 1}\``;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(header),
      new TextDisplayBuilder().setContent(stats)
    );

  const avatar = client.user.displayAvatarURL({ size: 256 });
  if (avatar) {
    section.setThumbnailAccessory((thumb) => thumb.setURL(avatar));
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x3F4652)
    .addSectionComponents(section);

  return container;
}
