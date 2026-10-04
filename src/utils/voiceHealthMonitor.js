const { PlayerState } = require("kazagumo");

class VoiceHealthMonitor {
    constructor(client, options = {}) {
        this.client = client;
        this.healthChecks = new Map();
        this.CHECK_INTERVAL = options.checkInterval ?? (client.config?.voiceHealth?.checkInterval ?? 3 * 60 * 1000);
        this.IDLE_THRESHOLD = options.idleThreshold ?? (client.config?.voiceHealth?.idleThreshold ?? 10 * 60 * 1000);
    }

    startMonitoring(player) {
        if (!player || !player.guildId) return;

        if (this.healthChecks.has(player.guildId)) {
            return;
        }

        const interval = setInterval(async () => {
            await this.performHealthCheck(player);
        }, this.CHECK_INTERVAL);
        interval.unref?.();

        this.healthChecks.set(player.guildId, interval);

        if (!player.data) {
            player.data = new Map();
        }
        player.data.set('monitorStartTime', Date.now());
    }

    stopMonitoring(guildId) {
        const interval = this.healthChecks.get(guildId);
        if (interval) {
            clearInterval(interval);
            this.healthChecks.delete(guildId);

            const player = this.client.manager?.players.get(guildId);
            if (player?.data) {
                const reconnectTimeout = player.data.get('reconnectTimeout');
                if (reconnectTimeout) {
                    clearTimeout(reconnectTimeout);
                    player.data.delete('reconnectTimeout');
                    player.data.delete('reconnectAttempts');
                }
            }

            this.client.logger?.log(
                `[VoiceHealth] Stopped monitoring for guild ${guildId}`,
                'debug'
            );
        }
    }

    async performHealthCheck(player) {
        try {
            const currentPlayer = this.client.manager?.players.get(player.guildId);
            if (!currentPlayer) {
                this.stopMonitoring(player.guildId);
                return;
            }

            const guild = this.client.guilds.cache.get(player.guildId);
            if (!guild) {
                this.stopMonitoring(player.guildId);
                return;
            }

            const voiceChannel = guild.channels.cache.get(player.voiceId);
            if (!voiceChannel) {
                this.stopMonitoring(player.guildId);
                return;
            }

            const botMember = guild.members.cache.get(this.client.user.id);
            if (!botMember?.voice?.channelId) {
                const TwoFourSeven = require('../schema/247');
                const twoFourSeven = await TwoFourSeven.findOne({ Guild: player.guildId });

                if (twoFourSeven) {
                    this.client.logger?.log(
                        `[VoiceHealth] Bot not in VC but 247 enabled for guild ${player.guildId}, executing guarded reconnect`,
                        'log'
                    );

                    await this.client.reconnect247Guild(player.guildId);
                    return;
                }

                this.client.logger?.log(
                    `[VoiceHealth] Bot not in VC for guild ${player.guildId}, stopping monitor`,
                    'debug'
                );
                this.stopMonitoring(player.guildId);
                return;
            }

            if (botMember.voice.channelId !== player.voiceId) {
                const TwoFourSeven = require('../schema/247');
                const twoFourSeven = await TwoFourSeven.findOne({ Guild: player.guildId });

                if (twoFourSeven && twoFourSeven.VoiceId === botMember.voice.channelId) {
                    player.voiceId = botMember.voice.channelId;
                    this.client.logger?.log(
                        `[VoiceHealth] Synchronized player voiceId with active VC for guild ${player.guildId}`,
                        'debug'
                    );
                    return;
                } else if (twoFourSeven) {
                    this.client.logger?.log(
                        `[VoiceHealth] Bot in different VC than 24/7 channel for guild ${player.guildId}, rejoining 24/7 channel`,
                        'log'
                    );
                    await this.client.reconnect247Guild(player.guildId);
                    return;
                }

                this.client.logger?.log(
                    `[VoiceHealth] Bot in different VC for guild ${player.guildId}, stopping monitor`,
                    'debug'
                );
                this.stopMonitoring(player.guildId);
                return;
            }

            const isIdle = !player.playing && !player.paused;
            const lastActivity = player.data?.get('lastActivityTime') || player.data?.get('monitorStartTime') || Date.now();
            const idleDuration = Date.now() - lastActivity;

            if (isIdle && idleDuration > this.IDLE_THRESHOLD) {
                this.client.logger?.log(
                    `[VoiceHealth] Player idle for ${Math.floor(idleDuration / 1000)}s in guild ${player.guildId}, refreshing connection`,
                    'log'
                );
                await this.refreshConnection(player, guild, voiceChannel);
            }

            if (player.playing && player.queue?.current) {
                await this.updateVoiceState(player, player.queue.current);
            }

        } catch (error) {
            this.client.logger?.log(
                `[VoiceHealth] Error during health check for guild ${player.guildId}: ${error.message}`,
                'error'
            );
        }
    }

    async refreshConnection(player, guild, voiceChannel) {
        try {
            this.client.logger?.log(
                `[VoiceHealth] Refreshing voice connection for guild ${guild.id}`,
                'log'
            );

            if (player && player.voiceId) {
                try {
                    await player.setVoiceChannel(voiceChannel.id);

                    this.client.logger?.log(
                        `[VoiceHealth] Successfully refreshed connection for guild ${guild.id}`,
                        'log'
                    );

                    player.data?.set('lastActivityTime', Date.now());

                } catch (rejoinError) {
                    if (rejoinError.status === 404) {
                        this.client.logger?.log(
                            `[VoiceHealth] Player session expired for guild ${guild.id}, cleaning up`,
                            'debug'
                        );
                        this.stopMonitoring(guild.id);
                        try {
                            await this.client.manager?.destroyPlayer(guild.id);
                        } catch (destroyErr) {
                            this.client.logger?.log(
                                `[VoiceHealth] destroyPlayer after 404 failed for ${guild.id}: ${destroyErr?.message || destroyErr}`,
                                'warn'
                            );
                        }
                    } else {
                        this.client.logger?.log(
                            `[VoiceHealth] Failed to refresh connection: ${rejoinError.message}`,
                            'error'
                        );
                    }
                }
            } else {
                this.client.logger?.log(
                    `[VoiceHealth] Player no longer exists for guild ${guild.id}, stopping monitor`,
                    'debug'
                );
                this.stopMonitoring(guild.id);
            }

        } catch (error) {
            this.client.logger?.log(
                `[VoiceHealth] Error refreshing connection: ${error.message}`,
                'error'
            );
        }
    }

    async updateVoiceState(player, track) {
        try {
            const { syncVoiceChannelStatus } = require('./voiceChannelStatus');
            await syncVoiceChannelStatus(this.client, player, { track });
        } catch (error) {
            this.client.logger?.log(
                `[VoiceHealth] updateVoiceState failed for guild ${player?.guildId}: ${error?.message || error}`,
                'warn'
            );
        }
    }

    updateActivity(guildId) {
        const player = this.client.manager?.players.get(guildId);
        if (player?.data) {
            player.data.set('lastActivityTime', Date.now());
        }
    }

    stopAll() {
        for (const [guildId, interval] of this.healthChecks) {
            clearInterval(interval);
        }
        this.healthChecks.clear();
        this.client.logger?.log('[VoiceHealth] Stopped all monitors', 'log');
    }
}

module.exports = VoiceHealthMonitor;
