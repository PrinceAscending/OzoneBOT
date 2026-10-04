const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");

/**
 * Builds a standardized, sleek dark command info/syntax card.
 * Matches:
 * ```
 * [] = Optional Argument
 * <> = Required Argument
 * Do NOT type these when using commands!
 * ```
 * Aliases: [name, alias1, ...]
 * Usage: <syntax>
 * Requested By <User>
 */
function formatCommandHelp(command, user, prefix = "^") {
  const aliases = [command.name, ...(command.aliases || [])];
  const aliasesStr = `[${aliases.join(", ")}]`;
  const usageStr = command.usage ? `${command.usage}` : `${command.name}`;

  const container = new ContainerBuilder()
    .setAccentColor(0x0A0B0E)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "```\n" +
        "[] = Optional Argument\n" +
        "<> = Required Argument\n" +
        "Do NOT type these when using commands!\n" +
        "```"
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Aliases:** \`\`${aliasesStr}\`\``)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Usage:** \`\`${usageStr}\`\``)
    );

  if (command.description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Description:** *${command.description}*`)
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Requested By ${user?.displayName || user?.username || "User"}`
      )
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

module.exports = { formatCommandHelp };
