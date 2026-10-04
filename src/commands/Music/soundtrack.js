const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const axios = require("axios");
const { errorPayload, warnPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

module.exports = {
  name: "soundtrack",
  aliases: ["cinematic", "ost", "scene"],
  category: "Music",
  description: "AI generates and queues an immersive cinematic soundtrack matching any scene or mood.",
  cooldown: 10,
  args: true,
  usage: "<scene description>",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],
  slashOptions: [
    {
      name: "scene",
      description: "Describe the movie scene, game moment, or mood (e.g. 'cyberpunk chase in rainy neo tokyo')",
      type: 3,
      required: true,
    },
  ],

  async slashExecute(interaction, client) {
    const scene = interaction.options.getString("scene");
    await interaction.deferReply().catch(() => {});

    return generateAndPlaySoundtrack({
      client,
      guild: interaction.guild,
      voiceChannel: interaction.member?.voice?.channel,
      textChannel: interaction.channel,
      user: interaction.user,
      scene,
      reply: (opts) => interaction.editReply(opts),
    });
  },

  async execute(message, args, client, prefix) {
    const scene = args.join(" ").trim();
    if (!scene) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    return generateAndPlaySoundtrack({
      client,
      guild: message.guild,
      voiceChannel: message.member?.voice?.channel,
      textChannel: message.channel,
      user: message.author,
      scene,
      reply: (opts) => message.reply(opts),
    });
  },
};

async function generateAndPlaySoundtrack({ client, guild, voiceChannel, textChannel, user, scene, reply }) {
  if (!voiceChannel) {
    return reply(warnPayload("You must be in a voice channel first."));
  }

  const me = guild.members.me;
  if (!me?.permissions.has([PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak])) {
    return reply(warnPayload("I need `CONNECT` and `SPEAK` permissions in this server."));
  }

  const waitCard = new ContainerBuilder()
    .setAccentColor(0x0A0B0E)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Composing Soundtrack...\n` +
        `Analyzing scene: *"${scene.slice(0, 100)}"* — selecting scores and orchestrations...`
      )
    );

  await reply({ components: [waitCard], flags: MessageFlags.IsComponentsV2 });

  // 1. Query Groq for track recommendations
  let suggestedQueries = [];
  if (client.config?.groqApiKey) {
    try {
      const prompt = `You are a film and game music composer. The user describes a scene: "${scene}".
Provide exactly 4 real, famous soundtrack/instrumental or theme songs that match this scene perfectly.
Respond in JSON format only with an array of 4 search queries like: ["Hans Zimmer - Time", "Two Steps From Hell - Victory", ...]`;

      const aiRes = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${client.config.groqApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      const raw = aiRes.data?.choices?.[0]?.message?.content?.trim();
      const match = raw?.match(/\[[\s\S]*\]/);
      if (match) {
        suggestedQueries = JSON.parse(match[0]);
      }
    } catch (err) {
      client.logger?.log(`[Soundtrack] AI generation failed: ${err.message}`, "warn");
    }
  }

  // Fallback if AI is unavailable or fails
  if (!suggestedQueries || suggestedQueries.length < 2) {
    suggestedQueries = [
      `${scene} soundtrack ost`,
      `${scene} theme orchestral`,
      "Hans Zimmer epic soundtrack",
      "Ludwig Goransson theme ost",
    ];
  }

  // 2. Connect player
  let player = client.manager.players.get(guild.id);
  if (!player) {
    try {
      player = await client.manager.createPlayer({
        guildId: guild.id,
        voiceId: voiceChannel.id,
        textId: textChannel.id,
        volume: 80,
        deaf: true,
      });
      client.voiceHealthMonitor?.startMonitoring(player);
    } catch (e) {
      return reply(errorPayload(`Could not join voice: ${e.message}`));
    }
  }

  // 3. Search and queue tracks
  const queuedTracks = [];
  for (const q of suggestedQueries.slice(0, 4)) {
    try {
      const res = await player.search(q, { requester: user });
      if (res?.tracks?.length) {
        const t = res.tracks[0];
        player.queue.add(t);
        queuedTracks.push(t);
      }
    } catch {}
  }

  if (!queuedTracks.length) {
    return reply(errorPayload("Could not resolve audio tracks for this scene. Try another prompt!"));
  }

  if (!player.playing && !player.paused) {
    await player.play().catch(() => {});
  }

  const trackList = queuedTracks
    .map((t, i) => `\`${i + 1}.\` **[${t.title.slice(0, 45)}](${t.uri})** — *${t.author}*`)
    .join("\n");

  const resultCard = new ContainerBuilder()
    .setAccentColor(0x0A0B0E)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### OZONE Cinema — Original Soundtrack\n` +
        `**Scene:** *"${scene}"*\n` +
        `-# Generated with AI • ${queuedTracks.length} movements queued for <@${user.id}>\n\n` +
        `**Tracklist:**\n${trackList}`
      )
    );

  return reply({ components: [resultCard], flags: MessageFlags.IsComponentsV2 });
}
