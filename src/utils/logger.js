const moment = require("moment-timezone");

/**
 * OZONE — Console Logger
 * Broadcast-station console for the OZONE bot.
 *
 * Design: a colored signal glyph, a dim radio-clock timestamp, a clean
 * rail-separated badge column, and a bright message — echoing the dashboard's
 * "ozone band" identity. ANSI 16-color (bright variants) with box-drawing
 * and geometric glyphs that render on Windows and Linux.
 */
class Logger {
  static buffer = [];
  static BUFFER_LIMIT = 200;

  static get now() {
    return moment().format("DD-MM-YYYY HH:mm:ss");
  }

  static get style() {
    return {
      reset: "\x1b[0m",
      bold: "\x1b[1m",
      dim: "\x1b[2m",
      italic: "\x1b[3m",
      underline: "\x1b[4m",
      black: "\x1b[30m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m",
      gray: "\x1b[90m",
      brightRed: "\x1b[91m",
      brightGreen: "\x1b[92m",
      brightYellow: "\x1b[93m",
      brightBlue: "\x1b[94m",
      brightMagenta: "\x1b[95m",
      brightCyan: "\x1b[96m",
      brightWhite: "\x1b[97m",
    };
  }

  /**
   * Core printer. One aligned line per entry:
   *   ●  [DD-MM-YYYY HH:mm:ss]  │  READY  │  message
   * Multi-line messages (error stacks) dim and indent continuation
   * lines to the message column so they stay readable.
   */
  static get logLevel() {
    const level = (process.env.LOG_LEVEL || "info").toLowerCase();
    const levels = { debug: 0, info: 1, cmd: 1, event: 1, ready: 1, warn: 2, error: 3 };
    return levels[level] ?? 1;
  }

  static _print(type, icon, color, message, suffix = "") {
    const levelMap = { DEBUG: 0, INFO: 1, CMD: 1, EVENT: 1, READY: 1, WARN: 2, ERROR: 3, SYSTEM: 1 };
    const currentPriority = levelMap[type.toUpperCase()] ?? 1;
    if (currentPriority < this.logLevel) return;

    const s = this.style;
    const time = this.now;

    const sigil = `${color}${s.bold}${icon}${s.reset}`;
    const stamp = `${s.dim}[${s.gray}${time}${s.dim}]${s.reset}`;
    const badge = `${color}${s.bold}${type.padEnd(6)}${s.reset}`;
    const rail = `${s.dim}${s.gray}│${s.reset}`;

    const plain = String(message).replace(/\x1b\[[0-9;]*m/g, "");
    const indent = " ".repeat(36);
    const body = plain
      .split("\n")
      .map((line, i) =>
        i === 0
          ? `${s.brightWhite}${line}${s.reset}`
          : `${s.dim}${s.gray}${indent}${line}${s.reset}`
      )
      .join("\n");

    console.log(` ${sigil} ${stamp} ${rail} ${badge} ${rail} ${body}${suffix}`);

    this.buffer.push({ time, type: type.toUpperCase(), message: plain });
    if (this.buffer.length > this.BUFFER_LIMIT) this.buffer.shift();
  }

  static log(message, type = "info") {
    switch (type.toLowerCase()) {
      case "info":
      case "log":
        this.info(message);
        break;
      case "warn":
      case "warning":
        this.warn(message);
        break;
      case "error":
      case "err":
        this.error(message);
        break;
      case "debug":
        this.debug(message);
        break;
      case "cmd":
        this.cmd(message);
        break;
      case "event":
        this.event(message);
        break;
      case "ready":
        this.ready(message);
        break;
      default:
        this.info(message);
        break;
    }
  }

  static info(message) {
    this._print("INFO", "●", this.style.brightCyan, message);
  }

  static warn(message) {
    this._print("WARN", "▲", this.style.brightYellow, message);
  }

  static error(message) {
    this._print("ERROR", "✕", this.style.brightRed, message);
  }

  static debug(message) {
    this._print("DEBUG", "⋯", this.style.gray, message);
  }

  static cmd(message) {
    this._print("CMD", "◆", this.style.brightMagenta, message);
  }

  static event(message) {
    this._print("EVENT", "◈", this.style.brightBlue, message);
  }

  static ready(message) {
    const s = this.style;
    this._print(
      "READY",
      "✓",
      s.brightGreen,
      message,
      ` ${s.dim}${s.green}▰${s.brightGreen}▰▰▰${s.reset}`
    );
  }

  static system(message) {
    this._print("SYSTEM", "◆", this.style.brightWhite, message);
  }

  /** A thin signal divider — the band motif between log sections. */
  static divider() {
    const s = this.style;
    const half = "─".repeat(28);
    console.log(
      `${s.dim}${s.cyan}${half}${s.reset} ${s.brightCyan}◆${s.reset} ${s.dim}${s.cyan}${half}${s.reset}`
    );
  }

  /** Broadcast-style header: OZONE wordmark on a glowing core line. */
  static header(title, subtitle = "") {
    const s = this.style;
    const W = 60;
    const visible = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
    const border = `${s.dim}${s.cyan}`;
    const pad = (text) => {
      const avail = Math.max(0, W - visible(text).length);
      const left = Math.floor(avail / 2);
      const right = avail - left;
      return `${border}║${s.reset}${" ".repeat(left)}${text}${" ".repeat(right)}${border}║${s.reset}`;
    };
    const rule = "═".repeat(W);

    console.log(`${border}╔${rule}╗${s.reset}`);
    console.log(pad(""));
    console.log(
      pad(
        `${s.brightCyan}● ${s.reset}${s.bold}${s.brightWhite}${title}${s.reset}${s.brightCyan} ●${s.reset}`
      )
    );
    console.log(
      pad(
        `${s.dim}${s.cyan}${"─".repeat(5)}${s.reset}` +
        `${s.brightCyan}◆${s.reset}` +
        `${s.dim}${s.cyan}${"─".repeat(5)}${s.reset}` +
        `${s.brightCyan}◆${s.reset}` +
        `${s.dim}${s.cyan}${"─".repeat(5)}${s.reset}` +
        `${s.brightCyan}◆${s.reset}` +
        `${s.dim}${s.cyan}${"─".repeat(5)}${s.reset}`
      )
    );
    if (subtitle) {
      console.log(pad(`${s.dim}${s.gray}${subtitle}${s.reset}`));
    }
    console.log(pad(""));
    console.log(`${border}╚${rule}╝${s.reset}`);
  }
}

module.exports = Logger;