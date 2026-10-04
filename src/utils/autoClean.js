const { PermissionsBitField } = require("discord.js");
const AutoCleanModel = require("../schema/autoclean");

const configCache = new Map();
const CACHE_TTL_MS = 300_000; // 5 minutes

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  deleteUserMessage: true,
  userMessageDelay: 3, // seconds
  botMessageTimeout: 10, // seconds
  deleteWarnings: true,
});

async function getAutoCleanConfig(guildId) {
  if (!guildId) return { ...DEFAULT_CONFIG };

  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached._cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const doc = await AutoCleanModel.findOne({ guildId }).lean();
    const config = doc
      ? {
          enabled: doc.enabled ?? DEFAULT_CONFIG.enabled,
          deleteUserMessage: doc.deleteUserMessage ?? DEFAULT_CONFIG.deleteUserMessage,
          userMessageDelay: doc.userMessageDelay ?? DEFAULT_CONFIG.userMessageDelay,
          botMessageTimeout: doc.botMessageTimeout ?? DEFAULT_CONFIG.botMessageTimeout,
          deleteWarnings: doc.deleteWarnings ?? DEFAULT_CONFIG.deleteWarnings,
        }
      : { ...DEFAULT_CONFIG };

    configCache.set(guildId, { config, _cachedAt: Date.now() });
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function updateAutoCleanConfig(guildId, updates) {
  if (!guildId) return null;

  const doc = await AutoCleanModel.findOneAndUpdate(
    { guildId },
    { $set: updates },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const config = {
    enabled: doc.enabled ?? DEFAULT_CONFIG.enabled,
    deleteUserMessage: doc.deleteUserMessage ?? DEFAULT_CONFIG.deleteUserMessage,
    userMessageDelay: doc.userMessageDelay ?? DEFAULT_CONFIG.userMessageDelay,
    botMessageTimeout: doc.botMessageTimeout ?? DEFAULT_CONFIG.botMessageTimeout,
    deleteWarnings: doc.deleteWarnings ?? DEFAULT_CONFIG.deleteWarnings,
  };

  configCache.set(guildId, { config, _cachedAt: Date.now() });
  return config;
}

function scheduleDelete(message, timeoutSeconds = 10) {
  if (!message) return;
  const timeoutMs = Math.max(1, timeoutSeconds) * 1000;

  setTimeout(async () => {
    try {
      if (message.deletable !== false && typeof message.delete === "function") {
        await message.delete().catch(() => {});
      }
    } catch {}
  }, timeoutMs);
}

async function cleanBotReply(msgOrPromise, guildId, customTimeout = null) {
  try {
    const msg = msgOrPromise && typeof msgOrPromise.then === "function" ? await msgOrPromise : msgOrPromise;
    if (!msg || typeof msg.delete !== "function") return msg;

    const config = await getAutoCleanConfig(guildId);
    if (!config.enabled) return msg;

    const timeout = customTimeout ?? config.botMessageTimeout;
    scheduleDelete(msg, timeout);
    return msg;
  } catch {
    return null;
  }
}

async function cleanUserCommand(message, customDelay = null) {
  if (!message || !message.guild || !message.channel) return;

  try {
    const config = await getAutoCleanConfig(message.guild.id);
    if (!config.enabled || !config.deleteUserMessage) return;

    const me = message.guild.members.me;
    if (!me?.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages)) {
      return;
    }

    const delay = customDelay ?? config.userMessageDelay;
    scheduleDelete(message, delay);
  } catch {}
}

async function pruneChannel(channel, amount = 50, client = null) {
  if (!channel || typeof channel.bulkDelete !== "function") return { count: 0 };

  const me = channel.guild?.members.me;
  if (!me?.permissionsIn(channel).has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ReadMessageHistory])) {
    throw new Error("Missing `Manage Messages` or `Read Message History` permission in this channel.");
  }

  const fetched = await channel.messages.fetch({ limit: Math.min(100, Math.max(1, amount)) });
  const player = client?.manager?.players?.get(channel.guild.id);
  const activeNowPlayingId = player?.data?.get("nowPlayingMessage")?.id;

  const toDelete = fetched.filter((msg) => {
    // Preserve the active interactive player card
    if (activeNowPlayingId && msg.id === activeNowPlayingId) return false;
    // Delete bot's messages
    if (msg.author.id === client?.user?.id) return true;
    // Delete messages that start with bot prefix or bot mention
    const prefix = client?.prefix || "^";
    if (msg.content.startsWith(prefix) || (client?.user?.id && msg.content.startsWith(`<@${client.user.id}>`))) {
      return true;
    }
    return false;
  });

  if (toDelete.size === 0) return { count: 0 };

  const deleted = await channel.bulkDelete(toDelete, true).catch(() => new Map());
  return { count: deleted.size };
}

module.exports = {
  getAutoCleanConfig,
  updateAutoCleanConfig,
  scheduleDelete,
  cleanBotReply,
  cleanUserCommand,
  pruneChannel,
};
