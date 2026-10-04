const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const { successPayload, warnPayload, errorPayload } = require("../../utils/responses");
const { formatCommandHelp } = require("../../utils/commandHelp");

function createVolumeBar(volume, max = 150) {
  const size = 15;
  const progress = Math.min(Math.max(Math.round((volume / max) * size), 0), size);
  const empty = size - progress;
  return `\`[${"■".repeat(progress)}${"—".repeat(empty)}]\``;
}

module.exports = {
  name: "volume",
  aliases: ["vol", "v"],
  category: "Music",
  description: "Adjust the music playback volume (0% - 150%).",
  cooldown: 3,
  usage: "[0-150]",
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks"],
  slashOptions: [
    {
      name: "level",
      description: "Volume level percentage (0 - 150)",
      type: 4,
      required: false,
      min_value: 0,
      max_value: 150,
    },
  ],

  async slashExecute(interaction, client) {
    const level = interaction.options.getInteger("level");
    const player = client.manager.players.get(interaction.guild.id);
    if (!player) {
      return interaction.reply(warnPayload("There is no music playing right now."));
    }

    if (level === null || level === undefined) {
      const currentVol = Math.round(player.volume ?? 100);
      const card = new ContainerBuilder()
        .setAccentColor(0x0A0B0E)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${client.emoji.music || ""} Current Volume: \`${currentVol}%\`\n` +
            `${createVolumeBar(currentVol)}`
          )
        );
      return interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
    }

    await player.setVolume(level);
    const card = new ContainerBuilder()
      .setAccentColor(0x35C47C)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${client.emoji.check || ""} Volume set to \`${level}%\`\n` +
          `${createVolumeBar(level)}`
        )
      );
    return interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client, prefix) {
    const player = client.manager.players.get(message.guild.id);
    if (!player) {
      return message.reply(warnPayload("There is no music playing right now."));
    }

    const currentVol = Math.round(player.volume ?? 100);

    if (!args[0]) {
      const card = new ContainerBuilder()
        .setAccentColor(0x0A0B0E)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${client.emoji.music || ""} Current Volume: \`${currentVol}%\`\n` +
            `${createVolumeBar(currentVol)}\n\n` +
            `-# Use \`${prefix}volume <0-150>\` to change the volume.`
          )
        );
      return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
    }

    const newVol = parseInt(args[0], 10);
    if (isNaN(newVol) || newVol < 0 || newVol > 150) {
      return message.reply(formatCommandHelp(this, message.author, prefix));
    }

    await player.setVolume(newVol);
    const card = new ContainerBuilder()
      .setAccentColor(0x35C47C)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${client.emoji.check || ""} Volume set to \`${newVol}%\`\n` +
          `${createVolumeBar(newVol)}`
        )
      );
    return message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  },
};
