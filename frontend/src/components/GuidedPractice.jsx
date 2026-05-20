import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Target, Eye, Hand } from "lucide-react";

// Arabic letters data with finger position descriptions
const ARABIC_LETTERS_DATA = [
  { letter: "A", arabic: "ا", name: "Alif", description: "Index finger pointing up, other fingers closed in fist" },
  { letter: "B", arabic: "ب", name: "Ba", description: "All fingers extended flat, thumb tucked" },
  { letter: "T", arabic: "ت", name: "Ta", description: "Index and middle fingers up, forming a V" },
  { letter: "TH", arabic: "ث", name: "Tha", description: "Three fingers up (index, middle, ring)" },
  { letter: "J", arabic: "ج", name: "Jim", description: "Pinky finger up, other fingers in fist" },
  { letter: "H", arabic: "ح", name: "Ha", description: "Curved hand shape, fingers together" },
  { letter: "KH", arabic: "خ", name: "Kha", description: "Index finger bent like a hook" },
  { letter: "D", arabic: "د", name: "Dal", description: "Index finger pointing forward" },
  { letter: "THL", arabic: "ذ", name: "Thal", description: "Index finger bent with thumb touching" },
  { letter: "R", arabic: "ر", name: "Ra", description: "Index finger curved down" },
  { letter: "Z", arabic: "ز", name: "Zay", description: "Index finger with slight curve" },
  { letter: "S", arabic: "س", name: "Sin", description: "Three fingers extended horizontally" },
  { letter: "SH", arabic: "ش", name: "Shin", description: "Three fingers spread with thumb out" },
  { letter: "SD", arabic: "ص", name: "Sad", description: "Fist with thumb on top" },
  { letter: "DD", arabic: "ض", name: "Dad", description: "Fist with extended thumb" },
  { letter: "TT", arabic: "ط", name: "Ta", description: "Flat hand with fingers together" },
  { letter: "ZZ", arabic: "ظ", name: "Za", description: "Flat hand tilted" },
  { letter: "AA", arabic: "ع", name: "Ain", description: "Curved fingers forming a cup" },
  { letter: "GH", arabic: "غ", name: "Ghain", description: "Cup shape with thumb extended" },
  { letter: "F", arabic: "ف", name: "Fa", description: "Circle with index and thumb, others up" },
  { letter: "Q", arabic: "ق", name: "Qaf", description: "Two fingers up (index and middle)" },
  { letter: "K", arabic: "ك", name: "Kaf", description: "Flat hand, thumb out" },
  { letter: "L", arabic: "ل", name: "Lam", description: "L-shape with index and thumb" },
  { letter: "M", arabic: "م", name: "Mim", description: "Fist with thumb tucked" },
  { letter: "N", arabic: "ن", name: "Nun", description: "Circle with thumb and index" },
  { letter: "HH", arabic: "ه", name: "Ha", description: "Circle formed by fingers" },
  { letter: "W", arabic: "و", name: "Waw", description: "W-shape with fingers" },
  { letter: "Y", arabic: "ي", name: "Ya", description: "Pinky and thumb extended (shaka)" },
];

// SVG Hand Diagram Component
function HandDiagram({ fingerConfig, isMatched }) {
  return (
    <svg viewBox="0 0 200 280" className="hand-svg">
      {/* Palm */}
      <ellipse 
        cx="100" cy="200" rx="60" ry="70" 
        fill={isMatched ? "rgba(0, 229, 160, 0.2)" : "rgba(79, 142, 247, 0.15)"} 
        stroke={isMatched ? "#00e5a0" : "#4f8ef7"} 
        strokeWidth="2"
      />
      
      {/* Wrist */}
      <rect 
        x="60" y="260" width="80" height="20" rx="5"
        fill="rgba(79, 142, 247, 0.1)" 
        stroke="#4f8ef7" 
        strokeWidth="1.5"
      />
      
      {/* Thumb */}
      <g className={`finger ${fingerConfig?.thumb ? "active" : ""}`}>
        <path 
          d="M 40 180 Q 20 160 25 130 Q 30 110 45 105" 
          fill="none" 
          stroke={fingerConfig?.thumb ? "#00e5a0" : "#4a5278"} 
          strokeWidth="18" 
          strokeLinecap="round"
        />
        <circle cx="45" cy="105" r="10" fill={fingerConfig?.thumb ? "#00e5a0" : "#4a5278"} />
      </g>
      
      {/* Index finger */}
      <g className={`finger ${fingerConfig?.index ? "active" : ""}`}>
        <rect 
          x="50" y="70" width="20" height="70" rx="10"
          fill={fingerConfig?.index ? "#00e5a0" : "#4a5278"}
          transform="rotate(-5 60 105)"
        />
        <circle cx="58" cy="70" r="11" fill={fingerConfig?.index ? "#00e5a0" : "#4a5278"} />
      </g>
      
      {/* Middle finger */}
      <g className={`finger ${fingerConfig?.middle ? "active" : ""}`}>
        <rect 
          x="75" y="55" width="20" height="80" rx="10"
          fill={fingerConfig?.middle ? "#00e5a0" : "#4a5278"}
        />
        <circle cx="85" cy="55" r="11" fill={fingerConfig?.middle ? "#00e5a0" : "#4a5278"} />
      </g>
      
      {/* Ring finger */}
      <g className={`finger ${fingerConfig?.ring ? "active" : ""}`}>
        <rect 
          x="100" y="65" width="20" height="70" rx="10"
          fill={fingerConfig?.ring ? "#00e5a0" : "#4a5278"}
          transform="rotate(5 110 100)"
        />
        <circle cx="112" cy="65" r="11" fill={fingerConfig?.ring ? "#00e5a0" : "#4a5278"} />
      </g>
      
      {/* Pinky finger */}
      <g className={`finger ${fingerConfig?.pinky ? "active" : ""}`}>
        <rect 
          x="125" y="85" width="18" height="55" rx="9"
          fill={fingerConfig?.pinky ? "#00e5a0" : "#4a5278"}
          transform="rotate(10 134 112)"
        />
        <circle cx="136" cy="87" r="10" fill={fingerConfig?.pinky ? "#00e5a0" : "#4a5278"} />
      </g>
    </svg>
  );
}

// Finger configuration for each letter (simplified)
const getFingerConfig = (letter) => {
  const configs = {
    "A": { index: true, thumb: false, middle: false, ring: false, pinky: false },
    "B": { index: true, thumb: false, middle: true, ring: true, pinky: true },
    "T": { index: true, thumb: false, middle: true, ring: false, pinky: false },
    "TH": { index: true, thumb: false, middle: true, ring: true, pinky: false },
    "J": { index: false, thumb: false, middle: false, ring: false, pinky: true },
    "H": { index: true, thumb: true, middle: true, ring: true, pinky: true },
    "KH": { index: true, thumb: true, middle: false, ring: false, pinky: false },
    "D": { index: true, thumb: false, middle: false, ring: false, pinky: false },
    "THL": { index: true, thumb: true, middle: false, ring: false, pinky: false },
    "R": { index: true, thumb: false, middle: false, ring: false, pinky: false },
    "Z": { index: true, thumb: false, middle: false, ring: false, pinky: false },
    "S": { index: true, thumb: false, middle: true, ring: true, pinky: false },
    "SH": { index: true, thumb: true, middle: true, ring: true, pinky: false },
    "SD": { index: false, thumb: true, middle: false, ring: false, pinky: false },
    "DD": { index: false, thumb: true, middle: false, ring: false, pinky: false },
    "TT": { index: true, thumb: false, middle: true, ring: true, pinky: true },
    "ZZ": { index: true, thumb: false, middle: true, ring: true, pinky: true },
    "AA": { index: true, thumb: true, middle: true, ring: true, pinky: false },
    "GH": { index: true, thumb: true, middle: true, ring: true, pinky: false },
    "F": { index: true, thumb: true, middle: true, ring: true, pinky: true },
    "Q": { index: true, thumb: false, middle: true, ring: false, pinky: false },
    "K": { index: true, thumb: true, middle: true, ring: true, pinky: true },
    "L": { index: true, thumb: true, middle: false, ring: false, pinky: false },
    "M": { index: false, thumb: false, middle: false, ring: false, pinky: false },
    "N": { index: true, thumb: true, middle: false, ring: false, pinky: false },
    "HH": { index: true, thumb: true, middle: true, ring: false, pinky: false },
    "W": { index: true, thumb: true, middle: true, ring: false, pinky: true },
    "Y": { index: false, thumb: true, middle: false, ring: false, pinky: true },
  };
  return configs[letter] || { index: false, thumb: false, middle: false, ring: false, pinky: false };
};

export default function GuidedPractice({ currentLetter, confidence, isConnected }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMatched, setIsMatched] = useState(false);
  const [matchStreak, setMatchStreak] = useState(0);
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [showHint, setShowHint] = useState(false);
  
  const currentLetterData = ARABIC_LETTERS_DATA[currentIndex];
  const fingerConfig = getFingerConfig(currentLetterData.letter);
  
  // Check if the user matched the target letter
  useEffect(() => {
    if (currentLetter && currentLetter.toUpperCase() === currentLetterData.letter && confidence > 50) {
      if (!isMatched) {
        setIsMatched(true);
        setMatchStreak(prev => prev + 1);
        setPracticeHistory(prev => [
          { letter: currentLetterData.letter, arabic: currentLetterData.arabic, success: true, time: Date.now() },
          ...prev.slice(0, 19)
        ]);
      }
    } else {
      setIsMatched(false);
    }
  }, [currentLetter, confidence, currentLetterData, isMatched]);

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % ARABIC_LETTERS_DATA.length);
    setIsMatched(false);
    setShowHint(false);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + ARABIC_LETTERS_DATA.length) % ARABIC_LETTERS_DATA.length);
    setIsMatched(false);
    setShowHint(false);
  };

  const goToLetter = (index) => {
    setCurrentIndex(index);
    setIsMatched(false);
    setShowHint(false);
  };

  return (
    <div className="guided-practice">
      {/* Progress bar */}
      <div className="practice-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${((currentIndex + 1) / ARABIC_LETTERS_DATA.length) * 100}%` }}
          />
        </div>
        <span className="progress-text">{currentIndex + 1} / {ARABIC_LETTERS_DATA.length}</span>
      </div>

      {/* Streak indicator */}
      {matchStreak > 0 && (
        <div className="streak-badge">
          <Target size={16} />
          <span>{matchStreak} streak!</span>
        </div>
      )}

      {/* Main practice card */}
      <div className={`practice-card ${isMatched ? "matched" : ""}`}>
        <div className="practice-header">
          <button className="nav-btn" onClick={goToPrev}>
            <ChevronLeft size={24} />
          </button>
          
          <div className="letter-display">
            <span className="arabic-letter">{currentLetterData.arabic}</span>
            <span className="letter-name">{currentLetterData.name}</span>
            <span className="letter-code">{currentLetterData.letter}</span>
          </div>
          
          <button className="nav-btn" onClick={goToNext}>
            <ChevronRight size={24} />
          </button>
        </div>

       {/* Hand diagram */}
<div className="hand-diagram-container">

  <img
  src={`/letter_images/${
    {
      A: "alif",
      B: "ba",
      T: "ta",
      TH: "thaa",
      J: "jim",
      H: "ha",
      KH: "khaa",
      D: "dal",
      THL: "thal",
      R: "ra",
      Z: "zay",
      S: "seen",
      SH: "sheen",
      SD: "saad",
      DD: "dad",
      TT: "taa",
      ZZ: "yaa",
      AA: "ain",
      GH: "ghain",
      F: "fa",
      Q: "qaaf",
      K: "kaaf",
      L: "laam",
      M: "meem",
      N: "nun",
      HH: "haa",
      W: "waw",
      Y: "ya"
    }[currentLetterData.letter]
  }.jpg`}
  alt={currentLetterData.name}
  className="real-hand-image"
/>

  {isMatched && (
    <div className="match-overlay">
      <CheckCircle2 size={48} className="match-icon" />
      <span>Matched!</span>
    </div>
  )}
</div>

        {/* Instructions */}
        <div className="practice-instructions">
          <button 
            className={`hint-btn ${showHint ? "active" : ""}`}
            onClick={() => setShowHint(!showHint)}
          >
            <Eye size={16} />
            {showHint ? "Hide Instructions" : "Show Instructions"}
          </button>
          
          {showHint && (
            <div className="instruction-text">
              <Hand size={16} />
              <span>{currentLetterData.description}</span>
            </div>
          )}
        </div>

        {/* Detection status */}
        <div className="detection-status">
          {isConnected ? (
            <>
              <div className="status-item">
                <span className="status-label">Detecting:</span>
                <span className={`status-value ${currentLetter ? "active" : ""}`}>
                  {currentLetter || "No hand"}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Confidence:</span>
                <span className={`status-value ${confidence > 50 ? "high" : confidence > 30 ? "med" : "low"}`}>
                  {Math.round(confidence)}%
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Target:</span>
                <span className="status-value target">{currentLetterData.letter}</span>
              </div>
            </>
          ) : (
            <div className="status-offline">
              <XCircle size={16} />
              <span>Camera not connected - Start camera to practice</span>
            </div>
          )}
        </div>
      </div>

      {/* Letter picker grid */}
      <div className="section-card">
        <div className="card-label">QUICK SELECT LETTER</div>
        <div className="letter-picker">
          {ARABIC_LETTERS_DATA.map((item, idx) => (
            <button
              key={item.letter}
              className={`picker-btn ${idx === currentIndex ? "current" : ""} ${
                practiceHistory.some(h => h.letter === item.letter && h.success) ? "practiced" : ""
              }`}
              onClick={() => goToLetter(idx)}
            >
              {item.arabic}
            </button>
          ))}
        </div>
      </div>

      {/* Recent practice history */}
      {practiceHistory.length > 0 && (
        <div className="section-card">
          <div className="card-label">
            RECENT PRACTICE
            <button className="clear-btn" onClick={() => setPracticeHistory([])}>clear</button>
          </div>
          <div className="practice-history">
            {practiceHistory.slice(0, 10).map((item, idx) => (
              <div key={idx} className="history-item">
                <span className="history-letter">{item.arabic}</span>
                <CheckCircle2 size={14} className="history-icon success" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
