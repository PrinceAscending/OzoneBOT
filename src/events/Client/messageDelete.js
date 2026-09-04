const { store, put } = require("../../utils/snipeStore");

module.exports = {
  name: "messageDelete",
  run: async (client, message) => {
    if (message.partial || !message.guild || message.author?.bot) return;

    const { snipes } = store(client);
    put(snipes, message.channel.id, {
      content: message.content || "",
      author: message.author,
      image: message.attachments.first()?.proxyURL || null,
      time: Date.now(),
    });
  },
};
