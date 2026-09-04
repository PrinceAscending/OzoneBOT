const mongoose = require("mongoose");

const VoiceStatus = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
});

module.exports = mongoose.model("VcStatus", VoiceStatus);
