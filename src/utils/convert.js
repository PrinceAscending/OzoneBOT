

module.exports = {
  convertTime: function (duration) {
    const milliseconds = parseInt((duration % 1000) / 100),
      seconds = parseInt((duration / 1000) % 60),
      minutes = parseInt((duration / (1000 * 60)) % 60),
      hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    const formattedHours = hours < 10 ? "0" + hours : hours;
    const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
    const formattedSeconds = seconds < 10 ? "0" + seconds : seconds;

    if (duration < 3600000) {
      return formattedMinutes + ":" + formattedSeconds;
    } else {
      return formattedHours + ":" + formattedMinutes + ":" + formattedSeconds;
    }
  },

  chunk: function (arr, size) {
    const temp = [];
    for (let i = 0; i < arr.length; i += size) {
      temp.push(arr.slice(i, i + size));
    }
    return temp;
  },

  convertHmsToMs: function (hms) {
    const a = String(hms || "").split(":");

    if (a.length === 3) {
      return (+a[0] * 60 * 60 + +a[1] * 60 + +a[2]) * 1000;
    } else if (a.length === 2) {
      // Two parts are minutes:seconds (mm:ss), not hours:minutes.
      return (+a[0] * 60 + +a[1]) * 1000;
    } else if (a.length === 1) {
      return +a[0] * 1000;
    }
    return 0;
  },
};
