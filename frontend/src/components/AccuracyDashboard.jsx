import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Target, Brain, Zap } from "lucide-react";

// Simulated model accuracy data per letter
// In production, this would come from actual model evaluation metrics
const LETTER_ACCURACY_DATA = [
  { letter: "A", arabic: "ا", accuracy: 94, samples: 150, confusedWith: ["AA"] },
  { letter: "B", arabic: "ب", accuracy: 89, samples: 142, confusedWith: ["TT", "K"] },
  { letter: "T", arabic: "ت", accuracy: 91, samples: 138, confusedWith: ["TH", "Q"] },
  { letter: "TH", arabic: "ث", accuracy: 78, samples: 125, confusedWith: ["T", "S"] },
  { letter: "J", arabic: "ج", accuracy: 85, samples: 130, confusedWith: ["Y"] },
  { letter: "H", arabic: "ح", accuracy: 72, samples: 118, confusedWith: ["HH", "AA"] },
  { letter: "KH", arabic: "خ", accuracy: 76, samples: 115, confusedWith: ["H", "THL"] },
  { letter: "D", arabic: "د", accuracy: 88, samples: 145, confusedWith: ["R", "A"] },
  { letter: "THL", arabic: "ذ", accuracy: 69, samples: 108, confusedWith: ["KH", "D"] },
  { letter: "R", arabic: "ر", accuracy: 82, samples: 135, confusedWith: ["D", "Z"] },
  { letter: "Z", arabic: "ز", accuracy: 80, samples: 128, confusedWith: ["R", "S"] },
  { letter: "S", arabic: "س", accuracy: 86, samples: 140, confusedWith: ["SH", "TH"] },
  { letter: "SH", arabic: "ش", accuracy: 83, samples: 132, confusedWith: ["S", "TH"] },
  { letter: "SD", arabic: "ص", accuracy: 71, samples: 112, confusedWith: ["DD", "M"] },
  { letter: "DD", arabic: "ض", accuracy: 68, samples: 105, confusedWith: ["SD", "M"] },
  { letter: "TT", arabic: "ط", accuracy: 75, samples: 120, confusedWith: ["B", "K"] },
  { letter: "ZZ", arabic: "ظ", accuracy: 67, samples: 102, confusedWith: ["TT", "AA"] },
  { letter: "AA", arabic: "ع", accuracy: 73, samples: 116, confusedWith: ["A", "H", "GH"] },
  { letter: "GH", arabic: "غ", accuracy: 70, samples: 110, confusedWith: ["AA", "KH"] },
  { letter: "F", arabic: "ف", accuracy: 92, samples: 148, confusedWith: ["N"] },
  { letter: "Q", arabic: "ق", accuracy: 87, samples: 138, confusedWith: ["T", "W"] },
  { letter: "K", arabic: "ك", accuracy: 84, samples: 133, confusedWith: ["B", "TT"] },
  { letter: "L", arabic: "ل", accuracy: 95, samples: 155, confusedWith: ["A"] },
  { letter: "M", arabic: "م", accuracy: 90, samples: 145, confusedWith: ["SD", "DD"] },
  { letter: "N", arabic: "ن", accuracy: 88, samples: 142, confusedWith: ["F", "L"] },
  { letter: "HH", arabic: "ه", accuracy: 74, samples: 118, confusedWith: ["H", "F"] },
  { letter: "W", arabic: "و", accuracy: 81, samples: 130, confusedWith: ["Y", "Q"] },
  { letter: "Y", arabic: "ي", accuracy: 93, samples: 150, confusedWith: ["J", "W"] },
];

// Confusion matrix data (pairs that get confused)
const CONFUSION_PAIRS = [
  { pair: ["TH", "T"], rate: 22, reason: "Similar finger positions" },
  { pair: ["H", "HH"], rate: 28, reason: "Both use curved hand shape" },
  { pair: ["SD", "DD"], rate: 32, reason: "Both are fist-based" },
  { pair: ["AA", "GH"], rate: 30, reason: "Cup shape variations" },
  { pair: ["THL", "KH"], rate: 31, reason: "Hook finger similarity" },
  { pair: ["R", "D"], rate: 18, reason: "Index finger pointing" },
  { pair: ["S", "SH"], rate: 17, reason: "Three-finger variations" },
  { pair: ["ZZ", "TT"], rate: 33, reason: "Flat hand tilts" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="tooltip-header">
          <span className="tooltip-arabic">{data.arabic}</span>
          <span className="tooltip-letter">{data.letter}</span>
        </div>
        <div className="tooltip-row">
          <span>Accuracy:</span>
          <span className={data.accuracy >= 80 ? "good" : data.accuracy >= 70 ? "med" : "low"}>
            {data.accuracy}%
          </span>
        </div>
        <div className="tooltip-row">
          <span>Samples:</span>
          <span>{data.samples}</span>
        </div>
        {data.confusedWith?.length > 0 && (
          <div className="tooltip-confused">
            <span>Often confused with:</span>
            <span>{data.confusedWith.join(", ")}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function AccuracyDashboard({ modelChoice }) {
  const [sortBy, setSortBy] = useState("accuracy"); // accuracy, letter, samples
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [selectedLetter, setSelectedLetter] = useState(null);

  // Calculate overall stats
  const stats = useMemo(() => {
    const total = LETTER_ACCURACY_DATA.length;
    const avgAccuracy = LETTER_ACCURACY_DATA.reduce((sum, d) => sum + d.accuracy, 0) / total;
    const highAccuracy = LETTER_ACCURACY_DATA.filter(d => d.accuracy >= 85).length;
    const lowAccuracy = LETTER_ACCURACY_DATA.filter(d => d.accuracy < 70).length;
    const totalSamples = LETTER_ACCURACY_DATA.reduce((sum, d) => sum + d.samples, 0);
    
    return { avgAccuracy, highAccuracy, lowAccuracy, total, totalSamples };
  }, []);

  // Sort and filter data
  const sortedData = useMemo(() => {
    let data = [...LETTER_ACCURACY_DATA].filter(d => d.accuracy >= filterThreshold);
    
    if (sortBy === "accuracy") {
      data.sort((a, b) => b.accuracy - a.accuracy);
    } else if (sortBy === "samples") {
      data.sort((a, b) => b.samples - a.samples);
    }
    
    return data;
  }, [sortBy, filterThreshold]);

  // Get problematic letters
  const problemLetters = useMemo(() => {
    return LETTER_ACCURACY_DATA
      .filter(d => d.accuracy < 75)
      .sort((a, b) => a.accuracy - b.accuracy);
  }, []);

  // Pie chart data for accuracy distribution
  const pieData = useMemo(() => [
    { name: "Excellent (>90%)", value: LETTER_ACCURACY_DATA.filter(d => d.accuracy >= 90).length, fill: "#00e5a0" },
    { name: "Good (80-90%)", value: LETTER_ACCURACY_DATA.filter(d => d.accuracy >= 80 && d.accuracy < 90).length, fill: "#4f8ef7" },
    { name: "Fair (70-80%)", value: LETTER_ACCURACY_DATA.filter(d => d.accuracy >= 70 && d.accuracy < 80).length, fill: "#ffb547" },
    { name: "Needs Work (<70%)", value: LETTER_ACCURACY_DATA.filter(d => d.accuracy < 70).length, fill: "#ff4f6d" },
  ], []);

  const getAccuracyColor = (accuracy) => {
    if (accuracy >= 90) return "#00e5a0";
    if (accuracy >= 80) return "#4f8ef7";
    if (accuracy >= 70) return "#ffb547";
    return "#ff4f6d";
  };

  return (
    <div className="accuracy-dashboard">
      {/* Overall stats cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Brain size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.avgAccuracy.toFixed(1)}%</span>
            <span className="stat-label">Average Accuracy</span>
          </div>
        </div>
        
        <div className="stat-card success">
          <div className="stat-icon">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.highAccuracy}</span>
            <span className="stat-label">High Accuracy ({">"}85%)</span>
          </div>
        </div>
        
        <div className="stat-card warning">
          <div className="stat-icon">
            <AlertTriangle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.lowAccuracy}</span>
            <span className="stat-label">Needs Improvement</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">
            <Target size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.totalSamples}</span>
            <span className="stat-label">Training Samples</span>
          </div>
        </div>
      </div>

      {/* Current model indicator */}
      <div className="model-indicator">
        <Zap size={16} />
        <span>Current Model: <strong>{modelChoice?.toUpperCase() || "RF"}</strong></span>
        <span className="model-note">(Random Forest with MediaPipe landmarks)</span>
      </div>

      {/* Accuracy bar chart */}
      <div className="section-card">
        <div className="card-label">
          LETTER-BY-LETTER ACCURACY
          <div className="sort-controls">
            <button 
              className={`sort-btn ${sortBy === "accuracy" ? "active" : ""}`}
              onClick={() => setSortBy("accuracy")}
            >
              By Accuracy
            </button>
            <button 
              className={`sort-btn ${sortBy === "samples" ? "active" : ""}`}
              onClick={() => setSortBy("samples")}
            >
              By Samples
            </button>
          </div>
        </div>
        
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedData} margin={{ top: 10, right: 10, left: -20, bottom: 60 }}>
              <XAxis 
                dataKey="arabic" 
                tick={{ fill: "#8b95b8", fontSize: 14 }}
                angle={0}
                interval={0}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fill: "#8b95b8", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="accuracy" 
                radius={[4, 4, 0, 0]}
                onClick={(data) => setSelectedLetter(data)}
              >
                {sortedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getAccuracyColor(entry.accuracy)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Accuracy distribution pie chart */}
      <div className="section-card">
        <div className="card-label">ACCURACY DISTRIBUTION</div>
        <div className="pie-container">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend">
            {pieData.map((item, idx) => (
              <div key={idx} className="legend-item">
                <span className="legend-color" style={{ background: item.fill }} />
                <span className="legend-text">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confusion matrix - problematic pairs */}
      <div className="section-card">
        <div className="card-label">
          <AlertTriangle size={14} />
          COMMONLY CONFUSED PAIRS
        </div>
        <div className="confusion-list">
          {CONFUSION_PAIRS.sort((a, b) => b.rate - a.rate).map((pair, idx) => {
            const letter1 = LETTER_ACCURACY_DATA.find(d => d.letter === pair.pair[0]);
            const letter2 = LETTER_ACCURACY_DATA.find(d => d.letter === pair.pair[1]);
            
            return (
              <div key={idx} className="confusion-item">
                <div className="confusion-pair">
                  <span className="confusion-letter">{letter1?.arabic || pair.pair[0]}</span>
                  <span className="confusion-arrow">{"<->"}</span>
                  <span className="confusion-letter">{letter2?.arabic || pair.pair[1]}</span>
                </div>
                <div className="confusion-info">
                  <div className="confusion-rate-bar">
                    <div 
                      className="confusion-rate-fill" 
                      style={{ width: `${pair.rate}%` }}
                    />
                  </div>
                  <span className="confusion-rate">{pair.rate}% confusion</span>
                </div>
                <div className="confusion-reason">{pair.reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Problem letters list */}
      {problemLetters.length > 0 && (
        <div className="section-card problem-section">
          <div className="card-label">
            <TrendingDown size={14} />
            LETTERS NEEDING IMPROVEMENT
          </div>
          <div className="problem-letters">
            {problemLetters.map((letter, idx) => (
              <div key={idx} className="problem-letter-item">
                <div className="problem-letter-main">
                  <span className="problem-arabic">{letter.arabic}</span>
                  <span className="problem-code">{letter.letter}</span>
                </div>
                <div className="problem-stats">
                  <span className="problem-accuracy" style={{ color: getAccuracyColor(letter.accuracy) }}>
                    {letter.accuracy}%
                  </span>
                  <span className="problem-confused">
                    Confused with: {letter.confusedWith.join(", ")}
                  </span>
                </div>
                <div className="problem-tip">
                  Tip: Practice this letter slowly with clear hand positioning
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ML insights */}
      <div className="section-card insights-section">
        <div className="card-label">
          <Brain size={14} />
          ML MODEL INSIGHTS
        </div>
        <div className="insights-list">
          <div className="insight-item">
            <CheckCircle2 size={16} className="insight-icon success" />
            <div className="insight-content">
              <strong>Best performing:</strong> Letters L (95%), A (94%), Y (93%) - Clear, distinct hand shapes
            </div>
          </div>
          <div className="insight-item">
            <AlertTriangle size={16} className="insight-icon warning" />
            <div className="insight-content">
              <strong>Challenging:</strong> ZZ (67%), DD (68%), THL (69%) - Similar flat/fist hand positions
            </div>
          </div>
          <div className="insight-item">
            <Target size={16} className="insight-icon info" />
            <div className="insight-content">
              <strong>Feature extraction:</strong> 63 landmarks (21 points x 3 coordinates) wrist-relative
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
