const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
  ComponentType,
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const { getAutoCleanConfig, updateAutoCleanConfig } = require("../../utils/autoClean");
const { successPayload, warnPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

function buildDashboard(client, config, disabled = false) {
  const isEnabled = config.enabled;
  const isUserClean = config.deleteUserMessage;
  const timeout = config.botMessageTimeout || 10;

  const statusText = isEnabled ? "**ENABLED**" : "**DISABLED**";
  const userText = isUserClean ? "**ENABLED** (3s delay)" : "**DISABLED**";

  const card = new ContainerBuilder()
    .setAccentColor(isEnabled ? 0x00FF66 : 0x0A0B0E)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${client.emoji?.config || ""} Smart Chat Auto-Clean\n` +
        `Automatically purges transient bot confirmations, warnings, errors, and command invocations to keep your music chat completely clean.\n\n` +
        `> • **Auto-Clean:** ${statusText}\n` +
        `> • **Bot Message Lifespan:** \`${timeout}s\`\n` +
        `> • **User Command Cleanup:** ${userText}\n` +
        `> • **Player Card Protection:** **IMMUNE** (Now Playing card is preserved)\n\n` +
        `-# Click the buttons below to toggle features or adjust message lifespans.`
      )
    );

  const toggleCleanBtn = new ButtonBuilder()
    .setCustomId("autoclean:toggle_engine")
    .setLabel(isEnabled ? "Disable Auto-Clean" : "Enable Auto-Clean")
    .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
    .setDisabled(disabled);

  const toggleUserBtn = new ButtonBuilder()
    .setCustomId("autoclean:toggle_user")
    .setLabel(isUserClean ? "Keep User Messages" : "Delete User Commands")
    .setStyle(isUserClean ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(disabled);

  const row1 = new ActionRowBuilder().addComponents(toggleCleanBtn, toggleUserBtn);

  const timer5Btn = new ButtonBuilder()
    .setCustomId("autoclean:timer_5")
    .setLabel("5s")
    .setStyle(timeout === 5 ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);

  const timer10Btn = new ButtonBuilder()
    .setCustomId("autoclean:timer_10")
    .setLabel("10s")
    .setStyle(timeout === 10 ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);

  const timer15Btn = new ButtonBuilder()
    .setCustomId("autoclean:timer_15")
    .setLabel("15s")
    .setStyle(timeout === 15 ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);

  const timer30Btn = new ButtonBuilder()
    .setCustomId("autoclean:timer_30")
    .setLabel("30s")
    .setStyle(timeout === 30 ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);

  const row2 = new ActionRowBuilder().addComponents(timer5Btn, timer10Btn, timer15Btn, timer30Btn);

  card.addActionRowComponents(row1, row2);
  return card;
}

module.exports = {
  name: "autoclean",
  aliases: ["autodelete", "cleanmode", "chatclean", "msgclean"],
  category: "Config",
  description: "Configure automatic cleanup of transient bot messages and command spam.",
  usage: "[on/off | timer <5-60> | user on/off]",
  userPerms: ["ManageGuild"],
  botPerms: ["EmbedLinks"],
  keepAlive: true,
  slashOptions: [
    {
      name: "status",
      description: "View and interact with the Auto-Clean dashboard",
      type: 1,
    },
    {
      name: "toggle",
      description: "Enable or disable automatic chat cleanup",
      type: 1,
      options: [
        {
          name: "state",
          description: "Enable or disable",
          type: 5,
          required: true,
        },
      ],
    },
    {
      name: "timer",
      description: "Set how many seconds bot messages stay before auto-deleting",
      type: 1,
      options: [
        {
          name: "seconds",
          description: "Lifespan in seconds (5 - 60)",
          type: 4,
          required: true,
          min_value: 5,
          max_value: 60,
        },
      ],
    },
    {
      name: "user",
      description: "Toggle deleting user command messages after execution",
      type: 1,
      options: [
        {
          name: "delete",
          description: "Whether to delete user command messages",
          type: 5,
          required: true,
        },
      ],
    },
  ],

  async slashExecute(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        content: `**${client.emoji?.warn || ""} You need \`Manage Server\` permission to configure Auto-Clean.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand(false) || "status";
    const guildId = interaction.guildId;

    if (sub === "toggle") {
      const state = interaction.options.getBoolean("state", true);
      const updated = await updateAutoCleanConfig(guildId, { enabled: state });
      return interaction.reply(successPayload(`Auto-Clean has been **${updated.enabled ? "Enabled" : "Disabled"}**!`));
    }

    if (sub === "timer") {
      const sec = interaction.options.getInteger("seconds", true);
      const updated = await updateAutoCleanConfig(guildId, { botMessageTimeout: sec });
      return interaction.reply(successPayload(`Bot message lifespan set to **${updated.botMessageTimeout} seconds**!`));
    }

    if (sub === "user") {
      const del = interaction.options.getBoolean("delete", true);
      const updated = await updateAutoCleanConfig(guildId, { deleteUserMessage: del });
      return interaction.reply(successPayload(`User command message cleanup is now **${updated.deleteUserMessage ? "Enabled" : "Disabled"}**!`));
    }

    const config = await getAutoCleanConfig(guildId);
    const card = buildDashboard(client, config);
    const replyMsg = await interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2, fetchReply: true });

    return attachCollector(replyMsg, interaction.user.id, client, guildId);
  },

  async execute(message, args, client, prefix) {
    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();

    if (sub === "on" || sub === "enable") {
      const updated = await updateAutoCleanConfig(guildId, { enabled: true });
      return message.reply(successPayload(`Auto-Clean has been **Enabled**! Transient bot messages will auto-delete in \`${updated.botMessageTimeout}s\`.`));
    }

    if (sub === "off" || sub === "disable") {
      await updateAutoCleanConfig(guildId, { enabled: false });
      return message.reply(warnPayload("Auto-Clean has been **Disabled**. Bot messages will remain in chat."));
    }

    if (sub === "timer") {
      if (!args[1]) {
        return message.reply(formatCommandHelp(this, message.author, prefix));
      }
      const sec = parseInt(args[1], 10);
      if (isNaN(sec) || sec < 3 || sec > 60) {
        return message.reply(formatCommandHelp(this, message.author, prefix));
      }
      const updated = await updateAutoCleanConfig(guildId, { botMessageTimeout: sec });
      return message.reply(successPayload(`Bot message lifespan updated to **${updated.botMessageTimeout} seconds**.`));
    }

    if (sub === "user") {
      if (!args[1]) {
        return message.reply(formatCommandHelp(this, message.author, prefix));
      }
      const opt = args[1]?.toLowerCase();
      const state = opt === "on" || opt === "enable" || opt === "true";
      const updated = await updateAutoCleanConfig(guildId, { deleteUserMessage: state });
      return message.reply(successPayload(`User command cleanup is now **${updated.deleteUserMessage ? "Enabled" : "Disabled"}**.`));
    }

    if (sub && !["dashboard", "menu", "status"].includes(sub)) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    const config = await getAutoCleanConfig(guildId);
    const card = buildDashboard(client, config);
    const replyMsg = await message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });

    return attachCollector(replyMsg, message.author.id, client, guildId);
  },
};

function attachCollector(msg, authorId, client, guildId) {
  if (!msg || typeof msg.createMessageComponentCollector !== "function") return;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== authorId) {
      return interaction.reply({
        content: `**${client.emoji?.warn || ""} Only the user who opened this menu can change settings.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const customId = interaction.customId;
    let config = await getAutoCleanConfig(guildId);

    if (customId === "autoclean:toggle_engine") {
      config = await updateAutoCleanConfig(guildId, { enabled: !config.enabled });
    } else if (customId === "autoclean:toggle_user") {
      config = await updateAutoCleanConfig(guildId, { deleteUserMessage: !config.deleteUserMessage });
    } else if (customId.startsWith("autoclean:timer_")) {
      const sec = parseInt(customId.replace("autoclean:timer_", ""), 10);
      if (!isNaN(sec)) {
        config = await updateAutoCleanConfig(guildId, { botMessageTimeout: sec });
      }
    }

    const updatedCard = buildDashboard(client, config);
    await interaction.update({ components: [updatedCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });

  collector.on("end", async () => {
    const config = await getAutoCleanConfig(guildId);
    const disabledCard = buildDashboard(client, config, true);
    await msg.edit({ components: [disabledCard] }).catch(() => {});
  });
}
