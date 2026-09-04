const { MessageFlags } = require("discord.js");
const {
  askGroq,
  getHistory,
  addToHistory,
  clearHistory,
  touchActivity,
  isSessionExpired,
  chunkText,
  display,
  sendChunks,
} = require("../../utils/ai");

module.exports = {
  name: "ask",
  category: "Information",
  aliases: ["chat"],
  cooldown: 3,
  description: "Ask OZONE AI a one-off question.",
  usage: "<question>",

  slashOptions: [
    {
      name: "prompt",
      description: "What do you want to ask?",
      type: 3,
      required: true,
    },
  ],

  async slashExecute(interaction, client) {
    const prompt = interaction.options.getString("prompt");
    await interaction.deferReply();

    const wrapper = {
      author: interaction.user,
      channel: interaction.channel,
      reply: async (options) => interaction.editReply(options),
    };
    await handleAsk(client, wrapper, prompt);
  },

  async execute(message, args, client, prefix) {
    const prompt = args.join(" ");
    if (!prompt) {
      return message.channel.send({
        components: [display(
          `**${client.emoji.dot} Usage** \`:\` \`${prefix}ask <question>\`\n` +
          `**${client.emoji.dot} Example** \`:\` \`${prefix}ask best song for a road trip?\``
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }
    await handleAsk(client, message, prompt);
  },
};

async function handleAsk(client, target, prompt) {
  if (isSessionExpired(target.author.id)) {
    clearHistory(target.author.id);
  }
  touchActivity(target.author.id);

  const messages = getHistory(target.author.id);
  messages.push({ role: "user", content: prompt });

  const result = await askGroq(client, messages);

  if (!result.ok) {
    clearHistory(target.author.id);
    return target.reply({
      components: [display(`**${client.emoji.warn} ${result.message}**`)],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  addToHistory(target.author.id, "user", prompt);
  addToHistory(target.author.id, "assistant", result.content);

  const chunks = chunkText(result.content);
  await sendChunks(target, chunks);
}