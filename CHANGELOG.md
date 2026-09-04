# Changelog

All notable changes to the **OZONE Discord Bot** are documented in this file.

---

## [2.0.0] - 2026-09-04

### 🚀 Major Highlights
- **Deep Systematic Debugging**: Overhauled error handling, memory leaks, and Discord.js v14 compatibility issues.
- **Components V2 Modernization**: Fully compliant single-root container architecture with zero validation errors.
- **8 Brand New Innovative Features**: Soundtracks, Singalong Karaoke, Server Mood Ring, 1v1 Music Battles, Music Alarms, Custom Aesthetics, Global Charts, and Song Alerts.
- **Complete Suite of Essential Commands**: Added missing `volume`, `serverinfo`, `botinfo`, `userinfo`, `autorole`, and `voicerole` commands.

---

### 🐛 Bug Fixes & Stability
- **`playerError` Event**: Replaced silent failures with active channel notifications, automatic track skipping, and recovery.
- **`play.js` Overhaul**: Unified ~600 duplicate lines between prefix and slash executions; removed defunct `deleted` property check (removed in Discord.js v14); hardened player creation and session recovery.
- **Command Loader (`loadCommands.js`)**: Ensured all flags (`dj`, `cooldown`, `aliases`, `usage`, `args`) propagate cleanly to Slash Commands.
- **Memory Leak in `messageCreate.js`**: Added automated cleanup of empty cooldown maps preventing unbounded heap growth.
- **`AutoDestroy.js` Hardening**: Fixed missing semicolons and stale voice channel references across 60s idle timeouts.
- **Voice Health Monitor**: Unreferenced internal timers (`unref()`) to prevent hanging NodeJS processes during shutdown.
- **`blacklist.js`**: Fixed container nesting bug where multiple containers were passed as root components.
- **Dashboard Brute-Force Rate Limiting**: Added automated session sweep to prune stale admin attempt records.
- **AI Mode Timeout**: Increased aggressive 30s idle timeout to 2 minutes with friendly notifications.

---

### 🌟 New Features

#### 🎵 Music & Audio Enhancements
- **`/volume` (`^volume`, `^vol`)**: Full range (0-150%) volume control with visual slider bar.
- **`/soundtrack`**: AI-powered movie & game scene soundtrack generator that analyzes prompts and queues cinematic orchestrations.
- **`/singalong` (`^karaoke`)**: Live paginated interactive lyrics and karaoke viewer with verse navigation.
- **`/mood` (`^vibecheck`)**: Server Mood Ring analyzing real-time acoustic vibe, emotional tone, and energy levels.
- **`/challenge` (`^battle`)**: 1v1 Music Duels with live VC button voting and persistent server win/loss leaderboard.
- **`/alarm` (`^wake`)**: In-VC music alarm clock and study reminder timers.
- **`/notify` (`^alert`)**: Song & artist alert system that alerts users whenever their favorite music starts playing.
- **Enhanced `/toptracks`**: Added global cross-server listening charts (`scope:global`).

#### ⚙️ Configuration & Server Management
- **`/autorole` (`^autorole`)**: Automated join-role assigner for new guild members with role hierarchy safety.
- **`/voicerole` (`^voicerole`)**: Dynamic role assigner given when entering VC and stripped when leaving.
- **`/aesthetic` (`^theme`)**: Personalized now-playing card styling (Neon, Cyber, Amber, Royal, Minimal, Crimson).

#### ℹ️ Information & Utilities
- **`/serverinfo`**: Rich server statistics, member counts, boost status, and verification levels.
- **`/botinfo`**: Real-time system specifications, RAM utilization, node/djs versions, and cluster health.
- **`/userinfo`**: Member join timestamps, account creation age, and role hierarchy.

---

### 🛡️ System & Architecture
- **Centralized Response Builder (`responses.js`)**: Unified `successPayload`, `errorPayload`, `warnPayload`, and `infoPayload`.
- **Graceful Shutdown**: Added `SIGINT` and `SIGTERM` listeners in `index.js` to cleanly close database connections and voice players.
- **Log Level Filtering**: Added `LOG_LEVEL` environment variable support to `src/utils/logger.js`.
- **Runner Modernization (`run.js`)**: Enabled full stdio inheritance for transparent live error monitoring.
