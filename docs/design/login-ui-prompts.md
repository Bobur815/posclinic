# Login UI — design prompts (Claude Design + Google Gemini)

Four prompts: one for each tool and target (web dashboard, POS till). Each one stands alone: paste it as is.
The inspiration images are the 7 templates in `C:\Users\user\Pictures\Login_page_templates`. Attach
them when the tool accepts images. The prompts already describe what to take from them.

**What the templates share, and what we keep:**
- split layout: form on one side, visual panel on the other;
- soft tinted page background;
- rounded inputs with leading icons and a show/hide password eye;
- "Remember me";
- one full-width primary button;
- the visual becomes a header on narrow screens.

**What we drop:** Sign up, email login, Google/Facebook/Apple buttons, and "Forgot password?" links
that start a reset flow. posclinic clinics are created only by the POSGRO super admin, staff sign
in with **phone + password**, and a forgotten password is reset by the clinic admin.

---

## Shared product facts (already inside every prompt below)

| | |
|---|---|
| Product | **POSCLINIC**: management system for a **parasitology clinic** (Uzbekistan) |
| Brand | cyan `#0891b2` → `#0e7490` gradient; app icon = white rounded **medical cross** on that gradient, rounded square |
| Status colours | success `#10b981`, warning `#f59e0b`, error `#ef4444` |
| Languages | **Uzbek (Latin, default)** and **Russian**, switchable on the login screen. No English in the UI |
| Themes | light **and** dark, both designed |
| Login | phone `+998 90 123 45 67` (mask/format as typed) + password, show/hide eye, "Remember me" (remembers the **phone only**) |
| No | sign-up, email, social logins, password-reset flow, captcha |
| Tone | calm, clinical, trustworthy, modern; no cartoonish germs or parasites; no stock-photo doctors with stethoscopes as the hero cliché |

**Copy (use exactly):**

| Key | Uzbek | Russian |
|---|---|---|
| Title | Xush kelibsiz | Добро пожаловать |
| Phone | Telefon raqam | Номер телефона |
| Password | Parol | Пароль |
| Remember | Meni eslab qol | Запомнить меня |
| Button | Kirish | Войти |
| Hint | Parolni unutdingizmi? Klinika administratoriga murojaat qiling | Забыли пароль? Обратитесь к администратору клиники |
| Error (wrong) | Telefon yoki parol noto'g'ri | Неверный телефон или пароль |
| Error (phone) | Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67 | Неверный номер телефона. Например: +998 90 123 45 67 |

---

## 1. Claude Design — WEB dashboard login

```
Design the login screen for POSCLINIC's web dashboard: an admin panel that owners and
administrators of a parasitology clinic in Uzbekistan use in a browser, on a laptop and on a phone.
Deliver an interactive HTML/CSS prototype with these states: empty, typing, password visible,
loading, error, and a "subscription expiring" notice. Design desktop (1440px) and mobile (390px)
layouts. Design light and dark themes.

LAYOUT
- Split screen on desktop: form panel on the left (about 45%), visual panel on the right.
- Page background: soft tinted neutral (light: #F4FAFB; dark: #0B1416). The form sits in a card
  with rounded corners (16-20px) and a gentle shadow.
- Visual panel: an abstract, calm medical motif built from soft cyan gradients (#0891b2 → #0e7490),
  subtle cellular / microscope-slide circles and fine grid lines, with the white medical-cross logo
  mark. Add one line of value text: Uzbek "Klinikangiz har doim nazoratda", Russian "Ваша клиника
  всегда под контролем". No stock photos, no cartoon germs.
- Mobile: the visual collapses to a 160px gradient header with the logo; the form fills the screen.

FORM (top to bottom)
- Logo mark + wordmark "POSCLINIC", then the title "Xush kelibsiz" with a subtitle line, e.g.
  "Klinika boshqaruv paneli".
- Phone input: label "Telefon raqam", leading phone icon, fixed "+998" prefix chip, auto-format
  "90 123 45 67", numeric keyboard on mobile.
- Password input: label "Parol", leading lock icon, trailing eye toggle.
- Row: checkbox "Meni eslab qol" on the left. NO "forgot password" link.
- Primary button, full width, 48px tall, cyan gradient: "Kirish". Show a spinner while loading.
- Under the button, a muted hint: "Parolni unutdingizmi? Klinika administratoriga murojaat qiling".
- Inline error banner above the button (red, icon + text), e.g. "Telefon yoki parol noto'g'ri".
- Footer: UZ | RU segmented switch, a light/dark toggle, and the small text "© POSCLINIC · posgro.uz".

RULES
- No sign-up, no email, no Google/Apple/Facebook buttons, no captcha.
- Everything in Uzbek Latin by default; switching to RU swaps all copy (Russian strings:
  Добро пожаловать / Номер телефона / Пароль / Запомнить меня / Войти /
  Забыли пароль? Обратитесь к администратору клиники).
- Accessible: WCAG AA contrast in both themes, visible focus rings, labels tied to inputs, 44px
  minimum touch targets, error announced with role="alert".
- Typography: one geometric sans (e.g. Inter or Manrope). Title 28-32px, body 15-16px.
- Show the design tokens you used (colours, radius, spacing, shadows) as CSS variables, so a
  developer can port them to styled-components.
```

---

## 2. Claude Design — POS till login (desktop app)

```
Design the login screen for the POSCLINIC till: an Electron desktop app at the reception desk and
in doctors' rooms of a parasitology clinic in Uzbekistan. It runs full screen on a 1366x768 to
1920x1080 monitor and often on touch screens. Deliver an interactive HTML/CSS prototype with
light and dark themes.

CONTEXT THAT MUST SHOW ON SCREEN
- Clinic name, e.g. "Shifo Parazitologiya Klinikasi", from the till's licence.
- Till role badge: "Asosiy kassa" (main till) or "Qo'shimcha kassa" (satellite, connected to the
  main till), with a small connection dot (green online / amber connecting / red offline).
- An optional status strip at the top for the subscription:
  - warning: "Obuna muddati 5 kundan keyin tugaydi"
  - read-only: "Obuna muddati tugagan: faqat ko'rish va to'lov qabul qilish mumkin"
  Amber for warning, red for read-only.
- App version in the corner, e.g. "v2.2.0".

LAYOUT
- Split screen: a large left visual panel (about 55%) with a deep cyan gradient (#0891b2 → #0e7490),
  the white medical-cross logo, the clinic name in large type, and the current date and time
  (live clock, e.g. "Shanba, 15-noyabr · 14:32"). On the right, the sign-in form, vertically centred
  in a clean light panel.
- Built for speed at a busy desk:
  - inputs and the button at least 52px tall, 16-18px text;
  - Enter submits;
  - if the till remembers the phone, focus starts on the password.

FORM
- Title "Xush kelibsiz".
- Phone: "Telefon raqam", "+998" prefix chip, auto-format "90 123 45 67". When remembered, show the
  phone pre-filled with a small "Boshqa xodim" (other staff member) link that clears it.
- Password: "Parol", eye toggle.
- Checkbox "Meni eslab qol" (remembers the phone only, never the password).
- Primary button "Kirish", full width, with a loading state.
- Hint: "Parolni unutdingizmi? Klinika administratoriga murojaat qiling".
- Error state: "Telefon yoki parol noto'g'ri". After 5 wrong tries on a satellite, a lockout state:
  "Juda ko'p urinish. 5 daqiqadan keyin qayta urinib ko'ring", with a countdown.
- Bottom bar of the form: UZ | RU switch and a light/dark toggle.

ALSO DESIGN (same visual language)
- "Waiting for main till" full-screen overlay for satellites: "Asosiy kassa kutilmoqda", a
  reconnect spinner, and the main till's address "192.168.1.10:5180".

RULES
- No sign-up, email, social logins or password-reset flow.
- Uzbek Latin default; RU swaps all copy (Добро пожаловать, Номер телефона, Пароль, Запомнить меня,
  Войти, Забыли пароль? Обратитесь к администратору клиники, Неверный телефон или пароль).
- WCAG AA in both themes, strong focus rings (keyboard-heavy use), no hover-only affordances
  (touch).
- Output the tokens as CSS variables (colours, radius, spacing, shadow).
```

---

## 3. Google Gemini — WEB dashboard login (image mockups)

```
Create high-fidelity UI mockup images of a login page for "POSCLINIC", the web admin dashboard of
a parasitology clinic in Uzbekistan. Produce 4 images:
(1) desktop 1440x900, light theme;
(2) desktop 1440x900, dark theme;
(3) mobile 390x844, light theme;
(4) desktop light theme showing the error state.

Style: modern, calm, clinical SaaS, similar to a clean split-screen login. Form card on the left,
an abstract visual panel on the right. Soft tinted background (#F4FAFB light, #0B1416 dark),
rounded corners 16-20px, gentle shadows, a geometric sans-serif font (Inter / Manrope).

Brand:
- cyan gradient from #0891b2 to #0e7490;
- logo = white rounded medical cross on that cyan gradient in a rounded square, next to the
  wordmark "POSCLINIC".

Right panel: an abstract medical motif from soft cyan gradients, faint microscope-slide circles
and fine grid lines, the logo mark, and the line "Klinikangiz har doim nazoratda". No photos of
people, no cartoon germs or parasites.

Form, in Uzbek (Latin script), exactly this text:
- Title "Xush kelibsiz"
- Subtitle "Klinika boshqaruv paneli"
- Field "Telefon raqam" with a phone icon, a "+998" prefix and the value "90 123 45 67"
- Field "Parol" with a lock icon and an eye icon
- Checkbox "Meni eslab qol"
- Full-width cyan button "Kirish"
- Small grey hint under the button: "Parolni unutdingizmi? Klinika administratoriga murojaat qiling"
- Footer: a small "UZ | RU" switch and a sun/moon theme toggle

Error image: a red banner above the button reading "Telefon yoki parol noto'g'ri".

Do NOT include: Sign up, email field, Google/Apple/Facebook buttons, a "Forgot password?" link,
or a captcha. All text must be spelled exactly as given; no lorem ipsum, no English UI text.
```

---

## 4. Google Gemini — POS till login (image mockups)

```
Create high-fidelity UI mockup images of the login screen for the "POSCLINIC" desktop till app used
at the reception desk of a parasitology clinic in Uzbekistan. Full-screen desktop app, 1920x1080,
touch-friendly. Produce 4 images:
(1) light theme;
(2) dark theme;
(3) light theme with an amber subscription-warning strip at the top;
(4) the "waiting for main till" overlay.

Layout: split screen.
- Left 55%: a deep cyan gradient panel (#0891b2 → #0e7490) showing:
  - the white rounded medical-cross logo;
  - the clinic name "Shifo Parazitologiya Klinikasi" in large white type;
  - below it the date and time "Shanba, 15-noyabr · 14:32";
  - a small pill badge "Asosiy kassa" with a green dot.
- Right 45%: a clean light panel with the sign-in form, vertically centred.
- Small "v2.2.0" in the bottom corner.

Form, Uzbek Latin, exactly this text, large touch-friendly controls (52px tall inputs and button):
- Title "Xush kelibsiz"
- Field "Telefon raqam" with a "+998" prefix, pre-filled "90 123 45 67", and a small link "Boshqa xodim"
- Field "Parol" with an eye icon
- Checkbox "Meni eslab qol"
- Full-width cyan button "Kirish"
- Grey hint: "Parolni unutdingizmi? Klinika administratoriga murojaat qiling"
- Bottom: "UZ | RU" switch and a sun/moon toggle

Image 3: a thin amber strip across the top reading "Obuna muddati 5 kundan keyin tugaydi".

Image 4: a full-screen dimmed overlay with a centred card showing:
- a spinner;
- "Asosiy kassa kutilmoqda";
- the address "192.168.1.10:5180".

Style: calm, modern, clinical; rounded corners 14-18px; soft shadows; geometric sans-serif.
Do NOT include: sign-up, email, social login buttons, "Forgot password?" links, captcha, photos of
people, cartoon germs, English UI text or lorem ipsum. Spell all text exactly as given.
```

---

## After you pick a design

Send me the exported HTML (Claude Design) or the chosen image (Gemini). I'll implement it in:
- web: `src/web/src/pages/Login/LoginPage.tsx` (strings in `src/web/src/i18n/{uz,ru}.json`);
- till: `src/renderer/pages/Login/LoginPage.tsx` (strings in `src/renderer/i18n/locales/{uz,ru}.json`).

Both use styled-components theme tokens and keep the existing behaviour: phone normalisation,
remember-phone-only, the licence banner, and the satellite overlay.
