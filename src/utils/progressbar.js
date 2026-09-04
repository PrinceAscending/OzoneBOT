const emoji = require("../emojis");

module.exports = {
  progressbar: function (player) {
    const size = 15;
    const line = "▬";
    const slider = emoji.dot;

    if (!player.queue.current) return `[ ${slider}${line.repeat(size - 1)} ]`;

    const total = player.queue.current.length;
    if (!total || total <= 0) return `[ ${slider}${line.repeat(size - 1)} ]`;

    const current =
      player.shoukaku && typeof player.shoukaku.position === "number"
        ? player.shoukaku.position
        : 0;

    let progress;
    if (current >= total) {
      progress = 1;
    } else if (current <= 0) {
      progress = 0;
    } else {
      progress = current / total;
    }

    const filled = Math.round(size * progress);
    const barBody =
      filled > 0
        ? line.repeat(filled - 1) + slider + line.repeat(size - filled)
        : slider + line.repeat(size - 1);

    return `[ ${barBody} ]`;
  },
};