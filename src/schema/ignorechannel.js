const { Schema, model } = require("mongoose");
const mongoose = require("mongoose");
const IgnoreChannelModel = new Schema({
  guildId: { type: String, index: true },
  channelId: { type: String, index: true },
});

const db = model("ignorechannel", IgnoreChannelModel);
module.exports = db;
