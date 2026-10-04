const mongoose = require("mongoose");

const queuePersistenceSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  voiceId: { type: String, required: true },
  textId: { type: String, required: true },
  currentTrack: { type: Object, default: null },
  position: { type: Number, default: 0 },
  queue: { type: Array, default: [] },
  volume: { type: Number, default: 80 },
  loop: { type: String, default: "none" },
  filters: { type: Object, default: {} },
  autoplay: { type: Boolean, default: false },
  sessionSource: { type: String, default: "ytmsearch" },
  selectedNode: { type: String, default: null },
  radioStation: { type: String, default: null },
  lastActive: { type: Date, default: Date.now },
});

module.exports = mongoose.model("QueuePersistence", queuePersistenceSchema);
