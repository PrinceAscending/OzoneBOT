

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const { ClusterClient, getInfo } = require("discord-hybrid-sharding");
const loadPlayerManager = require("../loaders/loadPlayerManager");
const initializeAccessCleanup = require("../utils/accessCleanup");
const { discordShardOptions, resolveClusterInfo } = require("../utils/clusterMode");
const VoiceHealthMonitor = require("../utils/voiceHealthMonitor");
const ReconnectionGuard = require("../utils/reconnectionGuard");

class MusicBot extends Client {
  constructor() {
    const clusterInfo = resolveClusterInfo(getInfo);
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
      properties: {
        browser: "Discord Android",
      },
      allowedMentions: {
        parse: ["users"],
        repliedUser: false,
      },
      ...discordShardOptions(clusterInfo),
    });

    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.config = require("../config.js");
    this.config.validate();
    this.owners = this.config.ownerID;
    this.prefix = this.config.prefix;
    this.color = this.config.color;
    this.embedColor = this.config.color;
    this.button = require("../custom/button.js");
    this.embed = require("../custom/embed.js")(this.color);
    require("../custom/numformat")(this);
    this.aliases = new Collection();
    this.logger = require("../utils/logger.js");
    this.emoji = require("../emojis.js");
    this.cluster = clusterInfo ? new ClusterClient(this) : null;
    this.clusterInfo = clusterInfo || {
      SHARD_LIST: [0],
      TOTAL_SHARDS: 1,
      CLUSTER_COUNT: 1,
      CLUSTER: 0,
      CLUSTER_MANAGER_MODE: "standalone",
    };
    if (!this.token) this.token = this.config.token;
    this.manager = null;
    this.cooldowns = new Collection();
    this.commandStats = new Map();
    this.commandStatsSince = Date.now();
    this.voiceHealthMonitor = new VoiceHealthMonitor(this);
    this.reconnectionGuard = new ReconnectionGuard();

    if (process.env.DEBUG_VOICE === "true") {
      this.on("raw", (packet) => {
        if (["VOICE_SERVER_UPDATE", "VOICE_STATE_UPDATE"].includes(packet.t)) {
          this.logger.log(`[Voice debug] ${packet.t} for guild ${packet.d?.guild_id || "unknown"}`, "debug");
        }
      });
    }

    this._connectMongodb().catch((error) => {
      this.logger.log(`[DB] Initial connection failed: ${error.message}`, "error");
    });
    initializeAccessCleanup(this);
    // Listening-stats flusher (toptracks command) — needs a DB connection first.
    require("../utils/listeningStats").initialize(this);
    loadPlayerManager(this);
    [
      "loadClients",
      "loadCommands",
      "loadNodes",
      "loadPlayers",
    ].forEach((handler) => {
      require(`../loaders/${handler}`)(this);
    });

    // NOTE: The dashboard only starts on CLUSTER === 0 (multi-cluster
    // limitation). Players and guilds living on other clusters are invisible
    // to it, so in multi-cluster mode the dashboard shows partial data unless
    // the bot runs with a single cluster.
    if (this.config.dashboardEnabled && this.clusterInfo.CLUSTER === 0) {
      const createDashboard = require("../dashboard.js");
      const dashboard = createDashboard(this);
      // app.listen() returns an http.Server — 'error' (e.g. EADDRINUSE) fires
      // on the server, not the express app. Attaching it to the app leaves the
      // server error unhandled and crashes the process.
      const server = dashboard.listen(this.config.dashboardPort, () => {
        this.logger.log(`[Dashboard] Listening on ${this.config.dashboardBaseUrl}`, "ready");
      });
      server.on("error", (error) => {
        this.logger.log(`[Dashboard] Server error: ${error.message}`, "error");
      });
    }
  }
  async _connectMongodb() {
    const dbOptions = {
      autoIndex: false,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      serverSelectionTimeoutMS: 60000,
      family: 4,
    };

    mongoose.set("strictQuery", false);
    await mongoose.connect(this.config.mongourl, dbOptions);
    mongoose.Promise = global.Promise;

    mongoose.connection.on("connected", () => {
      this.logger.log("[DB] Database connected", "ready");
    });

    mongoose.connection.on("error", (err) => {
      this.logger.log(`[DB] Mongoose connection error: ${err.stack}`, "error");
    });

    mongoose.connection.on("disconnected", () => {
      this.logger.log("[DB] Mongoose disconnected", "error");
    });
  }

  /**
   * Safely and idempotently reconnects a 24/7 guild player.
   * Guarded against concurrent createPlayer calls and rapid feedback loops.
   */
  async reconnect247Guild(guildId, options = {}) {
    return this.reconnectionGuard.runGuarded(guildId, async () => {
      const TwoFourSeven = require("../schema/247");
      const data = await TwoFourSeven.findOne({ Guild: guildId });
      if (!data) return null;

      const voice = this.channels.cache.get(data.VoiceId);
      if (!voice) {
        this.logger.log(`[247] Voice channel ${data.VoiceId} not found in guild ${guildId}`, "warn");
        return null;
      }

      const guild = voice.guild;
      const botMember = guild.members.me || guild.members.cache.get(this.user.id);
      if (!botMember) return null;

      const permissions = voice.permissionsFor(botMember);
      if (!permissions || !permissions.has(["Connect", "Speak"])) {
        this.logger.log(`[247] Missing Connect/Speak permissions in ${voice.name} (${guild.name})`, "warn");
        return null;
      }

      // Check if existing player is already healthy and in the target voice channel
      const existingPlayer = this.manager?.players?.get(guildId);
      const isHealthy =
        existingPlayer &&
        existingPlayer.state !== 4 &&
        existingPlayer.state !== 5 &&
        botMember.voice?.channelId === data.VoiceId;
      if (isHealthy) {
        if (existingPlayer.state !== 1) existingPlayer.state = 1;
        return existingPlayer;
      }

      // Clean up any stale player instance or connection before recreation
      if (existingPlayer) {
        try {
          await existingPlayer.destroy();
        } catch {}
        await new Promise((r) => setTimeout(r, 600));
      }

      try {
        const player = await this.manager.createPlayer({
          guildId: data.Guild,
          voiceId: data.VoiceId,
          textId: data.TextId,
          volume: 80,
          deaf: true,
          shardId: guild.shardId,
        });

        if (this.voiceHealthMonitor && player) {
          this.voiceHealthMonitor.startMonitoring(player);
        }

        this.logger.log(`[247] Successfully connected to ${voice.name} in ${guild.name}`, "ready");
        return player;
      } catch (err) {
        this.logger.log(`[247] Reconnection failed for guild ${guildId}: ${err.message}`, "error");
        return null;
      }
    }, options);
  }

  connect() {
    return super.login(this.token);
  }
}

module.exports = MusicBot;
