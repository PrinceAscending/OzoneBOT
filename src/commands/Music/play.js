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
const { formatCommandHelp } = require("../../utils/commandHelp");
const { cleanBotReply } = require("../../utils/autoClean");
const { safeDestroyPlayer } = require("../../utils/playerUtils");

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
      return `https://i.ytimg.com/vi/${videoIdMatch[1]}/hqdefault.jpg`;
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
  const nodesAvailable = await hasAvailableNodes(client.manager, 7000);
  if (!nodesAvailable) {
    return reply(errorPayload("The music server is currently unavailable. Please try again in a few moments."));
  }

  const safeReply = async (payload) => {
    try {
      return await reply(payload);
    } catch {
      if (textChannel && typeof textChannel.send === "function") {
        return await textChannel.send(payload).catch(() => null);
      }
      return null;
    }
  };

  const userPref = await UserPreferences.findOne({ userId: user.id }).lean().catch(() => null);
  const preferredNode = userPref?.preferredNode && userPref.preferredNode !== "auto" ? userPref.preferredNode : undefined;

  let player = client.manager.players.get(guild.id);

  if (!player) {
    try {
      player = await client.manager.createPlayer({
        guildId: guild.id,
        voiceId: voiceChannel.id,
        textId: textChannel.id,
        volume: 80,
        deaf: true,
        shardId: guild.shardId,
        nodeName: preferredNode,
      });

      try {
        client.voiceHealthMonitor?.startMonitoring(player);
      } catch {}
    } catch (createError) {
      client.logger?.log(`[Play] Player creation error: ${createError.message}`, "error");

      if (createError.status === 404 && createError.message?.includes("Session not found")) {
        const stale = client.manager.players.get(guild.id);
        if (stale) {
          await safeDestroyPlayer(stale);
        }
        await new Promise((r) => setTimeout(r, 600));
        player = await client.manager.createPlayer({
          guildId: guild.id,
          voiceId: voiceChannel.id,
          textId: textChannel.id,
          volume: 80,
          deaf: true,
          shardId: guild.shardId,
        });
        client.voiceHealthMonitor?.startMonitoring(player);
      } else {
        return safeReply(errorPayload(`Voice connection failed: ${createError.message || "Unknown error"}`));
      }
    }
  } else {
    if (player.voiceId !== voiceChannel.id) {
      return safeReply(warnPayload(`I'm already connected to a different voice channel (<#${player.voiceId}>).`));
    }
    if (player.textId !== textChannel.id) {
      player.textId = textChannel.id;
    }
  }

  const isUrl = /^https?:\/\//.test(query);
  const searchEngine = isUrl
    ? undefined
    : (player.data?.get("sessionSource") || userPref?.musicSource || client.config?.node_source || "ytmsearch");

  if (!isUrl && !player.data?.get("sessionSource")) {
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
    return safeReply(errorPayload(`No results found for "${truncateTitle(query, 50)}"`));
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

    const plReply = await safeReply(successPayload(`Queued \`${searchResult.tracks.length}\` tracks from **${searchResult.playlistName || "Playlist"}**`));
    cleanBotReply(plReply, guild.id, 12);
    return plReply;
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

  const activeNode = player.node?.name || player.shoukaku?.node?.name || "Auto";
  const infoDisplay = new TextDisplayBuilder()
    .setContent(
      `> - **Artist:** [${cleanAuthorName(track.author)}](${track.uri})\n` +
      `> - **Duration:** \`${convertTime(track.length)}\`\n` +
      `> - **Requester:** [${user.username}](https://discord.com/users/${user.id})\n` +
      `> - **Node:** \`${activeNode}\` • **Position:** \`${position}\``
    );

  const section = new SectionBuilder()
    .addTextDisplayComponents(titleDisplay, infoDisplay);

  const cleanThumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  if (cleanThumbnail) {
    section.setThumbnailAccessory((thumbnail) => thumbnail.setURL(cleanThumbnail));
  }

  const container = new ContainerBuilder().setAccentColor(0x0A0B0E).addSectionComponents(section);

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

  const replyMsg = await safeReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  if (position === 0) {
    cleanBotReply(replyMsg, guild.id, 8);
  }

  if (position > 0 && replyMsg && typeof replyMsg.createMessageComponentCollector === "function") {
    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === user.id,
      time: 60000,
    });

    let actionTaken = false;

    collector.on("collect", async (buttonInteraction) => {
      if (!buttonInteraction.member?.voice?.channel || buttonInteraction.member.voice.channel.id !== player.voiceId) {
        return buttonInteraction.reply({
          content: `**${client.emoji.warn || ""} You must be in my voice channel to use this.**`.trim(),
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
          cleanBotReply(replyMsg, guild.id, 6);
        } else {
          await buttonInteraction.reply({
            content: `**${client.emoji.cross || ""} This track is no longer in the queue.**`.trim(),
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
          cleanBotReply(replyMsg, guild.id, 6);
        } else {
          await buttonInteraction.reply({
            content: `**${client.emoji.cross || ""} This track is no longer in the queue.**`.trim(),
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    });

    collector.on("end", () => {
      cleanBotReply(replyMsg, guild.id, 5);
    });
  }
}

module.exports = {
  name: "play",
  category: "Music",
  aliases: ["p"],
  cooldown: 3,
  keepAlive: true,
  description: "Plays a song or playlist in your voice channel.",
  args: true,
  usage: "<song name | URL>",
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
      return message.reply(formatCommandHelp(this, message.author, prefix));
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
