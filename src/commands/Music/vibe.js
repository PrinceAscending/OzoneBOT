/**
 * OZONE Vibe — describe a mood in words, AI turns it into a real queue.
 * "rainy midnight chai study session" → 5 searchable tracks queued & playing.
 * Uses the same Groq key as OZONE AI; falls back to a curated mix if AI is down.
 */
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require("discord.js");
const emoji = require("../../emojis");
const { askGroq } = require("../../utils/ai");
const { hasAvailableNodes } = require("../../utils/nodeUtils");

const VIBE_SYSTEM_PROMPT =
  "You are OZONE's Vibe Curator. The user describes a mood, scene or vibe. " +
  "Reply with ONLY a JSON array of EXACTLY 5 objects, each {\"query\": \"artist - song title\"}. " +
  "Pick REAL, well-known songs that match the vibe and are easy to find on YouTube Music. " +
  "Mix famous with slightly deep cuts. No explanations, no markdown, ONLY the JSON array. " +
  'Example: [{"query":"Arijit Singh - Tum Hi Ho"},{"query":"Cigarettes After Sex - Apocalypse"}]';

const FALLBACK_QUERIES = [
  "lofi hip hop chill mix",
  "ChilledCow beats to relax",
  "ambient chill study",
  "acoustic chill songs",
  "night drive songs",
];

module.exports = {
  name: "vibe",
  aliases: ["mood", "vibes"],
  category: "Music",
  cooldown: 8,
  description: "Describe a vibe in words — OZONE AI builds a 5-track queue for it.",
  args: true,
  usage: "<describe your vibe>",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  player: false,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [
    { name: "prompt", description: "Describe the vibe (e.g. rainy midnight chai study session)", type: 3, required: true },
  ],

  async slashExecute(interaction, client) {
    await interaction.deferReply().catch(() => { });
    const prompt = interaction.options.getString("prompt") || "";
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (o) => (interaction.deferred ? interaction.editReply(o) : interaction.reply(o)),
    };
    return this.execute(wrapper, prompt.split(/\s+/), client, client.prefix);
  },

  async execute(message, args, client) {
    const vibe = args.join(" ").trim();
    if (!vibe) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.info} Describe your vibe:** \`${client.prefix}vibe rainy midnight chai study session\``,
          ),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.warn} Join a voice channel first — the vibe needs somewhere to land.**`,
          ),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (!hasAvailableNodes(client.manager)) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.cross} The music server is offline. Try again soon.**`,
          ),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const loading = await message.reply({
      components: [new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${emoji.load} Reading the vibe:** _"${vibe.slice(0, 120)}"_ — curating 5 tracks…`,
        ),
      )],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);
    if (!loading) return;

    // 1) Ask the AI for 5 search queries.
    let queries = [];
    const result = await askGroq(client, [{ role: "user", content: `Vibe: "${vibe}". Curate the 5 tracks.` }]);
    if (result.ok) {
      queries = extractQueries(result.content);
    }
    if (queries.length === 0) queries = FALLBACK_QUERIES;

    // 2) Search & queue them in order.
    let player = client.manager.players.get(message.guild.id);
    const isNewPlayer = !player;
    if (!player) {
      player = await client.manager.createPlayer({
        guildId: message.guild.id,
        voiceId: voiceChannel.id,
        textId: message.channel.id,
        volume: 80,
        deaf: true,
      }).catch(() => null);
      if (!player) {
        return loading.edit({
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.cross} Could not connect to the voice channel.**`),
          )],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => { });
      }
      client.voiceHealthMonitor?.startMonitoring(player);
    }

    const added = [];
    for (const query of queries) {
      if (added.length >= 5) break;
      try {
        const res = await player.search(query, { requester: message.author });
        const track = res?.tracks?.[0];
        if (track) {
          player.queue.add(track);
          added.push({ query, title: track.title, uri: track.uri, author: track.author });
        }
      } catch { /* try the next query */ }
    }

    if (added.length === 0) {
      return loading.edit({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.warn} Couldn't find tracks for that vibe. Try a simpler description.**`,
          ),
        )],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    // 3) Start playback if nothing is playing (or the player is brand new).
    const willPlayNow = isNewPlayer || (!player.playing && !player.paused);
    if (willPlayNow) {
      await player.play().catch((e) => client.logger?.log(`[Vibe] play failed: ${e.message}`, "warn"));
    }

    // 4) Show the setlist.
    const list = added.map((t, i) =>
      `\`${i + 1}.\` [${String(t.title).slice(0, 60)}](${t.uri}) — ${String(t.author).slice(0, 40)}`,
    ).join("\n");

    const card = new ContainerBuilder()
      .setAccentColor(0xB388FF)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${emoji.dance || "✨"} Vibe locked: _${vibe.slice(0, 80)}_\n` +
        `-# Curated by OZONE AI — ${added.length} tracks ${willPlayNow ? "now playing" : "queued"}`,
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(list));

    return loading.edit({ components: [card], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  },
};

/** Pull up to 5 search queries out of whatever the LLM returned. */
function extractQueries(content) {
  const out = [];
  try {
    const match = String(content).match(/\[[\s\S]*\]/);
    if (!match) return out;
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const q = typeof item === "string" ? item : item?.query;
        if (typeof q === "string" && q.trim()) out.push(q.trim().slice(0, 180));
        if (out.length >= 5) break;
      }
    }
  } catch { /* fall through */ }
  return out;
}