import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Volume2, Copy, Trash2, CheckCircle2,
  AlertTriangle, ChevronDown, RefreshCw,
  MessageSquare, Clock, Zap
} from "lucide-react";

// Language options for speech recognition
const LANGUAGES = [
  { code: "ar-SA", label: "العربية (السعودية)", flag: "🇸🇦" },
  { code: "ar-EG", label: "العربية (مصر)",      flag: "🇪🇬" },
  { code: "ar-AE", label: "العربية (الإمارات)", flag: "🇦🇪" },
  { code: "en-US", label: "English (US)",        flag: "🇺🇸" },
];

// Check browser support
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!SpeechRecognition;

// onSave: optional callback(text) → pushes to unified chat log
export default function SpeechToText({ speak, onSave }) {
  const [isListening,    setIsListening]    = useState(false);
  const [transcript,     setTranscript]     = useState("");
  const [interimText,    setInterimText]    = useState("");
  const [history,        setHistory]        = useState([]);
  const [error,          setError]          = useState(null);
  const [copied,         setCopied]         = useState(false);
  const [selectedLang,   setSelectedLang]   = useState(LANGUAGES[0]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [continuous,     setContinuous]     = useState(false);
  const [volume,         setVolume]         = useState(0);
  const [totalWords,     setTotalWords]     = useState(0);
  const [sessionTime,    setSessionTime]    = useState(0);
  const [savedToChat,    setSavedToChat]    = useState(false);

  const recognitionRef  = useRef(null);
  const timerRef        = useRef(null);
  const analyserRef     = useRef(null);
  const animFrameRef    = useRef(null);
  const audioCtxRef     = useRef(null);
  const streamRef       = useRef(null);

  // ── Session timer ────────────────────────────────────────────────
  useEffect(() => {
    if (isListening) {
      timerRef.current = setInterval(() => setSessionTime(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isListening]);

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Mic volume visualizer ────────────────────────────────────────
  const startVolumeAnalyser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source   = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(Math.min(Math.round(avg * 2), 100));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // mic permission denied — visualizer won't show but recognition still works
    }
  }, []);

  const stopVolumeAnalyser = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    analyserRef.current = null;
    setVolume(0);
  }, []);

  // ── Start recognition ────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!supported) return;
    setError(null);
    setInterimText("");
    setSessionTime(0);
    setSavedToChat(false);

    const rec = new SpeechRecognition();
    rec.lang            = selectedLang.code;
    rec.continuous      = continuous;
    rec.interimResults  = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      startVolumeAnalyser();
    };

    rec.onresult = (e) => {
      let interim = "";
      let final   = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim);
      if (final) {
        setTranscript(prev => (prev ? prev + " " + final : final).trim());
        setTotalWords(prev => prev + final.trim().split(/\s+/).length);
        setInterimText("");
      }
    };

    rec.onerror = (e) => {
      const msgs = {
        "not-allowed":   "Microphone access denied. Please allow mic permission.",
        "no-speech":     "No speech detected. Try again.",
        "network":       "Network error. Check your connection.",
        "audio-capture": "No microphone found.",
      };
      setError(msgs[e.error] || `Error: ${e.error}`);
      setIsListening(false);
      stopVolumeAnalyser();
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimText("");
      stopVolumeAnalyser();
    };

    recognitionRef.current = rec;
    rec.start();
  }, [selectedLang, continuous, startVolumeAnalyser, stopVolumeAnalyser]);

  // ── Stop recognition ─────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    stopVolumeAnalyser();
  }, [stopVolumeAnalyser]);

  // ── Actions ──────────────────────────────────────────────────────
  const copyTranscript = () => {
    if (!transcript) return;
    navigator.clipboard?.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Save to local history + push to unified chat
  const saveToHistory = () => {
    if (!transcript.trim()) return;
    setHistory(prev => [
      { text: transcript.trim(), lang: selectedLang.code, t: Date.now() },
      ...prev,
    ].slice(0, 20));
    // Push to unified chat log
    if (onSave) {
      onSave(transcript.trim());
      setSavedToChat(true);
      setTimeout(() => setSavedToChat(false), 2500);
    }
    setTranscript("");
    setInterimText("");
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterimText("");
    setSavedToChat(false);
  };

  // ── Waveform bars ────────────────────────────────────────────────
  const BAR_COUNT = 20;
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const mid     = BAR_COUNT / 2;
    const dist    = Math.abs(i - mid) / mid;
    const base    = (1 - dist) * 0.4 + 0.1;
    const dynamic = isListening ? (volume / 100) * (1 - dist * 0.5) : 0;
    const height  = Math.round((base + dynamic) * 48);
    return height;
  });

  const isArabic = selectedLang.code.startsWith("ar");

  return (
    <div className="stt-container">

      {/* ── Not supported warning ── */}
      {!supported && (
        <div className="stt-unsupported">
          <AlertTriangle size={20} />
          <div>
            <strong>Not supported in this browser.</strong>
            <p>Use Chrome or Edge on Android/desktop for Arabic speech recognition.</p>
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="stt-stats-row">
        <div className="stt-stat">
          <Clock size={13} />
          <span>{formatTime(sessionTime)}</span>
        </div>
        <div className="stt-stat">
          <MessageSquare size={13} />
          <span>{totalWords} words</span>
        </div>
        <div className="stt-stat">
          <Zap size={13} />
          <span>{selectedLang.flag} {selectedLang.code}</span>
        </div>
      </div>

      {/* ── Mic card ── */}
      <div className={"stt-mic-card" + (isListening ? " listening" : "")}>

        {/* Waveform visualizer */}
        <div className="stt-waveform">
          {bars.map((h, i) => (
            <div
              key={i}
              className="stt-bar"
              style={{
                height: h + "px",
                background: isListening
                  ? `rgba(0, 229, 160, ${0.4 + (volume / 100) * 0.6})`
                  : "var(--border)",
                transition: isListening
                  ? `height ${50 + i * 8}ms ease`
                  : "height 0.4s ease, background 0.3s",
              }}
            />
          ))}
        </div>

        {/* Big mic button */}
        <button
          className={"stt-mic-btn" + (isListening ? " active" : "")}
          onClick={isListening ? stopListening : startListening}
          disabled={!supported}
        >
          {isListening
            ? <MicOff size={32} />
            : <Mic    size={32} />}
          <span>{isListening ? "Stop" : "Start"}</span>
        </button>

        {/* Status text */}
        <div className="stt-status-text">
          {isListening
            ? (interimText
                ? <span className="stt-interim">"{interimText}"</span>
                : <span className="stt-pulse">Listening…</span>)
            : <span className="stt-idle">Tap mic to start</span>}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="stt-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Language + options ── */}
      <div className="section-card">
        <div className="card-label">LANGUAGE & OPTIONS</div>

        <div className="stt-lang-picker" style={{ position: "relative" }}>
          <button
            className="stt-lang-btn"
            onClick={() => setShowLangPicker(p => !p)}
            disabled={isListening}
          >
            <span>{selectedLang.flag} {selectedLang.label}</span>
            <ChevronDown size={14} />
          </button>

          {showLangPicker && (
            <div className="stt-lang-dropdown">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  className={"stt-lang-option" + (lang.code === selectedLang.code ? " active" : "")}
                  onClick={() => { setSelectedLang(lang); setShowLangPicker(false); }}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                  {lang.code === selectedLang.code && <CheckCircle2 size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="settings-row" style={{ marginTop: 12 }}>
          <div>
            <div className="card-label" style={{ marginBottom: 2 }}>CONTINUOUS MODE</div>
            <div className="ghost" style={{ fontSize: 11 }}>Keep listening after each phrase</div>
          </div>
          <div
            className={"toggle" + (continuous ? " on" : "")}
            onClick={() => !isListening && setContinuous(c => !c)}
            style={{ opacity: isListening ? 0.5 : 1 }}
          >
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>

      {/* ── Transcript output ── */}
      <div className="section-card">
        <div className="card-label">
          TRANSCRIPT
          {transcript && (
            <button className="clear-btn" onClick={clearTranscript}>clear</button>
          )}
        </div>

        <div
          className={"stt-transcript" + (isArabic ? " rtl" : "")}
          dir={isArabic ? "rtl" : "ltr"}
        >
          {transcript
            ? <span className="stt-transcript-text">{transcript}</span>
            : <span className="ghost">Transcript appears here…</span>}
          {interimText && (
            <span className="stt-interim-inline"> {interimText}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="touch-grid" style={{ marginTop: 12 }}>
          <button className="touch-btn accent"
            onClick={() => speak?.(transcript)}
            disabled={!transcript || isListening}>
            <Volume2 size={15} />
            Speak
          </button>
          <button className="touch-btn"
            onClick={copyTranscript}
            disabled={!transcript}>
            {copied ? <><CheckCircle2 size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
          </button>
          {/* Save button — now also sends to chat */}
          <button
            className={"touch-btn " + (savedToChat ? "green" : "green")}
            onClick={saveToHistory}
            disabled={!transcript}
            style={{ position: "relative" }}
          >
            {savedToChat ? <><CheckCircle2 size={15} /> في المحادثة!</> : <>💬 أرسل</>}
          </button>
          <button className="touch-btn red"
            onClick={clearTranscript}
            disabled={!transcript}>
            <Trash2 size={15} />
            Clear
          </button>
        </div>

        {/* Save confirmation nudge */}
        {savedToChat && (
          <div style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "var(--green-dim)",
            border: "1px solid rgba(0,229,160,0.25)",
            borderRadius: "var(--r-sm)",
            fontSize: 12,
            color: "var(--green)",
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            ✓ تمّ إضافة الرسالة إلى المحادثة الموحّدة
          </div>
        )}
      </div>

      {/* ── Retry / reset ── */}
      {!isListening && transcript && (
        <button
          className="touch-btn"
          style={{ width: "100%" }}
          onClick={() => { clearTranscript(); startListening(); }}
        >
          <RefreshCw size={15} />
          Clear & Listen Again
        </button>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div className="section-card">
          <div className="card-label">
            HISTORY
            <button className="clear-btn" onClick={() => setHistory([])}>clear all</button>
          </div>
          {history.map((h, i) => (
            <div key={i} className="hist-item" dir={h.lang.startsWith("ar") ? "rtl" : "ltr"}>
              <span className="hist-text">{h.text}</span>
              <div className="hist-acts">
                <button onClick={() => speak?.(h.text)}><Volume2 size={14} /></button>
                <button onClick={() => navigator.clipboard?.writeText(h.text)}><Copy size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Browser tip ── */}
      <div className="cam-tip">
        💡 For best Arabic results use <strong>Chrome</strong> on Android or desktop.
        Safari supports English only. Firefox does not support this API.
      </div>

    </div>
  );
}