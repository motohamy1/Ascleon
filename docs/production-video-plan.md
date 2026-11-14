# Ascleon — Production Showcase Video Plan

**Goal:** a **120-second** premium showcase video that plays the platform's real features end-to-end, with editorial montage, motion design, and a **trilingual voiceover — renderable in EN, AR, or MIX** from the same codebase.

**Decisions locked:**
- **Runtime:** 120s (@ 30fps = 3600 frames).
- **Languages:** three render variants — `en` (English), `ar` (Egyptian colloquial Arabic), `mix` (Egyptian Arabic with English technical terms, matching the product's own `StudyLanguage` model).
- **Descript:** out of scope.

**Recommendation:** **Remotion** for the motion-graphics + montage layer, **real screen captures** of the running app for authenticity, **ffmpeg** for final mux. No connector or plugin is needed — everything is local and reproducible.

---

## 1. Why Remotion (and what the other options are for)

| Tool | Verdict | Reason |
|---|---|---|
| **Remotion** | ✅ **Use this** | React-based, frame-accurate, deterministic, version-controllable. Perfect for product showcases: animated UI cards, kinetic type, transitions, device frames, charts. Renders locally with headless Chrome. |
| `manim-video` skill | ❌ | Built for math/algo explainers (3Blue1Brown). Wrong visual language for a product showcase. |
| `ascii-video` skill | ❌ | ASCII art video. Not brand-appropriate. |
| `claude-design` skill | ⚠️ Partial | Useful for the **storyboard / art-direction pass** (layout, type, color discipline) — not for rendering. |
| Canva MCP connector | ❌ | Static design + simple animations only. No timeline, no frame control. |
| CapCut / Premiere / DaVinci | ⚠️ Manual | Fine for a human editor, but not scriptable/reproducible. Use only if a human editor does the final cut. |
| HTML/CSS + Playwright capture | ⚠️ Partial | Good for **capturing** the real app, not for the montage. |

**Bottom line:** Remotion is the right call. It is the only option that gives frame-accurate control, reusable React components, and a deterministic render — and it matches the "premium cutting and montage" requirement.

---

## 2. Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  CAPTURE            │     │  REMOTION COMPOSITION │     │  POST           │
│  (real app, local)  │────▶│  (motion + montage)   │────▶│  (ffmpeg mux)   │
│                     │     │                        │     │                 │
│  Playwright/Chrome  │     │  scenes + transitions  │     │  audio + grade  │
│  → PNG/WebM clips   │     │  kinetic type          │     │  → final.mp4    │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
         ▲                            ▲
         │                            │
   local Next.js app            brand tokens + fonts
   (npm run dev)                (public/assets, globals.css)
```

**Key principle:** the video is **not** a screen recording with overlays. It is a **composed piece**: real captures are cut into designed scenes, with kinetic type, brand motion, and a music bed. That is what makes it feel "premium" rather than "demo capture".

---

## 3. Capture layer

### 3.1 Why local, not the live URL

`https://ascleon.versal.app` is behind a **FingerprintJS bot challenge** (openresty edge). Headless browsers get a challenge page or a redirect to an ad domain. **Do not fight it.** Capture from the local build instead — it is the same app, same components, same design system.

### 3.2 Capture setup

```bash
# in the Ascleon repo
npm run dev            # or: npx next dev -p 3001
```

Use a **real Chrome** (not headless-shell) so Clerk's dev-browser handshake completes and fonts render:

- Playwright Chromium: `%LOCALAPPDATA%\ms-playwright\chromium-1248\chrome-win64\chrome.exe`
- Or system Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`

Capture at **1920×1080 @ 60fps**, deviceScaleFactor 1.

### 3.3 Routes to capture

| Route | What it shows | Auth |
|---|---|---|
| `/` | Hero, feature cards, brand system | public |
| `/books/clean-code` | Reader + Study Studio sidebar | public (sample book) |
| `/books/clean-code` → **Whiteboard** | Whiteboard video studio | public |
| `/books/clean-code` → **Morph** | Interactive morph artifacts | public |
| `/books/clean-code` → **QBank** | Exam vignettes | public |
| `/books/clean-code` → **Ascleon Voice** | Voice studio | requires sign-in |
| `/library` | Bookshelf, smart bays, stats | requires sign-in |
| `/progress` | Progress dashboard | requires sign-in |
| `/space/revision` | Revision vault (locked) | requires sign-in |

**Auth-gated pages:** sign in once in the capture browser (Clerk modal) and persist the session, or temporarily stub `auth()` in a capture branch. Do **not** fake the UI in Remotion for these — a real capture is far more credible.

### 3.4 Capture format

- **Static scenes:** PNG sequence (for parallax/ken-burns in Remotion).
- **Interactive scenes:** WebM/MP4 clips at 60fps, then cut in Remotion.
- **Interactions to record:** page turns, selection → morph, whiteboard generation progress, QBank reveal, voice session start.

---

## 4. Remotion composition layer

### 4.1 Project location

Create a **separate folder** so the Next.js app is not polluted:

```
Ascleon/
  app/ ...                ← Next.js app (untouched)
  packages/
    showcase-video/       ← Remotion project
      package.json
      tsconfig.json
      remotion.config.ts
      public/             ← fonts, logo, captured clips
      src/
        Root.tsx
        scenes/
          01Intro.tsx
          02Problem.tsx
          03Upload.tsx
          04Reader.tsx
          05Voice.tsx
          06Morph.tsx
          07Whiteboard.tsx
          08QBank.tsx
          09Progress.tsx
          10Plans.tsx
          11Outro.tsx
        components/
          DeviceFrame.tsx
          KineticType.tsx
          Card.tsx
          Barcode.tsx
          ChromeSphere.tsx
          LowerThird.tsx
          Waveform.tsx
        lib/
          brand.ts        ← palette + type tokens
          easing.ts
          audio.ts
```

### 4.2 Brand tokens (lifted from `app/globals.css`)

```ts
// src/lib/brand.ts
export const brand = {
  ink: "#0f0e10",
  inkSoft: "#1d1b20",
  paper: "#e9e5ec",
  panel: "#fbf7f0",
  cream: "#f6d7a1",
  creamDeep: "#eec584",
  orange: "#ff4c00",
  mint: "#7fd8c9",
  mintSoft: "#a8e8dd",
  magenta: "#a1156e",
  magentaLight: "#e0459a",
  teal: "#2e6f68",
  rFrame: 28,
  rCard: 18,
};
```

### 4.3 Fonts (must be bundled — no Google Fonts at render time)

| Font | Source | Use |
|---|---|---|
| **Tanker** 400 | `public/fonts/tanker-400.woff2` (Fontshare, free licence) | Display headlines — the brand's signature face |
| **Mona Sans** | self-host or Google Fonts woff2 | UI / body |
| **IBM Plex Serif** | Google Fonts woff2 | Reader body, citations |
| **Caveat** 600 | Google Fonts woff2 | Handwritten annotations (EN) |
| **Marhey** 600 | Google Fonts woff2 | Handwritten annotations (AR) |

Download the woff2 files into `packages/showcase-video/public/fonts/` and register with `staticFile()` + `@font-face` in a global CSS. **Never rely on network fonts during render.**

### 4.4 Motion language (the "premium" part)

- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out) for entrances; `cubic-bezier(0.7, 0, 0.2, 1)` for exits. No linear motion.
- **Tempo:** cuts on the beat; scene lengths 4–8s; one idea per scene.
- **Transitions:** match-cut (PDF page → app page), wipe with brand color, sphere-morph, barcode scan-line.
- **Signature motifs:** chrome spheres, barcode, magenta swatch ramp, directional shadows, 28px frame radii.
- **Kinetic type:** headlines animate word-by-word with `interpolate` on `frame`; meta-labels fade with 6-frame stagger.
- **Parallax:** capture PNGs in 3 depth layers; move at 0.3× / 0.6× / 1× for depth.
- **Lower thirds:** cream card + ink text + orange index numeral, matching the product's own card system.

### 4.5 Scene breakdown (120s @ 30fps = 3600 frames)

| # | Scene | Duration | Visual | Voiceover |
|---|---|---|---|---|
| 1 | Cold open | 0:00–0:05 | Ink screen → logo draw-on, barcode scan | "What if your books could talk back?" |
| 2 | Problem | 0:05–0:12 | Stacked PDFs, red "dense" marks, frustrated reader | "Stubborn books. Med-school dense. You keep putting them off." |
| 3 | Upload | 0:12–0:22 | Real capture: drag PDF → progress → "RAG Ready" | "Drop a PDF. Ascleon splits it, indexes it, and preps the conversation." |
| 4 | Reader | 0:22–0:34 | Real capture: dark reader + studio sidebar | "A living reader that follows you page by page." |
| 5 | Voice | 0:34–0:46 | Real capture: voice studio, waveform | "Or just talk it out — live voice with your AI co-reader, up to 60 minutes." |
| 6 | Morph | 0:46–0:56 | Real capture: select → morph artifact | "Highlight a passage. Watch it become an interactive diagram." |
| 7 | Whiteboard | 0:56–1:10 | Real capture: whiteboard generation → pen hand → narrated video | "Turn any page into a hand-drawn whiteboard video with a narrated mentor." |
| 8 | QBank | 1:10–1:20 | Real capture: vignette → options → rationale | "Then get examined. Board-style vignettes, grounded in your book." |
| 9 | Progress | 1:20–1:30 | Real capture: progress dashboard | "Every session logged. Every page remembered." |
| 10 | Plans | 1:30–1:40 | Real capture: pricing / plans | "Free to start. Pro when you mean it." |
| 11 | Outro | 1:40–2:00 | Brand card, spheres, CTA, credits | "Ascleon. Talk to your books." |

**Total: 2:00 (120s).**

### 4.6 Language variants (EN / AR / MIX)

One codebase, three renders. A single `language` prop drives VO, captions, and any on-screen microcopy:

```bash
npx remotion render src/Root.tsx Showcase out/en.mp4   --props '{"language":"en"}'
npx remotion render src/Root.tsx Showcase out/ar.mp4   --props '{"language":"ar"}'
npx remotion render src/Root.tsx Showcase out/mix.mp4  --props '{"language":"mix"}'
```

| Variant | VO language | Captions | On-screen labels |
|---|---|---|---|
| `en` | English | EN | EN |
| `ar` | Egyptian colloquial Arabic | AR | AR (with EN technical terms where the product uses them) |
| `mix` | Egyptian Arabic + English technical terms | AR/EN mixed | AR/EN mixed |

- **Copy dictionary** lives in `src/lib/copy.ts` — every string keyed by `en` / `ar` / `mix`.
- **VO script** lives in `src/lib/vo.ts` — per-language text + per-scene timing.
- **Arabic rendering:** use **Marhey** for handwritten annotations and a proper Arabic face for captions; never let Remotion shape Arabic with a Latin font.
- **RTL:** captions and any Arabic-first text render right-to-left; keep numerals and brand marks LTR.
- **Mixed variant:** matches the product's own `StudyLanguage = "mixed"` behaviour (Egyptian colloquial with embedded English terms), so the VO sounds like the app.

### 4.7 Audio

- **Voiceover:** use the **existing Gemini TTS pipeline** in this repo (`lib/whiteboard/voice.ts`, `gemini-3.8-flash-tts`). The same voices (Kore, Puck, Charon, Aoede…) are already curated in `lib/whiteboard/voices.ts`.
- **Music bed:** a royalty-free track (Artlist / Epidemic / Musicbed) at −18 dB under voiceover. Cut to a beat map.
- **SFX:** subtle whoosh on transitions, paper/pen foley on whiteboard scene, UI ticks on interactions.
- **Mix:** loudness target **−14 LUFS** (YouTube/social standard), true peak ≤ −1 dBTP.

### 4.7 Render

```bash
cd packages/showcase-video
npx remotion render src/Root.tsx Showcase out/final.mp4 \
  --codec h264 --crf 18 --fps 30 --concurrency 4
```

Then mux audio:

```bash
ffmpeg -y -i out/final.mp4 -i out/audio-mix.wav \
  -c:v copy -c:a aac -b:a 192k -shortest out/ascleon-showcase.mp4
```

---

## 5. Deliverables

| Asset | Spec | Use |
|---|---|---|
| `ascleon-showcase-16x9.mp4` | 1920×1080, −14 LUFS | YouTube, website hero, sales |
| `ascleon-showcase-9x16.mp4` | 1080×1920 | Reels / TikTok / Shorts |
| `ascleon-showcase-1x1.mp4` | 1080×1080 | Feed posts |
| `ascleon-loop-15s.mp4` | 1920×1080, seamless loop | Website background |
| `ascleon-stills/*.png` | 1920×1080 | Landing page, pitch deck |
| `ascleon-showcase-project/` | Remotion source | Future edits |

---

## 6. Step-by-step execution

1. **Art direction pass** (use `claude-design` skill): lock the storyboard, type scale, color usage, transition vocabulary. → `storyboard.md`
2. **Font + asset prep:** download woff2 files, copy logo SVGs, extract brand tokens.
3. **Capture:** run the local app, record all routes + interactions → `captures/`.
4. **Audio:** write the VO script, generate TTS via the existing Gemini pipeline, pick the music bed.
5. **Build Remotion scenes:** one component per scene, brand tokens shared.
6. **Edit pass:** cut scenes to the voiceover + beat map.
7. **Render + mux:** Remotion → ffmpeg → final masters.
8. **Derive formats:** 16:9 / 9:16 / 1:1 / loop.
9. **Review:** watch at 1× and 0.5×, check for motion sickness, text legibility, brand consistency.

---

## 8. Out of scope (decided)

- **Descript** — not in the pipeline. It's an editor, not a renderer: no motion engine, no frame-accurate montage, and it duplicates what Remotion + ffmpeg already do (captions, audio cleanup, clip derivation). It only pays off for a talking-head segment, which is not planned. Revisit if a founder intro/testimonial is added later.
- **Manim / ASCII-video / Canva MCP** — wrong medium for a product showcase.

- **Live URL is bot-walled.** Capture locally.
- **Clerk handshake breaks the prod server locally.** Use `next dev`, and a real Chrome; navigate with the `__clerk_handshake` param handled by the dev server.
- **Fonts must be bundled.** Remotion renders offline; network fonts fail silently to fallback.
- **Auth-gated pages** need a real signed-in session in the capture browser.
- **Do not fake the UI in Remotion.** Real captures + designed montage beats illustrated mockups.
- **Don't install Remotion into the Next app.** Keep it in `packages/showcase-video` to avoid bloating the production bundle.
- **Keep the project version-controlled.** Re-rendering after a product change should be a one-command operation.
