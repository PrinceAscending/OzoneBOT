const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const emoji = require("../../emojis");
const { STATIONS, stationFor, stationNames, stationCard, maybeRefill } = require("../../utils/radio");

module.exports = {
  name: "radio",
  aliases: ["stations", "fm"],
  category: "Music",
  cooldown: 5,
  description: "Endless themed radio stations — pick one and the music never stops.",
  args: false,
  usage: "<station name | off>",
  userPerms: [],
  botPerms: ["EmbedLinks"],
  player: false,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [
    {
      name: "station",
      description: "Station to tune into (or 'off')",
      type: 3, // STRING
      required: false,
      choices: [
        ...stationNames().map((n) => ({ name: STATIONS[n].label, value: n })),
        { name: "Off (stop the station)", value: "off" },
      ],
    },
  ],

  async slashExecute(interaction, client) {
    // Tuning can involve live searches — ack immediately so the 3s window
    // never expires while the station seeds.
    await interaction.deferReply().catch(() => { });
    const input = interaction.options.getString("station");
    const interactionWrapper = makeWrapper(interaction);
    const args = input ? [input] : [];
    return this.execute(interactionWrapper, args, client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const input = (args[0] || "").toLowerCase();
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} Join a voice channel first — the signal needs somewhere to broadcast.**`),
      ));
    }

    let player = client.manager.players.get(message.guild.id);

    /* ---------- turn the station OFF ---------- */
    if (input === "off" || input === "stop") {
      if (!player || !player.data.get("radioStation")) {
        return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.info} No station is playing.**`),
        ));
      }
      const station = stationFor(player.data.get("radioStation")) || { label: "Radio" };
      player.data.delete("radioStation");
      player.data.delete("radioHistory");
      player.data.delete("radioRequester");
      return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.check} ${station.label} signed off.** The queue plays out normally now.`),
      ));
    }

    /* ---------- status / station browser ---------- */
    if (!input) {
      if (player?.data.get("radioStation")) {
        const station = stationFor(player.data.get("radioStation"));
        return sendCard(message, client, stationCard(client, player, station, { requester: player.data.get("radioRequester") }));
      }
      return sendCard(message, client, browserCard(client, player));
    }

    /* ---------- tune in ---------- */
    const station = stationFor(input);
    if (!station) {
      return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.warn} Unknown station \`${input.slice(0, 30)}\`.**\nAvailable: ${stationNames().map((n) => `\`${n}\``).join(" ")}`,
        ),
      ));
    }

    // Ensure there is a player connected to the caller's VC.
    if (!player) {
      const { hasAvailableNodes } = require("../../utils/nodeUtils");
      if (!hasAvailableNodes(client.manager)) {
        return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.cross} The music server is offline. Try again in a bit.**`),
        ));
      }
      player = await client.manager.createPlayer({
        guildId: message.guild.id,
        voiceId: voiceChannel.id,
        textId: message.channel.id,
        volume: 80,
        deaf: true,
      }).catch(() => null);
      if (!player) {
        return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${client.emoji.cross} Could not connect to the voice channel.**`),
        ));
      }
      client.voiceHealthMonitor?.startMonitoring(player);
    } else if (player.voiceId && voiceChannel.id !== player.voiceId) {
      return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.warn} You must be in <#${player.voiceId}> to tune the station.**`,
        ),
      ));
    }

    player.data.set("radioStation", input);
    player.data.set("radioRequester", message.author.id);
    // Fresh session — clear previous station history so repeats across a
    // re-tune are possible again.
    player.data.delete("radioHistory");

    // If nothing is playing, seed immediately; otherwise the station takes
    // over as the queue drains.
    let seeded = 0;
    if (!player.queue.current) {
      seeded = await require("../../utils/radio").refillQueue(client, player, message.author);
      if (seeded > 0 && !player.playing && !player.paused) {
        await player.play().catch((e) => client.logger?.log(`[Radio] initial play failed: ${e.message}`, "warn"));
      }
    } else {
      seeded = await maybeRefill(client, player);
    }

    if (seeded === 0 && !player.queue.current) {
      player.data.delete("radioStation");
      return sendCard(message, client, new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} The station signal is dead (no tracks found). Try another station.**`),
      ));
    }

    return sendCard(message, client, stationCard(client, player, station, { requester: message.author.id }));
  },
};

function makeWrapper(interaction) {
  return {
    guild: interaction.guild,
    channel: interaction.channel,
    author: interaction.user,
    member: interaction.member,
    createdTimestamp: interaction.createdTimestamp,
    reply: async (options) => {
      if (interaction.deferred) return interaction.editReply(options);
      if (interaction.replied) return interaction.followUp(options);
      return interaction.reply(options);
    },
  };
}

function browserCard(client, player) {
  const active = player?.data.get("radioStation");
  const rows = Object.entries(STATIONS).map(([key, st]) =>
    `${active === key ? `${client.emoji.check} **▶ ON AIR:** ` : ""}${st.label} — ${st.desc}`,
  ).join("\n");

  return new ContainerBuilder()
    .setAccentColor(0x9FD4FF)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${client.emoji.autoplay || "📡"} OZONE Radio — pick a frequency\n` +
      `-# Stations refill the queue forever. Stop with \`${client.prefix}radio off\`.`,
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(rows));
}

async function sendCard(message, client, card) {
  try {
    return await message.reply({ components: [card], flags: MessageFlags.IsComponentsV2 });
  } catch {
    return message.channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }
}
