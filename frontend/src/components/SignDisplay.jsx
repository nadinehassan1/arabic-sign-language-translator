import { useState } from "react";

// Arabic letter → image filename mapping
const ARABIC_TO_IMG = {
  'ا': 'alif', 'أ': 'alif', 'إ': 'alif', 'آ': 'alif',
  'ب': 'ba',
  'ت': 'ta',
  'ث': 'thaa',
  'ج': 'jim',
  'ح': 'ha',
  'خ': 'khaa',
  'د': 'dal',
  'ذ': 'thal',
  'ر': 'ra',
  'ز': 'zay',
  'س': 'seen',
  'ش': 'sheen',
  'ص': 'saad',
  'ض': 'dad',
  'ط': 'toot',
  'ظ': 'yaa',
  'ع': 'ain',
  'غ': 'ghain',
  'ف': 'fa',
  'ق': 'qaaf',
  'ك': 'kaaf',
  'ل': 'laam',
  'لا': 'la',
  'م': 'meem',
  'ن': 'nun',
  'ه': 'haa',
  'و': 'waw',
  'ي': 'ya', 'ى': 'ya',
  'ال': 'al',
};

// Split Arabic text into displayable tokens (handles لا و ال)
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  let i = 0;
  const chars = [...text]; // handle Unicode correctly
  while (i < chars.length) {
    // Skip spaces — show as gap
    if (chars[i] === ' ') {
      tokens.push({ type: 'space' });
      i++;
      continue;
    }
    // Check 2-char combos: لا
    if (i + 1 < chars.length && chars[i] + chars[i + 1] === 'لا') {
      tokens.push({ type: 'letter', char: 'لا', img: 'la' });
      i += 2;
      continue;
    }
    const char = chars[i];
    const img = ARABIC_TO_IMG[char];
    if (img) {
      tokens.push({ type: 'letter', char, img });
    } else if (char.trim()) {
      // Unknown Arabic letter — show char, no image
      tokens.push({ type: 'unknown', char });
    }
    i++;
  }
  return tokens;
}

export default function SignDisplay({ text }) {
  const [failedImgs, setFailedImgs] = useState({});
  const tokens = tokenize(text);

  if (!text?.trim()) return null;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '14px 16px',
    }}>
      {/* Header */}
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        fontFamily: "'JetBrains Mono', monospace",
        marginBottom: 12,
      }}>
        إشارات الكلمة · SIGN DISPLAY
      </div>

      {/* Text */}
      <div style={{
        fontSize: 22,
        fontFamily: "'Tajawal', sans-serif",
        fontWeight: 700,
        color: 'var(--text)',
        direction: 'rtl',
        marginBottom: 14,
        lineHeight: 1.5,
      }}>
        {text}
      </div>

      {/* Signs row */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        direction: 'rtl',
        alignItems: 'flex-end',
      }}>
        {tokens.map((token, i) => {
          if (token.type === 'space') {
            return (
              <div key={i} style={{
                width: 24,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: 1,
                  height: 40,
                  background: 'var(--border)',
                  borderRadius: 1,
                }} />
              </div>
            );
          }

          if (token.type === 'unknown') {
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}>
                <div style={{
                  width: 72,
                  height: 72,
                  background: 'var(--bg3)',
                  border: '1px dashed var(--border)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontFamily: "'Tajawal', sans-serif",
                  color: 'var(--text3)',
                }}>
                  {token.char}
                </div>
                <span style={{
                  fontSize: 18,
                  fontFamily: "'Tajawal', sans-serif",
                  fontWeight: 700,
                  color: 'var(--text2)',
                }}>
                  {token.char}
                </span>
              </div>
            );
          }

          const failed = failedImgs[token.img];
          return (
            <div key={i} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              {failed ? (
                <div style={{
                  width: 72,
                  height: 72,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontFamily: "'Tajawal', sans-serif",
                  color: 'var(--text3)',
                }}>
                  {token.char}
                </div>
              ) : (
                <img
                  src={`/letter_images/${token.img}.jpg`}
                  alt={token.char}
                  onError={() => setFailedImgs(f => ({ ...f, [token.img]: true }))}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '2px solid var(--border)',
                    background: 'var(--bg3)',
                    display: 'block',
                  }}
                />
              )}
              <span style={{
                fontSize: 18,
                fontFamily: "'Tajawal', sans-serif",
                fontWeight: 700,
                color: 'var(--text2)',
              }}>
                {token.char}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
