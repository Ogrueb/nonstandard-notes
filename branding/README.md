# Branding

All icons of this fork are generated from one geometry by `build_icons.py`.

```
python3 branding/build_icons.py
```

Requires Python 3.8+ and Pillow 9.1+ (`pip install pillow`). It can be run from any directory, and the output is deterministic, so a regenerated icon only changes if its input changed.

## Inputs

- `nsn-text.svg`: the "NSN" lettering as outlines (Liberation Sans, licensed under the SIL Open Font License 1.1), in launcher-icon coordinates.
- Layout constants at the top of `build_icons.py`: the card, header, lines, hatching, text offset, the themed-layer settings and the favicon sizes.
- Colours, which are not in the script:
  - `packages/mobile/android/app/src/main/res/values/ic_launcher_colors.xml`: header, text, card, lines, secondary lines.
  - `packages/mobile/android/app/src/dev/res/values/ic_launcher_colors.xml`: the dev flavor's header and text.
  - The script reads the main colours for the favicons and previews.

## Outputs

| File | Use |
|---|---|
| `packages/mobile/android/app/src/main/res/drawable/ic_launcher_background.xml` | Adaptive icon background layer: the card with its coloured header. |
| `packages/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml` | Adaptive icon foreground layer: "NSN" and the three hatched lines. |
| `packages/mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml` | Themed icon layer (Android 13+), described below. |
| `packages/web/src/favicon/*.png`, `favicon.ico` | Web favicons, described below. |
| `branding/icon.svg`, `branding/icon-monochrome.svg` | Plain SVG previews. |

`mipmap-anydpi/ic_launcher.xml` combines the three layers. It is written by hand and is not generated. The minimum SDK is 28, so there are no per-density launcher PNGs.

### Themed icon layer

The monochrome layer is the same drawing, adapted to a single tint:

- It is scaled to the size of the original themed layer: a card 40 units wide, set by `MONO_CARD`.
- The card is drawn as an outline.
- "NSN" is cut out of the header and filled at 70% opacity. In colour, the text is the header lightened by 30%.
- The lighter dashes are drawn at 50% opacity. `#DFDFDF` has half the ink of `#BFBFBF`.

The system tints this layer and uses only its alpha channel.

### Favicons

Favicons are cropped to the card and have transparent corners. `mstile-150x150.png` is the exception: it is 270 × 270, with the card placed at (72, 50).

At 48 px and below, the lettering is left out, and the hatched lines are drawn as solid lines in the mean of the two greys.
