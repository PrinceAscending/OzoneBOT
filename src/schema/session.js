const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  user: {
    id: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: "" },
  },
  guilds: [{
    id: { type: String },
    name: { type: String },
    icon: { type: String },
  }],
  connections: [{
    type: { type: String },
    name: { type: String },
    verified: { type: Boolean },
  }],
  isAdmin: { type: Boolean, default: false },
  expires: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Session', sessionSchema);