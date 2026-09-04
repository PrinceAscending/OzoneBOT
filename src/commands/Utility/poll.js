const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const POLL_DURATION = 60_000;

/* Parse "Question | Option A | Option B | ..." into { question, options }.
   Requires a question plus 2-10 options. */
function parsePoll(input) {
  const parts = String(input || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const question = parts[0];
  const options = parts.slice(1);
  if (options.length > 10) return null;
  return { question, options };
}

function countVotes(votes, optionCount) {
  const counts = new Array(optionCount).fill(0);
  for (const index of votes.values()) {
    if (index >= 0 && index < optionCount) counts[index]++;
  }
  return counts;
}

function buildPollContainer(client, question, options, votes) {
  const counts = countVotes(votes, options.length);
  const questionDisplay = new TextDisplayBuilder()
    .setContent(
      `### ${client.emoji.dot} ${question}\n` +
      `> Vote by pressing a button below — one vote per person. Poll closes in \`60s\`.`
    );

  const container = new ContainerBuilder().addTextDisplayComponents(questionDisplay);

  let row = new ActionRowBuilder();
  options.forEach((option, i) => {
    const label = `${EMOJI_NUMBERS[i]} ${option}${counts[i] ? ` (${counts[i]})` : ""}`;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pollvote_${i}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
    );
    if (row.components.length === 5) {
      container.addActionRowComponents(row);
      row = new ActionRowBuilder();
    }
  });
  if (row.components.length) {
    container.addActionRowComponents(row);
  }

  return container;
}

function buildResultsDisplay(client, question, options, votes) {
  const counts = countVotes(votes, options.length);
  const total = votes.size;
  const max = Math.max(...counts, 1);

  const lines = options.map((option, i) => {
    const filled = Math.round((counts[i] / max) * 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    return `> ${EMOJI_NUMBERS[i]} **${option}** — \`${counts[i]}\` vote${counts[i] === 1 ? "" : "s"} \`${bar}\``;
  });

  return new TextDisplayBuilder()
    .setContent(
      `### ${client.emoji.check} Poll Results — ${question}\n` +
      lines.join("\n") +
      `\n> **${total}** total vote${total === 1 ? "" : "s"}`
    );
}

module.exports = {
  name: "poll",
  aliases: ["vote"],
  category: "Utility",
  cooldown: 5,
  description: "Creates a quick 60-second poll. Format: Question | Option A | Option B (2-10 options).",
  args: true,
  usage: "<Question> | <Option A> | <Option B> ...",
  userPerms: [],
  owner: false,
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [
    {
      name: "question",
      description: "The poll question",
      type: 3,
      required: true,
    },
    {
      name: "options",
      description: "Pipe-separated options, e.g. Option A | Option B | Option C",
      type: 3,
      required: true,
    },
  ],

  async slashExecute(interaction, client) {
    const question = interaction.options.getString("question");
    const optionsRaw = interaction.options.getString("options");
    const parsed = parsePoll(`${question} | ${optionsRaw}`);

    if (!parsed) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(
          `**${client.emoji.warn} Invalid poll format**\n` +
          `**Usage** \`:\` \`/poll <Question> | <Option A> | <Option B>\`\n` +
          `**Options** \`:\` \`2-10\`, separated by \`|\``
        );
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const votes = new Map();
    await interaction.reply({
      components: [buildPollContainer(client, parsed.question, parsed.options, votes)],
      flags: MessageFlags.IsComponentsV2,
    });

    let replyMsg;
    try {
      replyMsg = await interaction.fetchReply();
    } catch (error) {
      console.error("Failed to fetch poll reply:", error);
      return;
    }

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.isButton() && i.customId.startsWith("pollvote_"),
      time: POLL_DURATION,
    });

    collector.on("collect", async (buttonInteraction) => {
      const index = parseInt(buttonInteraction.customId.split("_")[1], 10);

      if (votes.has(buttonInteraction.user.id)) {
        return buttonInteraction.reply({
          content: `**${client.emoji.warn} You already voted!**`,
          ephemeral: true,
        });
      }

      votes.set(buttonInteraction.user.id, index);

      await buttonInteraction.deferUpdate().catch(() => {});
      await buttonInteraction.message
        .edit({
          components: [buildPollContainer(client, parsed.question, parsed.options, votes)],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    });

    collector.on("end", () => {
      if (replyMsg && !replyMsg.deleted) {
        replyMsg
          .edit({
            components: [buildResultsDisplay(client, parsed.question, parsed.options, votes)],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      }
    });
  },

  async execute(message, args, client, prefix) {
    const parsed = parsePoll(args.join(" "));

    if (!parsed) {
      const usageDisplay = new TextDisplayBuilder()
        .setContent(
          `**${client.emoji.warn} Invalid poll format**\n` +
          `**Usage** \`:\` \`${prefix}poll <Question> | <Option A> | <Option B>\`\n` +
          `**Example** \`:\` \`${prefix}poll Best song? | Believer | Thunder | Radioactive\`\n` +
          `**Options** \`:\` \`2-10\`, separated by \`|\``
        );
      const container = new ContainerBuilder().addTextDisplayComponents(usageDisplay);
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const votes = new Map();

    let replyMsg;
    try {
      replyMsg = await message.reply({
        components: [buildPollContainer(client, parsed.question, parsed.options, votes)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      try {
        replyMsg = await message.channel.send({
          components: [buildPollContainer(client, parsed.question, parsed.options, votes)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (sendError) {
        console.error("Failed to send poll:", sendError);
        return;
      }
    }

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.isButton() && i.customId.startsWith("pollvote_"),
      time: POLL_DURATION,
    });

    collector.on("collect", async (buttonInteraction) => {
      const index = parseInt(buttonInteraction.customId.split("_")[1], 10);

      if (votes.has(buttonInteraction.user.id)) {
        return buttonInteraction.reply({
          content: `**${client.emoji.warn} You already voted!**`,
          ephemeral: true,
        });
      }

      votes.set(buttonInteraction.user.id, index);

      await buttonInteraction.deferUpdate().catch(() => {});
      await buttonInteraction.message
        .edit({
          components: [buildPollContainer(client, parsed.question, parsed.options, votes)],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    });

    collector.on("end", () => {
      if (replyMsg && !replyMsg.deleted) {
        replyMsg
          .edit({
            components: [buildResultsDisplay(client, parsed.question, parsed.options, votes)],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      }
    });
  },
};