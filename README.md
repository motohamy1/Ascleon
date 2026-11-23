# Ascleon

**A one-of-a-kind AI study companion walking alongside every student throughout their journey with the lectures and books they study.**

Ascleon is an AI-powered Living Study Studio built for medical, clinical, and dense academic material. Rather than acting as a generic chatbot, it stays with the student from the first lecture slide and textbook chapter to exam-day mastery—turning static PDFs into an interactive, trilingual (**English**, **Egyptian Colloquial Arabic**, and **Mixed عربي/EN**) workspace with side-by-side diagram snipping, a real-time bilingual voice mentor, interactive diagnostic roadmaps, live physiology simulators, handwritten whiteboard lessons, and case-based QBank practice.

---

## Core Capabilities

### 1. Sources Study & Smart Snip
- **Side-by-Side PDF Reader** (`components/reader/OriginalPdfViewer.tsx`, `LivingReader.tsx`) powered by `pdfjs-dist` with zoom, fit-width/fit-page, and `paper` / `ink` reading themes.
- **Text Selection & Diagram Snipping** (`SourceSelectionToolbar.tsx`): Highlight any passage or crop any textbook diagram and send it directly to the AI Studio (*"Turn this section into magic"*) to synthesize grounded notes, Morph artifacts, or QBank vignettes.
- **Scoped Study Context** (`StudyScopeBar.tsx`): Scope AI responses to the active selection, current page, custom page range, or an entire resolved topic.

### 2. Ascleon Voice (Live Bilingual Oral Mentor)
- **Real-Time Voice Tutoring** (`components/reader/AscleonVoiceStudio.tsx`, `hooks/useLiveVoice.ts`, `public/worklets/pcm-recorder.js`, `pcm-player.js`) using the Gemini Live API (`@google/genai`) with `@vapi-ai/web` support.
- **Trilingual Study Modes** (`lib/language.ts`): Switch seamlessly between `EN` (English), `عربي` (Egyptian Colloquial Arabic), and `Mix عربي/EN` (Egyptian Arabic explanations with English technical/clinical terminology).
- **Page-Grounded Conversations**: Discuss concepts out loud while the tutor tracks your active textbook page and RAG-indexed book segments.

### 3. Grounded AI Study Agent
- **Socratic Clinical & Academic Mentor** (`lib/ai/agent-harness.ts`, `app/api/reader-assistant/route.ts`): Grounded first in your uploaded source via background RAG digestion (`lib/ai/rag/digestion-engine.ts`, `book-rag-retriever.ts`) and enriched with canonical domain references.
- **BiDi & Scientific Rendering**: Clean Unicode chemical/electrolyte notation, `katex` math rendering, and mixed RTL/LTR layout handling (`components/ui/BiDiText.tsx`).

### 4. Morph Engine (Visual Studio & Live Simulators)
- **Interactive Diagnostic Roadmaps & Concept Maps** (`MorphCanvas.tsx`, `ConceptMapCanvas.tsx`, `InteractiveJourneyStage.tsx`): Convert textbook sections into interactive node graphs with Think-Stage clinical checkpoints and structured comparison tables.
- **Live Simulations & 3D Labs** (`components/board/lab/LabScene3D.tsx`, `InteractiveSimControls.tsx`): Interactive physiology simulators (such as live P-QRS-T ECG waveform controls) and Three.js 3D lab scenes.

### 5. Living Board & Whiteboard Video Studio
- **2D Handwritten Whiteboard Lessons & Videos** (`components/whiteboard/WhiteboardVideoStudio.tsx`, `components/board/LessonBoardPlayer.tsx`): Animated sketch layers, pen-hand rendering, camera rig transitions, and synchronized voice narration.

### 6. Clinical QBank & High-Yield Summaries
- **Board-Style QBank** (`app/api/qbank/route.ts`): Case-based MCQ assessments with instant feedback and rationales.
- **High-Yield Summaries** (`app/api/summary/route.ts`): Clinical pearls, mnemonics, and differential comparison matrices.

### 7. Personal Library, Progress & Subscriptions
- **Bookshelf & Smart Shelf Classification** (`components/library/PersonalLibrary.tsx`, `Bookshelf.tsx`, `lib/library/shelf-classifier.ts`): Organize uploaded PDFs with background ingestion status tracking (`RagDigestionBadge.tsx`).
- **Flexible Storage** (`lib/storage/index.ts`): Supports Vercel Blob, Cloudflare R2, Cloudinary, and local PDF caching.
- **Study Progress & Usage Metering** (`components/progress/ProgressView.tsx`, `lib/subscription-constants.ts`, `lib/usage.server.ts`): Tracks study progress alongside `Free`, `Standard`, and `Pro` credit/voice-minute tiers and an admin console (`/subscriptions/admin`).

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling & UI** | Tailwind CSS v4, Radix UI, Lucide Icons, Sonner, KaTeX |
| **3D & Visualization** | Three.js, custom Canvas/SVG whiteboard & concept-map engines |
| **AI & Voice** | Google Gemini (`@google/genai`, Gemini Live API), Groq / OpenRouter / OpenAI fallbacks, Vapi (`@vapi-ai/web`) |
| **Database & Auth** | MongoDB + Mongoose, Clerk (`@clerk/nextjs`) |
| **PDF & Storage** | `pdfjs-dist`, Vercel Blob, Cloudflare R2 (`@aws-sdk/client-s3`), Cloudinary |
| **Testing** | Vitest (`vitest run`) |
| **Showcase Video** | Remotion workspace under `video/` (and `packages/showcase-video/`) |

---

## Project Structure

```text
app/
  (root)/                 # Pages: Home (/), Study Space (/space/active, /books/[slug]),
                          # Library (/library), Progress (/progress), Subscriptions (/subscriptions)
  api/                    # Route handlers: reader-assistant, morph, qbank, summary,
                          # voice/session, voice/token, whiteboard/lessons, whiteboard/videos,
                          # books/digest, books/ingest-background, storage, subscriptions, usage
components/
  reader/                 # LivingReader, OriginalPdfViewer, MorphCanvas, AscleonVoiceStudio, etc.
  whiteboard/ & board/    # WhiteboardVideoStudio, LessonBoardPlayer, LabScene3D, simulators
  library/                # PersonalLibrary, Bookshelf, BookSpine, DirectBookUpload
  subscriptions/          # SubscriptionHub, SubscriptionAdminConsole
  progress/               # ProgressView
database/
  models/                 # Mongoose schemas (Book, BookSegment, KnowledgeNode, MorphArtifact,
                          # LessonBoard, WhiteboardVideo, VoiceSession, StudyProgress, Usage/Subscription)
lib/
  ai/                     # Agent harness, model cooldowns, RAG digestion & retrieval, knowledge corpus
  board/                  # Layout, math presets, PRNG sketch, rig solver, timeline
  whiteboard/             # Script, sketch, vectorize, voices, video-mapper
  storage/                # Vercel Blob, R2, Cloudinary, and local cache adapters
video/                    # Remotion showcase compositions & feature clips
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB instance
- Clerk application keys
- At least one AI provider key (primarily `GEMINI_API_KEY`)
- At least one object storage provider (Vercel Blob, Cloudflare R2, or Cloudinary)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Create a `.env.local` file in the project root:

```env
# Database
MONGODB_URI=

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# AI Providers
GEMINI_API_KEY=
GROQ_API_KEY=              # Optional fallback
OPENROUTER_API_KEY=        # Optional fallback
OPENAI_API_KEY=            # Optional fallback

# Voice (Optional Vapi fallback)
NEXT_PUBLIC_ASSISTANT_ID=

# Storage (configure at least one)
BLOB_READ_WRITE_TOKEN=
# or BLOB_ASCLEON_READ_WRITE_TOKEN=
# or R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL
# or CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET

# Admin Access (Subscriptions Console)
ADMIN_EMAILS=
ADMIN_USER_IDS=
```

### 3. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests (`vitest run`) |
