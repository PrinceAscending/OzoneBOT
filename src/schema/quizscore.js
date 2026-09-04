const mongoose = require("mongoose");

const quizScoreSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  wins: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 0 },
  fastestMs: { type: Number, default: null },
  updatedAt: { type: Number, default: Date.now },
});

quizScoreSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("QuizScore", quizScoreSchema);
