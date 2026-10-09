#!/usr/bin/env python3
"""Generates the Nonstandard Notes icons from one geometry.

Run from anywhere:  python3 branding/build_icons.py      (Python 3.8+, Pillow 9.1+)

Writes (paths relative to the repository root):
  Android launcher icon (adaptive layers, vector drawables)
    packages/mobile/android/app/src/main/res/drawable/ic_launcher_background.xml
    packages/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml
    packages/mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml   (themed icon, Android 13+)
  Web favicons (rendered with Pillow)
    packages/web/src/favicon/{android-chrome-192x192,android-chrome-512x512,apple-touch-icon,
                              favicon-16x16,favicon-32x32,mstile-150x150}.png, favicon.ico
  Previews
    branding/icon.svg, branding/icon-monochrome.svg

Inputs: branding/nsn-text.svg ("NSN" outlines) and the colour resources
packages/mobile/android/app/src/main/res/values/ic_launcher_colors.xml (colours are edited there,
not here; the dev flavor overrides header and text in src/dev/res/values/ic_launcher_colors.xml).
"""
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'packages/mobile/android/app/src'
FAVICON = ROOT / 'packages/web/src/favicon'
BRANDING = ROOT / 'branding'
SQ3 = math.sqrt(3)

# ---- Geometry (launcher-icon units: 108 x 108, the adaptive-icon canvas) -------------------------
# Background: the stock card (white rounded card with a coloured header).
CX, CY, CW, CH, R, HEADER_BOTTOM = 16.8, 16.8, 74.4, 74.4, 6.0, 39.5
# Foreground: "NSN" (nsn-text.svg) and three lines drawn as 30-degree hatch dashes in two greys.
LINES = [(29.9375, 49.625, 48.125, 4.375), (29.9375, 59.5, 48.125, 4.375), (29.9375, 69.375, 48.125, 4.375)]
STRIPE, PERIOD, MIN_DASH = 2.0, 4.0, 0.95
TEXT_DX, TEXT_DY = 5.0, 0.0   # shift of "NSN" from its position in nsn-text.svg
SECONDARY = 2.0               # width of the lighter dashes in each gap (gap = PERIOD - STRIPE)

# Themed (monochrome) layer: the same drawing, scaled to the stock themed icon's card size, with the
# card as an outline. The system tints it and uses only its alpha channel.
MONO_CARD = 40.0              # card width in the themed layer (stock: 40)
MONO_OUTLINE = 2.5            # outline width in the themed layer (stock: about 2.5)
MONO_TEXT_ALPHA = 0.7         # "NSN" is the header lightened 30%: header 1.0, text 0.7
MONO_SECONDARY_ALPHA = 0.5    # lighter dashes: #DFDFDF has half the ink of #BFBFBF on white

# Favicons: (file, size, framing). 'card' = cropped to the card (transparent corners, like stock);
# 'tile' = card of 126 px at (72, 50) on 270 x 270 (stock mstile placement).
FAVICONS = [('android-chrome-192x192.png', 192, 'card'), ('android-chrome-512x512.png', 512, 'card'),
            ('apple-touch-icon.png', 180, 'card'), ('favicon-16x16.png', 16, 'card'),
            ('favicon-32x32.png', 32, 'card'), ('mstile-150x150.png', 270, 'tile')]
ICO_SIZES = [16, 32, 48]
SIMPLE_MAX = 48   # at this size or below: no "NSN", lines solid (mean of the two greys)


# ---- SVG path handling ------------------------------------------------------------------------------
TOKEN = re.compile(r'[MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
NARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'Z': 0}


def parse_path(d, dx=0.0, dy=0.0):
    """SVG path (no arcs) -> list of subpaths of absolute segments ('M'|'L'|'C'|'Q', points), shifted."""
    toks = TOKEN.findall(d)
    i, cmd, x, y, sx, sy = 0, None, 0.0, 0.0, 0.0, 0.0
    last_c = last_q = None
    subs, cur = [], None
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                if cur: cur.append(('Z', []))
                x, y = sx, sy; last_c = last_q = None
                continue
        if cmd is None:
            raise ValueError('path data must start with a command')
        up, rel = cmd.upper(), cmd.islower()
        a = [float(t) for t in toks[i:i + NARGS[up]]]; i += NARGS[up]
        if up == 'H':
            pts = [(a[0] + (x if rel else 0), y)]; up = 'L'
        elif up == 'V':
            pts = [(x, a[0] + (y if rel else 0))]; up = 'L'
        else:
            pts = [(a[k] + (x if rel else 0), a[k + 1] + (y if rel else 0)) for k in range(0, len(a), 2)]
        if up == 'S':
            c1 = (2 * x - last_c[0], 2 * y - last_c[1]) if last_c else (x, y)
            pts = [c1] + pts; up = 'C'
        elif up == 'T':
            q = (2 * x - last_q[0], 2 * y - last_q[1]) if last_q else (x, y)
            pts = [q] + pts; up = 'Q'
        if up == 'M':
            cur = [('M', pts)]; subs.append(cur); sx, sy = pts[0]
            cmd = 'l' if rel else 'L'   # further pairs after M are line-tos
        else:
            if cur is None:
                cur = [('M', [(x, y)])]; subs.append(cur)
            cur.append((up, pts))
        last_c = pts[-2] if up == 'C' else None
        last_q = pts[-2] if up == 'Q' else None
        x, y = pts[-1]
    return [[(op, [(px + dx, py + dy) for px, py in p]) for op, p in s] for s in subs]


def path_to_d(subs):
    f = lambda v: f'{v:.6f}'.rstrip('0').rstrip('.')
    out = []
    for s in subs:
        for op, p in s:
            out.append(op + (' ' + ' '.join(f'{f(a)},{f(b)}' for a, b in p) if p else ''))
    return ' '.join(out)


def flatten(subs, steps=16):
    polys = []
    for s in subs:
        poly, cur = [], None
        for op, p in s:
            if op in 'ML':
                poly.extend(p); cur = p[-1]
            elif op == 'C':
                (x1, y1), (x2, y2), (x3, y3) = p; x0, y0 = cur
                for k in range(1, steps + 1):
                    t = k / steps; u = 1 - t
                    poly.append((u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3, u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
                cur = p[-1]
            elif op == 'Q':
                (x1, y1), (x2, y2) = p; x0, y0 = cur
                for k in range(1, steps + 1):
                    t = k / steps; u = 1 - t
                    poly.append((u*u*x0 + 2*u*t*x1 + t*t*x2, u*u*y0 + 2*u*t*y1 + t*t*y2))
                cur = p[-1]
        if len(poly) >= 3: polys.append(poly)
    return polys


# ---- Geometry construction --------------------------------------------------------------------------
def rounded_rect_d(x, y, w, h, r):
    return (f'M{x+r},{y} H{x+w-r} A{r},{r} 0 0 1 {x+w},{y+r} V{y+h-r} A{r},{r} 0 0 1 {x+w-r},{y+h} '
            f'H{x+r} A{r},{r} 0 0 1 {x},{y+h-r} V{y+r} A{r},{r} 0 0 1 {x+r},{y} Z')


def rounded_rect_poly(x, y, w, h, r, top_only=False, n=16):
    def arc(cx, cy, a0):
        return [(cx + r * math.cos(math.radians(a0 + 90 * k / n)), cy + r * math.sin(math.radians(a0 + 90 * k / n))) for k in range(n + 1)]
    pts = arc(x + w - r, y + r, -90)
    pts += [(x + w, y + h)] if top_only else arc(x + w - r, y + h - r, 0) + arc(x + r, y + h - r, 90)
    pts += [(x, y + h)] if top_only else []
    return pts + arc(x + r, y + r, 180)


def clip(poly, a, b, c):
    o = []
    for k in range(len(poly)):
        p, q = poly[k], poly[(k + 1) % len(poly)]
        fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0: o.append(p)
        if (fp < 0) != (fq < 0):
            t = fp / (fp - fq); o.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return o


def area(p):
    return abs(sum(p[k][0] * p[(k + 1) % len(p)][1] - p[(k + 1) % len(p)][0] * p[k][1] for k in range(len(p)))) / 2


def hatch_dashes():
    full = STRIPE / (SQ3 / 2) * LINES[0][3]
    dashes, dashes2 = [], []

    def band(rect, a0, width):
        p = clip(rect, -SQ3 / 2, -0.5, -a0)
        return clip(p, SQ3 / 2, 0.5, a0 + width) if p else p
    for lx, ly, lw, lh in LINES:
        rect = [(lx, ly), (lx + lw, ly), (lx + lw, ly + lh), (lx, ly + lh)]
        u0 = (SQ3 * lx + ly) / 2; u1 = (SQ3 * (lx + lw) + ly + lh) / 2
        kept = []
        k = math.floor(u0 / PERIOD) - 1
        while k * PERIOD <= u1 + PERIOD:
            p = band(rect, k * PERIOD, STRIPE)
            if p and area(p) >= MIN_DASH * full: dashes.append(p); kept.append(k)
            k += 1
        off = (PERIOD - STRIPE - SECONDARY) / 2
        for k in kept:
            if k + 1 in kept:   # only between two primary dashes
                p = band(rect, k * PERIOD + STRIPE + off, SECONDARY)
                if p: dashes2.append(p)
    return dashes, dashes2


def polys_d(ps):
    return ' '.join('M' + ' L'.join(f'{a:.3f},{b:.3f}' for a, b in p) + ' Z' for p in ps)


def read_colors():
    xml = (RES / 'main/res/values/ic_launcher_colors.xml').read_text()
    return {m.group(1): m.group(2) for m in re.finditer(r'<color name="ic_launcher_(\w+)">(#[0-9A-Fa-f]{6})</color>', xml)}


def rgba(hexcol, alpha=1.0):
    h = hexcol.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(255 * alpha))


# ---- Raster rendering (Pillow, supersampled) --------------------------------------------------------
def render(size, canvas, layers, offset=(0, 0), ss=8):
    """Draws the card square (CX, CY, CW) at `size` px, placed at `offset` on a `canvas`-px square image.
    layers = [(rgba, polys_to_fill, polys_to_erase)], composited in order."""
    from PIL import Image, ImageDraw
    S = canvas * ss
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    k = size * ss / CW
    tr = lambda p: [((px - CX) * k + offset[0] * ss, (py - CY) * k + offset[1] * ss) for px, py in p]
    for color, fill, erase in layers:
        mask = Image.new('L', (S, S), 0); d = ImageDraw.Draw(mask)
        for p in fill: d.polygon(tr(p), fill=255)
        for p in erase: d.polygon(tr(p), fill=0)
        if color[3] < 255:
            mask = mask.point(lambda v, a=color[3]: v * a // 255)
        layer = Image.new('RGBA', (S, S), color[:3] + (255,)); layer.putalpha(mask)
        out.alpha_composite(layer)
    return out.convert('RGBa').resize((canvas, canvas), Image.Resampling.BOX).convert('RGBA')


def main():
    text_d = (BRANDING / 'nsn-text.svg').read_text()
    text_d = re.search(r'<path\b[^>]*\bid="nsn"[^>]*\sd="([^"]+)"', text_d, re.S).group(1).strip()
    text_d_draft = 'M' + text_d[1:]   # as drawn in the foreground layer (translated by a group)
    text_abs = parse_path(text_d, TEXT_DX, TEXT_DY)
    text_polys = flatten(text_abs)

    x, y, w, h, r = CX, CY, CW, CH, R
    card = rounded_rect_d(x, y, w, h, r)
    header = f'M{x+r},{y} H{x+w-r} A{r},{r} 0 0 1 {x+w},{y+r} V{HEADER_BOTTOM} H{x} V{y+r} A{r},{r} 0 0 1 {x+r},{y} Z'
    dashes, dashes2 = hatch_dashes()
    hatch, hatch2 = polys_d(dashes), polys_d(dashes2)

    head = ('<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by branding/build_icons.py -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp"\n'
            '    android:viewportWidth="108" android:viewportHeight="108">\n')
    bg = head + (f'    <path android:fillColor="@color/ic_launcher_card" android:pathData="{card}"/>\n'
                 f'    <path android:fillColor="@color/ic_launcher_header" android:pathData="{header}"/>\n</vector>\n')
    fg = head + (f'    <group android:translateX="{TEXT_DX}" android:translateY="{TEXT_DY}">\n'
                 f'        <path android:fillColor="@color/ic_launcher_text" android:pathData="{text_d_draft}"/>\n    </group>\n'
                 f'    <path android:fillColor="@color/ic_launcher_lines" android:pathData="{hatch}"/>\n'
                 f'    <path android:fillColor="@color/ic_launcher_lines_secondary" android:pathData="{hatch2}"/>\n</vector>\n')

    # Themed layer: outline card (even-odd ring), header with "NSN" cut out, "NSN" at lower alpha, dashes.
    s = MONO_CARD / CW
    ow = MONO_OUTLINE / s
    ring = card + ' ' + rounded_rect_d(x + ow, y + ow, w - 2 * ow, h - 2 * ow, max(r - ow, 0.0))
    text_abs_d = path_to_d(text_abs)
    mono = head + (f'    <group android:pivotX="54" android:pivotY="54" android:scaleX="{s:.6f}" android:scaleY="{s:.6f}">\n'
                   f'        <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="{ring}"/>\n'
                   f'        <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="{header} {text_abs_d}"/>\n'
                   f'        <path android:fillColor="#FFFFFFFF" android:fillAlpha="{MONO_TEXT_ALPHA}" android:pathData="{text_abs_d}"/>\n'
                   f'        <path android:fillColor="#FFFFFFFF" android:pathData="{hatch}"/>\n'
                   f'        <path android:fillColor="#FFFFFFFF" android:fillAlpha="{MONO_SECONDARY_ALPHA}" android:pathData="{hatch2}"/>\n'
                   f'    </group>\n</vector>\n')

    drawable = RES / 'main/res/drawable'
    (drawable / 'ic_launcher_background.xml').write_text(bg)
    (drawable / 'ic_launcher_foreground.xml').write_text(fg)
    (drawable / 'ic_launcher_monochrome.xml').write_text(mono)

    # Previews (plain SVG, main colours)
    c = read_colors()
    (BRANDING / 'icon.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">'
        f'<g id="background"><path fill="{c["card"]}" d="{card}"/><path fill="{c["header"]}" d="{header}"/></g>'
        f'<g id="foreground"><path fill="{c["text"]}" d="{text_abs_d}"/><path fill="{c["lines"]}" d="{hatch}"/>'
        f'<path fill="{c["lines_secondary"]}" d="{hatch2}"/></g></svg>\n')
    (BRANDING / 'icon-monochrome.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">'
        f'<g transform="translate(54 54) scale({s:.6f}) translate(-54 -54)" fill="#000000">'
        f'<path fill-rule="evenodd" d="{ring}"/><path fill-rule="evenodd" d="{header} {text_abs_d}"/>'
        f'<path fill-opacity="{MONO_TEXT_ALPHA}" d="{text_abs_d}"/><path d="{hatch}"/>'
        f'<path fill-opacity="{MONO_SECONDARY_ALPHA}" d="{hatch2}"/></g></svg>\n')

    # Favicons
    card_p = [rounded_rect_poly(x, y, w, h, r)]
    header_p = [rounded_rect_poly(x, y, w, HEADER_BOTTOM - y, r, top_only=True)]
    mean = '#' + ''.join(f'{(int(c["lines"][k:k+2], 16) + int(c["lines_secondary"][k:k+2], 16)) // 2:02X}' for k in (1, 3, 5))

    def favicon(size, framing):
        simple = size <= SIMPLE_MAX
        layers = [(rgba(c['card']), card_p, []), (rgba(c['header']), header_p, [])]
        if simple:
            layers.append((rgba(mean), [[(lx, ly), (lx + lw, ly), (lx + lw, ly + lh), (lx, ly + lh)] for lx, ly, lw, lh in LINES], []))
        else:
            layers += [(rgba(c['text']), text_polys, []), (rgba(c['lines']), dashes, []),
                       (rgba(c['lines_secondary']), dashes2, [])]
        if framing == 'tile':
            return render(126, size, layers, offset=(72, 50))
        return render(size, size, layers)

    for name, size, framing in FAVICONS:
        favicon(size, framing).save(FAVICON / name, optimize=True)
    icos = [favicon(sz, 'card') for sz in ICO_SIZES]
    icos[-1].save(FAVICON / 'favicon.ico', sizes=[(sz, sz) for sz in ICO_SIZES], append_images=icos[:-1])
    print(f'dashes {len(dashes)}, secondary {len(dashes2)}; wrote 3 drawables, {len(FAVICONS)} PNGs, favicon.ico, 2 previews')


if __name__ == '__main__':
    main()
