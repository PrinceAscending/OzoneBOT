const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const emoji = require("../../emojis");
const { guildLeaderboard, globalLeaderboard } = require("../../utils/listeningStats");

function formatHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.max(1, Math.round(seconds))}s`;
}

module.exports = {
  name: "toptracks",
  aliases: ["toplisteners", "listeningchart", "topcharts", "topchart"],
  category: "Music",
  cooldown: 5,
  description: "View top listeners leaderboard — for this server or globally across all servers.",
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "scope",
      description: "Scope of the chart (server or global)",
      type: 3,
      required: false,
      choices: [
        { name: "Server Chart", value: "server" },
        { name: "Global Chart (All Servers)", value: "global" },
      ],
    },
  ],

  async slashExecute(interaction, client) {
    await interaction.deferReply().catch(() => {});
    const scope = interaction.options.getString("scope") || "server";
    const card = await buildLeaderboardCard(client, interaction.guild, scope);
    return interaction.editReply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client) {
    const scope = args[0]?.toLowerCase() === "global" ? "global" : "server";
    const card = await buildLeaderboardCard(client, message.guild, scope);
    return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },
};

async function buildLeaderboardCard(client, guild, scope = "server") {
  const isGlobal = scope === "global";
  const rows = isGlobal
    ? await globalLeaderboard(10)
    : await guildLeaderboard(guild.id, 10);

  if (!rows.length) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${client.emoji.info || "ℹ️"} No listening stats recorded yet for this ${isGlobal ? "network" : "server"}.** Play music to build the chart!`
      )
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const board = rows.map((row, i) => {
    const medal = medals[i] || `\`${String(i + 1).padStart(2, " ")}.\``;
    const hours = formatHours(row.seconds || 0);
    const plays = row.plays || 0;
    return `${medal} <@${row.userId}> — **${hours}** on air · \`${plays}\` track${plays === 1 ? "" : "s"}`;
  }).join("\n");

  const title = isGlobal
    ? `### 🌐 OZONE Global Hall of Fame — All Servers`
    : `### ${emoji.star || "⭐"} OZONE Listening Chart — ${guild.name.slice(0, 30)}`;

  const footer = isGlobal
    ? `-# Aggregated listening time across all servers powered by OZONE`
    : `-# Time spent listening in ${guild.name} • View global chart with \`/toptracks scope:global\``;

  return new ContainerBuilder()
    .setAccentColor(isGlobal ? 0xF39C12 : 0x9FD4FF)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${title}\n${footer}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(board));
}
