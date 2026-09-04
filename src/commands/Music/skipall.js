const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  name: "skipall",
  aliases: ["sa", "skipall"],
  category: "Music",
  cooldown: 3,
  description: "Skips the current track and removes everything from the queue.",
  args: false,
  usage: "",
  userPerms: [],
  owner: false,
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const player = client.manager.players.get(interaction.guild.id);
    if (!player?.queue?.current) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Play a song first!**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const removed = player.queue.length;
    player.queue.clear();
    // Autoplay on + empty queue = attemptAutoplay instantly refills the queue
    // we just wiped. Disable it like /stop does.
    const { stopPlaybackModes } = require("../../utils/playbackModes");
    stopPlaybackModes(player);
    await player.skip();

    const successDisplay = new TextDisplayBuilder()
      .setContent(
        `**${client.emoji.check} Skipped the current track and removed \`${removed}\` song${removed === 1 ? "" : "s"} from the queue.**`
      );
    const container = new ContainerBuilder().addTextDisplayComponents(successDisplay);
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client, prefix) {
    const player = client.manager.players.get(message.guild.id);
    if (!player?.queue?.current) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Play a song first!**`);
      const container = new ContainerBuilder().addTextDisplayComponents(errorDisplay);
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const removed = player.queue.length;
    player.queue.clear();
    // Autoplay on + empty queue = attemptAutoplay instantly refills the queue
    // we just wiped. Disable it like /stop does.
    const { stopPlaybackModes } = require("../../utils/playbackModes");
    stopPlaybackModes(player);
    await player.skip();

    const successDisplay = new TextDisplayBuilder()
      .setContent(
        `**${client.emoji.check} Skipped the current track and removed \`${removed}\` song${removed === 1 ? "" : "s"} from the queue.**`
      );
    const container = new ContainerBuilder().addTextDisplayComponents(successDisplay);
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};