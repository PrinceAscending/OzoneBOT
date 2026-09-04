# OZONE 🎵

<div align="center">
  <p><strong>Next-Generation Discord Music System & AI Suite, powered by Lavalink v4 & Discord Components V2.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-20.18+-green.svg" alt="Node.js" />
    <img src="https://img.shields.io/badge/discord.js-v14.25+-blue.svg" alt="discord.js" />
    <img src="https://img.shields.io/badge/Lavalink-v4-orange.svg" alt="Lavalink" />
    <img src="https://img.shields.io/badge/AI-Groq%20LLaMA%203.3-purple.svg" alt="Groq AI" />
    <img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License" />
  </p>
</div>

OZONE combines studio-quality music playback with an ultra-responsive Discord Components V2 interface, deep AI integrations, interactive audio games, and self-healing voice resilience. Fully supporting both slash commands and prefix commands.

---

## 🌟 Key Features

### 🎧 Core Audio & Playback
- **High-Fidelity Playback**: Powered by Lavalink v4 and Kazagumo for seamless, zero-lag streaming.
- **Dynamic Now-Playing Cards**: Real-time progress bars, interactive playback buttons (Previous, Pause/Resume, Skip, Stop, Loop, Autoplay), and dynamic canvas artwork banners.
- **Precision Volume Control**: `/volume` (`^volume <0-150>`) with visual ASCII meter.
- **Multi-Source Fallback**: YouTube, YouTube Music, Spotify, Apple Music, Deezer, and JioSaavn.
- **Audio Filters**: Bassboost, 8D, Nightcore, Vaporwave, Tremolo, Pop, and Soft filters.
- **Self-Healing Voice Connections**: Automatic recovery and reconnection for `247` radio channels.

### 🚀 Innovative & Never-Seen-Before Features
- **🎬 AI Scene Soundtrack Generator (`/soundtrack`)**: Describe any movie, game, or real-life scene (e.g. *cyberpunk rain in neo tokyo*), and OZONE's AI composes and queues matching cinematic scores.
- **🎤 Interactive Singalong & Karaoke (`/singalong`)**: Live interactive lyrics with verse-by-verse navigation buttons directly in chat.
- **🔮 Server Mood Ring (`/mood`)**: AI analyzes recent tracks, diagnosing the server's acoustic vibe, energy level (0-100%), and suggests the next song.
- **⚔️ 1v1 Music Duels (`/challenge`)**: Challenge friends in voice channels to a head-to-head song duel with live listener voting and a persisted server leaderboard.
- **⏰ Music Alarm Clock (`/alarm`)**: Schedule OZONE to enter voice and wake your channel with a specific song after a timer.
- **🎨 Custom Aesthetic Themes (`/aesthetic`)**: Personalize now-playing card styling with custom neon accents (Neon, Cyber, Amber, Royal, Minimal, Crimson).
- **🔔 Song & Artist Alerts (`/notify`)**: Get pinged whenever your favorite artist or track begins playing in the server.
- **🌐 Global & Local Charts (`/toptracks`)**: Server-wide and cross-server listening time leaderboards.
- **📻 OZONE Radio (`/radio`)**: Infinite themed stations (lofi, bollywood, EDM, gym, sleep, bhakti) that never stop broadcasting.
- **🎮 Name That Tune Quiz (`/quiz`)**: In-VC music guessing game with 4-button racing and guild leaderboard.

### ⚙️ Server Tools & Utilities
- **Autorole System (`/autorole`)**: Automatically assign roles to new members upon joining.
- **Voice Role (`/voicerole`)**: Dynamic role granted while a user is in voice and removed upon disconnect.
- **DJ Role Gate (`/djrole`)**: Restrict audio controls to designated DJs.
- **24/7 Channel Mode (`/247`)**: Stay connected in voice even when listeners leave.
- **Snipe & EditSnipe (`/snipe`, `/editsnipe`)**: Recover recently deleted or edited messages.
- **Server, User & Bot Diagnostics (`/serverinfo`, `/userinfo`, `/botinfo`)**: Deep Discord and system metrics.

---

## 📋 Requirements

- **Node.js**: 20.18.1 or newer
- **Discord Bot Token**: With Server Members, Presence, and Message Content privileged intents enabled
- **Permissions**: `Connect`, `Speak`, `Set Voice Channel Status`, and `Manage Roles` (for autorole/voicerole)
- **MongoDB Database**: Local or Cloud (MongoDB Atlas)
- **Lavalink v4 Node**: With preferred audio plugins enabled
- **Groq API Key**: Optional, enables AI Chat, Mood Ring, and Soundtrack features

---

## 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/PrinceAscending/OzoneBOT.git
   cd OzoneBOT
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your configuration:
   ```dotenv
   BOT_TOKEN=your_bot_token_here
   OWNER_IDS=your_discord_id
   BOT_PREFIX=^
   MONGODB_URL=mongodb://127.0.0.1:27017/ozone
   LAVALINK_URL=localhost:2333
   LAVALINK_PASSWORD=your_lavalink_password
   GROQ_API_KEY=your_groq_api_key
   ```

4. **Verify Syntax & Quality**:
   ```bash
   npm run check
   ```

5. **Start OZONE**:
   ```bash
   npm start
   ```

---

## 📂 Architecture Overview

For a comprehensive explanation of clusters, shard managers, and the Lavalink event pipeline, consult [STRUCTURE.md](STRUCTURE.md).

For a complete record of updates and version history, see [CHANGELOG.md](CHANGELOG.md).

---

## 📄 License

Distributed under the MIT License. See [LICENSE.md](LICENSE.md) for more information.