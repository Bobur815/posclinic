# POSCLINIC logo: design prompts

**Recommended concept: the "lens".** A microscope field of view (a white ring) with a soft plus cut
into it, in white on the brand cyan `#0891b2`. Next to it, the wordmark **posclinic**.

**Why this, and not letters or a red symbol:**
- **It says what the clinic does.** Parasitology is microscope work; the lens says "diagnosis"
  without showing anything unpleasant. Patients see it on receipts, so no worms or germs.
- **It is safe.** It doesn't copy the red cross, the red crescent (both protected emblems), the
  Star of Life, or a pharmacy cross.
- **It works everywhere.** One shape in one colour: clear at 16 px (favicon, taskbar), clean in
  pure black on thermal receipts and stamps, and easy to engrave or embroider.
- **It is distinctive.** The single small "cell" dot inside the lens is what stops it being a
  generic "plus in a circle".
- **It fits the posgro family.** It is a rounded-square symbol from the same maker as posgro's
  monogram, without copying it.

**Tokens**

| Role | Value |
|---|---|
| Brand cyan | `#0891b2` |
| Deep cyan | `#0e7490` (optional gradient end) |
| White | `#ffffff` |
| Wordmark dark | `#0e3b46` |
| Font | geometric sans-serif (Manrope / Inter / Poppins style), lowercase |

**Judge the candidates by these four tests:**
1. Is it recognisable at 16×16?
2. Does it survive printing in pure black on a receipt?
3. Does it avoid looking like the red cross, the red crescent or a pharmacy sign?
4. Would a patient seeing it on a prescription feel calm?

---

## 1. Image model (Gemini / Imagen, Midjourney, DALL·E)

```
A minimalist flat vector app-icon logo for "posclinic", software for a parasitology (microscope
diagnostics) clinic.

A square icon with softly rounded corners, solid teal-cyan background #0891b2 (optionally a very
subtle diagonal gradient to #0e7490).

Centered symbol, all in pure white:
- A thick circular ring, like the round field of view seen through a microscope eyepiece.
- Inside the ring, a soft "plus" sign with rounded arm ends, formed as negative space: the plus is
  cut out of a white disc, so the cyan background shows through as the plus shape.
- One small solid white dot (a single cell) sits in the upper-right quadrant between the plus arms,
  slightly off-center, giving the mark character.

Generous padding (about 20% of the icon on each side). Bold, simple geometry that stays crisp and
recognizable as a 16x16 favicon.

Flat 2D vector, no gradients on the white shapes, no shadows, no 3D, no gloss, no texture, no text,
no red, no cross-flag or pharmacy look, no germs or worms.
Output: a single icon centered on a plain white canvas, 1024x1024.
```

Follow-up requests:
- "Same symbol in pure black on white, no background square." (receipts, stamps)
- "Same symbol, horizontal lockup with the lowercase wordmark 'posclinic' to the right: 'pos' in
  #0e3b46 and 'clinic' in #0891b2, a geometric sans-serif, the text vertically centered on the icon."
- "Same symbol at 16x16 and 32x32 pixels, check legibility; thicken the ring if needed and drop the
  dot at 16x16."

---

## 2. Claude: precise SVG (editable; I turn it into the app icons)

```
Create SVG logos for "posclinic", software for a parasitology clinic (microscope diagnostics).
Use only basic shapes (circle, rect, path); no fonts in the icon, no filters, no masks with
blur, so it renders identically everywhere. Return each SVG as code.

1) App icon, viewBox 0 0 1024 1024:
   - Background: a rect covering the full viewBox, rx 224, fill #0891b2 (optionally a
     linearGradient #0891b2 → #0e7490, top-left to bottom-right).
   - Lens ring: a white circle stroke centered at (512,512), radius 300, stroke-width 88, no fill.
   - Plus: a white disc of radius 190 inside the ring, with a plus shape CUT OUT of it so the
     background shows through:
     - each arm 96 units wide, rounded ends (radius 48);
     - the arms reach to 150 units from the center.
     Build it with fill-rule="evenodd" or a compound path, not a mask.
   - Cell: a white solid circle of radius 34 at about (640, 384), clear of both the plus and the
     ring with at least 24 units of gap.
   - Keep at least 180 units of padding to the edge.

2) The same icon optimised for 16 and 32 px:
   - ring stroke 120;
   - plus arms 130 wide;
   - no cell dot.

3) Monochrome version: the symbol only (ring + cut-out plus + dot) in #000000 on transparent,
   for thermal receipts and stamps.

4) Horizontal lockup, viewBox 0 0 2400 640:
   - the icon at 640x640 on the left;
   - the wordmark "posclinic" in lowercase on the right, as live <text> in a geometric
     sans-serif (font-family "Manrope, Inter, Poppins, sans-serif", weight 700, size ~260),
     "pos" in #0e3b46 and "clinic" in #0891b2;
   - the text vertically centered on the icon, with 80 units of gap.
   - Also a version with the text converted to outline paths, if you can.

Check every version at 16, 32 and 64 px and say what you adjusted for legibility.
```

---

## When you have the final SVG

Send it to me. I'll regenerate `build/icons/` (`.ico` 16–256 px, the 1024 px PNG, the 256 px PNG)
and use it for:
- the till app and installer icon;
- the window and taskbar icon;
- the web dashboard favicon;
- the login screens;
- the receipt header (monochrome).

This replaces today's white-cross icon.

---

## Appendix: the earlier P + C monogram prompts (for comparison only)

Not recommended:
- "PC" reads as "personal computer".
- Two-letter monograms are forgettable.
- The red crescent is a protected emblem.
- Red on `#0891b2` has almost no contrast.
- It has no clean black-only version for receipts.

If you still compare them, keep the C an open letter-form, never a solid crescent, and have the
mark checked before registering it.

### A. Image model (Gemini / Imagen, Midjourney, DALL·E)

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

### B. Claude: precise SVG (editable, ready for the app icons)

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

