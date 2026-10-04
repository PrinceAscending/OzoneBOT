const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const BlacklistSchema = require('../../schema/blacklist');
const { sendWebhook } = require('../../utils/webhooks');
const { formatCommandHelp } = require('../../utils/commandHelp');

module.exports = {
    name: 'blacklist',
    aliases: ['bl'],
    description: 'Blacklist a user from using the bot (owner only).',
    category: 'Owner',
    args: true,
    usage: 'add <@user|id> | remove <@user|id> | list | check <@user|id>',
    userPerms: [],
    owner: true,
    cooldown: 3,
    slashOptions: [],

    async slashExecute(interaction, client) {
        if (!client.owners.includes(interaction.user.id)) {
            const deny = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${client.emoji.warn} You do not have permission to use this command.**`),
            );
            return interaction.reply({
                components: [deny],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            }).catch(() => { });
        }

        const sub = interaction.options.getSubcommand(false) || '';
        let targetId = interaction.options.getUser('user')?.id || null;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => { });

        if (sub === 'list') return sendBlacklistList({ client, reply: (o) => interaction.editReply(o) });
        if (sub === 'add' || sub === 'remove') {
            if (!targetId) targetId = interaction.options.getString('id');
            return toggleBlacklist({ client, message: interaction, reply: (o) => interaction.editReply(o), action: sub, targetId });
        }
        if (sub === 'check') {
            if (!targetId) targetId = interaction.options.getString('id');
            return checkBlacklist({ client, reply: (o) => interaction.editReply(o), targetId });
        }

        const help = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.info} Usage:** \`blacklist add/remove/check <user>\` or \`blacklist list\``),
        );
        return interaction.editReply({ components: [help] }).catch(() => { });
    },

    async execute(message, args, client) {
        const action = (args[0] || '').toLowerCase();

        if (action === 'list') {
            return sendBlacklistList({ client, reply: (o) => message.channel.send(o) });
        }

        if (action === 'add' || action === 'remove') {
            const raw = args[1];
            if (!raw) {
                const usage = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.info} Usage:** \`${message.content.split(' ')[0]} ${action} <@user|id>\``),
                );
                return message.reply({ components: [usage], flags: MessageFlags.IsComponentsV2 });
            }
            const match = raw.match(/^(?:<@!?)?(\d{17,20})(?:>)?$/);
            const targetId = match ? match[1] : (/^\d{17,20}$/.test(raw) ? raw : null);
            if (!targetId) {
                const bad = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.warn} That is not a valid user mention or ID.**`),
                );
                return message.reply({ components: [bad], flags: MessageFlags.IsComponentsV2 });
            }
            return toggleBlacklist({ client, message, reply: (o) => message.reply(o), action, targetId });
        }

        if (action === 'check') {
            const raw = args[1] || '';
            const match = raw.match(/^(?:<@!?)?(\d{17,20})(?:>)?$/);
            const targetId = match ? match[1] : null;
            if (!targetId) {
                const bad = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.warn} Provide a valid user mention or ID to check.**`),
                );
                return message.reply({ components: [bad], flags: MessageFlags.IsComponentsV2 });
            }
            return checkBlacklist({ client, reply: (o) => message.reply(o), targetId });
        }

        return message.reply(formatCommandHelp(this, message.author, client.prefix));
    },
};

async function toggleBlacklist({ client, message, reply, action, targetId }) {
    try {
        const existing = await BlacklistSchema.findOne({ userId: targetId });

        if (action === 'add') {
            if (client.owners.includes(targetId)) {
                const deny = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.warn} You cannot blacklist a bot owner.**`),
                );
                return reply({ components: [deny], flags: MessageFlags.IsComponentsV2 });
            }
            if (existing) {
                const already = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.info} <@${targetId}> is already blacklisted.**`),
                );
                return reply({ components: [already], flags: MessageFlags.IsComponentsV2 });
            }
            await BlacklistSchema.create({ userId: targetId, timestamp: new Date() });

            const added = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${client.emoji.check} <@${targetId}> has been blacklisted from using the bot.**`),
            );
            await reply({ components: [added], flags: MessageFlags.IsComponentsV2 });

            await sendWebhook(client, 'black', {
                embeds: [{
                    color: 0xED4245,
                    title: 'User Blacklisted',
                    description: `**User:** <@${targetId}> (\`${targetId}\`)\n**By:** ${message.author?.tag || 'dashboard'} (${message.author?.id || 'n/a'})`,
                    timestamp: new Date().toISOString(),
                }],
            }).catch(() => { });
            return;
        }

        // action === 'remove'
        if (!existing) {
            const notFound = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${client.emoji.info} <@${targetId}> is not blacklisted.**`),
            );
            return reply({ components: [notFound], flags: MessageFlags.IsComponentsV2 });
        }
        await BlacklistSchema.deleteOne({ userId: targetId });

        const removed = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.check} <@${targetId}> has been removed from the blacklist.**`),
        );
        return reply({ components: [removed], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        client.logger?.log(`[Blacklist] toggle failed: ${error.message}`, 'error');
        const fail = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${client.emoji.warn} Database error: ${error.message}**`),
        );
        return reply({ components: [fail], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
    }
}

async function checkBlacklist({ client, reply, targetId }) {
    try {
        const record = await BlacklistSchema.findOne({ userId: targetId });
        const sinceSeconds = record?.timestamp ? Math.floor(new Date(record.timestamp).getTime() / 1000) : 0;
        const status = record
            ? `**${client.emoji.cross} <@${targetId}> IS blacklisted** (since <t:${sinceSeconds}:R>)`
            : `**${client.emoji.check} <@${targetId}> is NOT blacklisted**`;
        return reply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(status))],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (error) {
        client.logger?.log(`[Blacklist] check failed: ${error.message}`, 'error');
    }
}

async function sendBlacklistList({ client, reply }) {
    try {
        const records = await BlacklistSchema.find({}).sort({ timestamp: -1 }).limit(50).lean();
        if (!records.length) {
            const empty = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${client.emoji.info} The blacklist is empty.**`),
            );
            return reply({ components: [empty], flags: MessageFlags.IsComponentsV2 });
        }

        const lines = records.map((r, i) => `\`${i + 1}.\` <@${r.userId}> — \`${r.userId}\``);
        // Chunk to respect the 4000-char TextDisplay budget
        const chunks = [];
        let buf = '';
        for (const line of lines) {
            if (buf.length + line.length > 3500) { chunks.push(buf); buf = ''; }
            buf += `${line}\n`;
        }
        if (buf) chunks.push(buf);

        const container = new ContainerBuilder()
            .setAccentColor(0x0A0B0E)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${client.emoji.warn || ""} Blacklisted Users — ${records.length} total`)
            )
            .addSeparatorComponents(new SeparatorBuilder());

        for (const chunk of chunks) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(chunk)
            );
        }

        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        client.logger?.log(`[Blacklist] list failed: ${error.message}`, 'error');
    }
}
