module.exports = {
  name: "close",
  run: async (client, name, code, reason) => {
    // Shoukaku close codes are numeric (e.g. 1006 for abnormal closure); the
    // old `code.toString().includes('ETIMEDOUT')` branch could never match and
    // has been removed. Timeouts surface through the "error" event instead.
    client.logger.log(
      `Lavalink ${name}: Closed, Code ${code}, Reason ${reason || "No reason"}`,
      "warn",
    );
  },
};
