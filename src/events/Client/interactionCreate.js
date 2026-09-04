const {
  CommandInteraction,
  InteractionType,
  PermissionFlagsBits,
  PermissionsBitField,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../../schema/prefix.js");
const DJRoleSchema = require("../../schema/djrole");
const { sendWebhook } = require("../../utils/webhooks");
const { playPreviousTrack } = require("../../utils/previousTrack");
const { setAutoplay, setLoopMode, stopPlaybackModes } = require("../../utils/playbackModes");

module.exports = {
  name: "interactionCreate",
  run: async (client, interaction) => {
    await client.emojiReady?.catch(() => {});

    // Slash commands and buttons rely on guild context (permissions, voice,
    // players). Nothing is available in DMs — bail out before any guard runs.
    if (!interaction.guild) {
      if (interaction.isCommand()) {
        await interaction
          .reply({
            content: `**${client.emoji.info} Commands are not available in DMs**`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
      return;
    }

    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const command = client.slashCommands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        // 10062 = the 3s autocomplete window expired (user moved on / slow search).
        // Expected, not an error — don't spam the logs with it.
        if (error?.code === 10062) return;
        console.error(`Autocomplete error for ${interaction.commandName}:`, error);
        client.logger.log(`Autocomplete error for ${interaction.commandName}: ${error.stack}`, "error");
      }
      return;
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
      if (!client.slashCommands) {
        client.logger.log("Slash commands collection is not initialized", "error");
        return;
      }

      const command = client.slashCommands.get(interaction.commandName);
      if (!command) return;

      // Guards + execution share one try/catch so a bad guard (missing guild
      // member, null voice state) can't crash the handler outside of it.
      try {
      if (command.botPerms) {
        if (
          !interaction.guild.members.me.permissions.has(
            PermissionsBitField.resolve(command.botPerms || []),
          )
        ) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.warn} I don't have \`${command.botPerms.join(', ')}\` permission in ${interaction.channel.toString()} to execute this \`${command.name}\` command.**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (command.userPerms) {
        if (
          !interaction.member.permissions.has(
            PermissionsBitField.resolve(command.userPerms || []),
          )
        ) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.warn} You don't have \`${command.userPerms.join(', ')}\` permission in ${interaction.channel.toString()} to execute this \`${command.name}\` command.**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      // DJ-only commands: the `dj` flag is declared on the full command
      // object but the loader (loadCommands.js) does not propagate it into
      // client.slashCommands, so fall back to the prefix collection.
      const djFlag = command.dj || client.commands.get(interaction.commandName)?.dj;
      if (djFlag) {
        try {
          const djDoc = await DJRoleSchema.findOne({ guildId: interaction.guild.id });
          const djRoleId = djDoc?.roleId;
          const hasDjRole = djRoleId && interaction.member.roles.cache.has(djRoleId);
          const isGuildOwner = interaction.user.id === interaction.guild.ownerId;
          const canManageRoles = interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)
            || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

          if (!hasDjRole && !isGuildOwner && !canManageRoles) {
            const errorDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.warn} You need the DJ role to use this command.**`);

            const container = new ContainerBuilder()
              .addTextDisplayComponents(errorDisplay);

            return interaction
              .reply({
                components: [container],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              })
              .catch(() => { });
          }
        } catch (error) {
          // DB failure: fail open so the DJ gate can't brick commands.
          client.logger.log(`DJ role lookup failed for guild ${interaction.guildId}: ${error.message}`, "warn");
        }
      }

      const player = interaction.client.manager.players.get(
        interaction.guildId,
      );
      if (command.player && !player) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} There is no player for this guild.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.inVoiceChannel && !interaction.member.voice.channel) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} You must be in a voice channel.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.sameVoiceChannel) {
        if (!interaction.guild || !interaction.guild.members.me) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} An error occurred. It seems the bot is not properly connected to the guild.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        const userVoiceChannel = interaction.member.voice.channel;

        if (botVoiceChannel) {
          if (userVoiceChannel !== botVoiceChannel) {
            const errorDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.warn} You must be in the same ${botVoiceChannel.toString()} to use this command.**`);

            const container = new ContainerBuilder()
              .addTextDisplayComponents(errorDisplay);

            return await interaction
              .reply({
                components: [container],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              })
              .catch(() => { });
          }
        }
      }

        // Owner-only commands: same gate as messageCreate.js uses for prefix
        // commands. Deny silently-returning users with an ephemeral reply.
        if (command.owner && !client.owners.includes(interaction.user.id)) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} You do not have permission to use this command.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }

        const interactionWrapper = {
          guild: interaction.guild,
          channel: interaction.channel,
          author: interaction.user,
          member: interaction.member,
          createdTimestamp: interaction.createdTimestamp,
          mentions: {
            channels: (() => {
              const channelMap = new Map();
              /* `.first` must always exist: a real Discord Collection returns
                 undefined on an empty collection, and commands like
                 /ignore add call it even without the channel option. */
              channelMap.first = () => [...channelMap.values()].find((v) => typeof v !== "function") ?? null;
              return channelMap;
            })(),
          },
          reply: async (options) => {
            if (interaction.deferred) {
              return await interaction.editReply(options);
            } else if (interaction.replied) {
              return await interaction.followUp(options);
            } else {
              return await interaction.reply(options);
            }
          },
        };

        const args = [];
        if (interaction.options) {
          const action = interaction.options.getString('action');
          const channel = interaction.options.getChannel('channel');
          const prefix = interaction.options.getString('prefix');
          const source = interaction.options.getString('source');
          const query = interaction.options.getString('query');
          const song = interaction.options.getString('song');
          const name = interaction.options.getString('name');
          const input = interaction.options.getString('input');
          const text = interaction.options.getString('text');
          const number = interaction.options.getInteger('number');
          const amount = interaction.options.getInteger('amount');
          const position = interaction.options.getInteger('position');

          if (action) args.push(action);
          if (channel) {
            args.push(channel.id);
            interactionWrapper.mentions.channels.set(channel.id, channel);
          }
          if (prefix) args.push(prefix);
          if (source) args.push(source);
          if (query) args.push(...query.split(' '));
          if (song) args.push(...song.split(' '));
          if (name) args.push(...name.split(' '));
          if (input) args.push(...input.split(' '));
          if (text) args.push(...text.split(' '));
          if (number !== null && number !== undefined) args.push(number.toString());
          if (amount !== null && amount !== undefined) args.push(amount.toString());
          if (position !== null && position !== undefined) args.push(position.toString());
        }

        // Prefix is only needed by legacy-style (execute/run) handlers. Fetch it
        // lazily so autocomplete, buttons and slashExecute never pay a DB round
        // trip — and so a slow or failing read can't delay or break interactions.
        let prefix = client.prefix;
        if (command.execute || command.run) {
          try {
            const ress = await db.findOne({ Guild: interaction.guildId });
            if (ress?.Prefix) prefix = ress.Prefix;
          } catch (error) {
            client.logger?.log(`Prefix lookup failed for guild ${interaction.guildId}: ${error.message}`, "warn");
          }
        }

        if (typeof command.slashExecute === "function") {
          await command.slashExecute(interaction, client);
        } else if (command.execute) {
          await command.execute(interactionWrapper, args, client, prefix);
        } else if (command.run) {
          await command.run(client, interactionWrapper, prefix);
        }
        if (client.commandStats) {
          client.commandStats.set(command.name, (client.commandStats.get(command.name) || 0) + 1);
        }

        if (client.config.Webhooks?.cmdrun) {
          const getCommandString = () => {
            let cmdString = `/${interaction.commandName}`;
            if (interaction.options) {
              const subcommand = interaction.options.getSubcommand(false);
              if (subcommand) {
                cmdString += ` ${subcommand}`;
              }
              const options = interaction.options.data;
              if (options && options.length > 0) {
                const optionStrings = options
                  .filter(opt => opt.type !== 1)
                  .map(opt => `${opt.name}:${opt.value}`)
                  .join(' ');
                if (optionStrings) cmdString += ` ${optionStrings}`;
              }
            }
            return cmdString;
          };

          const commandlog = new EmbedBuilder()
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setColor(client.color)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setDescription(
              `**${client.emoji.dot} Command Used In:** \`${interaction.guild.name} | ${interaction.guild.id}\`\n` +
              `**${client.emoji.dot} Channel:** \`${interaction.channel.name} | ${interaction.channel.id}\`\n` +
              `**${client.emoji.dot} Command:** \`${command.name}\` (Slash)\n` +
              `**${client.emoji.dot} Executor:** \`${interaction.user.tag} | ${interaction.user.id}\`\n` +
              `**${client.emoji.dot} Content:** \`${getCommandString()}\``
            );

          await sendWebhook(client, "cmdrun", { embeds: [commandlog] });
        }

      } catch (error) {
        // 10062 = the interaction expired (3s ack window) or was already
        // answered. The command was too slow or double-responded; there is no
        // point replying to a dead interaction, and it is not a real error.
        if (error?.code === 10062) {
          client.logger?.log(`Interaction for ${command.name} expired before it could respond (10062)`, "debug");
          return;
        }

        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} An unexpected error occurred.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
        client.logger.log(`Interaction Error: ${error.stack}`, "error");
      }
    }

    if (interaction.isButton()) {
      // Queue view pagination (queue command). Page state lives on the player
      // (player.data "queuePage"), so open queue messages re-render against
      // the live queue and clamp to the current page range.
      const player = client.manager.players.get(interaction.guildId);
      if (interaction.customId.startsWith("queue:")) {
        if (!player?.queue?.current) {
          return interaction
            .reply({
              content: `**${client.emoji.info} The queue is empty.**`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => { });
        }

        try {
          const { queueCard } = require("../../commands/Music/queue");
          let page = Number(player.data.get("queuePage")) || 0;
          if (interaction.customId === "queue:first") page = 0;
          if (interaction.customId === "queue:previous") page -= 1;
          if (interaction.customId === "queue:next") page += 1;
          if (interaction.customId === "queue:last") page = Number.MAX_SAFE_INTEGER;
          player.data.set("queuePage", page);

          // queueCard clamps the page to a valid range and stores it back.
          const view = queueCard(client, player);
          return interaction.update({ components: [view.card] });
        } catch (error) {
          client.logger.log(`Queue pagination error: ${error.stack}`, "error");
          return interaction
            .reply({
              content: `**${client.emoji.warn} Could not update the queue view.**`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => { });
        }
      }

      // Handle Now Playing Buttons
      if (player && player.data.get("nowPlayingMessage")?.id === interaction.message.id) {
        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceId) {
          return interaction.reply({ content: `**${client.emoji.warn} You must be in my voice channel to use these buttons.**`, flags: MessageFlags.Ephemeral });
        }

        const { updateNowPlayingButtons } = require("../Players/playerStart");

        switch (interaction.customId) {
          case "previous": {
            try {
              const previousTrack = await playPreviousTrack(player, interaction.user);
              await interaction.reply({
                content: `**${client.emoji.check} Playing previous track: [${previousTrack.title}](${previousTrack.uri})**`,
                flags: MessageFlags.Ephemeral,
              });
            } catch (error) {
              const message = error.code === "NO_HISTORY"
                ? "No previous songs are available yet."
                : "The previous track could not be restored.";
              await interaction.reply({ content: `**${client.emoji.info} ${message}**`, flags: MessageFlags.Ephemeral });
            }
            break;
          }

          case "pause": {
            const isPaused = !player.shoukaku.paused;
            await player.pause(isPaused);
            await updateNowPlayingButtons(client, player, isPaused);
            await interaction.reply({
              content: `**${client.emoji.check} Player ${isPaused ? "Paused" : "Resumed"}**`,
              flags: MessageFlags.Ephemeral
            }).catch(() => { });
            break;
          }

          case "skip": {
            await player.skip();
            await interaction.reply({
              content: `**${client.emoji.check} Skipped current track**`,
              flags: MessageFlags.Ephemeral
            }).catch(() => { });
            break;
          }

          case "stop": {
            await Promise.resolve(player.queue.clear?.()).catch(() => {});
            stopPlaybackModes(player);
            await player.skip();
            await interaction.reply({
              content: `**${client.emoji.check} Player Stopped**`,
              flags: MessageFlags.Ephemeral
            }).catch(() => { });
            break;
          }

          case "loop": {
            const modes = ["none", "track", "queue"];
            const currentModeIndex = modes.indexOf(player.loop || "none");
            const nextMode = modes[(currentModeIndex + 1) % modes.length];
            setLoopMode(player, nextMode);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            await interaction.reply({
              content: `**${client.emoji.check} Loop mode set to: \`${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}\`**`,
              flags: MessageFlags.Ephemeral
            }).catch(() => { });
            break;
          }

          case "autoplay": {
            const currentAuto = player.data.get("autoplay") || false;
            const newAutoStatus = !currentAuto;
            const { disabledLoop } = setAutoplay(player, newAutoStatus);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            await interaction.reply({
              content: `**${client.emoji.check} Autoplay has been \`${newAutoStatus ? "Enabled" : "Disabled"}\`**${disabledLoop ? "\nLoop was disabled." : ""}`,
              flags: MessageFlags.Ephemeral
            }).catch(() => { });
            break;
          }
        }
        return;
      }
    }
  },
};
