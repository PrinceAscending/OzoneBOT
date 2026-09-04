const { store, put } = require("../../utils/snipeStore");

module.exports = {
  name: "messageUpdate",
  once: false,
  run: async (client, oldMessage, newMessage) => {
    if (newMessage.partial) return;
    if (newMessage.author?.bot || !newMessage.guild) return;
    // Only record when the text actually changed (embed unfurls etc. also fire update).
    if ((oldMessage.partial ? null : oldMessage.content) === newMessage.content) return;

    const { editSnipes } = store(client);
    put(editSnipes, newMessage.channel.id, {
      author: newMessage.author,
      oldContent: oldMessage.partial ? "(older edit)" : (oldMessage.content || ""),
      newContent: newMessage.content || "",
      at: Date.now(),
    });
  },
};
