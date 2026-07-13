from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'public' / 'brand'
BRAND.mkdir(parents=True, exist_ok=True)

RED_1 = (213, 87, 87, 255)
RED_2 = (165, 47, 47, 255)
CHARCOAL = (35, 37, 43, 255)
WHITE = (255, 255, 255, 255)


def _font(size: int, bold: bool = False):
    candidates = [
        'C:/Windows/Fonts/Inter-SemiBold.ttf' if bold else 'C:/Windows/Fonts/Inter-Regular.ttf',
        'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def draw_drop(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0):
    # Teardrop polygon approximation
    pts = [
        (x + int(40 * scale), y + int(5 * scale)),
        (x + int(12 * scale), y + int(38 * scale)),
        (x + int(0 * scale), y + int(70 * scale)),
        (x + int(8 * scale), y + int(106 * scale)),
        (x + int(40 * scale), y + int(128 * scale)),
        (x + int(72 * scale), y + int(106 * scale)),
        (x + int(80 * scale), y + int(70 * scale)),
        (x + int(68 * scale), y + int(38 * scale)),
    ]
    # gradient approximation via layered polygons
    for i in range(12):
        t = i / 11
        color = (
            int(RED_1[0] * (1 - t) + RED_2[0] * t),
            int(RED_1[1] * (1 - t) + RED_2[1] * t),
            int(RED_1[2] * (1 - t) + RED_2[2] * t),
            255,
        )
        inset = int(i * 1.2 * scale)
        p2 = [
            (px + (1 if px > x + int(40 * scale) else -1) * inset, py + inset // 2)
            for px, py in pts
        ]
        draw.polygon(p2, fill=color)

    # flow lines
    draw.arc((x + int(18 * scale), y + int(38 * scale), x + int(62 * scale), y + int(72 * scale)), 200, 340, fill=WHITE, width=max(2, int(6 * scale)))
    draw.arc((x + int(14 * scale), y + int(56 * scale), x + int(66 * scale), y + int(90 * scale)), 200, 340, fill=WHITE, width=max(2, int(5 * scale)))
    draw.arc((x + int(12 * scale), y + int(72 * scale), x + int(68 * scale), y + int(106 * scale)), 200, 340, fill=WHITE, width=max(2, int(4 * scale)))

    # connected nodes
    r = max(2, int(5 * scale))
    draw.ellipse((x + int(15 * scale) - r, y + int(72 * scale) - r, x + int(15 * scale) + r, y + int(72 * scale) + r), fill=CHARCOAL)
    draw.ellipse((x + int(65 * scale) - r, y + int(72 * scale) - r, x + int(65 * scale) + r, y + int(72 * scale) + r), fill=CHARCOAL)


def save_icon():
    img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_drop(draw, 272, 180, 6.0)
    img.save(BRAND / 'fluid-icon.png')


def save_wordmark():
    img = Image.new('RGBA', (1400, 400), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((90, 130), 'FLUID', fill=CHARCOAL, font=_font(220, bold=True))
    img.save(BRAND / 'fluid-wordmark.png')


def save_horizontal():
    img = Image.new('RGBA', (1600, 480), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_drop(draw, 70, 90, 2.2)
    draw.text((300, 180), 'FLUID', fill=CHARCOAL, font=_font(210, bold=True))
    img.save(BRAND / 'fluid-horizontal.png')


def save_stacked():
    img = Image.new('RGBA', (1100, 1200), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_drop(draw, 390, 180, 3.2)
    draw.text((280, 760), 'FLUID', fill=CHARCOAL, font=_font(210, bold=True))
    img.save(BRAND / 'fluid-stacked.png')


def save_favicon():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_drop(draw, 0, 0, 0.8)
    img.save(BRAND / 'fluid-favicon.png')


if __name__ == '__main__':
    save_icon()
    save_wordmark()
    save_horizontal()
    save_stacked()
    save_favicon()
    print('Brand PNG exports generated in', BRAND)
