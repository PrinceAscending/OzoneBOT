/**
 * Listening stats — batched writes so a 24/7 radio bot doesn't hammer Mongo.
 *
 * playerStart calls `trackPlayed` (increments the play counter per listener in
 * the VC), and a periodic flusher (every 5 min) awards dwell `seconds` for
 * whatever is currently playing. All writes are queued in memory and
 * bulk-written to keep DB pressure near zero.
 */
const ListeningLog = require("../schema/listeninglog");

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

/* guildId -> Map(userId -> { seconds, plays }) */
const pending = new Map();
let flushTimer = null;

function bucketFor(guildId, userId) {
  if (!pending.has(guildId)) pending.set(guildId, new Map());
  const guildBucket = pending.get(guildId);
  if (!guildBucket.has(userId)) {
    guildBucket.set(userId, { seconds: 0, plays: 0 });
  }
  return guildBucket.get(userId);
}

/** playerStart hook: one play per human listener currently in the VC. */
function trackPlayed(player, track, listeners) {
  if (!player || !track || !Array.isArray(listeners)) return;
  for (const memberId of listeners) {
    bucketFor(player.guildId, memberId).plays += 1;
  }
}

/** Called by the interval: award dwell seconds to whoever is listening now. */
function tickDwell(players) {
  for (const player of players || []) {
    if (!player?.queue?.current || player.paused) continue;
    const client = player.client || player.kazagumo?.client;
    const guild = client?.guilds?.cache?.get(player.guildId);
    const vc = guild?.channels?.cache?.get(player.voiceId);
    if (!vc) continue;
    const listeners = [...vc.members.values()].filter((m) => !m.user.bot).map((m) => m.id);
    for (const memberId of listeners) {
      bucketFor(player.guildId, memberId).seconds += FLUSH_INTERVAL_MS / 1000;
    }
  }
}

async function flush() {
  if (pending.size === 0) return;
  const ops = [];
  const guildBuckets = [...pending.entries()];
  pending.clear();

  for (const [guildId, users] of guildBuckets) {
    for (const [userId, data] of users) {
      const seconds = Math.round(data.seconds);
      if (seconds <= 0 && data.plays === 0) continue;
      ops.push({
        updateOne: {
          filter: { guildId, userId },
          update: {
            $inc: { seconds, plays: data.plays },
            $set: { updatedAt: Date.now() },
          },
          upsert: true,
        },
      });
    }
  }

  if (!ops.length) return;
  try {
    await ListeningLog.bulkWrite(ops, { ordered: false });
  } catch { /* stats are best-effort; the next cycle recovers */ }
}

function initialize(client) {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    tickDwell([...(client.manager?.players?.values() || [])]);
    await flush();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

async function guildLeaderboard(guildId, limit = 10) {
  return ListeningLog.find({ guildId })
    .sort({ seconds: -1 })
    .limit(limit)
    .lean()
    .catch(() => []);
}

async function globalLeaderboard(limit = 10) {
  try {
    return await ListeningLog.aggregate([
      {
        $group: {
          _id: "$userId",
          seconds: { $sum: "$seconds" },
          plays: { $sum: "$plays" },
        },
      },
      { $sort: { seconds: -1 } },
      { $limit: limit },
      {
        $project: {
          userId: "$_id",
          seconds: 1,
          plays: 1,
          _id: 0,
        },
      },
    ]);
  } catch {
    return [];
  }
}

module.exports = { trackPlayed, tickDwell, flush, initialize, guildLeaderboard, globalLeaderboard };
