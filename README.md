# OZONE 

<div align="center">
  <p><strong>Next-Generation High-Fidelity Discord Music System & AI Suite, powered by Lavalink v4, Discord Components V2, and Pure Obsidian Dark Aesthetic.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-20.18+-22c55e.svg" alt="Node.js" />
    <img src="https://img.shields.io/badge/discord.js-v14.25+-5865F2.svg" alt="discord.js" />
    <img src="https://img.shields.io/badge/Lavalink-v4.x%20Cluster-f97316.svg" alt="Lavalink v4" />
    <img src="https://img.shields.io/badge/AI-Groq%20LLaMA%203.3-a855f7.svg" alt="Groq AI" />
    <img src="https://img.shields.io/badge/Theme-Pure%20Obsidian%20Dark-0a0b0e.svg" alt="Pure Obsidian" />
    <img src="https://img.shields.io/badge/License-MIT-06b6d4.svg" alt="License" />
  </p>
</div>

OZONE delivers audiophile-grade music streaming with an ultra-responsive Discord Components V2 interface, pure dark obsidian styling, dynamic Canvas playback visualization, multi-node Lavalink v4 clustering, deep AI integrations, and self-healing voice resilience. Fully supporting both slash commands and prefix commands.

---

## Key Highlights

### Pure Obsidian Dark Aesthetic
- **Sleek Stealth Interface**: Pure dark (`#0A0B0E`) background styling across all Components V2 containers, menus, and dashboard views.
- **Custom Application Emojis**: 100% custom-rendered Discord application emojis with zero legacy unicode emoji dependencies.
- **Dynamic Canvas Artwork & Timeline**: Real-time canvas track banners featuring embedded gradient scrub bars, live position markers, duration counters, and blurred album vignettes.
- **Interactive Theme Engine (`/theme`, `^theme`)**: Select card accent aesthetics on the fly via Discord select menus (Pure Obsidian, Minimal Slate, Neon Synth, Cyber Emerald, Golden Amber, Royal Velvet, Crimson Flame).

### Enterprise Lavalink v4 Audio Cluster
- **4-Node High-Availability Cluster**: Pre-configured with 4 verified, production-ready Lavalink v4 / Nodelink server nodes (`Node 1`, `Node 2`, `Node 3`, `Node 4`).
- **Interactive Node Selector (`/node`, `^node`)**: View real-time cluster telemetry (latency, active players, load, uptime) and switch nodes with interactive green (online) and black (offline) buttons.
- **Self-Healing Failover**: Dynamic health probe engine (`/v4/info`) with automatic session migration and 24/7 reconnect persistence.
- **Multi-Source Audio Resolver**: Native support for YouTube, YouTube Music, Spotify, Apple Music, Deezer, and JioSaavn.
- **Studio Audio Filters**: Bassboost, 8D, Nightcore, Vaporwave, Tremolo, Pop, and Soft equalizers.

### Smart Chat Hygiene & AutoClean
- **Automated Message Disposal (`/autoclean`, `^clean`)**: Automatically prunes transient bot confirmations, command invocations, warnings, and errors after configurable lifespans (5s–30s).
- **Player Card Immunity**: Active Now-Playing cards remain anchored and immune to cleanup while music streams.
- **Immediate Chat Purge**: Manual batch cleaning for quick channel tidying.

### Standardized Command Help System
- **Unified Help Syntax**: Every single command adheres to a clean, consistent format:
  ```
  [] = Optional Argument
  <> = Required Argument
  Do NOT type these when using commands!
  ```
  with explicit aliases, usage guidelines, and requester metadata.

### Next-Gen AI & Interactive Experiences
- **AI Scene Soundtrack Generator (`/soundtrack`)**: Describe any cinematic scene or mood, and OZONE's AI composes and queues matching scores.
- **Interactive Singalong & Karaoke (`/singalong`)**: Live interactive lyrics with verse navigation buttons directly inside chat.
- **Server Mood Ring (`/mood`)**: AI analyzes recent tracks, diagnosing acoustic vibe, energy level (0–100%), and suggesting the next song.
- **1v1 Music Duels (`/challenge`)**: Challenge friends in voice channels with live listener button voting and persistent guild leaderboards.
- **Music Alarm Clock (`/alarm`)**: Schedule OZONE to enter voice and wake your channel with a specific song or timer.
- **OZONE Radio (`/radio`)**: Endless themed stations (lofi, bollywood, EDM, gym, sleep, bhakti) that never stop broadcasting.
- **Name That Tune Quiz (`/quiz`)**: In-VC music guessing game with 4-button racing and guild leaderboards.

---

## Quick Command Reference

| Category | Primary Commands |
| :--- | :--- |
| **Music Playback** | `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/seek`, `/volume`, `/nowplaying`, `/queue`, `/loop`, `/shuffle`, `/autoplay`, `/previous`, `/replay`, `/rewind`, `/forward`, `/speed`, `/skipto`, `/remove` |
| **Cluster & Config**| `/node`, `/theme`, `/autoclean`, `/djrole`, `/voicerole`, `/247`, `/setprefix`, `/source`, `/ignore` |
| **Interactive & AI** | `/soundtrack`, `/singalong`, `/mood`, `/challenge`, `/alarm`, `/quiz`, `/radio`, `/ai`, `/ask`, `/vibe`, `/notify`, `/similar` |
| **Audio Filters** | `/filter bassboost`, `/filter nightcore`, `/filter 8d`, `/filter vaporwave`, `/filter pop`, `/filter soft`, `/filter clear` |
| **Playlists & Favs**| `/like`, `/unlike`, `/likeall`, `/playliked`, `/showliked`, `/playlist` |
| **Info & Diagnostics**| `/help`, `/botinfo`, `/serverinfo`, `/userinfo`, `/ping`, `/stats`, `/dashboard`, `/invite`, `/support` |
| **Channel Utilities**| `/clean`, `/snipe`, `/editsnipe`, `/poll` |

---

## Requirements

- **Node.js**: `20.18.1` or newer
- **Discord Bot Token**: Privileged Gateway Intents enabled:
  - `Server Members Intent`
  - `Message Content Intent`
  - `Presence Intent`
- **MongoDB**: Connection URI (MongoDB Atlas or local MongoDB instance)
- **Lavalink v4**: Built-in 4-node public cluster included by default; custom private nodes can be configured via environment variables.
- **Groq API Key**: (Optional) Powers Groq LLaMA 3.3 AI features (chat, mood ring, soundtrack).

---

## Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/PrinceAscending/OzoneBOT.git
   cd OzoneBOT
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment template:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your credentials:
   ```env
   # --- Core Bot Credentials (Required) ---
   BOT_TOKEN=your_discord_bot_token_here
   OWNER_IDS=your_discord_user_id
   BOT_PREFIX=^

   # --- Database & AI (Required) ---
   MONGODB_URL=mongodb://127.0.0.1:27017/ozone
   GROQ_API_KEY=your_groq_api_key_here

   # --- Spotify Metadata (Optional) ---
   SPOTIFY_CLIENT_ID=
   SPOTIFY_CLIENT_SECRET=

   # --- Web Dashboard ---
   DASHBOARD_ENABLED=true
   DASHBOARD_PORT=7645
   DASHBOARD_BASE_URL=http://localhost:7645
   DASHBOARD_ADMIN_KEY=your_secure_admin_password
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   ```

4. **Verify System Integrity**:
   Run automated syntax and module dependency validation:
   ```bash
   npm run verify
   ```

5. **Start OZONE**:
   ```bash
   npm start
   ```

---

## Architecture & Documentation

- [STRUCTURE.md](STRUCTURE.md) — Comprehensive guide to hybrid sharding, the high-availability Node Router, Components V2 containers, and background subsystems.
- [CHANGELOG.md](CHANGELOG.md) — Version history, breaking changes, and updates.

---

## License

Distributed under the MIT License. See [LICENSE.md](LICENSE.md) for full terms.