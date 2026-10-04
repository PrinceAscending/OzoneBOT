const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const lyricsFinder = require("@flytri/lyrics-finder");
const { errorPayload, warnPayload } = require("../../utils/responses");

function cleanLyrics(text) {
  if (!text) return "";
  return text.replace(/\[(Chorus|Verse|Bridge|Intro|Outro|Hook)[^\]]*\]/gi, "\n**$1:**\n");
}

module.exports = {
  name: "singalong",
  aliases: ["karaoke", "sing"],
  category: "Music",
  description: "Interactive live lyrics and karaoke viewer with verse navigation.",
  cooldown: 5,
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: false,
  botPerms: ["EmbedLinks"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const player = client.manager.players.get(interaction.guild.id);
    const track = player?.queue?.current;
    if (!track) {
      return interaction.editReply(warnPayload("Nothing is playing right now to sing along to!"));
    }

    return handleSingalong({
      client,
      player,
      track,
      user: interaction.user,
      reply: (opts) => interaction.editReply(opts),
    });
  },

  async execute(message, _args, client) {
    const player = client.manager.players.get(message.guild.id);
    const track = player?.queue?.current;
    if (!track) {
      return message.reply(warnPayload("Nothing is playing right now to sing along to!"));
    }

    return handleSingalong({
      client,
      player,
      track,
      user: message.author,
      reply: (opts) => message.reply(opts),
    });
  },
};

async function handleSingalong({ client, player, track, user, reply }) {
  let rawLyrics = null;
  try {
    rawLyrics = await lyricsFinder(track.author, track.title);
  } catch {}

  if (!rawLyrics) {
    try {
      rawLyrics = await lyricsFinder("", track.title);
    } catch {}
  }

  if (!rawLyrics) {
    return reply(errorPayload(`Could not find lyrics for **${track.title.slice(0, 50)}**.`));
  }

  const cleaned = cleanLyrics(rawLyrics);
  const CHUNK_SIZE = 1200;
  const pages = [];
  let remaining = cleaned;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      pages.push(remaining.trim());
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n\n", CHUNK_SIZE);
    if (splitIdx === -1) splitIdx = remaining.lastIndexOf("\n", CHUNK_SIZE);
    if (splitIdx === -1) splitIdx = CHUNK_SIZE;

    pages.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  let currentPage = 0;

  function renderCard(pageIdx) {
    const textContent =
      `### Karaoke Singalong — [${track.title.slice(0, 45)}](${track.uri})\n` +
      `-# Artist: ${track.author} • Page ${pageIdx + 1}/${pages.length}\n\n` +
      pages[pageIdx];

    const card = new ContainerBuilder()
      .setAccentColor(0x0A0B0E)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));

    if (pages.length > 1) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("sing_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx === 0),
        new ButtonBuilder()
          .setCustomId("sing_page")
          .setLabel(`${pageIdx + 1} / ${pages.length}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("sing_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx >= pages.length - 1)
      );
      card.addSeparatorComponents(new SeparatorBuilder());
      card.addActionRowComponents(row);
    }

    return card;
  }

  const msg = await reply({
    components: [renderCard(currentPage)],
    flags: MessageFlags.IsComponentsV2,
  });

  if (pages.length > 1 && msg && typeof msg.createMessageComponentCollector === "function") {
    const collector = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === user.id,
      time: 300000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "sing_prev" && currentPage > 0) {
        currentPage--;
        await i.update({ components: [renderCard(currentPage)], flags: MessageFlags.IsComponentsV2 });
      } else if (i.customId === "sing_next" && currentPage < pages.length - 1) {
        currentPage++;
        await i.update({ components: [renderCard(currentPage)], flags: MessageFlags.IsComponentsV2 });
      }
    });

    collector.on("end", () => {
      const finalCard = renderCard(currentPage);
      msg.edit({ components: [finalCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  }
}
