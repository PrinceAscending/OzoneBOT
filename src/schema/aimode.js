const mongoose = require("mongoose");

const aimode = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Aimode", aimode);