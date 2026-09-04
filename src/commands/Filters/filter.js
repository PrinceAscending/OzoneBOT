const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder
} = require('discord.js');

const emoji = require("../../emojis");


module.exports = {
    name: "filter",
    category: "Filters",
    aliases: ["eq", "filters"],
    cooldown: 3,
    description: "Sets the bot's sound filter.",
    args: false,
    usage: "",
    userPerms: [],
    player: true,
    inVoiceChannel: true,
    sameVoiceChannel: true,
    slashOptions: [],

    async slashExecute(interaction, client) {
        const interactionWrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            createdTimestamp: interaction.createdTimestamp,
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
            const options = interaction.options.data;
            for (const option of options) {
                if (option.value !== undefined) {
                    args.push(option.value.toString());
                }
            }
        }

        const prefix = client.prefix;
        return this.execute(interactionWrapper, args, client, prefix);
    },

    async execute(message, args, client, prefix) {
        const player = client.manager.players.get(message.guild.id);

        if (!player.queue.current) {
            const warnDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.warn} There is no song currently playing.**`);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(warnDisplay);

            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const row4 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("disable_h")
                .setPlaceholder(`Select a filter to apply`)
                .addOptions([
                    { label: "Reset Filters", value: "clear", emoji: client.emoji.resolvable("warn") },
                    { label: "8D Audio", value: "8d_but", emoji: client.emoji.resolvable("check") },
                    { label: "BassBoost", value: "bass_but", emoji: client.emoji.resolvable("check") },
                    { label: "Deep Bass", value: "deepbass_but", emoji: client.emoji.resolvable("check") },
                    { label: "Treble Boost", value: "treble_but", emoji: client.emoji.resolvable("check") },
                    { label: "NightCore", value: "night_but", emoji: client.emoji.resolvable("check") },
                    { label: "Daycore", value: "daycore_but", emoji: client.emoji.resolvable("check") },
                    { label: "Slowed + Reverb", value: "slowed_but", emoji: client.emoji.resolvable("check") },
                    { label: "Vaporwave", value: "vapo_but", emoji: client.emoji.resolvable("check") },
                    { label: "Chipmunk", value: "chipmunk_but", emoji: client.emoji.resolvable("check") },
                    { label: "Karaoke", value: "karaoke_but", emoji: client.emoji.resolvable("check") },
                    { label: "Soft", value: "soft_but", emoji: client.emoji.resolvable("check") },
                    { label: "China", value: "china_but", emoji: client.emoji.resolvable("check") },
                    { label: "Vibrato", value: "vibrato_but", emoji: client.emoji.resolvable("check") },
                ]),
        );

        const currentFilter = player.currentFilter || "None";

        const statusDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.info} Current Filter** \`:\` \`${currentFilter}\``);

        const statusContainer = new ContainerBuilder()
            .addTextDisplayComponents(statusDisplay)
            .addActionRowComponents(row4);

        const eq = await message.channel.send({
            components: [statusContainer],
            flags: MessageFlags.IsComponentsV2
        });

        const collector = eq.createMessageComponentCollector({
            filter: (i) => {
                if (message.author.id === i.user.id) return true;
                else {
                    const errorDisplay = new TextDisplayBuilder()
                        .setContent(`**${client.emoji.warn} That's not your session run. Use \`${prefix}filter\` to create your own.**`);

                    const errorContainer = new ContainerBuilder()
                        .addTextDisplayComponents(errorDisplay);

                    i.reply({
                        components: [errorContainer],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                    });
                    return false;
                }
            },
            time: 100000,
            idle: 30000,
        });

        collector.on("collect", async (i) => {
            if (!i.isStringSelectMenu()) return;

            const value = i.values[0];

            let filterName = i.component.options.find(o => o.value === value)?.label || "Unknown Filter";

            try {
                // Lavalink merges partial filter payloads, so applying a new
                // filter on top of an old one stacks them (NightCore keeping a
                // previous BassBoost EQ). Always reset first.
                await player.shoukaku.clearFilters();

                switch (value) {
                    case "clear":
                        filterName = "None";
                        break;
                    case "8d_but":
                        await player.shoukaku.setFilters({ rotation: { rotationHz: 0.2 } });
                        break;
                    case "bass_but":
                        await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 }, { band: 3, gain: 0.1 }] });
                        break;
                    case "deepbass_but":
                        await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.5 }, { band: 2, gain: 0.4 }, { band: 3, gain: 0.3 }, { band: 4, gain: 0.2 }] });
                        break;
                    case "treble_but":
                        await player.shoukaku.setFilters({ equalizer: [{ band: 10, gain: 0.3 }, { band: 11, gain: 0.35 }, { band: 12, gain: 0.4 }, { band: 13, gain: 0.45 }] });
                        break;
                    case "night_but":
                        await player.shoukaku.setFilters({ timescale: { speed: 1.15, pitch: 1.2, rate: 1.0 } });
                        break;
                    case "daycore_but":
                        await player.shoukaku.setFilters({ timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 } });
                        break;
                    case "slowed_but":
                        // Lavalink v4 has NO reverb filter — sending `reverb` is
                        // rejected with HTTP 400, which killed this whole branch
                        // (and deferUpdate never ran, so the interaction hung).
                        // The "slowed + reverb" vibe is approximated with a low
                        // pass + gentle tremolo instead.
                        await player.shoukaku.setFilters({ timescale: { speed: 0.88, pitch: 0.9 }, lowPass: { smoothing: 12 }, tremolo: { depth: 0.25, frequency: 2 } });
                        break;
                    case "vapo_but":
                        await player.shoukaku.setFilters({ timescale: { speed: 0.8, pitch: 0.8 }, tremolo: { depth: 0.3, frequency: 10 } });
                        break;
                    case "chipmunk_but":
                        await player.shoukaku.setFilters({ timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } });
                        break;
                    case "karaoke_but":
                        await player.shoukaku.setFilters({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } });
                        break;
                    case "soft_but":
                        await player.shoukaku.setFilters({ lowPass: { smoothing: 20.0 } });
                        break;
                    case "china_but":
                        await player.shoukaku.setFilters({ timescale: { speed: 0.75, pitch: 1.25, rate: 1.25 } });
                        break;
                    case "vibrato_but":
                        await player.shoukaku.setFilters({ vibrato: { frequency: 4.0, depth: 0.75 } });
                        break;
                }

                player.currentFilter = filterName;
            } catch (error) {
                client.logger?.log(`[Filter] Failed to apply "${value}" in guild ${player.guildId}: ${error.message}`, "warn");
                return i.reply({
                    components: [new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**${client.emoji.warn} Could not apply that filter — the node rejected it. Try again.**`)
                    )],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                }).catch(() => { });
            }

            const updatedDisplay = new TextDisplayBuilder()
                .setContent(`**${client.emoji.info} Current Filter \`:\`** \`${filterName}\``);

            const updatedContainer = new ContainerBuilder()
                .addTextDisplayComponents(updatedDisplay)
                .addActionRowComponents(row4);

            await i.deferUpdate();
            await eq.edit({
                components: [updatedContainer],
                flags: MessageFlags.IsComponentsV2
            });
        });

        collector.on("end", async (_collected, reason) => {
            // Self-clean only on natural expiry — never wipe a freshly applied
            // filter confirmation that ended because of a user action.
            if ((reason === "time" || reason === "idle") && !eq.deleted) {
                await eq.delete().catch(() => { });
            }
        });
    },
};
