const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const { formatCommandHelp } = require("../../utils/commandHelp");

const URL_REGEX = /^https?:\/\//i;
const URL_HOSTS = ["youtube.com", "youtu.be", "spotify.com", "music.apple.com", "deezer.com", "jiosaavn.com"];

function isUrl(value) {
  if (URL_REGEX.test(value)) return true;
  try {
    const host = new URL(value.startsWith("http") ? value : `http://${value}`).hostname.toLowerCase();
    return URL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function notice({ client, emoji, text }) {
  const display = new TextDisplayBuilder().setContent(`**${emoji} ${text}**`);
  return new ContainerBuilder().addTextDisplayComponents(display);
}

module.exports = {
  name: "search",
  description: "Search for a song and pick from the results",
  category: "Music",
  cooldown: 5,
  args: true,
  usage: "<query>",
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,

  slashOptions: [
    {
      name: "query",
      description: "The song or URL you want to search for",
      type: 3,
      required: true,
    },
  ],

  async slashExecute(interaction, client) {
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(options);
        }
        return await interaction.reply(options);
      },
    };
    const prefix = client.prefix || ".";
    return this.execute(wrapper, [interaction.options.getString("query")], client, prefix);
  },

  async execute(message, args, client, prefix) {
    const query = args.join(" ").trim();
    if (!query) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    if (isUrl(query)) {
      return message.reply({
        components: [notice({
          client,
          emoji: client.emoji.info,
          text: `That's a direct URL — use \`${prefix}play ${query}\` to load it.`,
        })],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const player = client.manager.players.get(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply({
        components: [notice({
          client,
          emoji: client.emoji.warn,
          text: "Join a voice channel and play something first so I know which player to attach results to.",
        })],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const loadingDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.info} Searching for \`${query}\`...**`);
    const loadingContainer = new ContainerBuilder()
      .addTextDisplayComponents(loadingDisplay);

    const loadingMsg = await message.reply({
      components: [loadingContainer],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => message.channel.send({
      components: [loadingContainer],
      flags: MessageFlags.IsComponentsV2,
    }));

    let searchResult;
    try {
      searchResult = await player.search(query, {
        requester: message.author,
        engine: "ytmsearch",
      });
    } catch (error) {
      client.logger?.log?.(`[Search] ${error.message}`, "warn");
      searchResult = { tracks: [] };
    }

    const tracks = (searchResult?.tracks || []).slice(0, 10);
    if (!tracks.length) {
      return loadingMsg.edit({
        components: [notice({
          client,
          emoji: client.emoji.cross,
          text: `No results found for \`${query}\`.`,
        })],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const header = new TextDisplayBuilder()
      .setContent(`**${client.emoji.info} Search results for \`${query}\`**`);

    const separator = new SeparatorBuilder();

    const list = tracks.map((track, i) =>
      `**\`${i + 1}\` | [${track.title}](${track.uri})** \`${convertTime(track.length)}\``
    ).join("\n");
    const listDisplay = new TextDisplayBuilder().setContent(list);

    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("search_pick")
        .setPlaceholder("Pick a track to add to the queue")
        .addOptions(tracks.map((track, i) => ({
          label: `${i + 1}. ${track.title.substring(0, 90)}`,
          description: convertTime(track.length),
          value: String(i),
        })))
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("search_play_all")
        .setLabel("Add all to queue")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("search_close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(separator)
      .addTextDisplayComponents(listDisplay)
      .addActionRowComponents(select)
      .addActionRowComponents(buttons);

    const msg = await loadingMsg.edit({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      idle: 60_000,
      // Hard cap: idle-only collectors could live forever while a user kept
      // clicking, re-queuing duplicate copies of the same track.
      time: 10 * 60_000,
    });

    const enqueueTrack = async (track, editMsg = true) => {
      track.requester = track.requester || message.author;
      player.queue.add(track);
      try {
        if (!player.playing && !player.paused) await player.play();
      } catch (e) {
        client.logger?.log?.(`[Search] play() failed: ${e.message}`, "warn");
      }
      if (editMsg) {
        await msg.edit({
          components: [notice({
            client,
            emoji: client.emoji.check,
            text: `Queued [${track.title}](${track.uri})`,
          })],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    };

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "search_pick") {
        await interaction.deferUpdate();
        const idx = Number(interaction.values?.[0]);
        const track = tracks[idx];
        if (track) await enqueueTrack(track);
      } else if (interaction.customId === "search_play_all") {
        await interaction.deferUpdate();
        for (const track of tracks) await enqueueTrack(track, false);
        await msg.edit({
          components: [notice({
            client,
            emoji: client.emoji.check,
            text: `Queued **${tracks.length}** tracks from \`${query}\`.`,
          })],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      } else if (interaction.customId === "search_close") {
        await interaction.deferUpdate().catch(() => {});
        await msg.delete().catch(() => {});
        collector.stop("closed");
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "closed" || reason === "manual") return;
      await msg.edit({
        components: [notice({
          client,
          emoji: client.emoji.info,
          text: "Search session timed out. Run the command again to start over.",
        })],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
