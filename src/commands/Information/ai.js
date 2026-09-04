const { MessageFlags } = require("discord.js");
const Aimode = require("../../schema/aimode");
const { touchActivity, display } = require("../../utils/ai");

async function toggleAIMode(client, userId) {
  const existing = await Aimode.findOne({ userId });
  if (existing) {
    existing.enabled = !existing.enabled;
    existing.updatedAt = Date.now();
    await existing.save();
    return existing.enabled;
  }
  await Aimode.create({ userId, enabled: true });
  return true;
}

module.exports = {
  name: "ai",
  category: "Information",
  aliases: ["jarvis"],
  cooldown: 3,
  description: "Toggle AI mode — OZONE reads and replies to your messages.",
  usage: "",

  async slashExecute(interaction, client) {
    // Defer immediately: toggleAIMode does Mongo reads/writes before replying,
    // which can blow the 3s ack window.
    await interaction.deferReply();

    const enabled = await toggleAIMode(client, interaction.user.id);
    if (enabled) touchActivity(interaction.user.id);
    const status = enabled
      ? `**${client.emoji.check} AI mode enabled!** Ab main aapki har message padh ke jawab dunga. Jarvis style. (30 sec silence = auto timeout)`
      : `**${client.emoji.cross} AI mode disabled.** Theek hai, chup ho jata hoon.`;
    return interaction.editReply({
      components: [display(status)],
      flags: MessageFlags.IsComponentsV2,
    });
  },

  async execute(message, args, client, prefix) {
    const enabled = await toggleAIMode(client, message.author.id);
    if (enabled) touchActivity(message.author.id);
    const status = enabled
      ? `**${client.emoji.check} AI mode enabled!** Ab main aapki har message padh ke jawab dunga. Jarvis style. (30 sec silence = auto timeout)`
      : `**${client.emoji.cross} AI mode disabled.** Theek hai, chup ho jata hoon.`;
    return message.reply({
      components: [display(status)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};