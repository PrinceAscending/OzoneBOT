const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");

function formatTimestamp(timestamp) {
  return `<t:${Math.floor(timestamp / 1000)}:D> (<t:${Math.floor(timestamp / 1000)}:R>)`;
}

module.exports = {
  name: "userinfo",
  aliases: ["ui", "whois", "user"],
  category: "Information",
  description: "View detailed profile information for yourself or another user.",
  cooldown: 3,
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "user",
      description: "User to inspect",
      type: 6,
      required: false,
    },
  ],

  async slashExecute(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const card = buildUserInfoCard(user, member, client);
    return interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client) {
    let user = message.author;
    if (args[0]) {
      const match = args[0].match(/^(?:<@!?)?(\d{17,20})>?$/);
      if (match) {
        user = await client.users.fetch(match[1]).catch(() => message.author);
      }
    }
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    const card = buildUserInfoCard(user, member, client);
    return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },
};

function buildUserInfoCard(user, member, client) {
  const roles = member?.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`)
    .slice(0, 15) || [];

  const rolesDisplay = roles.length > 0
    ? roles.join(" ") + (member.roles.cache.size > 16 ? ` +${member.roles.cache.size - 16} more` : "")
    : "No roles";

  const dot = client.emoji?.dot ? `${client.emoji.dot} ` : "";
  const header = `### ${user.globalName || user.username} (@${user.username})\n` +
    `-# ID: \`${user.id}\` • Account created on ${formatTimestamp(user.createdTimestamp)}`;

  const details =
    `${dot}**Joined Server:** ${member ? formatTimestamp(member.joinedTimestamp) : "Not in this server"}\n` +
    `${dot}**Bot Account:** ${user.bot ? "Yes" : "No"}\n` +
    `${dot}**Boost Status:** ${member?.premiumSince ? `Boosting since ${formatTimestamp(member.premiumSinceTimestamp)}` : "Not boosting"}\n` +
    `${dot}**Roles [${member?.roles.cache.size ? member.roles.cache.size - 1 : 0}]:**\n${rolesDisplay}`;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(header),
      new TextDisplayBuilder().setContent(details)
    );

  const avatar = user.displayAvatarURL({ dynamic: true, size: 256 });
  if (avatar) {
    section.setThumbnailAccessory((thumb) => thumb.setURL(avatar));
  }

  const container = new ContainerBuilder()
    .setAccentColor(member?.displayColor || 0x0A0B0E)
    .addSectionComponents(section);

  return container;
}
