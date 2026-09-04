const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const { successPayload, warnPayload } = require("../../utils/responses");

const THEMES = {
  neon: { name: "Neon Synth", color: 0xFF007F, desc: "Hot pink & magenta synthwave neon glow" },
  cyber: { name: "Cyber Emerald", color: 0x00FF66, desc: "Matrix and cyberpunk vibrant green" },
  amber: { name: "Golden Amber", color: 0xF5B041, desc: "Warm vinyl vintage sunset glow" },
  royal: { name: "Royal Velvet", color: 0x8E44AD, desc: "Deep imperial purple & indigo" },
  minimal: { name: "Minimal Slate", color: 0x3F4652, desc: "Clean, industrial monochrome charcoal" },
  crimson: { name: "Crimson Flame", color: 0xE74C3C, desc: "High intensity red and flame aesthetic" },
};

module.exports = {
  name: "aesthetic",
  aliases: ["theme", "style", "cardtheme"],
  category: "Config",
  description: "Customize your personal now-playing card theme and accent colors.",
  cooldown: 5,
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "theme",
      description: "Select your desired theme",
      type: 3,
      required: false,
      choices: Object.entries(THEMES).map(([id, t]) => ({ name: t.name, value: id })),
    },
  ],

  async slashExecute(interaction, client) {
    const selected = interaction.options.getString("theme");
    return handleAesthetic({ client, user: interaction.user, selected, reply: (o) => interaction.reply(o) });
  },

  async execute(message, args, client, prefix) {
    const selected = args[0]?.toLowerCase();
    return handleAesthetic({ client, user: message.author, selected, prefix, reply: (o) => message.reply(o) });
  },
};

async function handleAesthetic({ client, user, selected, prefix = "^", reply }) {
  if (!selected) {
    const userPref = await UserPreferences.findOne({ userId: user.id }).catch(() => null);
    const currentTheme = userPref?.theme || "neon";

    const themeList = Object.entries(THEMES).map(([id, t]) => {
      const active = id === currentTheme ? " **(ACTIVE)**" : "";
      return `\`${id}\` — **${t.name}**: *${t.desc}*${active}`;
    }).join("\n");

    const card = new ContainerBuilder()
      .setAccentColor(THEMES[currentTheme]?.color || 0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 🎨 Card Aesthetics & Themes\n` +
          `Customize the visual style of your music cards across all servers!\n\n` +
          `${themeList}\n\n` +
          `-# To change your theme, use \`${prefix}aesthetic <theme-name>\` or \`/aesthetic\`.`
        )
      );

    return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  }

  const themeKey = selected.toLowerCase();
  if (!THEMES[themeKey]) {
    return reply(warnPayload(`Invalid theme choice! Choose one of: \`${Object.keys(THEMES).join(", ")}\``));
  }

  await UserPreferences.findOneAndUpdate(
    { userId: user.id },
    { $set: { theme: themeKey } },
    { upsert: true, new: true }
  );

  const card = new ContainerBuilder()
    .setAccentColor(THEMES[themeKey].color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${client.emoji.check || "✅"} Aesthetic Updated: ${THEMES[themeKey].name}!\n` +
        `Your music cards will now shine in **${THEMES[themeKey].name}** (*${THEMES[themeKey].desc}*).`
      )
    );

  return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
}
