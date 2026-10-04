const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require("discord.js");
const emoji = require("../../emojis");
const { formatCommandHelp } = require("../../utils/commandHelp");

module.exports = {
    name: "forward",
    aliases: ["ff", "fastforward"],
    category: "Music",
    cooldown: 3,
    description: "Fast forward the current song by specified seconds",
    args: false,
    usage: "[seconds]",
    userPrams: [],
    botPerms: ["EmbedLinks"],
    owner: false,
    player: true,
    inVoiceChannel: true,
    sameVoiceChannel: true,

    slashOptions: [
        {
            name: "seconds",
            description: "Number of seconds to fast-forward (default: 10)",
            type: 4, // INTEGER
            required: false
        }
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
        const seconds = interaction.options.getInteger("seconds");
        const args = seconds !== null ? [String(seconds)] : [];
        const prefix = client.prefix;
        return this.execute(wrapper, args, client, prefix);
    },

  async execute(message, args, client, prefix) {
        const player = client.manager.players.get(message.guild.id);

        if (!player.queue.current) {
            const errorDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.warn} Play a song first.**`);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(errorDisplay);

            return message.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const currentTrack = player.queue.current;
        const duration = currentTrack.length;

        let seconds = 10;

        if (args.length > 0) {
            seconds = parseInt(args[0]);

            if (isNaN(seconds) || seconds <= 0) {
                return message.reply(formatCommandHelp(this, message.author, prefix));
            }
        }

        const currentPosition = player.position;
        const newPosition = currentPosition + (seconds * 1000);

        // Live streams have no duration — the old code hit newPosition >= 0
        // (always true) and "fast forwarded" straight past the live stream.
        if (currentTrack?.isStream || !duration) {
            const warnDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.warn} Cannot fast forward a live stream.**`);
            const container = new ContainerBuilder().addTextDisplayComponents(warnDisplay);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (newPosition >= duration) {
            const warnDisplay = new TextDisplayBuilder()
                .setContent(
                    `**${client.emoji.warn} Cannot fast forward beyond the song duration.**\n` +
                    `**${client.emoji.info} Skipping to next song instead...**`
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(warnDisplay);

            await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            }).catch(() =>
                message.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                })
            );

            player.skip();
            return;
        }

        try {
            await player.seek(newPosition);

            const formatTime = (ms) => {
                const totalSeconds = Math.floor(ms / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const secs = totalSeconds % 60;
                return `${minutes}:${secs.toString().padStart(2, '0')}`;
            };

            const successDisplay = new TextDisplayBuilder()
                .setContent(
                    `**${client.emoji.check} Fast forwarded \`${seconds}s\` to \`${formatTime(newPosition)}\`**`
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(successDisplay);

            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            }).catch(() =>
                message.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                })
            );
        } catch (error) {
            console.error("Error fast forwarding:", error);

            const errorDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.cross} Failed to fast forward the track.**`);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(errorDisplay);

            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            }).catch(() =>
                message.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                })
            );
        }
    },
};
