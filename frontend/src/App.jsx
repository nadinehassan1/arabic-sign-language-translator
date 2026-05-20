import "./App.css";
import { useState, useEffect, useRef, useCallback } from "react";
import GuidedPractice    from "./components/GuidedPractice";
import AccuracyDashboard from "./components/AccuracyDashboard";
import AlphabetTrainer   from "./components/AlphabetTrainer";
import SpeechToText      from "./components/SpeechToText";
import SignDisplay       from "./components/SignDisplay";

// ── Auto-detect URLs (works on localhost, IP, and ngrok HTTPS) ────
const IS_HTTPS   = window.location.protocol === "https:";
const HOST       = window.location.hostname;
const PORT       = window.location.port;
const NEEDS_PORT = PORT && PORT !== "80" && PORT !== "443";
const BASE_HTTP  = `${IS_HTTPS ? "https" : "http"}://${HOST}${NEEDS_PORT ? `:${PORT}` : ""}`;
const BASE_WS    = `${IS_HTTPS ? "wss" : "ws"}://${HOST}${NEEDS_PORT ? `:${PORT}` : ""}`;
const WS_URL     = `${BASE_WS}/ws`;
const API        = `${BASE_HTTP}/api`;

// ── Is this a mobile/touch device? ───────────────────────────────
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
               || ('ontouchstart' in window);

// ── Unified Chat Log ─────────────────────────────────────────────
function ChatLog({ messages, onSpeak, onClear }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  if (messages.length === 0) return null;
  return (
    <div className="chat-log-wrap">
      <div className="chat-log-header">
        <span className="chat-log-title">💬 محادثة / Conversation</span>
        <button className="clear-btn" onClick={onClear}>مسح</button>
      </div>
      <div className="chat-log-body">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.source}`}>
            <div className="chat-msg-meta">
              <span className="chat-msg-source">{msg.source === "camera" ? "👋 إشارة" : "🎤 صوت"}</span>
              <span className="chat-msg-time">{new Date(msg.t).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="chat-msg-text" dir={/[\u0600-\u06FF]/.test(msg.text) ? "rtl" : "ltr"}>{msg.text}</div>
            <button className="chat-msg-speak" onClick={() => onSpeak(msg.text)}>🔊</button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function App() {
  const [connected,    setConnected]    = useState(false);
  const [camRunning,   setCamRunning]   = useState(false);
  const [facingMode,   setFacingMode]   = useState("environment");
  const [appState,     setAppState]     = useState({
    current_letter: "", current_letter_arabic: "",
    word_buffer: "", words: [], sentence: "",
    confidence: 0, model: "rf", nlp_enabled: true,
  });
  const [frame,        setFrame]        = useState(null);
  const [speaking,     setSpeaking]     = useState(false);
  const [log,          setLog]          = useState([]);
  const [activeTab,    setActiveTab]    = useState("camera");
  const [threshold,    setThreshold]    = useState(30);
  const [chatMessages, setChatMessages] = useState([]);

  // ── which chat message is expanded (showing signs) ───────────────
  const [expandedSign, setExpandedSign] = useState(null);

  const addChatMessage = useCallback((text, source) => {
    if (!text?.trim()) return;
    setChatMessages(prev => [...prev, { text: text.trim(), source, t: Date.now() }].slice(-60));
  }, []);

  const wsRef         = useRef(null);
  const audioRef      = useRef(null);
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const mobileStream  = useRef(null);
  const frameTimer    = useRef(null);
  const facingModeRef = useRef("environment");

  const addLog = useCallback((msg) => {
    setLog(prev => [{ msg, t: Date.now() }, ...prev].slice(0, 30));
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const sock = new WebSocket(WS_URL);
      wsRef.current = sock;
      sock.onopen    = () => { setConnected(true);  addLog("Connected to backend"); };
      sock.onclose   = () => { setConnected(false); addLog("Disconnected — retrying…"); setTimeout(connect, 2000); };
      sock.onerror   = () => sock.close();
      sock.onmessage = ({ data }) => {
        try {
          const d = JSON.parse(data);
          setAppState({
            current_letter:        d.current_letter        || "",
            current_letter_arabic: d.current_letter_arabic || "",
            word_buffer:           d.word_buffer           || "",
            words:                 d.words                 || [],
            sentence:              d.sentence              || "",
            confidence:            d.confidence            || 0,
            model:                 d.model                 || "rf",
            nlp_enabled:           d.nlp_enabled           ?? true,
          });
          if (d.frame) setFrame("data:image/jpeg;base64," + d.frame);
        } catch (_) {}
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, [addLog]);

  const send = useCallback((cmd, extra = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ cmd, ...extra }));
  }, []);

  useEffect(() => {
    if (!connected) return;
    send("set_threshold", { value: threshold / 100 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // ── MOBILE camera ─────────────────────────────────────────────────
  const startMobileCamera = useCallback(async (facing) => {
    const mode = facing || facingModeRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      addLog("Camera API not available");
      return;
    }
    clearInterval(frameTimer.current);
    frameTimer.current = null;
    mobileStream.current?.getTracks().forEach(t => t.stop());
    mobileStream.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: 320, height: 240 },
        audio: false,
      });
      mobileStream.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      frameTimer.current = setInterval(() => {
        if (!canvasRef.current || !videoRef.current) return;
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width  = video.videoWidth  || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext("2d");
        if (facingModeRef.current === "user") {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        wsRef.current.send(JSON.stringify({ type: "frame", image: dataUrl }));
      }, 100);

      setCamRunning(true);
      addLog(`Mobile camera started (${mode === "user" ? "front" : "back"})`);
    } catch (e) {
      addLog("Camera error: " + e.message);
    }
  }, [addLog]);

  const stopMobileCamera = useCallback(() => {
    clearInterval(frameTimer.current);
    frameTimer.current = null;
    mobileStream.current?.getTracks().forEach(t => t.stop());
    mobileStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamRunning(false);
    setFrame(null);
    addLog("Mobile camera stopped");
  }, [addLog]);

  const flipCamera = useCallback(() => {
    const next = facingModeRef.current === "environment" ? "user" : "environment";
    facingModeRef.current = next;
    setFacingMode(next);
    startMobileCamera(next);
  }, [startMobileCamera]);

  // ── PC camera ────────────────────────────────────────────────────
  const startPCCamera = useCallback(async () => {
    await fetch(`${API}/camera/start`, { method: "POST" });
    setCamRunning(true);
    addLog("PC camera started");
  }, [addLog]);

  const stopPCCamera = useCallback(async () => {
    await fetch(`${API}/camera/stop`, { method: "POST" });
    setCamRunning(false);
    setFrame(null);
    addLog("PC camera stopped");
  }, [addLog]);

  const startCamera = () => IS_MOBILE ? startMobileCamera() : startPCCamera();
  const stopCamera  = () => IS_MOBILE ? stopMobileCamera()  : stopPCCamera();

  useEffect(() => () => {
    clearInterval(frameTimer.current);
    mobileStream.current?.getTracks().forEach(t => t.stop());
  }, []);

  const updateThreshold = (val) => {
    setThreshold(val);
    send("set_threshold", { value: val / 100 });
  };

  const speak = useCallback(async (text) => {
    if (!text || speaking) return;
    setSpeaking(true);
    addLog("Speaking: " + text);
    try {
      const r = await fetch(`${API}/tts?text=${encodeURIComponent(text)}`);
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        audioRef.current.src     = url;
        audioRef.current.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
        audioRef.current.onerror = () => setSpeaking(false);
        await audioRef.current.play().catch(() => setSpeaking(false));
      } else { setSpeaking(false); }
    } catch (e) { addLog("TTS error: " + e.message); setSpeaking(false); }
  }, [speaking, addLog]);

  const commitWord = useCallback(() => {
    send("commit_word");
    addLog("Word confirmed");
    if (appState.word_buffer) addChatMessage(appState.word_buffer, "camera");
  }, [send, addLog, appState.word_buffer, addChatMessage]);

  const handleSpeechSave = useCallback((text) => {
    addChatMessage(text, "speech");
  }, [addChatMessage]);

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " ")         { e.preventDefault(); send("commit_letter"); addLog("Letter added"); }
      if (e.key === "Enter")     { commitWord(); }
      if (e.key === "Backspace") { send("delete_letter"); }
      if (e.key === "Escape")    { send("clear_sentence"); addLog("Cleared"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [send, addLog, commitWord]);

  const conf      = appState.confidence;
  const handOn    = !!(appState.current_letter && conf > 0);
  const confColor = conf >= 55 ? "#00e5a0" : conf >= 30 ? "#ffb547" : conf > 0 ? "#ff8c42" : "#4a5278";
  const confLabel = conf >= 55 ? "High" : conf >= 30 ? "Med" : conf > 0 ? "Low" : "—";
  const wordArr   = appState.word_buffer ? Array.from(appState.word_buffer) : [];

  const TABS = [
    { id: "camera",   icon: "📷", label: "Camera"   },
    { id: "speech",   icon: "🎙️", label: "Speech"   },
    { id: "chat",     icon: "💬", label: "Chat"     },
    { id: "practice", icon: "🎯", label: "Practice" },
    { id: "trainer",  icon: "🏆", label: "Trainer"  },
    { id: "accuracy", icon: "📊", label: "Accuracy" },
  ];

  return (
    <div className="app">
      <audio ref={audioRef} />
      <video  ref={videoRef}  style={{ display: "none" }} playsInline muted />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-brand">
          <span className="hlogo">🤟</span>
          <div>
            <div className="hname">Sign Translator</div>
            <div className="hsub">مترجم لغة الإشارة العربية</div>
          </div>
        </div>
        <div className="header-right">
          {chatMessages.length > 0 && (
            <div className="chat-count-badge" onClick={() => setActiveTab("chat")}>
              💬 {chatMessages.length}
            </div>
          )}
          <div className={"conn-badge " + (connected ? "ok" : "err")}>
            <span className="conn-dot" />
            {connected ? "Live" : "Offline"}
          </div>
        </div>
      </header>

      {/* ── TAB BAR ── */}
      <nav className="tab-bar">
        {TABS.map(t => (
          <button key={t.id}
            className={"tab-btn" + (activeTab === t.id ? " active" : "")}
            onClick={() => setActiveTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
            {t.id === "chat" && chatMessages.length > 0 && (
              <span className="tab-badge">{chatMessages.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="content">

        {/* ══ CAMERA TAB ══ */}
        <div id="camera-tab" className="tab-content" style={{ display: activeTab === "camera" ? "flex" : "none" }}>

          {chatMessages.filter(m => m.source === "camera").length > 0 && (
            <div className="mini-chat-preview" onClick={() => setActiveTab("chat")}>
              <span className="mini-chat-label">آخر إشارة ←</span>
              <span className="mini-chat-text">{chatMessages.filter(m => m.source === "camera").at(-1).text}</span>
            </div>
          )}

          <div style={{
            fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--text3)",
            textAlign: "center", marginBottom: 4,
          }}>
            {IS_MOBILE
              ? `📱 Mobile · ${facingMode === "user" ? "🤳 Front" : "📷 Back"} camera`
              : "🖥️ PC Webcam Mode"}
          </div>

          <div className={"cam-frame" + (camRunning ? " active" : "") + (handOn ? " hand-on" : "")}>
            {frame ? (
              <img src={frame} alt="Live feed" className="cam-video" />
            ) : (
              <div className="cam-empty">
                <div className="cam-empty-icon">{camRunning ? "⏳" : "📷"}</div>
                <p>{camRunning ? "Starting camera…" : "Tap Start Camera below"}</p>
              </div>
            )}
            {camRunning && frame && (
              <div className="cam-overlay">
                <div className={"overlay-letter" + (handOn ? " detected" : "")} style={{ color: handOn ? confColor : "#4a5278" }}>
                  {handOn ? (appState.current_letter_arabic || appState.current_letter || "—") : "✋"}
                </div>
                <div>
                  <div className="overlay-conf"    style={{ color: confColor }}>{handOn ? conf + "%" : "No hand"}</div>
                  <div className="overlay-quality" style={{ color: confColor }}>{handOn ? confLabel : ""}</div>
                  <div className="overlay-model">{appState.model.toUpperCase()}</div>
                </div>
              </div>
            )}
            {camRunning && frame && (
              <div className={"hand-indicator" + (handOn ? " on" : "")}>
                {handOn ? `✋ ${appState.current_letter || "?"} detected` : "No hand in frame"}
              </div>
            )}
          </div>

          <div className="conf-bar-wrap">
            <span className="conf-bar-label">Confidence</span>
            <div className="conf-track">
              <div className="conf-fill" style={{ width: conf + "%", background: confColor }} />
              <div className="conf-threshold-marker" style={{ left: threshold + "%" }} />
            </div>
            <span className="conf-pct" style={{ color: confColor }}>{conf}%</span>
          </div>

          <div className="cam-controls" style={{ display: "flex", gap: 8 }}>
            {!camRunning ? (
              <button className="btn-start" style={{ flex: 1 }} onClick={startCamera}>
                ▶️ Start Camera
              </button>
            ) : (
              <>
                <button className="btn-stop" style={{ flex: 1 }} onClick={stopCamera}>
                  ■ Stop
                </button>
                {IS_MOBILE && (
                  <button
                    onClick={flipCamera}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "var(--r-sm)",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 20,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    🔄
                  </button>
                )}
              </>
            )}
          </div>

          <div className="section-card">
            <div className="card-label">
              DETECTION THRESHOLD
              <span style={{ color: "var(--text3)", fontWeight: 400 }}> {threshold}% min</span>
            </div>
            <div className="slider-row">
              <span className="slider-label">Sensitive</span>
              <input type="range" min="10" max="70" step="5" value={threshold}
                className="threshold-slider"
                onChange={e => updateThreshold(Number(e.target.value))} />
              <span className="slider-label">Strict</span>
            </div>
            <p className="slider-hint">
              {threshold <= 25 ? "⚡ Very sensitive — great for letters like TH, H, AA"
               : threshold <= 40 ? "✅ Balanced — recommended"
               : "🎯 Strict — only very confident predictions"}
            </p>
          </div>

          <div className="model-row">
            <span className="model-label">Model</span>
            <div className="model-tabs">
              {[["rf","🌲 RF"],["mlp","🧠 MLP"],["svm","⚡ SVM"]].map(([id, label]) => (
                <button key={id}
                  className={"model-tab" + (appState.model === id ? " on" : "")}
                  onClick={() => send("set_model", { model: id })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="section-card">
            <div className="card-label">QUICK ACTIONS</div>
            <div className="touch-grid">
              <button className="touch-btn accent"
                onClick={() => { send("commit_letter"); addLog("Letter added: " + appState.current_letter_arabic); }}
                disabled={!appState.current_letter}>
                ➕ Add Letter
              </button>
              <button className="touch-btn"
                onClick={() => send("delete_letter")}
                disabled={!appState.word_buffer}>
                ⌫ Delete
              </button>
              <button className="touch-btn green"
                onClick={commitWord}
                disabled={!appState.word_buffer}>
                ✔ Confirm Word
              </button>
              <button className="touch-btn"
                onClick={() => speak(appState.word_buffer)}
                disabled={!appState.word_buffer || speaking}>
                🔊 Speak
              </button>
            </div>
            {appState.word_buffer && (
              <div className="word-preview" dir="rtl">
                {wordArr.map((ch, i) => <span key={i} className="l-chip">{ch}</span>)}
              </div>
            )}
          </div>

          <div className="workflow-hint">
            <div className="workflow-step"><span className="wf-icon">📷</span><span>اصنع إشارة</span></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span className="wf-icon">✔</span><span>أكّد الكلمة</span></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span className="wf-icon">💬</span><span>تُحفظ في المحادثة</span></div>
          </div>
        </div>

        {/* ══ SPEECH TAB ══ */}
        <div id="speech-tab" className="tab-content" style={{ display: activeTab === "speech" ? "flex" : "none" }}>
          {chatMessages.filter(m => m.source === "speech").length > 0 && (
            <div className="mini-chat-preview mini-chat-preview--speech" onClick={() => setActiveTab("chat")}>
              <span className="mini-chat-label">آخر رسالة صوتية ←</span>
              <span className="mini-chat-text">{chatMessages.filter(m => m.source === "speech").at(-1).text}</span>
            </div>
          )}
          <div className="workflow-hint">
            <div className="workflow-step"><span className="wf-icon">🎤</span><span>تكلّم</span></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span className="wf-icon">💾</span><span>احفظ النص</span></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span className="wf-icon">💬</span><span>يظهر في المحادثة</span></div>
          </div>
          <SpeechToText speak={speak} onSave={handleSpeechSave} />
        </div>

        {/* ══ CHAT TAB ══ */}
        <div id="chat-tab" className="tab-content" style={{ display: activeTab === "chat" ? "flex" : "none" }}>
          <div className="section-card" style={{ flex: "none" }}>
            <div className="card-label">نظام المحادثة الموحّد · Two-Way Communication</div>
            <p style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.7 }}>
              تظهر هنا جميع الرسائل من <strong style={{color:"var(--green)"}}>👋 لغة الإشارة</strong> و<strong style={{color:"var(--accent)"}}>🎤 الصوت</strong> في مكان واحد.
            </p>
          </div>

          {chatMessages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>لا توجد رسائل بعد</p>
              <p className="ghost">استخدم الكاميرا أو الميكروفون لبدء المحادثة</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button className="touch-btn" onClick={() => setActiveTab("camera")}>📷 الكاميرا</button>
                <button className="touch-btn" onClick={() => setActiveTab("speech")}>🎤 الصوت</button>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-legend">
                <span className="chat-legend-item camera">👋 إشارة يدوية</span>
                <span className="chat-legend-item speech">🎤 صوت</span>
              </div>

              <div className="chat-full-log">
                {chatMessages.map((msg, i) => (
                  <div key={i}>
                    {/* ── Message bubble ── */}
                    <div className={`chat-msg chat-msg--${msg.source}`}>
                      <div className="chat-msg-meta">
                        <span className="chat-msg-source">{msg.source === "camera" ? "👋 إشارة" : "🎤 صوت"}</span>
                        <span className="chat-msg-time">{new Date(msg.t).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="chat-msg-text" dir={/[\u0600-\u06FF]/.test(msg.text) ? "rtl" : "ltr"}>
                        {msg.text}
                      </div>
                      {/* action row */}
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button className="chat-msg-speak" onClick={() => speak(msg.text)}>🔊</button>
                        {/* toggle sign display */}
                        <button
                          className="chat-msg-speak"
                          title="عرض الإشارات"
                          onClick={() => setExpandedSign(expandedSign === i ? null : i)}
                        >
                          {expandedSign === i ? "🙈" : "🤟"}
                        </button>
                      </div>
                    </div>

                    {/* ── Sign images — shown when 🤟 is tapped ── */}
                    {expandedSign === i && (
                      <div style={{ marginBottom: 8 }}>
                        <SignDisplay text={msg.text} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button className="touch-btn red" style={{ width: "100%" }} onClick={() => { setChatMessages([]); setExpandedSign(null); }}>
                🗑 مسح المحادثة
              </button>
            </>
          )}
        </div>

        {/* ══ PRACTICE TAB ══ */}
        <div id="practice-tab" className="tab-content" style={{ display: activeTab === "practice" ? "flex" : "none" }}>
          <GuidedPractice
            currentLetter={appState.current_letter}
            confidence={appState.confidence}
            isConnected={connected && camRunning}
            frame={frame}
          />
        </div>

        {/* ══ TRAINER TAB ══ */}
        <div id="trainer-tab" className="tab-content" style={{ display: activeTab === "trainer" ? "flex" : "none" }}>
          <AlphabetTrainer
            currentLetter={appState.current_letter}
            currentLetterArabic={appState.current_letter_arabic}
            confidence={appState.confidence}
            isConnected={connected && camRunning}
            speak={speak}
            frame={frame}
          />
        </div>

        {/* ══ ACCURACY TAB ══ */}
        <div id="accuracy-tab" className="tab-content" style={{ display: activeTab === "accuracy" ? "flex" : "none" }}>
          <AccuracyDashboard modelChoice={appState.model} />
        </div>

      </div>

      <footer className="footer">
        Arabic Sign Language Translator · Two-Way Communication System · AI-Powered
      </footer>
    </div>
  );
}
