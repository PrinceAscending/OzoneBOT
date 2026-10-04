const { AttachmentBuilder, MessageFlags } = require("discord.js");
const { createPlayerCard } = require("../../utils/playerCard");
const { createTrackBanner } = require("../../utils/trackBanner");
const { warnPayload } = require("../../utils/responses");

const BANNER_NAME = "now-playing-banner.png";

function dashboardUrl(client, player) {
  if (!client.config?.dashboardEnabled || !client.config?.dashboardBaseUrl) return null;
  return `${client.config.dashboardBaseUrl}/?guild=${player.guildId}`;
}

module.exports = {
  name: "nowplaying",
  aliases: ["np", "current", "playing"],
  category: "Music",
  description: "Display the currently playing song with full artwork and playback controls.",
  cooldown: 3,
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const player = client.manager.players.get(interaction.guild.id);
    const track = player?.queue?.current;
    if (!track) {
      return interaction.reply(warnPayload("Nothing is playing right now. Start a song with `/play`!"));
    }

    let bannerBuffer = player.data?.get("nowPlayingBanner") || null;
    if (!bannerBuffer) {
      try {
        const position = player.shoukaku?.position || 0;
        const bannerResult = await createTrackBanner(track, position);
        if (bannerResult?.buffer) {
          bannerBuffer = bannerResult.buffer;
          if (player.data) {
            player.data.set("cachedArtwork", bannerResult.artwork);
            player.data.set("nowPlayingBanner", bannerResult.buffer);
          }
        }
      } catch (error) {
        client.logger?.log(`[Player banner] ${error.message}`, "warn");
      }
    }

    const payload = {
      components: [createPlayerCard(client, player, track, {
        bannerName: bannerBuffer ? BANNER_NAME : null,
        controls: true,
        dashboardUrl: dashboardUrl(client, player),
      })].flat(),
      flags: MessageFlags.IsComponentsV2,
    };
    if (bannerBuffer) payload.files = [new AttachmentBuilder(bannerBuffer, { name: BANNER_NAME })];

    return interaction.reply(payload);
  },

  async execute(message, _args, client) {
    const player = client.manager.players.get(message.guild.id);
    const track = player?.queue?.current;
    if (!track) {
      return message.reply(warnPayload("Nothing is playing right now. Start a song with `^play`!"));
    }

    let bannerBuffer = player.data?.get("nowPlayingBanner") || null;
    if (!bannerBuffer) {
      try {
        const position = player.shoukaku?.position || 0;
        const bannerResult = await createTrackBanner(track, position);
        if (bannerResult?.buffer) {
          bannerBuffer = bannerResult.buffer;
          if (player.data) {
            player.data.set("cachedArtwork", bannerResult.artwork);
            player.data.set("nowPlayingBanner", bannerResult.buffer);
          }
        }
      } catch (error) {
        client.logger?.log(`[Player banner] ${error.message}`, "warn");
      }
    }

    const payload = {
      components: [createPlayerCard(client, player, track, {
        bannerName: bannerBuffer ? BANNER_NAME : null,
        controls: true,
        dashboardUrl: dashboardUrl(client, player),
      })].flat(),
      flags: MessageFlags.IsComponentsV2,
    };
    if (bannerBuffer) payload.files = [new AttachmentBuilder(bannerBuffer, { name: BANNER_NAME })];

    const response = await message.reply(payload);
    if (!player.data) player.data = new Map();
    player.data.set("nowPlayingMessage", response);
    return response;
  },
};
