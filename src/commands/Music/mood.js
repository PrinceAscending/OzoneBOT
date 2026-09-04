const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const axios = require("axios");
const { errorPayload, warnPayload } = require("../../utils/responses");

module.exports = {
  name: "mood",
  aliases: ["vibecheck", "moodring", "servermood"],
  category: "Music",
  description: "AI-powered server mood ring — analyzes current and recent music to diagnose the server vibe.",
  cooldown: 10,
  player: true,
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const player = client.manager.players.get(interaction.guild.id);
    return analyzeMood({ client, guild: interaction.guild, player, reply: (opts) => interaction.editReply(opts) });
  },

  async execute(message, _args, client) {
    const player = client.manager.players.get(message.guild.id);
    return analyzeMood({ client, guild: message.guild, player, reply: (opts) => message.reply(opts) });
  },
};

async function analyzeMood({ client, guild, player, reply }) {
  const current = player?.queue?.current;
  const history = player?.data?.get("history") || [];
  const upcoming = [...(player?.queue || [])].slice(0, 5);

  const sampleTracks = [
    ...(current ? [current] : []),
    ...history.slice(-5),
    ...upcoming,
  ];

  if (!sampleTracks.length) {
    return reply(warnPayload("Play some songs first! The mood ring needs at least one track to analyze your server's vibe."));
  }

  const trackTitles = sampleTracks.map((t) => `"${t.title}" by ${t.author}`).join(", ");

  let moodData = {
    mood: "Euphoric Vibes",
    emoji: "✨",
    color: 0x9B59B6,
    energy: 78,
    analysis: "Your server is in a creative, upbeat state with a blend of vibrant melodies.",
    recommendation: "Play some upbeat synthwave or indie pop next!",
  };

  if (client.config?.groqApiKey) {
    try {
      const prompt = `Analyze this list of songs recently played in a Discord server:
[${trackTitles}]

Determine the collective emotional mood, energy level (0-100), and musical vibe.
Respond strictly in JSON format matching this schema:
{
  "mood": "Short mood name (e.g. Melancholy Midnight, High-Octane Rush, Romantic Chill)",
  "emoji": "One fitting emoji",
  "hexColor": "Hex color like #E0426E or #3498DB",
  "energy": 75,
  "analysis": "1-2 sentences summarizing the server's vibe",
  "recommendation": "1 specific song suggestion that would fit this mood"
}`;

      const aiRes = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 250,
          temperature: 0.6,
        },
        {
          headers: {
            Authorization: `Bearer ${client.config.groqApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 12000,
        }
      );

      const raw = aiRes.data?.choices?.[0]?.message?.content?.trim();
      const match = raw?.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        moodData = {
          mood: parsed.mood || moodData.mood,
          emoji: parsed.emoji || moodData.emoji,
          color: parsed.hexColor ? parseInt(parsed.hexColor.replace("#", ""), 16) : moodData.color,
          energy: parsed.energy ?? moodData.energy,
          analysis: parsed.analysis || moodData.analysis,
          recommendation: parsed.recommendation || moodData.recommendation,
        };
      }
    } catch (e) {
      client.logger?.log(`[Mood] Groq mood analysis error: ${e.message}`, "warn");
    }
  }

  const energyBarLength = 10;
  const filled = Math.round((moodData.energy / 100) * energyBarLength);
  const energyBar = `\`[${"■".repeat(filled)}${"—".repeat(energyBarLength - filled)}]\` ${moodData.energy}%`;

  const card = new ContainerBuilder()
    .setAccentColor(moodData.color || 0x5865F2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${moodData.emoji} Server Mood Ring — ${guild.name.slice(0, 30)}\n` +
        `**Current Vibe:** \`${moodData.mood}\`\n\n` +
        `**⚡ Energy Level:** ${energyBar}\n` +
        `**🔮 Vibe Diagnosis:** ${moodData.analysis}\n\n` +
        `**💡 AI Curated Next Song:** *${moodData.recommendation}*`
      )
    );

  return reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
}
