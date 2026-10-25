#!/usr/bin/env python3
"""
Draws the sample people's profile photos: the kind of picture people actually use, a sunset over
the sea, golden hour on the dunes, city lights, a dog on the beach. Everything is painted here
from gradients, polygons and blur, so there is nothing to license. Deterministic, so re-running
it gives the same files.

    python3 scripts/avatars/make.py        # writes scripts/avatars/<username>.jpg

Needs Pillow (pip install pillow). The seed encrypts each file with that person's profile key.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).parent
S = 768  # painted at 768, saved at 384 for smooth edges
FINAL = 384


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(stops, size=S):
    """Vertical gradient from a list of (position 0..1, colour)."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                d.line([(0, y), (size, y)], fill=lerp(c0, c1, (t - p0) / max(p1 - p0, 1e-6)))
                break
    return img


def glow(img, centre, radius, colour, strength=1.0):
    """Soft radial light added on top of `img`."""
    layer = Image.new("RGB", img.size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 24
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = (1 - i / steps) ** 1.6 * strength
        d.ellipse([centre[0] - r, centre[1] - r, centre[0] + r, centre[1] + r], fill=tuple(int(c * a) for c in colour))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.25))
    return Image.blend(img, Image.eval(Image.blend(img, layer, 0.5), lambda v: v), 0) if False else screen(img, layer)


def screen(a, b):
    """Screen blend: lightens `a` by `b`."""
    from PIL import ImageChops

    return ImageChops.screen(a, b)


def ridge(img, base_y, amp, colour, rng, roughness=6, fog=None):
    """A mountain or tree line: jagged polygon from the given height down to the bottom."""
    pts = []
    y = base_y
    x = 0
    while x <= S:
        pts.append((x, y))
        x += rng.randint(14, 40)
        y += rng.uniform(-amp, amp) * (1 if rng.random() < 0.5 else 0.4)
        y = max(base_y - amp * roughness, min(base_y + amp * roughness, y))
    pts += [(S, S), (0, S)]
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(pts, fill=colour + (255,))
    if fog:
        layer = Image.alpha_composite(layer, fog)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def haze(colour, alpha_top, alpha_bottom, size=S):
    """Atmospheric fog: a vertical alpha gradient of one colour."""
    layer = Image.new("RGBA", (size, size), colour + (0,))
    d = ImageDraw.Draw(layer)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=colour + (int(alpha_top + (alpha_bottom - alpha_top) * t),))
    return layer


def bokeh(img, rng, n, colours, rmin, rmax, blur, y_range=(0, 1)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        r = rng.uniform(rmin, rmax)
        x = rng.uniform(-r, S + r)
        y = rng.uniform(y_range[0] * S, y_range[1] * S)
        c = rng.choice(colours)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (rng.randint(90, 200),))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def stars(img, rng, n, y_max=0.75):
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y = rng.uniform(0, S), rng.uniform(0, S * y_max)
        b = rng.randint(120, 255)
        r = rng.choice([0.6, 0.8, 1.0, 1.4, 1.8])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 20)))
    return img


def reflection(img, horizon):
    """Mirror the sky below `horizon` into water, darkened and rippled."""
    sky = img.crop((0, 0, S, horizon)).transpose(Image.FLIP_TOP_BOTTOM)
    sky = sky.resize((S, S - horizon)).filter(ImageFilter.GaussianBlur(2))
    dark = Image.new("RGB", sky.size, (10, 20, 40))
    sky = Image.blend(sky, dark, 0.35)
    out = img.copy()
    out.paste(sky, (0, horizon))
    d = ImageDraw.Draw(out)
    rng = random.Random(7)
    for y in range(horizon, S, 6):
        for _ in range(3):
            x = rng.uniform(0, S)
            w = rng.uniform(20, 120)
            d.line([(x, y), (x + w, y)], fill=lerp(out.getpixel((int(min(S - 1, x)), y)), (255, 255, 255), 0.18), width=1)
    return out


def finish(img, name, vignette=0.35):
    """Vignette, resize, save as a small JPEG."""
    v = Image.new("L", (S, S), 0)
    ImageDraw.Draw(v).ellipse([-S * 0.15, -S * 0.15, S * 1.15, S * 1.15], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(S * 0.18))
    dark = Image.new("RGB", (S, S), (0, 0, 0))
    img = Image.composite(img, Image.blend(img, dark, vignette), v)
    img = img.resize((FINAL, FINAL), Image.LANCZOS)
    path = OUT / f"{name}.jpg"
    img.save(path, "JPEG", quality=80, optimize=True, progressive=True)
    print(f"{path.name:12} {path.stat().st_size // 1024:3d} KB")


# --- the pictures -------------------------------------------------------------------------------


def golden_hour_sea():  # ilyas: sun low over a calm sea
    img = gradient([(0, (28, 36, 80)), (0.35, (214, 92, 64)), (0.55, (250, 180, 90)), (0.58, (255, 214, 140)), (1, (255, 214, 140))])
    horizon = int(S * 0.58)
    img = glow(img, (S * 0.5, S * 0.56), S * 0.45, (255, 150, 60), 0.9)
    ImageDraw.Draw(img).ellipse([S * 0.44, S * 0.50, S * 0.56, S * 0.62], fill=(255, 240, 200))
    img = reflection(img, horizon)
    return img


def city_lights():  # jake: city at night, out of focus
    rng = random.Random(2)
    img = gradient([(0, (8, 10, 30)), (0.6, (30, 20, 60)), (1, (70, 40, 60))])
    img = bokeh(img, rng, 120, [(255, 200, 90), (255, 240, 200), (255, 120, 80), (120, 180, 255), (255, 80, 160)], 6, 22, 7, (0.35, 1))
    img = bokeh(img, rng, 20, [(255, 220, 120), (255, 255, 230)], 20, 40, 14, (0.5, 1))
    return img


def mountain_sunrise():  # priya: ridges at first light
    rng = random.Random(3)
    img = gradient([(0, (60, 40, 110)), (0.4, (240, 120, 120)), (0.62, (255, 200, 150)), (1, (255, 200, 150))])
    img = glow(img, (S * 0.6, S * 0.6), S * 0.4, (255, 170, 110), 0.8)
    cols = [(150, 100, 140), (105, 70, 115), (70, 45, 90), (40, 28, 60)]
    for i, c in enumerate(cols):
        img = ridge(img, int(S * (0.52 + i * 0.1)), 26 - i * 3, c, rng, roughness=5)
    return img


def ocean_wave():  # sam: deep blue water and a line of foam
    rng = random.Random(4)
    img = gradient([(0, (190, 220, 235)), (0.3, (40, 120, 170)), (0.7, (10, 60, 120)), (1, (5, 30, 70))])
    foam = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(foam)
    for i in range(14):
        y = S * 0.40 + i * 9
        pts = [(x, y + 14 * math.sin(x / 110 + i * 0.7)) for x in range(0, S + 1, 8)]
        d.line(pts, fill=(235, 248, 255, 160 - i * 9), width=3)
    foam = foam.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img.convert("RGBA"), foam).convert("RGB")
    img = bokeh(img, rng, 200, [(255, 255, 255)], 1, 3, 0.8, (0.38, 0.6))
    return img


def blossom():  # maya: pink petals against a bright sky
    rng = random.Random(5)
    img = gradient([(0, (200, 225, 250)), (1, (250, 220, 235))])
    img = bokeh(img, rng, 60, [(255, 170, 200), (250, 130, 175), (255, 210, 225)], 30, 70, 26)
    img = bokeh(img, rng, 140, [(255, 150, 190), (250, 120, 170), (255, 200, 220), (235, 90, 140)], 5, 14, 1.2)
    return img


def dunes():  # omar: desert at golden hour
    rng = random.Random(6)
    img = gradient([(0, (255, 200, 130)), (0.4, (255, 150, 90)), (0.5, (230, 120, 70)), (1, (230, 120, 70))])
    img = glow(img, (S * 0.3, S * 0.45), S * 0.4, (255, 200, 120), 0.8)
    for i, c in enumerate([(220, 140, 80), (190, 105, 60), (150, 75, 45), (105, 50, 35)]):
        img = ridge(img, int(S * (0.5 + i * 0.12)), 18, c, rng, roughness=3)
    return img.filter(ImageFilter.GaussianBlur(0.8))


def lavender():  # chloe: a lavender field at dusk
    rng = random.Random(8)
    img = gradient([(0, (250, 200, 170)), (0.45, (210, 160, 190)), (0.5, (120, 80, 160)), (1, (60, 35, 110))])
    for i, c in enumerate([(140, 95, 185), (115, 75, 165), (90, 55, 140)]):
        img = ridge(img, int(S * (0.55 + i * 0.13)), 6, c, rng, roughness=2)
    img = bokeh(img, rng, 300, [(170, 120, 220), (200, 150, 240), (120, 80, 180)], 3, 9, 1.5, (0.5, 1))
    return img


def milky_way():  # aisha: a clear night
    rng = random.Random(9)
    img = gradient([(0, (6, 8, 25)), (0.6, (18, 22, 55)), (1, (40, 30, 70))])
    band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    for i in range(60):
        x, y = rng.uniform(0, S), S * 0.5 - (rng.uniform(0, S) - S * 0.5) * 0.9 + rng.gauss(0, 60)
        r = rng.uniform(20, 70)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(150, 130, 220, 20))
    band = band.rotate(35).filter(ImageFilter.GaussianBlur(30))
    img = Image.alpha_composite(img.convert("RGBA"), band).convert("RGB")
    img = stars(img, rng, 900, 1)
    img = ridge(img, int(S * 0.86), 10, (10, 12, 22), rng, roughness=3)
    return img


def aurora():  # leo: northern lights over snow
    rng = random.Random(10)
    img = gradient([(0, (5, 12, 30)), (1, (15, 40, 70))])
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(0, S, 4):
        top = S * 0.15 + 80 * math.sin(x / 140) + 40 * math.sin(x / 47)
        d.line([(x, top), (x, top + 260)], fill=(70, 230, 160, 110), width=4)
        d.line([(x, top - 60), (x, top + 40)], fill=(170, 90, 220, 70), width=4)
    layer = layer.filter(ImageFilter.GaussianBlur(22))
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    img = stars(img, rng, 250, 0.6)
    img = ridge(img, int(S * 0.72), 30, (225, 235, 245), rng, roughness=4)
    img = ridge(img, int(S * 0.84), 12, (180, 200, 220), rng, roughness=2)
    return img


def palm_sunset():  # dan: holiday, palm against the sunset
    rng = random.Random(11)
    img = gradient([(0, (90, 30, 90)), (0.45, (240, 90, 80)), (0.7, (255, 190, 90)), (1, (255, 220, 150))])
    img = glow(img, (S * 0.55, S * 0.66), S * 0.4, (255, 160, 80), 0.9)
    ImageDraw.Draw(img).ellipse([S * 0.47, S * 0.58, S * 0.63, S * 0.74], fill=(255, 235, 190))
    img = ridge(img, int(S * 0.78), 4, (30, 15, 35), rng, roughness=1)
    d = ImageDraw.Draw(img)
    base = (S * 0.22, S * 0.8)
    pts = [(base[0] + 10 * math.sin(t / 30), base[1] - t) for t in range(0, int(S * 0.52), 6)]
    d.line(pts, fill=(30, 15, 35), width=9)
    top = pts[-1]
    for a in range(0, 360, 36):
        rad = math.radians(a - 90)
        fr = [(top[0] + math.cos(rad) * r + math.sin(rad) * r * r / 500, top[1] + math.sin(rad) * r * 0.75 + r * r / 320) for r in range(0, 150, 10)]
        d.line(fr, fill=(30, 15, 35), width=6)
    return img


def forest_fog():  # tom: misty pines
    rng = random.Random(12)
    img = gradient([(0, (200, 215, 215)), (1, (120, 150, 145))])
    fog = haze((210, 225, 225), 160, 20)
    for i, c in enumerate([(100, 130, 120), (70, 100, 90), (45, 70, 60), (25, 45, 38)]):
        img = ridge(img, int(S * (0.45 + i * 0.13)), 30, c, rng, roughness=3, fog=fog if i < 3 else None)
    return img


def abstract_mesh():  # zara: soft colour mesh
    rng = random.Random(13)
    img = Image.new("RGB", (S, S), (250, 130, 170))
    img = bokeh(img, rng, 14, [(255, 150, 80), (160, 90, 230), (255, 90, 140), (90, 160, 255), (255, 200, 90)], 150, 320, 80)
    return img


def tulips():  # mum: a bright field of tulips
    rng = random.Random(14)
    img = gradient([(0, (170, 210, 245)), (0.5, (230, 240, 250)), (0.55, (90, 150, 70)), (1, (40, 90, 40))])
    img = glow(img, (S * 0.7, S * 0.2), S * 0.3, (255, 240, 200), 0.6)
    img = bokeh(img, rng, 260, [(240, 60, 70), (255, 120, 60), (255, 200, 60), (250, 90, 150)], 6, 22, 1.5, (0.56, 1))
    return img


def lake_reflection():  # dad: still lake, blue hour
    rng = random.Random(15)
    img = gradient([(0, (40, 60, 110)), (0.4, (120, 150, 200)), (0.52, (220, 200, 190)), (1, (220, 200, 190))])
    horizon = int(S * 0.56)
    img = ridge(img, int(S * 0.44), 40, (60, 70, 110), rng, roughness=3)
    img = ridge(img, horizon, 10, (35, 40, 70), rng, roughness=1)
    img = reflection(img, horizon)
    return img


def dog_beach():  # yasmin: her dog on the beach at sunset
    rng = random.Random(16)
    img = gradient([(0, (255, 180, 110)), (0.5, (255, 130, 90)), (0.62, (255, 200, 150)), (0.64, (220, 190, 150)), (1, (190, 160, 120))])
    img = glow(img, (S * 0.8, S * 0.58), S * 0.45, (255, 170, 90), 0.9)
    d = ImageDraw.Draw(img)
    d.ellipse([S * 0.72, S * 0.50, S * 0.88, S * 0.66], fill=(255, 240, 210))
    d.rectangle([0, S * 0.62, S, S * 0.66], fill=(230, 200, 170))
    dark = (40, 22, 18)
    # body, legs, tail, head, ear, snout
    d.ellipse([S * 0.30, S * 0.60, S * 0.56, S * 0.72], fill=dark)
    for x in (0.33, 0.38, 0.48, 0.53):
        d.rectangle([S * x, S * 0.68, S * (x + 0.03), S * 0.80], fill=dark)
    d.line([(S * 0.31, S * 0.63), (S * 0.24, S * 0.52)], fill=dark, width=14)
    d.ellipse([S * 0.52, S * 0.51, S * 0.63, S * 0.62], fill=dark)
    d.polygon([(S * 0.53, S * 0.54), (S * 0.535, S * 0.465), (S * 0.575, S * 0.52)], fill=dark)
    d.line([(S * 0.31, S * 0.63), (S * 0.26, S * 0.55), (S * 0.27, S * 0.50)], fill=dark, width=12, joint="curve")
    d.ellipse([S * 0.61, S * 0.55, S * 0.69, S * 0.61], fill=dark)
    d.ellipse([S * 0.0, S * 0.78, S * 1.0, S * 0.84], fill=(255, 235, 215))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def rooftop_dusk():  # nadia: Camden rooftops at dusk, string lights
    rng = random.Random(17)
    img = gradient([(0, (60, 40, 110)), (0.45, (220, 110, 120)), (0.6, (255, 170, 110)), (1, (40, 30, 50))])
    img = glow(img, (S * 0.35, S * 0.58), S * 0.4, (255, 150, 100), 0.8)
    img = ridge(img, int(S * 0.62), 26, (35, 25, 45), rng, roughness=2)
    img = bokeh(img, rng, 90, [(255, 220, 150), (255, 200, 120), (255, 240, 200)], 3, 9, 1.2, (0.3, 0.75))
    return img


def snowy_peak():  # zayn: the Peak District in snow, clear sky
    rng = random.Random(18)
    img = gradient([(0, (70, 120, 200)), (0.5, (170, 205, 240)), (0.62, (245, 248, 252)), (1, (210, 220, 235))])
    img = ridge(img, int(S * 0.5), 70, (235, 240, 250), rng, roughness=4)
    img = ridge(img, int(S * 0.66), 30, (120, 140, 170), rng, roughness=2)
    img = glow(img, (S * 0.78, S * 0.18), S * 0.3, (255, 250, 230), 0.6)
    return img


def harbour_night():  # aariz: a harbour at night, lights on the water
    rng = random.Random(19)
    img = gradient([(0, (15, 20, 50)), (0.5, (40, 50, 110)), (0.58, (90, 70, 120)), (1, (10, 15, 35))])
    img = ridge(img, int(S * 0.56), 18, (20, 22, 40), rng, roughness=3)
    img = bokeh(img, rng, 70, [(255, 210, 140), (140, 200, 255), (255, 160, 120)], 3, 8, 1.0, (0.42, 0.56))
    img = reflection(img, int(S * 0.58))
    return img


def autumn_park():  # durukan: autumn trees, low sun
    rng = random.Random(20)
    img = gradient([(0, (250, 200, 140)), (0.45, (240, 150, 80)), (0.7, (170, 80, 40)), (1, (70, 35, 20))])
    img = glow(img, (S * 0.3, S * 0.4), S * 0.35, (255, 220, 150), 0.8)
    img = bokeh(img, rng, 120, [(230, 120, 40), (200, 70, 30), (250, 180, 60)], 6, 18, 2.0, (0.05, 0.75))
    return img


def green_pitch():  # barkin: a floodlit football pitch at dusk
    rng = random.Random(21)
    img = gradient([(0, (30, 40, 80)), (0.45, (90, 110, 160)), (0.55, (60, 140, 70)), (1, (25, 90, 40))])
    img = glow(img, (S * 0.15, S * 0.25), S * 0.25, (255, 255, 220), 0.9)
    img = glow(img, (S * 0.85, S * 0.25), S * 0.25, (255, 255, 220), 0.9)
    d = ImageDraw.Draw(img)
    d.line([(0, S * 0.75), (S, S * 0.75)], fill=(220, 240, 220), width=4)
    d.ellipse([S * 0.35, S * 0.68, S * 0.65, S * 0.82], outline=(220, 240, 220), width=4)
    return img


PICTURES = {
    "ilyas": golden_hour_sea,
    "jake": city_lights,
    "priya": mountain_sunrise,
    "sam": ocean_wave,
    "maya": blossom,
    "omar": dunes,
    "chloe": lavender,
    "aisha": milky_way,
    "leo": aurora,
    "dan": palm_sunset,
    "tom": forest_fog,
    "zara": abstract_mesh,
    "mum": tulips,
    "dad": lake_reflection,
    "yasmin": dog_beach,
    "nadia": rooftop_dusk,
    "zayn": snowy_peak,
    "aariz": harbour_night,
    "durukan": autumn_park,
    "barkin": green_pitch,
}

if __name__ == "__main__":
    only = set(sys.argv[1:])
    for name, draw in PICTURES.items():
        if only and name not in only:
            continue
        finish(draw(), name)
