const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const { handleSongAutocomplete } = require("../../utils/songAutocomplete");

module.exports = {
  name: "playnext",
  aliases: ["pn", "playnext"],
  category: "Music",
  cooldown: 3,
  description: "Searches for a song and plays it next in the queue.",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],

  slashOptions: [
    {
      name: "song",
      description: "Song name or URL to play next",
      type: 3,
      required: true,
      autocomplete: true,
    },
  ],

  autocomplete: (interaction, client) => handleSongAutocomplete(interaction, client),

  async slashExecute(interaction, client) {
    const query = interaction.options.getString("song");

    await interaction.deferReply();

    if (!interaction.member?.voice?.channel) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You need to be in a voice channel first.**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const channel = interaction.member.voice.channel;

    if (!interaction.guild.members.me.permissions.has([
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
    ])) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} I don't have enough permissions! Please give me \`CONNECT\` and \`SPEAK\`.**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    try {
      const { hasAvailableNodes } = require("../../utils/nodeUtils");

      if (!hasAvailableNodes(client.manager)) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} The music server is currently unavailable. Please try again later.**`);
        const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      let player = client.manager.players.get(interaction.guild.id);

      if (!player) {
        try {
          player = await client.manager.createPlayer({
            guildId: interaction.guild.id,
            voiceId: channel.id,
            textId: interaction.channel.id,
            volume: 80,
            deaf: true,
          });

          try {
            client.voiceHealthMonitor?.startMonitoring(player);
          } catch {}
        } catch (createError) {
          console.error("Player creation error:", createError);

          if (createError.status === 404 && createError.message && createError.message.includes("Session not found")) {
            console.log(`Stale session detected for guild ${interaction.guild.id}, cleaning up and retrying...`);

            if (client.manager.players.has(interaction.guild.id)) {
              client.manager.players.delete(interaction.guild.id);
            }

            try {
              await new Promise((resolve) => setTimeout(resolve, 500));

              player = await client.manager.createPlayer({
                guildId: interaction.guild.id,
                voiceId: channel.id,
                textId: interaction.channel.id,
                volume: 80,
                deaf: true,
              });

              console.log(`Successfully recreated player for guild ${interaction.guild.id}`);
              try {
                client.voiceHealthMonitor?.startMonitoring(player);
              } catch {}
            } catch (retryError) {
              console.error("Player creation retry error:", retryError);
              throw new Error(`Voice connection failed after retry: ${retryError.message}`);
            }
          } else {
            throw new Error(`Voice connection failed: ${createError.message}`);
          }
        }
      } else {
        if (player.voiceId !== channel.id) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} I'm already connected to a different voice channel.**`);
          const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
          return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (player.textId !== interaction.channel.id) {
          player.textId = interaction.channel.id;
        }
      }

      const isUrl = /^https?:\/\//.test(query) ||
        query.includes("youtube.com") ||
        query.includes("youtu.be") ||
        query.includes("music.apple.com") ||
        query.includes("spotify.com") ||
        query.includes("deezer.com") ||
        query.includes("jiosaavn.com");

      let searchResult;
      try {
        searchResult = await player.search(query, {
          requester: interaction.user,
          engine: isUrl ? undefined : "ytmsearch",
        });
      } catch (searchError) {
        const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");

        if (await handleSessionError(searchError, player, client)) {
          try {
            player = await recreatePlayer(client, interaction.guild.id, channel.id, interaction.channel.id);
            searchResult = await player.search(query, {
              requester: interaction.user,
              engine: isUrl ? undefined : "ytmsearch",
            });
          } catch (retryError) {
            console.error("Search retry error:", retryError);
            searchResult = { tracks: [] };
          }
        } else {
          console.error("Search error:", searchError);
          searchResult = { tracks: [] };
        }
      }

      if (!searchResult.tracks.length) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} No results found for "${query}"**`);
        const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      /* insert at the front of the queue, preserving order */
      const wasIdle = !player.playing && !player.paused;
      const startIndex = player.queue.length;
      for (const track of searchResult.tracks) {
        player.queue.add(track);
      }

      let added = [];
      if (wasIdle) {
        // On an idle player, queue.add() sets queue.current WITHOUT pushing it
        // into the array, so splice() would return nothing. The first track is
        // now current; the remaining tracks are already queued in order.
        added = searchResult.tracks.slice(1);
      } else {
        added = player.queue.splice(startIndex, searchResult.tracks.length);
        player.queue.unshift(...added);
      }

      try {
        if (!player.playing && !player.paused) {
          await player.play();
        }
      } catch (playError) {
        const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");

        if (await handleSessionError(playError, player, client)) {
          try {
            player = await recreatePlayer(client, interaction.guild.id, channel.id, interaction.channel.id);
            for (const track of searchResult.tracks) {
              player.queue.add(track);
            }
            await player.play();
          } catch (retryError) {
            console.error("Play retry error:", retryError);
            throw retryError;
          }
        } else {
          throw playError;
        }
      }

      const { convertTime } = require("../../utils/convert.js");

      const cleanAuthorName = (author) => {
        if (!author) return "Unknown Artist";
        return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
      };

      const truncateTitle = (title, maxLength = 20) => {
        if (!title) return "Unknown Title";
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength) + "...";
      };

      const first = wasIdle ? player.queue.current : added[0];
      const positionText = wasIdle
        ? `Now playing${added.length > 0 ? ` (+${added.length} more)` : ""}`
        : `1${added.length > 1 ? ` (${added.length} tracks)` : ""}`;
      const titleDisplay = new TextDisplayBuilder()
        .setContent(`### Play Next: [${truncateTitle(first.title)}](${first.uri})`);

      const infoDisplay = new TextDisplayBuilder()
        .setContent(
          `> - **Author:** [${cleanAuthorName(first.author)}](${first.uri})\n` +
          `> - **Duration:** \`${convertTime(first.length)}\`\n` +
          `> - **Requester:** [${interaction.user.username}](https://discord.com/users/${interaction.user.id})\n` +
          `> - **Position:** \`${positionText}\``
        );

      const section = new SectionBuilder().addTextDisplayComponents(titleDisplay, infoDisplay);

      if (first.thumbnail || first.artworkUrl) {
        const thumbnail = first.thumbnail || first.artworkUrl;
        if (thumbnail) {
          section.setThumbnailAccessory((t) => t.setURL(thumbnail));
        }
      }

      const container = new ContainerBuilder().addSectionComponents(section);

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      console.error("Error in slash playnext command:", error);

      let errorMessage = error.message;
      if (error.code === "UND_ERR_CONNECT_TIMEOUT" || error.message?.includes("fetch failed")) {
        errorMessage = "The music server is currently unreachable. Please try again or contact support.";
      } else {
        errorMessage = `An error occurred: ${error.message}`;
      }

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} ${errorMessage}**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);

      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else if (interaction.deferred) {
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (replyError) {
        if (replyError.code === 50027 || replyError.message?.includes("Invalid Webhook Token")) {
          try {
            const channel = client.channels.cache.get(interaction.channel.id);
            if (channel) {
              await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
          } catch (channelError) {
            console.error("Failed to send error message to channel:", channelError);
          }
        }
      }
    }
  },

  async execute(message, args, client, prefix) {
    const query = args.join(" ");

    if (!query) {
      const usageDisplay = new TextDisplayBuilder()
        .setContent(
          `**${client.emoji.dot} Usage** \`:\` \`${prefix}playnext [Song Name/URL]\`\n` +
          `**${client.emoji.dot} Example** \`:\` \`${prefix}playnext imagine dragons believer\``
        );
      const container = new ContainerBuilder().addTextDisplayComponents(usageDisplay);
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const channel = message.member.voice.channel;
    if (!channel) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You need to be in a voice channel first.**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (!message.guild.members.me.permissions.has([
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
    ])) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} I don't have enough permissions! Please give me \`CONNECT\` and \`SPEAK\`.**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    let player;

    try {
      const { hasAvailableNodes } = require("../../utils/nodeUtils");

      if (!hasAvailableNodes(client.manager)) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} The music server is currently unavailable. Please try again later.**`);
        const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      player = client.manager.players.get(message.guild.id);
      let playerCreated = false; // true when this run created the player

      if (!player) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          player = await client.manager.createPlayer({
            guildId: message.guild.id,
            voiceId: channel.id,
            textId: message.channel.id,
            volume: 80,
            deaf: true,
          });
          playerCreated = true;

          try {
            client.voiceHealthMonitor?.startMonitoring(player);
          } catch {}
        } catch (createError) {
          console.error("Player creation error:", createError);

          if (createError.status === 404 && createError.message && createError.message.includes("Session not found")) {
            console.log(`Stale session detected for guild ${message.guild.id}, cleaning up and retrying...`);

            if (client.manager.players.has(message.guild.id)) {
              client.manager.players.delete(message.guild.id);
            }

            try {
              await new Promise((resolve) => setTimeout(resolve, 500));

              player = await client.manager.createPlayer({
                guildId: message.guild.id,
                voiceId: channel.id,
                textId: message.channel.id,
                volume: 80,
                deaf: true,
              });
              playerCreated = true;

              console.log(`Successfully recreated player for guild ${message.guild.id}`);
              try {
                client.voiceHealthMonitor?.startMonitoring(player);
              } catch {}
            } catch (retryError) {
              console.error("Player creation retry error:", retryError);
              throw new Error(`Voice connection failed after retry: ${retryError.message || "Unknown Error"}`);
            }
          } else {
            throw new Error(`Voice connection failed: ${createError.message || createError.status || "Unknown error"}`);
          }
        }
      } else {
        if (player.voiceId !== channel.id) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} I'm already connected to a different voice channel.**`);
          const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (player.textId !== message.channel.id) {
          player.textId = message.channel.id;
        }
      }

      const isUrl = /^https?:\/\//.test(query) ||
        query.includes("youtube.com") ||
        query.includes("youtu.be") ||
        query.includes("music.apple.com") ||
        query.includes("spotify.com") ||
        query.includes("deezer.com") ||
        query.includes("jiosaavn.com");

      let searchOptions = { requester: message.author };
      if (!isUrl) {
        try {
          const userPref = await UserPreferences.findOne({ userId: message.author.id });
          searchOptions.engine = userPref?.musicSource || "ytmsearch";
        } catch (error) {
          console.error("Error fetching user preference:", error);
          searchOptions.engine = "ytmsearch";
        }
      }

      let searchResult = null;
      try {
        searchResult = await player.search(query, searchOptions);
      } catch (searchError) {
        console.error("Initial search error:", searchError);
        if (searchOptions.engine && searchOptions.engine !== "ytsearch") {
          try {
            searchResult = await player.search(query, { requester: message.author, engine: "ytsearch" });
          } catch (fallbackError) {
            console.error("Fallback search error:", fallbackError);
            searchResult = { tracks: [] };
          }
        } else {
          searchResult = { tracks: [] };
        }
      }

      if (!searchResult.tracks.length) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} No result was found**`);
        const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);

        try {
          return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
          return await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
      }

      /* insert at the front of the queue, preserving order */
      const wasIdle = !player.playing && !player.paused;
      const startIndex = player.queue.length;
      for (const track of searchResult.tracks) {
        player.queue.add(track);
      }

      let added = [];
      if (wasIdle) {
        // On an idle player, queue.add() sets queue.current WITHOUT pushing it
        // into the array, so splice() would return nothing. The first track is
        // now current; the remaining tracks are already queued in order.
        added = searchResult.tracks.slice(1);
      } else {
        added = player.queue.splice(startIndex, searchResult.tracks.length);
        player.queue.unshift(...added);
      }

      if (!player.playing && !player.paused) {
        await player.play();
      }

      const { convertTime } = require("../../utils/convert.js");

      const cleanAuthorName = (author) => {
        if (!author) return "Unknown Artist";
        return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
      };

      const truncateTitle = (title, maxLength = 20) => {
        if (!title) return "Unknown Title";
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength) + "...";
      };

      const first = wasIdle ? player.queue.current : added[0];
      const positionText = wasIdle
        ? `Now playing${added.length > 0 ? ` (+${added.length} more)` : ""}`
        : `1${added.length > 1 ? ` (${added.length} tracks)` : ""}`;
      const titleDisplay = new TextDisplayBuilder()
        .setContent(`### Play Next: [${truncateTitle(first.title)}](${first.uri})`);

      const infoDisplay = new TextDisplayBuilder()
        .setContent(
          `> - **Author:** [${cleanAuthorName(first.author)}](${first.uri})\n` +
          `> - **Duration:** \`${convertTime(first.length)}\`\n` +
          `> - **Requester:** [${message.author.username}](https://discord.com/users/${message.author.id})\n` +
          `> - **Position:** \`${positionText}\``
        );

      const section = new SectionBuilder().addTextDisplayComponents(titleDisplay, infoDisplay);

      if (first.thumbnail || first.artworkUrl) {
        const thumbnail = first.thumbnail || first.artworkUrl;
        if (thumbnail) {
          section.setThumbnailAccessory((t) => t.setURL(thumbnail));
        }
      }

      const container = new ContainerBuilder().addSectionComponents(section);

      try {
        return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (e) {
        return await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (error) {
      console.error("Error in playnext command:", error);

      let errorMessage = error.message;
      if (error.code === "UND_ERR_CONNECT_TIMEOUT" || error.message?.includes("fetch failed")) {
        errorMessage = "The music server is currently unreachable. Please try again or contact support.";
      } else {
        errorMessage = `An error occurred while playing: ${error.message}`;
      }

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} ${errorMessage}**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);

      try {
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (replyError) {
        try {
          await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (sendError) {
          console.error("Failed to send error message:", sendError);
        }
      }

      // Only tear the player down when it was freshly created AND nothing got
      // queued — otherwise a transient failure (slow search, one bad track)
      // would wipe an already-working queue. Mirrors the guard in play.js.
      if (player && playerCreated && player.queue.length === 0 && !player.queue.current) {
        try {
          await player.destroy();
        } catch (destroyError) {
          console.error("Failed to destroy player:", destroyError);
          if (client.manager.players.has(message.guild.id)) {
            client.manager.players.delete(message.guild.id);
          }
        }
      }
    }
  },
};