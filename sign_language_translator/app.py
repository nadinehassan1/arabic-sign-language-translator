"""
Arabic Sign Language Translator
================================
Supports TWO camera modes:
  1. PC webcam  (CameraThread — OpenCV)
  2. Mobile/browser camera  (WebSocket frames from frontend)
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import pickle, asyncio, io, threading, base64, json, os, tempfile
from pathlib import Path
from collections import deque
from typing import Optional

import cv2
import numpy as np
import mediapipe as mp

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── Paths ──────────────────────────────────────────────────────────
MODELS_DIR = Path("models")

# ── Load label encoder ─────────────────────────────────────────────
with open(MODELS_DIR / "label_encoder.pkl", "rb") as f:
    le = pickle.load(f)

with open(MODELS_DIR / "arabic_letters.pkl", "rb") as f:
    ARABIC_LETTERS = pickle.load(f)

print(f"Label encoder classes ({len(le.classes_)}): {list(le.classes_)}")

# ── Smart model loader ─────────────────────────────────────────────
def load_model_smart(filename: str):
    path = MODELS_DIR / filename
    if not path.exists():
        print(f"⚠️  {filename} not found — skipping")
        return None
    with open(path, "rb") as f:
        obj = pickle.load(f)
    if isinstance(obj, dict) and 'model' in obj and 'scaler' in obj:
        print(f"✅ {filename} loaded (bundle) | classes: {len(obj.get('classes', le.classes_))}")
        return {
            'model'  : obj['model'],
            'scaler' : obj['scaler'],
            'classes': obj.get('classes', list(le.classes_)),
            'format' : 'new',
        }
    print(f"⚠️  {filename} OLD format — no scaler")
    return {
        'model'  : obj,
        'scaler' : None,
        'classes': list(le.classes_),
        'format' : 'old',
    }

rf_bundle  = load_model_smart("rf_model.pkl")
mlp_bundle = load_model_smart("mlp_model.pkl")
svm_bundle = load_model_smart("svm_model.pkl")

if not any([rf_bundle, mlp_bundle, svm_bundle]):
    raise RuntimeError("❌ No model files found in models/")

CLASS_NAMES = (rf_bundle or mlp_bundle or svm_bundle)['classes']
print(f"\nReady — {len(CLASS_NAMES)} classes")

# ── Whisper (lazy-loaded) ──────────────────────────────────────────
_whisper_model = None
_whisper_lock  = threading.Lock()

def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        with _whisper_lock:
            if _whisper_model is None:
                try:
                    from faster_whisper import WhisperModel
                    print("⏳ Loading Whisper…")
                    _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
                    print("✅ Whisper ready")
                except ImportError:
                    print("⚠️  faster-whisper not installed — run: pip install faster-whisper")
    return _whisper_model

# ── MediaPipe — one global instance ───────────────────────────────
_mp_hands_instance = None
_mp_lock           = threading.Lock()

def get_hands():
    global _mp_hands_instance
    if _mp_hands_instance is None:
        _mp_hands_instance = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    return _mp_hands_instance

# ── Inference ──────────────────────────────────────────────────────
def run_inference(X_raw: np.ndarray, model_choice: str):
    if model_choice == "svm" and svm_bundle:
        bundle = svm_bundle
    elif model_choice == "mlp" and mlp_bundle:
        bundle = mlp_bundle
    elif rf_bundle:
        bundle = rf_bundle
    elif mlp_bundle:
        bundle = mlp_bundle
    else:
        bundle = svm_bundle
    if bundle is None:
        return None, 0.0
    try:
        X = bundle['scaler'].transform(X_raw) if bundle['scaler'] else X_raw
        pred_id = int(bundle['model'].predict(X)[0])
        conf    = float(bundle['model'].predict_proba(X).max())
        classes = bundle['classes']
        letter  = classes[pred_id] if pred_id < len(classes) else le.classes_[pred_id]
        return letter, conf
    except Exception as e:
        print(f"Inference error: {e}")
        return None, 0.0

# ── Process one frame ─────────────────────────────────────────────
def process_frame(frame_bgr: np.ndarray):
    img_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    with _mp_lock:
        result = get_hands().process(img_rgb)

    if result.multi_hand_landmarks:
        hand_lms = result.multi_hand_landmarks[0]
        mp.solutions.drawing_utils.draw_landmarks(
            frame_bgr, hand_lms, mp.solutions.hands.HAND_CONNECTIONS,
            mp.solutions.drawing_utils.DrawingSpec(color=(0, 255, 100), thickness=2, circle_radius=4),
            mp.solutions.drawing_utils.DrawingSpec(color=(0, 180, 255), thickness=2),
        )
        wx = hand_lms.landmark[0].x
        wy = hand_lms.landmark[0].y
        wz = hand_lms.landmark[0].z
        lms = []
        for lm in hand_lms.landmark:
            lms += [lm.x - wx, lm.y - wy, lm.z - wz]
        X_raw = np.array(lms, dtype=np.float32).reshape(1, -1)
        letter, raw_conf = run_inference(X_raw, state.model_choice)
        if letter:
            print(f"  {letter:8s} | {raw_conf*100:5.1f}% | {'✓' if raw_conf >= state.min_confidence else '✗'}")
            if raw_conf >= state.min_confidence:
                state.push_prediction(letter, raw_conf)
            else:
                state.clear_detection()
    else:
        state.clear_detection()

    detected = state.current_letter or "—"
    cv2.putText(frame_bgr, f"Letter: {detected}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 100), 2)
    cv2.putText(frame_bgr, f"Conf: {state.confidence*100:.0f}%  min:{state.min_confidence*100:.0f}%",
                (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 80), 2)
    cv2.putText(frame_bgr, f"Model: {state.model_choice.upper()}",
                (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 200, 255), 2)
    return frame_bgr

# ── TTS ────────────────────────────────────────────────────────────
def tts_bytes(text: str) -> bytes:
    try:
        import pyttsx3
        engine = pyttsx3.init()
        for v in engine.getProperty('voices'):
            if 'arabic' in v.name.lower() or 'ar' in v.id.lower():
                engine.setProperty('voice', v.id)
                break
        engine.setProperty('rate', 150)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp_path = tmp.name
        engine.save_to_file(text, tmp_path)
        engine.runAndWait()
        with open(tmp_path, 'rb') as f:
            audio = f.read()
        os.unlink(tmp_path)
        if len(audio) > 1000:
            return audio
    except Exception as e:
        print(f"pyttsx3 failed: {e} — trying gTTS")
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang="ar", slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        print(f"gTTS also failed: {e}")
        return bytes([
            0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
            0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
            0x44,0xac,0x00,0x00,0x88,0x58,0x01,0x00,0x02,0x00,0x10,0x00,
            0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00
        ])

# ── Arabic autocorrect ─────────────────────────────────────────────
ARABIC_WORDLIST = [
    "مرحبا","كيف","حال","اهلا","وسهلا","شكرا",
    "نعم","لا","يد","اليد","الحرف","الكلمة","لغة","الإشارة","العربية",
]

def levenshtein(a, b):
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            temp = dp[j]
            dp[j] = prev if a[i-1] == b[j-1] else 1 + min(dp[j], dp[j-1], prev)
            prev = temp
    return dp[n]

def arabic_autocorrect(word):
    if not word:
        return word
    try:
        from camel_tools.autocorrect import AutoCorrect
        ac = AutoCorrect.pretrained()
        r = ac.correct(word)
        if r: return r[0]
    except Exception:
        pass
    best, best_d = word, 3
    for w in ARABIC_WORDLIST:
        d = levenshtein(word, w)
        if d < best_d:
            best, best_d = w, d
    return best

# ── State ──────────────────────────────────────────────────────────
class TranslatorState:
    def __init__(self):
        self.current_letter = ""
        self.word_buffer    = ""
        self.words          = []
        self.sentence       = ""
        self.confidence     = 0.0
        self.use_nlp        = True
        self.model_choice   = "rf"
        self.min_confidence = 0.30
        self._pred_buf      = deque(maxlen=5)
        self._conf_buf      = deque(maxlen=5)
        self._hold_frames   = 0

    def push_prediction(self, letter, conf):
        self._pred_buf.append(letter)
        self._conf_buf.append(conf)
        counts = {}
        for l in self._pred_buf:
            counts[l] = counts.get(l, 0) + 1
        maj = max(counts, key=counts.get)
        if counts[maj] >= 3:
            mc = [self._conf_buf[i] for i, l in enumerate(self._pred_buf) if l == maj]
            sc = sum(mc) / len(mc)
            if maj != self.current_letter:
                self.current_letter = maj
                self.confidence     = sc
                self._hold_frames   = 0
            else:
                self._hold_frames += 1
                self.confidence = 0.4 * sc + 0.6 * self.confidence

    def clear_detection(self):
        self._pred_buf.clear()
        self._conf_buf.clear()
        self.current_letter = ""
        self.confidence     = 0.0
        self._hold_frames   = 0

    def commit_letter(self):
        if self.current_letter:
            self.word_buffer += ARABIC_LETTERS.get(self.current_letter, self.current_letter)
            self._pred_buf.clear()
            self._conf_buf.clear()

    def commit_word(self):
        word = self.word_buffer.strip()
        if not word: return
        if self.use_nlp: word = arabic_autocorrect(word)
        self.words.append(word)
        self.sentence    = " ".join(self.words)
        self.word_buffer = ""

    def clear_word(self):     self.word_buffer = ""
    def clear_sentence(self): self.words = []; self.sentence = ""; self.word_buffer = ""
    def delete_last_letter(self):
        if self.word_buffer: self.word_buffer = self.word_buffer[:-1]

    def to_dict(self):
        return {
            "current_letter":        self.current_letter,
            "current_letter_arabic": ARABIC_LETTERS.get(self.current_letter, ""),
            "word_buffer":           self.word_buffer,
            "words":                 self.words,
            "sentence":              self.sentence,
            "confidence":            round(self.confidence * 100, 1),
            "model":                 self.model_choice,
            "nlp_enabled":           self.use_nlp,
        }

state = TranslatorState()

# ── PC webcam thread ───────────────────────────────────────────────
class CameraThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.running   = False
        self.frame_b64 = ""
        self.lock      = threading.Lock()

    def run(self):
        import time
        self.running = True
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        while self.running:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue
            frame = cv2.flip(frame, 1)
            frame = process_frame(frame)
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            with self.lock:
                self.frame_b64 = base64.b64encode(buf).decode()
        cap.release()

    def stop(self):
        self.running = False

camera_thread: Optional[CameraThread] = None

# ── FastAPI ────────────────────────────────────────────────────────
app = FastAPI(title="Arabic Sign Language Translator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/camera/start")
def start_camera():
    global camera_thread
    if camera_thread and camera_thread.running:
        return {"ok": True, "message": "Already running"}
    camera_thread = CameraThread()
    camera_thread.start()
    return {"ok": True}

@app.post("/api/camera/stop")
def stop_camera():
    global camera_thread
    if camera_thread:
        camera_thread.stop()
        camera_thread = None
    return {"ok": True}

@app.get("/api/status")
def get_status():
    available = []
    if rf_bundle:  available.append("rf")
    if mlp_bundle: available.append("mlp")
    if svm_bundle: available.append("svm")
    return {
        "camera_running":    camera_thread is not None and camera_thread.running,
        "available_models":  available,
        "current_threshold": state.min_confidence,
        "num_classes":       len(CLASS_NAMES),
        "state":             state.to_dict(),
    }

@app.post("/api/action/{action}")
def perform_action(action: str, payload: dict = Body(default={})):
    if   action == "commit_letter":  state.commit_letter()
    elif action == "commit_word":    state.commit_word()
    elif action == "clear_word":     state.clear_word()
    elif action == "clear_sentence": state.clear_sentence()
    elif action == "delete_letter":  state.delete_last_letter()
    elif action == "toggle_nlp":     state.use_nlp = not state.use_nlp
    elif action == "set_model":
        m = payload.get("model", "rf")
        if m in ("rf", "mlp", "svm"):
            state.model_choice = m
    elif action == "set_threshold":
        state.min_confidence = float(payload.get("value", 0.30))
    elif action in ("speak_word", "speak_sentence"):
        text = state.word_buffer if action == "speak_word" else state.sentence
        if not text and state.words: text = state.words[-1]
        if text:
            audio = tts_bytes(text)
            return StreamingResponse(io.BytesIO(audio), media_type="audio/mpeg")
    return {"ok": True, "state": state.to_dict()}

@app.get("/api/tts")
def tts_endpoint(text: str):
    audio = tts_bytes(text)
    media = "audio/wav" if audio[:4] == b'RIFF' else "audio/mpeg"
    return StreamingResponse(io.BytesIO(audio), media_type=media,
        headers={"Content-Disposition": "inline; filename=tts.mp3"})

@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    whisper = get_whisper()
    if whisper is None:
        return {"text": "", "error": "Whisper not installed. Run: pip install faster-whisper"}
    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        segments, info = whisper.transcribe(
            tmp_path, language="ar", beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        print(f"[Whisper] → '{text}'")
        return {"text": text, "language": info.language}
    except Exception as e:
        print(f"[Whisper] Error: {e}")
        return {"text": "", "error": str(e)}
    finally:
        os.unlink(tmp_path)

# ── WebSocket ──────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("WebSocket connected")
    loop = asyncio.get_event_loop()

    try:
        while True:
            # Push state to client
            payload = state.to_dict()
            if camera_thread and camera_thread.running:
                with camera_thread.lock:
                    frame = camera_thread.frame_b64
                if frame:
                    payload["frame"] = frame
                else:
                    payload["frame"] = None       
            else:
                payload["frame"] = None

            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                break  # client disconnected during send

            # Receive message (command or mobile frame)
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=0.04)
            except asyncio.TimeoutError:
                await asyncio.sleep(0.033)
                continue
            except WebSocketDisconnect:
                break

            # Parse safely — never crash the loop
            try:
                data = json.loads(raw)
            except Exception:
                await asyncio.sleep(0.04)
                continue

            # ── Mobile camera frame ────────────────────────────────
            if data.get("type") == "frame":
                try:
                    raw_img = data.get("image", "")
                    if not raw_img:
                        continue
                    # Strip data URI prefix if present
                    b64 = raw_img.split(",")[1] if "," in raw_img else raw_img
                    img_bytes = base64.b64decode(b64)
                    np_arr    = np.frombuffer(img_bytes, np.uint8)
                    frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                    if frame_bgr is not None:
                        annotated = await loop.run_in_executor(None, process_frame, frame_bgr)
                        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
                        frame_b64 = base64.b64encode(buf).decode()
                        await ws.send_text(json.dumps({**state.to_dict(), "frame": frame_b64}))
                except Exception as e:
                    print(f"[WS] Frame processing error (skipping): {e}")
                continue  # never crash — always continue

            # ── Regular commands ───────────────────────────────────
            try:
                cmd = data.get("cmd", "")
                if   cmd == "commit_letter":  state.commit_letter()
                elif cmd == "commit_word":    state.commit_word()
                elif cmd == "clear_word":     state.clear_word()
                elif cmd == "clear_sentence": state.clear_sentence()
                elif cmd == "delete_letter":  state.delete_last_letter()
                elif cmd == "toggle_nlp":     state.use_nlp = not state.use_nlp
                elif cmd == "set_model":
                    m = data.get("model", "rf")
                    if m in ("rf", "mlp", "svm"):
                        state.model_choice = m
                elif cmd == "set_threshold":
                    state.min_confidence = float(data.get("value", 0.30))
                    print(f"[WS] Threshold → {state.min_confidence*100:.0f}%")
            except Exception as e:
                print(f"[WS] Command error (skipping): {e}")

            await asyncio.sleep(0.04)

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket closed unexpectedly: {e}")

# ── Static frontend ────────────────────────────────────────────────
_fe = Path("../frontend/dist").resolve()
if _fe.exists():
    app.mount("/", StaticFiles(directory=str(_fe), html=True), name="static")
    print(f"Frontend mounted from {_fe}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
