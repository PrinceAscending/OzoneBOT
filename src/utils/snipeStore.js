/**
 * Snipe storage — shared between /snipe and /editsnipe.
 * Per-channel, newest-wins, auto-expiring (1h) with a bounded cache.
 */
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 500;

function store(client) {
  if (!client.snipes) client.snipes = new Map();
  if (!client.editSnipes) client.editSnipes = new Map();
  return { snipes: client.snipes, editSnipes: client.editSnipes };
}

function put(map, channelId, entry) {
  map.set(channelId, { ...entry, at: Date.now() });
  if (map.size > MAX_ENTRIES) {
    // Drop the oldest third — keeps memory bounded on busy servers.
    const entries = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < Math.ceil(entries.length / 3); i++) map.delete(entries[i][0]);
  }
}

function get(client, mapName, channelId) {
  const map = store(client)[mapName];
  const entry = map.get(channelId);
  if (!entry) return null;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    map.delete(channelId);
    return null;
  }
  return entry;
}

module.exports = { store, put, get, MAX_AGE_MS };
