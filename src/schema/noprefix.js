const mongoose = require(`mongoose`);
const noprefix = new mongoose.Schema({
  noprefix: Boolean,
  userId: { type: String, index: true },
  guildId: { type: String, index: true },
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
});
module.exports = mongoose.model("Noprefix", noprefix);
