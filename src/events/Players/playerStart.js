const { AttachmentBuilder, MessageFlags } = require("discord.js");
const { createPlayerCard } = require("../../utils/playerCard");
const { createTrackBanner } = require("../../utils/trackBanner");
const { syncVoiceChannelStatus } = require("../../utils/voiceChannelStatus");
const { reconcilePlaybackModes } = require("../../utils/playbackModes");

const BANNER_NAME = "now-playing-banner.png";

async function refreshNowPlayingMessage(client, player, options = {}) {
  try {
    const message = player.data?.get("nowPlayingMessage");
    const track = player.queue?.current;
    if (!message || !track) return;

    await message.edit({
      components: [createPlayerCard(client, player, track, {
        bannerName: player.data.get("nowPlayingBanner") ? BANNER_NAME : null,
        controls: true,
        dashboardUrl: dashboardUrl(client, player),
        ...options,
      })],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error) {
    player.data?.delete("nowPlayingMessage");
    client.logger?.log(`[Player] Could not refresh controls: ${error.message}`, "warn");
  }
}

function dashboardUrl(client, player) {
  if (!client.config?.dashboardEnabled || !client.config?.dashboardBaseUrl) return null;
  return `${client.config.dashboardBaseUrl}/?guild=${player.guildId}`;
}

async function updateNowPlayingButtons(client, player, isPaused) {
  await syncVoiceChannelStatus(client, player, { state: isPaused ? "paused" : "playing" });
  return refreshNowPlayingMessage(client, player, { paused: isPaused });
}

module.exports = {
  name: "playerStart",
  run: async (client, player, track) => {
    if (!player || !track) return;
    if (!player.data) player.data = new Map();

    // Music Quiz owns the player while it runs — no now-playing card, no
    // history pollution: the card title would spoil the answer.
    if (player.data.get("quiz")) return;

    reconcilePlaybackModes(player);
    await syncVoiceChannelStatus(client, player, { track, state: "playing" });
    const lastTrack = player.data.get("lastTrack");
    const changed = lastTrack && (lastTrack.identifier || lastTrack.uri) !== (track.identifier || track.uri);
    if (changed) {
      const history = [...(player.data.get("history") || []), lastTrack].slice(-50);
      player.data.set("history", history);
    }
    player.data.set("lastTrack", track);

    // Apply requester's personal aesthetic card theme
    const THEME_COLORS = {
      neon: 0xFF007F,
      cyber: 0x00FF66,
      amber: 0xF5B041,
      royal: 0x8E44AD,
      minimal: 0x3F4652,
      crimson: 0xE74C3C,
    };
    if (track.requester?.id) {
      const UserPreferences = require("../../schema/userpreferences");
      UserPreferences.findOne({ userId: track.requester.id }).then((pref) => {
        if (pref?.theme && THEME_COLORS[pref.theme]) {
          player.data.set("accentColor", THEME_COLORS[pref.theme]);
        }
      }).catch(() => {});
    }

    // Listening stats: one play per human listener in the VC (quiz snippets
    // above intentionally skip this so the chart stays honest).
    try {
      const listeningStats = require("../../utils/listeningStats");
      const vc = client.guilds.cache.get(player.guildId)?.channels?.cache?.get(player.voiceId);
      const listeners = vc ? [...vc.members.values()].filter((m) => !m.user.bot).map((m) => m.id) : [];
      listeningStats.trackPlayed(player, track, listeners);
    } catch { /* stats are best-effort */ }

    // Song alerts: notify listeners who subscribed to this artist/title
    try {
      const SongAlert = require("../../schema/songalert");
      const titleLower = (track.title || "").toLowerCase();
      const authorLower = (track.author || "").toLowerCase();
      const alerts = await SongAlert.find({ guildId: player.guildId }).lean();

      if (alerts?.length > 0) {
        const matches = alerts.filter(
          (a) => titleLower.includes(a.keyword) || authorLower.includes(a.keyword)
        );

        for (const alert of matches) {
          // Do not alert the requester
          if (track.requester?.id === alert.userId) continue;
          const user = client.users.cache.get(alert.userId);
          if (user) {
            user.send({
              content: `🔔 **Song Alert:** A track matching your alert \`${alert.keyword}\` just started playing in **${client.guilds.cache.get(player.guildId)?.name || "your server"}**!\n> **[${track.title}](${track.uri})** by *${track.author}*`,
            }).catch(() => {});
          }
        }
      }
    } catch {}

    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    try {
      client.voiceHealthMonitor?.updateActivity(player.guildId);

      const previous = player.data.get("nowPlayingMessage");
      if (previous?.deletable) await previous.delete().catch(() => {});

      let banner = null;
      try {
        banner = await createTrackBanner(track);
      } catch (error) {
        client.logger?.log(`[Player banner] ${error.message}`, "warn");
      }

      if (banner) player.data.set("nowPlayingBanner", banner);
      else player.data.delete("nowPlayingBanner");

      const payload = {
        components: [createPlayerCard(client, player, track, {
          bannerName: banner ? BANNER_NAME : null,
          controls: true,
          dashboardUrl: dashboardUrl(client, player),
        })],
        flags: MessageFlags.IsComponentsV2,
      };
      if (banner) payload.files = [new AttachmentBuilder(banner, { name: BANNER_NAME })];

      const message = await channel.send(payload);
      player.data.set("nowPlayingMessage", message);
    } catch (error) {
      client.logger?.log(`[Player] Could not send now-playing card: ${error.stack || error.message}`, "error");
    }
  },
  refreshNowPlayingMessage,
  updateNowPlayingButtons,
};
