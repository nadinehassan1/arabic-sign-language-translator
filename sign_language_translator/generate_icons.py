"""
Run this once to generate the PWA icons.
Place output icons in: sign_language_translator/frontend/public/

Run:
    pip install Pillow
    python generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size, path):
    # Dark blue background
    img  = Image.new("RGBA", (size, size), (8, 12, 20, 255))
    draw = ImageDraw.Draw(img)

    # Gradient circle background
    cx, cy = size // 2, size // 2
    r      = int(size * 0.42)
    for i in range(r, 0, -1):
        ratio = i / r
        blue  = int(79  + (124 - 79)  * (1 - ratio))
        green = int(142 + (77  - 142) * (1 - ratio))
        red_c = int(247 + (255 - 247) * (1 - ratio))
        alpha = int(180 * (1 - ratio * 0.3))
        draw.ellipse([cx-i, cy-i, cx+i, cy+i],
                     fill=(blue, green, red_c, alpha))

    # Hand emoji as text
    emoji_size = int(size * 0.55)
    try:
        font = ImageFont.truetype("seguiemj.ttf", emoji_size)
    except Exception:
        font = ImageFont.load_default()

    emoji = "🤟"
    try:
        bbox = draw.textbbox((0, 0), emoji, font=font)
        tw   = bbox[2] - bbox[0]
        th   = bbox[3] - bbox[1]
        draw.text((cx - tw//2, cy - th//2 - size//12), emoji, font=font)
    except Exception:
        # Fallback: draw simple hand shape
        draw.ellipse([cx-r//2, cy-r//2, cx+r//2, cy+r//2],
                     fill=(79, 142, 247, 220))

    img.save(path, "PNG")
    print(f"✅ Saved {path} ({size}x{size})")

os.makedirs("icons_output", exist_ok=True)
make_icon(192, "icons_output/icon-192.png")
make_icon(512, "icons_output/icon-512.png")
print("\nCopy icons_output/ contents → frontend/public/")
