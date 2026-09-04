const express = require("express");
const crypto = require("crypto");
const path = require("path");
const axios = require("axios");
const { ChannelType, REST, Routes } = require("discord.js");
const Logger = require("./utils/logger");
const Aimode = require("./schema/aimode");
const Blacklist = require("./schema/blacklist");
const PrefixSchema = require("./schema/prefix");
const Liked = require("./schema/liked");
const Profile = require("./schema/profile");
const Session = require("./schema/session");
const aiUtils = require("./utils/ai");
const lyricsFinder = require("@flytri/lyrics-finder");
const { setLoopMode, setAutoplay, stopPlaybackModes } = require("./utils/playbackModes");

const DISCORD_API = "https://discord.com/api";
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000; // 12h
const USER_SESSION_TTL = 24 * 60 * 60 * 1000; // 24h
const ID_PATTERN = /^\d{17,20}$/;
const MAX_ADMIN_KEY_ATTEMPTS = 10;

// Build a full Discord CDN URL from a guild icon hash. Idempotent: full
// URLs pass through untouched (handles both fresh and stored sessions).
const cdnGuildIcon = (id, icon) => {
  if (!icon) return null;
  if (String(icon).startsWith("http")) return icon;
  const ext = String(icon).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=128`;
};
const PLAYER_ACTIONS = new Set([
  "pause", "resume", "skip", "stop", "volume", "seek", "loop", "shuffle", "autoplay", "disconnect", "remove",
]);

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createDashboard(client) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "dashboard")));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'"
    );
    next();
  });

  const config = client.config;
  const adminSessions = new Map();
  const userSessions = new Map();
  const adminKeyAttempts = new Map();

  const redirectUri = `${config.dashboardBaseUrl}/auth/callback`;

  /* ---------- helpers ---------- */

  const issueAdminToken = () => {
    const token = crypto.randomBytes(32).toString("hex");
    adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL);
    return token;
  };

  const requireAdmin = (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const adminExpires = adminSessions.get(token);
    const userSession = userSessions.get(token);
    if (adminExpires && adminExpires >= Date.now()) return next();
    if (userSession && userSession.isAdmin && userSession.expires >= Date.now()) return next();
    adminSessions.delete(token);
    return res.status(401).json({ error: "Unauthorized" });
  };

  const requireUser = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      const session = userSessions.get(token);
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      if (session) {
        if (session.expires < Date.now()) {
          userSessions.delete(token);
          return res.status(401).json({ error: "Unauthorized" });
        }
        req.session = session;
        return next();
      }
      /* session not in memory (e.g. after a restart) — hydrate from MongoDB */
      const stored = await Session.findOne({ token });
      if (!stored || stored.expires < Date.now()) {
        if (stored) await Session.deleteOne({ token }).catch(() => {});
        return res.status(401).json({ error: "Unauthorized" });
      }
      const hydrated = {
        user: { id: stored.user?.id, username: stored.user?.username, avatar: stored.user?.avatar || "" },
        guilds: (stored.guilds || []).map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
        connections: (stored.connections || []).map((c) => ({ type: c.type, name: c.name, verified: Boolean(c.verified) })),
        isAdmin: Boolean(stored.isAdmin),
        expires: stored.expires,
      };
      userSessions.set(token, hydrated);
      req.session = hydrated;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  };

  const guildSummary = (guild) => {
    const player = client.manager?.players.get(guild.id);
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 128 }),
      members: guild.memberCount,
      ownerId: guild.ownerId,
      hasPlayer: Boolean(player),
      nowPlaying: player?.queue?.current
        ? { title: player.queue.current.title, author: player.queue.current.author }
        : null,
    };
  };

  const playerInfo = (player) => {
    const guild = client.guilds.cache.get(player.guildId);
    const track = player.queue?.current;
    return {
      guildId: player.guildId,
      guildName: guild?.name || player.guildId,
      voiceChannel: guild?.channels.cache.get(player.voiceId)?.name || player.voiceId,
      textChannel: guild?.channels.cache.get(player.textId)?.name || player.textId,
      track: track ? {
        title: track.title,
        author: track.author,
        uri: track.uri,
        length: track.length,
      } : null,
      paused: player.shoukaku?.paused ?? false,
      volume: Math.min(200, Math.max(0, Math.round(player.volume ?? 0))),
      loop: player.loop || "none",
      queueSize: player.queue?.length ?? 0,
    };
  };

  const rateLimitAdminKey = (ip) => {
    const entry = adminKeyAttempts.get(ip) || { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
    if (entry.resetAt < Date.now()) {
      entry.count = 0;
      entry.resetAt = Date.now() + 10 * 60 * 1000;
    }
    entry.count++;
    adminKeyAttempts.set(ip, entry);
    return entry.count > MAX_ADMIN_KEY_ATTEMPTS;
  };

  const playerState = (player) => {
    if (!player) return null;
    const guild = client.guilds.cache.get(player.guildId);
    const track = player.queue?.current;
    return {
      guildId: player.guildId,
      guildName: guild?.name || player.guildId,
      voiceChannel: guild?.channels.cache.get(player.voiceId)?.name || player.voiceId,
      track: track ? {
        title: track.title,
        author: track.author,
        uri: track.uri,
        length: track.length || 0,
        thumbnail: track.thumbnail || null,
        isStream: Boolean(track.isStream),
        requester: track.requester?.username || null,
      } : null,
      position: player.shoukaku?.position ?? 0,
      paused: Boolean(player.shoukaku?.paused),
      volume: Math.min(200, Math.max(0, Math.round(player.volume ?? 100))),
      loop: player.loop || "none",
      autoplay: Boolean(player.data?.get("autoplay")),
      queue: (player.queue?.map ? player.queue.map((t) => ({
        title: t.title,
        author: t.author,
        length: t.length || 0,
        uri: t.uri,
      })) : []).slice(0, 20),
      history: (player.data?.get("history") || []).slice(-10).map((t) => ({
        title: t.title,
        author: t.author,
        uri: t.uri,
        length: t.length || 0,
      })),
    };
  };

  const canControlPlayer = (guild, userId, player) => {
    if (!player) return { ok: false, code: "NO_PLAYER", message: "No active player in this server." };
    const voiceChannelId = guild.members.cache.get(userId)?.voice?.channelId;
    if (!voiceChannelId) return { ok: false, code: "NOT_IN_VC", message: "You must be in a voice channel to control the player." };
    if (voiceChannelId !== player.voiceId) return { ok: false, code: "WRONG_VC", message: "You must be in the same voice channel as OZONE." };
    return { ok: true, voiceChannelId };
  };

  /* ---------- public API ---------- */

  app.get("/api/stats", async (_req, res) => {
    const guilds = client.guilds.cache;
    const aiUsers = await Aimode.countDocuments({ enabled: true }).catch(() => 0);
    res.json({
      name: "OZONE",
      status: client.isReady?.() ? "online" : "connecting",
      ping: Math.round(client.ws?.ping || 0),
      uptime: process.uptime(),
      guilds: guilds.size,
      users: guilds.reduce((total, g) => total + (g.memberCount || 0), 0),
      commands: client.commands?.size || 0,
      slashCommands: client.slashCommands?.size || 0,
      players: client.manager?.players.size || 0,
      aiUsers,
      memory: process.memoryUsage(),
      node: process.version,
      cluster: client.clusterInfo?.CLUSTER ?? 0,
      clusters: client.clusterInfo?.CLUSTER_COUNT ?? 1,
    });
  });

  app.get("/api/guilds", (_req, res) => {
    const guilds = [...client.guilds.cache.values()].map(guildSummary);
    res.json({ guilds });
  });

  app.get("/api/guild/:id", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: "Guild not found" });
    const prefixData = await PrefixSchema.findOne({ Guild: guild.id }).catch(() => null);
    const player = client.manager?.players.get(guild.id);
    res.json({
      ...guildSummary(guild),
      prefix: prefixData?.Prefix || client.prefix,
      player: player ? playerInfo(player) : null,
    });
  });

  /* ---------- developer presence (Lanyard) ---------- */

  let lanyardCache = { at: 0, data: null };
  const LANYARD_TTL = 10_000;

  app.get("/api/dev", async (_req, res) => {
    const userId = config.lanyardUserId;
    if (!userId) return res.status(503).json({ ok: false, error: "Owner user id not configured" });
    if (lanyardCache.data && Date.now() - lanyardCache.at < LANYARD_TTL) {
      return res.json(lanyardCache.data);
    }
    try {
      const { data } = await axios.get(`${config.lanyardUrl}/v1/users/${userId}`, { timeout: 5000 });
      const d = data?.data;
      if (!d) return res.status(502).json({ ok: false, error: "User is not tracked by Lanyard" });

      /* owner's dashboard connections — from their most recent stored OAuth session */
      let connections = [];
      try {
        const ownerSession = await Session.findOne({ "user.id": userId }).sort({ expires: -1 }).lean();
        connections = (ownerSession?.connections || []).map((c) => ({
          type: String(c.type || ""),
          name: String(c.name || "").slice(0, 100),
          verified: Boolean(c.verified),
        }));
      } catch (error) {
        Logger.log(`[Dashboard] Dev connections lookup failed: ${error.message}`, "error");
      }

      const payload = {
        ok: true,
        userId,
        connections,
        discord: d.discord_user
          ? {
              id: d.discord_user.id,
              username: d.discord_user.username,
              globalName: d.discord_user.global_name || d.discord_user.username,
              avatar: d.discord_user.avatar,
              bot: Boolean(d.discord_user.bot),
            }
          : null,
        status: d.discord_status || "offline",
        activities: (d.activities || []).map((a) => ({
          type: a.type,
          name: a.name,
          state: a.state || null,
          details: a.details || null,
          timestamps: a.timestamps || null,
          applicationId: a.application_id || null,
          emoji: a.emoji ? { name: a.emoji.name, id: a.emoji.id, animated: a.emoji.animated } : null,
          assets: a.assets
            ? {
                largeImage: a.assets.large_image,
                largeText: a.assets.large_text,
                smallImage: a.assets.small_image,
                smallText: a.assets.small_text,
              }
            : null,
        })),
        spotify: d.spotify
          ? {
              title: d.spotify.song,
              artist: d.spotify.artist,
              album: d.spotify.album,
              albumArt: d.spotify.album_art_url,
              trackId: d.spotify.track_id,
              start: d.spotify.timestamps?.start,
              end: d.spotify.timestamps?.end,
            }
          : null,
        listeningToSpotify: Boolean(d.listening_to_spotify),
        kv: d.kv || {},
        fetchedAt: Date.now(),
      };
      lanyardCache = { at: Date.now(), data: payload };
      res.json(payload);
    } catch (error) {
      res.status(502).json({ ok: false, error: `Lanyard unreachable: ${error.message}` });
    }
  });

  /* ---------- Discord OAuth2 (server owners) ---------- */

  app.get("/auth/login", (_req, res) => {
    if (!config.discordClientId || !config.discordClientSecret) {
      return res.status(503).json({ error: "OAuth2 is not configured" });
    }
    const params = new URLSearchParams({
      client_id: config.discordClientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify guilds connections",
    });
    res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    try {
      const tokenRes = await axios.post(
        `${DISCORD_API}/oauth2/token`,
        new URLSearchParams({
          client_id: config.discordClientId,
          client_secret: config.discordClientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15_000 }
      );

      const accessToken = tokenRes.data.access_token;
      const [userRes, guildsRes, connRes] = await Promise.all([
        axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 }),
        axios.get(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 }),
        axios.get(`${DISCORD_API}/users/@me/connections`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 }),
      ]);

      const user = userRes.data;
      const manageable = guildsRes.data.filter((g) => {
        const botGuild = client.guilds.cache.get(g.id);
        if (!botGuild) return false;
        const perms = BigInt(g.permissions);
        const MANAGE_GUILD = 1n << 5n;
        return g.owner || (perms & MANAGE_GUILD) === MANAGE_GUILD;
      });

      const connections = (Array.isArray(connRes.data) ? connRes.data : [])
        .filter((c) => c.verified)
        .map((c) => ({ type: String(c.type), name: String(c.name || "").slice(0, 100), verified: Boolean(c.verified) }));

      const token = crypto.randomBytes(32).toString("hex");
      const session = {
        user: { id: user.id, username: user.username, avatar: user.avatar },
        guilds: manageable.map((g) => ({ id: g.id, name: g.name, icon: cdnGuildIcon(g.id, g.icon) })),
        connections,
        isAdmin: Array.isArray(config.ownerID) ? config.ownerID.includes(user.id) : config.ownerID === user.id,
        expires: Date.now() + USER_SESSION_TTL,
      };
      userSessions.set(token, session);
      Session.updateOne(
        { token },
        {
          $set: {
            user: session.user,
            guilds: session.guilds,
            connections: session.connections,
            isAdmin: session.isAdmin,
            expires: session.expires,
          },
        },
        { upsert: true },
      ).catch((error) => Logger.log(`[Dashboard] Session persist failed: ${error.message}`, "error"));

      res.redirect(`/?session=${token}`);
    } catch (error) {
      Logger.log(`[Dashboard] OAuth2 callback failed: ${error.message}`, "error");
      res.status(500).send("Login failed");
    }
  });

  app.post("/api/me/logout", requireUser, async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    userSessions.delete(token);
    await Session.deleteOne({ token }).catch(() => {});
    res.json({ ok: true });
  });

  app.get("/api/me", requireUser, (req, res) => {
    const vcs = [];
    for (const player of client.manager?.players.values() || []) {
      const guild = client.guilds.cache.get(player.guildId);
      if (!guild) continue;
      const member = guild.members.cache.get(req.session.user.id);
      if (member?.voice?.channelId !== player.voiceId) continue;
      vcs.push({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 128 }),
        channelName: guild.channels.cache.get(player.voiceId)?.name || player.voiceId,
        track: player.queue?.current?.title || null,
      });
    }
    res.json({
      user: req.session.user,
      guilds: (req.session.guilds || []).map((g) => ({
        id: g.id,
        name: g.name,
        icon: cdnGuildIcon(g.id, g.icon),
      })),
      vcs,
      isAdmin: Boolean(req.session.isAdmin),
    });
  });

  app.get("/api/me/guild/:id", requireUser, async (req, res) => {
    const guild = req.session.guilds.find((g) => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: "You don't manage this server" });
    const botGuild = client.guilds.cache.get(guild.id);
    if (!botGuild) return res.status(404).json({ error: "Bot is not in this server" });
    const prefixData = await PrefixSchema.findOne({ Guild: guild.id }).catch(() => null);
    const player = client.manager?.players.get(guild.id);
    res.json({
      ...guildSummary(botGuild),
      prefix: prefixData?.Prefix || client.prefix,
      player: player ? playerInfo(player) : null,
    });
  });

  /* ---------- realtime player control (VC-required) ---------- */

  app.get("/api/player/:guildId", requireUser, (req, res) => {
    const { guildId } = req.params;
    if (!ID_PATTERN.test(guildId)) return res.status(400).json({ error: "Invalid guild id" });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });
    const player = client.manager?.players.get(guildId);
    const control = canControlPlayer(guild, req.session.user.id, player);
    res.json({
      ...playerState(player),
      canControl: control.ok,
      controlError: control.message,
    });
  });

  app.post("/api/player/:guildId/control", requireUser, async (req, res) => {
    const { guildId } = req.params;
    const { action, value } = req.body || {};
    if (!ID_PATTERN.test(guildId)) return res.status(400).json({ error: "Invalid guild id" });
    if (!PLAYER_ACTIONS.has(action)) return res.status(400).json({ error: "Unknown action" });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });
    const player = client.manager?.players.get(guildId);
    const control = canControlPlayer(guild, req.session.user.id, player);
    if (!control.ok) return res.status(403).json({ error: control.message, code: control.code });

    try {
      switch (action) {
        case "pause":
          if (player.playing) player.pause(true);
          break;
        case "resume":
          player.pause(false);
          break;
        case "skip":
          player.skip();
          break;
        case "stop": {
          player.queue.clear();
          stopPlaybackModes(player);
          player.playing = false;
          player.paused = false;
          player.skip();
          break;
        }
        case "volume": {
          const volume = Math.max(0, Math.min(200, Number(value) || 100));
          await player.setVolume(volume);
          break;
        }
        case "seek": {
          const ms = Math.max(0, Number(value) || 0);
          await player.shoukaku.seekTo(ms);
          break;
        }
        case "loop": {
          const mode = ["none", "track", "queue"].includes(value) ? value : "none";
          setLoopMode(player, mode);
          break;
        }
        case "shuffle":
          player.queue.shuffle();
          break;
        case "autoplay":
          setAutoplay(player, Boolean(value));
          break;
        case "remove": {
          const index = Number(value);
          if (!Number.isInteger(index) || index < 0 || index >= (player.queue?.length || 0)) {
            return res.status(400).json({ error: "Invalid queue index" });
          }
          player.queue.remove(index);
          break;
        }
        case "disconnect":
          await player.destroy();
          break;
      }
    } catch (error) {
      Logger.log(`[Dashboard] Player action "${action}" failed: ${error.message}`, "error");
      return res.status(500).json({ error: `Action failed: ${error.message}` });
    }

    res.json({ ok: true, ...playerState(player) });
  });

  app.get("/api/player/:guildId/lyrics", requireUser, async (req, res) => {
    const { guildId } = req.params;
    if (!ID_PATTERN.test(guildId)) return res.status(400).json({ error: "Invalid guild id" });
    const player = client.manager?.players.get(guildId);
    const track = player?.queue?.current;
    if (!track) return res.status(404).json({ error: "Nothing is playing" });
    try {
      const lyrics = await lyricsFinder(track.author, track.title);
      if (!lyrics) return res.status(404).json({ error: "No lyrics found for this track" });
      res.json({ title: track.title, author: track.author, lyrics: lyrics.slice(0, 6000) });
    } catch {
      res.status(404).json({ error: "No lyrics found for this track" });
    }
  });

  /* ---------- favorites (per user) ---------- */

  app.get("/api/me/favorites", requireUser, async (req, res) => {
    const record = await Liked.findOne({ userId: req.session.user.id }).catch(() => null);
    res.json({ songs: record?.songs || [] });
  });

  /* ---------- listening leaderboard ---------- */

  app.get("/api/leaderboard/:guildId", requireUser, async (req, res) => {
    const { guildId } = req.params;
    if (!ID_PATTERN.test(guildId)) return res.status(400).json({ error: "Invalid guild id" });
    const rows = await require("./utils/listeningStats").guildLeaderboard(guildId, 10).catch(() => []);
    // Resolve usernames from the shard-local cache; unknown ids fall back to raw.
    const listeners = rows.map((row) => {
      const user = client.users.cache.get(row.userId);
      return {
        userId: row.userId,
        username: user?.username || null,
        seconds: row.seconds || 0,
        plays: row.plays || 0,
      };
    });
    res.json({ listeners });
  });

  app.post("/api/me/favorites", requireUser, async (req, res, next) => {
    try {
      const { title, url, duration, thumbnail, author } = req.body || {};
      if (!title || !url) return res.status(400).json({ error: "title and url required" });
      let record = await Liked.findOne({ userId: req.session.user.id });
      if (!record) record = await Liked.create({ userId: req.session.user.id, songs: [] });
      if (!record.songs.some((s) => s.url === url)) {
        record.songs.push({
          title: String(title).slice(0, 200),
          url: String(url).slice(0, 500),
          duration: duration ? String(duration) : undefined,
          thumbnail: thumbnail ? String(thumbnail) : undefined,
          author: author ? String(author).slice(0, 200) : undefined,
        });
        await record.save();
      }
      res.json({ songs: record.songs });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/me/favorites", requireUser, async (req, res, next) => {
    try {
      const { url } = req.body || {};
      if (!url) return res.status(400).json({ error: "url required" });
      const record = await Liked.findOne({ userId: req.session.user.id });
      if (record) {
        record.songs = record.songs.filter((s) => s.url !== url);
        await record.save();
      }
      res.json({ songs: record?.songs || [] });
    } catch (error) {
      next(error);
    }
  });

  /* ---------- profile (per user) ---------- */

  const avatarUrl = (user, size = 256) => {
    if (user?.avatar) {
      const ext = user.avatar.startsWith("a_") ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
    }
    const idx = Number((BigInt(user?.id || 0) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  };

  app.get("/api/me/profile", requireUser, async (req, res) => {
    const [profile, liked] = await Promise.all([
      Profile.findOne({ userId: req.session.user.id }).catch(() => null),
      Liked.findOne({ userId: req.session.user.id }).catch(() => null),
    ]);
    let vcs = 0;
    for (const player of client.manager?.players.values() || []) {
      const guild = client.guilds.cache.get(player.guildId);
      if (!guild) continue;
      const member = guild.members.cache.get(req.session.user.id);
      if (member?.voice?.channelId === player.voiceId) vcs += 1;
    }
    res.json({
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        avatarUrl: avatarUrl(req.session.user),
      },
      profile: profile ? { displayName: profile.displayName, bio: profile.bio } : { displayName: "", bio: "" },
      connections: req.session.connections || [],
      connectionsStale: !Array.isArray(req.session.connections),
      stats: {
        favorites: liked?.songs?.length || 0,
        guilds: req.session.guilds?.length || 0,
        vcs,
      },
      isAdmin: Boolean(req.session.isAdmin),
    });
  });

  app.put("/api/me/profile", requireUser, async (req, res) => {
    const { displayName, bio } = req.body || {};
    const update = {};
    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (trimmed.length > 32) return res.status(400).json({ error: "Display name must be 32 characters or fewer" });
      const name = trimmed.slice(0, 32);
      update.displayName = name;
    }
    if (bio !== undefined) {
      const text = String(bio).trim().slice(0, 200);
      if (text.length > 200) return res.status(400).json({ error: "Bio must be 200 characters or fewer" });
      update.bio = text;
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
    const profile = await Profile.findOneAndUpdate(
      { userId: req.session.user.id },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { new: true, upsert: true },
    ).catch(() => null);
    if (!profile) return res.status(500).json({ error: "Failed to save profile" });
    res.json({ profile: { displayName: profile.displayName, bio: profile.bio } });
  });

  /* ---------- AI chat (per user) ---------- */

  app.post("/api/ai/ask", requireUser, async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });
    const userId = req.session.user.id;
    const content = String(message).slice(0, 2000);
    if (aiUtils.isSessionExpired(userId)) aiUtils.clearHistory(userId);
    aiUtils.touchActivity(userId);
    const messages = aiUtils.getHistory(userId);
    messages.push({ role: "user", content });
    const result = await aiUtils.askGroq(client, messages);
    if (!result.ok) return res.status(502).json({ error: result.message });
    aiUtils.addToHistory(userId, "user", content);
    aiUtils.addToHistory(userId, "assistant", result.content);
    res.json({ reply: result.content });
  });

  /* ---------- admin API ---------- */

  // Passkey entry: only via secret URL path, e.g. /admin/<key>
  app.get("/admin/:key", (req, res) => {
    if (rateLimitAdminKey(req.ip || "unknown")) {
      return res.status(429).send("Too many attempts. Try again in 10 minutes.");
    }
    const { key } = req.params;
    if (!config.dashboardAdminKey || !safeEqual(key, config.dashboardAdminKey)) {
      return res.status(401).send("Invalid admin key");
    }
    res.redirect(`/?admin=${issueAdminToken()}`);
  });

  app.post("/api/admin/logout", requireAdmin, (req, res) => {
    adminSessions.delete(req.headers.authorization?.replace("Bearer ", ""));
    res.json({ ok: true });
  });

  app.get("/api/admin/command-stats", requireAdmin, (_req, res) => {
    const stats = [...(client.commandStats?.entries() || [])]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    res.json({
      stats,
      total: stats.reduce((sum, entry) => sum + entry.count, 0),
      since: client.commandStatsSince || null,
    });
  });

  app.get("/api/admin/blacklist", requireAdmin, async (_req, res) => {
    const records = await Blacklist.find({}).sort({ timestamp: -1 }).limit(100).catch(() => []);
    const users = records.map((r) => {
      const user = client.users.cache.get(r.userId);
      return { userId: r.userId, username: user?.username || r.userId, timestamp: r.timestamp };
    });
    res.json({ users });
  });

  app.get("/api/admin/players", requireAdmin, (_req, res) => {
    const players = [...(client.manager?.players.values() || [])].map(playerInfo);
    res.json({ players });
  });

  app.get("/api/admin/logs", requireAdmin, (_req, res) => {
    res.json({ logs: Logger.buffer.slice(-100) });
  });

  app.get("/api/admin/ai", requireAdmin, async (_req, res) => {
    const records = await Aimode.find({}).sort({ updatedAt: -1 }).limit(50).catch(() => []);
    const users = records.map((r) => {
      const user = client.users.cache.get(r.userId);
      return {
        userId: r.userId,
        username: user?.username || r.userId,
        enabled: r.enabled,
        updatedAt: r.updatedAt,
      };
    });
    res.json({ users });
  });

  app.post("/api/admin/ai/toggle", requireAdmin, async (req, res, next) => {
    try {
      const { userId } = req.body || {};
      if (!userId) return res.status(400).json({ error: "userId required" });
      const record = await Aimode.findOne({ userId });
      if (record) {
        record.enabled = !record.enabled;
        record.updatedAt = Date.now();
        await record.save();
        return res.json({ userId, enabled: record.enabled });
      }
      await Aimode.create({ userId, enabled: true });
      res.json({ userId, enabled: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/blacklist", requireAdmin, async (req, res, next) => {
    try {
      const { userId } = req.body || {};
      if (!userId) return res.status(400).json({ error: "userId required" });
      const existing = await Blacklist.findOne({ userId });
      if (existing) {
        await Blacklist.deleteOne({ userId });
        return res.json({ userId, blacklisted: false });
      }
      await Blacklist.create({ userId });
      res.json({ userId, blacklisted: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/restart", requireAdmin, (_req, res) => {
    // process.exit(0) in standalone mode kills the bot permanently — restart is
    // only safe when a cluster manager (ozone.js) is supervising the process.
    const managed = process.env.CLUSTER_MANAGER === "true" || process.env.CLUSTER !== undefined;
    if (!managed) {
      return res.status(400).json({ error: "Restart is only available when running under a cluster manager (ozone.js)." });
    }
    res.json({ ok: true, message: "Restarting..." });
    setTimeout(() => process.exit(0), 500);
  });

  app.post("/api/admin/reload", requireAdmin, async (_req, res) => {
    try {
      const fs = require("fs");
      const commandsDir = path.join(__dirname, "commands");
      client.commands.clear();
      client.slashCommands.clear();
      client.aliases.clear();
      const categories = fs.readdirSync(commandsDir);
      let count = 0;
      let slashCount = 0;
      for (const category of categories) {
        const categoryPath = path.join(commandsDir, category);
        if (!fs.lstatSync(categoryPath).isDirectory()) continue;
        for (const file of fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"))) {
          const commandPath = path.join(categoryPath, file);
          delete require.cache[require.resolve(commandPath)];
          const command = require(commandPath);
          if (!command.name) continue;
          client.commands.set(command.name, command);
          count++;
          // Mirror loadCommands.js: only register for slash if there is a real
          // slashExecute function OR declared slashOptions (length > 0).
          const slashExecute =
            typeof command.slashExecute === "function" ? command.slashExecute : undefined;
          if (slashExecute || (Array.isArray(command.slashOptions) && command.slashOptions.length > 0)) {
            client.slashCommands.set(command.name, {
              name: command.name,
              description: command.description || "No description provided",
              options: command.slashOptions || [],
              category: command.category,
              execute: command.execute,
              slashExecute,
              autocomplete: command.autocomplete,
              run: command.run,
              player: command.player,
              inVoiceChannel: command.inVoiceChannel,
              sameVoiceChannel: command.sameVoiceChannel,
              botPerms: command.botPerms,
              userPerms: command.userPerms,
              owner: command.owner || false,
            });
            slashCount++;
          }
        }
      }

      // Re-deploy slash commands to Discord (mirrors src/commands/Owner/reload.js)
      if (client.slashCommands.size > 0) {
        const rest = new REST({ version: "10" }).setToken(client.token);
        const commands = Array.from(client.slashCommands.values()).map((cmd) => {
          const commandData = {
            name: cmd.name,
            description: cmd.description,
            options: cmd.options || [],
          };
          if (cmd.owner) {
            commandData.default_member_permissions = "8";
            commandData.dm_permission = false;
          }
          return commandData;
        });
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      }

      Logger.log(`[Dashboard] Reloaded ${count} commands (${slashCount} slash)`, "cmd");
      res.json({ ok: true, commands: count, slashCommands: slashCount });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/broadcast", requireAdmin, async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });
    const content = String(message).slice(0, 2000);
    let sent = 0;
    const failed = [];
    const targets = [];
    for (const guild of client.guilds.cache.values()) {
      const channel = guild.systemChannel ||
        guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.permissionsFor(client.user)?.has("SendMessages"));
      if (!channel) { failed.push(guild.name); continue; }
      targets.push({ guildName: guild.name, channel });
    }

    // Discord global REST rate limit is ~50 req/s; throttle to 5 concurrent
    // sends with a 200ms gap so we don't trip it on a 1k+ guild bot.
    const CONCURRENCY = 5;
    const GAP_MS = 200;
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const idx = cursor++;
        const { guildName, channel } = targets[idx];
        try {
          await channel.send({ content });
          sent++;
        } catch { failed.push(guildName); }
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));
    res.json({ sent, failed });
  });

  app.post("/api/admin/leave-guild", requireAdmin, async (req, res, next) => {
    try {
      const { guildId } = req.body || {};
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Guild not found" });
      await guild.leave();
      res.json({ ok: true, guildId, name: guild.name });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/players/stop", requireAdmin, async (_req, res) => {
    const players = [...(client.manager?.players.values() || [])];
    for (const player of players) {
      try { await player.destroy(); } catch { /* already gone */ }
    }
    res.json({ ok: true, stopped: players.length });
  });

  app.post("/api/admin/presence", requireAdmin, async (req, res, next) => {
    try {
      const { text, type } = req.body || {};
      if (!text) return res.status(400).json({ error: "text required" });
      const types = { PLAYING: 0, STREAMING: 1, LISTENING: 2, WATCHING: 3, COMPETING: 5 };
      const activityType = types[String(type || "PLAYING").toUpperCase()] ?? 0;
      await client.user.setActivity(String(text).slice(0, 128), { type: activityType });
      res.json({ ok: true, text: String(text).slice(0, 128), type: activityType });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/dm", requireAdmin, async (req, res) => {
    const { userId, message } = req.body || {};
    if (!userId || !message) return res.status(400).json({ error: "userId and message required" });
    try {
      const user = await client.users.fetch(userId);
      await user.send({ content: String(message).slice(0, 2000) });
      res.json({ ok: true, userId, username: user.username });
    } catch (error) {
      res.status(400).json({ error: `Could not DM user: ${error.message}` });
    }
  });

  /* Sweep expired user/admin sessions and rate limit records every 10 minutes */
  const sessionSweep = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of userSessions) {
      if (session.expires < now) userSessions.delete(token);
    }
    for (const [token, expires] of adminSessions) {
      if (expires < now) adminSessions.delete(token);
    }
    for (const [ip, entry] of adminKeyAttempts) {
      if (entry.resetAt < now) adminKeyAttempts.delete(ip);
    }
    Session.deleteMany({ expires: { $lt: now } }).catch(() => {});
  }, 10 * 60 * 1000);
  sessionSweep.unref?.();

  /* Global error handler — any route that throws (sync or async) lands here
     instead of crashing the process with an unhandled rejection. */
  app.use((err, _req, res, _next) => {
    Logger.log(`[Dashboard] Route error: ${err?.message || err}`, "error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  });

  return app;
}

module.exports = createDashboard;