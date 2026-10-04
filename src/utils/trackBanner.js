const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { artworkUrl, cleanAuthorName } = require("./presentation");
const { convertTime } = require("./convert");

const WIDTH = 1_000;
const HEIGHT = 265;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function fitText(ctx, input, maxWidth) {
  const value = String(input || "Unknown").replace(/\s+/g, " ").trim();
  if (ctx.measureText(value).width <= maxWidth) return value;

  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}…`;
}

async function fetchArtwork(url) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported artwork URL.");

  const response = await fetch(parsed, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Artwork request failed with ${response.status}.`);

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES) throw new Error("Artwork exceeds the size limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Artwork exceeds the size limit.");
  return loadImage(buffer);
}

const FONT_STACK = '"Yu Gothic", "Microsoft YaHei", "MS Gothic", "Segoe UI", "Apple Color Emoji", sans-serif';
const MONO_STACK = '"Segoe UI", Consolas, "Yu Gothic", monospace, sans-serif';

/**
 * Renders the canvas banner with track metadata and embedded live playback scrub bar
 */
async function renderTrackBanner(artwork, track = {}, position = 0) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Base background
  ctx.fillStyle = "#0A0B0E";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Blurred artwork background
  if (artwork) {
    ctx.save();
    ctx.filter = "blur(14px)";
    ctx.globalAlpha = 0.75;
    drawCover(ctx, artwork, -20, -40, WIDTH + 40, HEIGHT + 80);
    ctx.restore();
  }

  // Dark stealth gradient vignette overlay
  const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, "rgba(10, 11, 14, 0.70)");
  shade.addColorStop(0.65, "rgba(10, 11, 14, 0.82)");
  shade.addColorStop(1, "rgba(10, 11, 14, 0.92)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Track Title
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 34px ${FONT_STACK}`;
  ctx.fillText(fitText(ctx, track.title || "Unknown Track", 900), 48, 62);

  // Artist Name
  ctx.fillStyle = "rgba(240, 242, 245, 0.88)";
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText(fitText(ctx, cleanAuthorName(track.author), 900), 48, 106);

  // Requester
  const requester = track.requester?.username || track.requester?.displayName || "Listener";
  ctx.fillStyle = "rgba(240, 242, 245, 0.55)";
  ctx.font = `500 16px ${FONT_STACK}`;
  ctx.fillText(fitText(ctx, `Requested by ${requester}`, 900), 48, 148);

  const duration = Number(track.length) || 0;
  const isStream = Boolean(track.isStream);

  if (isStream) {
    // Live Stream Badge
    ctx.fillStyle = "#ED4245";
    ctx.beginPath();
    ctx.roundRect(48, 185, 90, 26, 6);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 14px ${FONT_STACK}`;
    ctx.fillText("● LIVE", 64, 203);
  } else {
    // Embedded Playback Scrub Bar
    const BAR_X = 48;
    const BAR_Y = 186;
    const BAR_WIDTH = 904;
    const BAR_HEIGHT = 8;
    const RADIUS = 4;

    const percent = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
    const fillWidth = Math.max(8, Math.round(BAR_WIDTH * percent));

    // Background track bar
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.beginPath();
    ctx.roundRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT, RADIUS);
    ctx.fill();

    // Active progress fill
    const fillGrad = ctx.createLinearGradient(BAR_X, 0, BAR_X + fillWidth, 0);
    fillGrad.addColorStop(0, "#00E5FF"); // Cyan
    fillGrad.addColorStop(1, "#00FF88"); // Emerald Green
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.roundRect(BAR_X, BAR_Y, fillWidth, BAR_HEIGHT, RADIUS);
    ctx.fill();

    // Scrubber thumb dot with glow
    ctx.save();
    ctx.shadowColor = "rgba(0, 255, 136, 0.75)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(BAR_X + fillWidth, BAR_Y + (BAR_HEIGHT / 2), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Current position timestamp (Left)
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `600 17px ${MONO_STACK}`;
    ctx.fillText(convertTime(position), BAR_X, 226);

    // Total duration timestamp (Right)
    ctx.fillStyle = "rgba(240, 242, 245, 0.75)";
    ctx.font = `600 17px ${MONO_STACK}`;
    const durationText = convertTime(duration);
    const durationWidth = ctx.measureText(durationText).width;
    ctx.fillText(durationText, BAR_X + BAR_WIDTH - durationWidth, 226);

    // Percentage Indicator (Center)
    ctx.fillStyle = "rgba(240, 242, 245, 0.45)";
    ctx.font = `500 13px ${MONO_STACK}`;
    const percentText = `${Math.round(percent * 100)}%`;
    const percentWidth = ctx.measureText(percentText).width;
    ctx.fillText(percentText, BAR_X + (BAR_WIDTH / 2) - (percentWidth / 2), 224);
  }

  return canvas.encode("png");
}

async function createTrackBanner(track, position = 0, cachedArtwork = null) {
  let artwork = cachedArtwork;
  if (!artwork) {
    const url = track?.thumbnail || track?.artworkUrl || artworkUrl(track);
    if (url) {
      try {
        artwork = await fetchArtwork(url);
      } catch {
        artwork = null;
      }
    }
  }
  return {
    artwork,
    buffer: await renderTrackBanner(artwork, track, position),
  };
}

module.exports = { createTrackBanner, renderTrackBanner, fetchArtwork };
