import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Trophy, Star, Flame, Heart, SkipForward, RefreshCw, 
  CheckCircle2, XCircle, Clock, Zap, Award, Target,
  ChevronRight, Volume2
} from "lucide-react";
// Maps backend class names → trainer letter codes
const BACKEND_TO_TRAINER = {
  'aleff': 'A',   'bb': 'B',     'taa': 'T',    'thaa': 'TH',
  'jeem': 'J',    'haa': 'H',    'khaa': 'KH',  'dal': 'D',
  'thal': 'THL',  'ra': 'R',     'zay': 'Z',    'seen': 'S',
  'sheen': 'SH',  'saad': 'SD',  'dhad': 'DD',  'ta': 'TT',
  'dha': 'ZZ',    'ain': 'AA',   'ghain': 'GH', 'fa': 'F',
  'gaaf': 'Q',    'kaaf': 'K',   'laam': 'L',   'meem': 'M',
  'nun': 'N',     'ha': 'HH',    'waw': 'W',    'ya': 'Y',
  'al': 'A',      'la': 'L',     'toot': 'T',   'yaa': 'Y',
  'bb': 'B',
};
// Arabic alphabet data
const ALPHABET = [
  { letter: "A", arabic: "ا", name: "Alif" },
  { letter: "B", arabic: "ب", name: "Ba" },
  { letter: "T", arabic: "ت", name: "Ta" },
  { letter: "TH", arabic: "ث", name: "Tha" },
  { letter: "J", arabic: "ج", name: "Jim" },
  { letter: "H", arabic: "ح", name: "Ha" },
  { letter: "KH", arabic: "خ", name: "Kha" },
  { letter: "D", arabic: "د", name: "Dal" },
  { letter: "THL", arabic: "ذ", name: "Thal" },
  { letter: "R", arabic: "ر", name: "Ra" },
  { letter: "Z", arabic: "ز", name: "Zay" },
  { letter: "S", arabic: "س", name: "Sin" },
  { letter: "SH", arabic: "ش", name: "Shin" },
  { letter: "SD", arabic: "ص", name: "Sad" },
  { letter: "DD", arabic: "ض", name: "Dad" },
  { letter: "TT", arabic: "ط", name: "Ta" },
  { letter: "ZZ", arabic: "ظ", name: "Za" },
  { letter: "AA", arabic: "ع", name: "Ain" },
  { letter: "GH", arabic: "غ", name: "Ghain" },
  { letter: "F", arabic: "ف", name: "Fa" },
  { letter: "Q", arabic: "ق", name: "Qaf" },
  { letter: "K", arabic: "ك", name: "Kaf" },
  { letter: "L", arabic: "ل", name: "Lam" },
  { letter: "M", arabic: "م", name: "Mim" },
  { letter: "N", arabic: "ن", name: "Nun" },
  { letter: "HH", arabic: "ه", name: "Ha" },
  { letter: "W", arabic: "و", name: "Waw" },
  { letter: "Y", arabic: "ي", name: "Ya" },
];

// XP thresholds for levels
const LEVEL_XP = [0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100, 5000];

const getLevelFromXP = (xp) => {
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) return i + 1;
  }
  return 1;
};

const getXPForNextLevel = (xp) => {
  const level = getLevelFromXP(xp);
  if (level >= LEVEL_XP.length) return LEVEL_XP[LEVEL_XP.length - 1];
  return LEVEL_XP[level];
};

// Sound effects (using Web Audio API)
const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === "correct") {
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } else if (type === "wrong") {
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } else if (type === "levelup") {
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(554.37, audioContext.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.3);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.45);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.7);
    }
  } catch (e) {
    // Audio not supported
  }
};

export default function AlphabetTrainer({ currentLetter,currentLetterArabic, confidence, isConnected, speak, frame }) {
  // Game state
  const [gameMode, setGameMode] = useState("menu"); // menu, playing, results
  const [difficulty, setDifficulty] = useState("normal"); // easy, normal, hard
  const [sessionType, setSessionType] = useState("quick"); // quick (10), standard (20), marathon (all)
  
  // Session state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [targetLetter, setTargetLetter] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isCorrect, setIsCorrect] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  
  // Progress state
  const [xp, setXP] = useState(() => parseInt(localStorage.getItem("signTrainerXP") || "0"));
  const [streak, setStreak] = useState(() => parseInt(localStorage.getItem("signTrainerStreak") || "0"));
  const [lives, setLives] = useState(3);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Timers
  const timerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const [holdProgress, setHoldProgress] = useState(0);
  
  const level = getLevelFromXP(xp);
  const xpForNext = getXPForNextLevel(xp);
  const xpProgress = level >= LEVEL_XP.length ? 100 : 
    ((xp - LEVEL_XP[level - 1]) / (xpForNext - LEVEL_XP[level - 1])) * 100;

  // Save progress
  useEffect(() => {
    localStorage.setItem("signTrainerXP", xp.toString());
    localStorage.setItem("signTrainerStreak", streak.toString());
  }, [xp, streak]);

  // Get time limit based on difficulty
  const getTimeLimit = useCallback(() => {
    if (difficulty === "easy") return 15;
    if (difficulty === "normal") return 10;
    return 6;
  }, [difficulty]);

  // Get hold time required (how long to hold correct sign)
  const getHoldTime = useCallback(() => {
    if (difficulty === "easy") return 1000;
    if (difficulty === "normal") return 1500;
    return 2000;
  }, [difficulty]);

  // Generate questions for session
  const startSession = useCallback(() => {
    let numQuestions;
    if (sessionType === "quick") numQuestions = 10;
    else if (sessionType === "standard") numQuestions = 20;
    else numQuestions = ALPHABET.length;
    
    // Shuffle and pick questions
    const shuffled = [...ALPHABET].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numQuestions);
    
    setQuestions(selected);
    setAnswers([]);
    setCurrentQuestion(0);
    setTargetLetter(selected[0]);
    setLives(difficulty === "easy" ? 5 : difficulty === "normal" ? 3 : 2);
    setTotalCorrect(0);
    setBestStreak(0);
    setTimeLeft(getTimeLimit());
    setGameMode("playing");
    setIsCorrect(null);
    setShowFeedback(false);
    setHoldProgress(0);
  }, [sessionType, difficulty, getTimeLimit]);

  // Timer countdown
  useEffect(() => {
    if (gameMode !== "playing" || showFeedback) return;
    
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timerRef.current);
  }, [gameMode, showFeedback, currentQuestion]);

  // Check for correct answer with hold detection
  useEffect(() => {
    if (gameMode !== "playing" || showFeedback) return;
    
    const confidenceThreshold = difficulty === "easy" ? 40 : difficulty === "normal" ? 50 : 60;
    
    if (currentLetter && 
        targetLetter && 
        BACKEND_TO_TRAINER[currentLetter?.toLowerCase()] === targetLetter.letter &&
        confidence >= confidenceThreshold) {
      
      // Start hold timer
      if (!holdTimerRef.current) {
        const holdTime = getHoldTime();
        const startTime = Date.now();
        
        holdTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / holdTime) * 100, 100);
          setHoldProgress(progress);
          
          if (elapsed >= holdTime) {
            clearInterval(holdTimerRef.current);
            holdTimerRef.current = null;
            handleCorrectAnswer();
          }
        }, 50);
      }
    } else {
      // Wrong letter or low confidence - reset hold
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        setHoldProgress(0);
      }
    }
    
    return () => {
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [currentLetter, confidence, targetLetter, gameMode, showFeedback, difficulty, getHoldTime]);

  const handleCorrectAnswer = () => {
    clearInterval(timerRef.current);
    setIsCorrect(true);
    setShowFeedback(true);
    setHoldProgress(0);
    
    const timeBonus = Math.floor(timeLeft * 2);
    const streakBonus = Math.min(streak * 5, 50);
    const earnedXP = 10 + timeBonus + streakBonus;
    
    setXP(prev => prev + earnedXP);
    setStreak(prev => prev + 1);
    setTotalCorrect(prev => prev + 1);
    setBestStreak(prev => Math.max(prev, streak + 1));
    setAnswers(prev => [...prev, { ...targetLetter, correct: true, time: getTimeLimit() - timeLeft }]);
    
    if (soundEnabled) playSound("correct");
    
    // Check for level up
    const oldLevel = getLevelFromXP(xp);
    const newLevel = getLevelFromXP(xp + earnedXP);
    if (newLevel > oldLevel && soundEnabled) {
      setTimeout(() => playSound("levelup"), 500);
    }
    
    setTimeout(nextQuestion, 1500);
  };

  const handleTimeout = () => {
    clearInterval(timerRef.current);
    setIsCorrect(false);
    setShowFeedback(true);
    setHoldProgress(0);
    setStreak(0);
    setLives(prev => prev - 1);
    setAnswers(prev => [...prev, { ...targetLetter, correct: false, time: getTimeLimit() }]);
    
    if (soundEnabled) playSound("wrong");
    
    if (lives <= 1) {
      setTimeout(() => setGameMode("results"), 1500);
    } else {
      setTimeout(nextQuestion, 2000);
    }
  };

  const skipQuestion = () => {
    clearInterval(timerRef.current);
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setStreak(0);
    setAnswers(prev => [...prev, { ...targetLetter, correct: false, skipped: true, time: 0 }]);
    nextQuestion();
  };

  const nextQuestion = () => {
    const nextIdx = currentQuestion + 1;
    
    if (nextIdx >= questions.length || lives <= 0) {
      setGameMode("results");
      return;
    }
    
    setCurrentQuestion(nextIdx);
    setTargetLetter(questions[nextIdx]);
    setTimeLeft(getTimeLimit());
    setIsCorrect(null);
    setShowFeedback(false);
    setHoldProgress(0);
  };

  const resetGame = () => {
    setGameMode("menu");
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestion(0);
    setTargetLetter(null);
    setHoldProgress(0);
  };

  // Render menu
  if (gameMode === "menu") {
    return (
      <div className="trainer-menu">
        {/* Player stats */}
        <div className="player-stats">
          <div className="level-badge">
            <Award size={24} />
            <span className="level-num">Lvl {level}</span>
          </div>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${xpProgress}%` }} />
            <span className="xp-text">{xp} XP</span>
          </div>
          <div className="streak-display">
            <Flame size={18} />
            <span>{streak} day streak</span>
          </div>
        </div>

        {/* Session type selection */}
        <div className="section-card">
          <div className="card-label">CHOOSE SESSION</div>
          <div className="session-options">
            {[
              { id: "quick", label: "Quick", desc: "10 letters", icon: Zap },
              { id: "standard", label: "Standard", desc: "20 letters", icon: Target },
              { id: "marathon", label: "Marathon", desc: "All 28 letters", icon: Trophy },
            ].map(opt => (
              <button
                key={opt.id}
                className={`session-btn ${sessionType === opt.id ? "active" : ""}`}
                onClick={() => setSessionType(opt.id)}
              >
                <opt.icon size={20} />
                <span className="session-label">{opt.label}</span>
                <span className="session-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty selection */}
        <div className="section-card">
          <div className="card-label">DIFFICULTY</div>
          <div className="difficulty-options">
            {[
              { id: "easy", label: "Easy", desc: "15s, 5 lives", color: "#00e5a0" },
              { id: "normal", label: "Normal", desc: "10s, 3 lives", color: "#4f8ef7" },
              { id: "hard", label: "Hard", desc: "6s, 2 lives", color: "#ff4f6d" },
            ].map(opt => (
              <button
                key={opt.id}
                className={`diff-btn ${difficulty === opt.id ? "active" : ""}`}
                onClick={() => setDifficulty(opt.id)}
                style={{ "--diff-color": opt.color }}
              >
                <span className="diff-label">{opt.label}</span>
                <span className="diff-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sound toggle */}
        <div className="section-card">
          <div className="settings-row">
            <div>
              <div className="card-label" style={{ marginBottom: 2 }}>SOUND EFFECTS</div>
              <div className="ghost" style={{ fontSize: 11 }}>Play sounds for correct/wrong answers</div>
            </div>
            <div 
              className={`toggle ${soundEnabled ? "on" : ""}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              <div className="toggle-thumb" />
            </div>
          </div>
        </div>

        {/* Start button */}
        <button 
          className="start-session-btn"
          onClick={startSession}
          disabled={!isConnected}
        >
          {isConnected ? (
            <>
              <Zap size={20} />
              Start Training
            </>
          ) : (
            <>
              <XCircle size={20} />
              Start Camera First
            </>
          )}
        </button>

        {!isConnected && (
          <p className="connection-warning">
            Camera must be running to play. Go to Camera tab and start the camera.
          </p>
        )}
      </div>
    );
  }

  // Render playing
  if (gameMode === "playing") {
    return (
      <div className="trainer-playing">
        {/* Top bar */}
        <div className="game-top-bar">
          <div className="lives-display">
            {[...Array(difficulty === "easy" ? 5 : difficulty === "normal" ? 3 : 2)].map((_, i) => (
              <Heart 
                key={i} 
                size={20} 
                className={i < lives ? "life-full" : "life-empty"}
                fill={i < lives ? "#ff4f6d" : "none"}
              />
            ))}
          </div>
          <div className="progress-display">
            {currentQuestion + 1} / {questions.length}
          </div>
          <div className="streak-mini">
            <Flame size={16} />
            {streak}
          </div>
        </div>

        {/* Timer */}
        <div className="timer-bar">
          <div 
            className="timer-fill" 
            style={{ 
              width: `${(timeLeft / getTimeLimit()) * 100}%`,
              background: timeLeft <= 3 ? "#ff4f6d" : timeLeft <= 5 ? "#ffb547" : "#4f8ef7"
            }} 
          />
          <span className="timer-text">
            <Clock size={14} />
            {timeLeft}s
          </span>
        </div>

        {/* Question card */}
        <div className={`question-card ${showFeedback ? (isCorrect ? "correct" : "wrong") : ""}`}>
          <div className="question-label">Sign this letter:</div>
          <div className="target-letter">
            <span className="target-arabic">{targetLetter?.arabic}</span>
            <span className="target-name">{targetLetter?.name}</span>
            <span className="target-code">{targetLetter?.letter}</span>
          </div>
          
          {/* Speak button */}
          {speak && (
            <button className="speak-btn" onClick={() => speak(targetLetter?.arabic)}>
              <Volume2 size={18} />
            </button>
          )}
        </div>

        {/* Hold progress indicator */}
        {holdProgress > 0 && (
          <div className="hold-progress">
            <div className="hold-label">Hold steady...</div>
            <div className="hold-bar">
              <div className="hold-fill" style={{ width: `${holdProgress}%` }} />
            </div>
          </div>
        )}
{/* LIVE CAMERA FEED */}
{frame && (
  <div className="cam-frame active">
    <img
      src={frame}
      alt="Trainer camera"
      className="cam-video"
    />
  </div>
  
)}


        {/* Detection feedback */}
        <div className="detection-feedback">
          {showFeedback ? (
            <div className={`feedback-display ${isCorrect ? "correct" : "wrong"}`}>
              {isCorrect ? (
                <>
                  <CheckCircle2 size={48} />
                  <span>Correct!</span>
                  <span className="xp-earned">+{10 + Math.floor(timeLeft * 2) + Math.min((streak - 1) * 5, 50)} XP</span>
                </>
              ) : (
                <>
                  <XCircle size={48} />
                  <span>Time Up!</span>
                  <span className="correct-answer">Answer: {targetLetter?.letter}</span>
                </>
              )}
            </div>
          ) : (
            <div className="current-detection">
  <div className="live-detection-box">

    <div className="live-detection-top">
      <span className="detecting-label">Your Sign</span>

      <span
        className={`connection-state ${isConnected ? "on" : "off"}`}
      >
        {isConnected ? "LIVE" : "OFFLINE"}
      </span>
    </div>

    <div
      className={`live-letter ${currentLetter ? "active" : ""}`}
    >
      {currentLetter ? (currentLetterArabic || currentLetter) : "✋"}
    </div>

    <div className="live-confidence">
      {confidence > 0
        ? `${Math.round(confidence)}% confidence`
        : "Waiting for hand..."}
    </div>

    {targetLetter && currentLetter === targetLetter.letter && confidence >= 50 && (
      <div className="match-indicator">
        ✅ MATCHING TARGET
      </div>
    )}

  </div>
</div>
          )}
        </div>

        {/* Skip button */}
        {!showFeedback && (
          <button className="skip-btn" onClick={skipQuestion}>
            <SkipForward size={16} />
            Skip (-0 XP)
          </button>
        )}
      </div>
    );
  }

  // Render results
  if (gameMode === "results") {
    const accuracy = questions.length > 0 ? Math.round((totalCorrect / answers.length) * 100) : 0;
    const avgTime = answers.filter(a => a.correct).length > 0
      ? (answers.filter(a => a.correct).reduce((sum, a) => sum + a.time, 0) / answers.filter(a => a.correct).length).toFixed(1)
      : 0;

    return (
      <div className="trainer-results">
        {/* Result header */}
        <div className="result-header">
          {accuracy >= 80 ? (
            <>
              <Trophy size={48} className="result-icon gold" />
              <h2>Excellent!</h2>
            </>
          ) : accuracy >= 60 ? (
            <>
              <Star size={48} className="result-icon silver" />
              <h2>Good Job!</h2>
            </>
          ) : (
            <>
              <Target size={48} className="result-icon bronze" />
              <h2>Keep Practicing!</h2>
            </>
          )}
        </div>

        {/* Stats grid */}
        <div className="results-stats">
          <div className="result-stat">
            <span className="result-value">{accuracy}%</span>
            <span className="result-label">Accuracy</span>
          </div>
          <div className="result-stat">
            <span className="result-value">{totalCorrect}/{answers.length}</span>
            <span className="result-label">Correct</span>
          </div>
          <div className="result-stat">
            <span className="result-value">{bestStreak}</span>
            <span className="result-label">Best Streak</span>
          </div>
          <div className="result-stat">
            <span className="result-value">{avgTime}s</span>
            <span className="result-label">Avg Time</span>
          </div>
        </div>

        {/* XP summary */}
        <div className="section-card">
          <div className="card-label">SESSION SUMMARY</div>
          <div className="xp-summary">
            <div className="xp-line">
              <span>Base XP ({totalCorrect} correct)</span>
              <span>+{totalCorrect * 10}</span>
            </div>
            <div className="xp-line">
              <span>Time Bonuses</span>
              <span>+{answers.filter(a => a.correct).reduce((sum, a) => sum + Math.floor((getTimeLimit() - a.time) * 2), 0)}</span>
            </div>
            <div className="xp-total">
              <span>Total XP</span>
              <span className="xp-total-value">{xp}</span>
            </div>
          </div>
        </div>

        {/* Detailed breakdown */}
        <div className="section-card">
          <div className="card-label">LETTER BREAKDOWN</div>
          <div className="answer-breakdown">
            {answers.map((ans, idx) => (
              <div key={idx} className={`answer-item ${ans.correct ? "correct" : ans.skipped ? "skipped" : "wrong"}`}>
                <span className="answer-arabic">{ans.arabic}</span>
                {ans.correct ? (
                  <CheckCircle2 size={16} className="answer-icon" />
                ) : ans.skipped ? (
                  <SkipForward size={16} className="answer-icon" />
                ) : (
                  <XCircle size={16} className="answer-icon" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="result-actions">
          <button className="touch-btn accent" onClick={startSession}>
            <RefreshCw size={16} />
            Play Again
          </button>
          <button className="touch-btn" onClick={resetGame}>
            <ChevronRight size={16} />
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return null;
}
