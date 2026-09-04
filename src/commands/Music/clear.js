const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  name: "clear",
  aliases: ["cq"],
  category: "Music",
  cooldown: 3,
  description: "Removes all songs in the music queue.",
  args: false,
  usage: "",
  userPerms: [],
  owner: false,
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
        .setContent(`**${client.emoji.warn} Play a song first.**`);
      const container = new ContainerBuilder()
        .addTextDisplayComponents(warnDisplay);
      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }));
    }
    const removedCount = player.queue.length || 0;
    await Promise.resolve(player.queue.clear?.()).catch(() => {});
    const okDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.check} Cleared \`${removedCount}\` song(s) from the queue.**`);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(okDisplay);
    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }));
  },
};