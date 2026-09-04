const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");
const emoji = require("../../emojis");

module.exports = {
  name: "node",
  category: "Owner",
  description: "Shows Node information.",
  botPerms: ["EmbedLinks"],
  args: false,
  usage: "",
  userPerms: [],
  owner: true,
  cooldown: 3,

  slashOptions: [],
  async slashExecute(interaction, client) {
    if (!client.owners.includes(interaction.user.id)) {
      const denyDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You do not have permission to use this command.**`);

      const denyContainer = new ContainerBuilder()
        .addTextDisplayComponents(denyDisplay);

      return interaction.reply({
        components: [denyContainer],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    const nodes = [...client.manager.shoukaku.nodes.values()];

    if (nodes.length === 0 || !nodes[0].stats) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Node: Disconnected**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const node = nodes[0];
    const status = node.stats ? "Connected" : "Disconnected";
    const formatNodeUptime = (ms) => {
      if (!Number.isFinite(ms) || ms <= 0) return "N/A";
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
    };
    const uptime = node.stats ? formatNodeUptime(Number(node.stats.uptime) || 0) : "N/A";

    const headerDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.check} Lavalink Node**`);

    const separator1 = new SeparatorBuilder();

    const connectionDisplay = new TextDisplayBuilder()
      .setContent(
        `**${client.user.username} is ${status}**\n` +
        `Player \`:\` \`${node.stats.players}\`\n` +
        `Playing Players \`:\` \`${node.stats.playingPlayers}\`\n` +
        `Uptime \`:\` \`${uptime}\``
      );

    const separator2 = new SeparatorBuilder();

    const memoryDisplay = new TextDisplayBuilder()
      .setContent(
        `**Memory**\n` +
        `Reservable Memory \`:\` \`${Math.round(node.stats.memory.reservable / 1024 / 1024)} MB\`\n` +
        `Used Memory \`:\` \`${Math.round(node.stats.memory.used / 1024 / 1024)} MB\`\n` +
        `Free Memory \`:\` \`${Math.round(node.stats.memory.free / 1024 / 1024)} MB\`\n` +
        `Allocated Memory \`:\` \`${Math.round(node.stats.memory.allocated / 1024 / 1024)} MB\``
      );

    const separator3 = new SeparatorBuilder();

    const cpuDisplay = new TextDisplayBuilder()
      .setContent(
        `**CPU**\n` +
        `Cores \`:\` \`${node.stats.cpu.cores}\`\n` +
        `System Load \`:\` \`${(Math.round(node.stats.cpu.systemLoad * 100) / 100).toFixed(2)}%\`\n` +
        `Lavalink Load \`:\` \`${(Math.round(node.stats.cpu.lavalinkLoad * 100) / 100).toFixed(2)}%\``
      );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(headerDisplay)
      .addSeparatorComponents(separator1)
      .addTextDisplayComponents(connectionDisplay)
      .addSeparatorComponents(separator2)
      .addTextDisplayComponents(memoryDisplay)
      .addSeparatorComponents(separator3)
      .addTextDisplayComponents(cpuDisplay);

    interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },
  async execute(message, args, client, prefix) {
    const nodes = [...client.manager.shoukaku.nodes.values()];

    if (nodes.length === 0 || !nodes[0].stats) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Node: Disconnected**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const node = nodes[0];
    const status = node.stats ? "Connected" : "Disconnected";
    const formatNodeUptime = (ms) => {
      if (!Number.isFinite(ms) || ms <= 0) return "N/A";
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
    };
    const uptime = node.stats ? formatNodeUptime(Number(node.stats.uptime) || 0) : "N/A";

    const headerDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.check} Lavalink Node**`);

    const separator1 = new SeparatorBuilder();

    const connectionDisplay = new TextDisplayBuilder()
      .setContent(
        `**${client.user.username} is ${status}**\n` +
        `Player \`:\` \`${node.stats.players}\`\n` +
        `Playing Players \`:\` \`${node.stats.playingPlayers}\`\n` +
        `Uptime \`:\` \`${uptime}\``
      );

    const separator2 = new SeparatorBuilder();

    const memoryDisplay = new TextDisplayBuilder()
      .setContent(
        `**Memory**\n` +
        `Reservable Memory \`:\` \`${Math.round(node.stats.memory.reservable / 1024 / 1024)} MB\`\n` +
        `Used Memory \`:\` \`${Math.round(node.stats.memory.used / 1024 / 1024)} MB\`\n` +
        `Free Memory \`:\` \`${Math.round(node.stats.memory.free / 1024 / 1024)} MB\`\n` +
        `Allocated Memory \`:\` \`${Math.round(node.stats.memory.allocated / 1024 / 1024)} MB\``
      );

    const separator3 = new SeparatorBuilder();

    const cpuDisplay = new TextDisplayBuilder()
      .setContent(
        `**CPU**\n` +
        `Cores \`:\` \`${node.stats.cpu.cores}\`\n` +
        `System Load \`:\` \`${(Math.round(node.stats.cpu.systemLoad * 100) / 100).toFixed(2)}%\`\n` +
        `Lavalink Load \`:\` \`${(Math.round(node.stats.cpu.lavalinkLoad * 100) / 100).toFixed(2)}%\``
      );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(headerDisplay)
      .addSeparatorComponents(separator1)
      .addTextDisplayComponents(connectionDisplay)
      .addSeparatorComponents(separator2)
      .addTextDisplayComponents(memoryDisplay)
      .addSeparatorComponents(separator3)
      .addTextDisplayComponents(cpuDisplay);

    message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },
};
