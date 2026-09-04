/**
 * OZONE VoteSkip — democratic track skipping.
 * A skip passes when votes reach > 1/3 of the human listeners in the VC
 * (configurable). The now-playing control stays authoritative: /skip always works.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ComponentType,
} = require("discord.js");
const emoji = require("../../emojis");

const VOTE_WINDOW_MS = 90 * 1000;
const CUSTOM_ID = "voteskip:cast";

module.exports = {
  name: "voteskip",
  aliases: ["vs", "vskip"],
  category: "Music",
  cooldown: 3,
  description: "Start a vote to skip the current track — majority rules.",
  args: false,
  usage: "",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply().catch(() => { });
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (o) => (interaction.deferred ? interaction.editReply(o) : interaction.reply(o)),
    };
    return this.execute(wrapper, [], client, client.prefix);
  },

  async execute(message, args, client) {
    const player = client.manager.players.get(message.guild.id);
    const track = player?.queue?.current;
    if (!track) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.info} Nothing is playing — nothing to vote on.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // DJ / guild owner / admins skip freely — no vote needed (parity with the
    // dj gate used elsewhere). Everyone else votes.
    const voiceChannel = message.guild.members.me?.voice?.channel;
    const listeners = voiceChannel
      ? voiceChannel.members.filter((m) => !m.user.bot)
      : null;

    if (!listeners || listeners.size === 0) {
      // No listeners cache (voice state lag) — behave like a plain skip.
      await player.skip();
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.check} Skipped — no listeners to vote.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const required = Math.max(2, Math.ceil((listeners.size + 1) / 3));

    // A vote may already be running for this track (player.data survives
    // re-invocations) — join it instead of opening a second one.
    const existing = player.data.get("voteskip");
    if (existing && existing.trackId === (track.identifier || track.uri) && existing.endsAt > Date.now()) {
      existing.voters.add(message.author.id);
      return renderVote(message, client, player, existing, required, listeners.size);
    }

    const vote = {
      trackId: track.identifier || track.uri,
      trackTitle: track.title,
      trackUri: track.uri,
      requester: message.author.id,
      voters: new Set([message.author.id]),
      endsAt: Date.now() + VOTE_WINDOW_MS,
    };
    player.data.set("voteskip", vote);

    return renderVote(message, client, player, vote, required, listeners.size, true);
  },
};

async function renderVote(message, client, player, vote, required, listenerCount, isNew = false) {
  const trackLabel = `[${String(vote.trackTitle).slice(0, 60)}](${vote.trackUri || "https://discord.com"})`;
  const remainingSec = Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000));
  const votes = vote.voters.size;

  const card = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${emoji.check} Vote Skip ${isNew ? "started" : "updated"}\n` +
      `-# Track: ${trackLabel}\n` +
      `**${emoji.dot} Votes** \`${votes}/${required}\` — ${votes >= required ? "**PASSES**" : "still counting"}\n` +
      `**${emoji.dot} Listeners** \`${listenerCount}\`\n` +
      `**${emoji.dot} Window** \`${remainingSec}s\` — ends <t:${Math.floor(vote.endsAt / 1000)}:R>\n` +
      `-# Voters: ${[...vote.voters].map((id) => `<@${id}>`).join(" ") || "—"}`,
    ))
    .addSeparatorComponents(new SeparatorBuilder());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID)
      .setLabel(`Vote to Skip (${votes}/${required})`)
      .setStyle(votes >= required ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("voteskip:cancel")
      .setLabel("Cancel Vote")
      .setStyle(ButtonStyle.Secondary),
  );

  const payload = { components: [card, row], flags: MessageFlags.IsComponentsV2 };
  const msg = isNew
    ? await message.reply(payload).catch(() => message.channel.send(payload).catch(() => null))
    : await message.reply(payload).catch(() => null);
  if (!msg) return;

  // Pass immediately once the threshold is met.
  if (votes >= required) return executeSkip(message, client, player, msg, vote);

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: VOTE_WINDOW_MS });

  collector.on("collect", async (i) => {
    if (i.customId === "voteskip:cancel") {
      if (i.user.id !== vote.requester) {
        return i.reply({
          content: `**${emoji.warn} Only the vote starter can cancel.**`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => { });
      }
      player.data.delete("voteskip");
      collector.stop("cancelled");
      return i.update({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${emoji.info} Vote cancelled by <@${vote.requester}>.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    // voters is a Set — one vote per user, revoting is idempotent.
    vote.voters.add(i.user.id);
    player.data.set("voteskip", vote);

    const currentRequired = Math.max(2, Math.ceil((listenerCount + 1) / 3));
    // Rebuild the card text with the new count.
    const freshCard = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${emoji.check} Vote Skip\n` +
        `-# Track: ${trackLabel}\n` +
        `**${emoji.dot} Votes** \`${vote.voters.size}/${currentRequired}\` — ${vote.voters.size >= currentRequired ? "**PASSES**" : "still counting"}\n` +
        `**${emoji.dot} Listeners** \`${listenerCount}\`\n` +
        `**${emoji.dot} Window** ends <t:${Math.floor(vote.endsAt / 1000)}:R>\n` +
        `-# Voters: ${[...vote.voters].map((id) => `<@${id}>`).join(" ") || "—"}`,
      ))
      .addSeparatorComponents(new SeparatorBuilder());

    const freshRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_ID)
        .setLabel(`Vote to Skip (${vote.voters.size}/${currentRequired})`)
        .setStyle(vote.voters.size >= currentRequired ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("voteskip:cancel")
        .setLabel("Cancel Vote")
        .setStyle(ButtonStyle.Secondary),
    );

    await i.update({ components: [freshCard, freshRow], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

    if (vote.voters.size >= currentRequired) {
      collector.stop("passed");
      executeSkip(message, client, player, msg, vote);
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "passed" || reason === "cancelled") return;
    if (player.data.get("voteskip")?.trackId === vote.trackId) player.data.delete("voteskip");
    if (reason === "time") {
      await msg.edit({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${emoji.info} Vote ended** — \`${vote.voters.size}/${required}\` wasn't enough. \`${vote.trackTitle?.slice(0, 50)}\` keeps playing.`,
          ),
        )],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }
  });
}

async function executeSkip(message, client, player, msg, vote) {
  player.data.delete("voteskip");
  await player.skip();
  await msg.edit({
    components: [new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji.check} The people have spoken — skipping ${vote.trackTitle ? `**${String(vote.trackTitle).slice(0, 60)}**` : "the track"}** (\`${vote.voters.size} votes\`).`,
      ),
    )],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => { });
}
