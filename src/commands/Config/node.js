const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const { formatCommandHelp } = require("../../utils/commandHelp");

function formatNodeUptime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "N/A";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
}

function buildNodesStatusContainer(client, guildId) {
  const router = client.nodeRouter;
  const nodes = router ? router.getAllNodesStatus() : [];
  const activePlayer = client.manager?.players?.get(guildId);
  const activeNodeName = activePlayer?.node?.name || activePlayer?.shoukaku?.node?.name || null;

  if (nodes.length === 0) {
    const errorDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji?.cross || ""} No audio nodes are currently configured.**`.trim());
    return new ContainerBuilder().addTextDisplayComponents(errorDisplay);
  }

  const connectedCount = nodes.filter((n) => n.isConnected).length;
  const totalNodes = nodes.length;

  const headerDisplay = new TextDisplayBuilder().setContent(
    `### ${client.emoji?.info || ""} OZONE Audio Infrastructure (${connectedCount}/${totalNodes} Connected)\n`.trimStart() +
    (activeNodeName
      ? `> Current Server Node: **\`${activeNodeName}\`**\n`
      : `> Select a node below to stream music with optimal regional ping.\n`)
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x0A0B0E)
    .addTextDisplayComponents(headerDisplay)
    .addSeparatorComponents(new SeparatorBuilder());

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const isCurrent = activeNodeName && activeNodeName === n.name;
    const statusTag = n.isConnected ? `[${n.status.toUpperCase()}]` : "[OFFLINE]";
    const currentTag = isCurrent ? " `[CURRENT]`" : "";
    const pingText = n.latency < 9999 ? `${n.latency}ms` : "timeout";

    let nodeContent = `**${n.name}** \`${statusTag}\`${currentTag}\n` +
      `> **Ping:** \`${pingText}\` • **Load:** \`${n.players}\` players • **Uptime:** \`${formatNodeUptime(n.uptime)}\`\n` +
      `> **CPU:** \`${n.systemCpuPercent}%\` System / \`${n.lavalinkCpuPercent}%\` Audio • **RAM:** \`${n.memoryUsedMb}MB / ${n.memoryTotalMb}MB\``;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(nodeContent));
    if (i < nodes.length - 1) {
      container.addSeparatorComponents(new SeparatorBuilder());
    }
  }

  return container;
}

function buildNodeSelectRow(client, currentPreference = "auto") {
  const router = client.nodeRouter;
  const nodes = router ? router.getAllNodesStatus().filter((n) => n.isConnected) : [];

  const options = [
    {
      label: "Automatic (Recommended)",
      value: "auto",
      description: "Smart low-latency routing & automatic failover",
      default: currentPreference === "auto",
    },
    ...nodes.map((n) => ({
      label: `${n.name} (${n.latency < 9999 ? `${n.latency}ms` : "Active"})`,
      value: n.name,
      description: `Players: ${n.players} | CPU: ${n.systemCpuPercent}%`,
      default: currentPreference === n.name,
    })),
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId("node_selector_menu")
    .setPlaceholder("Choose your audio node...")
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

module.exports = {
  name: "node",
  category: "Config",
  description: "View audio node status and choose your preferred playback node",
  cooldown: 3,
  usage: "[status | auto | select <node-name>]",
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "select",
      description: "Choose which audio server plays your music",
      type: 1, // Subcommand
      options: [
        {
          name: "server",
          description: "Choose a specific node or 'auto'",
          type: 3,
          required: false,
          autocomplete: true,
        },
      ],
    },
    {
      name: "status",
      description: "View real-time latency, load, and health of all audio nodes",
      type: 1, // Subcommand
    },
    {
      name: "auto",
      description: "Reset to automatic low-latency node routing",
      type: 1, // Subcommand
    },
  ],

  async autocomplete(interaction, client) {
    const focused = interaction.options.getFocused().toLowerCase();
    const router = client.nodeRouter;
    const nodes = router ? router.getAllNodesStatus().filter((n) => n.isConnected) : [];

    const choices = [
      { name: "Automatic (Optimal Ping & Load Balanced)", value: "auto" },
      ...nodes.map((n) => ({
        name: `${n.name} (${n.latency < 9999 ? `${n.latency}ms` : "Active"} | ${n.players} players)`,
        value: n.name,
      })),
    ];

    const filtered = choices
      .filter((c) => c.name.toLowerCase().includes(focused) || c.value.toLowerCase().includes(focused))
      .slice(0, 25);

    return interaction.respond(filtered).catch(() => {});
  },

  async slashExecute(interaction, client) {
    const subcommand = interaction.options.getSubcommand(false) || "status";

    if (subcommand === "status") {
      const container = buildNodesStatusContainer(client, interaction.guildId);
      const pref = await UserPreferences.findOne({ userId: interaction.user.id });
      const selectRow = buildNodeSelectRow(client, pref?.preferredNode || "auto");
      container.addActionRowComponents(selectRow);

      const replyMsg = await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      }).catch(() => {});

      if (replyMsg && typeof replyMsg.createMessageComponentCollector === "function") {
        const collector = replyMsg.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === interaction.user.id,
          time: 60000,
        });

        collector.on("collect", async (i) => {
          const selected = i.values[0];
          await UserPreferences.findOneAndUpdate(
            { userId: i.user.id },
            { preferredNode: selected, updatedAt: Date.now() },
            { upsert: true }
          );

          if (client.nodeRouter && interaction.guildId) {
            client.nodeRouter.setGuildAffinity(interaction.guildId, selected);
          }

          let migrationNote = "";
          const activePlayer = client.manager?.players?.get(interaction.guildId);
          if (activePlayer && selected !== "auto" && activePlayer.node?.name !== selected) {
            migrationNote = "\n> *Seamlessly migrating active playback to the chosen node...*";
            client.migrationService?.migratePlayer(interaction.guildId, selected, {
              reason: `User ${i.user.username} switched node`,
              notify: true,
            });
          }

          const successContainer = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${client.emoji?.check || ""} Audio node preference set to \`${selected === "auto" ? "Automatic" : selected}\`!**${migrationNote}`.trimStart()
            )
          );

          await i.update({
            components: [successContainer],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        });
      }
      return;
    }

    if (subcommand === "auto") {
      await UserPreferences.findOneAndUpdate(
        { userId: interaction.user.id },
        { preferredNode: "auto", updatedAt: Date.now() },
        { upsert: true }
      );

      if (client.nodeRouter && interaction.guildId) {
        client.nodeRouter.setGuildAffinity(interaction.guildId, "auto");
      }

      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji?.check || ""} Reset node routing to \`Automatic\`!**\n> OZONE will continuously select the lowest latency and healthiest audio node for you.`.trimStart()
        )
      );

      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (subcommand === "select") {
      const selected = interaction.options.getString("server");

      if (!selected) {
        const pref = await UserPreferences.findOne({ userId: interaction.user.id });
        const selectRow = buildNodeSelectRow(client, pref?.preferredNode || "auto");
        const container = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ${client.emoji?.music || ""} Choose Your Audio Node\n`.trimStart() +
              `> Pick a Lavalink node to route your server's audio through.`
            )
          )
          .addActionRowComponents(selectRow);

        const replyMsg = await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        }).catch(() => {});

        if (replyMsg && typeof replyMsg.createMessageComponentCollector === "function") {
          const collector = replyMsg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id,
            time: 60000,
          });

          collector.on("collect", async (i) => {
            const chosen = i.values[0];
            await UserPreferences.findOneAndUpdate(
              { userId: i.user.id },
              { preferredNode: chosen, updatedAt: Date.now() },
              { upsert: true }
            );

            if (client.nodeRouter && interaction.guildId) {
              client.nodeRouter.setGuildAffinity(interaction.guildId, chosen);
            }

            let migrationNote = "";
            const activePlayer = client.manager?.players?.get(interaction.guildId);
            if (activePlayer && chosen !== "auto" && activePlayer.node?.name !== chosen) {
              migrationNote = "\n> *Seamlessly migrating active playback to the chosen node...*";
              client.migrationService?.migratePlayer(interaction.guildId, chosen, {
                reason: `User ${i.user.username} switched node`,
                notify: true,
              });
            }

            const successContainer = new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${client.emoji?.check || ""} Preferred audio node set to \`${chosen === "auto" ? "Automatic" : chosen}\`!**${migrationNote}`.trimStart()
              )
            );

            await i.update({
              components: [successContainer],
              flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
          });
        }
        return;
      }

      await UserPreferences.findOneAndUpdate(
        { userId: interaction.user.id },
        { preferredNode: selected, updatedAt: Date.now() },
        { upsert: true }
      );

      if (client.nodeRouter && interaction.guildId) {
        client.nodeRouter.setGuildAffinity(interaction.guildId, selected);
      }

      let migrationNote = "";
      const activePlayer = client.manager?.players?.get(interaction.guildId);
      if (activePlayer && selected !== "auto" && activePlayer.node?.name !== selected) {
        migrationNote = "\n> *Seamlessly migrating active playback to the chosen node...*";
        client.migrationService?.migratePlayer(interaction.guildId, selected, {
          reason: `User ${interaction.user.username} switched node`,
          notify: true,
        });
      }

      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji?.check || ""} Audio node set to \`${selected === "auto" ? "Automatic" : selected}\`!**${migrationNote}`.trimStart()
        )
      );

      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },

  async execute(message, args, client, prefix) {
    const sub = (args[0] || "").toLowerCase();

    if (sub === "auto") {
      await UserPreferences.findOneAndUpdate(
        { userId: message.author.id },
        { preferredNode: "auto", updatedAt: Date.now() },
        { upsert: true }
      );

      if (client.nodeRouter && message.guild?.id) {
        client.nodeRouter.setGuildAffinity(message.guild.id, "auto");
      }

      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji?.check || ""} Reset node routing to \`Automatic\`!**\n> OZONE will continuously select the lowest latency and healthiest audio node for you.`.trimStart()
        )
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (sub === "select") {
      if (!args[1]) {
        return message.reply(formatCommandHelp(this, message.author, prefix));
      }
      const chosen = args.slice(1).join(" ").trim();
      await UserPreferences.findOneAndUpdate(
        { userId: message.author.id },
        { preferredNode: chosen, updatedAt: Date.now() },
        { upsert: true }
      );

      if (client.nodeRouter && message.guild?.id) {
        client.nodeRouter.setGuildAffinity(message.guild.id, chosen);
      }

      let migrationNote = "";
      const activePlayer = client.manager?.players?.get(message.guild?.id);
      if (activePlayer && chosen !== "auto" && activePlayer.node?.name !== chosen) {
        migrationNote = "\n> *Seamlessly migrating active playback to the chosen node...*";
        client.migrationService?.migratePlayer(message.guild.id, chosen, {
          reason: `User ${message.author.username} switched node`,
          notify: true,
        });
      }

      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji?.check || ""} Preferred audio node set to \`${chosen}\`!**${migrationNote}`.trimStart()
        )
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (sub && sub !== "status") {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    // Default: Show node status and select menu
    const container = buildNodesStatusContainer(client, message.guild?.id);
    const pref = await UserPreferences.findOne({ userId: message.author.id });
    const selectRow = buildNodeSelectRow(client, pref?.preferredNode || "auto");
    container.addActionRowComponents(selectRow);

    const replyMsg = await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});

    if (replyMsg && typeof replyMsg.createMessageComponentCollector === "function") {
      const collector = replyMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === message.author.id,
        time: 60000,
      });

      collector.on("collect", async (i) => {
        const selected = i.values[0];
        await UserPreferences.findOneAndUpdate(
          { userId: i.user.id },
          { preferredNode: selected, updatedAt: Date.now() },
          { upsert: true }
        );

        if (client.nodeRouter && message.guild?.id) {
          client.nodeRouter.setGuildAffinity(message.guild.id, selected);
        }

        let migrationNote = "";
        const activePlayer = client.manager?.players?.get(message.guild?.id);
        if (activePlayer && selected !== "auto" && activePlayer.node?.name !== selected) {
          migrationNote = "\n> *Seamlessly migrating active playback to the chosen node...*";
          client.migrationService?.migratePlayer(message.guild.id, selected, {
            reason: `User ${i.user.username} switched node`,
            notify: true,
          });
        }

        const successContainer = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji?.check || ""} Audio node preference set to \`${selected === "auto" ? "Automatic" : selected}\`!**${migrationNote}`.trimStart()
          )
        );

        await i.update({
          components: [successContainer],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      });
    }
  },
};
