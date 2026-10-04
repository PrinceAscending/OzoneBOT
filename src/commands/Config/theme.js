const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const { warnPayload } = require("../../utils/responses");

const THEMES = {
  obsidian: { name: "Pure Obsidian", color: 0x0A0B0E, desc: "Ultra-sleek pitch black & stealth matte dark (Pure Dark)" },
  minimal: { name: "Minimal Slate", color: 0x18181B, desc: "Clean, industrial monochrome charcoal" },
  neon: { name: "Neon Synth", color: 0xFF007F, desc: "Hot pink & magenta synthwave neon glow" },
  cyber: { name: "Cyber Emerald", color: 0x00FF66, desc: "Matrix and cyberpunk vibrant green" },
  amber: { name: "Golden Amber", color: 0xF5B041, desc: "Warm vinyl vintage sunset glow" },
  royal: { name: "Royal Velvet", color: 0x8E44AD, desc: "Deep imperial purple & indigo" },
  crimson: { name: "Crimson Flame", color: 0xE74C3C, desc: "High intensity red and flame aesthetic" },
};

function buildThemeMenu(currentTheme, userId, disabled = false) {
  const options = Object.entries(THEMES).map(([id, t]) => ({
    label: t.name,
    value: id,
    description: t.desc.slice(0, 100),
    default: id === currentTheme,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`theme_select:${userId}`)
    .setPlaceholder("Select your card theme...")
    .setDisabled(disabled)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function buildThemeCard(client, currentTheme, isUpdate = false) {
  const t = THEMES[currentTheme] || THEMES.obsidian;
  const title = isUpdate
    ? `### ${client.emoji?.check || ""} Theme Updated: ${t.name}!\n`
    : `### ${client.emoji?.config || ""} OZONE Card Themes\n`;

  const body = isUpdate
    ? `Your now-playing cards will now be rendered in **${t.name}** (*${t.desc}*).\n\n` +
      `**Current Theme:** **${t.name}**`
    : `Select your signature card theme from the dropdown menu below. Your chosen theme sets the player accent colors and card aesthetic across all servers.\n\n` +
      `**Current Theme:** **${t.name}**\n` +
      `-# Select an option below to switch themes instantly.`;

  return new ContainerBuilder()
    .setAccentColor(t.color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title + body));
}

module.exports = {
  name: "theme",
  aliases: ["aesthetic", "themes", "cardtheme", "style"],
  category: "Config",
  description: "Customize your personal now-playing card theme and accent colors via dropdown.",
  cooldown: 5,
  usage: "[theme-name]",
  botPerms: ["EmbedLinks"],
  keepAlive: true,
  slashOptions: [
    {
      name: "theme",
      description: "Select your desired card theme",
      type: 3,
      required: false,
      choices: Object.entries(THEMES).map(([id, t]) => ({ name: t.name, value: id })),
    },
  ],

  async slashExecute(interaction, client) {
    const selected = interaction.options.getString("theme");
    return handleTheme({ client, guild: interaction.guild, user: interaction.user, selected, reply: (o) => interaction.reply(o) });
  },

  async execute(message, args, client, prefix) {
    const selected = args[0]?.toLowerCase();
    return handleTheme({ client, guild: message.guild, user: message.author, selected, prefix, reply: (o) => message.reply(o) });
  },
};

async function handleTheme({ client, guild, user, selected, reply }) {
  if (!selected) {
    const userPref = await UserPreferences.findOne({ userId: user.id }).catch(() => null);
    let currentTheme = userPref?.theme || "obsidian";
    if (!THEMES[currentTheme]) currentTheme = "obsidian";

    const card = buildThemeCard(client, currentTheme);
    const row = buildThemeMenu(currentTheme, user.id);
    card.addActionRowComponents(row);

    const responseMsg = await reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
    const msg = responseMsg && typeof responseMsg.fetch === "function" ? await responseMsg.fetch().catch(() => responseMsg) : responseMsg;
    if (!msg || typeof msg.createMessageComponentCollector !== "function") return responseMsg;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 90_000,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: `**${client.emoji?.warn || ""} Only <@${user.id}> can change this setting.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const chosen = interaction.values[0];
      if (!THEMES[chosen]) return interaction.deferUpdate();

      await UserPreferences.findOneAndUpdate(
        { userId: user.id },
        { $set: { theme: chosen } },
        { upsert: true, new: true }
      ).catch(() => {});

      if (guild?.id) {
        const player = client.manager?.players?.get(guild.id);
        if (player) player.data.set("accentColor", THEMES[chosen].color);
      }

      currentTheme = chosen;
      const updatedCard = buildThemeCard(client, chosen, true);
      const updatedRow = buildThemeMenu(chosen, user.id);
      updatedCard.addActionRowComponents(updatedRow);

      await interaction.update({ components: [updatedCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });

    collector.on("end", async () => {
      const disabledCard = buildThemeCard(client, currentTheme);
      const disabledRow = buildThemeMenu(currentTheme, user.id, true);
      disabledCard.addActionRowComponents(disabledRow);
      await msg.edit({ components: [disabledCard] }).catch(() => {});
    });

    return responseMsg;
  }

  const themeKey = selected.toLowerCase();
  if (!THEMES[themeKey]) {
    const { formatCommandHelp } = require("../../utils/commandHelp");
    return reply(formatCommandHelp(module.exports, user, prefix));
  }

  await UserPreferences.findOneAndUpdate(
    { userId: user.id },
    { $set: { theme: themeKey } },
    { upsert: true, new: true }
  ).catch(() => {});

  if (guild?.id) {
    const player = client.manager?.players?.get(guild.id);
    if (player) player.data.set("accentColor", THEMES[themeKey].color);
  }

  const card = buildThemeCard(client, themeKey, true);
  return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
}
