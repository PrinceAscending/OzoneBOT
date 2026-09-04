const { Schema, model } = require("mongoose");

const DJRole = new Schema({
  guildId: { type: String, required: true, unique: true },
  roleId: { type: String, required: true },
});

module.exports = model("djrole", DJRole);
