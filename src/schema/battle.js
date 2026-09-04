const mongoose = require("mongoose");

const battleSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  totalBattles: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

battleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("BattleScore", battleSchema);
