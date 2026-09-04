const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch (error) {
      console.warn(`[config] Failed to load .env: ${error.message}`);
    }
  } else {
    console.warn("[config] process.loadEnvFile is unavailable on this Node version; .env was not loaded.");
  }
} else {
  console.warn(`[config] .env not found at ${envPath} — environment variables must be provided externally.`);
}

const list = (value = "") => value.split(",").map((item) => item.trim()).filter(Boolean);
const boolean = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};
/* Ensure the dashboard base URL always carries a scheme, e.g. "host:7645" → "http://host:7645" */
const withScheme = (value) => {
  if (!value) return value;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
};

const config = {
  token: process.env.BOT_TOKEN || "",
  prefix: process.env.BOT_PREFIX || "^",
  ownerID: list(process.env.OWNER_IDS),
  SpotifyID: process.env.SPOTIFY_CLIENT_ID || "",
  SpotifySecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  mongourl: process.env.MONGODB_URL || "",
  color: process.env.BOT_COLOR || "#3F4652",
  logs: process.env.LOG_LEVEL || "info",
  node_source: process.env.LAVALINK_SOURCE || "ytmsearch",
  groqApiKey: process.env.GROQ_API_KEY || "",

  dashboardEnabled: boolean(process.env.DASHBOARD_ENABLED),
  dashboardPort: Number(process.env.DASHBOARD_PORT) || 3000,
  dashboardBaseUrl: withScheme(process.env.DASHBOARD_BASE_URL || "http://localhost:3000"),
  dashboardAdminKey: process.env.DASHBOARD_ADMIN_KEY || "",
  discordClientId: process.env.DISCORD_CLIENT_ID || "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",

  /* Developer tab — realtime presence via Lanyard (public REST, no key).
     Defaults to the first owner ID from OWNER_IDS. */
  lanyardUrl: process.env.LANYARD_URL || "https://api.lanyard.rest",
  lanyardUserId: process.env.LANYARD_USER_ID || list(process.env.OWNER_IDS)[0] || "",

  links: {
    BG: process.env.BACKGROUND_URL || "",
    support: process.env.SUPPORT_URL || "",
    invite: process.env.INVITE_URL || "",
    name: "OZONE",
    power: "OZONE",
    vanity: process.env.VANITY_URL || "",
    guild: process.env.COMMUNITY_GUILD_ID || "",
  },

  Webhooks: {
    black: process.env.BLACKLIST_WEBHOOK_URL || "",
    player_create: process.env.PLAYER_CREATE_WEBHOOK_URL || "",
    player_delete: process.env.PLAYER_DELETE_WEBHOOK_URL || "",
    guild_join: process.env.GUILD_JOIN_WEBHOOK_URL || "",
    guild_leave: process.env.GUILD_LEAVE_WEBHOOK_URL || "",
    cmdrun: process.env.COMMAND_WEBHOOK_URL || "",
  },

  nodes: (() => {
    if (process.env.LAVALINK_NODES) {
      try {
        const parsed = JSON.parse(process.env.LAVALINK_NODES);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.warn("[config] Failed to parse LAVALINK_NODES JSON:", e.message);
      }
    }

    const isLocal = (url = "") => url.includes("localhost") || url.includes("127.0.0.1");

    const primary = {
      name: process.env.LAVALINK_NAME || "Amane-AjieDev-Primary",
      url: process.env.LAVALINK_URL || "lavalinkv4.serenetia.com:443",
      auth: process.env.LAVALINK_PASSWORD || "https://seretia.link/discord",
      secure: boolean(process.env.LAVALINK_SECURE, !isLocal(process.env.LAVALINK_URL)),
    };

    const publicNodes = [
      primary,
      {
        name: "AneFaiz-MilloHost",
        url: "lava-v4.millohost.my.id:443",
        auth: "https://discord.gg/mjS5J2K3ep",
        secure: true,
      },
      {
        name: "Kasawa-TH",
        url: "lava2.kasawa.pro:2334",
        auth: "youshallnotpass",
        secure: false,
      },
      {
        name: "AjieDev-Backup",
        url: "lava-v4.ajieblogs.eu.org:443",
        auth: "https://dsc.gg/ajidevserver",
        secure: true,
      },
    ];

    // Deduplicate by URL
    const seen = new Set();
    return publicNodes.filter((n) => {
      const key = `${n.url}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })(),

  node_options: {
    moveOnDisconnect: true,
    resume: true,
    resumeTimeout: 60,
    resumeByLibrary: true,
    reconnectTries: 10,
    reconnectInterval: 5,
    restTimeout: 60_000,
    voiceConnectionTimeout: 30_000,
    userAgent: "OZONE",
  },
};

config.validate = () => {
  const missing = [];
  if (!config.token) missing.push("BOT_TOKEN");
  if (!config.mongourl) missing.push("MONGODB_URL");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill in the values.`);
  }

  /* Discord only accepts http:// redirect URIs for localhost — warn early */
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(config.dashboardBaseUrl);
  if (config.dashboardEnabled && config.discordClientId && config.dashboardBaseUrl.startsWith("http://") && !isLocalhost) {
    console.warn(
      `[config] DASHBOARD_BASE_URL is "${config.dashboardBaseUrl}" (plain http on a non-localhost host). ` +
      "Discord OAuth2 requires an https:// redirect URI. Register the callback URL in the Developer Portal " +
      "(OAuth2 -> Redirects) — if http:// is rejected there, put the dashboard behind HTTPS " +
      "(cloudflared tunnel or Caddy reverse proxy)."
    );
  }
};

module.exports = config;
