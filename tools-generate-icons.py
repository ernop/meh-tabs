from PIL import Image, ImageDraw, ImageFont
import math, os

OUT_DIR = "icons"
os.makedirs(OUT_DIR, exist_ok=True)

BLUE = (35, 110, 255, 255)
GREEN = (46, 170, 90, 255)
GREEN_DARK = (28, 120, 65, 255)
BG = (0, 0, 0, 0)

FONT_PATHS = [
    r"C:\\Windows\\Fonts\\segoeuib.ttf",  # Segoe UI Bold
    r"C:\\Windows\\Fonts\\arialbd.ttf",
    r"C:\\Windows\\Fonts\\segoeui.ttf",
]

font_path = None
for p in FONT_PATHS:
    if os.path.exists(p):
        font_path = p
        break

if font_path is None:
    raise SystemExit("Could not find a system font to render the T")


def make_icon(size: int, out_path: str):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Subtle light disk behind the letter
    disk_r = int(size * 0.38)
    cx = cy = size // 2
    draw.ellipse([cx - disk_r, cy - disk_r, cx + disk_r, cy + disk_r], fill=(245, 250, 246, 255))

    # Vine border: slightly wavy circle
    cx_f = cy_f = size / 2
    r_outer = size * 0.46
    r_inner = size * 0.39
    points = []
    for i in range(360):
        a = math.radians(i)
        wobble = math.sin(a * 6) * (size * 0.006) + math.sin(a * 11) * (size * 0.003)
        r = (r_inner + r_outer) / 2 + wobble
        x = cx_f + math.cos(a) * r
        y = cy_f + math.sin(a) * r
        points.append((x, y))

    draw.line(points + [points[0]], fill=GREEN_DARK, width=max(2, size // 22), joint="curve")
    draw.line(points + [points[0]], fill=GREEN, width=max(1, size // 30), joint="curve")

    # Leaves around the border
    leaf_count = 10
    for k in range(leaf_count):
        a = math.radians((360 / leaf_count) * k + 18)
        r = r_outer - size * 0.05
        x = cx_f + math.cos(a) * r
        y = cy_f + math.sin(a) * r

        leaf_w = size * 0.08
        leaf_h = size * 0.045
        leaf = Image.new("RGBA", (int(leaf_w * 2), int(leaf_h * 2)), BG)
        ld = ImageDraw.Draw(leaf)

        bbox = [
            leaf.size[0] * 0.2,
            leaf.size[1] * 0.35,
            leaf.size[0] * 0.8,
            leaf.size[1] * 0.65,
        ]
        ld.ellipse(bbox, fill=(60, 200, 105, 255))
        ld.line(
            [(leaf.size[0] * 0.25, leaf.size[1] * 0.5), (leaf.size[0] * 0.75, leaf.size[1] * 0.5)],
            fill=(32, 140, 78, 255),
            width=max(1, size // 96),
        )

        angle = math.degrees(a) + 90
        leaf = leaf.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        img.alpha_composite(leaf, (int(x - leaf.size[0] / 2), int(y - leaf.size[1] / 2)))

    # Big blue T
    font_size = int(size * 0.62)
    font = ImageFont.truetype(font_path, font_size)
    text = "T"

    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) / 2
    ty = (size - th) / 2 - size * 0.03

    # Slight shadow for readability
    draw.text((tx + size * 0.015, ty + size * 0.015), text, font=font, fill=(10, 40, 120, 90))
    draw.text((tx, ty), text, font=font, fill=BLUE)

    img.save(out_path)


for s in (32, 48, 96, 128):
    make_icon(s, os.path.join(OUT_DIR, f"icon-{s}.png"))

print("Wrote icons:", ", ".join(sorted(os.listdir(OUT_DIR))))