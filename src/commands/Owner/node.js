const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");

function formatNodeUptime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "N/A";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
}

function checkOwner(client, userId) {
  const owners = client.owners || client.config?.ownerID || [];
  return owners.includes(userId);
}

function buildNodesContainer(client) {
  const nodes = client.manager?.shoukaku?.nodes ? [...client.manager.shoukaku.nodes.values()] : [];

  if (nodes.length === 0) {
    const errorDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji?.cross || "❌"} No Lavalink nodes configured.**`);
    return new ContainerBuilder().addTextDisplayComponents(errorDisplay);
  }

  const connectedCount = nodes.filter((n) => n.state === 1).length;
  const totalNodes = nodes.length;

  const headerDisplay = new TextDisplayBuilder()
    .setContent(`**${client.emoji?.info || "ℹ️"} Lavalink Nodes Status (${connectedCount}/${totalNodes} Connected)**`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(headerDisplay)
    .addSeparatorComponents(new SeparatorBuilder());

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isConnected = node.state === 1;
    const statusText = isConnected ? "Connected" : (node.state === 0 ? "Connecting" : "Disconnected");
    const statusEmoji = isConnected ? (client.emoji?.check || "🟢") : (client.emoji?.cross || "🔴");
    const uptime = isConnected && node.stats ? formatNodeUptime(Number(node.stats.uptime) || 0) : "N/A";
    const players = node.stats?.players ?? 0;
    const playingPlayers = node.stats?.playingPlayers ?? 0;

    let nodeContent = `### ${statusEmoji} ${node.name || `Node ${i + 1}`} \`[${statusText}]\`\n`;
    if (isConnected && node.stats) {
      const mem = node.stats.memory || {};
      const cpu = node.stats.cpu || {};
      const usedMb = Math.round((mem.used || 0) / 1024 / 1024);
      const freeMb = Math.round((mem.free || 0) / 1024 / 1024);
      const allocatedMb = Math.round((mem.allocated || 0) / 1024 / 1024);
      const reservableMb = Math.round((mem.reservable || 0) / 1024 / 1024);

      const sysCpu = ((cpu.systemLoad || 0) * 100).toFixed(2);
      const lavaCpu = ((cpu.lavalinkLoad || 0) * 100).toFixed(2);

      nodeContent +=
        `> **Players:** \`${players}\` (\`${playingPlayers}\` playing) • **Uptime:** \`${uptime}\`\n` +
        `> **Memory:** Used \`${usedMb} MB\` / Free \`${freeMb} MB\` (Alloc: \`${allocatedMb} MB\`, Res: \`${reservableMb} MB\`)\n` +
        `> **CPU:** \`${cpu.cores || 0} Cores\` • System: \`${sysCpu}%\` • Lavalink: \`${lavaCpu}%\``;
    } else {
      nodeContent += `> **Status:** \`${statusText}\` • Awaiting handshake or offline`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(nodeContent));
    if (i < nodes.length - 1) {
      container.addSeparatorComponents(new SeparatorBuilder());
    }
  }

  return container;
}

module.exports = {
  name: "node",
  category: "Owner",
  description: "Displays real-time status and metrics for all Lavalink nodes.",
  botPerms: ["EmbedLinks"],
  args: false,
  usage: "",
  userPerms: [],
  owner: true,
  cooldown: 3,

  slashOptions: [],

  async slashExecute(interaction, client) {
    if (!checkOwner(client, interaction.user.id)) {
      const denyDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji?.warn || "⚠️"} You do not have permission to use this command.**`);

      const denyContainer = new ContainerBuilder()
        .addTextDisplayComponents(denyDisplay);

      return interaction.reply({
        components: [denyContainer],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    const container = buildNodesContainer(client);

    return interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => { });
  },

  async execute(message, args, client) {
    if (!checkOwner(client, message.author.id)) {
      const denyDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji?.warn || "⚠️"} You do not have permission to use this command.**`);

      const denyContainer = new ContainerBuilder()
        .addTextDisplayComponents(denyDisplay);

      return message.reply({
        components: [denyContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    const container = buildNodesContainer(client);

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => { });
  },
};
