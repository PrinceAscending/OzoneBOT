const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
} = require("discord.js");
const BattleScore = require("../../schema/battle");
const { errorPayload, warnPayload, successPayload } = require("../../utils/responses");

module.exports = {
  name: "challenge",
  aliases: ["battle", "musicbattle", "duel"],
  category: "Music",
  description: "Challenge another listener to a 1v1 Music Battle — the VC votes on who has better music taste!",
  cooldown: 15,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],
  slashOptions: [
    {
      name: "user",
      description: "User to challenge",
      type: 6,
      required: false,
    },
    {
      name: "song",
      description: "Your battle song choice",
      type: 3,
      required: false,
    },
    {
      name: "leaderboard",
      description: "View top battle champions in this server",
      type: 5,
      required: false,
    },
  ],

  async slashExecute(interaction, client) {
    const showLb = interaction.options.getBoolean("leaderboard");
    if (showLb) {
      await interaction.deferReply();
      const lbCard = await getLeaderboardCard(interaction.guild);
      return interaction.editReply({ components: [lbCard], flags: MessageFlags.IsComponentsV2 });
    }

    const opponent = interaction.options.getUser("user");
    const song = interaction.options.getString("song");

    if (!opponent || !song) {
      return interaction.reply(warnPayload("Please provide both an opponent and your chosen song! Or check `/challenge leaderboard:true`."));
    }

    await interaction.deferReply();
    return startBattleFlow({
      client,
      guild: interaction.guild,
      channel: interaction.channel,
      challenger: interaction.user,
      opponent,
      challengerSong: song,
      reply: (opts) => interaction.editReply(opts),
    });
  },

  async execute(message, args, client, prefix) {
    if (args[0]?.toLowerCase() === "leaderboard" || args[0]?.toLowerCase() === "top" || args[0]?.toLowerCase() === "lb") {
      const lbCard = await getLeaderboardCard(message.guild);
      return message.reply({ components: [lbCard], flags: MessageFlags.IsComponentsV2 });
    }

    const opponentMention = message.mentions.users.first();
    if (!opponentMention) {
      const usage = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ⚔️ Music Battles (1v1)\n` +
          `Challenge a friend to a music face-off! Both players pick a song, the VC votes on the best track!\n\n` +
          `**Usage:** \`${prefix}challenge @user <your song choice>\`\n` +
          `**Leaderboard:** \`${prefix}challenge leaderboard\``
        )
      );
      return message.reply({ components: [usage], flags: MessageFlags.IsComponentsV2 });
    }

    const songQuery = args.slice(1).join(" ").trim();
    if (!songQuery) {
      return message.reply(warnPayload("Please name your battle song choice!"));
    }

    return startBattleFlow({
      client,
      guild: message.guild,
      channel: message.channel,
      challenger: message.author,
      opponent: opponentMention,
      challengerSong: songQuery,
      reply: (opts) => message.reply(opts),
    });
  },
};

async function getLeaderboardCard(guild) {
  const scores = await BattleScore.find({ guildId: guild.id }).sort({ wins: -1 }).limit(10).lean();
  if (!scores.length) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**⚔️ No music battle champions yet in ${guild.name}!** Start a battle with \`/challenge\`.`)
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const list = scores.map((s, i) => {
    const medal = medals[i] || `\`${i + 1}.\``;
    const winRate = s.totalBattles > 0 ? Math.round((s.wins / s.totalBattles) * 100) : 0;
    return `${medal} <@${s.userId}> — **${s.wins}** wins (${winRate}% win rate, ${s.totalBattles} battles)`;
  }).join("\n");

  return new ContainerBuilder()
    .setAccentColor(0xF1C40F)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 🏆 Music Battle Arena Leaderboard — ${guild.name.slice(0, 30)}\n${list}`
      )
    );
}

async function startBattleFlow({ client, guild, channel, challenger, opponent, challengerSong, reply }) {
  if (opponent.id === challenger.id || opponent.bot) {
    return reply(warnPayload("You cannot challenge yourself or a bot!"));
  }

  const voiceChannel = guild.members.cache.get(challenger.id)?.voice?.channel;
  if (!voiceChannel) {
    return reply(warnPayload("You must be in a voice channel to start a battle!"));
  }

  const oppInVoice = voiceChannel.members.has(opponent.id);
  if (!oppInVoice) {
    return reply(warnPayload(`**${opponent.username}** must be in the same voice channel (<#${voiceChannel.id}>) to battle!`));
  }

  // 1. Search challenger's track
  let player = client.manager.players.get(guild.id);
  if (!player) {
    try {
      player = await client.manager.createPlayer({
        guildId: guild.id,
        voiceId: voiceChannel.id,
        textId: channel.id,
        volume: 80,
        deaf: true,
      });
      client.voiceHealthMonitor?.startMonitoring(player);
    } catch (e) {
      return reply(errorPayload(`Failed to connect to voice: ${e.message}`));
    }
  }

  const cRes = await player.search(challengerSong, { requester: challenger }).catch(() => null);
  const cTrack = cRes?.tracks?.[0];
  if (!cTrack) {
    return reply(errorPayload(`Could not find your song: "${challengerSong}". Try a different name.`));
  }

  // 2. Prompt opponent to accept and provide their track
  const inviteCard = new ContainerBuilder()
    .setAccentColor(0xE74C3C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ⚔️ Music Battle Challenge!\n` +
        `<@${challenger.id}> has challenged <@${opponent.id}> to a 1v1 Music Duel!\n\n` +
        `**Challenger Pick:** *[${cTrack.title.slice(0, 40)}](${cTrack.uri})*\n\n` +
        `<@${opponent.id}>, click **Accept Challenge** and reply in chat with your track title within 60s!`
      )
    );

  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("battle_accept")
      .setLabel("Accept Duel")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("battle_decline")
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
  );

  const inviteMsg = await reply({
    components: [inviteCard, inviteRow],
    flags: MessageFlags.IsComponentsV2,
  });

  const inviteCollector = inviteMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === opponent.id,
    time: 60000,
    max: 1,
  });

  inviteCollector.on("collect", async (interaction) => {
    if (interaction.customId === "battle_decline") {
      return interaction.update({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.info || "ℹ️"} Battle declined by <@${opponent.id}>.**`)
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await interaction.update({
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.check || "✅"} Challenge Accepted!** <@${opponent.id}>, type your song name in this channel now!`)
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const msgFilter = (m) => m.author.id === opponent.id && m.content.length > 1;
    const msgCollector = channel.createMessageCollector({ filter: msgFilter, time: 45000, max: 1 });

    msgCollector.on("collect", async (oppMsg) => {
      const oppQuery = oppMsg.content.trim();
      const oppRes = await player.search(oppQuery, { requester: opponent }).catch(() => null);
      const oppTrack = oppRes?.tracks?.[0];

      if (!oppTrack) {
        return channel.send({
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${client.emoji.cross || "❌"} Could not find "${oppQuery}". Battle cancelled.**`)
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      // 3. Commence Voting
      const votes = { challenger: new Set(), opponent: new Set() };

      const voteCard = () => {
        return new ContainerBuilder()
          .setAccentColor(0x3498DB)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### 🥊 Music Duel: Voting Open (45s)!\n` +
              `Who picked the superior track? Everyone in VC, cast your vote!\n\n` +
              `🟦 **Player 1 (<@${challenger.id}>):** [${cTrack.title.slice(0, 35)}](${cTrack.uri})\n` +
              `> Votes: **${votes.challenger.size}**\n\n` +
              `🟥 **Player 2 (<@${opponent.id}>):** [${oppTrack.title.slice(0, 35)}](${oppTrack.uri})\n` +
              `> Votes: **${votes.opponent.size}**`
            )
          );
      };

      const voteRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("vote_challenger")
          .setLabel(`Vote for ${challenger.username.slice(0, 15)} (${votes.challenger.size})`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("vote_opponent")
          .setLabel(`Vote for ${opponent.username.slice(0, 15)} (${votes.opponent.size})`)
          .setStyle(ButtonStyle.Danger)
      );

      // Play snippet of challenger's song
      await player.play(cTrack, { replaceCurrent: true }).catch(() => {});

      const battleMsg = await channel.send({
        components: [voteCard(), voteRow()],
        flags: MessageFlags.IsComponentsV2,
      });

      const voteCollector = battleMsg.createMessageComponentCollector({
        time: 45000,
      });

      voteCollector.on("collect", async (btnI) => {
        if (btnI.customId === "vote_challenger") {
          votes.opponent.delete(btnI.user.id);
          votes.challenger.add(btnI.user.id);
        } else if (btnI.customId === "vote_opponent") {
          votes.challenger.delete(btnI.user.id);
          votes.opponent.add(btnI.user.id);
        }
        await btnI.update({ components: [voteCard(), voteRow()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });

      voteCollector.on("end", async () => {
        let winner = null;
        let loser = null;

        if (votes.challenger.size > votes.opponent.size) {
          winner = challenger;
          loser = opponent;
        } else if (votes.opponent.size > votes.challenger.size) {
          winner = opponent;
          loser = challenger;
        }

        if (winner && loser) {
          await BattleScore.findOneAndUpdate(
            { guildId: guild.id, userId: winner.id },
            { $inc: { wins: 1, totalBattles: 1 }, $set: { updatedAt: new Date() } },
            { upsert: true }
          );
          await BattleScore.findOneAndUpdate(
            { guildId: guild.id, userId: loser.id },
            { $inc: { losses: 1, totalBattles: 1 }, $set: { updatedAt: new Date() } },
            { upsert: true }
          );
        }

        const winnerText = winner
          ? `🏆 **Winner: <@${winner.id}>!** Crowned the music taste champion with **${Math.max(votes.challenger.size, votes.opponent.size)}** votes!`
          : `🤝 **It's a Tie!** Both listeners earned **${votes.challenger.size}** votes!`;

        const endCard = new ContainerBuilder()
          .setAccentColor(winner ? 0x2ECC71 : 0x95A5A6)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### 🏁 Battle Concluded!\n\n` +
              `🟦 <@${challenger.id}>: **${votes.challenger.size}** votes\n` +
              `🟥 <@${opponent.id}>: **${votes.opponent.size}** votes\n\n` +
              `${winnerText}\n\n` +
              `-# Check rankings anytime with \`/challenge leaderboard:true\``
            )
          );

        await battleMsg.edit({ components: [endCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
    });
  });
}
