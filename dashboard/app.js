/* OZONE Dashboard — frontend logic */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const API = "";

  const state = {
    session: localStorage.getItem("ozone_session") || null,
    adminToken: sessionStorage.getItem("ozone_admin") || null,
    me: null,
    view: "overview",
    guilds: [],
    myGuilds: [],
    logsTimer: null,
    player: {
      guildId: null,
      pollTimer: null,
      tickTimer: null,
      paused: true,
      posBase: 0,
      posAt: 0,
      length: 0,
    },
    favorites: [],
    chatStarted: false,
    playerTrack: null,
    dev: {
      timer: null,
      tickTimer: null,
      spotify: null,
    },
  };

  /* ---------- helpers ---------- */

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    // Prefer admin token when both exist (admin routes override user sessions).
    const token = state.adminToken || state.session;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (res.status === 401) {
      if (path.startsWith("/api/admin")) {
        state.adminToken = null;
        sessionStorage.removeItem("ozone_admin");
        renderAdmin();
      } else {
        state.session = null;
        localStorage.removeItem("ozone_session");
        renderLoginState();
      }
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  const fmtUptime = (sec) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtBytes = (bytes) => {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  const esc = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const icon = (guild) => {
    if (guild.icon) {
      /* tolerate raw CDN hashes from older sessions as well as full URLs */
      const src = String(guild.icon).startsWith("http")
        ? guild.icon
        : `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=128`;
      return `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" />`;
    }
    return esc((guild.name || "?").charAt(0).toUpperCase());
  };

  const avatarUrl = (user, size = 128) => {
    if (user?.avatar) {
      const ext = user.avatar.startsWith("a_") ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
    }
    if (user?.avatarUrl) return user.avatarUrl;
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  };

  /* ---------- views ---------- */

  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    ["overview", "servers", "profile", "chat", "dev", "admin", "player"].forEach((v) => {
      $(`view-${v}`).classList.toggle("hidden", v !== view);
    });
    closeChipMenu();
    if (view !== "player") stopPlayerPolling();
    if (view !== "dev") stopDevPolling();
    if (view === "overview") loadOverview();
    if (view === "servers") loadMyServers();
    if (view === "profile") loadProfile();
    if (view === "chat") renderChat();
    if (view === "dev") loadDev();
    if (view === "admin") renderAdmin();
  }

  /* ---------- toasts ---------- */

  function toast(message, type = "success") {
    const wrap = $("toast-wrap");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = `${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"} ${message}`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  /* ---------- ticker ---------- */

  function renderTicker() {
    const el = $("ticker-track");
    if (!el) return;
    const t = state.playerTrack;
    const nowPlaying = t && t.title ? `${t.title} — ${t.author}` : "STANDING BY";
    const seg = `◉ OZONE RADIO · NOW PLAYING: ${nowPlaying} · 59 COMMANDS · ALWAYS ON AIR · `;
    el.textContent = seg + seg;
  }

  /* ---------- overview ---------- */

  async function loadOverview() {
    try {
      const stats = await api("/api/stats");
      $("stat-status").textContent = stats.status === "online" ? "Online" : "Connecting…";
      $("stat-status").className = `badge ${stats.status === "online" ? "badge-online" : "badge-loading"}`;
      // Update ticker with real command count, fallback when not yet known.
      const cmdCount = stats.commands || stats.slashCommands || 59;
      const nowPlaying = state.playerTrack?.title
        ? `${state.playerTrack.title} — ${state.playerTrack.author || ""}`
        : "STANDING BY";
      $("ticker-track").textContent =
        `◉ OZONE RADIO · NOW PLAYING: ${nowPlaying} · ${cmdCount} COMMANDS · ALWAYS ON AIR · ` +
        `◉ OZONE RADIO · NOW PLAYING: ${nowPlaying} · ${cmdCount} COMMANDS · ALWAYS ON AIR · `;
      $("stat-ping").textContent = `${stats.ping} ms`;
      $("stat-cluster").textContent = `Cluster ${stats.cluster} / ${stats.clusters}`;
      $("stat-guilds").textContent = stats.guilds;
      $("stat-users").textContent = stats.users.toLocaleString();
      $("stat-commands").textContent = stats.slashCommands;
      $("stat-players").textContent = stats.players;
      $("stat-ai").textContent = stats.aiUsers;
      $("stat-uptime").textContent = fmtUptime(stats.uptime);
      $("footer-status").textContent = `Node ${stats.node} · RSS ${fmtBytes(stats.memory.rss)}`;
      renderTicker();

      const data = await api("/api/guilds");
      state.guilds = data.guilds;
      $("guild-count").textContent = `${data.guilds.length} total`;
      renderGuildList();
    } catch (error) {
      $("guild-list").innerHTML = `<div class="empty">Failed to load: ${esc(error.message)}</div>`;
    }
  }

  function renderGuildList() {
    const list = $("guild-list");
    if (!state.guilds.length) {
      list.innerHTML = "";
      $("guild-empty").classList.remove("hidden");
      return;
    }
    $("guild-empty").classList.add("hidden");
    list.innerHTML = state.guilds
      .map(
        (g) => `
      <div class="guild-row" data-guild="${esc(g.id)}">
        <div class="guild-icon">${icon(g)}</div>
        <div class="guild-info">
          <div class="guild-name">${esc(g.name)}</div>
          <div class="guild-meta">${g.members.toLocaleString()} members</div>
        </div>
        <div class="guild-status ${g.hasPlayer ? "playing" : "idle"}">${g.hasPlayer ? "▶ Playing" : "Idle"}</div>
      </div>`
      )
      .join("");
    list.querySelectorAll(".guild-row").forEach((row) => {
      row.addEventListener("click", () => {
        const guild = state.guilds.find((g) => g.id === row.dataset.guild);
        if (guild) showGuildDetail(guild);
      });
    });
  }

  async function showGuildDetail(guild) {
    try {
      const detail = await api(`/api/guild/${guild.id}`);
      $("detail-name").textContent = detail.name;
      $("detail-prefix").textContent = detail.prefix;
      $("detail-members").textContent = detail.members.toLocaleString();
      $("detail-owner").textContent = detail.ownerId;
      const np = $("detail-nowplaying");
      if (detail.player && detail.player.track) {
        np.classList.remove("hidden");
        $("np-title").textContent = detail.player.track.title;
        $("np-author").textContent = `${detail.player.track.author} · ${detail.player.queueSize} in queue${detail.player.paused ? " · paused" : ""}`;
      } else {
        np.classList.add("hidden");
      }
      $("detail-player").textContent = detail.player ? "Active" : "Inactive";
    } catch (error) {
      $("detail-player").textContent = error.message;
    }
  }

  /* ---------- my servers (OAuth) ---------- */

  async function loadMyServers() {
    const list = $("my-guild-list");
    if (!state.session) {
      list.innerHTML = `<div class="empty">Login with Discord to see your servers.</div>`;
      $("my-guild-empty").classList.add("hidden");
      $("vc-list").innerHTML = "";
      $("vc-empty").classList.add("hidden");
      return;
    }
    try {
      const me = await api("/api/me");
      state.me = me;
      renderLoginState();
      updateNavVisibility();
      if (state.view === "admin") renderAdmin();
      state.myGuilds = me.guilds;
      renderVcList(me.vcs || []);
      loadFavorites();
      if (!me.guilds.length) {
        list.innerHTML = "";
        $("my-guild-empty").classList.remove("hidden");
        return;
      }
      $("my-guild-empty").classList.add("hidden");
      list.innerHTML = me.guilds
        .map(
          (g) => `
        <div class="guild-row" data-guild="${esc(g.id)}">
          <div class="guild-icon">${icon(g)}</div>
          <div class="guild-info"><div class="guild-name">${esc(g.name)}</div></div>
          <div class="guild-status playing">Manage →</div>
        </div>`
        )
        .join("");
      list.querySelectorAll(".guild-row").forEach((row) => {
        row.addEventListener("click", async () => {
          try {
            const detail = await api(`/api/me/guild/${row.dataset.guild}`);
            $("detail-name").textContent = detail.name;
            $("detail-prefix").textContent = detail.prefix;
            $("detail-members").textContent = detail.members.toLocaleString();
            $("detail-owner").textContent = detail.ownerId;
            const np = $("detail-nowplaying");
            if (detail.player && detail.player.track) {
              np.classList.remove("hidden");
              $("np-title").textContent = detail.player.track.title;
              $("np-author").textContent = `${detail.player.track.author} · ${detail.player.queueSize} in queue${detail.player.paused ? " · paused" : ""}`;
            } else {
              np.classList.add("hidden");
            }
            $("detail-player").textContent = detail.player ? "Active" : "Inactive";
            $("guild-detail").classList.remove("hidden");
            $("guild-detail").scrollIntoView({ behavior: "smooth" });
          } catch (error) {
            $("detail-player").textContent = error.message;
          }
        });
      });
    } catch (error) {
      list.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  function renderVcList(vcs) {
    const box = $("vc-list");
    if (!vcs.length) {
      box.innerHTML = "";
      $("vc-empty").classList.remove("hidden");
      return;
    }
    $("vc-empty").classList.add("hidden");
    box.innerHTML = vcs
      .map(
        (v) => `
      <div class="guild-row" data-guild="${esc(v.id)}">
        <div class="guild-icon">${icon(v)}</div>
        <div class="guild-info">
          <div class="guild-name">${esc(v.name)}</div>
          <div class="guild-meta">${esc(v.channelName)}${v.track ? ` · ♪ ${esc(v.track)}` : ""}</div>
        </div>
        <div class="guild-status playing">♪ Now Playing →</div>
      </div>`
      )
      .join("");
    box.querySelectorAll(".guild-row").forEach((row) => {
      row.addEventListener("click", () => openPlayer(row.dataset.guild));
    });
  }

  function updateNavVisibility() {
    const isAdmin = Boolean(state.adminToken) || Boolean(state.me?.isAdmin);
    $("nav-admin").classList.toggle("hidden", !isAdmin);
    $("nav-profile").classList.toggle("hidden", !state.session);
  }

  async function fetchMe() {
    try {
      state.me = await api("/api/me");
      renderLoginState();
      updateNavVisibility();
      if (state.view === "admin") renderAdmin();
    } catch {
      /* session may be invalid; api() already cleared it */
    }
  }

  /* ---------- favorites ---------- */

  async function loadFavorites() {
    if (!state.session) return;
    try {
      const data = await api("/api/me/favorites");
      state.favorites = data.songs;
      renderFavorites();
    } catch { /* non-fatal */ }
  }

  function renderFavorites() {
    const box = $("fav-list");
    const songs = state.favorites || [];
    if (!songs.length) {
      box.innerHTML = "";
      $("fav-empty").classList.remove("hidden");
      return;
    }
    $("fav-empty").classList.add("hidden");
    box.innerHTML = songs
      .map(
        (s, i) => `
      <div class="fav-card">
        <div class="fav-thumb">${s.thumbnail ? `<img src="${esc(s.thumbnail)}" alt="" referrerpolicy="no-referrer" />` : "♪"}</div>
        <div class="fav-info">
          <div class="fav-title">${esc(s.title)}</div>
          <div class="fav-meta">${esc(s.author || "Unknown")}${s.duration ? ` · ${esc(s.duration)}` : ""}</div>
        </div>
        <button class="fav-heart" data-url="${esc(s.url)}" title="Remove">♥</button>
      </div>`
      )
      .join("");
    box.querySelectorAll(".fav-heart").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api("/api/me/favorites", { method: "DELETE", body: { url: btn.dataset.url } });
          state.favorites = data.songs;
          renderFavorites();
          toast("Removed from favorites");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    });
  }

  /* ---------- profile ---------- */

  const CONN_ICONS = {
    amazonmusic: "amazonmusic", battlenet: "battlenet", bungie: "bungie", crunchyroll: "crunchyroll",
    ebay: "ebay", epicgames: "epicgames", facebook: "facebook", github: "github",
    instagram: "instagram", leagueoflegends: "leagueoflegends", mastodon: "mastodon",
    paypal: "paypal", playstation: "playstation", reddit: "reddit", riotgames: "riotgames",
    roblox: "roblox", skype: "skype", spotify: "spotify", steam: "steam", tiktok: "tiktok",
    twitch: "twitch", twitter: "twitter", xbox: "xbox", youtube: "youtube",
  };
  const CONN_NAMES = {
    amazonmusic: "Amazon Music", battlenet: "Battle.net", bungie: "Bungie", crunchyroll: "Crunchyroll",
    ebay: "eBay", epicgames: "Epic Games", facebook: "Facebook", github: "GitHub",
    instagram: "Instagram", leagueoflegends: "League of Legends", mastodon: "Mastodon",
    paypal: "PayPal", playstation: "PlayStation", reddit: "Reddit", riotgames: "Riot Games",
    roblox: "Roblox", skype: "Skype", spotify: "Spotify", steam: "Steam", tiktok: "TikTok",
    twitch: "Twitch", twitter: "X / Twitter", xbox: "Xbox", youtube: "YouTube",
  };

  function connTileHtml(c) {
    const slug = CONN_ICONS[c.type] || "";
    const label = CONN_NAMES[c.type] || c.type;
    return `
    <div class="conn-tile">
      <div class="conn-icon"><span>${esc(label.charAt(0).toUpperCase())}</span>${slug ? `<img src="https://cdn.simpleicons.org/${slug}" alt="${esc(label)} logo" loading="lazy" onerror="this.remove()" />` : ""}</div>
      <div class="conn-info">
        <div class="conn-platform">${esc(label)}</div>
        <div class="conn-name">${esc(c.name)}</div>
      </div>
      <span class="conn-verified" title="Verified on Discord">✓</span>
    </div>`;
  }

  function renderConnections(connections, stale) {
    const box = $("profile-conn");
    const empty = $("profile-conn-empty");
    $("profile-conn-stale").classList.toggle("hidden", !stale);
    if (!connections.length) {
      box.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    box.innerHTML = connections.map(connTileHtml).join("");
  }

  async function loadProfile() {
    const locked = $("profile-locked");
    const shell = $("profile-shell");
    if (!state.session) {
      locked.classList.remove("hidden");
      shell.classList.add("hidden");
      return;
    }
    try {
      const data = await api("/api/me/profile");
      locked.classList.add("hidden");
      shell.classList.remove("hidden");
      $("profile-avatar").src = data.user.avatarUrl;
      $("profile-display").textContent = data.profile.displayName || data.user.username;
      $("profile-username").textContent = data.user.username;
      $("profile-username-2").textContent = data.user.username;
      $("profile-id").textContent = data.user.id;
      $("profile-stat-favs").textContent = data.stats.favorites;
      $("profile-stat-guilds").textContent = data.stats.guilds;
      $("profile-stat-vcs").textContent = data.stats.vcs;
      $("profile-bio").textContent = data.profile.bio || "No bio yet — write something about yourself.";
      $("profile-admin").classList.toggle("hidden", !data.isAdmin);
      $("profile-display-input").value = data.profile.displayName || "";
      $("profile-bio-input").value = data.profile.bio || "";
      $("profile-save-msg").textContent = "";
      renderConnections(data.connections || [], Boolean(data.connectionsStale));
    } catch (error) {
      // Preserve the original icon and structure; only update the descriptive
      // text so the locked card stays recognizable.
      const message = locked.querySelector(".empty-message");
      if (message) {
        message.textContent = `Failed to load profile: ${error.message}`;
      } else {
        locked.innerHTML =
          `<span class="empty-icon">🔒</span>` +
          `<span class="empty-message">Failed to load profile: ${esc(error.message)}</span>`;
      }
      locked.classList.remove("hidden");
      shell.classList.add("hidden");
    }
  }

  /* ---------- AI chat ---------- */

  function renderChat() {
    const loggedIn = Boolean(state.session);
    $("chat-locked").classList.toggle("hidden", loggedIn);
    $("chat-shell").classList.toggle("hidden", !loggedIn);
    if (loggedIn && !state.chatStarted) {
      state.chatStarted = true;
      addChatMessage("ai", "Arre bhai, welcome to OZONE AI! 🎧\nAsk me for song recommendations, music tips, or anything else — Hinglish mein baat karte hain.");
    }
  }

  function addChatMessage(role, content) {
    const box = $("chat-messages");
    const row = document.createElement("div");
    row.className = `chat-row ${role}`;
    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}`;
    if (role === "ai") {
      avatar.textContent = "O";
      bubble.innerHTML = `<div class="chat-role">OZONE AI</div>`;
      const body = document.createElement("div");
      body.textContent = content;
      bubble.appendChild(body);
      row.appendChild(avatar);
      row.appendChild(bubble);
    } else {
      avatar.innerHTML = `<img src="${esc(avatarUrl(state.me?.user || {}, 64))}" alt="" />`;
      bubble.textContent = content;
      row.appendChild(bubble);
      row.appendChild(avatar);
    }
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  async function sendChatMessage(message) {
    const input = $("chat-input");
    if (!message.trim()) return;
    input.value = "";
    addChatMessage("user", message);
    const typing = addChatMessage("ai", "");
    const typingBubble = typing.querySelector(".chat-msg");
    typingBubble.innerHTML = `<div class="chat-role">OZONE AI</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
    try {
      const data = await api("/api/ai/ask", { method: "POST", body: { message } });
      typing.remove();
      addChatMessage("ai", data.reply);
    } catch (error) {
      typing.remove();
      addChatMessage("ai", `⚠️ ${error.message}`);
    }
  }

  /* ---------- now playing (read-only) ---------- */

  const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  function openPlayer(guildId) {
    if (!state.session) {
      window.location.href = "/auth/login";
      return;
    }
    // Kill any previous interval pair first — re-opening the player used to
    // stack pollers (old guild kept polling in the background forever).
    stopPlayerPolling();
    state.player.guildId = guildId;
    state.player.pollTimer = setInterval(pollPlayer, 2500);
    state.player.tickTimer = setInterval(tickPlayer, 1000);
    switchView("player");
    pollPlayer();
    loadTopListeners(guildId);
  }

  function stopPlayerPolling() {
    if (state.player.pollTimer) clearInterval(state.player.pollTimer);
    if (state.player.tickTimer) clearInterval(state.player.tickTimer);
    state.player.pollTimer = null;
    state.player.tickTimer = null;
  }

  async function pollPlayer() {
    if (!state.player.guildId) return;
    try {
      const data = await api(`/api/player/${state.player.guildId}`);
      renderPlayer(data);
    } catch (error) {
      $("player-error").textContent = error.message;
      $("player-error").classList.remove("hidden");
    }
  }

  function renderPlayer(data) {
    const p = state.player;
    p.paused = !data.track || data.paused;
    p.length = data.track ? (data.track.length / 1000) : 0;
    p.posBase = data.position / 1000;
    p.posAt = Date.now();
    state.playerTrack = data.track;

    const art = $("player-art");
    if (data.track && data.track.thumbnail) {
      art.innerHTML = `<img src="${esc(data.track.thumbnail)}" alt="" referrerpolicy="no-referrer" />`;
    } else {
      art.innerHTML = "♪";
    }
    $("player-title").textContent = data.track ? data.track.title : "Nothing playing";
    $("player-author").textContent = data.track
      ? `${data.track.author}${data.track.requester ? ` · requested by ${data.track.requester}` : ""}`
      : "Join the voice channel and play something";
    $("player-server").textContent = `${data.guildName} · ${data.voiceChannel || "voice channel"}`;
    $("player-dur").textContent = data.track && !data.track.isStream ? fmtTime(data.track.length / 1000) : "LIVE";
    $("queue-count").textContent = `${data.queue.length} upcoming`;

    const eq = $("eq");
    eq.classList.toggle("paused", !data.track || data.paused);
    eq.classList.toggle("idle", !data.track);

    const queue = $("player-queue");
    if (!data.queue.length) {
      queue.innerHTML = `<div class="empty"><span class="empty-icon">🎵</span>Queue is empty</div>`;
    } else {
      queue.innerHTML = data.queue
        .map(
          (t, i) => `
        <div class="queue-row">
          <span class="queue-idx">${i + 1}</span>
          <div class="queue-info">
            <div class="queue-title">${esc(t.title)}</div>
            <div class="queue-meta">${esc(t.author)}</div>
          </div>
          <span class="queue-dur">${t.length ? fmtTime(t.length / 1000) : "—"}</span>
        </div>`
        )
        .join("");
    }

    const history = $("player-history");
    if (!data.history || !data.history.length) {
      history.innerHTML = `<div class="empty"><span class="empty-icon">🕘</span>Nothing played yet</div>`;
    } else {
      history.innerHTML = data.history
        .slice()
        .reverse()
        .map(
          (t, i) => `
        <div class="history-row">
          <span class="history-idx">${i + 1}</span>
          <div class="history-info">
            <div class="history-title">${esc(t.title)}</div>
            <div class="history-meta">${esc(t.author)}</div>
          </div>
          <span class="queue-dur">${t.length ? fmtTime(t.length / 1000) : "—"}</span>
        </div>`
        )
        .join("");
    }

    /* heart state */
    const heart = $("btn-heart");
    const currentUrl = data.track?.uri;
    const isLiked = currentUrl && (state.favorites || []).some((s) => s.url === currentUrl);
    heart.classList.toggle("liked", Boolean(isLiked));
    heart.textContent = isLiked ? "♥" : "♡";
    heart.disabled = !currentUrl;

    const errorBox = $("player-error");
    if (data.track) {
      errorBox.classList.add("hidden");
    } else {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Nothing is playing in this server right now.";
    }

    if (!data.track) {
      /* player ended (disconnected) */
      stopPlayerPolling();
    }

    renderTicker();
  }

  function tickPlayer() {
    const p = state.player;
    const now = p.paused ? p.posBase : p.posBase + (Date.now() - p.posAt) / 1000;
    const clamped = p.length ? Math.min(now, p.length) : now;
    $("player-pos").textContent = fmtTime(clamped);
    const fill = $("player-progress-fill");
    if (fill) fill.style.width = p.length ? `${Math.min(100, (clamped / p.length) * 100)}%` : "0%";
  }

  /* ---------- developer (Lanyard presence) ---------- */

  const DEV_STATUS = {
    online: { label: "Online", cls: "badge-online" },
    idle: { label: "Idle", cls: "badge-loading" },
    dnd: { label: "Do Not Disturb", cls: "badge-offline" },
    offline: { label: "Offline", cls: "" },
  };
  const DEV_ACTIVITY_TYPES = ["Playing", "Streaming", "Listening to", "Watching", "Custom", "Competing in"];

  function stopDevPolling() {
    if (state.dev.timer) clearInterval(state.dev.timer);
    if (state.dev.tickTimer) clearInterval(state.dev.tickTimer);
    state.dev.timer = null;
    state.dev.tickTimer = null;
  }

  async function loadDev() {
    stopDevPolling();
    try {
      const data = await api("/api/dev");
      renderDev(data);
      state.dev.timer = setInterval(async () => {
        try {
          renderDev(await api("/api/dev"));
        } catch {
          /* keep last known state on transient errors */
        }
      }, 15000);
    } catch (error) {
      $("dev-activities").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  function renderDev(data) {
    const user = data.discord || {};
    const status = DEV_STATUS[data.status] || DEV_STATUS.offline;

    if (user.avatar) {
      const ext = user.avatar.startsWith("a_") ? "gif" : "png";
      $("dev-avatar").src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
    }
    $("dev-name").textContent = user.globalName || user.username || "—";
    $("dev-username").textContent = user.username ? `@${user.username}` : "—";
    const statusEl = $("dev-status");
    statusEl.textContent = status.label;
    statusEl.className = `badge ${status.cls}`;
    $("dev-id").textContent = user.id || "—";

    /* connections (from the owner's stored dashboard session) */
    const conns = data.connections || [];
    const connBox = $("dev-conn");
    const connEmpty = $("dev-conn-empty");
    $("dev-conn-stale").classList.toggle("hidden", conns.length > 0);
    if (!conns.length) {
      connBox.innerHTML = "";
      connEmpty.classList.remove("hidden");
    } else {
      connEmpty.classList.add("hidden");
      connBox.innerHTML = conns.map(connTileHtml).join("");
    }

    /* spotify now playing */
    const spot = data.spotify;
    const spotWrap = $("dev-spotify-wrap");
    if (spot) {
      spotWrap.classList.remove("hidden");
      const art = $("dev-spotify-art");
      if (spot.albumArt) {
        art.innerHTML = `<img src="${esc(spot.albumArt)}" alt="" referrerpolicy="no-referrer" />`;
      } else {
        art.innerHTML = "♪";
      }
      $("dev-spotify-title").textContent = spot.title;
      $("dev-spotify-artist").textContent = spot.artist;
      $("dev-spotify-album").textContent = spot.album;
      $("dev-spotify-source").textContent = "Realtime from Spotify";
      state.dev.spotify = { start: spot.start, end: spot.end };
      tickDevSpotify();
      if (!state.dev.tickTimer) state.dev.tickTimer = setInterval(tickDevSpotify, 1000);
    } else {
      spotWrap.classList.add("hidden");
      state.dev.spotify = null;
      if (state.dev.tickTimer) {
        clearInterval(state.dev.tickTimer);
        state.dev.tickTimer = null;
      }
    }

    /* activities (Spotify activity has its own card — skip it) */
    const activities = (data.activities || []).filter(
      (a) => !(a.type === 2 && String(a.name).toLowerCase() === "spotify")
    );
    $("dev-activity-count").textContent = `${activities.length} active`;
    const box = $("dev-activities");
    const empty = $("dev-activities-empty");
    if (!activities.length) {
      box.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    box.innerHTML = activities
      .map((a) => {
        const label = DEV_ACTIVITY_TYPES[a.type] || "Playing";
        const emoji = a.emoji
          ? a.emoji.id
            ? `<img class="act-emoji" src="https://cdn.discordapp.com/emojis/${a.emoji.id}.${a.emoji.animated ? "gif" : "png"}?size=32" alt="" referrerpolicy="no-referrer" />`
            : esc(a.emoji.name)
          : "";
        const stateLine = [a.state, a.details].filter(Boolean).map(esc).join(" · ");
        const elapsed = a.timestamps?.start
          ? ` · ${fmtUptime(Math.floor((Date.now() - a.timestamps.start) / 1000))}`
          : "";
        return `
        <div class="list-row">
          <div>
            <div class="act-name">${emoji} <strong>${esc(a.name)}</strong> <span class="act-type">${label}</span></div>
            ${stateLine ? `<div class="act-state">${stateLine}</div>` : ""}
          </div>
          <div class="muted mono">${elapsed || ""}</div>
        </div>`;
      })
      .join("");
  }

  function tickDevSpotify() {
    const spot = state.dev.spotify;
    if (!spot) return;
    const now = Date.now();
    const total = (spot.end - spot.start) / 1000;
    const pos = (now - spot.start) / 1000;
    const clamped = total > 0 ? Math.min(pos, total) : pos;
    $("dev-spotify-pos").textContent = fmtTime(clamped);
    $("dev-spotify-dur").textContent = fmtTime(total);
    const fill = $("dev-spotify-fill");
    if (fill) fill.style.width = total > 0 ? `${Math.min(100, (clamped / total) * 100)}%` : "0%";
  }

  /* ---------- login state ---------- */

  function renderLoginState() {
    const loginBtn = $("login-btn");
    const chip = $("user-chip");
    const user = state.me?.user || null;
    if (state.session) {
      loginBtn.classList.add("hidden");
      chip.classList.remove("hidden");
      $("chip-avatar").src = avatarUrl(user, 64);
      $("chip-name").textContent = user?.username || "Connected";
    } else {
      loginBtn.classList.remove("hidden");
      chip.classList.add("hidden");
      closeChipMenu();
    }
  }

  function toggleChipMenu(force) {
    const menu = $("chip-menu");
    const next = force !== undefined ? force : menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !next);
  }

  function closeChipMenu() {
    toggleChipMenu(false);
  }

  /* ---------- admin ---------- */

  function renderAdmin() {
    const loggedIn = Boolean(state.adminToken) || Boolean(state.me?.isAdmin);
    $("admin-locked").classList.toggle("hidden", loggedIn);
    $("admin-panel").classList.toggle("hidden", !loggedIn);
    if (!loggedIn) {
      stopLogs();
      return;
    }
    loadAdminPlayers();
    loadAdminAI();
    loadAdminCommandStats();
    loadAdminBlacklist();
    loadLeaveGuilds();
    startLogs();
  }

  async function loadAdminCommandStats() {
    try {
      const data = await api("/api/admin/command-stats");
      const box = $("admin-cmdstats");
      $("cmd-stats-total").textContent = `${data.total} runs since ${
        data.since ? new Date(data.since).toLocaleString() : "session start"
      }`;
      if (!data.stats.length) {
        box.innerHTML = `<div class="empty">No commands run yet this session.</div>`;
        return;
      }
      const max = data.stats[0].count;
      box.innerHTML = data.stats
        .slice(0, 25)
        .map(
          (s) => `
        <div class="list-row">
          <div><strong>${esc(s.name)}</strong></div>
          <div class="stat-bar-wrap"><div class="stat-bar" style="width: ${Math.round((s.count / max) * 100)}%"></div></div>
          <div class="muted mono">${s.count}</div>
        </div>`
        )
        .join("");
    } catch (error) {
      $("admin-cmdstats").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  async function loadAdminBlacklist() {
    try {
      const data = await api("/api/admin/blacklist");
      const box = $("admin-blacklist");
      if (!data.users.length) {
        box.innerHTML = `<div class="empty">No blacklisted users.</div>`;
        return;
      }
      box.innerHTML = data.users
        .map(
          (u) => `
        <div class="list-row">
          <div><strong>${esc(u.username)}</strong> <span class="mono">${esc(u.userId)}</span></div>
          <button class="toggle on" data-user="${esc(u.userId)}">Unblacklist</button>
        </div>`
        )
        .join("");
      box.querySelectorAll(".toggle").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await api("/api/admin/blacklist", { method: "POST", body: { userId: btn.dataset.user } });
            loadAdminBlacklist();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    } catch (error) {
      $("admin-blacklist").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  async function loadLeaveGuilds() {
    try {
      const data = await api("/api/guilds");
      const select = $("leave-guild");
      select.innerHTML = data.guilds
        .map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`)
        .join("");
    } catch { /* keep empty select */ }
  }

  async function loadAdminPlayers() {
    try {
      const data = await api("/api/admin/players");
      const box = $("admin-players");
      if (!data.players.length) {
        box.innerHTML = `<div class="empty">No active players.</div>`;
        return;
      }
      box.innerHTML = data.players
        .map(
          (p) => `
        <div class="list-row">
          <div>
            <strong>${esc(p.guildName)}</strong>
            <span class="mono"> · ${esc(p.track ? p.track.title : "no track")}</span>
          </div>
          <div class="muted">${p.paused ? "⏸ paused" : "▶ playing"} · vol ${p.volume}% · ${p.queueSize} queued</div>
        </div>`
        )
        .join("");
    } catch (error) {
      $("admin-players").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  async function loadAdminAI() {
    try {
      const data = await api("/api/admin/ai");
      const box = $("admin-ai");
      if (!data.users.length) {
        box.innerHTML = `<div class="empty">No AI mode users yet.</div>`;
        return;
      }
      box.innerHTML = data.users
        .map(
          (u) => `
        <div class="list-row">
          <div><strong>${esc(u.username)}</strong> <span class="mono">${esc(u.userId)}</span></div>
          <button class="toggle ${u.enabled ? "on" : "off"}" data-user="${esc(u.userId)}">${u.enabled ? "Enabled" : "Disabled"}</button>
        </div>`
        )
        .join("");
      box.querySelectorAll(".toggle").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const result = await api("/api/admin/ai/toggle", {
              method: "POST",
              body: { userId: btn.dataset.user },
            });
            btn.textContent = result.enabled ? "Enabled" : "Disabled";
            btn.className = `btn btn-toggle ${result.enabled ? "on" : "off"}`;
          } catch (error) {
            alert(error.message);
          }
        });
      });
    } catch (error) {
      $("admin-ai").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  function startLogs() {
    stopLogs();
    const fetchLogs = async () => {
      try {
        const data = await api("/api/admin/logs");
        const box = $("admin-logs");
        box.innerHTML = data.logs
          .map((l) => `<span class="t-${esc(l.type.toLowerCase())}">[${esc(l.time)}] [${esc(l.type)}] ${esc(l.message)}</span>`)
          .join("\n");
        box.scrollTop = box.scrollHeight;
      } catch {
        /* keep previous logs on transient errors */
      }
    };
    fetchLogs();
    state.logsTimer = setInterval(fetchLogs, 4000);
  }

  function stopLogs() {
    if (state.logsTimer) {
      clearInterval(state.logsTimer);
      state.logsTimer = null;
    }
  }

  /* ---------- events ---------- */

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  /* player controls */
  $("player-back").addEventListener("click", () => switchView("servers"));

  /* heart / favorites */
  $("btn-heart").addEventListener("click", async () => {
    const track = state.playerTrack;
    if (!track) return;
    const isLiked = (state.favorites || []).some((s) => s.url === track.uri);
    try {
      const data = isLiked
        ? await api("/api/me/favorites", { method: "DELETE", body: { url: track.uri } })
        : await api("/api/me/favorites", {
            method: "POST",
            body: {
              title: track.title,
              url: track.uri,
              duration: track.length ? fmtTime(track.length / 1000) : undefined,
              thumbnail: track.thumbnail || undefined,
              author: track.author,
            },
          });
      state.favorites = data.songs;
      const heart = $("btn-heart");
      heart.classList.toggle("liked", !isLiked);
      heart.textContent = !isLiked ? "♥" : "♡";
      toast(isLiked ? "Removed from favorites" : "Saved to favorites ❤️");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /* lyrics */
  $("btn-lyrics").addEventListener("click", async () => {
    const wrap = $("lyrics-wrap");
    if (!wrap.classList.contains("hidden")) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    $("lyrics-panel").textContent = "Loading…";
    try {
      const data = await api(`/api/player/${state.player.guildId}/lyrics`);
      $("lyrics-panel").innerHTML =
        `<div class="lyrics-title">${esc(data.title)}</div>` +
        `<div class="lyrics-author">${esc(data.author)}</div>` +
        esc(data.lyrics);
    } catch (error) {
      $("lyrics-panel").textContent = error.message;
    }
  });

  $("btn-lyrics-close").addEventListener("click", () => {
    $("lyrics-wrap").classList.add("hidden");
  });

  /* AI chat */
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage($("chat-input").value);
  });

  document.querySelectorAll(".chat-quick button").forEach((btn) => {
    btn.addEventListener("click", () => sendChatMessage(btn.dataset.q));
  });

  $("login-btn").addEventListener("click", () => {
    window.location.href = "/auth/login";
  });

  $("user-chip").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleChipMenu();
  });

  document.addEventListener("click", (event) => {
    if (!$("chip-menu").classList.contains("hidden") && !$("user-chip").contains(event.target)) {
      closeChipMenu();
    }
  });

  $("chip-profile").addEventListener("click", (event) => {
    event.stopPropagation();
    closeChipMenu();
    switchView("profile");
  });

  $("chip-logout").addEventListener("click", (event) => {
    event.stopPropagation();
    api("/api/me/logout", { method: "POST" }).catch(() => {});
    state.session = null;
    state.me = null;
    localStorage.removeItem("ozone_session");
    stopPlayerPolling();
    renderLoginState();
    updateNavVisibility();
    switchView("overview");
  });

  $("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = $("profile-display-input").value.trim();
    const bio = $("profile-bio-input").value.trim();
    const msg = $("profile-save-msg");
    msg.textContent = "Saving…";
    try {
      const data = await api("/api/me/profile", { method: "PUT", body: { displayName, bio } });
      $("profile-display").textContent = data.profile.displayName || (state.me?.user?.username || "—");
      $("profile-bio").textContent = data.profile.bio || "No bio yet — write something about yourself.";
      msg.textContent = "Saved ✓";
      toast("Profile saved");
    } catch (error) {
      msg.textContent = error.message;
      toast(error.message, "error");
    }
  });

  $("profile-copy-id").addEventListener("click", async () => {
    const id = $("profile-id").textContent;
    try {
      await navigator.clipboard.writeText(id);
      toast("User ID copied");
    } catch {
      toast("Could not copy — select the ID manually", "warn");
    }
  });

  $("detail-back").addEventListener("click", () => {
    $("guild-detail").classList.add("hidden");
  });

  $("admin-refresh").addEventListener("click", loadAdminPlayers);

  $("admin-stop-all").addEventListener("click", async () => {
    if (!confirm("Stop ALL players across every server?")) return;
    try {
      const data = await api("/api/admin/players/stop", { method: "POST" });
      $("admin-action-msg").textContent = `Stopped ${data.stopped} players`;
      loadAdminPlayers();
    } catch (error) {
      $("admin-action-msg").textContent = error.message;
    }
  });

  $("blacklist-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = $("blacklist-user").value.trim();
    if (!/^\d+$/.test(userId)) return alert("Enter a valid Discord user ID");
    try {
      const data = await api("/api/admin/blacklist", { method: "POST", body: { userId } });
      $("blacklist-user").value = "";
      $("admin-action-msg").textContent = `${userId} ${data.blacklisted ? "blacklisted" : "unblacklisted"}`;
      loadAdminBlacklist();
    } catch (error) {
      alert(error.message);
    }
  });

  $("broadcast-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("broadcast-msg").value.trim();
    if (!message) return;
    if (!confirm(`Send this message to ALL ${state.guilds.length || ""} servers?`)) return;
    try {
      const data = await api("/api/admin/broadcast", { method: "POST", body: { message } });
      $("broadcast-result").textContent = `Sent to ${data.sent} servers${data.failed.length ? `, failed in ${data.failed.length} (${data.failed.join(", ")})` : ""}`;
      $("broadcast-msg").value = "";
    } catch (error) {
      $("broadcast-result").textContent = error.message;
    }
  });

  $("presence-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/presence", {
        method: "POST",
        body: { text: $("presence-text").value, type: $("presence-type").value },
      });
      $("presence-text").value = "";
    } catch (error) {
      alert(error.message);
    }
  });

  $("dm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/admin/dm", {
        method: "POST",
        body: { userId: $("dm-user").value.trim(), message: $("dm-msg").value },
      });
      $("dm-result").textContent = `Sent to ${data.username}`;
      $("dm-user").value = "";
      $("dm-msg").value = "";
    } catch (error) {
      $("dm-result").textContent = error.message;
    }
  });

  $("leave-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const guildId = $("leave-guild").value;
    if (!guildId) return;
    if (!confirm("Make OZONE leave this server?")) return;
    try {
      await api("/api/admin/leave-guild", { method: "POST", body: { guildId } });
      $("admin-action-msg").textContent = "Left guild";
      loadLeaveGuilds();
    } catch (error) {
      $("admin-action-msg").textContent = error.message;
    }
  });

  $("admin-restart").addEventListener("click", async () => {
    if (!confirm("Restart the bot? This will disconnect all players briefly.")) return;
    try {
      await api("/api/admin/restart", { method: "POST" });
      $("admin-action-msg").textContent = "Restarting…";
    } catch (error) {
      $("admin-action-msg").textContent = error.message;
    }
  });

  $("admin-reload").addEventListener("click", async () => {
    try {
      const data = await api("/api/admin/reload", { method: "POST" });
      $("admin-action-msg").textContent = `Reloaded ${data.commands} commands`;
    } catch (error) {
      $("admin-action-msg").textContent = error.message;
    }
  });

  /* ---------- theme (dark / light) ---------- */

  const THEME_KEY = "ozone_theme";

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
    const btn = $("theme-toggle");
    if (btn) {
      btn.textContent = theme === "light" ? "☀" : "☾";
      btn.title = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
      btn.setAttribute("aria-label", btn.title);
    }
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  /* ---------- server list search ---------- */

  function bindGuildSearch() {
    const input = $("guild-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const list = $("guild-list");
      list.querySelectorAll(".guild-row").forEach((row) => {
        const name = row.querySelector(".guild-name")?.textContent?.toLowerCase() || "";
        row.style.display = !q || name.includes(q) ? "" : "none";
      });
    });
  }

  /* ---------- keyboard shortcuts (player view) ---------- */

  function bindPlayerShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (state.view !== "player") return;
      if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      const guildId = state.player.guildId;
      if (!guildId) return;
      const control = (action, value) =>
        api(`/api/player/${guildId}/control`, { method: "POST", body: { action, value } })
          .then(() => { pollPlayer(); toast(`⌨ ${action}`); })
          .catch((error) => toast(error.message, "error"));

      switch (event.key) {
        case " ":
          event.preventDefault();
          control(state.player.paused ? "resume" : "pause");
          break;
        case "ArrowRight":
          if (!event.shiftKey) { event.preventDefault(); control("seek", Math.min((state.player.posBase + (Date.now() - state.player.posAt) / 1000 + 10) * 1000, state.player.length * 1000)); }
          break;
        case "ArrowLeft":
          if (!event.shiftKey) { event.preventDefault(); control("seek", Math.max(0, (state.player.posBase + (Date.now() - state.player.posAt) / 1000 - 10) * 1000)); }
          break;
        case "n":
          control("skip");
          break;
        case "s":
          control("shuffle");
          break;
        default:
          break;
      }
    });
  }

  /* ---------- top listeners (player view card) ---------- */

  async function loadTopListeners(guildId) {
    const box = $("top-listeners");
    if (!box) return;
    box.innerHTML = `<div class="skeleton"></div>`;
    try {
      const data = await api(`/api/leaderboard/${guildId}`);
      if (!data.listeners || !data.listeners.length) {
        box.innerHTML = `<div class="empty"><span class="empty-icon">📡</span>No listening stats yet — play something and this chart builds itself.</div>`;
        return;
      }
      const medals = ["🥇", "🥈", "🥉"];
      box.innerHTML = data.listeners
        .map((row, i) => {
          const h = Math.floor((row.seconds || 0) / 3600);
          const m = Math.floor(((row.seconds || 0) % 3600) / 60);
          const dur = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${Math.max(1, Math.round((row.seconds || 0) / 60))}m`;
          return `<div class="queue-row">
            <span class="queue-idx">${medals[i] || i + 1}</span>
            <div class="queue-info">
              <div class="queue-title">${esc(row.username || row.userId)}</div>
              <div class="queue-meta">${row.plays || 0} tracks played</div>
            </div>
            <span class="queue-dur">${dur}</span>
          </div>`;
        })
        .join("");
    } catch {
      box.innerHTML = `<div class="empty"><span class="empty-icon">📡</span>Listening chart unavailable.</div>`;
    }
  }

  /* ---------- init ---------- */

  const params = new URLSearchParams(window.location.search);
  const sessionParam = params.get("session");
  if (sessionParam) {
    state.session = sessionParam;
    localStorage.setItem("ozone_session", sessionParam);
  }
  const adminParam = params.get("admin");
  if (adminParam) {
    state.adminToken = adminParam;
    sessionStorage.setItem("ozone_admin", adminParam);
  }
  const guildParam = params.get("guild");
  if (sessionParam || adminParam || guildParam) {
    history.replaceState(null, "", window.location.pathname);
  }

  renderLoginState();
  updateNavVisibility();
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  const themeBtn = $("theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  bindGuildSearch();
  bindPlayerShortcuts();
  switchView("overview");
  if (state.session) fetchMe();
  if (guildParam) {
    switchView("servers");
    loadMyServers().then(() => openPlayer(guildParam));
  }
})();