# POSCLINIC logo: design prompts

**Concept:** monogram of **P** (POS) and **C** (Clinic) on the brand colour `#0891b2`. The P is
white, and the C is a red crescent-shaped letter.

## Read before using

1. **The red crescent is a protected emblem** (Geneva Conventions; in Uzbekistan the National Red
   Crescent Society). Commercial or medical use of the emblem, or anything that could be mistaken
   for it, can be treated as misuse. The prompts therefore keep the C an **open letter-form**:
   - a stroke with a visible gap and rounded terminals, on cyan;
   - never a solid filled crescent;
   - never red on white;
   - never standing alone without the P.

   Have the final mark checked (patent attorney, or Uzbekistan's IP agency) before registering or
   printing it.
2. **Contrast:** pure red on `#0891b2` vibrates and blurs at small sizes, because the two colours
   have nearly the same luminance. Use a deeper red (`#dc2626`) and a thin white keyline around the
   C. Always check the mark at 16 and 32 px.

Brand tokens:
- cyan `#0891b2`, deep cyan `#0e7490` (an optional subtle gradient);
- white `#ffffff`;
- red `#dc2626` (crescent C);
- style: geometric, minimal, flat. No 3D, no gloss, no text other than the letters.

---

## 1. Image model (Gemini / Imagen, Midjourney, DALL·E)

```
A minimalist, flat vector monogram logo for "POSCLINIC", a medical clinic software brand.
Square app icon with softly rounded corners, solid background color #0891b2 (teal-cyan), optionally
a very subtle gradient to #0e7490.

Monogram:
- a bold, geometric, white uppercase letter "P" with a thick, even stroke and rounded corners,
  centered slightly left;
- interlocked with it, an uppercase letter "C" drawn as a smooth crescent-shaped open curve in deep
  red #dc2626, wrapping around the right side of the P's bowl.

The C is clearly a LETTER: an open arc with rounded stroke ends and a visible opening on its right
side, thicker in the middle and tapering toward both ends like a crescent. It is not a filled moon
shape. A thin white outline (about 2% of the icon size) around the red C separates it from the cyan.
The P and C overlap or interlock cleanly, balanced and centered, with generous padding (about 18% on
each side).

Style: flat 2D vector, crisp edges, no shadows, no 3D, no gloss, no texture, no extra symbols, no
words, no tagline. Must stay legible as a 16x16 favicon.
Output: a single icon on a plain white canvas, 1024x1024.
```

Variations to ask for in follow-up turns:
- "Same logo, the P and C side by side instead of interlocked."
- "Same logo, monochrome all-white on #0891b2" (for small sizes and stamps).
- "Same logo, horizontal lockup with the wordmark 'POSCLINIC' in a geometric sans-serif, dark
  #0e3b46 text on white."

---

## 2. Claude: precise SVG (editable, ready for the app icons)

```
Create an SVG logo (viewBox 0 0 1024 1024) for POSCLINIC, a clinic software brand.
Output the SVG code plus PNG-safe notes.

- Background: a rounded square covering the full viewBox, rx 220, fill #0891b2 (optionally a
  linear gradient #0891b2 → #0e7490, top-left to bottom-right).
- Letter P: white #ffffff.
  - Built from geometric primitives, not a font: a vertical stem plus a round bowl.
  - Stroke weight about 120 units, rounded joins.
  - Positioned so the P plus the C are optically centered, with at least 180 units of padding on
    every side.
- Letter C: deep red #dc2626.
  - A crescent-shaped open arc: thick in the middle (about 120 units), tapering to rounded ends,
    with a clear opening on the right (the arc spans about 270°).
  - It wraps around the right side of the P's bowl and interlocks with it.
  - Add a white keyline (stroke #ffffff, 16 units) around the C so it separates from the cyan.
  - It must read as a letter C, never as a filled moon or emblem, and never red on white.
- No text, no shadows, no filters (so it renders the same everywhere).
- Keep the geometry simple enough to stay legible at 16x16 and 32x32.

Then give:
- a monochrome version (white P and C on #0891b2);
- a favicon-optimised version, with the keyline and the gaps thickened for 16px;
- a horizontal lockup: the icon plus the wordmark "POSCLINIC" (geometric sans-serif, #0e3b46).
```

---

## When you have the final SVG

Send it to me. I'll regenerate `build/icons/` (`.ico` 16–256 px, the 1024 px PNG, the 256 px PNG)
and use it for:
- the till app and installer icon;
- the window and taskbar icon;
- the web dashboard favicon;
- the login screens.

This replaces the current white-cross icon.
