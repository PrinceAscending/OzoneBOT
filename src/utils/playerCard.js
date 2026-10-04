const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
} = require("discord.js");
const { artworkUrl, cleanAuthorName, progressBar, safeLinkLabel } = require("./presentation");
const { convertTime } = require("./convert");
const { container, separator, text } = require("./ui");

function requesterLine(track) {
  const requester = track?.requester;
  if (!requester) return "Unknown";
  const name = requester.username || requester.displayName || "Listener";
  return requester.id ? `[${name}](https://discord.com/users/${requester.id})` : name;
}

function safeButton({ customId, emoji, label, style = ButtonStyle.Secondary, disabled }) {
  const btn = new ButtonBuilder().setCustomId(customId).setStyle(style);
  let hasVisual = false;
  if (emoji && typeof emoji === "string" && emoji.length > 0) {
    try {
      btn.setEmoji(emoji);
      hasVisual = true;
    } catch {}
  }
  if (label) {
    btn.setLabel(label);
    hasVisual = true;
  }
  if (!hasVisual) {
    const fallbacks = {
      loop: "Loop",
      previous: "Prev",
      pause: "Pause",
      skip: "Skip",
      favourite: "Like",
      shuffle: "Mix",
      voldown: "Vol-",
      stop: "Stop",
      volup: "Vol+",
      node_selector: "Node",
    };
    btn.setLabel(fallbacks[customId] || customId);
  }
  if (disabled !== undefined) {
    btn.setDisabled(disabled);
  }
  return btn;
}

function controls(client, player, paused) {
  // Row 1: 5-Button Deck (Reference Image exact match: Loop, Prev, Pause/Play, Skip, Favourite)
  const row1 = new ActionRowBuilder().addComponents(
    safeButton({
      customId: "loop",
      emoji: client.emoji?.loop,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "previous",
      emoji: client.emoji?.previous,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "pause",
      emoji: paused ? client.emoji?.play : client.emoji?.pause,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "skip",
      emoji: client.emoji?.skip,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "favourite",
      emoji: client.emoji?.favourite || client.emoji?.like,
      style: ButtonStyle.Secondary,
    }),
  );

  // Row 2: 5-Button Deck (Reference Image exact match: Shuffle, Vol Down, Stop, Vol Up, Filters/Node)
  const row2 = new ActionRowBuilder().addComponents(
    safeButton({
      customId: "shuffle",
      emoji: client.emoji?.shuffle,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "voldown",
      emoji: client.emoji?.voldown,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "stop",
      emoji: client.emoji?.stop,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "volup",
      emoji: client.emoji?.volup,
      style: ButtonStyle.Secondary,
    }),
    safeButton({
      customId: "node_selector",
      emoji: client.emoji?.filters || client.emoji?.config,
      style: ButtonStyle.Secondary,
    }),
  );

  return [row1, row2];
}

function createPlayerCard(client, player, track, options = {}) {
  const paused = options.paused ?? Boolean(player.shoukaku?.paused);
  const position = typeof options.position === "number"
    ? options.position
    : player.shoukaku?.position;
  const title = safeLinkLabel(track.title, 52);
  const uri = track.uri || "https://discord.com";

  const heading = text(`## ${paused ? "Paused" : "Now playing"}\n### [${title}](${uri})`);
  const nodeName = player.node?.name || player.shoukaku?.node?.name || "Auto";
  const details = text(
    `**Artist**  [${safeLinkLabel(cleanAuthorName(track.author), 45)}](${uri})\n` +
    `**Requested by**  ${requesterLine(track)}\n` +
    `**Volume**  \`${Math.round(player.volume ?? 100)}%\`  •  **Queue**  \`${player.queue?.length || 0}\`  •  **Node**  \`${nodeName}\`` +
    (track?.isStream ? "  •  **LIVE**" : "") +
    (options.dashboardUrl ? `\n-# [Dashboard](${options.dashboardUrl})` : ""),
  );
  const artwork = artworkUrl(track);
  // Pure Obsidian Dark theme by default (0x0A0B0E)
  const cardColor = options.accentColor || player?.data?.get("accentColor") || 0x0A0B0E;
  const card = container(cardColor);
  if (options.bannerName) {
    card
      .addTextDisplayComponents(text(`## ${paused ? "Paused" : "Now playing"}`))
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${options.bannerName}`)
          .setDescription(`${title} artwork banner`),
      ))
      .addTextDisplayComponents(text(`### [${title}](${uri})`), details);
  } else if (artwork) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(heading, details)
      .setThumbnailAccessory((thumbnail) => thumbnail.setURL(artwork));
    card.addSectionComponents(section);
  } else {
    card.addTextDisplayComponents(heading, details);
  }

  // Only render text progress bar if canvas banner is NOT present (canvas banner has embedded scrub bar & timestamps)
  if (!options.bannerName && typeof position === "number" && position >= 0 && !track?.isStream) {
    const duration = track.length || 0;
    card.addTextDisplayComponents(text(
      `${progressBar(position, duration)} \`${convertTime(position)}\` / \`${convertTime(duration)}\``,
    ));
  }
  if (options.controls) {
    return [card, ...controls(client, player, paused)];
  }

  return card;
}

module.exports = { createPlayerCard, controls };
