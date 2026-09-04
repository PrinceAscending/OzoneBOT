# OZONE Architecture & Project Structure

An overview of OZONE's architectural design, module layout, and internal subsystems.

---

## High-Level Architecture

OZONE is designed for horizontal scalability, high-availability audio streaming, and modern Discord user interactions:

```
                  ┌───────────────────────────────┐
                  │           ozone.js            │
                  │   ClusterManager (Hybrid)     │
                  └───────────────┬───────────────┘
                                  │ Spawns clusters
                  ┌───────────────┴───────────────┐
                  │           index.js            │
                  │       (MusicBot Client)       │
                  └───────────────┬───────────────┘
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
┌──────┴──────┐            ┌──────┴──────┐            ┌──────┴──────┐
│  Kazagumo   │            │   Discord   │            │  Dashboard  │
│  Lavalink   │            │ Components  │            │   Express   │
│   Manager   │            │     V2      │            │  (Port 7645)│
└─────────────┘            └─────────────┘            └─────────────┘
```

---

## Directory Layout

```
Ozone/
├── assets/                    # Portable transparent emojis & media assets
│   └── emojis/                # Auto-synced application emojis (oz_*)
├── dashboard/                 # Single Page Application Web Dashboard
│   ├── app.js                 # Vanilla frontend app with live state & audio controls
│   ├── index.html             # Responsive UI with dark/light theme
│   └── styles.css             # Glassmorphism aesthetic stylesheet
├── scripts/                   # System validation & build scripts
│   └── check.js               # Fast recursive JS syntax checker
├── src/
│   ├── commands/              # Modular slash & prefix commands
│   │   ├── Config/            # Server configuration (247, autorole, voicerole, aesthetic...)
│   │   ├── Favourite/         # Playlists, liked tracks, favourites
│   │   ├── Filters/           # Audio filters (bassboost, nightcore, 8d...)
│   │   ├── Information/       # System info (botinfo, serverinfo, userinfo, ping...)
│   │   ├── Music/             # Core playback & features (play, volume, mood, soundtrack...)
│   │   ├── Owner/             # Management commands (blacklist, reload, restart, eval...)
│   │   └── Utility/           # Utilities (poll, snipe, editsnipe...)
│   ├── custom/                # Custom builder helpers (buttons, embeds, numformat)
│   ├── events/                # Discord, Lavalink & Kazagumo event listeners
│   │   ├── Client/            # Gateway events (ready, interactionCreate, messageCreate...)
│   │   ├── Node/              # Shoukaku / Lavalink node lifecycle events
│   │   └── Players/           # Audio player events (playerStart, playerEnd, playerError...)
│   ├── loaders/               # Startup loaders (commands, events, nodes, managers)
│   ├── schema/                # Mongoose database models (MongoDB)
│   ├── structures/            # Core client class (MusicClient extending discord.js Client)
│   ├── utils/                 # Utilities, helpers & autonomous subsystems
│   │   ├── ai.js              # Groq LLaMA 3.3 integration & chat management
│   │   ├── responses.js       # Standardized Components V2 response builder
│   │   ├── voiceHealthMonitor.js # Self-healing voice connection supervisor
│   │   ├── listeningStats.js  # Batched dwell time & play count analytics
│   │   ├── playerCard.js      # Discord Components V2 now-playing card builder
│   │   ├── trackBanner.js     # Dynamic canvas artwork generator
│   │   └── radio.js           # Endless themed radio station stream engine
│   ├── config.js              # Environment variable loader & strict validator
│   ├── dashboard.js           # Express REST API & authentication router
│   └── emojis.js              # Emoji manifest & portable mention resolver
├── index.js                   # Shard cluster worker entry point
├── ozone.js                   # Cluster supervisor (discord-hybrid-sharding)
├── run.js                     # Bootstrap runner with dependency checks
└── package.json               # Manifest & dependency requirements
```

---

## Subsystem Deep Dive

### 1. Audio Engine (`Kazagumo` & `Shoukaku`)
- Connected to Lavalink v4 nodes using websockets.
- Multi-engine fallback: `ytmsearch` -> `amsearch` -> `spsearch` -> `ytsearch`.
- Automatic session restoration with reconnect exponential backoff.

### 2. Autonomous Voice Health Monitor
- `VoiceHealthMonitor` runs in the background for active players.
- Detects voice disconnects, stale Lavalink sessions (HTTP 404), or empty voice channels.
- Automatically handles reconnection for servers with `247` mode enabled.

### 3. Live UI (Discord Components V2)
- Uses modern Discord Components V2 containers (`ContainerBuilder`, `TextDisplayBuilder`, `SectionBuilder`).
- Interactive buttons for playback controls: Previous, Pause/Resume, Skip, Stop, Loop, Autoplay.
- Dynamic color theming through user preferences (`/aesthetic`).

### 4. Machine Learning & AI
- High-speed inference using Groq LLaMA 3.3 (70B parameter versatile model).
- Capabilities:
  - Interactive Desi/English JARVIS assistant (`^ai`, `/ai`).
  - Scene Soundtrack Composer (`/soundtrack`).
  - Collective Server Mood Ring (`/mood`).
