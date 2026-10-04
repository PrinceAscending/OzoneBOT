const { MessageFlags } = require("discord.js");
const { notice } = require("../../utils/ui");

module.exports = {
  name: "dashboard",
  category: "Information",
  aliases: ["panel", "web", "control"],
  cooldown: 3,
  description: "Open the OZONE web dashboard to see the player in real time.",
  usage: "",
  slashOptions: [],

  async slashExecute(interaction, client) {
    await replyDashboard(client, {
      author: interaction.user,
      channel: interaction.channel,
      reply: async (options) => interaction.reply(options),
    });
  },

  async execute(message, args, client, prefix) {
    await replyDashboard(client, message);
  },
};

async function replyDashboard(client, target) {
  const url = client.config.dashboardBaseUrl || "http://localhost:3000";
  const enabled = client.config.dashboardEnabled;

  if (!enabled) {
    return target.reply({
      components: [notice({
        title: "Dashboard is not enabled",
        description: `Ask the bot owner to set \`DASHBOARD_ENABLED=true\` and restart.`,
        tone: "warning",
      })],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const description =
    `Join the same voice channel as OZONE, then open the link to control the player in real time:\n` +
    `**${url}**\n\n` +
    `You must log in with Discord (OAuth2) — only members in your voice channel get control access.`;

  return target.reply({
    components: [notice({
      title: "Dashboard",
      description,
      tone: "info",
    })],
    flags: MessageFlags.IsComponentsV2,
  });
}
