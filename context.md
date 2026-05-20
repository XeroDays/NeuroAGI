# NeuroAGI — context.md

---

## Rules for this file

1. **Read first.** When this file is referenced in any query, read it fully and use its content to find context relevant to the user's question.
2. **Keep it current.** Any time a file, workflow, or procedure in this project changes, the related context in this file **must be updated** in the same session so it stays accurate for future use.
3. **Scope.** This file contains only: **rules**, **workflow/procedure descriptions**, **design specifications**, and **project context**. No tutorials, troubleshooting guides, or README-style content — that belongs in `README.md`.
4. **Single source of truth.** If context here conflicts with code, the code is correct — update this file to match.

---

## Project context

**NeuroAGI** is an Electron + JavaScript desktop app for health diagnostics.

| Key | Value |
|-----|-------|
| Runtime | Electron ^28 |
| Language | JavaScript (CommonJS in main/preload, ES modules in renderer) |
| UI | Plain HTML + CSS + JS (no framework) |
| Entry | `src/main/index.js` |
| Start | `npm start` → `scripts/start-electron.js` |
| API | OpenRouter (streaming chat completions via SSE) |
| Env | `.env` file at project root (git-ignored); loads via `dotenv` at top of `src/main/index.js` |
| Dependencies | `electron` (devDep), `dotenv` (dep), `jsonrepair` (dep) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: dotenv config, hide menu, register IPC, create window
│   ├── ipc/
│   │   └── register.js       # IPC handlers: ping, startReportCollection, submitQuestionnaire, openDevTools
│   ├── middlewares/
│   │   └── collector-middleware.js # StartReportcollection({ issue, gender, age }) — entry from home screen, tiered JSON parser (strict → normalize → jsonrepair). SubmitQuestionnaire({ issue, gender, age, questions, answers }) — logs the full Q&A dump on questionnaire submit
│   ├── helpers/
│   │   └── query-generator-helper.js # GenerateQuestionnaireLLMQuery({ issue, gender, age }) — builds intake-doctor prompt that returns a JSON array of questions
│   ├── services/
│   │   └── api-helper.js     # streamChat() (SSE) + chatCompletion() (non-streaming JSON); reads process.env.OPENROUTER_API_KEY
│   └── windows/
│       └── main-window.js    # BrowserWindow: 800x600, hidden until ready, preload + contextIsolation
├── preload/
│   └── index.js              # contextBridge → window.electronAPI { ping, startReportCollection, submitQuestionnaire, openDevTools }
├── renderer/
│   ├── index.html            # Home screen
│   ├── screens/
│   │   ├── questionnaire/
│   │   │   └── index.html    # Questionnaire screen (shown after home submit)
│   │   └── doctor/
│   │       └── index.html    # Doctor screen (shown after questionnaire submit; placeholder body for now)
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_QUESTIONNAIRE, SCREEN_DOCTOR, SCREEN_DIAGNOSES_ROOM, labels
│   │   ├── app.js            # Home screen: populates UI, navigates to questionnaire with issue/gender/age params
│   │   ├── questionnaire.js  # Questionnaire screen: calls startReportCollection on load, renders per-type controls, on Submit calls submitQuestionnaire IPC and navigates to doctor screen
│   │   └── doctor.js         # Doctor screen: sets titles, renders summary from URL params
│   ├── styles/
│   │   ├── app.css           # Home screen pastel theme
│   │   ├── questionnaire.css # Questionnaire pastel theme + responsive grid + centered spinner overlay
│   │   ├── doctor.css        # Doctor screen pastel theme + centered glass card
│   │   └── diagnoses-room.css # Chat screen dark theme (orphan — no HTML consumer)
│   └── assets/
│       ├── images/
│       ├── fonts/
│       └── icons/
└── shared/
    └── ipc/
        └── channels.js       # IPC channel name constants (mirrored in preload)
```

---

## Workflows

### App startup

1. `npm start` → `scripts/start-electron.js` spawns Electron
2. `src/main/index.js` runs: loads `.env` via `dotenv`, hides menu, registers IPC handlers, creates main window
3. `main-window.js` creates BrowserWindow (hidden), loads `src/renderer/index.html`, shows on `ready-to-show`

### Home screen → Questionnaire navigation

1. User types health issue in text input, selects gender and age from dropdowns
2. Clicks the submit button (arrow icon) **or** presses **Ctrl+Enter** / **Cmd+Enter** while the health input has focus — `app.js` listens for the shortcut on the input and synthesises a click on the submit button
3. `app.js` builds query string (`?issue=...&gender=...&age=...`) and navigates to `screens/questionnaire/index.html` (no IPC call from home — avoids freezing while LLM responds)

### Settings (gear icon) → DevTools toggle

1. Home screen renders a fixed glass gear icon in the top-right (`#btn-settings` in `src/renderer/index.html`)
2. Click handler in `app.js` calls `window.electronAPI.openDevTools()`
3. Preload invokes IPC channel `OPEN_DEV_TOOLS`
4. `register.js` handler resolves the calling `BrowserWindow` via `BrowserWindow.fromWebContents(event.sender)` and calls `win.webContents.toggleDevTools()` — clicking again hides DevTools

### Questionnaire screen → LLM question generation

1. `questionnaire.js` on `DOMContentLoaded` reads `issue`, `gender`, `age` from URL params, fills the summary, and shows a `Loading questions…` status
2. It calls `window.electronAPI.startReportCollection({ issue, gender, age })` → IPC `START_REPORT_COLLECTION`
3. Main process: `register.js` invokes `StartReportcollection()` in `collector-middleware.js`
4. The middleware builds the prompt via `GenerateQuestionnaireLLMQuery()` and calls `chatCompletion()` in `api-helper.js` (non-streaming OpenRouter request)
5. The raw LLM string is stripped of markdown code fences and sliced from first `[` to last `]`. It is then passed through a **three-tier parser**:
   - **Tier 1 — strict `JSON.parse`** (happy path; no extra cost when the model returns clean JSON)
   - **Tier 2 — normalize then `JSON.parse`** (replaces smart quotes with ASCII, strips `//` and `/* */` comments, removes trailing commas)
   - **Tier 3 — `jsonrepair` then `JSON.parse`** (handles broader structural damage)
   On any tier failure the parser logs an 80-char window around the bad character; if all three tiers fail the full raw response is logged and an error propagates. On success the middleware returns `{ ok: true, issue, gender, age, questions }`; on failure it returns `{ ok: false, error }`
6. `questionnaire.js` hides the status box, reveals `#q-form`, and renders one `<section class="q-card q-card--{type}">` per question with type-specific controls; reveals the Submit button
7. Submit click collects all answers (`{ question, type, value }[]`), then proceeds to the next workflow

### Questionnaire submit → Doctor screen

1. User clicks Submit on the questionnaire; `questionnaire.js` collects answers via `collectAnswers(formEl)` and disables the button (label switches to `Submitting…`)
2. Renderer calls `window.electronAPI.submitQuestionnaire({ issue, gender, age, questions, answers })` → IPC `SUBMIT_QUESTIONNAIRE`
3. Main process: `register.js` invokes `SubmitQuestionnaire()` in `collector-middleware.js`
4. The middleware logs a structured Q&A dump to the main-process console (one `Q{n} [type] text` line and one `A{n}: value` line per question, framed by `=== Q&A dump ===` markers) and returns `{ ok: true }`
5. On success the renderer navigates to `screens/doctor/index.html?issue=…&gender=…&age=…`; on failure the Submit button re-enables and the centered error card appears
6. `doctor.js` reads the URL params and renders the patient summary; the body is a placeholder card ("We're consulting the doctor") pending the next step (e.g. diagnostic report generation). The Back link in the doctor header points to the **home screen** (`../../index.html`), not back to the questionnaire — going back to a stale questionnaire after a submit would re-trigger the LLM and confuse the user

### Chat streaming (Diagnoses Room ↔ OpenRouter) — **CURRENTLY DISABLED**

The chat feature has been removed from the renderer:
- `src/renderer/scripts/ai-helper.js` was **deleted**
- `src/renderer/scripts/diagnoses-room.js` was **deleted** (its only job was to set titles; the screen itself is orphan)
- Preload no longer exposes `openRouterChatStream`
- `register.js` no longer handles `OPENROUTER_STREAM_START`
- Channels `OPENROUTER_STREAM_*` removed from `src/shared/ipc/channels.js`

Still present (orphan, ready to reuse):
- `src/main/services/api-helper.js` — `streamChat()` + `OPENROUTER_MODEL`
- `src/renderer/styles/diagnoses-room.css` — full dark chat theme (no HTML consumer; remove when no longer wanted as a style reference)

The screen HTML (`src/renderer/screens/diagnoses-room/index.html`) was deleted along with its script. To re-enable: re-add the channels, re-expose `openRouterChatStream` in preload, re-register the handler in `register.js`, recreate the screen HTML, and add a renderer module that wires the DOM to it.

### Adding a new IPC channel

1. Add channel name to `src/shared/ipc/channels.js`
2. Mirror the channel name in `src/preload/index.js` (preload cannot reliably require shared modules with sandbox)
3. Add handler in `src/main/ipc/register.js`
4. Expose method via `contextBridge` in preload

### Adding a new screen

1. Create `src/renderer/screens/<name>/index.html`
2. Reference styles with `../../styles/` paths
3. Add screen script in `src/renderer/scripts/`
4. Navigate from other screens via relative HTML paths

---

## LLM prompts

### `GenerateQuestionnaireLLMQuery({ issue, gender, age })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt that asks an LLM to generate medical intake follow-up questions based on the user's initial issue, age, and gender. Inputs are sanitized: missing/empty `issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`.

**Persona:** highly experienced medical doctor, licensed physician, PhD-level clinical specialist.

**Task:** generate intelligent, medically relevant follow-up questions covering symptoms, history, severity, triggers, duration, lifestyle, medications, and risk indicators.

**Allowed question types:** `single_select`, `multi_select`, `slider`, `range`, `text`.

**Rules baked into the prompt:**
- Selectable questions must include an `"Other"` option
- Some questions should use sliders for severity / emotional state
- Some should allow multi-symptom selection
- Include duration, frequency, pain level, mood, sleep, stress where relevant
- No duplicates, no padding — only medically meaningful questions
- Adapt dynamically to the reported issue
- Injects the current request date/time ("For awareness, the current date and time of this request is …") right after the patient line, formatted via `toLocaleString('en-US', …)` with weekday, full date, hour/minute and short timezone — gives the model temporal context for symptom recency / seasonality without prompting it to confirm the date with the user

**Output contract:** the LLM must return **only** a valid JSON array (no markdown, no comments, no explanations). Example shapes:

```json
[
  {
    "question": "How severe is your pain currently?",
    "type": "slider",
    "min": 0,
    "max": 10,
    "step": 1,
    "labels": { "min": "No pain", "max": "Worst pain" }
  },
  {
    "question": "Which symptoms are you experiencing?",
    "type": "multi_select",
    "options": ["Fever", "Headache", "Fatigue", "Nausea", "Other"]
  }
]
```

**Consumers:** wired through `src/main/middlewares/collector-middleware.js`. `StartReportcollection({ issue, gender, age })` builds the prompt with this helper, sends it to OpenRouter via `chatCompletion()` (non-streaming) in `src/main/services/api-helper.js`, strips any markdown code fences from the response, slices from the first `[` to the last `]`, and `JSON.parse`s the result. The parsed array is returned over IPC to `src/renderer/scripts/questionnaire.js` which renders one card per question.

---

## Design

### Home screen (`app.css`)

| Element | Style |
|---------|-------|
| **Background** | Soft pastel gradient (pink → lavender → light blue, `135deg`); subtle radial glow overlay |
| **Title** | White, centered, responsive clamp sizing, text-shadow for depth |
| **Text input** | Solid white, rounded rectangle (`14px`), soft shadow, dark text; 80% viewport width |
| **Submit button** | Dark rounded square (`10px`) inside input, right-aligned; white arrow SVG icon; no hover animation |
| **Dropdowns (gender/age)** | Frosted translucent white (`rgba(255,255,255,0.65)`), rounded (`10px`), grey text, custom SVG chevron; right-aligned below input, auto-width |
| **Dropdown options** | White background, light purple highlight on selected |
| **Settings (gear) icon** | Fixed `top: 1rem; right: 1rem`, `2.5rem` glass circle (`var(--glass-bg-strong)` + 18px blur, white border, soft shadow); rotates 30deg on hover; click toggles DevTools via IPC `OPEN_DEV_TOOLS` |

### Questionnaire screen (`questionnaire.css`)

Pastel-gradient theme aligned with the **Home screen** (`app.css`) — same background, glassmorphism, and accent purple. The form is a **responsive CSS Grid** that auto-arranges question cards of varying widths, edge-to-edge across the full window width.

| Element | Style |
|---------|-------|
| **Background** | Same pastel gradient as home (pink → lavender → light blue, `135deg`); subtle radial glow overlay |
| **Text color** | White primary (`rgba(255,255,255,0.96)`), white-muted secondary; text shadows for readability over the gradient |
| **Header** | Glass bar (`rgba(255,255,255,0.1)` + 18px blur), Back link as a glass pill on the left, centered brand + screen subtitle |
| **Layout** | Edge-to-edge — no `max-width` cap, `1rem` horizontal padding only |
| **Grid** | `display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); grid-auto-flow: dense; gap: 1rem;` |
| **Card width per type** | `single_select` → `span 1`; `multi_select`, `slider`, `range`, `text` → `span 2`; below `520px` all collapse to full width |
| **Card** | Glass: `rgba(255,255,255,0.14)` background + 18px blur, white border, soft shadow + inner highlight, `14px` radius |
| **Question heading** | `0.95rem`, semibold, white with subtle text shadow |
| **Option row (radio/checkbox)** | Solid white-translucent (`rgba(255,255,255,0.55)`) pill, dark-grey label text, `10px` radius; hover brightens; native control uses purple accent (`#b48cd2`) |
| **"Other" option (single_select only)** | Replaces the visible label with a dashed-underline text input; typing in it auto-checks the paired hidden radio and uses the typed text as the value |
| **Text input / textarea** | Solid white, no border, `12px` radius, soft shadow; focus ring uses purple accent |
| **Slider** | Native `<input type="range">` with purple accent, live numeric value on the right (white), optional `labels.min` / `labels.max` under the track |
| **Range (two thumbs)** | Two separate range rows labelled `Min` / `Max`; final value normalized to `{ min, max }` on collect |
| **Submit** | Dark pill button (`#555`, white text), right-aligned at the end of the grid; lifts on hover; disables itself after click |
| **Status / error** | Centered glass card; error state tinted soft red |

### Diagnoses Room (`diagnoses-room.css`)

| Element | Style |
|---------|-------|
| **Background** | Solid dark `#0a0a0a` |
| **Header** | Dark with back link, centered brand + screen title |
| **Chat bubbles** | User: `#2f2f2f`, right-aligned; Assistant: `#1e1e1e` bordered, left-aligned; Error: red tint |
| **Composer** | Dark `#212121` bar, `#3d3d3d` border, rounded pill |
| **Send button** | Light pill `#e5e5e5`, dark text |

---

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'`
- API keys stay in main process only (never in renderer or preload source)
- IPC channels centralized in `src/shared/ipc/channels.js`; preload mirrors them
- All file paths use `path.join(__dirname, ...)` for spaces and packaging compatibility
