const mongoose = require("mongoose");

const autoCleanSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  deleteUserMessage: { type: Boolean, default: true },
  userMessageDelay: { type: Number, default: 3 }, // seconds
  botMessageTimeout: { type: Number, default: 10 }, // seconds
  deleteWarnings: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

autoCleanSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("AutoClean", autoCleanSchema);
