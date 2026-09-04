const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const { handleSongAutocomplete } = require("../../utils/songAutocomplete");
const { convertTime } = require("../../utils/convert");
const { errorPayload, warnPayload, successPayload } = require("../../utils/responses");

function cleanAuthorName(author) {
  if (!author) return "Unknown Artist";
  return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
}

function truncateTitle(title, maxLength = 35) {
  if (!title) return "Unknown Title";
  if (title.length <= maxLength) return title;
  return `${title.substring(0, maxLength)}...`;
}

function getCleanThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  if (thumbnailUrl.includes("i.ytimg.com") || thumbnailUrl.includes("img.youtube.com")) {
    const videoIdMatch = thumbnailUrl.match(/vi\/([^/]+)\//);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
    }
  }
  return thumbnailUrl;
}

async function executePlayFlow({ client, guild, voiceChannel, textChannel, user, query, reply }) {
  if (!voiceChannel) {
    return reply(warnPayload("You need to be in a voice channel first."));
  }

  const me = guild.members.me;
  if (!me?.permissions.has([PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak])) {
    return reply(warnPayload("I don't have enough permissions! Please give me `CONNECT` and `SPEAK` in this server."));
  }

  const { hasAvailableNodes } = require("../../utils/nodeUtils");
  if (!hasAvailableNodes(client.manager)) {
    return reply(errorPayload("The music server is currently unavailable. Please try again in a few moments."));
  }

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

      try {
        client.voiceHealthMonitor?.startMonitoring(player);
      } catch {}
    } catch (createError) {
      client.logger?.log(`[Play] Player creation error: ${createError.message}`, "error");

      if (createError.status === 404 && createError.message?.includes("Session not found")) {
        if (client.manager.players.has(guild.id)) {
          client.manager.players.delete(guild.id);
        }
        await new Promise((r) => setTimeout(r, 500));
        player = await client.manager.createPlayer({
          guildId: guild.id,
          voiceId: voiceChannel.id,
          textId: textChannel.id,
          volume: 80,
          deaf: true,
        });
        client.voiceHealthMonitor?.startMonitoring(player);
      } else {
        return reply(errorPayload(`Voice connection failed: ${createError.message || "Unknown error"}`));
      }
    }
  } else {
    if (player.voiceId !== voiceChannel.id) {
      return reply(warnPayload(`I'm already connected to a different voice channel (<#${player.voiceId}>).`));
    }
    if (player.textId !== textChannel.id) {
      player.textId = textChannel.id;
    }
  }

  const isUrl = /^https?:\/\//.test(query);
  let editReply = reply;
  let searchEngine = isUrl ? undefined : player.data?.get("sessionSource");

  if (!isUrl && !searchEngine) {
    const sourceList = [
      { label: "YouTube Music", value: "ytmsearch", description: "Search & stream from YouTube Music", emojiKey: "ytmusic" },
      { label: "YouTube", value: "ytsearch", description: "Search & stream directly from YouTube", emojiKey: "youtube" },
      { label: "Spotify", value: "spsearch", description: "Search tracks via Spotify", emojiKey: "spotify" },
      { label: "Apple Music", value: "amsearch", description: "Search tracks via Apple Music", emojiKey: "applemusic" },
      { label: "Deezer", value: "dzsearch", description: "Search tracks via Deezer", emojiKey: "deezer" },
      { label: "JioSaavn", value: "jssearch", description: "Search tracks via JioSaavn", emojiKey: "jiosaavn" },
    ];

    const sourceOptions = sourceList.map((opt) => {
      const item = { label: opt.label, value: opt.value, description: opt.description };
      const em = client.emoji?.resolvable?.(opt.emojiKey);
      if (em) item.emoji = em;
      return item;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`session_src_${user.id}_${Date.now()}`)
      .setPlaceholder("Choose a music source for this player session...")
      .addOptions(sourceOptions);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const promptContainer = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${client.emoji?.music || "🎵"} Choose Music Source for this Session\n` +
          `> Please select your preferred platform for **${guild.name}**.\n` +
          `> *This choice will be remembered for the rest of this session!*`
        )
      )
      .addActionRowComponents(selectRow);

    const promptMsg = await reply({
      components: [promptContainer],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);

    if (promptMsg && typeof promptMsg.edit === "function") {
      editReply = (opts) => promptMsg.edit(opts);
    }

    if (promptMsg && typeof promptMsg.awaitMessageComponent === "function") {
      try {
        const selection = await promptMsg.awaitMessageComponent({
          filter: (i) => i.user.id === user.id,
          componentType: ComponentType.StringSelect,
          time: 30000,
        });
        searchEngine = selection.values[0];
        await selection.deferUpdate().catch(() => {});
      } catch {
        try {
          const userPref = await UserPreferences.findOne({ userId: user.id });
          searchEngine = userPref?.musicSource || client.config?.node_source || "ytmsearch";
        } catch {
          searchEngine = client.config?.node_source || "ytmsearch";
        }
      }
    } else {
      try {
        const userPref = await UserPreferences.findOne({ userId: user.id });
        searchEngine = userPref?.musicSource || client.config?.node_source || "ytmsearch";
      } catch {
        searchEngine = client.config?.node_source || "ytmsearch";
      }
    }

    player.data?.set("sessionSource", searchEngine);
  }

  let searchResult;
  try {
    searchResult = await player.search(query, {
      requester: user,
      engine: isUrl ? undefined : searchEngine,
    });
  } catch (searchError) {
    const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");
    if (await handleSessionError(searchError, player, client)) {
      try {
        player = await recreatePlayer(client, guild.id, voiceChannel.id, textChannel.id);
        if (searchEngine) player.data?.set("sessionSource", searchEngine);
        searchResult = await player.search(query, {
          requester: user,
          engine: isUrl ? undefined : searchEngine,
        });
      } catch {
        searchResult = { tracks: [] };
      }
    } else {
      searchResult = { tracks: [] };
    }
  }

  if (!searchResult?.tracks?.length && !isUrl && searchEngine !== "ytsearch") {
    try {
      searchResult = await player.search(query, {
        requester: user,
        engine: "ytsearch",
      });
    } catch {
      searchResult = { tracks: [] };
    }
  }

  if (!searchResult?.tracks?.length) {
    return editReply(errorPayload(`No results found for "${truncateTitle(query, 50)}"`));
  }

  const currentQueueSize = player.queue.length;
  const isPlaying = player.playing || player.paused;

  if (searchResult.type === "PLAYLIST") {
    for (const track of searchResult.tracks) {
      player.queue.add(track);
    }

    if (!player.playing && !player.paused) {
      try {
        await player.play();
      } catch (e) {
        client.logger?.log(`[Play] Failed to start playlist playback: ${e.message}`, "error");
      }
    }

    return editReply(successPayload(`Queued \`${searchResult.tracks.length}\` tracks from **${searchResult.playlistName || "Playlist"}**`));
  }

  const track = searchResult.tracks[0];
  const position = currentQueueSize + (isPlaying ? 1 : 0);
  player.queue.add(track);

  if (!player.playing && !player.paused) {
    try {
      await player.play();
    } catch (e) {
      client.logger?.log(`[Play] Failed to start playback: ${e.message}`, "error");
    }
  }

  const titleDisplay = new TextDisplayBuilder()
    .setContent(`### Enqueued [${truncateTitle(track.title, 45)}](${track.uri})`);

  const infoDisplay = new TextDisplayBuilder()
    .setContent(
      `> - **Author:** [${cleanAuthorName(track.author)}](${track.uri})\n` +
      `> - **Duration:** \`${convertTime(track.length)}\`\n` +
      `> - **Requester:** [${user.username}](https://discord.com/users/${user.id})\n` +
      `> - **Position:** \`${position}\``
    );

  const section = new SectionBuilder()
    .addTextDisplayComponents(titleDisplay, infoDisplay);

  const cleanThumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  if (cleanThumbnail) {
    section.setThumbnailAccessory((thumbnail) => thumbnail.setURL(cleanThumbnail));
  }

  const container = new ContainerBuilder().addSectionComponents(section);

  if (position > 0) {
    const removeButton = new ButtonBuilder()
      .setCustomId(`remove_${track.identifier}_${position}`)
      .setLabel("Remove")
      .setStyle(ButtonStyle.Danger);

    const playNextButton = new ButtonBuilder()
      .setCustomId(`playnext_${track.identifier}_${position}`)
      .setLabel("Play Next")
      .setStyle(ButtonStyle.Success)
      .setDisabled(position === 1);

    const buttonRow = new ActionRowBuilder().addComponents(removeButton, playNextButton);
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(buttonRow);
  }

  const replyMsg = await editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  if (position > 0 && replyMsg && typeof replyMsg.createMessageComponentCollector === "function") {
    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === user.id,
      time: 180000,
    });

    let actionTaken = false;

    collector.on("collect", async (buttonInteraction) => {
      if (!buttonInteraction.member?.voice?.channel || buttonInteraction.member.voice.channel.id !== player.voiceId) {
        return buttonInteraction.reply({
          content: `**${client.emoji.warn || "⚠️"} You must be in my voice channel to use this.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const parts = buttonInteraction.customId.split("_");
      const action = parts[0];
      const identifier = parts.slice(1, -1).join("_") || parts[1];

      if (action === "remove") {
        const trackIndex = player.queue?.findIndex((t) => t.identifier === identifier) ?? -1;
        if (trackIndex !== -1) {
          const removedTrack = player.queue[trackIndex];
          player.queue.splice(trackIndex, 1);
          actionTaken = true;
          await buttonInteraction.update(successPayload(`Removed [${truncateTitle(removedTrack.title, 40)}](${removedTrack.uri}) from the queue.`)).catch(() => {});
        } else {
          await buttonInteraction.reply({
            content: `**${client.emoji.cross || "❌"} This track is no longer in the queue.**`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (action === "playnext") {
        const trackIndex = player.queue?.findIndex((t) => t.identifier === identifier) ?? -1;
        if (trackIndex !== -1) {
          const trackToMove = player.queue[trackIndex];
          player.queue.splice(trackIndex, 1);
          player.queue.unshift(trackToMove);
          actionTaken = true;
          await buttonInteraction.update(successPayload(`Moved [${truncateTitle(trackToMove.title, 40)}](${trackToMove.uri}) to play next.`)).catch(() => {});
        } else {
          await buttonInteraction.reply({
            content: `**${client.emoji.cross || "❌"} This track is no longer in the queue.**`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    });

    collector.on("end", () => {
      if (!actionTaken && replyMsg) {
        const plainContainer = new ContainerBuilder().addSectionComponents(section);
        replyMsg.edit({
          components: [plainContainer],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    });
  }
}

module.exports = {
  name: "play",
  category: "Music",
  aliases: ["p"],
  cooldown: 3,
  description: "Plays a song or playlist in your voice channel.",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],

  slashOptions: [
    {
      name: "song",
      description: "Song name, artist, or URL to play",
      type: 3,
      required: true,
      autocomplete: true,
    },
  ],

  autocomplete: (interaction, client) => handleSongAutocomplete(interaction, client),

  async slashExecute(interaction, client) {
    const query = interaction.options.getString("song");
    await interaction.deferReply().catch(() => {});

    return executePlayFlow({
      client,
      guild: interaction.guild,
      voiceChannel: interaction.member?.voice?.channel,
      textChannel: interaction.channel,
      user: interaction.user,
      query,
      reply: (opts) => interaction.editReply(opts),
    });
  },

  async execute(message, args, client, prefix) {
    const query = args.join(" ").trim();
    if (!query) {
      const usage = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.dot || "•"} Usage:** \`${prefix}play [Song Name / URL]\`\n` +
          `**${client.emoji.dot || "•"} Example:** \`${prefix}play believer\``
        )
      );
      return message.reply({ components: [usage], flags: MessageFlags.IsComponentsV2 });
    }

    return executePlayFlow({
      client,
      guild: message.guild,
      voiceChannel: message.member?.voice?.channel,
      textChannel: message.channel,
      user: message.author,
      query,
      reply: (opts) => message.reply(opts),
    });
  },
};
