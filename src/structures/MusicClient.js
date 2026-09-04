

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const { ClusterClient, getInfo } = require("discord-hybrid-sharding");
const loadPlayerManager = require("../loaders/loadPlayerManager");
const initializeAccessCleanup = require("../utils/accessCleanup");
const { discordShardOptions, resolveClusterInfo } = require("../utils/clusterMode");
const VoiceHealthMonitor = require("../utils/voiceHealthMonitor");

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

  connect() {
    return super.login(this.token);
  }
}

module.exports = MusicBot;
