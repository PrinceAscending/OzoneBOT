const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const emoji = require("../emojis");

function sanitizeMentions(text) {
  return String(text || "")
    .replace(/@(everyone|here)/gi, "@\u200B$1")
    .replace(/<@&(\d+)>/g, "<@\u200B&$1>");
}

function card({ title, description, accentColor, icon, footer } = {}) {
  const container = new ContainerBuilder();
  if (accentColor) container.setAccentColor(accentColor);

  let header = "";
  if (icon || title) {
    header = `### ${icon ? `${icon} ` : ""}${title || ""}\n`;
  }

  const desc = description ? sanitizeMentions(description) : "";
  const content = `${header}${desc}`.trim();

  if (content) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );
  }

  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${sanitizeMentions(footer)}`)
    );
  }

  return container;
}

function successPayload(description, options = {}) {
  const container = card({
    title: options.title,
    description: `**${emoji.check || "✅"} ${description}**`,
    accentColor: 0x57F287,
    footer: options.footer,
  });
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

function errorPayload(description, options = {}) {
  const container = card({
    title: options.title,
    description: `**${emoji.cross || "❌"} ${description}**`,
    accentColor: 0xED4245,
    footer: options.footer,
  });
  return {
    components: [container],
    flags: (options.ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2,
  };
}

function warnPayload(description, options = {}) {
  const container = card({
    title: options.title,
    description: `**${emoji.warn || "⚠️"} ${description}**`,
    accentColor: 0xFEE75C,
    footer: options.footer,
  });
  return {
    components: [container],
    flags: (options.ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2,
  };
}

function infoPayload(description, options = {}) {
  const container = card({
    title: options.title,
    description: `**${emoji.info || "ℹ️"} ${description}**`,
    accentColor: 0x5865F2,
    footer: options.footer,
  });
  return {
    components: [container],
    flags: (options.ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2,
  };
}

module.exports = {
  card,
  successPayload,
  errorPayload,
  warnPayload,
  infoPayload,
  sanitizeMentions,
};
