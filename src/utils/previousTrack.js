class PreviousTrackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PreviousTrackError";
    this.code = code;
  }
}

async function playPreviousTrack(player, requester) {
  const history = [...(player.data?.get("history") || [])];
  if (!history.length) {
    throw new PreviousTrackError("NO_HISTORY", "No previous songs are available.");
  }

  const previousTrackData = history.at(-1);
  const result = await player.search(previousTrackData.uri || previousTrackData.title, { requester });
  if (!result?.tracks?.length) {
    throw new PreviousTrackError("NOT_FOUND", "The previous track could not be found.");
  }

  const previousTrack = result.tracks[0];
  history.pop();
  player.data.set("history", history);

  if (player.queue.current) {
    // Current track still active: push it back to the front, then skip —
    // the end event advances into the restored track.
    player.queue.unshift(player.queue.current);
    player.queue.unshift(previousTrack);
    player.data.set("autoplayAdded", false);
    await player.skip();
  } else {
    // Player is idle (queue ended / stopped): skip() would only call
    // stopTrack(), which fires no end event and nothing would ever play.
    // Unshift then let play() promote the track from the queue.
    player.queue.unshift(previousTrack);
    player.data.set("autoplayAdded", false);
    await player.play();
  }
  return previousTrack;
}

module.exports = { PreviousTrackError, playPreviousTrack };
