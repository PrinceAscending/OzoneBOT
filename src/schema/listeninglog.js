const mongoose = require("mongoose");

const listeningLogSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  trackTitle: { type: String, default: "" },
  trackUri: { type: String, default: "" },
  seconds: { type: Number, default: 0 },
  plays: { type: Number, default: 0 },
  updatedAt: { type: Number, default: Date.now },
});

/* One aggregate row per user per guild: plays and seconds accumulate. */
listeningLogSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ListeningLog", listeningLogSchema);
