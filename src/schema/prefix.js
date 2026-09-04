const { Schema, model } = require("mongoose");

const Prefix = new Schema({
  Guild: { type: String, index: true },
  Prefix: String,
  oldPrefix: String,
});

module.exports = model("prefix", Prefix);
