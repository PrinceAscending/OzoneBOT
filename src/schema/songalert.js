const mongoose = require("mongoose");

const songAlertSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  keyword: { type: String, required: true, trim: true, lowercase: true },
  createdAt: { type: Date, default: Date.now },
});

songAlertSchema.index({ guildId: 1, userId: 1, keyword: 1 }, { unique: true });

module.exports = mongoose.model("SongAlert", songAlertSchema);
