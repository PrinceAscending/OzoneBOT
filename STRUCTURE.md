# OZONE Architecture & Project Structure

An architectural overview of OZONE's design, module hierarchy, high-availability audio clustering, and background subsystems.

---

## High-Level Architecture

OZONE is engineered for horizontal scalability, zero-downtime audio streaming, and modern Discord user interactions:

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
│ Node Router │            │     V2      │            │  (Port 7645)│
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
│   ├── index.html             # Responsive UI with pure dark stealth theme
│   └── styles.css             # Glassmorphism aesthetic stylesheet
├── scripts/                   # System validation & build scripts
│   ├── check.js               # Fast recursive JS syntax checker
│   └── verify_all.js          # Full stack module load & schema validation suite
├── src/
│   ├── commands/              # Modular slash & prefix commands (81 total)
│   │   ├── Config/            # Server configuration (247, autoclean, djrole, ignore, node, setprefix, source, theme, voicerole)
│   │   ├── Favourite/         # Playlists, liked tracks, favourites
│   │   ├── Filters/           # Audio filters (bassboost, nightcore, 8d, vaporwave...)
│   │   ├── Information/       # Diagnostics & info (botinfo, serverinfo, userinfo, ping, help, dashboard...)
│   │   ├── Music/             # Core playback & features (play, volume, clean, mood, soundtrack, singalong...)
│   │   ├── Owner/             # Protected management commands (blacklist, botprofile, nopaccess, reload, restart)
│   │   └── Utility/           # Utilities (poll, snipe, editsnipe)
│   ├── custom/                # Custom builder helpers (buttons, embeds, numformat)
│   ├── engine/                # High-availability audio infrastructure & routing
│   │   ├── NodeRouter.js      # Dynamic node health monitoring, ping scoring & selection
│   │   ├── PlayerMigrationService.js # Live track position & player migration between nodes
│   │   └── QueuePersistence.js # Cold-storage queue state preservation & auto-resume
│   ├── events/                # Discord, Lavalink & Kazagumo event listeners
│   │   ├── Client/            # Gateway events (ready, interactionCreate, messageCreate...)
│   │   ├── Node/              # Shoukaku / Lavalink node lifecycle events (ready, close, disconnect, error)
│   │   └── Players/           # Audio player events (playerStart, playerEnd, playerError, playerUpdate...)
│   ├── loaders/               # Startup loaders (commands, events, nodes, player managers)
│   ├── schema/                # Mongoose database models (MongoDB Atlas)
│   │   ├── 247.js             # 24/7 channel persistence
│   │   ├── autoclean.js       # Per-guild auto-message cleanup rules
│   │   ├── userpreferences.js # Accent themes, custom volume & node preferences
│   │   └── ...
│   ├── structures/            # Core client class (MusicClient extending discord.js Client)
│   ├── utils/                 # Utilities, helpers & autonomous subsystems
│   │   ├── ai.js              # Groq LLaMA 3.3 integration & chat management
│   │   ├── autoClean.js       # Background message pruning & transient message tracking
│   │   ├── commandHelp.js     # Standardized syntax card generator
│   │   ├── nodeButtons.js     # Interactive node selector action rows (green/black state)
│   │   ├── playerCard.js      # Discord Components V2 now-playing card builder
│   │   ├── trackBanner.js     # Canvas dynamic artwork generator with embedded scrub bar
│   │   ├── responses.js       # Standardized Components V2 response builder
│   │   ├── voiceHealthMonitor.js # Self-healing voice connection supervisor
│   │   └── ...
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

### 1. High-Availability Lavalink v4 Audio Cluster
- **Multi-Node Pool**: Pre-configured with 4 production Lavalink v4 nodes (`Node 1` - `Node 4`) supporting both SSL/WSS and non-SSL configurations.
- **REST Health Probing**: `NodeRouter` actively queries `/v4/info` on every node, tracking latency, player load, and connection state.
- **Dynamic Failover**: If a node disconnects, `PlayerMigrationService` seamlessly captures player positions and migrates active streams to the next healthiest node without interrupting the queue.
- **Interactive Node Selector**: Admins and users can inspect node metrics via `/node status` and manually switch streaming nodes using interactive Discord buttons (Green = Online, Black = Standby/Offline).

### 2. Discord Components V2 & Pure Dark Obsidian Theme
- **Single-Root Container Pattern**: All messages adhere strictly to Discord's Components V2 specification using `ContainerBuilder`, `TextDisplayBuilder`, and `ActionRowBuilder`.
- **Pure Obsidian Dark (`#0A0B0E`)**: Eliminates bright embeds in favor of high-contrast stealth dark cards.
- **Interactive Theme Switcher (`/theme`, `^theme`)**: Dynamic dropdown select menus allow instant selection of 7 distinct visual styles (Pure Obsidian, Minimal Slate, Neon Synth, Cyber Emerald, Golden Amber, Royal Velvet, Crimson Flame).

### 3. Canvas Track Banner & Live Scrub Timeline
- **Hardware-Accelerated Rendering**: Uses `@napi-rs/canvas` to composite high-resolution banners (1000×265) on demand.
- **Embedded Playback Scrub Bar**: Features a cyan-to-emerald gradient progress bar, glow scrubber thumb, percentage indicator, and elapsed/total duration counters embedded directly inside the image.
- **Safe Discord Limits**: Updates are throttled to comply with Discord's message edit rate limits while maintaining accurate visual progress.

### 4. Smart Chat AutoClean & Hygiene Engine
- **Automated Message Disposal**: Prunes transient bot notices, error messages, and command triggers after user-configurable intervals (5s–30s).
- **Player Card Immunity**: Now-Playing cards remain anchored and active in the channel, ensuring music controls are never destroyed.
- **Interactive Dashboard (`/autoclean`)**: In-channel configuration panel with one-click toggles and lifespan selector buttons.

### 5. Standardized Command Help System
- **Unified Syntax**: Every command information card is formatted identically:
  ```
  [] = Optional Argument
  <> = Required Argument
  Do NOT type these when using commands!
  ```
- **Consistent Metadata**: Automatically enumerates aliases, exact usage strings, command descriptions, and requester credits.

### 6. Autonomous Voice Health Supervisor
- **VoiceHealthMonitor**: Background supervisor detects voice disconnects, stale Lavalink sessions (HTTP 404), or empty voice channels.
- **24/7 Channel Recovery**: Automatically reconnects and resumes playback for servers with `247` mode enabled upon gateway reconnection.

### 7. Groq LLaMA 3.3 AI Suite
- High-speed conversational AI powered by Groq's LLaMA 3.3 70B parameter engine.
- Supports conversational assistant mode (`/ai`, `^ai`), cinematic scene score composer (`/soundtrack`), and collective server mood analysis (`/mood`).
