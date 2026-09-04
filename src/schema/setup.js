const { Schema, model } = require("mongoose");

const Setup = new Schema({
  Guild: { type: String, index: true },
  Channel: String,
  Message: String,
  voiceChannel: String,
});

module.exports = model("Setup", Setup);
