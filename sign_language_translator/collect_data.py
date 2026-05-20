"""
Hand sign data collector
Saves landmarks directly to a CSV file.
Usage: python collect_data.py
"""

import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
import os
from pathlib import Path

# ── CONFIG ─────────────────────────────────────────────────────────
OUTPUT_CSV    = "datasets 2/landmarks.csv"   # appends to existing CSV
SAMPLES_GOAL  = 300    # how many samples to collect per letter
WEAK_CLASSES  = ['gaaf', 'fa', 'ha', 'bb', 'ain', 'aleff', 'ta', 'thaa', 'toot']
CAMERA_INDEX  = 0
# ───────────────────────────────────────────────────────────────────

mp_hands = mp.solutions.hands
mp_draw  = mp.solutions.drawing_utils

def extract_landmarks(img_bgr, hands_detector):
    h, w = img_bgr.shape[:2]
    rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    res  = hands_detector.process(rgb)
    if not res.multi_hand_landmarks:
        return None, None
    hand   = res.multi_hand_landmarks[0]
    wx, wy, wz = hand.landmark[0].x, hand.landmark[0].y, hand.landmark[0].z
    lms = []
    for lm in hand.landmark:
        lms.extend([lm.x - wx, lm.y - wy, lm.z - wz])
    return lms, hand

def main():
    # Load existing CSV to know current counts
    df_existing = pd.read_csv(OUTPUT_CSV) if os.path.exists(OUTPUT_CSV) else pd.DataFrame()
    
    cap = cv2.VideoCapture(CAMERA_INDEX)
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7
    )

    feature_cols = []
    for i in range(21):
        feature_cols.extend([f'x{i}', f'y{i}', f'z{i}'])

    for cls in WEAK_CLASSES:
        # Count how many we already have
        if len(df_existing) > 0 and 'label' in df_existing.columns:
            existing = len(df_existing[df_existing['label'] == cls])
        else:
            existing = 0

        needed = max(0, SAMPLES_GOAL - existing)
        if needed == 0:
            print(f"✅ {cls} already has {existing} samples — skipping")
            continue

        print(f"\n{'='*50}")
        print(f"  Letter: {cls}  |  Have: {existing}  |  Need: {needed} more")
        print(f"  Show the '{cls}' sign to the camera")
        print(f"  Press SPACE to start collecting")
        print(f"  Press Q to skip this letter")
        print(f"{'='*50}")

        collected = []
        collecting = False
        paused    = False

        while len(collected) < needed:
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            display = frame.copy()

            lms, hand_lms = extract_landmarks(frame, hands)

            # Draw landmarks
            if hand_lms:
                mp_draw.draw_landmarks(display, hand_lms,
                                       mp_hands.HAND_CONNECTIONS)

            # UI overlay
            status_color = (0, 200, 0) if collecting else (0, 165, 255)
            cv2.rectangle(display, (0, 0), (640, 80), (20, 20, 20), -1)
            cv2.putText(display, f"Letter: {cls}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                        (255, 255, 255), 2)
            cv2.putText(display,
                        f"{'COLLECTING' if collecting else 'READY'} "
                        f"{len(collected)}/{needed}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        status_color, 2)

            # Progress bar
            if needed > 0:
                bar_w = int(600 * len(collected) / needed)
                cv2.rectangle(display, (10, 70), (610, 78), (50,50,50), -1)
                cv2.rectangle(display, (10, 70), (10 + bar_w, 78),
                              (0, 200, 0), -1)

            cv2.putText(display, "SPACE=start/pause  Q=skip",
                        (10, display.shape[0] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150,150,150), 1)

            cv2.imshow("Data Collector", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == ord('Q'):
                print(f"  Skipped {cls}")
                break
            elif key == ord(' '):
                collecting = not collecting
                print(f"  {'Started' if collecting else 'Paused'} collecting")

            # Auto-collect when space pressed
            if collecting and lms is not None:
                collected.append(lms + [cls])
                 

    # simple augmentation (noise)
                noise = np.random.normal(0, 0.005, len(lms))

                lms_noisy = (np.array(lms) + noise).tolist()

                collected.append(lms_noisy + [cls])
                cv2.waitKey(150)   # small delay so frames aren't identical

        # Save collected samples
        if collected:
            df_new = pd.DataFrame(collected, columns=feature_cols + ['label'])
            
            if os.path.exists(OUTPUT_CSV):
                df_existing = pd.read_csv(OUTPUT_CSV)
                df_combined = pd.concat([df_existing, df_new], ignore_index=True)
            else:
                df_combined = df_new
            
            df_combined.to_csv(OUTPUT_CSV, index=False)
            print(f"  ✅ Saved {len(collected)} samples for '{cls}'")
            print(f"     CSV now has {len(df_combined):,} total rows")
            df_existing = df_combined

    cap.release()
    hands.close()
    cv2.destroyAllWindows()

    print("\n" + "="*50)
    print("  DATA COLLECTION COMPLETE")
    print("="*50)
    df_final = pd.read_csv(OUTPUT_CSV)
    print(f"  Total rows   : {len(df_final):,}")
    print(f"  Classes      : {df_final['label'].nunique()}")
    print("\n  Now re-run notebook 03 to retrain with new data!")

if __name__ == "__main__":
    main()