import React, { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";

// --- M3U PARSER ---
function parseM3U(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const channels = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXTINF")) {
      const info = {};
      const tvgName = line.match(/tvg-name="([^"]*)"/);
      const tvgLogo = line.match(/tvg-logo="([^"]*)"/);
      const groupTitle = line.match(/group-title="([^"]*)"/);
      const titleMatch = line.match(/,(.+)$/);

      info.name = (tvgName ? tvgName[1] : titleMatch ? titleMatch[1] : "Канал").trim();
      info.logo = tvgLogo ? tvgLogo[1] : "";
      info.group = groupTitle ? groupTitle[1] : "Інше";
      current = info;
    } else if (line.startsWith("#")) {
      continue;
    } else if (current) {
      channels.push({
        id: `ch_${channels.length}_${Date.now()}`,
        name: current.name,
        logo: current.logo,
        group: current.group,
        url: line,
        favorite: false,
      });
      current = null;
    }
  }
  return channels;
}

// --- STORAGE ---
function loadData() {
  try {
    const s = localStorage.getItem("iptv-data");
    if (s) return JSON.parse(s);
  } catch {}
  return { channels: [], playlists: [] };
}

function saveData(channels, playlists) {
  try {
    localStorage.setItem("iptv-data", JSON.stringify({ channels, playlists }));
  } catch {}
}

// --- ICONS ---
const Icon = {
  Play: ({ s = 22, c = "#fff" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M8 5v14l11-7z" /></svg>,
  Star: ({ s = 20, c = "#fff", filled }) => filled
    ? <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
    : <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  Search: ({ s = 20, c = "#888" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Back: ({ s = 22, c = "#fff" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  X: ({ s = 20, c = "#888" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Link: ({ s = 22, c = "#aaa" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>,
  TV: ({ s = 24, c = "#fff" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>,
  List: ({ s = 20, c = "#fff" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  Grid: ({ s = 20, c = "#fff" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  Trash: ({ s = 18, c = "#ff4757" }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
};

// --- CHANNEL LOGO ---
function ChannelThumb({ logo, name, size = 48 }) {
  const [err, setErr] = useState(false);
  const initials = name.substring(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  if (logo && !err) {
    return <img src={logo} alt="" onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: 12, objectFit: "cover", background: "#1a1a2e", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue},60%,35%), hsl(${hue + 40},50%,25%))`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 800, color: "rgba(255,255,255,0.85)",
    }}>{initials}</div>
  );
}

// --- MAIN APP ---
function App() {
  const initial = loadData();
  const [channels, setChannels] = useState(initial.channels);
  const [playlists, setPlaylists] = useState(initial.playlists);
  const [view, setView] = useState("home");
  const [activeChannel, setActiveChannel] = useState(null);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Усі");
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [importMode, setImportMode] = useState("url");
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [playerError, setPlayerError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => { saveData(channels, playlists); }, [channels, playlists]);

  // Play channel with HLS
  useEffect(() => {
    if (view !== "player" || !activeChannel || !videoRef.current) return;
    const video = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const url = activeChannel.url;
    const isHLS = url.includes(".m3u8");

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setPlayerError(true); });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      video.src = url;
      video.play().catch(() => { setPlayerError(true); });
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [view, activeChannel]);

  const handleImport = async () => {
    setIsLoading(true);
    let text = "";
    if (importMode === "text") {
      text = importText;
    } else if (importMode === "url" && importUrl.trim()) {
      try {
        const res = await fetch(importUrl.trim());
        text = await res.text();
      } catch {
        setIsLoading(false);
        alert("Не вдалося завантажити плейліст. Перевірте URL.");
        return;
      }
    }
    const parsed = parseM3U(text);
    if (parsed.length === 0) {
      setIsLoading(false);
      alert("Каналів не знайдено. Перевірте формат M3U.");
      return;
    }
    setChannels(parsed);
    setPlaylists((p) => [...p, {
      name: importName || `Плейліст ${p.length + 1}`,
      url: importUrl || "",
      count: parsed.length,
      date: new Date().toLocaleDateString("uk-UA"),
    }]);
    setImportText(""); setImportUrl(""); setImportName("");
    setIsLoading(false);
    setView("channels");
  };

  const playChannel = (ch) => { setActiveChannel(ch); setPlayerError(false); setView("player"); };
  const toggleFav = (id) => { setChannels((p) => p.map((c) => c.id === id ? { ...c, favorite: !c.favorite } : c)); };
  const deletePlaylist = () => { setChannels([]); setPlaylists([]); setView("home"); };

  const groups = ["Усі", ...new Set(channels.map((c) => c.group).filter(Boolean))];
  if (channels.some((c) => c.favorite)) groups.splice(1, 0, "⭐ Обране");

  const filtered = channels.filter((c) => {
    if (showFavOnly || activeGroup === "⭐ Обране") return c.favorite;
    if (activeGroup !== "Усі" && c.group !== activeGroup) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  const neighbors = activeChannel
    ? channels.filter((c) => c.group === activeChannel.group && c.id !== activeChannel.id).slice(0, 10)
    : [];

  // --- STYLES ---
  const S = {
    app: { fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#08080f", color: "#e8e8f0", minHeight: "100vh", maxWidth: 520, margin: "0 auto" },
    homeHeader: { padding: "40px 24px 20px", textAlign: "center" },
    appTitle: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", background: "linear-gradient(135deg, #00d2ff, #7b2ff7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
    appSub: { fontSize: 13, color: "#555", marginTop: 6, fontWeight: 500 },
    homeActions: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 },
    actionCard: (g) => ({ borderRadius: 18, padding: "22px 20px", background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, border: "none", width: "100%", fontFamily: "inherit", textAlign: "left", boxShadow: `0 6px 25px ${g[0]}33` }),
    actionIcon: { width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    actionTitle: { fontSize: 16, fontWeight: 700, color: "#fff" },
    actionDesc: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 3 },
    savedSection: { padding: "8px 24px 24px" },
    savedTitle: { fontSize: 14, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 },
    savedCard: { padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" },
    topBar: { padding: "16px 20px 8px", display: "flex", alignItems: "center", gap: 12 },
    searchBox: { flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" },
    searchInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit" },
    groupBar: { display: "flex", gap: 8, padding: "12px 20px", overflowX: "auto", scrollbarWidth: "none" },
    groupChip: (a) => ({ padding: "8px 16px", borderRadius: 20, background: a ? "linear-gradient(135deg, #00d2ff, #7b2ff7)" : "rgba(255,255,255,0.06)", color: a ? "#fff" : "#888", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", border: "none", fontFamily: "inherit", flexShrink: 0 }),
    channelGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "8px 20px 100px" },
    channelCard: { borderRadius: 16, padding: "16px 10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" },
    channelListItem: { display: "flex", alignItems: "center", padding: "12px 20px", gap: 14, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" },
    channelName: { fontSize: 11, fontWeight: 600, textAlign: "center", color: "#ccc", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" },
    playerWrap: { background: "#000", position: "relative", width: "100%", aspectRatio: "16/9" },
    video: { width: "100%", height: "100%", objectFit: "contain", background: "#000" },
    playerBar: { padding: 20 },
    playerTitle: { fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" },
    playerGroup: { fontSize: 13, color: "#666", marginTop: 4, fontWeight: 500 },
    neighborTitle: { fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "1px", padding: "0 20px 12px" },
    importWrap: { padding: "0 24px 40px" },
    tabRow: { display: "flex", gap: 0, marginBottom: 20, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" },
    tab: (a) => ({ flex: 1, padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700, cursor: "pointer", background: a ? "rgba(123,47,247,0.2)" : "rgba(255,255,255,0.03)", color: a ? "#a78bfa" : "#666", border: "none", fontFamily: "inherit" }),
    input: { width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 },
    textarea: { width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e8e8f0", fontSize: 13, fontFamily: "'DM Mono', monospace", outline: "none", boxSizing: "border-box", marginBottom: 12, minHeight: 180, resize: "vertical" },
    submitBtn: { width: "100%", padding: 15, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #00d2ff, #7b2ff7)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    backBtn: { background: "none", border: "none", cursor: "pointer", padding: 6, color: "#e8e8f0" },
    emptyState: { padding: "60px 24px", textAlign: "center" },
    favBtn: { position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", padding: 4, zIndex: 2 },
    viewToggle: { background: "none", border: "none", cursor: "pointer", padding: 6, opacity: 0.6 },
  };

  // --- RENDER HOME ---
  const renderHome = () => (
    <>
      <div style={S.homeHeader}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>📡</div>
        <div style={S.appTitle}>IPTV Player</div>
        <div style={S.appSub}>Завантаж M3U плейліст і дивись ТВ</div>
      </div>
      <div style={S.homeActions}>
        <button style={S.actionCard(["#7b2ff7", "#4a00b0"])} onClick={() => setView("import")}>
          <div style={S.actionIcon}><Icon.Link s={24} c="#fff" /></div>
          <div><div style={S.actionTitle}>Завантажити плейліст</div><div style={S.actionDesc}>Вставте URL або M3U текст</div></div>
        </button>
        {channels.length > 0 && (
          <button style={S.actionCard(["#00b4d8", "#0077b6"])} onClick={() => { setActiveGroup("Усі"); setView("channels"); }}>
            <div style={S.actionIcon}><Icon.TV s={24} c="#fff" /></div>
            <div><div style={S.actionTitle}>Мої канали ({channels.length})</div><div style={S.actionDesc}>Відкрити список каналів</div></div>
          </button>
        )}
      </div>
      {playlists.length > 0 && (
        <div style={S.savedSection}>
          <div style={S.savedTitle}>Збережені плейлісти</div>
          {playlists.map((pl, i) => (
            <div key={i} style={S.savedCard} onClick={() => { setActiveGroup("Усі"); setView("channels"); }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{pl.name}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{pl.count} каналів • {pl.date}</div>
              </div>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
                onClick={(e) => { e.stopPropagation(); deletePlaylist(); }}><Icon.Trash /></button>
            </div>
          ))}
        </div>
      )}
      {channels.length === 0 && playlists.length === 0 && (
        <div style={S.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📺</div>
          <div style={{ fontSize: 14, color: "#444", fontWeight: 600, lineHeight: 1.6 }}>
            Поки що порожньо.<br />Завантажте M3U плейліст<br />щоб почати дивитись.
          </div>
        </div>
      )}
    </>
  );

  // --- RENDER IMPORT ---
  const renderImport = () => (
    <>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={() => setView("home")}><Icon.Back /></button>
        <span style={{ fontSize: 18, fontWeight: 800 }}>Імпорт плейліста</span>
      </div>
      <div style={S.importWrap}>
        <div style={S.tabRow}>
          <button style={S.tab(importMode === "url")} onClick={() => setImportMode("url")}>🔗 За посиланням</button>
          <button style={S.tab(importMode === "text")} onClick={() => setImportMode("text")}>📋 Вставити текст</button>
        </div>
        <input style={S.input} placeholder="Назва плейліста (необов'язково)" value={importName} onChange={(e) => setImportName(e.target.value)} />
        {importMode === "url" ? (
          <input style={S.input} placeholder="https://example.com/playlist.m3u" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} autoFocus />
        ) : (
          <textarea style={S.textarea} placeholder={"#EXTM3U\n#EXTINF:-1 group-title=\"Новини\",Канал 1\nhttps://stream.example.com/live.m3u8"}
            value={importText} onChange={(e) => setImportText(e.target.value)} autoFocus />
        )}
        <button style={{ ...S.submitBtn, opacity: isLoading ? 0.6 : 1 }} onClick={handleImport} disabled={isLoading}>
          {isLoading ? "Завантаження..." : "Завантажити плейліст"}
        </button>
        <div style={{ fontSize: 12, color: "#444", marginTop: 16, lineHeight: 1.7, textAlign: "center" }}>
          Підтримуються формати M3U та M3U8.<br />Канали автоматично групуються по категоріях.
        </div>
      </div>
    </>
  );

  // --- RENDER CHANNELS ---
  const renderChannels = () => (
    <>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={() => setView("home")}><Icon.Back /></button>
        <div style={S.searchBox}>
          <Icon.Search />
          <input style={S.searchInput} placeholder="Пошук каналів..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }} onClick={() => setSearch("")}><Icon.X s={16} /></button>}
        </div>
        <button style={S.viewToggle} onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
          {viewMode === "grid" ? <Icon.List s={20} c="#888" /> : <Icon.Grid s={20} c="#888" />}
        </button>
      </div>
      <div style={S.groupBar}>
        {groups.map((g) => (
          <button key={g} style={S.groupChip(activeGroup === g)} onClick={() => { setActiveGroup(g); setShowFavOnly(g === "⭐ Обране"); }}>{g}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14, color: "#444", fontWeight: 600 }}>Каналів не знайдено</div>
        </div>
      ) : viewMode === "grid" ? (
        <div style={S.channelGrid}>
          {filtered.map((ch) => (
            <div key={ch.id} style={S.channelCard} onClick={() => playChannel(ch)}>
              <button style={S.favBtn} onClick={(e) => { e.stopPropagation(); toggleFav(ch.id); }}>
                <Icon.Star s={14} c={ch.favorite ? "#ffd32a" : "#333"} filled={ch.favorite} />
              </button>
              <ChannelThumb logo={ch.logo} name={ch.name} size={44} />
              <div style={S.channelName}>{ch.name}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ paddingBottom: 80 }}>
          {filtered.map((ch) => (
            <div key={ch.id} style={S.channelListItem} onClick={() => playChannel(ch)}>
              <ChannelThumb logo={ch.logo} name={ch.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{ch.group}</div>
              </div>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} onClick={(e) => { e.stopPropagation(); toggleFav(ch.id); }}>
                <Icon.Star s={18} c={ch.favorite ? "#ffd32a" : "#333"} filled={ch.favorite} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // --- RENDER PLAYER ---
  const renderPlayer = () => (
    <>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
          <button style={{ ...S.backBtn, background: "rgba(0,0,0,0.5)", borderRadius: 12, padding: "8px 10px" }}
            onClick={() => { setView("channels"); if (hlsRef.current) hlsRef.current.destroy(); }}>
            <Icon.Back s={20} />
          </button>
        </div>
        <div style={S.playerWrap}>
          {playerError ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#888" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>😕</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Не вдалося відтворити потік</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>Канал може бути недоступний</div>
            </div>
          ) : (
            <video ref={videoRef} style={S.video} controls playsInline autoPlay onError={() => setPlayerError(true)} />
          )}
        </div>
      </div>
      <div style={S.playerBar}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={S.playerTitle}>{activeChannel?.name}</div>
            <div style={S.playerGroup}>{activeChannel?.group}</div>
          </div>
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
            onClick={() => toggleFav(activeChannel.id)}>
            <Icon.Star s={24} c={activeChannel?.favorite ? "#ffd32a" : "#444"} filled={activeChannel?.favorite} />
          </button>
        </div>
      </div>
      {neighbors.length > 0 && (
        <div style={{ paddingBottom: 80 }}>
          <div style={S.neighborTitle}>Інші канали • {activeChannel?.group}</div>
          {neighbors.map((ch) => (
            <div key={ch.id} style={S.channelListItem} onClick={() => playChannel(ch)}>
              <ChannelThumb logo={ch.logo} name={ch.name} size={38} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</div>
              <Icon.Play s={18} c="#555" />
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono&display=swap" rel="stylesheet" />
      <style>{`
        * { -webkit-tap-highlight-color: transparent; user-select: none; margin: 0; padding: 0; box-sizing: border-box; }
        input, textarea { user-select: text; }
        input::placeholder, textarea::placeholder { color: #444; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
      {view === "home" && renderHome()}
      {view === "import" && renderImport()}
      {view === "channels" && renderChannels()}
      {view === "player" && renderPlayer()}
    </div>
  );
}

export default App;
