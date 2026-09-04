const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { convertTime } = require("../../utils/convert");
const { safeLinkLabel } = require("../../utils/presentation");
const { container, noticePayload, separator, text } = require("../../utils/ui");

const PAGE_SIZE = 10;

function durationLabel(milliseconds) {
  return milliseconds > 0 ? convertTime(milliseconds) : "LIVE";
}

function navigation(client, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("queue:first")
      .setEmoji(client.emoji.previous)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue:previous")
      .setEmoji(client.emoji.previous)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue:page")
      .setLabel(`${page + 1} / ${pageCount}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("queue:next")
      .setEmoji(client.emoji.play)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
    new ButtonBuilder()
      .setCustomId("queue:last")
      .setEmoji(client.emoji.skip)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
  );
}

// Renders the queue card for one page. The page index is persisted on the
// player (player.data "queuePage", default 0) so every render — including the
// pagination buttons dispatched from interactionCreate.js — clamps to the
// current queue size and stores the corrected page back.
function queueCard(client, player) {
  const current = player.queue.current;
  const upcoming = [...player.queue];
  const pageCount = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const rawPage = Number(player.data.get("queuePage")) || 0;
  const page = Math.min(Math.max(rawPage, 0), pageCount - 1);
  player.data.set("queuePage", page);
  const start = page * PAGE_SIZE;
  const tracks = upcoming.slice(start, start + PAGE_SIZE);
  const totalDuration = [current, ...upcoming].reduce((sum, track) => sum + (Number(track?.length) || 0), 0);

  const currentLine = `### [${safeLinkLabel(current.title, 64)}](${current.uri})\n` +
    `-# ${safeLinkLabel(current.author || "Unknown Artist", 50)} · ${durationLabel(current.length)}`;
  const upcomingLines = tracks.length
    ? tracks.map((track, index) => {
      const number = String(start + index + 1).padStart(2, "0");
      return `\`${number}\` **[${safeLinkLabel(track.title, 54)}](${track.uri})**  ·  \`${durationLabel(track.length)}\``;
    }).join("\n")
    : "-# The queue is empty. Add another track with the play command.";

  const card = container()
    .addTextDisplayComponents(text(
      `## Queue\n-# ${upcoming.length} upcoming · ${durationLabel(totalDuration)} total · Volume ${Math.round(player.volume ?? 100)}%`,
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**NOW PLAYING**\n${currentLine}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**UP NEXT**\n${upcomingLines}`));

  if (pageCount > 1) {
    card.addSeparatorComponents(separator()).addActionRowComponents(navigation(client, page, pageCount));
  }
  return { card, page, pageCount };
}

module.exports = {
  name: "queue",
  aliases: ["q", "list"],
  category: "Music",
  description: "Browse the current track and upcoming queue",
  cooldown: 3,
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const wrapper = {
      guild: interaction.guild,
      author: interaction.user,
      reply: async (options) => {
        if (interaction.replied || interaction.deferred) await interaction.editReply(options);
        else await interaction.reply(options);
        return interaction.fetchReply();
      },
    };
    return this.execute(wrapper, [], client);
  },

  async execute(message, _args, client) {
    const player = client.manager.players.get(message.guild.id);
    if (!player?.queue?.current) {
      return message.reply(noticePayload({
        title: "The queue is empty",
        description: "Use the play command to add the first track.",
        emoji: client.emoji.info,
        tone: "info",
      }));
    }

    // Page state lives on the player (player.data "queuePage"); queueCard
    // clamps it to the current queue size and stores it back. Pagination
    // buttons are dispatched centrally in interactionCreate.js.
    const view = queueCard(client, player);
    return message.reply({
      components: [view.card],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};

// Reused by interactionCreate.js to re-render the queue view when its
// pagination buttons are pressed.
module.exports.queueCard = queueCard;
