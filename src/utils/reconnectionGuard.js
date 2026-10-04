/**
 * ReconnectionGuard provides a per-guild concurrency lock and cooldown manager
 * to prevent duplicate createPlayer races, join/leave feedback loops, and
 * conflicting voice gateway updates across AutoDestroy, Node/ready, Client/ready,
 * and VoiceHealthMonitor.
 */
class ReconnectionGuard {
  constructor() {
    this.inFlight = new Map(); // guildId -> Promise
    this.cooldowns = new Map(); // guildId -> timestamp
    this.DEFAULT_COOLDOWN_MS = 4000;
  }

  /**
   * Check if a guild is actively in the process of reconnecting
   * @param {string} guildId
   * @returns {boolean}
   */
  isReconnecting(guildId) {
    return this.inFlight.has(guildId);
  }

  /**
   * Check if a guild is within its post-reconnect cooldown period
   * @param {string} guildId
   * @returns {boolean}
   */
  isOnCooldown(guildId) {
    const expire = this.cooldowns.get(guildId);
    if (!expire) return false;
    if (Date.now() > expire) {
      this.cooldowns.delete(guildId);
      return false;
    }
    return true;
  }

  /**
   * Run a reconnection task with automatic concurrency lock and cooldown gating.
   * If a reconnection is already in flight for this guild, returns the in-flight Promise.
   * If the guild is on cooldown (and force is not set), skips execution and returns null.
   *
   * @param {string} guildId
   * @param {Function} fn - async function to execute
   * @param {Object} [options]
   * @param {boolean} [options.force=false] - ignore cooldown
   * @param {number} [options.cooldownMs=4000] - post-execution cooldown duration
   * @returns {Promise<any>}
   */
  async runGuarded(guildId, fn, options = {}) {
    if (!guildId) return null;

    // Deduplicate: if an operation is already in flight, return the existing promise
    if (this.inFlight.has(guildId)) {
      return this.inFlight.get(guildId);
    }

    // Cooldown gate: prevent rapid churn / thrashing
    if (!options.force && this.isOnCooldown(guildId)) {
      return null;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(guildId);
        const cooldown = options.cooldownMs ?? this.DEFAULT_COOLDOWN_MS;
        if (cooldown > 0) {
          this.cooldowns.set(guildId, Date.now() + cooldown);
        }
      }
    })();

    this.inFlight.set(guildId, promise);
    return promise;
  }

  /**
   * Clear in-flight and cooldown locks for a guild
   * @param {string} guildId
   */
  clear(guildId) {
    this.inFlight.delete(guildId);
    this.cooldowns.delete(guildId);
  }
}

module.exports = ReconnectionGuard;
