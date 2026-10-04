const { KazagumoTrack } = require("kazagumo");

/**
 * PlayerMigrationService handles seamless, zero-downtime player migrations
 * between Lavalink nodes when a node fails or when a user chooses a new node.
 */
class PlayerMigrationService {
  constructor(client) {
    this.client = client;
    this.migratingGuilds = new Set();
  }

  get manager() {
    return this.client.manager;
  }

  get nodeRouter() {
    return this.client.nodeRouter;
  }

  get queuePersistence() {
    return this.client.queuePersistence;
  }

  /**
   * Migrates a single guild player to a target node (or optimal node if not specified)
   */
  async migratePlayer(guildId, targetNodeName = null, options = {}) {
    if (!guildId) return { success: false, reason: "No guild ID provided" };
    if (this.migratingGuilds.has(guildId)) {
      return { success: false, reason: "Migration already in progress" };
    }

    this.migratingGuilds.add(guildId);
    const log = (msg, level = "log") => this.client.logger?.log?.(`[Migration:${guildId}] ${msg}`, level);

    try {
      const currentPlayer = this.manager?.players?.get(guildId);
      let snapshot = null;

      if (currentPlayer) {
        snapshot = this.queuePersistence?.captureSnapshot(currentPlayer);
      }
      if (!snapshot) {
        snapshot = await this.queuePersistence?.getPlayerState(guildId);
      }

      if (!snapshot || !snapshot.voiceId) {
        return { success: false, reason: "No active player state or voice channel found" };
      }

      const currentNodeName = currentPlayer?.node?.name || snapshot.selectedNode;

      // Select destination node
      const optimalNode = this.nodeRouter?.getOptimalNode(guildId, targetNodeName);
      if (!optimalNode) {
        return { success: false, reason: "No connected Lavalink nodes available" };
      }

      if (currentNodeName && currentNodeName === optimalNode.name && !options.force) {
        return { success: true, node: optimalNode.name, message: "Already on requested node" };
      }

      log(`Migrating from "${currentNodeName || 'unknown'}" to "${optimalNode.name}" (Reason: ${options.reason || 'Node failover'})`);

      // Try seamless in-place move via Shoukaku without dropping voice connection
      if (currentPlayer?.shoukaku?.move && optimalNode.state === 1) {
        try {
          const moved = await currentPlayer.shoukaku.move(optimalNode.name);
          if (moved) {
            currentPlayer.node = optimalNode;
            log(`Seamlessly migrated player for guild ${guildId} to "${optimalNode.name}" via Shoukaku.move`);
            return { success: true, node: optimalNode.name };
          }
        } catch (moveErr) {
          log(`Shoukaku.move failed (${moveErr.message}), falling back to graceful recreate`, "warn");
        }
      }

      // Destroy current player instance cleanly without leaving VC
      if (currentPlayer) {
        try {
          // Temporarily unhook voice health monitor so it doesn't fight migration
          this.client.voiceHealthMonitor?.stopMonitoring(guildId);
          await currentPlayer.destroy();
        } catch (e) {
          log(`Warning while destroying old player: ${e.message}`, "warn");
        }
      }

      // Brief delay to allow Lavalink session teardown
      await new Promise((r) => setTimeout(r, 400));

      // Recreate player on the new target node
      const newPlayer = await this.manager.createPlayer({
        guildId: snapshot.guildId,
        voiceId: snapshot.voiceId,
        textId: snapshot.textId,
        volume: snapshot.volume ?? 80,
        deaf: true,
        nodeName: optimalNode.name,
      });

      if (!newPlayer) {
        throw new Error("Failed to create player on new node");
      }

      // Restore session data
      if (!newPlayer.data) newPlayer.data = new Map();
      if (snapshot.sessionSource) newPlayer.data.set("sessionSource", snapshot.sessionSource);
      if (snapshot.autoplay) newPlayer.data.set("autoplay", true);
      if (snapshot.radioStation) newPlayer.data.set("radioStation", snapshot.radioStation);

      // Re-hydrate queue tracks
      const rawQueue = snapshot.queue || [];
      for (const trackData of rawQueue) {
        try {
          if (trackData.track) {
            // Raw Lavalink track payload
            const rawPayload = {
              encoded: trackData.track,
              info: {
                title: trackData.title,
                author: trackData.author,
                length: trackData.length,
                identifier: trackData.identifier,
                isSeekable: trackData.isSeekable,
                isStream: trackData.isStream,
                uri: trackData.uri,
                artworkUrl: trackData.thumbnail,
              },
            };
            newPlayer.queue.add(new KazagumoTrack(rawPayload, trackData.requester));
          } else if (trackData.uri) {
            // Re-resolve via URI
            const res = await newPlayer.search(trackData.uri, { requester: trackData.requester });
            if (res?.tracks?.[0]) newPlayer.queue.add(res.tracks[0]);
          }
        } catch (err) {
          log(`Failed to re-hydrate queue track: ${err.message}`, "warn");
        }
      }

      // Re-play current track at saved timestamp
      if (snapshot.currentTrack) {
        const cur = snapshot.currentTrack;
        let trackToPlay = null;

        try {
          if (cur.track) {
            const rawPayload = {
              encoded: cur.track,
              info: {
                title: cur.title,
                author: cur.author,
                length: cur.length,
                identifier: cur.identifier,
                isSeekable: cur.isSeekable,
                isStream: cur.isStream,
                uri: cur.uri,
                artworkUrl: cur.thumbnail,
              },
            };
            trackToPlay = new KazagumoTrack(rawPayload, cur.requester);
          } else if (cur.uri) {
            const res = await newPlayer.search(cur.uri, { requester: cur.requester });
            trackToPlay = res?.tracks?.[0] || null;
          }
        } catch (err) {
          log(`Failed to resolve current track: ${err.message}`, "warn");
        }

        if (trackToPlay) {
          const seekPosition = Math.max(0, (snapshot.position || 0) - 1000); // 1s buffer for smooth audio
          await newPlayer.play(trackToPlay);

          if (seekPosition > 0 && trackToPlay.isSeekable) {
            setTimeout(async () => {
              try {
                await newPlayer.seek(seekPosition);
              } catch {}
            }, 600);
          }
        }
      }

      // Re-apply loop & filters
      if (snapshot.loop && snapshot.loop !== "none") {
        newPlayer.setLoop(snapshot.loop);
      }

      // Start voice health monitor on new player
      this.client.voiceHealthMonitor?.startMonitoring(newPlayer);

      // Save new state
      this.queuePersistence?.savePlayerState(newPlayer, true);

      log(`Migration successfully completed to "${optimalNode.name}".`, "ready");

      // Notify in text channel if requested
      if (options.notify && snapshot.textId) {
        const channel = this.client.channels.cache.get(snapshot.textId);
        if (channel?.send) {
          const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");
          const posFormatted = Math.floor((snapshot.position || 0) / 1000);
          const mins = Math.floor(posFormatted / 60);
          const secs = String(posFormatted % 60).padStart(2, "0");

          const container = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${this.client.emoji?.check || ""} Audio node migrated to \`${optimalNode.name}\`**\n`.trimStart() +
              `> Playback seamlessly resumed at \`${mins}:${secs}\`.`
            )
          );

          channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      }

      return {
        success: true,
        node: optimalNode.name,
        resumedPosition: snapshot.position || 0,
      };
    } catch (error) {
      log(`Migration failed: ${error.message}`, "error");
      return { success: false, reason: error.message };
    } finally {
      this.migratingGuilds.delete(guildId);
    }
  }

  /**
   * Concurrently migrates all players from a dying node to healthy nodes
   */
  async migratePlayersFromNode(dyingNodeName, targetPlayers = null) {
    if (!this.manager) return;

    // Penalize the dying node so router avoids picking it
    this.nodeRouter?.addPenalty(dyingNodeName, 200);

    const allPlayers = [...(this.manager.players?.values() || [])];
    const affected = targetPlayers && targetPlayers.length > 0
      ? targetPlayers
      : allPlayers.filter((p) => p.node?.name === dyingNodeName || p.shoukaku?.node?.name === dyingNodeName);

    if (affected.length === 0) {
      this.client.logger?.log?.(`[Migration] No active players affected on node "${dyingNodeName}".`, "debug");
      return;
    }

    this.client.logger?.log?.(
      `[Migration] Initiating failover for ${affected.length} player(s) from node "${dyingNodeName}"...`,
      "warn"
    );

    const results = await Promise.allSettled(
      affected.map((player) =>
        this.migratePlayer(player.guildId, null, {
          reason: `Node "${dyingNodeName}" disconnected`,
          notify: false,
          force: true,
        })
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value?.success).length;
    this.client.logger?.log?.(
      `[Migration] Completed failover: ${successful}/${affected.length} players successfully migrated from "${dyingNodeName}".`,
      "ready"
    );
  }
}

module.exports = PlayerMigrationService;
