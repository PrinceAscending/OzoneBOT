/**
 * OZONE Music Quiz — "Name That Tune" for your voice channel.
 *
 * The bot plays a real song snippet (volume ducked, random seek), everyone in
 * the VC races to smash the right title button. 4 options, up to 5 rounds,
 * DB-persisted guild leaderboard. The user's queue/current track is stashed at
 * start and fully restored at the end; now-playing cards are suppressed during
 * the quiz so the card never spoils the answer.
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
const QuizScore = require("../../schema/quizscore");

const QUIZ_POOL = [
  "top hits", "pop classics", "rock anthems", "bollywood hits", "punjabi hits",
  "lofi beats", "90s hits", "2000s hits", "party songs", "romantic hits",
  "edm drops", "hip hop hits", "indie hits", "soul classics", "k-pop hits",
];
const OPTIONS = 4;
const ROUNDS = 5;
const ROUND_TIME_MS = 25 * 1000;
const SNIPPET_VOLUME = 12;
const CUSTOM_PREFIX = "quiz:";
const CUSTOM_IDS = Array.from({ length: OPTIONS }, (_, i) => `${CUSTOM_PREFIX}${i}`);

function isQuizActive(player) {
  return Boolean(player?.data?.get("quiz"));
}

function humanListeners(guild, player) {
  const vcId = player?.voiceId || guild.members.me?.voice?.channelId;
  const vc = guild.channels.cache.get(vcId);
  if (!vc) return [];
  return [...vc.members.values()].filter((m) => !m.user.bot);
}

async function pickTracks(player) {
  const rounds = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 8 && rounds.length < ROUNDS; attempt++) {
    const query = QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)];
    const res = await player.search(query, { requester: null }).catch(() => null);
    const tracks = (res?.tracks || []).filter(
      (t) => t?.title && (t.length || 0) >= 45_000 && !t.isStream && !seen.has(t.identifier),
    );
    for (const track of tracks) {
      if (rounds.length >= ROUNDS) break;
      if (seen.has(track.identifier)) continue;
      seen.add(track.identifier);
      rounds.push(buildRound(track, player));
    }
  }
  return rounds;
}

function buildRound(track, player) {
  const options = [track];
  const seenTitles = new Set([String(track.title).toLowerCase()]);
  const filler = [...(player.queue || []), ...(player.data.get("history") || [])];
  for (const candidate of filler) {
    if (options.length >= OPTIONS) break;
    const title = String(candidate?.title || "").toLowerCase();
    if (!title || seenTitles.has(title)) continue;
    seenTitles.add(title);
    options.push(candidate);
  }
  while (options.length < OPTIONS) {
    options.push({ title: `Mystery Track #${options.length + 1}`, uri: null, identifier: null });
  }
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctIndex = options.findIndex((o) => o.identifier && o.identifier === track.identifier);
  return { track, options, correctIndex };
}

function roundCard(round, roundNo, totalRounds, scoreboard) {
  const board = Object.entries(scoreboard)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, score], i) => `\`${i + 1}.\` <@${userId}> — **${score}** pts`)
    .join("\n") || "`—` nobody has scored yet";

  return new ContainerBuilder()
    .setAccentColor(0x35C47C)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${emoji.music} Round ${roundNo}/${totalRounds} — Name That Tune!\n` +
      `-# Listen closely… smash the right title before the snippet ends.`,
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      round.options.map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_PREFIX}${i}`)
          .setLabel(String(opt.title).slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**${emoji.star} Scoreboard**\n${board}`,
    ));
}

function revealCard(round, winnerId, roundNo, totalRounds, msTaken) {
  const line = winnerId
    ? `${emoji.check} **<@${winnerId}> nailed it** in \`${(msTaken / 1000).toFixed(1)}s\`!`
    : `${emoji.cross} Nobody got it — it was **${String(round.track.title).slice(0, 60)}**`;
  return new ContainerBuilder()
    .setAccentColor(winnerId ? 0x35C47C : 0xED4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### Round ${roundNo}/${totalRounds} — ${String(round.track.title).slice(0, 60)}\n${line}`,
    ));
}

async function awardWinner(guildId, userId, msTaken) {
  try {
    const doc = await QuizScore.findOne({ guildId, userId });
    if (doc) {
      doc.wins += 1;
      doc.totalRounds += 1;
      doc.updatedAt = Date.now();
      if (msTaken && (!doc.fastestMs || msTaken < doc.fastestMs)) doc.fastestMs = msTaken;
      await doc.save();
    } else {
      await QuizScore.create({ guildId, userId, wins: 1, totalRounds: 1, fastestMs: msTaken || null });
    }
  } catch { /* leaderboard is best-effort */ }
}

module.exports = {
  name: "quiz",
  aliases: ["musicquiz", "namethattune"],
  category: "Music",
  cooldown: 10,
  description: "Start an in-VC Music Quiz — guess the song, climb the leaderboard!",
  args: false,
  usage: "[start|stop|leaderboard] [genre]",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [
    { name: "action", description: "Start or stop the quiz, or view the leaderboard", type: 3, required: false, choices: [
      { name: "start", value: "start" }, { name: "stop", value: "stop" }, { name: "leaderboard", value: "leaderboard" },
    ] },
  ],

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
    const action = interaction.options.getString("action") || "start";
    return this.execute(wrapper, [action], client, client.prefix);
  },

  async execute(message, args, client) {
    const player = client.manager.players.get(message.guild.id);
    if (!player) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.info} I need to be playing music first — start a track, then run the quiz.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const sub = (args[0] || "start").toLowerCase();

    if (sub === "stop" || sub === "end") {
      if (!isQuizActive(player)) {
        return message.reply({
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.info} No quiz is running.**`),
          )],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      await endQuiz(client, player, message, {}, 0, false);
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.check} Quiz ended.** Your queue is back.`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (sub === "leaderboard" || sub === "top") {
      const scores = await QuizScore.find({ guildId: message.guild.id }).sort({ wins: -1 }).limit(10).lean().catch(() => []);
      if (!scores.length) {
        return message.reply({
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.info} No quiz scores yet — run \`${client.prefix}quiz\` to start one!**`),
          )],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      const board = scores.map((s, i) =>
        `\`${String(i + 1).padStart(2, " ")}.\` <@${s.userId}> — **${s.wins}** wins · fastest ${s.fastestMs ? `${(s.fastestMs / 1000).toFixed(1)}s` : "—"}`,
      ).join("\n");
      return message.reply({
        components: [new ContainerBuilder()
          .setAccentColor(0xF0B232)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${emoji.star} OZONE Quiz Champions — ${message.guild.name}\n${board}`,
          ))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (sub !== "start") {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.info} Usage:** \`quiz start\`, \`quiz stop\`, \`quiz leaderboard\``),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    /* ---------- start ---------- */
    if (isQuizActive(player)) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.warn} A quiz is already running.** \`quiz stop\` ends it.`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const listeners = humanListeners(message.guild, player);
    if (listeners.length === 0) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.warn} Nobody is in my voice channel — a quiz with zero contestants is just a concert.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const loadingMsg = await message.reply({
      components: [new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${emoji.load} Loading the quiz — picking ${ROUNDS} mystery tracks…**`),
      )],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);
    if (!loadingMsg) return;

    const rounds = await pickTracks(player);
    if (rounds.length < 2) {
      return loadingMsg.edit({
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.warn} Couldn't load enough quiz tracks — the node may be struggling. Try again.**`),
        )],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    // Stash the user's session so playback can be fully restored afterwards.
    const savedCurrent = player.queue.current;
    const savedQueue = [...(player.queue || [])];
    player.queue.clear();
    // Suppress autoplay/radio/now-playing UI while the quiz owns the player.
    player.data.set("quiz", { running: true, savedCurrent, savedQueue, scoreboard: {} });
    await setQuizVolume(player);
    const { setVoiceChannelStatus } = require("../../utils/voiceChannelStatus");
    setVoiceChannelStatus(client, player, "🎵 Music Quiz in progress — guess the tune!");

    const scoreboard = player.data.get("quiz").scoreboard;
    let roundIdx = 0;

    const playRound = async () => {
      const quizState = player.data.get("quiz");
      if (!quizState) return;
      if (roundIdx >= rounds.length) return endQuiz(client, player, message, scoreboard, rounds.length, true);

      const round = rounds[roundIdx];
      const roundNo = roundIdx + 1;
      let solved = false;
      const startedAt = Date.now();

      const card = roundCard(round, roundNo, rounds.length, scoreboard);
      const roundMsg = await message.channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 }).catch(() => null);

      // Snippet: random seek past the intro, 30s cap via Lavalink endTime.
      const trackLength = round.track.length || 120_000;
      const seekTo = Math.max(10_000, Math.floor(Math.random() * Math.max(1, trackLength - 45_000)));
      const endTime = seekTo + 30_000;
      try {
        await player.play(round.track, { replaceCurrent: true, position: seekTo, endTime });
      } catch (e) {
        client.logger?.log(`[Quiz] snippet play failed: ${e.message}`, "warn");
      }

      const collector = roundMsg?.createMessageComponentCollector({ componentType: ComponentType.Button, time: ROUND_TIME_MS });
      const timer = setTimeout(() => finishRound(null), ROUND_TIME_MS);
      if (collector) player.data.set("quiz", { ...quizState, collector, timer });

      const finishRound = async (winnerId) => {
        if (solved || !player.data.get("quiz")) return;
        solved = true;
        clearTimeout(timer);
        const msTaken = Date.now() - startedAt;

        if (winnerId) {
          scoreboard[winnerId] = (scoreboard[winnerId] || 0) + 1;
          await awardWinner(message.guild.id, winnerId, msTaken);
        }
        collector?.stop("round-end");
        player.data.set("quiz", { ...(player.data.get("quiz") || quizState), collector: null, timer: null });

        await roundMsg?.edit({
          components: [revealCard(round, winnerId, roundNo, rounds.length, msTaken)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => { });

        roundIdx++;
        setTimeout(() => playRound(), 5 * 1000);
      };

      collector?.on("collect", async (i) => {
        if (!CUSTOM_IDS.includes(i.customId)) return;
        const idx = Number(i.customId.split(":")[1]);
        if (solved) {
          return i.reply({ content: `**${emoji.info} Round over!**`, flags: MessageFlags.Ephemeral }).catch(() => { });
        }
        if (idx === round.correctIndex) {
          await finishRound(i.user.id);
          await i.reply({ content: `**${emoji.check} Correct <@${i.user.id}>! +1 point**`, flags: MessageFlags.Ephemeral }).catch(() => { });
        } else {
          await i.reply({ content: `**${emoji.cross} Nope — keep listening!**`, flags: MessageFlags.Ephemeral }).catch(() => { });
        }
      });
    };

    await loadingMsg.edit({
      components: [new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${emoji.music} Quiz starting — ${rounds.length} rounds, first button wins!\n` +
          `-# Contestants: ${listeners.map((m) => `<@${m.id}>`).join(" ")}`,
        ),
      )],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => { });

    await playRound();
  },
};

async function setQuizVolume(player) {
  try {
    player.data.set("quizPrevVolume", player.volume ?? 80);
    await player.setVolume(SNIPPET_VOLUME);
  } catch { /* node hiccup — the quiz still runs */ }
}

async function restoreVolume(player) {
  try {
    const prev = player.data.get("quizPrevVolume");
    if (prev) await player.setVolume(prev);
    player.data.delete("quizPrevVolume");
  } catch { /* best-effort */ }
}

/**
 * Restore the pre-quiz session (current track + queue + volume) and post the
 * podium. Safe to call twice — the quiz state acts as the lock.
 */
async function endQuiz(client, player, message, scoreboard, totalRounds, natural = false) {
  const quizState = player.data.get("quiz");
  if (!quizState) return;
  if (quizState.timer) clearTimeout(quizState.timer);
  if (quizState.collector) quizState.collector.stop("quiz-end");
  player.data.delete("quiz");
  await restoreVolume(player);

  // Restore the user's session.
  try {
    player.queue.clear();
    if (quizState.savedCurrent) {
      // Re-queue the backlog first, then swap the snippet for the saved track.
      if (quizState.savedQueue.length > 0) player.queue.add(quizState.savedQueue);
      await player.play(quizState.savedCurrent, { replaceCurrent: true }).catch(() => { });
    } else if (quizState.savedQueue.length > 0) {
      player.queue.add(quizState.savedQueue);
      if (!player.playing && !player.paused) await player.play().catch(() => { });
    } else if (player.playing || player.paused) {
      // Nothing to restore — stop the quiz snippet politely.
      await player.skip().catch(() => { });
    }
  } catch (error) {
    client.logger?.log(`[Quiz] session restore failed: ${error.message}`, "warn");
  }

  const { syncVoiceChannelStatus } = require("../../utils/voiceChannelStatus");
  syncVoiceChannelStatus(client, player).catch(() => { });

  const ranking = Object.entries(scoreboard).sort((a, b) => b[1] - a[1]);
  const podium = ranking.length
    ? ranking.map(([userId, score], i) => {
        const medal = ["🥇", "🥈", "🥉"][i] || `**${i + 1}.**`;
        return `${medal} <@${userId}> — **${score}** pts`;
      }).join("\n")
    : "`—` a silent quiz — nobody scored";

  const finalCard = new ContainerBuilder()
    .setAccentColor(0xF0B232)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${emoji.star} ${natural ? "Quiz Over!" : "Quiz Cancelled"}\n${podium}\n\n` +
      `-# Hall of fame: \`${client.prefix}quiz leaderboard\``,
    ));

  return message.channel.send({ components: [finalCard], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
}

module.exports.isQuizActive = isQuizActive;
