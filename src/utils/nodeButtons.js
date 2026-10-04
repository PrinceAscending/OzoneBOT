const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/**
 * Builds the Pure Dark Node Selector with Green (Live) and Black (Offline) buttons.
 */
function buildNodeButtonsPayload(client, guildId, currentNodeName = null, customIdPrefix = "node_pick_") {
  const router = client.nodeRouter;
  const nodes = router ? router.getAllNodesStatus() : [];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  // First button: Auto
  const autoBtn = new ButtonBuilder()
    .setCustomId(`${customIdPrefix}auto`)
    .setLabel("Auto Route")
    .setStyle(currentNodeName === "auto" ? ButtonStyle.Success : ButtonStyle.Secondary);

  if (client.emoji?.autoplay) {
    try { autoBtn.setEmoji(client.emoji.autoplay); } catch {}
  }
  currentRow.addComponents(autoBtn);

  for (const n of nodes) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    const isLive = Boolean(n.isConnected);
    const isCurrent = currentNodeName && currentNodeName.toLowerCase() === n.name.toLowerCase();
    const pingText = n.latency < 9999 ? `${n.latency}ms` : "Active";
    const label = `${n.name} (${isLive ? pingText : "Offline"})${isCurrent ? " (Current)" : ""}`;
    const truncated = label.length > 35 ? `${label.substring(0, 32)}…` : label;

    const btn = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}${n.name}`)
      .setLabel(truncated)
      // Green if live (Success), Black/Dark Grey if offline (Secondary)
      .setStyle(isLive ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!isLive);

    if (isLive && client.emoji?.check) {
      try { btn.setEmoji(client.emoji.check); } catch {}
    } else if (!isLive && client.emoji?.cross) {
      try { btn.setEmoji(client.emoji.cross); } catch {}
    }

    currentRow.addComponents(btn);
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  const checkEmoji = client.emoji?.check || "";
  const crossEmoji = client.emoji?.cross || "";

  const container = new ContainerBuilder()
    .setAccentColor(0x0A0B0E) // Pure Obsidian Dark
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Select Audio Node\n` +
        `> ${checkEmoji} **Green** = Live & Optimal  •  ${crossEmoji} **Black** = Inactive / Standby\n` +
        (currentNodeName ? `> Current Node: **\`${currentNodeName}\`**\n` : "") +
        `> Tap any live node button below to route your stream:`
      )
    );

  for (const row of rows) {
    container.addActionRowComponents(row);
  }

  return { components: [container] };
}

module.exports = { buildNodeButtonsPayload };
