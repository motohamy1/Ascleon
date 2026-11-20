# PhysioTalk.app reverse engineering: 3D board + whiteboard

Investigation date: 2026-11-18. Target: `https://www.physiotalk.app/3d` (public demo, no account).

All facts below are from downloaded production bundles, live CDP captures of the running page, and the public JSON/MP3 assets. Inferences are labelled.

---

## 1. The headline finding

**The 3D board is not generated live in the browser. It is pre-baked content played back by a custom engine.**

The public demo fetches a static JSON script (`/see-3d/physio.json`, `/see-3d/ml.json`) plus one pre-recorded MP3 per step (`/see-3d/<board>/<step>.mp3`), then feeds them into a local `BoardController`/`BoardPlayer`. No AI call happens during playback. In the public demo the ask/make functions are literally stubbed:

```js
n = () => Promise.reject(Error("not on the public demo"))
```

The AI generation happens **server-side ahead of time**, with heavy caching, and the result is frozen into JSON + audio assets. That is the main answer to "how did they succeed" and "why can't we make it like them": it is an authored, cached artifact pipeline, not a real-time generative session. Three.js is open source; the moat is the rigged anatomy asset library and the constrained scene format.

### Stack observed
- Next.js 16.3.8 + Turbopack, Sentry 16.3.8, bilingual EN/AR (`/ar/...` routes), theme tokens via CSS variables.
- Fonts self-hosted via `next/font`: Plus Jakarta Sans, Newsreader, Noto Naskh Arabic, IBM Plex Sans Arabic.
- Three.js **r181** (`REVISION = "181"`), WebGLRenderer, GLTFLoader + **DRACOLoader (WASM)**.
- KaTeX for LaTeX formulas; d3-style math/plot code; React for all board UI.
- Assets on Cloudflare R2: `https://pub-f26c728c67fc4a1cb2fabc1e935fb25b.r2.dev`, Draco decoder at `/lab/draco/`.

---

## 2. The pre-generated script format (`/see-3d/*.json`)

Top level:

```json
{
  "v": 1, "id": "physio", "lang": "en", "depth": "deep", "voice": "Sulafat",
  "source": {
    "variant": "board3d-en-deep-sulafat-t1-lab",
    "unit": "p:11", "promptVersion": 1,
    "copiedAt": "2026-11-18T12:54:19.743Z"
  },
  "models": ["elbow"],
  "steps": [ { "say": "...", "show": "...", "ops": [...], "scene": {...}|null, "durationMs": 9253 } ]
}
```

Each step has:
- `say`: full narration (also synthesized to `<dir>/<board>/<index>.mp3`, confirmed HTTP 200, `audio/mpeg`, ~48 KB).
- `show`: short caption (truncated `say`) displayed under the board.
- `ops`: whiteboard write operations.
- `scene`: 3D scene descriptor (null for flat text steps).
- `durationMs`: exact step length used for audio/timeline sync.

`source.variant`, `promptVersion`, and `copiedAt` show the JSON came from a versioned LLM prompt and was then copied/frozen as a static asset.

### Whiteboard ops (`ops[].t`)
Observed: `title`, `write`, `formula` (KaTeX `tex`), `bullets`. Bundle code also handles `parts`, `plot`, `surface`, `descent`, `neuron`, `separator`, `molecule`, `reaction`, `nnet`.

### Scene elements (`scene.els[].t`)
- `anatomy`: `{ model: "elbow", modelVersion: 1, cue: { to: { "hu.flexion": 145 }, from: {}, kind: "pose"|"action", action: "flexion-extension", phases: ["flex"], marks: [], highlight: ["biceps","brachialis"] } }`
- `surface`: `{ fxy: "(x^2 + y^2)", xmin, xmax, ymin, ymax, params: [], controls: [] }`
- `plot`: `{ curves: [{ fx: "x^2", label: "Cost" }], params: [{ name:"a", min:0, max:2, value:1 }], controls: ["a"] }`

`scene.cam` is one of `front`, `side`, `iso`. The `params`/`controls` are the sliders: the app recomputes every plotted number from the math expression on interaction. The UI explicitly says: "Worked out by the app from the inputs - not typed by the AI." This is a core correctness trick: the AI only chooses structure/formulas; deterministic code computes all values.

---

## 3. The anatomy model library (the real moat)

Manifest from bundle `0kwce14l_mqy8.js` (module 334757 etc.), three models: **elbow, knee, shoulder**.

Example (elbow, version 1):
- `originMm: [-210, -86, 1071]`
- `bones`: `scapula` (4520 verts / 9000 tri), `humerus` (2233 / 3784), `ulna` (500 / 834), `radius` (388 / 672), `hand` (1748 / 3058), each with `min`/`max` bounding boxes in millimetres.
- `landmarks`: dozens of named 3D points in mm: `acromion`, `glenoid`, `hum-head`, `greater-tubercle`, `hum-lat-epicondyle`, `elbow-axis`, `via-biceps`, `olecranon`, `radial-head`, `radial-tuberosity`, `middle-fingertip`, etc.
- `asset`: `{ file: "model.glb", bytes: 38912, sha256: "f228ad7a…" }` (shoulder: 21264 bytes; knee also present).

Inference: these are real, medically-derived, Draco-compressed glTF meshes with named `bone_*` nodes, plus a hand-authored rig (landmarks + degrees of freedom + muscles/ligaments paths). Reproducing this requires asset work, not just code.

The rig solver lives in bundle `278f9t7g5ro79.js` (module 316182 / 144432) exporting `solvePose`, `bandRatio`, `ligamentTension`, `testPoseAt`, `goniometerReading`, `positionRotation`, `apply`, `applyDir`, `IDENTITY`, `compose`, `normalize`, `sub`. It maps a pose (DOF values like `hu.flexion: 145`) into bone matrices and landmark world positions.

---

## 4. The custom `LabScene` renderer (Three.js r181)

Class exported from bundle `0e4hx0r-x_0mm.js` (module 601362), loaded via `e.A(541357).then(({LabScene}) => …)`.

Key implementation facts (all observed in the minified source):

- **Coordinate conversion**: `mm → m` and axis swap: `new Vector3(e[0]/1000, e[2]/1000, -e[1]/1000)`.
- **Renderer**: `WebGLRenderer({ antialias: devicePixelRatio < 2, alpha: true, powerPreference: "default", preserveDrawingBuffer: recordable.on })`; DPR capped at 2; sRGB output. `preserveDrawingBuffer` exists to support PNG/WebP snapshot and video export.
- **Camera**: `PerspectiveCamera(35, 1, 0.01, 20)` + `OrbitControls` (pan disabled, distance 0.25–3). Auto-framing computes a `Box3` over solved landmarks, then `setCamera("front"|"side"|Vector3)` with FOV-based distance.
- **Lighting**: `HemisphereLight(0xffffff, 6715272, 2.1)` + two `DirectionalLight`s (1.6 and 0.6) positioned `.6,1.2,1.4` and `-1,.4,-1.2`.
- **Bones**: GLB meshes named `bone_<id>`; geometry normals recomputed; `MeshStandardMaterial({ roughness:.82, metalness:0 })`; color from CSS var `--lab-bone`; "context" bones rendered transparent (opacity .32, depthWrite false). Per frame, each bone's `matrix` is copied from the pose solver's rotation+translation matrix; selected bones get emissive highlight.
- **Muscles / ligaments ("bands")**: chains of cylinder segments between solved landmark `path` points; thickness from `bandRatio`/`ligamentTension`; muscle color from `--lab-muscle`, active from `--a500`; slack/taut/tight from `--s400`/`--warn`/`--bad`; emissive intensity for active/selected; inactive bands fade to opacity .45.
- **Test overlays** (`drawTest`): couch plane for supine positioning, gravity `ArrowHelper`, examiner markers (stabilise `--b600`, resist `--bad`, palpate `--good`) as spheres + optional resistance arrows, and a goniometer drawn with `Line` + `ArrowHelper`-style markers plus a live degree reading.
- **Labels**: plain DOM `div.lab-label` elements created into an overlay, positioned by projecting 3D landmarks with `Vector3.project(camera)`, with `data-tone`, `dir="auto"`, EN/AR chosen from `document.documentElement.lang`. Tapping a muscle/bone uses a `Raycaster` over band segments and bone meshes (`onUp`, 6px drag threshold) → `onPick({kind,id})`.
- **Anchors**: normalized 0–1 screen coordinates of muscle/bone label points, returned alongside snapshots for interactive video/hotspots.
- **Snapshot**: `renderer.domElement.toDataURL("image/webp", 0.82)` + `anchors()`, used by PNG/PDF/"Share as video".
- **Lifecycle**: `ResizeObserver`, single `requestAnimationFrame` render loop that also redraws labels; full `dispose()`.

Live verification: clicking "Play the 3D board: Testing C5" loaded 14 additional chunks, created a `<canvas>` (682×385), and step 2 rendered a 3D elbow with bone meshes, red/cyan muscle/ligament bands and DOM labels "Biceps brachii", "Brachialis", "Ulnar collateral ligament (anterior band)", "Radial collateral ligament". Screenshot: `C:\Users\mtoha\AppData\Local\Temp\opencode\physiotalk_step2.png` (also `physiotalk_3dboard.png` for step 1).

---

## 5. The player / orchestration (`BoardController`, `BoardPlayer`)

Bundle `39ofo65c4_ytb.js` (module 931875 / 812095).

- `BoardController` is a state machine: `subscribe/getState/set`, `open`, `close`, `pull`, `ask`, `interruption`, `backToExplanation`, `openRunUnit`, `teardown`.
- Step pulling is incremental (`maxPull: 3` in `BOARD_ENGINE`) with a `from`/`count` query; the demo adapter supplies `demoStepsResponse(json, from, count)` from the static JSON.
- Per-step audio: `this.audio`, `this.audioStep`; playback controls speed (`1×` etc.), captions toggle, pace ("flow" vs step-by-step), MediaSession integration, keyboard shortcuts (space, arrows, Home), `AUTO_RETURN_MS = 2000`.
- LocalStorage remembers resume positions per lecture/unit/preset.
- UI modes seen live: **Guided / Explore / Challenge**, plus PNG, PDF, "Share as video", Fit/Large/Full width/Full screen, timeline with step markers.
- Challenge types in bundle: `sort` (drag to order), `pick`, `predict`, `choose`, with `challengeDone(...)` verification.

Public demo bootstrap (bundle `1g7vgwz_7cgen.js`):
```js
function c(e){ return new o.BoardController(async t => (0,u.demoStepsResponse)(e,t.from,t.count), n, n, async()=>({})) }
// loadDemo: fetch((0,u.demoJsonUrl)(e)) -> /see-3d/<board>.json
// preset: { lang, depth, voice, style: "board3d" }
```

---

## 6. The server-side AI content pipeline (inferred from shipped config)

Client bundles ship the config object (bundle `32ymx270_4mm-.js`):

- `BOARD_ENGINE`: `maxPull:3`, `maxSectionPages:80`, `scriptLeaseMs:75e3` (complete 170e3), `scriptMaxOutputTokens` per depth (page quick 1400 / standard 2200 / deep 3000 / complete 9000; section up to 9000; answer 1100–2800), **`scriptMaxOutputTokens3d`** (page 2400/3600/4800; section 3600/5200/6600), `maxAnatomyModels:2`, `maxFiguresOffered:6` (complete 24), `maxFigurePages:2`, `maxFigurePdfBytes:6e6`, `minChars:40`, `voiceShare:.85`, `askMaxChars:600`, `makeAheadUnits:2`, `wholeChunkPages:8`.
- `LESSON_ENGINE`: `voices: [{id:"Sulafat", female}, {id:"Algieba", male}]`, `pullBudgetMs:35e3`, `scriptLeaseMs:90e3`, `clipLeaseMs:60e3`, `waitMs:30e3`, `pollMs:600`, `clipUrlTtlSeconds:21600` (6 h), `scriptMaxOutputTokens:3000`, `reuseFromPromptVersion:2`, `janitorDays:180`, `makeAheadPages:5`.
- `LIMITS`: PDF only, max 50 MB (`0x3200000`), 300 pages, batch 10, exports 3/day, timezone `Africa/Cairo`.
- `CHAT`: `contextTokenBudget:5000`, 6 history messages, `arabicScriptRatio:.3`, depth budgets, retries/backoff.
- Vendor chunk `1hwph57r_21wc.js` contains the **Google GenAI SDK** (`@google/genai` style: `promptFeedback`, `blockReasonMessage`, `auto.ai.google_genai`, `functionCalls`, `usageMetadata`), React and Sentry.
- `Sulafat` and `Algieba` are Google Cloud Text-to-Speech voices, so narration is almost certainly Google Cloud TTS rendered to MP3 and cached (inference from voice IDs + `clipLeaseMs`/`clipUrlTtlSeconds`).
- The LLM's job is to pick a scene structure, formulas and narration text **constrained to a schema**; it is not asked to produce the final visuals or numbers.

---

## 7. Why Ascleon "can't make it like them" (diagnosis)

1. **Wrong mental model.** Ascleon's current design (from project memory) drives a VideoScribe-style marker and LLM-generated SVG scenes live through Gemini Live function calls. PhysioTalk does the opposite: freeze a fully-formed script + audio ahead of time, then play it. Live generation cannot match the smoothness, correctness or exportability of a pre-baked artifact.
2. **Missing asset library.** Their 3D quality comes from rigged, millimetre-accurate GLB anatomy models with named bones/landmarks and hand-authored muscle/ligament paths. This is months of 3D/medical asset work; no amount of prompting produces it.
3. **Missing constrained DSL.** `ops`/`scene`/`cue` is a small, typed vocabulary the renderer understands. The LLM fills slots; the app computes all numbers from math expressions (`fxy`, `fx`, `params`). Ascleon's free-form SVG generation has no such correctness guarantee.
4. **No audio-first timeline.** Each step is length-matched to a pre-recorded MP3 (`durationMs`); captions, scene changes and controls are synchronised to that timeline. That is why it feels like a narrated video rather than a chat that occasionally draws.
5. **Engineering polish.** Draco-compressed models on R2, WASM decoder, DPR-aware WebGL, WebP snapshots with anchors, video export, step resume, keyboard shortcuts, EN/AR labels, theme tokens from CSS variables.

### What to copy (practical)
- Adopt a frozen script format: `steps[{ say, show, ops, scene, durationMs, audioUrl }]`.
- Pre-generate with a schema-constrained LLM call; cache by `(lecture, unit, lang, depth, voice, promptVersion)`; synthesize audio server-side.
- Compute every displayed number in code from expressions + slider params.
- Build a small set of rigged GLB models with named bones/landmarks, or start with 2D+surface widgets and add 3D later.
- Use the outline of `LabScene` (Three.js r181, GLTFLoader+Draco, CSS-variable colours, DOM labels, raycast picking, WebP snapshot).
- Keep live voice for Q&A ("ask"), not for driving the board choreography.

---

## 8. The whiteboard itself (separate from the 3D board)

There are **two** whiteboard systems in the app, and neither is drawn live by an AI.

### 8a. The generated "board" tool (reader tool `whiteboard` -> group `board`)

The reader maps tool names to groups: `whiteboard:"board"`, `"3d"/"3d-board":"board3d"`, `explain:"lesson"`. So the plain whiteboard is a sibling of the 3D board, not the same component.

It is a **pure layout function plus a canvas painter**, both shipped in the player chunk `39ofo65c4_ytb.js` (modules 97559, 386891):

1. `layoutBoard(steps, {rtl, figures})` takes the same `ops` vocabulary (`title`, `write`, `bullets`, `term`, `flow`, `compare`, `cycle`, `timeline`, `figure`, `pointer`, `clear`, `formula`) and returns a flat list of primitives: `{k:"fill"}`, `{k:"image"}`, `{k:"text"}`, `{k:"formula"}`, `{k:"stroke"}`, each with a `page`, `step`, `seq` and measured weight.
2. Fixed virtual paper: `BOARD = {w:1000, h:625, m:26, gap:16, colGap:28, textCol:368, gutter:132, figureRoom:300, minScale:.55}`. Everything is laid out in this coordinate space and positioned as percentages in the DOM (live check: `left:2.6%; top:4.16%; width:94.8%; height:7.36%`).
3. **Deterministic handwriting.** A seeded PRNG (`x()`, FNV-1a hash of `${id}:${type}` plus mulberry32-style steps) drives a resampling function that offsets polyline points perpendicular to the stroke with a sine envelope and small jitter. It produces pencil/ink-like wobbles that are identical on every render. No random flicker.
4. Handwritten look comes from a real font: `Kalam` for Latin, `Playpen Sans Arabic` for Arabic (`BOARD_FONT`, `BOARD_FONT_AR`). Fonts are explicitly preloaded with `document.fonts.load()` for 400/700 of both faces, and painting also waits on `document.fonts.ready` plus a `loadingdone` listener.
5. `BoardSurface` renders primitives as absolutely positioned DOM nodes with `visibility:hidden` (text/fill/image/formula) and paints strokes onto a `<canvas>` via `drawStrokes` (Path2D from pressure-sensitive outlines, cached in a WeakMap). Text nodes are measured with `scrollWidth`/`scrollHeight` and squeezed with `scaleX()` so they never wrap. KaTeX formulas are rendered with `renderToString` and scaled to fit.
6. **Reveal animation** is driven by `revealAt(layout,page,step,fraction)`: strokes are drawn progressively with `partialStroke`, text is uncovered with a `clipPath: inset(...)` wipe, formulas fade in. A `requestAnimationFrame` loop repaints only while playing; otherwise a single paint.
7. Canvas resolution is `BOARD.w * scale * min(devicePixelRatio, 2.5)`, so it stays crisp at any size. `ResizeObserver` drives rescaling.
8. Export reuses the same primitives: offscreen canvas, paper `#ffffff`, fills from `BOARD_FILL_HEX` (sky/mint/sand/head/zebra/note/lilac), text drawn with `fillText`, strokes drawn last, then `toBlob("image/png")`. PDF/video export rasterises the same way.

### 8b. The freehand ink engine (module 234116)

A separate, self-contained annotation layer over PDF pages, with:
- Stroke model `{k, c, w, points:[{x,y,p}]}` and compact serializer `canonicalInk` (`${k}${c}${w}:${points}`).
- Pen widths `[2.2, 3.6, 6]`, highlighter width 22 at alpha .38, eraser radius 9, ink/highlight colour maps.
- `finishStroke` decimates to `maxPoints` and guarantees two points; `eraseFromStroke` interpolates and splits a stroke around the eraser.
- Proper undo/redo (`historyPush/historyUndo/historyRedo`) with bounded `past/present/future`.
- `strokeOutline` + `outlineToPath` produce pressure-aware `Path2D`; `drawStrokes` paints with a WeakMap outline cache.
- `renderSlideWithInk`: pdf.js renders the page to canvas, then highlighter strokes are composited with `globalCompositeOperation="multiply"`, then pen strokes, then `toDataURL("image/jpeg", .86)`.
- `splitSketches` separates freehand drawing from laid-out words by >=50% bounding-box overlap; `strokesInLasso` does point-in-polygon selection; `pointerDraws` decides pen vs mouse vs finger.
- Storage keys `physiotalk.ink.pen`, `physiotalk.ink.finger`, `physiotalk.ink.autoText`; `handwritingCredits` and `noteAiCredits` gate AI-assisted ink features.

### 8c. Why this whiteboard is reliable and the Ascleon one is not

Observed design choices that make it robust:
- The AI never draws. It emits small structured ops. A pure, deterministic function computes the entire visual layout.
- Jitter is seeded from element identity, so the "hand-drawn" look is stable across repaints, resizes and exports.
- Fonts are explicitly awaited before any text is measured or painted, so no fallback-font reflow.
- Motion is a reveal of already-computed geometry, not the creation of content. Content exists whether or not the animation runs.
- The ink layer is an ordinary, well-modelled document with serialisation, undo/redo and bounded point counts. It does not depend on a model call.
- PDF and image export reuse the same primitives and the same painter, so WYSIWYG by construction.

Ascleon's current design (from project memory) drives a VideoScribe marker and LLM-generated SVG scenes live through Gemini Live function calls. That path is asynchronous, non-deterministic, and the visual output depends on a model continuing to stream correctly. Any stall, malformed SVG, or dropped tool call leaves the board half-drawn or blank. That is the root cause, not the drawing library.

### 8d. Concrete port plan for Ascleon
1. Freeze explain output into `steps[{say, show, ops, durationMs, audioUrl}]`; generate with a schema-constrained call, cache by (lecture, unit, lang, depth, voice, promptVersion).
2. Implement a pure `layoutBoard(ops)` returning fill/text/formula/stroke primitives in a fixed 1000x625 space. Use a seeded PRNG for the sketchy strokes.
3. Paint with one canvas, preload the handwriting face, and measure text in hidden DOM nodes with `scaleX()` fitting.
4. Drive reveals from the audio timeline via a `fraction -> progress` function; repaint only while playing.
5. Keep live voice strictly for Q&A, never for board choreography.
6. If freehand drawing is needed, model strokes explicitly with undo/redo, pressure, eraser splitting and a multiply-blended highlighter over the PDF.

---

## 9. Evidence and limitations

- REA browser capture Evidence: `ev_473bb1ba8567e9993d72ac0796d8f6786a091125c15f36afd77dbf3f11dde5e4` (`capture_browser_scenario` on `/3d`, 295 events retained, 64 dropped, budget-limited) and `ev_6d2e65a06bb4bad3e388269a6cd2430c09bc2c0116e08a0ee781f9568ea78197` (`list_browser_targets`).
- REA `analyze_web_bundle` was attempted but the MCP process OOM'd; detailed bundle analysis was done with direct downloads + CDP `Debugger.getScriptSource` instead.
- Local captures: `C:\Users\mtoha\AppData\Local\Temp\opencode\physiotalk_re` (initial bundles), `...\physiotalk_runtime` (runtime scripts), `...\physiotalk_player` (on-demand player chunks), `...\physiotalk_lab` (Three.js + LabScene), plus the two screenshots.
- Source maps were not available; all implementation descriptions come from minified production code. Variable/module names were renamed by the bundler, so names like `n`, `e.A`, module IDs are exact strings but not original source identifiers.
- The full authenticated app behind `/sign-in` was not inspected. Server-side source (prompts, TTS provider code) is not shipped to the client; those parts are inferred from config and SDK presence.
