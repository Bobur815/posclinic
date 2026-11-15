# Prompt: swap the new logo into the web login (Claude Design)

Paste the block below as a follow-up in the same Claude Design conversation that made the web
dashboard login. The SVGs are copied verbatim from `images/` (`posclinic-icon.svg`,
`posclinic-icon-small.svg`).

```
Replace the logo everywhere in this login design with our final POSCLINIC brand mark. Change
NOTHING else: layout, form, copy, colors, states, spacing and the UZ/RU and light/dark behavior
all stay as they are.

1) THE MARK: use these SVGs verbatim. Do not redraw, trace, restyle or simplify them.

Full icon (use at 40px and larger):
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="posclinic">
  <defs>
    <linearGradient id="pcBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0891b2"/>
      <stop offset="1" stop-color="#0e7490"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#pcBg)"/>
  <circle cx="512" cy="512" r="292" fill="none" stroke="#ffffff" stroke-width="80"/>
  <path fill="#ffffff" fill-rule="evenodd" d="M376 512A136 136 0 1 0 648 512A136 136 0 1 0 376 512ZM548 436V476H588A36 36 0 0 1 588 548H548V588A36 36 0 0 1 476 588V548H436A36 36 0 0 1 436 476H476V436A36 36 0 0 1 548 436Z"/>
  <circle cx="649.18" cy="374.82" r="34" fill="#ffffff"/>
</svg>

Small icon (use below 40px, and as the favicon):
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="posclinic">
  <defs>
    <linearGradient id="pcBgS" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0891b2"/>
      <stop offset="1" stop-color="#0e7490"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#pcBgS)"/>
  <circle cx="512" cy="512" r="388" fill="none" stroke="#ffffff" stroke-width="120"/>
  <path fill="#ffffff" fill-rule="evenodd" d="M256 512A256 256 0 1 0 768 512A256 256 0 1 0 256 512ZM576 384V448H640A64 64 0 0 1 640 576H576V640A64 64 0 0 1 448 640V576H384A64 64 0 0 1 384 448H448V384A64 64 0 0 1 576 384Z"/>
</svg>

If the same SVG appears more than once on the page, give each copy its own gradient id
(pcBg-1, pcBg-2, ...) and update its url(#...) to match. Duplicate ids break the fill in some
browsers. Or define the gradient once and reference it from every copy.

2) WHERE IT GOES
- Form header: the full icon at 48px, then the wordmark (below) to its right, vertically centered,
  12px gap. This replaces the old logo + "POSCLINIC" text.
- Visual panel (desktop): the full icon at 120-160px, centered above the value line
  "Klinikangiz har doim nazoratda". Remove the old white-cross / medical-cross mark completely.
  The panel's background must stay darker than the icon's tile so the rounded square still
  reads: keep the panel gradient, or put a soft 1px rgba(255,255,255,0.18) outline on the tile.
- Mobile header (390px): the full icon at 56px centered in the gradient header, with the
  wordmark under it in white.
- Favicon: the SMALL icon as an inline SVG data-URI <link rel="icon" type="image/svg+xml">.
  The browser tab title stays "posclinic".

3) THE WORDMARK: live text, not an image
- The word "posclinic" in lowercase, a geometric sans-serif (Manrope 700, fallback Inter /
  Poppins), letter-spacing -0.01em, about 26px next to the 48px icon.
- Light theme: "pos" in #0e3b46, "clinic" in #0891b2.
- Dark theme: "pos" in #e6f4f6, "clinic" in #22b8d6. #0e3b46 vanishes on dark backgrounds, so
  only the colors change; the mark itself stays the same.
- On the cyan visual panel and the mobile header: the whole word in #ffffff.
- No other text in the logo area (no tagline, no "Clinic Management System").

4) ACCESSIBILITY
- The header logo is decorative next to the visible wordmark: aria-hidden="true" on that SVG.
- The standalone panel icon keeps role="img" aria-label="posclinic".
- Contrast: the wordmark colors above meet WCAG AA on their backgrounds; keep them.

5) DELIVER
- The updated prototype in both themes, desktop and mobile.
- The CSS variables for the new wordmark colors (--logo-pos, --logo-clinic for light and dark),
  so the developer can port them.
- Confirm in one line that nothing else in the design changed.
```
