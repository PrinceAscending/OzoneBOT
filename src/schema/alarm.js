const mongoose = require("mongoose");

const alarmSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  voiceId: { type: String, required: true },
  textId: { type: String, required: true },
  song: { type: String, required: true },
  triggerAt: { type: Date, required: true, index: true },
  triggered: { type: Boolean, default: false },
  label: { type: String, default: "Music Alarm" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Alarm", alarmSchema);
