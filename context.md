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
| Dependencies | `electron` (devDep), `dotenv` (dep), `jsonrepair` (dep), `marked` (dep — vendored into renderer at `src/renderer/scripts/vendor/marked.esm.js` so the renderer CSP `default-src 'self'` keeps holding; the npm package itself is only used as the source of the vendored file, the renderer imports the local copy) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: dotenv config, hide menu, register IPC, create window
│   ├── ipc/
│   │   └── register.js       # IPC handlers: ping, startReportCollection, submitQuestionnaire, gotoLaboratory, submitLaboratory, gotoPreDoctorRoom, submitPreDoctorRoom, startDoctor, openDevTools
│   ├── middlewares/
│   │   └── collector-middleware.js # Owns JSON_LLM_OPTIONS ({ maxTokens: 4096, reasoning: { effort: 'none' } }) for the JSON workloads and PROSE_LLM_OPTIONS ({ maxTokens: 8192, reasoning: { effort: 'low' } }) for the doctor stream; passes them straight into the AGI service so OpenRouter receives a max_tokens cap + a reasoning hint on every call. StartReportcollection({ issue, gender, age }) — entry from home screen, tiered JSON parser (strict → normalize → jsonrepair) with a master-merge fallback that returns pickBestWorkerSet(parsedSets) when the master parse fails or returns empty. SubmitQuestionnaire({ issue, gender, age, questions, answers }) — logs the full Q&A dump on questionnaire submit. GotoLaboratory({ issue, gender, age, questions, answers }) — same two-stage fanout+merge as StartReportcollection (same master-merge fallback to the largest worker set). SubmitLaboratory({ issue, gender, age, questions, answers }) — logs the lab Q&A dump. GotoPreDoctorRoom({ issue, gender, age, questionnaire, laboratory }) — same two-stage fanout+merge as GotoLaboratory but the initial prompt comes from GeneratePreDoctorRoomLLMQuery and is seeded with BOTH the intake Q&A and the lab Q&A so the workers can decide what is still missing; same pickBestWorkerSet fallback; logs tagged [collector/predoc]. SubmitPreDoctorRoom({ issue, gender, age, questions, answers }) — logs the pre-doctor Q&A dump. StartDoctor({ issue, gender, age, questionnaire, laboratory, preDoctorRoom }, sender) — builds the doctor-analysis prompt with all THREE Q&A blocks (intake → lab → pre-doctor) and fans it out via the streaming pipeline with PROSE_LLM_OPTIONS; returns { ok, models } synchronously and pushes per-model delta/done/error events back to the renderer via event.sender.send (guarded by sender.isDestroyed)
│   ├── helpers/
│   │   └── query-generator-helper.js # GenerateQuestionnaireLLMQuery({ issue, gender, age }) — builds intake-doctor prompt that returns a JSON array of questions. GenerateMergeQuestionnaireLLMQuery(questionnaireSets) — builds the prompt the master model uses to consolidate multiple worker questionnaires into one deduplicated list (reused as-is for the laboratory and pre-doctor-room master merges — the schema is the same). GenerateLaboratoryLLMQuery({ issue, gender, age, questions, answers }) — builds the prompt the workers use to propose lab tests/imaging, each emitted as a question of the standard schema with the expected result as the input control. GeneratePreDoctorRoomLLMQuery({ issue, gender, age, questionnaire, laboratory }) — builds the prompt that asks the workers to identify gaps still left after intake + lab and emit final clarifying questions in the same questionnaire JSON schema. GenerateDoctorAnalysisLLMQuery({ issue, gender, age, questionnaire, laboratory, preDoctorRoom }) — builds the prose (Markdown, non-JSON) pre-doctor analysis prompt that each worker model fills out as an independent "doctor" opinion; now consumes three formatQaBlock sections in chronological order (intake → lab → pre-doctor clarifications)
│   ├── services/
│   │   ├── api-helper.js     # Pure OpenRouter transport: streamChat(messages, model, onDelta, onDone, onError, options?) + chatCompletion(messages, model, options?); reads process.env.OPENROUTER_API_KEY; model + per-call options (max_tokens, reasoning) are passed in by the caller
│   │   └── agi-service.js    # Multi-model fanout (parallel worker calls) + master Nemotron merge; owns OPENROUTER_WORKER_MODELS list + OPENROUTER_MASTER_MODEL; exports AskAllWorkerAgis(prompt, options?), AskMasterAgi(prompt, options?), and StreamFromAllWorkerAgis(prompt, { onModelDelta, onModelDone, onModelError, onAllDone }, options?) — every signature threads an options object straight through to chatCompletion / streamChat so callers can set per-workload max_tokens and reasoning.effort
│   └── windows/
│       └── main-window.js    # BrowserWindow: 800x600, hidden until ready, preload + contextIsolation
├── preload/
│   └── index.js              # contextBridge → window.electronAPI { ping, startReportCollection, submitQuestionnaire, gotoLaboratory, submitLaboratory, gotoPreDoctorRoom, submitPreDoctorRoom, startDoctor, onDoctorStreamDelta, onDoctorStreamDone, onDoctorStreamError, openDevTools } — the three onDoctor* helpers each wrap ipcRenderer.on and return an unsubscribe function so the renderer can clean up listeners on unload
├── renderer/
│   ├── index.html            # Home screen
│   ├── screens/
│   │   ├── questionnaire/
│   │   │   └── index.html    # Questionnaire screen (shown after home submit)
│   │   ├── laboratory/
│   │   │   └── index.html    # Laboratory screen (shown after questionnaire submit; reuses questionnaire.css — identical .q-* class structure)
│   │   ├── pre-doctor-room/
│   │   │   └── index.html    # Pre-doctor Room screen (shown after laboratory submit; reuses questionnaire.css — identical .q-* class structure, including the delete-X card affordance)
│   │   └── doctor/
│   │       └── index.html    # Doctor screen (shown after pre-doctor-room submit; centered loading row, hidden error card, and empty #doc-tabs + #doc-panes containers populated dynamically by doctor.js)
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_QUESTIONNAIRE, SCREEN_LABORATORY, SCREEN_PRE_DOCTOR_ROOM, SCREEN_DOCTOR, labels
│   │   ├── app.js            # Home screen: populates UI, navigates to questionnaire with issue/gender/age params
│   │   ├── questionnaire.js  # Questionnaire screen: calls startReportCollection on load, renders per-type controls, on Submit calls submitQuestionnaire IPC, stashes Q&A in sessionStorage['neuroagi:questionnaire'], navigates to laboratory screen
│   │   ├── laboratory.js     # Laboratory screen: reads intake Q&A from sessionStorage, calls gotoLaboratory on load, renders per-type controls (duplicated buildCard helpers identical to questionnaire.js), on Submit calls submitLaboratory IPC, stashes lab Q&A in sessionStorage['neuroagi:laboratory'], navigates to pre-doctor-room screen
│   │   ├── pre-doctor-room.js # Pre-doctor Room screen: reads intake Q&A AND lab Q&A from sessionStorage, calls gotoPreDoctorRoom on load (passing both blocks so the LLM can see what's already known), renders per-type controls with the questionnaire-style delete-X card (duplicated helpers from questionnaire.js — NO lab toggle), on Submit calls submitPreDoctorRoom IPC, stashes pre-doctor Q&A in sessionStorage['neuroagi:preDoctorRoom'], navigates to doctor screen
│   │   ├── doctor.js         # Doctor screen: reads neuroagi:questionnaire + neuroagi:laboratory + neuroagi:preDoctorRoom from sessionStorage, calls startDoctor IPC with all three Q&A blocks, builds one tab + pane per returned model, subscribes to onDoctorStreamDelta/Done/Error and renders streaming markdown into each pane via marked.parse (sanitized)
│   │   └── vendor/
│   │       └── marked.esm.js # Vendored copy of node_modules/marked/lib/marked.esm.js; imported as ESM by doctor.js to satisfy the renderer CSP default-src 'self'
│   ├── styles/
│   │   ├── app.css           # Home screen pastel theme
│   │   ├── questionnaire.css # Questionnaire + Laboratory + Pre-doctor Room pastel theme + responsive grid + centered spinner overlay (laboratory/index.html and pre-doctor-room/index.html both link this same stylesheet)
│   │   └── doctor.css        # Doctor screen pastel theme + centered loading spinner + glass pill tabs + glass content panes + .doc-prose typography (headings, bold, lists, code, blockquote, table) for the streamed markdown output
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

1. On load, `app.js` auto-focuses the health input (`input.focus()` after age dropdown is populated; the input also has the `autofocus` attribute as a fallback)
2. User types health issue in text input, selects gender and age from dropdowns
3. Clicks the submit button (arrow icon) **or** presses **Ctrl+Enter** / **Cmd+Enter** while the health input has focus — `app.js` listens for the shortcut on the input and synthesises a click on the submit button
4. `app.js` builds query string (`?issue=...&gender=...&age=...`) and navigates to `screens/questionnaire/index.html` (no IPC call from home — avoids freezing while LLM responds)

### Settings (gear icon) → DevTools toggle

1. Home screen renders a fixed glass gear icon in the top-right (`#btn-settings` in `src/renderer/index.html`)
2. Click handler in `app.js` calls `window.electronAPI.openDevTools()`
3. Preload invokes IPC channel `OPEN_DEV_TOOLS`
4. `register.js` handler resolves the calling `BrowserWindow` via `BrowserWindow.fromWebContents(event.sender)` and calls `win.webContents.toggleDevTools()` — clicking again hides DevTools

### Questionnaire screen → LLM question generation

1. `questionnaire.js` on `DOMContentLoaded` reads `issue`, `gender`, `age` from URL params, fills the summary, and shows a `Loading questions…` status
2. It calls `window.electronAPI.startReportCollection({ issue, gender, age })` → IPC `START_REPORT_COLLECTION`
3. Main process: `register.js` invokes `StartReportcollection()` in `collector-middleware.js`
4. The middleware builds the initial intake prompt via `GenerateQuestionnaireLLMQuery()`. It then runs a **two-stage AGI pipeline** instead of a single LLM call:
   - **Stage 1 — Fanout**: `AskAllWorkerAgis(prompt)` in `agi-service.js` issues `chatCompletion(messages, model)` calls in parallel (`Promise.allSettled`) to every model in `OPENROUTER_WORKER_MODELS`. Each result is shaped uniformly: `{ model, ok, content?, error? }` — a single worker 429/network/HTTP failure doesn't abort the others.
   - **Per-worker parse**: each `ok: true` worker response goes through the tiered `parseJsonArray` (see below). Workers that fail to parse are logged and dropped; workers that succeeded are collected into an array of parsed questionnaire arrays.
   - **All-fail guard**: if zero workers succeeded (no parseable JSON from anyone), the middleware throws → renderer shows the centered red Retry button.
   - **Stage 2 — Master merge**: `GenerateMergeQuestionnaireLLMQuery(parsedSets)` builds a prompt that asks the master model to consolidate the worker outputs (dedupe by intent, union MCQ options keeping "Other" last, prefer the clearer slider/range labels, drop low-value questions, never invent new clinical territory). `AskMasterAgi(prompt, JSON_LLM_OPTIONS)` calls `chatCompletion` against `OPENROUTER_MASTER_MODEL` (`nvidia/nemotron-3-nano-30b-a3b:free`). Both Stage 1 (`AskAllWorkerAgis`) and Stage 2 receive `JSON_LLM_OPTIONS = { maxTokens: 4096, reasoning: { effort: "none" } }` so OpenRouter is told to cap the output at 4096 tokens and disable thinking-mode reasoning — without this hint a thinking-capable model (e.g. `deepseek/deepseek-v4-flash`) will sometimes burn its entire completion budget on `reasoning_tokens` and emit zero visible content.
5. The master's raw response is run through the same **three-tier parser** as the worker responses (Tier 1 strict / Tier 2 normalize / Tier 3 jsonrepair; the parser also throws a specific `LLM returned empty content` error up front when the trimmed text is empty so the cause is easy to spot in the log). If parsing succeeds the middleware returns `{ ok: true, issue, gender, age, questions }`
6. **Master-merge fallback**: if the three-tier parser on the master output throws (or the master returned empty content), the middleware does **not** fail. It calls `pickBestWorkerSet(parsedSets)` — a tiny module-scope helper that returns the parsed worker array with the most questions — and uses that as the final `questions`. The fallback is logged at warn level (`[collector] Master merge unusable, falling back to best worker set: <error>`) followed by `[collector] Master merge fallback: using worker set with N questions`. The user still gets a usable questionnaire; only the dedupe/merge polish step is skipped
7. **Unrecoverable failure → Retry**: only triggers when zero workers produced parseable JSON (the master-merge fallback can no longer save us). The middleware returns `{ ok: false, error }` and the questionnaire screen swaps the centered status overlay to a friendly message (translated by `humanizeError()` — 429 → "The AI service is temporarily rate-limited…", network errors → "Network error reaching the AI service…") plus a **red Retry button**. The button just calls `window.location.reload()`, which restarts the whole flow from scratch (re-fires `DOMContentLoaded`, re-spawns the spinner, re-invokes IPC, and re-runs the full fanout-merge pipeline)
8. `questionnaire.js` hides the status box, reveals `#q-form`, and renders one `<section class="q-card q-card--{type}">` per question with type-specific controls; reveals the Submit button
9. Submit click runs `collectSurviving(formEl, loadedQuestions)` which walks only the `.q-card` elements still in the DOM and returns `{ questions, answers }` aligned in DOM order — `answers` come from the existing `collectAnswers(formEl)`, `questions` are pulled from `loadedQuestions[Number(card.dataset.index)]` so the trimmed arrays stay aligned even when the original `dataset.index` values become non-contiguous (e.g. 0, 1, 3, 4 after card 2 is deleted). The trimmed arrays then proceed to the next workflow

**Per-card delete (questionnaire-only).** Every questionnaire card emitted by `questionnaire.js#buildCard` is prepended with a small `.q-card-delete` glass-pill button pinned to the card's top-right corner (24px circle, white "X" SVG, hover turns it soft red). Clicking it adds the `q-card--removing` class to fade the card over 160ms, then calls `card.remove()`. Surviving cards retain their original `dataset.index` values, so the submit handler's `collectSurviving` keeps both questions and answers correctly aligned. The laboratory screen does NOT render this button — only the questionnaire does.

### Questionnaire submit → Laboratory screen

1. User clicks Submit on the questionnaire; `questionnaire.js` builds the trimmed `{ questions, answers }` payload via `collectSurviving(formEl, loadedQuestions)` (which calls `collectAnswers(formEl)` internally and lines up the questions by surviving `dataset.index`), then disables the button (label switches to `Submitting…`). Any cards the user deleted via the top-right X are absent from BOTH arrays
2. Renderer calls `window.electronAPI.submitQuestionnaire({ issue, gender, age, questions, answers })` → IPC `SUBMIT_QUESTIONNAIRE`
3. Main process: `register.js` invokes `SubmitQuestionnaire()` in `collector-middleware.js`
4. The middleware logs a structured Q&A dump to the main-process console (one `Q{n} [type] text` line and one `A{n}: value` line per question, framed by `=== Q&A dump ===` markers) and returns `{ ok: true }`
5. The renderer stashes the SAME trimmed `{ issue, gender, age, questions, answers }` from `collectSurviving` into `sessionStorage['neuroagi:questionnaire']` (per-tab; cleared when the Electron window closes) — this is the handoff channel for the bulky Q&A payload, which is too large for a URL query string. Because the stash is trimmed, the laboratory screen only ever sees the questions the user actually kept
6. The renderer navigates to `screens/laboratory/index.html?issue=…&gender=…&age=…` (only `issue/gender/age` ride in the URL so a refresh still has the basics); on failure the Submit button re-enables and the centered error card appears

### Laboratory screen → LLM lab-test generation

1. `laboratory.js` on `DOMContentLoaded` reads `issue/gender/age` from URL params, then reads `sessionStorage['neuroagi:questionnaire']` and JSON-parses it for the intake `questions`/`answers`
2. If the sessionStorage payload is missing or malformed (e.g. user opened the URL directly), `laboratory.js` shows the same centered red-card error as the questionnaire with the message `Missing questionnaire data. Please restart from the home screen.` (Retry just reloads; user can click the header Back link to return home)
3. It calls `window.electronAPI.gotoLaboratory({ issue, gender, age, questions, answers })` → IPC `GOTO_LABORATORY`
4. Main process: `register.js` invokes `GotoLaboratory()` in `collector-middleware.js`, which mirrors `StartReportcollection`'s **two-stage AGI pipeline** but with a different initial prompt:
   - **Initial prompt**: `GenerateLaboratoryLLMQuery({ issue, gender, age, questions, answers })` builds a clinical-pathologist persona prompt that serializes the intake Q&A and asks the worker models to propose lab tests / imaging studies, emitting one question per test (using the same `single_select` / `multi_select` / `slider` / `range` / `text` schema) so the patient can fill in the result they got from their report
   - **Fanout**: identical to questionnaire — `AskAllWorkerAgis(prompt, JSON_LLM_OPTIONS)` across `OPENROUTER_WORKER_MODELS` with `Promise.allSettled`
   - **Per-worker tiered parse**: identical (strict → normalize → jsonrepair), failures logged and dropped
   - **All-fail guard**: if zero workers succeed, throws → renderer shows centered red Retry button
   - **Master merge**: reuses the existing `GenerateMergeQuestionnaireLLMQuery` prompt (it is generic over question arrays of the standard schema, no laboratory-specific variant needed). `AskMasterAgi(mergePrompt, JSON_LLM_OPTIONS)` against `OPENROUTER_MASTER_MODEL` produces the final consolidated list of result-input questions. The same `JSON_LLM_OPTIONS = { maxTokens: 4096, reasoning: { effort: "none" } }` flow that protects the questionnaire path also protects the lab path
5. The master response is parsed with the same tiered `parseJsonArray`; success returns `{ ok: true, issue, gender, age, questions }`. **Master-merge fallback**: if the master parse throws (or the master returned empty content), the middleware falls back to `pickBestWorkerSet(parsedSets)` (largest worker set) and logs `[collector/lab] Master merge fallback: using worker set with N questions`. Only when zero workers produced parseable JSON does the middleware return `{ ok: false, error }` and the lab screen show the red Retry card
6. `laboratory.js` renders the returned lab questions through duplicated `buildCard` / `renderSingleSelect` / `renderMultiSelect` / `renderSlider` / `renderRange` / `renderText` / `collectAnswers` helpers (verbatim copies from `questionnaire.js`, kept duplicated by design so the questionnaire screen isn't affected) — class names stay `.q-*` so `questionnaire.css` styles apply unchanged
7. The same `showError` / `humanizeError` retry path is reused: on `{ ok: false }` or any thrown error the centered red Retry button reloads the page and re-runs the lab fanout-merge

### Laboratory submit → Pre-doctor Room screen

1. User clicks Submit on the laboratory; `laboratory.js` collects answers via the duplicated `collectAnswers` and disables the button (label switches to `Submitting…`)
2. Renderer calls `window.electronAPI.submitLaboratory({ issue, gender, age, questions, answers })` → IPC `SUBMIT_LABORATORY`
3. Main process: `register.js` invokes `SubmitLaboratory()` in `collector-middleware.js`, which logs a structured lab Q&A dump (one `Q{n} [type] text` / `A{n}: value` per question, framed by `=== Lab Q&A dump ===` markers, tagged `[collector/lab]`) and returns `{ ok: true }`
4. The renderer stashes `{ issue, gender, age, questions, answers }` into `sessionStorage['neuroagi:laboratory']` (mirroring how `questionnaire.js` stashes `neuroagi:questionnaire`); on success it navigates to `screens/pre-doctor-room/index.html?issue=…&gender=…&age=…` (only `issue/gender/age` ride in the URL — the bulky Q&A payloads are too large for query strings); on failure the Submit button re-enables and the centered error card appears

### Pre-doctor Room screen → LLM clarifying-question generation

1. `pre-doctor-room.js` on `DOMContentLoaded` reads `issue/gender/age` from URL params and reads BOTH `sessionStorage['neuroagi:questionnaire']` and `sessionStorage['neuroagi:laboratory']`, JSON-parses each, and bails to the centered red error card with the message `Missing questionnaire or laboratory data. Please restart from the home screen.` if either payload is missing or malformed (e.g. the user opened the URL directly)
2. It calls `window.electronAPI.gotoPreDoctorRoom({ issue, gender, age, questionnaire: { questions, answers }, laboratory: { questions, answers } })` → IPC `GOTO_PRE_DOCTOR_ROOM`
3. Main process: `register.js` invokes `GotoPreDoctorRoom()` in `collector-middleware.js`, which mirrors `GotoLaboratory`'s **two-stage AGI pipeline** with a different initial prompt:
   - **Initial prompt**: `GeneratePreDoctorRoomLLMQuery({ issue, gender, age, questionnaire, laboratory })` builds a final-clarifying-intake prompt that serializes BOTH the intake Q&A block AND the lab Q&A block via the shared `formatQaBlock` helper, then asks each worker to identify the gaps that are still left (symptom characteristics not yet captured, lifestyle / exposure factors, time course, prior-treatment response, family history, medication / supplement use, contradictions in the data) and emit additional clarifying questions in the exact same questionnaire JSON schema — explicitly forbidding the model from re-asking anything already visible in the two blocks
   - **Fanout / per-worker tiered parse / all-fail guard / master merge / fallback**: byte-identical to `GotoLaboratory` — `AskAllWorkerAgis(prompt, JSON_LLM_OPTIONS)` across `OPENROUTER_WORKER_MODELS` with `Promise.allSettled`, tiered `parseJsonArray` (strict → normalize → jsonrepair), drop failures, throw `All worker models failed or returned unparsable JSON` if zero workers succeeded, then reuse `GenerateMergeQuestionnaireLLMQuery` against `AskMasterAgi(mergePrompt, JSON_LLM_OPTIONS)` to consolidate, with a `pickBestWorkerSet(parsedSets)` fallback when the master parse throws or returns empty content. Logs are tagged `[collector/predoc]` (`worker ${model}`, `master merge`, `final pre-doctor`)
4. On success the middleware returns `{ ok: true, issue, gender, age, questions }`; `pre-doctor-room.js` renders the returned clarifying questions through the **questionnaire-style** card helpers — same `buildCard` with the top-right delete-X button, same `collectSurviving` / `collectAnswers`, NO lab-style "I have this report" toggle (only `laboratory.js` renders that). The helpers are duplicated verbatim into `pre-doctor-room.js`, matching the existing duplication pattern between `questionnaire.js` and `laboratory.js`
5. The same `showError` / `humanizeError` retry path is reused: on `{ ok: false }` or any thrown error the centered red Retry button reloads the page and re-runs the pre-doctor fanout-merge

### Pre-doctor Room submit → Doctor screen

1. User clicks Submit on the pre-doctor room; `pre-doctor-room.js` builds the trimmed `{ questions, answers }` payload via `collectSurviving(formEl, loadedQuestions)` so cards deleted via the top-right X are absent from both arrays, then disables the button (label switches to `Submitting…`)
2. Renderer calls `window.electronAPI.submitPreDoctorRoom({ issue, gender, age, questions, answers })` → IPC `SUBMIT_PRE_DOCTOR_ROOM`
3. Main process: `register.js` invokes `SubmitPreDoctorRoom()` in `collector-middleware.js`, which logs a structured Q&A dump (one `Q{n} [type] text` / `A{n}: value` per question, framed by `=== Pre-doctor Q&A dump ===` markers, tagged `[collector/predoc]`) and returns `{ ok: true }`
4. The renderer stashes the SAME trimmed `{ issue, gender, age, questions, answers }` into `sessionStorage['neuroagi:preDoctorRoom']`; on success it navigates to `screens/doctor/index.html?issue=…&gender=…&age=…` (only `issue/gender/age` ride in the URL — the bulky Q&A payloads are too large for query strings); on failure the Submit button re-enables and the centered error card appears

**Per-card "I have this report" toggle (lab-only).** Every lab card emitted by `laboratory.js#buildCard` is prepended with a `.q-report-toggle` pill switch (markup: `<label class="q-report-toggle"><input data-report-toggle="1" role="switch">...<span class="q-report-toggle-text">I don't have this report</span></label>`), default **off**. On initial render `buildCard` also calls `setCardInputsDisabled(card, true)` and adds the `q-card--no-report` class itself so the just-rendered type controls are dimmed and disabled from the first paint — without this the controls would start visually enabled because the toggle's own `change` handler hasn't fired yet. The toggle's `change` handler flips the same `.q-card--no-report` class and calls `setCardInputsDisabled(card, !checked)` which sets `disabled = true` on every `input`/`textarea`/`select` inside the card (the toggle itself is excluded via the `[data-report-toggle="1"]` selector). The label text swaps between `I don't have this report` (off) and `I have this report already` (on). `.q-card--no-report` in `questionnaire.css` dims the question heading and every input wrapper to `opacity: 0.45` + `pointer-events: none`, while explicitly keeping the toggle row fully interactive so the user can flip it on. On submit, `collectAnswers` short-circuits any card whose toggle is unchecked and pushes `{ question, type, value: "the user does not have this report currently" }` regardless of question type — so `multi_select` answers normally typed `string[]` and `range` answers normally typed `{ min, max }` become a plain string for that card. Because the default is now off, **submitting an untouched lab screen sends the sentinel string for every card**; the user must explicitly enable the toggle on each card they actually have a report for. Downstream consumers (`SubmitLaboratory` log, doctor analysis prompt) should test `answer.value === "the user does not have this report currently"` before doing any type-specific handling.

### Doctor screen → streaming multi-doctor analysis

1. `doctor.js` on `DOMContentLoaded` sets the title and patient summary from URL params, then reads `sessionStorage['neuroagi:questionnaire']` AND `sessionStorage['neuroagi:laboratory']` AND `sessionStorage['neuroagi:preDoctorRoom']`. If any of the three payloads is missing or malformed, it shows the centered red error card with the message `Missing questionnaire, laboratory, or pre-doctor data. Please restart from the home screen.` (the Back link in the header still points to the **home screen** so the user can reset the flow cleanly — going back to the pre-doctor / lab screens would re-trigger their LLM fanouts)
2. The renderer subscribes to the three streaming channels via `window.electronAPI.onDoctorStreamDelta`, `onDoctorStreamDone`, `onDoctorStreamError` (each returns an unsubscribe function captured for `beforeunload` cleanup), THEN calls `window.electronAPI.startDoctor({ issue, gender, age, questionnaire: { questions, answers }, laboratory: { questions, answers }, preDoctorRoom: { questions, answers } })` → IPC `START_DOCTOR`
3. Main process: `register.js` invokes `StartDoctor()` in `collector-middleware.js`, passing the raw `event.sender` so the middleware can push events back without going through `ipcMain.handle`'s request/response cycle:
   - Builds the analysis prompt via `GenerateDoctorAnalysisLLMQuery({ issue, gender, age, questionnaire, laboratory, preDoctorRoom })` (Markdown-only, second-person, multi-section pre-doctor analysis) — the prompt now serializes THREE chronological Q&A blocks via the shared `formatQaBlock` helper: intake → laboratory → pre-doctor clarifications, so the model can reason across the entire conversation
   - Calls `StreamFromAllWorkerAgis(prompt, callbacks)` in `agi-service.js`, which iterates `OPENROUTER_WORKER_MODELS` and starts a `streamChat(messages, model, onDelta, onDone, onError)` per model in parallel — one independent SSE connection per worker, no cross-talk
   - Each callback re-forwards the event over IPC, threading the model id into the payload:
     - delta → `DOCTOR_STREAM_DELTA { model, delta }`
     - done  → `DOCTOR_STREAM_DONE { model }`
     - error → `DOCTOR_STREAM_ERROR { model, error }`
   - Every `sender.send` is wrapped in `safeSend` which checks `sender.isDestroyed()` first, so navigating away from the doctor screen mid-stream does not crash the main process
   - Returns `{ ok: true, models }` **synchronously** (does not await any stream); the renderer needs the model list right now so it can build the tab UI before the first delta arrives
4. The renderer builds **one tab + one pane per model**. Tab label = the raw model id (e.g. `deepseek/deepseek-v4-flash`); each tab carries a tiny live spinner pill, and each pane is a glass card with a model-id tag at the top (`Analysis by <model>`), a `Streaming response…` status row with its own spinner, and a `.doc-prose` div where the markdown is rendered. The first model is set active by default; click on any other tab to switch — only the active pane is `display: flex`, others are `display: none`
5. On every delta the renderer appends `delta` to the per-model `buffer` (kept in a `Map<model, state>`), then re-runs `marked.parse(buffer)` on the cumulative text and writes the sanitized HTML into the pane's `.doc-prose`. The sanitizer is a small inline helper in `doctor.js` that strips `<script>` blocks, on-event attributes (`onload=…`, `onclick=…`, etc.), and `javascript:` href/src values as defense in depth — the LLM is generally trusted, but we never embed its output without a pass
6. On `done` for a model: pane spinner hides, the pane status row turns green ("Analysis complete"), the tab gets `.is-complete` (which hides the tab spinner). On `error` for a model: pane spinner hides, the pane status row turns red ("This doctor could not respond"), the tab gets `.is-failed` (red pill), and if no text had streamed yet a `.doc-pane-error` card is rendered inside the pane with a `humanizeError`d message (same translation rules as questionnaire/laboratory — 429 → rate-limit, network → connectivity hint)
7. There is **no per-tab retry** — a hard failure surfaces in that tab while the other doctors keep streaming. If `startDoctor` itself rejects before any stream starts (e.g. preload not wired, prompt build threw, no worker models configured) the whole screen falls back to the same centered red Retry card used by the questionnaire/laboratory screens; the Retry button just `window.location.reload()`s and re-runs the full fanout

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

### Per-workload LLM options

`collector-middleware.js` owns two `options` objects that ride along on every AGI call. They are passed straight through `AskAllWorkerAgis` / `AskMasterAgi` / `StreamFromAllWorkerAgis` into `api-helper.js`, which writes them into the OpenRouter request body as `max_tokens` and `reasoning` (the latter following the [OpenRouter Reasoning Tokens](https://openrouter.ai/docs/use-cases/reasoning-tokens) contract).

| Constant | Value | Used by | Why |
|----------|-------|---------|-----|
| `JSON_LLM_OPTIONS` | `{ maxTokens: 4096, reasoning: { effort: "none" } }` | Questionnaire + Laboratory + Pre-doctor Room workers + master | JSON workloads cannot tolerate reasoning tokens eating the output budget — without `effort: "none"` a thinking-capable model (e.g. `deepseek/deepseek-v4-flash`) sometimes returned `contentChars: 0` with all `completion_tokens` showing up as `reasoning_tokens`, which crashed `parseJsonArray` with "Could not find a JSON array." `maxTokens: 4096` is comfortably above the largest intake/lab/pre-doctor questionnaire we've seen |
| `PROSE_LLM_OPTIONS` | `{ maxTokens: 8192, reasoning: { effort: "low" } }` | Doctor screen streaming fanout (`StartDoctor` → `StreamFromAllWorkerAgis`) | The doctor analysis is a long-form multi-section Markdown document; `maxTokens: 8192` leaves room for all 10 sections without truncation. `effort: "low"` allows a small reasoning budget because the analysis benefits from structured thinking, but caps it so the model still emits visible prose |

`api-helper.js` only writes `max_tokens` / `reasoning` into the body when they are provided, so call sites without an `options` arg behave exactly as before. The request log line (`[api-helper] chatCompletion → request` / `streamChat → request`) now includes `maxTokens` and `reasoning` so the actual request shape is visible in the console.

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
- **Units are mandatory on any measurable question.** Quantitative answers (duration, frequency, length, weight, distance, temperature, count, dose, etc.) must state the unit in the question text (preferred) or in both `labels.min` / `labels.max` for slider/range types. Slider/range bounds must be clinically reasonable for the chosen unit (e.g. pain 0–10 not 0–100; heart rate 30–220 not 0–1000). Numeric `single_select` / `multi_select` options must carry units (`"30 minutes"`, not `"30"`). A second worked JSON example was added to the prompt body — a headache-duration slider with `min: 0, max: 1440, step: 5, labels.min: "0 min", labels.max: "24 h"` — so the model anchors on a unit-bearing slider shape

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

**Consumers:** wired through `src/main/middlewares/collector-middleware.js`. `StartReportcollection({ issue, gender, age })` builds this prompt and sends it to **all worker models in parallel** via `AskAllWorkerAgis()` in `src/main/services/agi-service.js` (which uses `chatCompletion(messages, model)` from `api-helper.js`). Each worker response is parsed through the tiered parser; the surviving parsed arrays are then fed into `GenerateMergeQuestionnaireLLMQuery(...)` and sent to the master model via `AskMasterAgi()`. The final master JSON is parsed and returned over IPC to `src/renderer/scripts/questionnaire.js` which renders one card per question.

### `GenerateMergeQuestionnaireLLMQuery({ questionnaireSets })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt the **master model** (`OPENROUTER_MASTER_MODEL` in `agi-service.js`, currently `nvidia/nemotron-3-nano-30b-a3b:free`) uses to consolidate the per-worker questionnaires into a single deduplicated set.

**Persona:** experienced medical doctor + clinical assessment designer (kept consistent with the intake prompt).

**Inputs serialized into the prompt:**
- The current request date/time (same `toLocaleString` format as the intake prompt, for awareness only).
- All worker questionnaires, each labelled `Source 1`, `Source 2`, … with `JSON.stringify(set, null, 2)` of the parsed JSON array.
- A repeat of the schema reference: `{ question, type, options?, min?, max?, step?, labels? }` with allowed `type` values.

**Rules baked into the prompt:**
- Combine into ONE consolidated, deduplicated questionnaire.
- Treat questions with the same clinical intent as duplicates even if worded differently — merge them.
- Selectable types (single_select, multi_select): take the union of options, remove near-duplicates (case- and punctuation-insensitive). Always keep `"Other"` as the last option.
- Slider / range: prefer the most clinically reasonable `min`/`max`/`step`, reuse the clearer label text.
- Drop low-value, redundant, or trivially similar questions; keep only medically meaningful ones.
- Maintain a healthy mix of question types where appropriate.
- Do NOT invent new clinical territory the sources didn't cover.
- **Final validation pass** over every merged question before emitting. Checklist baked into the prompt body: clarity (self-contained, unambiguous); units mandatory on every measurable quantity, auto-add the most clinically reasonable unit if a sourced question is missing one; clinically sensible slider/range bounds (e.g. pain capped to 0–10, heart rate capped to 30–220, episode duration in minutes capped to 1440) with a sensible `step` for the unit; option coherence (mutually exclusive for `single_select`, non-redundant for `multi_select`, `"Other"` last, numeric options carry units); single intent (split or drop double-barreled questions); type-fit (e.g. yes/no questions typed as `text` get rewritten to `single_select` with `["Yes", "No", "Other"]`). Model is told to **fix before dropping** — rewording, retyping, and bound/unit adjustment are preferred to discarding a question outright.

**Output contract:** the master model must return **only** a valid JSON array in the exact same schema as the worker outputs — no markdown fences, comments, explanations, or surrounding text. The same tiered `parseJsonArray` recovers from minor formatting issues.

### `GenerateLaboratoryLLMQuery({ issue, gender, age, questions, answers })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt that asks the **worker models** to propose laboratory tests / imaging studies for the patient case, then emit ONE question per test using the **same schema** as the intake questionnaire so the patient can enter the value they got from their report. Inputs are sanitized the same way as the intake prompt (`issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`).

**Persona:** highly experienced licensed physician + clinical pathologist (lab medicine specialist).

**Inputs serialized into the prompt:**
- Patient summary line (`${age}-year-old ${gender}` + reported issue).
- Current request date/time (same `toLocaleString` format as the other helpers, for awareness only).
- Intake Q&A block — for each `questions[i]` / `answers[i]` pair, one stanza of the form:

  ```
  Q{n} [type] {question text}
  A{n}: {value}
  ```

  Array values are joined with `, `, object values are `JSON.stringify`-ed, missing answers render as `(no answer)`, empty multi-selects render as `(none selected)`.

**Type-selection rules baked into the prompt:**
- Continuous numeric result with a clinical range → `slider` with sensible `min`/`max`/`step` and `labels.min` / `labels.max` like `"Low"` / `"High"`.
- Numeric pair (reference-range style) → `range`.
- Categorical / graded / staged result → `single_select` (always end with `"Other"`).
- Imaging checklist (multiple findings can co-occur) → `multi_select` (always end with `"Other"`).
- Free-form descriptive finding → `text`.

**Worked examples baked into the prompt body** (to anchor the model on shape, with explicit instruction to only use them if clinically appropriate):
- Low-libido case → `{ "question": "Total testosterone (ng/dL)", "type": "slider", "min": 0, "max": 1500, "step": 10, "labels": { "min": "Very low", "max": "Very high" } }`
- Varicocele case → `{ "question": "Ultrasound varicocele grade", "type": "single_select", "options": ["Grade I", "Grade II", "Grade III", "Grade IV", "Other"] }`

**Other rules:**
- Prioritise medically meaningful, first-line tests for this case.
- Do not invent obscure or irrelevant tests.
- No duplicate questions.
- A small focused panel is acceptable — do not pad.

**Output contract:** must return **only** a valid JSON array in the exact same schema as `GenerateQuestionnaireLLMQuery` — no markdown fences, comments, explanations, or surrounding text. The same tiered `parseJsonArray` recovers from minor formatting issues.

**Consumers:** wired through `src/main/middlewares/collector-middleware.js#GotoLaboratory`. Runs through the same two-stage AGI pipeline as the intake (worker fanout → per-worker tiered parse → drop failures → reuse `GenerateMergeQuestionnaireLLMQuery` → master merge → final parse). The resulting JSON array is returned over IPC to `src/renderer/scripts/laboratory.js`, which renders it with the same `.q-*` card UI as the questionnaire.

### `GeneratePreDoctorRoomLLMQuery({ issue, gender, age, questionnaire, laboratory })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt the **worker models** fill out for the Pre-doctor Room screen — a final clarifying-intake step that runs AFTER the questionnaire and laboratory have already been answered, and BEFORE the prose Doctor analysis. It emits questions in the same JSON schema as `GenerateQuestionnaireLLMQuery` and `GenerateLaboratoryLLMQuery` so the renderer can reuse the same `.q-*` card UI and `parseJsonArray` without any new code paths. Inputs are sanitized the same way as the other helpers (`issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`).

**Persona:** highly experienced, board-certified clinical physician conducting the final clarifying intake before handing the case to a real doctor.

**Inputs serialized into the prompt:**
- Patient profile block (age, gender, presenting complaint, today's date via `toLocaleString('en-US', …)`).
- Intake Q&A block — uses the shared `formatQaBlock("Intake questionnaire (already answered)", questions, answers)` helper.
- Laboratory Q&A block — same helper, labelled `Laboratory / imaging report results (already answered)`. Lab answers that came in as the lab-toggle sentinel `"the user does not have this report currently"` appear verbatim, so the model can see which reports the patient does NOT have and choose to ask about that gap.

**Reasoning rules baked into the prompt:**
- Inspect the presenting complaint + intake answers + lab results, then identify the **remaining gaps** (symptom characteristics not captured, lifestyle / exposure factors, time-course, prior-treatment response, family history, medication / supplement use, contradictions in the data).
- **Do NOT repeat** questions whose answers are already visible above — the patient should not have to answer the same thing twice.
- A small, surgical list is preferred over an exhaustive one. If genuinely no further clarification is needed, return a 1-question list confirming the single most important uncertainty.

**Authoring rules** (identical to the intake prompt):
- Mix `single_select` / `multi_select` / `slider` / `range` / `text`.
- Selectable questions always include `"Other"` as the last option.
- **Units mandatory** on any measurable quantity (duration, frequency, length, weight, distance, temperature, count, dose, etc.) — stated in the question text (preferred) or in both `labels.min` / `labels.max` for slider/range. Slider/range bounds must be clinically reasonable for the chosen unit. Numeric `single_select` / `multi_select` options must carry units.
- No double-barreled questions, no `text` for yes/no (use `single_select` with `["Yes", "No", "Other"]`).

**Output contract:** must return **only** a valid JSON array in the exact same schema as the questionnaire prompt — no markdown fences, comments, explanations, or surrounding text. The same tiered `parseJsonArray` and `GenerateMergeQuestionnaireLLMQuery`-based master merge handle it downstream.

**Consumers:** wired through `src/main/middlewares/collector-middleware.js#GotoPreDoctorRoom`. Runs through the same two-stage AGI pipeline as the intake and laboratory paths (worker fanout → per-worker tiered parse → drop failures → reuse `GenerateMergeQuestionnaireLLMQuery` → master merge → `pickBestWorkerSet` fallback if the master parse fails). The resulting JSON array is returned over IPC to `src/renderer/scripts/pre-doctor-room.js`, which renders it with the questionnaire-style `.q-*` card UI (including the top-right delete-X button — the lab "I have this report" toggle is NOT rendered here).

### `GenerateDoctorAnalysisLLMQuery({ issue, gender, age, questionnaire, laboratory, preDoctorRoom })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt each worker model fills out as an independent "doctor" opinion on the Doctor screen. Unlike the questionnaire / laboratory / pre-doctor prompts, this one expects a **Markdown prose response, not JSON** — the renderer feeds the response straight into `marked.parse` for live formatted display, so the output IS the user-visible report. Inputs are sanitized the same way as the other helpers (`issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`).

**Persona:** experienced, board-certified clinical physician with deep diagnostic and pharmacological expertise; framed as writing a **pre-doctor educational analysis**, not a final diagnosis or prescription.

**Inputs serialized into the prompt** (three Q&A blocks emitted in chronological order, intake → lab → pre-doctor, via the shared `formatQaBlock` helper):
- Patient profile block (age, gender, presenting complaint, today's date via `toLocaleString('en-US', …)`).
- Intake Q&A block — `formatQaBlock("Intake questionnaire", questions, answers)`, which formats each pair as `Q{n} [type] {text}` / `A{n}: {value}` (array values joined with `, `, object values `JSON.stringify`-ed, missing answers render as `(no answer)`, empty multi-selects as `(none selected)`).
- Laboratory Q&A block — same helper, labelled `Laboratory / imaging report results`. Lab answers that came in as the toggle sentinel `"the user does not have this report currently"` (see the per-card toggle subsection in the Lab workflow) appear verbatim as the answer value, so the model can see which reports the patient does **not** have and reason around the gap.
- Pre-doctor clarifying Q&A block — same helper, labelled `Pre-doctor clarifying questions (final intake)`. These are the final clarifications captured on the Pre-doctor Room screen, immediately before this analysis, so the model has the full chronological picture.

**Reasoning rules baked into the prompt:**
- Address the patient directly in the second person ("you", "your symptoms").
- Be honest about uncertainty — prefer `"likely"`, `"possible"`, `"less likely"` over single-cause assertions when the picture is mixed.
- Classify each leading cause into one of four buckets: **natural / physiological**, **lifestyle-driven (self-made)**, **medication-induced or iatrogenic**, or **secondary to another condition** — and justify the classification with reference to the intake + lab evidence.
- Cross-reference symptoms and findings against current peer-reviewed research, standard clinical guidelines, and published case studies.
- Surface red-flag warning signs that warrant urgent or emergency care.

**Section contract (output structure):** the response MUST be a single Markdown document with these headings in this exact order:
1. `# Pre-doctor Analysis`
2. `## Summary`
3. `## Most Likely Causes` (ranked list, each with a 1-2 line rationale)
4. `## Is This Natural, Lifestyle-Driven, Medication-Induced, or Secondary?`
5. `## How to Address This` (prioritised self-care actions)
6. `## Medications a Doctor Commonly Prescribes` (drug classes, not exact doses; one-line "your physician decides exact drug/dose/duration" caveat)
7. `## Prevention and Long-Term Outlook`
8. `## Red Flags — See a Doctor Immediately If`
9. `## What to Bring to the Doctor's Appointment`
10. `## Disclaimer`

**Formatting rules:**
- Output Markdown only — `#`, `##`, `**bold**`, `*italic*`, `-` / numbered lists are encouraged.
- Do NOT wrap the entire reply in a code fence and do NOT return JSON.
- Do NOT include any text before the first heading or after the Disclaimer section.

**Consumers:** wired through `src/main/middlewares/collector-middleware.js#StartDoctor`, fanned out via `StreamFromAllWorkerAgis` in `agi-service.js` (one parallel `streamChat` per model in `OPENROUTER_WORKER_MODELS`). Each model's stream is forwarded over the IPC channels `DOCTOR_STREAM_DELTA/DONE/ERROR` and rendered live into its own tab on the Doctor screen. There is **no master merge** for this prompt — each worker is treated as an independent "doctor" giving their own opinion, and the user picks which tab to read.

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

### Questionnaire + Laboratory screen (`questionnaire.css`)

Pastel-gradient theme aligned with the **Home screen** (`app.css`) — same background, glassmorphism, and accent purple. The form is a **responsive CSS Grid** that auto-arranges question cards of varying widths, edge-to-edge across the full window width. The Laboratory screen (`screens/laboratory/index.html`) links this same stylesheet and uses the same `.q-*` class structure — only the loading copy differs (`Loading laboratory tests…` instead of `Loading questions…`).

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
| **Range (two thumbs)** | **Dual-thumb single-track slider** — two overlapping `<input type="range">` sharing one visual track with a purple fill between the thumbs; each thumb is clamped so it can't cross the other (with a z-index nudge so neither thumb gets stuck when they collide at the upper bound); bound labels below the track show the absolute `min`/`max` from the model, a second row below shows live `Min: X` / `Max: Y`; final value still emitted as `{ min, max }` on collect via the unchanged `q_{i}_min` / `q_{i}_max` input names |
| **Submit** | Dark pill button (`#555`, white text), right-aligned at the end of the grid; lifts on hover; disables itself after click |
| **Status / error** | Centered glass card; error state tinted soft red |
| **Delete card (questionnaire-only)** | Small 24px circular glass pill pinned to the **top-right** corner of every questionnaire card, white "X" SVG icon (`stroke="currentColor"`, inherits button colour). Default state matches the card's frosted look; hover turns the background soft red (`rgba(220, 80, 100, 0.55)`) with the icon slightly scaled. Clicking it triggers a 160ms fade (`.q-card--removing` → `opacity: 0; transform: scale(0.96)`) before `card.remove()` runs, so the disappearance feels intentional. The laboratory screen does NOT render this button (its top-right slot is occupied by the report toggle). `.q-card` is `position: relative` and `.q-question` carries `padding-right: 2.25rem` so the heading never sits underneath the button |
| **Lab per-card toggle** | Pill switch at the top of every laboratory card — purple track (`#b48cd2`) with white thumb when ON, white-translucent track when OFF; **default OFF** ("I don't have this report"), ON reads "I have this report already"; in the default OFF state the rest of the card dims to `opacity: 0.45` with `pointer-events: none` and every input/textarea is `disabled` (set both by `renderReportToggle` adding the `q-card--no-report` class and by `buildCard` calling `setCardInputsDisabled(card, true)` once the type controls are appended). An untouched lab screen therefore submits `value: "the user does not have this report currently"` for every card; the user must explicitly flip individual toggles ON for the cards they have reports for. Only emitted on laboratory cards because only `laboratory.js` renders the `.q-report-toggle` markup; the questionnaire screen is unaffected even though the CSS lives in the shared `questionnaire.css` |

### Doctor screen (`doctor.css`)

Pastel-gradient theme aligned with the **Home / Questionnaire / Laboratory** screens — same background, glassmorphism, and accent. The screen has three exclusive states: **loading** (centered spinner + `Consulting the doctors…`), **error** (centered red glass card + Retry button, identical visual to the questionnaire/laboratory error card), and **tabs+panes** (one tab per worker model, one pane per worker model, only the active pane visible).

| Element | Style |
|---------|-------|
| **Background** | Same pastel gradient as the rest of the app (pink → lavender → light blue, `135deg`) with the radial-glow overlay |
| **Header** | Transparent bar, dark-grey glass `Back` pill on the left (points to `../../index.html`), centered brand + screen subtitle (the back button intentionally returns to the home screen, NOT the laboratory, so a Back press never re-triggers the lab LLM) |
| **Loading row** | Centered column: 44px white spinner ring (`doc-spin` keyframes) + `Consulting the doctors…` label; replaced by the tabs+panes block once `startDoctor` resolves |
| **Tabs** | Horizontal flex row of `.doc-tab` glass pills (`rgba(255,255,255,0.16)` + 14px blur, white border, 999px radius). Tab label is a monospace `model id` with `max-width: 22ch` ellipsis. Active tab brightens to `rgba(255,255,255,0.32)` with a shadow lift. Each tab carries a tiny `.doc-tab-spinner` (0.85rem white ring) while streaming; `.is-complete` hides the spinner; `.is-failed` turns the pill red (`rgba(220,80,100,0.32)`) and hides the spinner |
| **Pane** | Glass card (`rgba(255,255,255,0.14)` + 18px blur, white border, soft shadow + inner highlight, 14px radius), `min-height: 40vh`. Header row holds a small monospace `.doc-model-tag` ("Analysis by &lt;model&gt;") on a dark translucent pill. Status row below holds a 0.85rem spinner + `Streaming response…`; `.is-complete` colours it soft green, `.is-error` colours it soft red |
| **Prose** | `.doc-prose` is the markdown render target. Typography is tuned for white-on-pastel: bold white headings with subtle text-shadow (`h1`/`h2` distinct sizes, `h3` uppercased small-caps style), comfortable `1.55` line-height paragraphs, list `::marker` colour set to soft white, blockquote with a translucent left rule, inline `<code>` on a dark pill, `<pre>` blocks on a dark translucent background, full-width responsive `<table>` with bordered cells |
| **Pane error card** | Soft-red glass block inside the pane (only shown when a stream errored before producing any text) |
| **Top-level error card + Retry** | Identical visual to the questionnaire/laboratory red error card — red glass card, `Retry` pill button that just `window.location.reload()`s |

---

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'`
- API keys stay in main process only (never in renderer or preload source)
- IPC channels centralized in `src/shared/ipc/channels.js`; preload mirrors them
- All file paths use `path.join(__dirname, ...)` for spaces and packaging compatibility
