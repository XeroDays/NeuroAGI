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
| Env | `.env` file at project root (git-ignored); loads via `dotenv` at top of `src/main/index.js`. Keys: `OPENROUTER_API_KEY` (OpenRouter), `TAVILY_API_KEY` (Tavily web search) |
| Dependencies | `electron` (devDep), `dotenv` (dep), `jsonrepair` (dep), `marked` (dep — vendored into renderer at `src/renderer/scripts/vendor/marked.esm.js` so the renderer CSP `default-src 'self'` keeps holding; the npm package itself is only used as the source of the vendored file, the renderer imports the local copy) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: dotenv config, hide menu, register IPC, create window
│   ├── ipc/
│   │   └── register.js       # IPC handlers: ping, enhanceQuery (handle → collector-middleware.EnhanceQuery, passes event.sender for QUERY_ENHANCER_PROGRESS), startReportCollection / gotoLaboratory / gotoPreDoctorRoom (each passes event.sender for AGI_FANOUT_PROGRESS snack events), skipFanoutWait (handle → collector-middleware.RequestSkipFanout), submitQuestionnaire, submitLaboratory, submitPreDoctorRoom, startDoctor (renderer-side subscriptions: DOCTOR_STREAM_DELTA, DOCTOR_STREAM_REASONING_DELTA, DOCTOR_STREAM_DONE, DOCTOR_STREAM_ERROR), getUsageTotals (handle), resetUsageTotals (handle → usageTracker.resetTotals), openDevTools, getModelsConfig (delegates to cookie-middleware.GetModelsConfig), updateModelsConfig (delegates to cookie-middleware.UpdateModelsConfig). USAGE_UPDATE is broadcast directly from usage-tracker via BrowserWindow.getAllWindows() — no handler needed in this file
│   ├── middlewares/
│   │   ├── collector-middleware.js # EnhanceQuery({ issue, gender, age }, sender) — QueryEnhancer entry from the home screen, returns { ok, enhancedQuery } (a STRING — the original complaint with an appended "Medication by user:" section): (1) AskMasterAgi(GenerateMedicineFilterLLMQuery, JSON_LLM_OPTIONS) → parseJsonArray to detect medications the user explicitly mentioned (returns { ok:true, enhancedQuery: issue } if none, { ok:true, enhancedQuery:"" } if empty issue); (2) one sequential webSearch.search() per medicine (active-ingredient lookup); (3) AskMasterAgi(GenerateEnhancedQueryLLMQuery, JSON_LLM_OPTIONS) to rewrite the query with a resolved-formula medication section, cleaned via stripFences() (falls back to buildFallbackEnhancedQuery() — original issue + a section built from the detected names — if the call fails/empty). Progress on QUERY_ENHANCER_PROGRESS is split: emitModel({ type: 'master_start' \| 'master_done', model?, ok? }) wraps both AskMasterAgi stages; emitToast({ message, status }) drives Tavily lookup toasts and summary/done/error messages only. Fully graceful — any failure returns { ok:true, enhancedQuery: issue } so the user always reaches the questionnaire. Shared runFanoutMergePipeline({ initialPrompt, issue, gender, age, logPrefix, sender }) + createFanoutProgressEmitter(sender) power StartReportcollection / GotoLaboratory / GotoPreDoctorRoom — emits typed AGI_FANOUT_PROGRESS ({ workers_start, worker_done, master_start, master_done }) during worker fanout + master merge. Owns JSON_LLM_OPTIONS ({ maxTokens: 4096, reasoning: { effort: 'none' } }) for the JSON workloads and a PROSE_LLM_OPTIONS_BY_LEVEL lookup ({ none, low, medium (DEFAULT_REASONING_LEVEL), high, very_high } → { maxTokens, reasoning.effort }) resolved per-call via resolveProseOptions(level) for the doctor stream; the level is picked by the user on the Home-screen Reasoning-level dropdown, stashed in sessionStorage['neuroagi:reasoningLevel'], and threaded into StartDoctor's payload. Passes the resolved options straight into the AGI service so OpenRouter receives a max_tokens cap + a reasoning hint on every call. StartReportcollection({ issue, gender, age }, sender) — entry from the questionnaire screen (the issue may already be the QueryEnhancer's enhancedQuery containing a "Medication by user:" section), tiered JSON parser (strict → normalize → jsonrepair) with a master-merge fallback that returns pickBestWorkerSet(parsedSets) when the master parse fails or returns empty. SubmitQuestionnaire({ issue, gender, age, questions, answers }) — logs the full Q&A dump on questionnaire submit. GotoLaboratory({ issue, gender, age, questions, answers }, sender) — same two-stage fanout+merge as StartReportcollection (same master-merge fallback to the largest worker set). SubmitLaboratory({ issue, gender, age, questions, answers }) — logs the lab Q&A dump. GotoPreDoctorRoom({ issue, gender, age, questionnaire, laboratory }, sender) — same two-stage fanout+merge as GotoLaboratory but the initial prompt comes from GeneratePreDoctorRoomLLMQuery and is seeded with BOTH the intake Q&A and the lab Q&A so the workers can decide what is still missing; same pickBestWorkerSet fallback; logs tagged [collector/predoc]. SubmitPreDoctorRoom({ issue, gender, age, questions, answers }) — logs the pre-doctor Q&A dump. StartDoctor({ issue, gender, age, reasoningLevel, questionnaire, laboratory, preDoctorRoom }, sender) — builds the doctor-analysis prompt with all THREE Q&A blocks (intake → lab → pre-doctor) and fans it out via the streaming pipeline through StreamFromAllDoctorAgis (uses the user-activated model pool from model-config-service, NOT a separate static doctor list) with the per-call options returned by resolveProseOptions(reasoningLevel) (defaults to medium when the level is missing or unknown); returns { ok, models } synchronously and pushes per-model delta/reasoning-delta/done/error events back to the renderer via event.sender.send (guarded by sender.isDestroyed). Maintains a sibling reasoningBuffers Map alongside streamBuffers and forwards every reasoning delta over DOCTOR_STREAM_REASONING_DELTA; the per-model done log line reports both content chars and reasoning chars so the thinking/output ratio is visible
│   │   └── cookie-middleware.js    # Thin wrapper around model-config-service for IPC calls: GetModelsConfig() → returns [{ name, type, latency, throughput, price, labels, enabled, isMaster }] for the popup UI; UpdateModelsConfig({ activeModels, masterModel }) → persists activation + starred master via modelConfigService.updateState(). Called by the GET_MODELS_CONFIG and UPDATE_MODELS_CONFIG IPC handlers in register.js
│   ├── helpers/
│   │   └── query-generator-helper.js # GenerateQuestionnaireLLMQuery({ issue, gender, age }) — builds intake-doctor prompt that returns a JSON array of questions (the issue may already contain a QueryEnhancer "Medication by user:" section — no special handling needed). GenerateMedicineFilterLLMQuery({ issue, gender, age }) — clinical-pharmacist prompt that extracts ONLY medications the user explicitly mentioned, returning a JSON array of { name, mg, timing } (empty strings when unstated, [] if none). GenerateEnhancedQueryLLMQuery({ issue, medicines, searchResults }) — master prompt that resolves each detected medicine's generic active ingredient NAME from the per-medicine Tavily evidence (with context-aware disambiguation of misspelled/ambiguous names using the reported dosage/timing) and returns the FINAL ENHANCED QUERY as plain text (original complaint preserved verbatim + an appended "Medication by user:" section). GenerateMergeQuestionnaireLLMQuery({ issue, gender, age, questionnaireSets }) — builds the prompt the master model uses to consolidate multiple worker questionnaires into one deduplicated list (includes patient issue/age/gender in the For awareness block) (reused as-is for the laboratory and pre-doctor-room master merges — the schema is the same). GenerateLaboratoryLLMQuery({ issue, gender, age, questions, answers }) — builds the prompt the workers use to propose lab tests/imaging, each emitted as a question of the standard schema with the expected result as the input control. GeneratePreDoctorRoomLLMQuery({ issue, gender, age, questionnaire, laboratory }) — builds the prompt that asks the workers to identify gaps still left after intake + lab and emit final clarifying questions in the same questionnaire JSON schema. GenerateDoctorAnalysisLLMQuery({ issue, gender, age, questionnaire, laboratory, preDoctorRoom }) — builds the prose (Markdown, non-JSON) pre-doctor analysis prompt that each worker model fills out as an independent "doctor" opinion; now consumes three formatQaBlock sections in chronological order (intake → lab → pre-doctor clarifications)
│   ├── services/
│   │   ├── api-helper.js          # Pure OpenRouter transport: streamChat(messages, model, onDelta, onDone, onError, options?, onReasoningDelta?) + chatCompletion(messages, model, options?); reads process.env.OPENROUTER_API_KEY; model + per-call options (max_tokens, reasoning, timeoutMs) are passed in by the caller; chatCompletion aborts via AbortSignal when timeoutMs is set. streamChat splits OpenRouter SSE chunks into content (delta.content → onDelta) and reasoning (delta.reasoning → onReasoningDelta) so the per-call "done" log line carries both deltaChars and reasoningChars. Every streaming request sends `usage: { include: true }` so OpenRouter emits a final SSE chunk with `usage` populated (cost + token counts); both streamChat and chatCompletion forward the resolved `usage` object into usageTracker.recordUsage() on completion so the running totals stay current per API call
│   │   ├── agi-service.js         # Multi-model fanout (parallel worker calls) + master merge. Both AskAllWorkerAgis and StreamFromAllDoctorAgis call getActiveModels() which delegates to model-config-service at runtime. AskAllWorkerAgis applies a 120s per-worker timeout via chatCompletion timeoutMs; optional shouldProceedEarly callback lets runFanoutMergePipeline resolve early when the user clicks "Merge with ready models" (skipFanoutWait IPC) — on early exit pending workers are aborted via per-worker AbortController and emit worker_done ok:false ("Skipped — merge with ready models"). AskMasterAgi(prompt, options?) calls getMasterModelRuntimeId() for the user-starred master model (throws if none starred). Exports AskAllWorkerAgis, AskMasterAgi, StreamFromAllWorkerAgis, StreamFromAllDoctorAgis, getActiveModels
│   │   ├── fanout-session.js      # Per-renderer fanout skip registry keyed by webContents.id: beginFanoutSession, requestSkipFanout, getSkipRequested, endFanoutSession — used by runFanoutMergePipeline + SKIP_FANOUT_WAIT IPC
│   │   ├── model-config-service.js # Owns the user-configurable model list + starred master. Reads models-catalog.json and persists models-state.json under Electron userData (app.getPath('userData')). init() at app startup. getModelsWithState() → [{name, type, latency, throughput, price, labels, enabled, isMaster}]. getActiveModelIds() → runtime IDs for enabled entries. getMasterModelRuntimeId() → runtime ID for starred master (null if unset). updateState({ activeModels, masterModel }) → validates against catalog and saves both fields independently (star and worker toggles are not coupled). Empty activeModels / masterModel allowed on first launch
│   │   ├── web-search-service.js  # Tavily web API transport (reads process.env.TAVILY_API_KEY, Authorization: Bearer). Exports search(query, options?) → POST https://api.tavily.com/search returning { query, answer, results: [{ title, url, content, score, rawContent }], images, responseTime }; options { searchDepth ('basic'|'advanced', default 'advanced'), maxResults, topic, includeAnswer, includeRawContent, includeImages, includeDomains, excludeDomains, days }. extract(urls, options?) → POST https://api.tavily.com/extract returning { results: [{ url, rawContent, images }], failedResults, responseTime }; options { extractDepth, includeImages }. Logs concise request/response/done lines like the other transports. Consumed by the QueryEnhancer flow (collector-middleware.js#EnhanceQuery calls search() once per detected medicine — with the reported dosage/timing folded into the query — to look up its active ingredient before the enhanced-query rewrite). Both search() and extract() call logService.addLog() on every success/error path (type:"web" entries)
│   │   ├── log-service.js         # In-memory tool-call logger. Module-scope `logs = []`. Exports addLog(item) (stamps id via crypto.randomUUID() + timestamp, pushes, broadcasts LOG_UPDATE { logs } to all BrowserWindows), getLogs() (returns a shallow copy), clearLogs() (empties the array, broadcasts). Instrumented at: api-helper.js (chatCompletion + streamChat success/error paths → type:"ai" entries); web-search-service.js (search + extract success/error paths → type:"web" entries). Log items never written to disk — session-only. AI entry fields: { id, type, timestamp, status, durationMs, model, query, reasoningEffort, maxTokens, promptTokens, completionTokens, totalTokens, cost, response, error? }. Web entry fields: { id, type, timestamp, status, durationMs, query, response, error? }
│   │   └── usage-tracker.js       # Main-process running totals for cost + tokens. Module-scope `totalUSD` (Number, accepts JS-float drift below ~10 decimals — raw `toString()` display) and `totalTokens` (integer). Exports recordUsage(usage) (adds usage.cost / usage.total_tokens when finite, then broadcasts), getTotals() ({ totalUSD, totalTokens }), and resetTotals() (zeroes both accumulators, broadcasts, logs `[usage] reset → …`). broadcast() pushes USAGE_UPDATE { totalUSD, totalTokens } to every BrowserWindow.getAllWindows() (guarded by isDestroyed) so every open screen updates in real time on every API call; logs one concise `[usage] +<delta>...` line per record
│   └── windows/
│       └── main-window.js    # BrowserWindow: 800x600, hidden until ready, preload + contextIsolation
models-catalog.json             # Project-root catalog of all known OpenRouter models in [{name, type, latency?, throughput?, price?, labels?}] format (name without :free suffix, type "Free"|"Paid"). Optional `labels` is a semicolon-separated string (e.g. `"Health #1; Science #2"`) or null/empty — rendered as colored pill badges in the Models popup. Loaded by model-config-service on startup. Edit to add or remove models from the popup.
models-state.json               # Auto-generated by model-config-service under Electron userData (not project root). Stores { activeModels: string[], masterModel: string } — toggled-on worker/doctor models and the single starred master merge model (catalog name). Empty strings/arrays on first launch until user configures via Models popup.
├── preload/
│   └── index.js              # contextBridge → window.electronAPI { ping, enhanceQuery (invoke ENHANCE_QUERY → { ok, enhancedQuery }), onQueryEnhancerProgress (subscribe QUERY_ENHANCER_PROGRESS, returns unsubscribe; drives home bottom-right progress — typed master_start/master_done → worker-progress-panel model snacks in #qe-toast-stack, { message, status } → .qe-toast pills for Tavily lookups), onAgiFanoutProgress (subscribe AGI_FANOUT_PROGRESS, returns unsubscribe; drives the shared worker-progress-panel snack stack on Questionnaire, Laboratory, and Pre-doctor Room), skipFanoutWait (invoke SKIP_FANOUT_WAIT → early fanout merge with settled workers only), startReportCollection, submitQuestionnaire, gotoLaboratory, submitLaboratory, gotoPreDoctorRoom, submitPreDoctorRoom, startDoctor, onDoctorStreamDelta, onDoctorStreamReasoningDelta, onDoctorStreamDone, onDoctorStreamError, getUsageTotals, resetUsageTotals, onUsageUpdate, openDevTools, getModelsConfig, updateModelsConfig, getLogs, clearLogs, onLogUpdate } — the four onDoctor* helpers each wrap ipcRenderer.on and return an unsubscribe function so the renderer can clean up listeners on unload; onDoctorStreamReasoningDelta is the renderer side of the DOCTOR_STREAM_REASONING_DELTA channel used to drive the live "Thinking…" bubble and the collapsible "See thinking" panel; getUsageTotals (invoke GET_USAGE_TOTALS) lets a freshly loaded screen pull the current `{ totalUSD, totalTokens }`, resetUsageTotals (invoke RESET_USAGE_TOTALS) zeroes the main-process accumulators before a new diagnostic run, and onUsageUpdate (subscribe USAGE_UPDATE) streams every new total down to the cost + tokens bubbles in real time, returning the standard unsubscribe function; getModelsConfig (invoke GET_MODELS_CONFIG) returns [{name, type, enabled}] for the Models popup; updateModelsConfig({ activeModels }) (invoke UPDATE_MODELS_CONFIG) persists a new activation set; getLogs (invoke GET_LOGS) returns the full in-memory logs array from log-service; clearLogs (invoke CLEAR_LOGS) empties it; onLogUpdate (subscribe LOG_UPDATE) streams every new log snapshot { logs } to the logs-panel overlay in real time
├── renderer/
│   ├── index.html            # Home screen (links worker-snack.css + app.css). `#models-overlay` + `#error-overlay` both use shared `.glass-overlay` backdrop
│   ├── screens/
│   │   ├── questionnaire/
│   │   │   └── index.html    # Questionnaire screen (shown after home submit; links worker-snack.css + questionnaire.css)
│   │   ├── laboratory/
│   │   │   └── index.html    # Laboratory screen (shown after questionnaire submit; links worker-snack.css + questionnaire.css — identical .q-* class structure)
│   │   ├── pre-doctor-room/
│   │   │   └── index.html    # Pre-doctor Room screen (shown after laboratory submit; links worker-snack.css + questionnaire.css — identical .q-* class structure, including the delete-X card affordance)
│   │   └── doctor/
│   │       └── index.html    # Doctor screen (shown after pre-doctor-room submit; centered loading row, hidden error card, and empty #doc-tabs + #doc-panes containers populated dynamically by doctor.js)
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_QUESTIONNAIRE, SCREEN_LABORATORY, SCREEN_PRE_DOCTOR_ROOM, SCREEN_DOCTOR, labels
│   │   ├── app.js            # Home screen: submit wired through `handleStartDiagnostics()` (send button + Ctrl/Cmd+Enter shortcut). First guard: `isMasterModelSelected()` via `getModelsConfig()` — if no persisted `isMaster`, shows `#error-overlay` (OK dismisses; Open Models opens Models popup) and aborts before usage reset or navigation. Then reads Reasoning level dropdown (#select-reasoning) into sessionStorage['neuroagi:reasoningLevel'], awaits resetUsageTotals(), runs QueryEnhancer when issue non-empty (spinner on send button, #qe-toast-stack + onQueryEnhancerProgress → worker-progress-panel bottom-right + showToast), progressPanel.hide() before navigate, uses enhancedQuery as issue URL param (falls back to raw issue). Empty issue skips enhancer
│   │   ├── worker-progress-panel.js # Shared model progress snack UI: fanout screens (bottom-left #q-worker-stack, AGI_FANOUT_PROGRESS workers_start/worker_done/master_start/master_done) and home QueryEnhancer (bottom-right, attached to #qe-toast-stack, QUERY_ENHANCER_PROGRESS master_start/master_done only). Hides when fanout results render or when home enhanceQuery completes
│   │   ├── fanout-early-continue.js # Shared "Merge with ready models" button controller for Questionnaire / Laboratory / Pre-doctor Room: wireFanoutEarlyContinue({ statusEl, onSkip }) tracks AGI_FANOUT_PROGRESS and shows #q-fanout-continue when 2+ workers, ≥1 ok, others still pending; onSkip invokes skipFanoutWait IPC
│   │   ├── questionnaire.js  # Questionnaire screen: uses worker-progress-panel during startReportCollection, hides spinner before renderQuestions, renders per-type controls, on Submit calls submitQuestionnaire IPC, stashes Q&A in sessionStorage['neuroagi:questionnaire'], navigates to laboratory screen
│   │   ├── laboratory.js     # Laboratory screen: uses worker-progress-panel during gotoLaboratory, reads intake Q&A from sessionStorage, renders per-type controls (duplicated buildCard helpers identical to questionnaire.js), on Submit calls submitLaboratory IPC, stashes lab Q&A in sessionStorage['neuroagi:laboratory'], navigates to pre-doctor-room screen
│   │   ├── pre-doctor-room.js # Pre-doctor Room screen: uses worker-progress-panel during gotoPreDoctorRoom, reads intake Q&A AND lab Q&A from sessionStorage. When the LLM returns zero clarifying questions (empty array — nothing left to ask), hides snack stack, shows a brief "No follow-up questions needed. Proceeding…" status and programmatically clicks Submit so the flow continues to the doctor screen without user interaction. Otherwise renders per-type controls with the questionnaire-style delete-X card (duplicated helpers from questionnaire.js — NO lab toggle). On Submit calls submitPreDoctorRoom IPC, stashes pre-doctor Q&A in sessionStorage['neuroagi:preDoctorRoom'], navigates to doctor screen
│   │   ├── doctor.js         # Doctor screen: reads neuroagi:questionnaire + neuroagi:laboratory + neuroagi:preDoctorRoom from sessionStorage (plus neuroagi:reasoningLevel, defaulting to "medium" if missing), calls startDoctor IPC with all three Q&A blocks plus the reasoningLevel field, builds one tab + pane per returned model, mounts mountPromptCopyBubble(result.prompt) (clipboard pill left of usage bubbles — copies full doctor LLM query to clipboard on click). Each pane carries a hidden .doc-thinking-bubble (rounded glass chat bubble with circular spinner + live char counter), a hidden .doc-reasoning-panel (collapsible "See thinking" card streaming plain-text reasoning into a <pre> body via textContent — never marked.parse, never sanitised, since reasoning is internal monologue), and the existing .doc-pane-status + .doc-prose. Subscribes to onDoctorStreamDelta/ReasoningDelta/Done/Error: reasoning deltas grow the panel buffer and keep the thinking bubble visible while contentStarted is false; the first content delta flips contentStarted, hides the bubble, shows .doc-pane-status ("Streaming response…"), collapses the reasoning panel (still expandable), and starts rendering streaming markdown via marked.parse + sanitizeHtml; done hides the bubble and (if the reasoning buffer is empty) the whole panel too; the beforeunload unsubscribe covers all four channels
│   │   ├── usage-bubbles.js  # Global top-right cost + tokens display loaded by every screen. On DOMContentLoaded it injects a .usage-bubbles container holding .tokens-bubble (left, blue tint) + .cost-bubble (right, green tint), calls electronAPI.getUsageTotals() to seed the initial values inherited from prior screens, and subscribes to electronAPI.onUsageUpdate to live-update both pills on every API call. formatCost(n) renders raw `'USD ' + n.toString()` (no rounding, e.g. `USD 0.0002685564`); formatTokens(n) renders `n.toLocaleString() + ' tokens'` (e.g. `2,241 tokens`). beforeunload removes the IPC listener
│   │   ├── logs-panel.js     # Global tool-call log viewer loaded by every screen (after usage-bubbles.js). On DOMContentLoaded polls for the .usage-bubbles container then prepends a .logs-bubble glass pill ("Logs" icon + text) as its first child so it sits left of the tokens/cost pills. Click opens .logs-overlay — a full-viewport dark-blurred glass modal with two columns: left = scrollable master list of log entries (most recent first), right = detail panel. Clicking a row selects it and populates the detail panel showing type-badge, status, all metadata chips (model, reasoning effort, max tokens, prompt/completion/total tokens, cost, duration, time), full query text and full response text in scrollable <pre> blocks. Subscribe to electronAPI.onLogUpdate for live updates; Clear button calls electronAPI.clearLogs(); Escape/backdrop closes; beforeunload unsubscribes
│   │   └── vendor/
│   │       └── marked.esm.js # Vendored copy of node_modules/marked/lib/marked.esm.js; imported as ESM by doctor.js to satisfy the renderer CSP default-src 'self'
│   ├── styles/
│   │   ├── app.css           # Home screen pastel theme + shared `.glass-overlay` backdrop (Models + error popups) + `.error-modal` compact dialog + .qe-toast-stack bottom-right text toasts + .qe-toast-stack .q-worker-snack slide-in-from-right override
│   │   ├── worker-snack.css  # Shared .q-worker-stack / .q-worker-snack pill styles (spinner, indeterminate bar, checkmark, master/error tints) linked by home index.html and all three questionnaire-screen HTML files
│   │   ├── questionnaire.css # Questionnaire + Laboratory + Pre-doctor Room pastel theme + responsive grid + centered spinner overlay (laboratory/index.html and pre-doctor-room/index.html both link this same stylesheet)
│   │   ├── doctor.css        # Doctor screen pastel theme + centered loading spinner + glass pill tabs + glass content panes + .doc-prose typography (headings, bold, lists, code, blockquote, table) for the streamed markdown output; .doc-thinking-bubble (rounded glass chat bubble with ::before tail + 16px circular spinner + fade-in keyframes) and .doc-reasoning-panel + .doc-reasoning-toggle (chevron rotates 90deg when the panel has .is-open) + .doc-reasoning-body (collapsed via max-height: 0, expands to max-height: 50vh with overflow-y: auto and a dim 0.78rem monospace typography on a dark translucent backdrop)
│   │   ├── usage-bubbles.css # Global cost + tokens bubble styling loaded by every screen. .usage-bubbles is fixed top-right (top: 1rem; right: 1rem; z-index: 11) flex row with 0.5rem gap; shared .usage-bubble base is a glass pill (border-radius: 999px, blurred translucent background, monospace 0.78rem, no wrap, slight lift on hover); .cost-bubble uses a soft green tint (rgba(120,200,140,0.22) bg + rgba(180,230,195,0.55) border + #e6ffe9 text), .tokens-bubble uses a soft blue tint (rgba(140,180,230,0.22) bg + rgba(190,215,245,0.55) border + #eaf3ff text). Both tints stay readable on the pastel pink/lavender/blue gradient
│   │   └── logs-panel.css    # Tool-call log overlay styling loaded by every screen. .logs-bubble = glass pill with soft purple tint (rgba(160,130,240,0.22) bg, rgba(210,190,255,0.55) border, #f0e8ff text) + hover lift + focus ring; .logs-overlay = fixed full-viewport backdrop (rgba(20,10,40,0.65) + 6px blur, z-index 300, fade-in animation); .logs-modal = centred dark glass card (max 900px wide, 90vh tall, dark translucent bg, scale+fade entrance); master list column 340px wide with scrollable .logs-list; .log-row rows with AI/Web type badge pills, status dot (green/red), model preview, duration, time; selected row highlighted with left purple rule; .logs-detail right panel with .logs-detail-meta chip grid and .logs-detail-pre scrollable pre blocks for query/response text
│   └── assets/
│       ├── images/
│       ├── fonts/
│       └── icons/
└── shared/
    └── ipc/
        └── channels.js       # IPC channel name constants (mirrored in preload). All channels: PING, ENHANCE_QUERY, QUERY_ENHANCER_PROGRESS, AGI_FANOUT_PROGRESS, SKIP_FANOUT_WAIT, START_REPORT_COLLECTION, SUBMIT_QUESTIONNAIRE, GOTO_LABORATORY, SUBMIT_LABORATORY, GOTO_PRE_DOCTOR_ROOM, SUBMIT_PRE_DOCTOR_ROOM, START_DOCTOR, DOCTOR_STREAM_DELTA, DOCTOR_STREAM_REASONING_DELTA, DOCTOR_STREAM_DONE, DOCTOR_STREAM_ERROR, GET_USAGE_TOTALS, RESET_USAGE_TOTALS, USAGE_UPDATE, OPEN_DEV_TOOLS, GET_MODELS_CONFIG, UPDATE_MODELS_CONFIG, GET_LOGS, CLEAR_LOGS, LOG_UPDATE
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
3. Clicks the submit button (arrow icon) **or** presses **Ctrl+Enter** / **Cmd+Enter** while the health input has focus — `app.js` listens for the shortcut on the input and synthesises a click on the submit button; both paths call `handleStartDiagnostics()`
4. **Master model guard (first check):** `handleStartDiagnostics()` calls `isMasterModelSelected()` → `getModelsConfig()` → checks persisted `isMaster` on any catalog entry. If none starred, shows `#error-overlay` ("Master model required" — message: *No master model selected. Star a model in the Models popup.*) with **OK** (dismiss) and **Open Models** (closes error overlay, opens `#models-overlay`). Backdrop click and **Escape** also dismiss. Flow aborts — no `resetUsageTotals()`, no QueryEnhancer, no navigation. Validates persisted state (post-Update), not unsaved Models popup edits
5. Before navigating, `app.js` also reads the **Reasoning level** dropdown (`#select-reasoning`, default `medium`) and stashes the chosen value in `sessionStorage['neuroagi:reasoningLevel']` so it survives the navigation chain (Home → Questionnaire → Laboratory → Pre-doctor Room → Doctor) — the value is consumed by `doctor.js`, which forwards it on the `startDoctor` IPC payload to `collector-middleware.js#StartDoctor` where `resolveProseOptions(reasoningLevel)` selects the per-call `{ maxTokens, reasoning }` from the `PROSE_LLM_OPTIONS_BY_LEVEL` lookup
6. `app.js` awaits `window.electronAPI.resetUsageTotals()` (IPC `RESET_USAGE_TOTALS` → `usageTracker.resetTotals()`) so the top-right cost + tokens bubbles reset to `USD 0` / `0 tokens` before the new run begins — returning to home via Back links does **not** reset; only the Start button (or Ctrl/Cmd+Enter shortcut) does
7. If the issue text is non-empty, `app.js` runs the **QueryEnhancer** (see next section) before navigating — this is the only LLM/API work the home screen performs. Progress appears bottom-right as model snack pills (OpenRouter calls) mixed with text toasts (Tavily web lookups). When the issue is empty it skips the enhancer entirely
8. `app.js` builds query string (`?issue=...&gender=...&age=...`) and navigates to `screens/questionnaire/index.html` — the `issue` param is the QueryEnhancer's `enhancedQuery` (original complaint + a `Medication by user:` section) when the enhancer ran, otherwise the raw issue

### QueryEnhancer (home screen medication detection + query rewrite)

Runs on the home screen between `resetUsageTotals()` and navigation, only when the issue text is non-empty. Goal: detect medications the user mentioned in their free-text complaint, resolve each to its generic active-ingredient formula, and rewrite the query so it carries a structured `Medication by user:` section forward as the `issue`.

**Snack placement:** the app uses two snack placements sharing the same `.q-worker-snack` visual language — **Home (QueryEnhancer):** bottom-right `#qe-toast-stack` (model pills mixed with web-tool text toasts); **Fanout screens:** bottom-left `#q-worker-stack` (one pill per worker + master during `AGI_FANOUT_PROGRESS`).

1. `app.js` sets the send button to `.is-loading` (circular spinner overlay, arrow hidden), disables the input + button, ensures `#qe-toast-stack` exists, and subscribes to `window.electronAPI.onQueryEnhancerProgress`. Payloads are routed by shape: `{ type: 'master_start', model }` / `{ type: 'master_done', ok }` → `worker-progress-panel.handleEvent` (glass model pill with spinner + indeterminate bar → checkmark or error tint); `{ message, status }` → `showToast` (Tavily lookups + summary/done/error — auto-dismisses after ~3.5s)
2. `app.js` awaits `window.electronAPI.enhanceQuery({ issue, gender, age })` → IPC `ENHANCE_QUERY` → `collector-middleware.js#EnhanceQuery(payload, event.sender)`
3. **Stage 1 — detect**: `EnhanceQuery` emits `master_start` / `master_done` around `GenerateMedicineFilterLLMQuery` + `AskMasterAgi(prompt, JSON_LLM_OPTIONS)` (single master call — no worker fanout), runs the result through shared `parseJsonArray`. Entries normalized to `{ name, mg, timing }`; any with no `name` dropped. Parse failure sets `master_done ok: false` (error-tint snack) but flow continues. If the list is empty, emits `No medications detected` text toast (`done`) and returns `{ ok: true, enhancedQuery: <original issue> }`
4. **Stage 2 — lookup**: for each detected medicine (sequentially so each gets its own toast) it emits `Looking up <name>…` via `emitToast` and calls `webSearch.search(...)` (Tavily). Per-medicine lookup failure is tolerated (empty evidence set for that medicine)
5. **Stage 3 — rewrite**: emits a **second** `master_start` / `master_done` pair (panel replaces the prior master snack row), builds `GenerateEnhancedQueryLLMQuery({ issue, medicines, searchResults })`, calls `AskMasterAgi`, cleans via `stripFences()`. Falls back to `buildFallbackEnhancedQuery()` on failure (`master_done ok: false`). Emits `Found N medication(s)` text toast and returns `{ ok: true, enhancedQuery }`
6. **Graceful degradation**: whole body wrapped in try/catch — any throw emits `Could not analyze medications — continuing` text toast (`error`) and returns `{ ok: true, enhancedQuery: <original issue> }`
7. `app.js` calls `progressPanel.hide()` (removes worker snack DOM from `#qe-toast-stack`; text toasts remain until auto-dismiss), unsubscribes, uses `res.enhancedQuery` as the `issue` URL param, and navigates to the questionnaire
8. **Usage**: because `resetUsageTotals()` runs before the enhancer, the two master calls + Tavily lookups count toward the run's cost/token totals via `USAGE_UPDATE`

**Progress payload reference (QueryEnhancer):**

| Payload | Channel | Renderer handler | When |
|---------|---------|------------------|------|
| `{ type: 'master_start', model }` | `QUERY_ENHANCER_PROGRESS` | `worker-progress-panel` | Before each home `AskMasterAgi` |
| `{ type: 'master_done', ok }` | same | same | After each home `AskMasterAgi` |
| `{ message, status }` | same | `showToast` | Tavily lookups, summary, fatal catch message |
| `{ type: 'workers_start', … }` etc. | `AGI_FANOUT_PROGRESS` | `worker-progress-panel` (bottom-left) | Questionnaire / Lab / Pre-doctor fanout only |

**Fanout progress payload reference (`AGI_FANOUT_PROGRESS`):**

| Event | Payload | When |
|-------|---------|------|
| `workers_start` | `{ type, models: string[] }` | Before `AskAllWorkerAgis` |
| `worker_done` | `{ type, model, ok, error? }` | Each worker settles (success, timeout, or failure) |
| `workers_skip` | `{ type }` | After early exit — user clicked "Merge with ready models" |
| `master_start` | `{ type, model }` | Before `AskMasterAgi` merge |
| `master_done` | `{ type, ok }` | After master parse or fallback |

### Settings (gear icon) → DevTools toggle

1. Home screen renders a fixed glass gear icon at `top: 1rem; left: 1rem` (`#btn-settings` in `src/renderer/index.html`)
2. Click handler in `app.js` calls `window.electronAPI.openDevTools()`
3. Preload invokes IPC channel `OPEN_DEV_TOOLS`
4. `register.js` handler resolves the calling `BrowserWindow` via `BrowserWindow.fromWebContents(event.sender)` and calls `win.webContents.toggleDevTools()` — clicking again hides DevTools

### Models button → Models popup → activation update

1. Home screen renders a fixed glass pill button `#btn-models` (`.glass-models-btn`) immediately to the right of the gear icon (`left: calc(1rem + 2.5rem + 0.5rem)`)
2. Click opens the Models popup overlay (`#models-overlay`): calls `window.electronAPI.getModelsConfig()` → IPC `GET_MODELS_CONFIG` → `cookie-middleware.GetModelsConfig()` → `model-config-service.getModelsWithState()` → returns `[{name, type, latency, throughput, price, labels, enabled, isMaster}]`
3. `app.js` renders one row per model in Free/Paid tabs: grey star button (left), model name, Free/Paid badge, optional latency/throughput/price bubbles, optional custom label pills (semicolon-separated `labels` string from catalog — each segment becomes a `.models-label-badge` with shared cyan fill `rgb(22 144 173 / 88%)` + white text, no border), toggle switch. Star click sets exclusive master (`isMaster` on one model across both tabs; click starred star again to deselect) — **does not** change worker toggles. Toggle switch controls worker fanout (`enabled`) independently. Both mutate local `modelsState` without persisting until Update
4. `Close` dismisses the popup without saving; `Escape` key and backdrop click also close without saving
5. `Update` sends `{ activeModels, masterModel }` via `updateModelsConfig` → `model-config-service.updateState()` → persists both to userData `models-state.json` independently (a model can be master-only, worker-only, both, or neither). Button shows `Saving…` while in flight, then popup closes
6. On next AGI call, worker fanout reads `getActiveModelIds()` and master merge reads `getMasterModelRuntimeId()` — no restart needed. If no master is starred, `AskMasterAgi` throws (`"No master model selected. Star a model in the Models popup."`) and the collector returns `{ ok: false }` — the home screen now blocks submit earlier via step 4 above so users see `#error-overlay` before leaving home

### Questionnaire screen → LLM question generation

1. `questionnaire.js` on `DOMContentLoaded` reads `issue`, `gender`, `age` from URL params, fills the summary, and shows a centered `Loading questions…` spinner. It subscribes to `onAgiFanoutProgress` and drives the shared [`worker-progress-panel.js`](src/renderer/scripts/worker-progress-panel.js) bottom-left snack stack (one glass pill per worker with indeterminate progress bar, then a master pill; checkmark when each completes; stack fades out when questions render). [`fanout-early-continue.js`](src/renderer/scripts/fanout-early-continue.js) watches the same progress stream and shows a **Merge with ready models** text button (`#q-fanout-continue`) below the spinner when 2+ workers are running, at least one succeeded, and others are still pending — click invokes `skipFanoutWait` IPC to proceed to master merge without waiting for slow workers
2. It calls `window.electronAPI.startReportCollection({ issue, gender, age })` → IPC `START_REPORT_COLLECTION`
3. Main process: `register.js` invokes `StartReportcollection(payload, event.sender)` in `collector-middleware.js`, which runs the shared `runFanoutMergePipeline` helper (registers a `fanout-session` per sender, emits typed `AGI_FANOUT_PROGRESS` events) to the renderer
4. The middleware builds the initial intake prompt via `GenerateQuestionnaireLLMQuery()`. It then runs a **two-stage AGI pipeline** instead of a single LLM call:
   - **Stage 1 — Fanout**: `AskAllWorkerAgis(prompt, JSON_LLM_OPTIONS, { onWorkerSettled, shouldProceedEarly })` in `agi-service.js` issues parallel `chatCompletion` calls to every enabled model from `getActiveModelIds()`. Each worker has a **120s timeout**; timed-out or failed workers are dropped. Early exit: when `shouldProceedEarly()` is true (user clicked merge) and at least one worker succeeded, fanout aborts pending HTTP requests (via `AbortController` passed to `chatCompletion`), emits `worker_done ok:false` for each skipped model, and resolves with settled results only — snack pills for skipped workers show error tint instead of spinning indefinitely.
   - **Per-worker parse**: each `ok: true` worker response goes through the tiered `parseJsonArray` (see below). Workers that fail to parse are logged and dropped; workers that succeeded are collected into an array of parsed questionnaire arrays.
   - **All-fail guard**: if zero workers succeeded (no parseable JSON from anyone), the middleware throws → renderer shows the centered red Retry button.
   - **Stage 2 — Master merge**: `GenerateMergeQuestionnaireLLMQuery({ issue, gender, age, questionnaireSets: parsedSets })` builds a prompt that asks the master model to consolidate the worker outputs (dedupe by intent, union MCQ options keeping "Other" last, prefer the clearer slider/range labels, drop low-value questions, never invent new clinical territory). `AskMasterAgi(prompt, JSON_LLM_OPTIONS)` calls `chatCompletion` against the user-starred master model (`getMasterModelRuntimeId()` from `model-config-service.js`; throws if none starred). Both Stage 1 (`AskAllWorkerAgis`) and Stage 2 receive `JSON_LLM_OPTIONS = { maxTokens: 4096, reasoning: { effort: "none" } }` so OpenRouter is told to cap the output at 4096 tokens and disable thinking-mode reasoning — without this hint a thinking-capable model (e.g. `deepseek/deepseek-v4-flash`) will sometimes burn its entire completion budget on `reasoning_tokens` and emit zero visible content.
5. The master's raw response is run through the same **three-tier parser** as the worker responses (Tier 1 strict / Tier 2 normalize / Tier 3 jsonrepair; the parser also throws a specific `LLM returned empty content` error up front when the trimmed text is empty so the cause is easy to spot in the log). If parsing succeeds the middleware returns `{ ok: true, issue, gender, age, questions }`
6. **Master-merge fallback**: if the three-tier parser on the master output throws (or the master returned empty content), the middleware does **not** fail. It calls `pickBestWorkerSet(parsedSets)` — a tiny module-scope helper that returns the parsed worker array with the most questions — and uses that as the final `questions`. The fallback is logged at warn level (`[collector] Master merge unusable, falling back to best worker set: <error>`) followed by `[collector] Master merge fallback: using worker set with N questions`. The user still gets a usable questionnaire; only the dedupe/merge polish step is skipped
7. **Unrecoverable failure → Retry**: only triggers when zero workers produced parseable JSON (the master-merge fallback can no longer save us). The middleware returns `{ ok: false, error }` and the questionnaire screen swaps the centered status overlay to a friendly message (translated by `humanizeError()` — 429 → "The AI service is temporarily rate-limited…", network errors → "Network error reaching the AI service…") plus a **red Retry button**. The button just calls `window.location.reload()`, which restarts the whole flow from scratch (re-fires `DOMContentLoaded`, re-spawns the spinner, re-invokes IPC, and re-runs the full fanout-merge pipeline)
8. `questionnaire.js` hides the status spinner **before** rendering cards (so a render edge case cannot leave the loading overlay stuck), reveals `#q-form`, and renders one `<section class="q-card q-card--{type}">` per question with type-specific controls; reveals the Submit button
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
4. Main process: `register.js` invokes `GotoLaboratory(payload, event.sender)` in `collector-middleware.js`, which runs the shared `runFanoutMergePipeline` helper (same typed `AGI_FANOUT_PROGRESS` snack events as the questionnaire) with initial prompt `GenerateLaboratoryLLMQuery({ issue, gender, age, questions, answers })`. Success returns `{ ok: true, issue, gender, age, questions }`; master-merge fallback and all-fail guard behave identically to the questionnaire path (logs tagged `[collector/lab]`)
5. `laboratory.js` uses `worker-progress-panel.js` during the IPC call, hides the snack stack when results arrive, then renders lab questions through duplicated `buildCard` helpers
6. The same `showError` / `humanizeError` retry path is reused: on `{ ok: false }` or any thrown error the centered red Retry button reloads the page and re-runs the lab fanout-merge

### Laboratory submit → Pre-doctor Room screen

1. User clicks Submit on the laboratory; `laboratory.js` collects answers via the duplicated `collectAnswers` and disables the button (label switches to `Submitting…`)
2. Renderer calls `window.electronAPI.submitLaboratory({ issue, gender, age, questions, answers })` → IPC `SUBMIT_LABORATORY`
3. Main process: `register.js` invokes `SubmitLaboratory()` in `collector-middleware.js`, which logs a structured lab Q&A dump (one `Q{n} [type] text` / `A{n}: value` per question, framed by `=== Lab Q&A dump ===` markers, tagged `[collector/lab]`) and returns `{ ok: true }`
4. The renderer stashes `{ issue, gender, age, questions, answers }` into `sessionStorage['neuroagi:laboratory']` (mirroring how `questionnaire.js` stashes `neuroagi:questionnaire`); on success it navigates to `screens/pre-doctor-room/index.html?issue=…&gender=…&age=…` (only `issue/gender/age` ride in the URL — the bulky Q&A payloads are too large for query strings); on failure the Submit button re-enables and the centered error card appears

### Pre-doctor Room screen → LLM clarifying-question generation

1. `pre-doctor-room.js` on `DOMContentLoaded` reads `issue/gender/age` from URL params and reads BOTH `sessionStorage['neuroagi:questionnaire']` and `sessionStorage['neuroagi:laboratory']`, JSON-parses each, and bails to the centered red error card with the message `Missing questionnaire or laboratory data. Please restart from the home screen.` if either payload is missing or malformed (e.g. the user opened the URL directly)
2. It calls `window.electronAPI.gotoPreDoctorRoom({ issue, gender, age, questionnaire: { questions, answers }, laboratory: { questions, answers } })` → IPC `GOTO_PRE_DOCTOR_ROOM`
3. Main process: `register.js` invokes `GotoPreDoctorRoom(payload, event.sender)` in `collector-middleware.js`, which runs the shared `runFanoutMergePipeline` helper with initial prompt `GeneratePreDoctorRoomLLMQuery({ issue, gender, age, questionnaire, laboratory })` (serializes intake + lab Q&A via `formatQaBlock`, asks workers for final clarifying questions only). Same typed `AGI_FANOUT_PROGRESS` snack events and master-merge fallback as the other fanout screens (logs tagged `[collector/predoc]`)
4. On success the middleware returns `{ ok: true, issue, gender, age, questions }`. `pre-doctor-room.js` uses `worker-progress-panel.js` during the IPC call and hides the snack stack when results arrive. If `questions` is non-empty, it renders clarifying questions through the questionnaire-style card helpers (delete-X button, no lab toggle). If `questions` is empty, it shows `No follow-up questions needed. Proceeding…` and auto-submits to the doctor screen
5. The same `showError` / `humanizeError` retry path is reused: on `{ ok: false }` or any thrown error the centered red Retry button reloads the page and re-runs the pre-doctor fanout-merge

### Pre-doctor Room submit → Doctor screen

1. User clicks Submit on the pre-doctor room; `pre-doctor-room.js` builds the trimmed `{ questions, answers }` payload via `collectSurviving(formEl, loadedQuestions)` so cards deleted via the top-right X are absent from both arrays, then disables the button (label switches to `Submitting…`)
2. Renderer calls `window.electronAPI.submitPreDoctorRoom({ issue, gender, age, questions, answers })` → IPC `SUBMIT_PRE_DOCTOR_ROOM`
3. Main process: `register.js` invokes `SubmitPreDoctorRoom()` in `collector-middleware.js`, which logs a structured Q&A dump (one `Q{n} [type] text` / `A{n}: value` per question, framed by `=== Pre-doctor Q&A dump ===` markers, tagged `[collector/predoc]`) and returns `{ ok: true }`
4. The renderer stashes the SAME trimmed `{ issue, gender, age, questions, answers }` into `sessionStorage['neuroagi:preDoctorRoom']`; on success it navigates to `screens/doctor/index.html?issue=…&gender=…&age=…` (only `issue/gender/age` ride in the URL — the bulky Q&A payloads are too large for query strings); on failure the Submit button re-enables and the centered error card appears

**Per-card "I have this report" toggle (lab-only).** Every lab card emitted by `laboratory.js#buildCard` is prepended with a `.q-report-toggle` pill switch (markup: `<label class="q-report-toggle"><input data-report-toggle="1" role="switch">...<span class="q-report-toggle-text">I don't have this report</span></label>`), default **off**. On initial render `buildCard` also calls `setCardInputsDisabled(card, true)` and adds the `q-card--no-report` class itself so the just-rendered type controls are dimmed and disabled from the first paint — without this the controls would start visually enabled because the toggle's own `change` handler hasn't fired yet. The toggle's `change` handler flips the same `.q-card--no-report` class and calls `setCardInputsDisabled(card, !checked)` which sets `disabled = true` on every `input`/`textarea`/`select` inside the card (the toggle itself is excluded via the `[data-report-toggle="1"]` selector). The label text swaps between `I don't have this report` (off) and `I have this report already` (on). `.q-card--no-report` in `questionnaire.css` dims the question heading and every input wrapper to `opacity: 0.45` + `pointer-events: none`, while explicitly keeping the toggle row fully interactive so the user can flip it on. On submit, `collectAnswers` short-circuits any card whose toggle is unchecked and pushes `{ question, type, value: "the user does not have this report currently" }` regardless of question type — so `multi_select` answers normally typed `string[]` and `range` answers normally typed `{ min, max }` become a plain string for that card. Because the default is now off, **submitting an untouched lab screen sends the sentinel string for every card**; the user must explicitly enable the toggle on each card they actually have a report for. Downstream consumers (`SubmitLaboratory` log, doctor analysis prompt) should test `answer.value === "the user does not have this report currently"` before doing any type-specific handling.

### Doctor screen → streaming multi-doctor analysis

1. `doctor.js` on `DOMContentLoaded` sets the title and patient summary from URL params, then reads `sessionStorage['neuroagi:questionnaire']` AND `sessionStorage['neuroagi:laboratory']` AND `sessionStorage['neuroagi:preDoctorRoom']`. If any of the three payloads is missing or malformed, it shows the centered red error card with the message `Missing questionnaire, laboratory, or pre-doctor data. Please restart from the home screen.` (the Back link in the header still points to the **home screen** so the user can reset the flow cleanly — going back to the pre-doctor / lab screens would re-trigger their LLM fanouts)
2. The renderer subscribes to the four streaming channels via `window.electronAPI.onDoctorStreamDelta`, `onDoctorStreamReasoningDelta`, `onDoctorStreamDone`, `onDoctorStreamError` (each returns an unsubscribe function captured for `beforeunload` cleanup), reads `sessionStorage['neuroagi:reasoningLevel']` (default `"medium"` when missing or when the Doctor URL is opened directly), THEN calls `window.electronAPI.startDoctor({ issue, gender, age, reasoningLevel, questionnaire: { questions, answers }, laboratory: { questions, answers }, preDoctorRoom: { questions, answers } })` → IPC `START_DOCTOR`
3. Main process: `register.js` invokes `StartDoctor()` in `collector-middleware.js`, passing the raw `event.sender` so the middleware can push events back without going through `ipcMain.handle`'s request/response cycle:
   - Builds the analysis prompt via `GenerateDoctorAnalysisLLMQuery({ issue, gender, age, questionnaire, laboratory, preDoctorRoom })` (Markdown-only, second-person, multi-section pre-doctor analysis) — the prompt now serializes THREE chronological Q&A blocks via the shared `formatQaBlock` helper: intake → laboratory → pre-doctor clarifications, so the model can reason across the entire conversation
   - Resolves the per-call `{ maxTokens, reasoning }` from the incoming `reasoningLevel` via `resolveProseOptions(reasoningLevel)` — unknown / missing levels fall back to `PROSE_LLM_OPTIONS_BY_LEVEL.medium` (also the dropdown default), so the Doctor URL is safe to open directly without breaking the prompt
   - Calls `StreamFromAllDoctorAgis(prompt, callbacks, proseOptions)` in `agi-service.js` — a thin wrapper around `StreamFromAllWorkerAgis` that hard-binds `modelList = OPENROUTER_DOCTOR_MODELS` so the Doctor screen runs against a **dedicated doctor pool** (`deepseek/deepseek-v4-flash` + `google/gemini-2.5-flash-lite`) instead of the worker pool used by the questionnaire / lab / pre-doctor screens. The wrapper iterates the list and starts a `streamChat(messages, model, onDelta, onDone, onError, options, onReasoningDelta)` per model in parallel — one independent SSE connection per doctor, no cross-talk
   - `streamChat` splits each OpenRouter SSE chunk into `delta.content` (forwarded to `onDelta`) and `delta.reasoning` (forwarded to the new `onReasoningDelta`); the per-call done log line reports both `deltaChars` and `reasoningChars` so the thinking/output ratio is visible per model
   - Each callback re-forwards the event over IPC, threading the model id into the payload:
     - delta → `DOCTOR_STREAM_DELTA { model, delta }`
     - reasoning delta → `DOCTOR_STREAM_REASONING_DELTA { model, delta }`
     - done  → `DOCTOR_STREAM_DONE { model }`
     - error → `DOCTOR_STREAM_ERROR { model, error }`
   - A sibling `reasoningBuffers` Map (mirrors the existing `streamBuffers`) accumulates reasoning chunks per model so the done/error log lines can report both content length and reasoning length. Models that don't emit a `delta.reasoning` field (e.g. `openai/gpt-4o-mini` if added later) simply never trigger `onModelReasoning`, the per-model reasoning buffer stays empty, and the renderer never shows the thinking bubble or the panel for that tab — fully tolerant of mixed-capability doctors
   - Every `sender.send` is wrapped in `safeSend` which checks `sender.isDestroyed()` first, so navigating away from the doctor screen mid-stream does not crash the main process
   - Returns `{ ok: true, models, prompt }` **synchronously** (does not await any stream); the renderer needs the model list right now so it can build the tab UI before the first delta arrives, and `prompt` carries the full `GenerateDoctorAnalysisLLMQuery` string for the doctor-only clipboard bubble
4. The renderer builds **one tab + one pane per model** and calls `mountPromptCopyBubble(result.prompt)` — prepends a `.prompt-copy-bubble` glass pill (clipboard icon) to the left of the tokens/cost row; click copies the full prompt to the system clipboard via `navigator.clipboard.writeText`. Tab label = the raw model id (e.g. `deepseek/deepseek-v4-flash`); each tab carries a tiny live spinner pill, and each pane is a glass card with a model-id tag at the top (`Analysis by <model>`), a hidden **thinking bubble** (`.doc-thinking-bubble` — fades in when the first reasoning delta arrives), a hidden **collapsible reasoning panel** (`.doc-reasoning-panel` with a `See thinking (N chars)` toggle button + `.doc-reasoning-body` `<pre>`), the existing `Streaming response…` status row (now hidden by default — only revealed on the first content delta), and a `.doc-prose` div where the markdown is rendered. The first model is set active by default; click on any other tab to switch — only the active pane is `display: flex`, others are `display: none`
5. On every **reasoning delta** the renderer appends `delta` to the per-model `reasoningBuffer`, ensures the `.doc-reasoning-panel` is visible (it shows up the first time any reasoning chunk arrives — but stays collapsed unless the user clicks the toggle), updates the toggle label to `See thinking (N chars)`, and writes the cumulative buffer into `.doc-reasoning-body` as `textContent` (NOT `marked.parse` — reasoning is internal monologue, often not valid Markdown). While `contentStarted` is still `false` the `.doc-thinking-bubble` is also kept visible (16px circular spinner + `Thinking…` label + live char counter) and the existing `.doc-pane-status` row stays hidden so the bubble is the only live element. On every **content delta**, the renderer appends to the per-model content `buffer` and re-runs `marked.parse(buffer)` + the inline `sanitizeHtml` (strips `<script>` blocks, on-event attributes, `javascript:` href/src) into `.doc-prose`. The **first** content delta also flips `contentStarted = true`, hides the thinking bubble, shows `.doc-pane-status` with label `Streaming response…`, and collapses the reasoning panel (the user can re-expand it any time via the chevron toggle — it just won't auto-scroll while collapsed)
6. On `done` for a model: pane spinner hides, the pane status row turns green ("Analysis complete"), the tab gets `.is-complete` (which hides the tab spinner). The thinking bubble is force-hidden in case the model finished without ever emitting content; if the reasoning buffer is still empty the entire `.doc-reasoning-panel` is also hidden (no point showing a collapsible card that has nothing in it). On `error` for a model: pane spinner hides, the pane status row turns red ("This doctor could not respond"), the thinking bubble is hidden, the tab gets `.is-failed` (red pill), and if no text had streamed yet a `.doc-pane-error` card is rendered inside the pane with a `humanizeError`d message (same translation rules as questionnaire/laboratory — 429 → rate-limit, network → connectivity hint)
7. There is **no per-tab retry** — a hard failure surfaces in that tab while the other doctors keep streaming. If `startDoctor` itself rejects before any stream starts (e.g. preload not wired, prompt build threw, no doctor models configured in `OPENROUTER_DOCTOR_MODELS`) the whole screen falls back to the same centered red Retry card used by the questionnaire/laboratory screens; the Retry button just `window.location.reload()`s and re-runs the full fanout

### Usage tracker (always-on top-right bubbles)

1. `src/main/services/usage-tracker.js` owns two module-scoped accumulators: `totalUSD` (Number) for the running cost and `totalTokens` (integer) for the running token count. Both reset to 0 when the Electron main process starts and are not persisted to disk. Within a single diagnostic run they accumulate across all screens; clicking **Start** on the home screen (or Ctrl/Cmd+Enter) calls `resetTotals()` via IPC to zero them again before navigating to the questionnaire — merely returning home via Back links does not reset.
2. Every OpenRouter response funnels into `usageTracker.recordUsage(usage)`:
   - `chatCompletion` (non-streaming, used by the questionnaire / laboratory / pre-doctor / master-merge flows) calls it right after the `chatCompletion ✓ done` log line with the JSON response's `usage` block, which always carries both `cost` and `total_tokens`.
   - `streamChat` (used by the doctor screen) sends `usage: { include: true }` in the request body so OpenRouter emits a final SSE chunk containing `usage`. The parser captures that into a local `lastUsage` variable from both the main loop and the trailing-buffer block, and `finish()` calls `recordUsage(lastUsage)` after the streaming done log. Without `usage: { include: true }`, OpenRouter would skip the trailing usage chunk and the doctor calls would not contribute to either total — this body field is mandatory.
3. `recordUsage` only accumulates finite numeric `cost` / `total_tokens` values (silently ignores missing or non-finite fields, so providers that report `cost: 0` on BYOK / free tier still update the token total correctly). On every record it broadcasts `USAGE_UPDATE { totalUSD, totalTokens }` to every `BrowserWindow.getAllWindows()` whose `webContents` is not destroyed.
4. In the renderer, `src/renderer/scripts/usage-bubbles.js` is loaded as a module by all five HTML files (home, questionnaire, laboratory, pre-doctor-room, doctor). On `DOMContentLoaded` it injects a fixed top-right `.usage-bubbles` container holding `.tokens-bubble` (left, blue tint) + `.cost-bubble` (right, green tint), calls `electronAPI.getUsageTotals()` once to seed the initial values inherited from prior screens, and subscribes to `electronAPI.onUsageUpdate` so every subsequent broadcast updates both pills together.
5. Formatting is asymmetric on purpose: `formatCost` returns `'USD 0'` or `'USD ' + n.toString()` — raw `Number.toString()` with no rounding, no padding, no thousands separators (e.g. `USD 0.0002685564` displays exactly as OpenRouter reported). `formatTokens` returns `n.toLocaleString() + ' tokens'` (e.g. `2,241 tokens`) since integer counts are easier to read with separators and have no precision to preserve. The `beforeunload` listener removes the IPC subscription so reloads and page navigations don't leak handlers.
6. Because the bubbles are sourced from the main process, navigating between screens (each is a full HTML page reload that wipes renderer state) doesn't reset the totals mid-run — the new screen pulls the latest values via `getUsageTotals()` on mount and the bubble is correct before paint. A new run starts at zero only after the home Start button invokes `resetUsageTotals()`.
7. JS `Number` arithmetic introduces sub-cent drift across many small additions for `totalUSD` (e.g. `0.1 + 0.2 = 0.30000000000000004`); for OpenRouter's ~10-decimal cost precision this drift is invisible to the user and well below a hundredth of a cent. `totalTokens` is integer addition so it accumulates exactly. If exact USD accounting becomes a requirement later, swap to BigInt micro-USD (multiply by 1e10, round, accumulate as BigInt, format back on output) — none of the other call sites change.

### Tool-call logger (Logs bubble → overlay)

Records every OpenRouter AI model call and every Tavily web search call in a session-scoped in-memory list. Logs persist until the user clicks Clear in the overlay or the app process exits.

**Capture points:**
- `api-helper.js#chatCompletion` — records one AI log item on every finish (success or error): type `"ai"`, model, full query text (all messages joined), reasoning effort, maxTokens, prompt/completion/total tokens, cost, full response content, durationMs.
- `api-helper.js#streamChat` — records one AI log item in `finish()` with accumulated streaming content; error paths (HTTP error, no body, exception) record `status:"error"` + error message without a response.
- `web-search-service.js#search` — records one Web log item on complete (type `"web"`, query, full Tavily response object, durationMs) or `status:"error"` on network/HTTP failure.
- `web-search-service.js#extract` — same as search; query is the comma-joined URL list.

**IPC flow:**
1. Main process — `log-service.js#addLog` stamps `id` + `timestamp`, pushes entry, broadcasts `LOG_UPDATE { logs }` to all open windows.
2. Renderer — `logs-panel.js` subscribes via `electronAPI.onLogUpdate` and live-refreshes the open overlay. Freshly opened overlay calls `electronAPI.getLogs()` to seed the full list. Clear button calls `electronAPI.clearLogs()`.

**Bubble placement:** `logs-panel.js#init` polls for the `.usage-bubbles` container (injected by `usage-bubbles.js`), then inserts the `.logs-bubble` as its **first child**, so the order left→right is: Logs | tokens | cost. On the Doctor screen the prompt-copy bubble is prepended after the logs bubble by `doctor.js#mountPromptCopyBubble`, so the order becomes: Logs | prompt-copy | tokens | cost.

**Granularity:** one log item per individual model call — a worker fanout with 3 active models produces 3 AI log items. The master merge call produces a fourth. This is intentional to give maximum per-call visibility.

**Lifecycle:** logs never auto-clear; they accumulate for the entire app session. `resetUsageTotals()` (called on Start) does NOT clear logs. Only the overlay's Clear button clears them.

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
| `PROSE_LLM_OPTIONS_BY_LEVEL` (resolved via `resolveProseOptions(level)`, `DEFAULT_REASONING_LEVEL = "medium"`) | Lookup table — `none` → `{ maxTokens: 4096, reasoning: { effort: "none" } }`, `low` → `{ maxTokens: 8192, reasoning: { effort: "low" } }`, **`medium` (default)** → `{ maxTokens: 16384, reasoning: { effort: "medium" } }`, `high` → `{ maxTokens: 32768, reasoning: { effort: "high" } }`, `very_high` → `{ maxTokens: 65536, reasoning: { effort: "high" } }` | Doctor screen streaming fanout (`StartDoctor` → `StreamFromAllDoctorAgis` → `OPENROUTER_DOCTOR_MODELS`) | The doctor analysis is the only workload that benefits from deep clinical reasoning — each model in the doctor pool is treated as an independent "doctor" forming a diagnostic impression, so we want the user in control of how hard each doctor "thinks." The level is picked on the Home-screen **Reasoning level** dropdown (`#select-reasoning`, 5 options), stashed in `sessionStorage['neuroagi:reasoningLevel']` by `app.js`, read back by `doctor.js` and forwarded as `reasoningLevel` on the `startDoctor` IPC payload; `collector-middleware.js` then calls `resolveProseOptions(reasoningLevel)` and passes the resulting `{ maxTokens, reasoning }` straight into `StreamFromAllDoctorAgis`. The `very_high` option reuses `effort: "high"` on the wire (OpenRouter's reasoning-effort surface caps at `high`) and is therefore primarily a `maxTokens` bump (32768 → 65536) for models that benefit from a larger completion budget at high effort. Unknown / missing values fall back to `medium`, so opening the Doctor URL directly (bypassing Home) is always safe. Per OpenRouter's `effort: "high"` semantics, ~80% of `max_tokens` is reserved for reasoning tokens, so even on `high` (`maxTokens: 32768`) ~6550 tokens remain for the visible 10-section Markdown — comfortable headroom for verbose responses without risking mid-stream truncation. Models that don't expose a reasoning surface (e.g. `openai/gpt-4o-mini`) silently ignore the field and stream prose normally — fine for the multi-tab UI where each doctor is independent. The JSON_LLM_OPTIONS row above stays on `effort: "none"` because the questionnaire / lab / pre-doctor workloads must emit a parseable JSON array; any reasoning tokens eating that output budget would crash `parseJsonArray` with empty content (the exact `contentChars: 0` failure mode that drove these per-workload options in the first place) |

`api-helper.js` only writes `max_tokens` / `reasoning` into the body when they are provided, so call sites without an `options` arg behave exactly as before. The request log line (`[api-helper] chatCompletion → request` / `streamChat → request`) now includes `maxTokens` and `reasoning` so the actual request shape is visible in the console.

### `GenerateMedicineFilterLLMQuery({ issue, gender, age })`

**File:** `src/main/helpers/query-generator-helper.js`

QueryEnhancer Stage 1 prompt. **Persona:** experienced clinical pharmacist. **Task:** extract ONLY the medications/drugs/supplements the patient EXPLICITLY mentions in their free-text description — never invent or infer meds a patient "might" take. Brand names are kept as written (the active ingredient is resolved later). **Output contract:** a JSON array where each element is exactly `{ "name": string, "mg": string, "timing": string }` (`mg`/`timing` are empty strings when unstated), or `[]` when no medication is mentioned. No markdown/comments/fences. Consumed by `collector-middleware.js#EnhanceQuery` via `AskMasterAgi(prompt, JSON_LLM_OPTIONS)`.

### `GenerateEnhancedQueryLLMQuery({ issue, medicines, searchResults })`

**File:** `src/main/helpers/query-generator-helper.js`

QueryEnhancer Stage 3 prompt. **Persona:** clinical pharmacist. Receives the original patient query plus the detected medicines and per-medicine Tavily evidence (`{ answer, results }` matched by name, `JSON.stringify`-ed into the prompt). It resolves each medicine's generic **active ingredient name** (the drug substance, not a chemical formula) and returns the **FINAL ENHANCED QUERY as plain text** — the patient's original complaint preserved verbatim, then a blank line, then a section formatted exactly:

```
Medication by user:
- <active ingredient> (reported as "<name>")[; dosage: <mg>][; timing: <timing>]
```

(one bullet per medicine in order; the dosage/timing fragments are omitted when not reported). **Context-aware disambiguation:** the reported name may be misspelled/ambiguous, so the prompt instructs the model to use the reported dosage / dosage-form / timing as context — when the literal name resolves to a drug whose typical form/dosing is inconsistent with what the patient reported and the name closely matches a more clinically plausible similarly-spelled drug, it treats the reported name as a likely misspelling and resolves to that drug's active ingredient (allowed to use its own pharmacological knowledge for this judgment, not just the web evidence). Example baked into the prompt: "Topagen 50 mg every night" → resolves to `topiramate` (Topiragen/Topamax) rather than the literal topical betamethasone+gentamicin product. **Output contract:** only the final query text — no preamble, labels, JSON, code fences, or surrounding quotes. Consumed by `EnhanceQuery` via `AskMasterAgi(prompt, JSON_LLM_OPTIONS)`, cleaned with `stripFences()`; the middleware falls back to `buildFallbackEnhancedQuery()` (original issue + a section built from the detected names) if the call fails or returns empty.

### `GenerateQuestionnaireLLMQuery({ issue, gender, age })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt that asks an LLM to generate medical intake follow-up questions based on the user's initial issue, age, and gender. Inputs are sanitized: missing/empty `issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`. The `issue` may already be the QueryEnhancer's `enhancedQuery` (carrying an appended `Medication by user:` section) — it is consumed as-is in the `Presenting issue` field, no medication-specific handling needed.

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

**Consumers:** wired through `src/main/middlewares/collector-middleware.js`. `StartReportcollection({ issue, gender, age })` builds this prompt and sends it to **all worker models in parallel** via `AskAllWorkerAgis()` in `src/main/services/agi-service.js` (which uses `chatCompletion(messages, model)` from `api-helper.js`). Each worker response is parsed through the tiered parser; the surviving parsed arrays are then fed into `GenerateMergeQuestionnaireLLMQuery({ issue, gender, age, questionnaireSets: parsedSets })` and sent to the master model via `AskMasterAgi()`. The final master JSON is parsed and returned over IPC to `src/renderer/scripts/questionnaire.js` which renders one card per question.

### `GenerateMergeQuestionnaireLLMQuery({ issue, gender, age, questionnaireSets })`

**File:** `src/main/helpers/query-generator-helper.js`

Builds the prompt the **master model** (user-starred via Models popup, resolved by `getMasterModelRuntimeId()` in `model-config-service.js`) uses to consolidate the per-worker questionnaires into a single deduplicated set. Inputs are sanitized the same way as the intake prompt (`issue` falls back to `"an unspecified health issue"`, `gender` defaults to `"male"`, `age` defaults to `"30"`).

**Persona:** experienced medical doctor + clinical assessment designer (kept consistent with the intake prompt).

**Inputs serialized into the prompt:**
- The current request date/time (same `toLocaleString` format as the intake prompt, for awareness only).
- Patient original issue, age, and gender (same For awareness block as the intake prompt — lets the master model prioritize and filter questions by presenting complaint).
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

**Formatting rules:**
- Output Markdown only — `#`, `##`, `**bold**`, `*italic*`, `-` / numbered lists are encouraged.
- Do NOT wrap the entire reply in a code fence and do NOT return JSON.
- Do NOT include any text before the first heading or after the last section.

**Consumers:** wired through `src/main/middlewares/collector-middleware.js#StartDoctor`, fanned out via `StreamFromAllDoctorAgis` in `agi-service.js` — a wrapper around `StreamFromAllWorkerAgis` that uses the dedicated **`OPENROUTER_DOCTOR_MODELS`** pool (one parallel `streamChat` per doctor, currently `deepseek/deepseek-v4-flash` + `google/gemini-2.5-flash-lite`). Each model's stream is forwarded over the IPC channels `DOCTOR_STREAM_DELTA / DOCTOR_STREAM_REASONING_DELTA / DOCTOR_STREAM_DONE / DOCTOR_STREAM_ERROR` — the reasoning channel drives the live "Thinking…" bubble and the collapsible "See thinking" panel on each tab, the content channel drives the streamed Markdown prose. There is **no master merge** for this prompt — each doctor is treated as an independent "physician" giving their own opinion, and the user picks which tab to read.

---

## Design

### Home screen (`app.css`)

| Element | Style |
|---------|-------|
| **Background** | Soft pastel gradient (pink → lavender → light blue, `135deg`); subtle radial glow overlay |
| **Title** | White, centered, responsive clamp sizing, text-shadow for depth |
| **Text input** | Solid white, rounded rectangle (`14px`), soft shadow, dark text; 80% viewport width |
| **Submit button** | Dark rounded square (`10px`) inside input, right-aligned; white arrow SVG icon; no hover animation. While the QueryEnhancer runs it gets `.is-loading`: the arrow SVG is hidden and an indeterminate `1.25rem` circular spinner ring (`qe-spin` keyframes) is centered over it; the button + input are disabled for the duration |
| **QueryEnhancer progress stack** | `.qe-toast-stack` fixed bottom-right (`bottom: 1rem; right: 1rem; z-index: 50`, column, right-aligned, `pointer-events: none`). Holds **two pill types**: (1) `.qe-toast` text pills from `app.js#showToast` for Tavily lookups + summary messages — thin rounded glass pill (`999px`, `0.78rem` text, `qe-toast-in` from right, auto-removed after ~3.5s; `status` tints: active = glass, `done` = green, `error` = red); (2) `.q-worker-snack` model pills from `worker-progress-panel` (attached via `attachToSelector: '#qe-toast-stack'`) for both OpenRouter `AskMasterAgi` stages — spinner + indeterminate bar → checkmark/error tint, `Master · <model>` label, purple master tint; slides in via `qe-worker-snack-in` in `app.css`. `progressPanel.hide()` removes snack nodes only (text toasts keep their own auto-dismiss) |
| **Worker snack styles (shared)** | Defined in `worker-snack.css` (linked by home + all fanout screens). `.q-worker-snack` glass card with monospace model label, 16px spinner/checkmark icon, 4px indeterminate progress track (`.is-active` shimmer → `.is-done` full green bar). `.q-worker-snack--master` purple tint; `.q-worker-snack--error` red tint. Fanout-owned stack: `.q-worker-stack` bottom-left; home attaches snacks into `#qe-toast-stack` instead |
| **Dropdowns (gender/age)** | Frosted translucent white (`rgba(255,255,255,0.65)`), rounded (`10px`), grey text, custom SVG chevron; right-aligned below input, auto-width |
| **Dropdown options** | White background, light purple highlight on selected |
| **Reasoning level dropdown** | Sits on the **left** of the selects row (`.home-reasoning-wrap` = `display: flex; align-items: center; gap: 0.5rem`) with a small soft-white `.home-select-label` ("Reasoning level", `0.78rem`, `rgba(255,255,255,0.85)`, subtle text-shadow). The select itself is the same `.glass-select` style as gender/age. Five options — None / Low / Medium / High / Very High — with **Medium selected by default**. `.home-selects-row` uses `justify-content: space-between` so this wrap floats left while the existing gender/age selects stay right-aligned; on narrow widths the row wraps. The chosen value is stashed by `app.js` into `sessionStorage['neuroagi:reasoningLevel']` on submit and ultimately maps to `PROSE_LLM_OPTIONS_BY_LEVEL[level]` for the Doctor screen's streaming fanout (unknown / missing → `medium`) |
| **Settings (gear) icon** | Fixed `top: 1rem; left: 1rem` (moved from right to make room for the global cost + tokens bubbles which now own the top-right slot on every screen), `2.5rem` glass circle (`var(--glass-bg-strong)` + 18px blur, white border, soft shadow); rotates 30deg on hover; click toggles DevTools via IPC `OPEN_DEV_TOOLS` |
| **Models button** | Fixed glass pill (`.glass-models-btn`) at `top: 1rem; left: calc(1rem + 2.5rem + 0.5rem)` — immediately right of the gear, `2.5rem` tall, auto-width, `0.78rem` semibold text; same glass styling as the gear; lifts 1px on hover; click opens the Models popup |
| **Models popup** | Full-viewport `.glass-overlay` (semi-transparent dark backdrop + 6px blur, `z-index: 200`). White card max-width 784px / 78vh tall. Header: title "Models" + subtitle. Free/Paid tabs with enabled counts. Each row: star button (grey outline → purple filled when master), monospace name, Free/Paid badge, optional grey latency + purple throughput + orange price bubbles, optional custom label pills (`.models-label-badge` — one per semicolon-separated segment in catalog `labels`, all share cyan fill `rgb(22 144 173 / 88%)` + white text, no border), toggle switch. Footer: `Close` (dark) + `Update` (pink). Star designates the master merge model; only one starred at a time across both tabs |
| **Master model required popup** | `#error-overlay.glass-overlay` — same backdrop as Models popup. Compact white `.error-modal` card (`min(92vw, 420px)`): title "Master model required", body message, footer **OK** (`.models-btn-close`) + **Open Models** (`.models-btn-update`). Shown when submit is attempted without a persisted starred master; OK / backdrop / Escape dismiss; Open Models opens the Models popup |

### Questionnaire + Laboratory screen (`questionnaire.css`)

Pastel-gradient theme aligned with the **Home screen** (`app.css`) — same background, glassmorphism, and accent purple. The form is a **responsive CSS Grid** that auto-arranges question cards of varying widths, edge-to-edge across the full window width. The Laboratory and Pre-doctor Room screens link `worker-snack.css` + `questionnaire.css` and use the same `.q-*` class structure — only the centered loading copy differs (`Loading laboratory tests…` on lab, `Preparing final clarifying questions…` on pre-doctor vs `Loading questions…` on the questionnaire).

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
| **Early merge button** | `#q-fanout-continue.q-status-continue` — underlined text button below the loading label inside `#q-status` (`pointer-events: auto` while parent overlay is non-interactive). Shown on Questionnaire, Laboratory, and Pre-doctor Room when 2+ workers, ≥1 succeeded, others pending. Label: "Merge with ready models". Click aborts pending worker requests and marks their snack pills as skipped/failed. Hidden on master_start, after click, or when loading completes |
| **Fanout progress snacks** | `#q-worker-stack` fixed bottom-left (`bottom: 1rem; left: 1rem`) — one `.q-worker-snack` per enabled worker (monospace model name, spinner/bar while running, checkmark when done, red tint on failure), then a purple-tinted master pill during merge. Driven by `worker-progress-panel.js` + `AGI_FANOUT_PROGRESS`. Stack fades out (`.q-worker-stack--leaving`, slide left) when questions render or pre-doctor auto-submit proceeds |
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
| **Thinking bubble** | Rounded `1.25rem` glass chat bubble (`rgba(255,255,255,0.18)` + 14px blur, white border, soft shadow) pinned `align-self: flex-start` at the top of the pane with a small triangular `::before` tail. Inline row: 16px white circular spinner (reuses `doc-spin` keyframes) + `Thinking…` label + tiny monospace char counter separated by a soft vertical rule. Fades in via `doc-bubble-fadein` keyframes when the first reasoning delta arrives; hidden again the instant the first content delta lands (or on done/error). Only ever appears for doctor tabs whose model emits `delta.reasoning` (deepseek + gemini both do; gpt-4o-mini wouldn't, so its tab would skip the bubble entirely) |
| **Reasoning panel** | Thin glass card under the bubble (`rgba(255,255,255,0.08)` + 10px blur, 12px radius). Header is a full-width button-as-row `.doc-reasoning-toggle` with a chevron (`▸`) that rotates 90deg when the panel has `.is-open`, and a label `See thinking (N chars)` that updates live as reasoning streams in. Body is a `<pre class="doc-reasoning-body">` collapsed by default (`max-height: 0; overflow: hidden`); when open the body expands to `max-height: 50vh; overflow-y: auto` with a dim `0.78rem` monospace typography on a dark translucent backdrop, so the reasoning reads clearly as "behind the scenes" instead of competing with the primary prose. Content is written with `textContent` (never marked.parse, never sanitised — reasoning is internal monologue and may not be valid Markdown). Panel auto-collapses when the first content delta arrives but stays available; if the model finished with no reasoning at all the panel is force-hidden |
| **Pane error card** | Soft-red glass block inside the pane (only shown when a stream errored before producing any text) |
| **Top-level error card + Retry** | Identical visual to the questionnaire/laboratory red error card — red glass card, `Retry` pill button that just `window.location.reload()`s |

### Global UI — Usage bubbles (`usage-bubbles.css`)

Rendered on every screen (home, questionnaire, laboratory, pre-doctor-room, doctor) by `usage-bubbles.js`. Two pills sit inside one `.usage-bubbles` flex-row container fixed at `top: 1rem; right: 1rem; z-index: 11` (one above `.glass-icon-btn`'s z-index 10). The tokens pill renders to the left, the cost pill renders to the right at the very edge — the visual anchor stays in the same place on every screen so the user can always glance at the same spot. On the **Doctor screen only**, after `startDoctor` resolves, `doctor.js` prepends a third `.prompt-copy-bubble` pill (clipboard icon) to the **left** of the tokens pill; click copies the full doctor-analysis LLM prompt string to the system clipboard.

| Element | Style |
|---------|-------|
| **Cost bubble** (green — money / spend) | Glass pill (`rgba(120, 200, 140, 0.22)` + 18px blur, border `rgba(180, 230, 195, 0.55)`, soft inner highlight, 999px radius, `0.4rem 0.85rem` padding). Monospace `0.78rem` semibold text in `#e6ffe9` with a tiny green text-shadow. Format: `USD ` + raw `Number.toString()` of the running `totalUSD` — no rounding, no padding, no thousands separators (e.g. `USD 0.0002685564`). Updates in real time on every API call via the main-process `USAGE_UPDATE` broadcast; on first paint each screen seeds the value via `getUsageTotals()` so navigating between screens never resets the display. Pill lifts 1px on hover |
| **Tokens bubble** (blue — data / volume) | Glass pill with the same base geometry as the cost bubble but a soft blue tint (`rgba(140, 180, 230, 0.22)` bg, `rgba(190, 215, 245, 0.55)` border, `#eaf3ff` text + tiny blue text-shadow). Format: `n.toLocaleString() + ' tokens'` so integer counts get locale-aware thousands separators (e.g. `2,241 tokens`). Same broadcast/seed lifecycle as the cost bubble — both pills always show synchronised values because they update from the same `USAGE_UPDATE { totalUSD, totalTokens }` payload |
| **Prompt copy bubble** (doctor-only — clipboard action) | `.prompt-copy-bubble` glass pill prepended left of the tokens pill on the Doctor screen only. Soft white glass (`rgba(255,255,255,0.18)` bg, white border), 16px clipboard SVG icon. Click runs `navigator.clipboard.writeText(prompt)` with the full `GenerateDoctorAnalysisLLMQuery` string returned from `StartDoctor`; title flips to "Copied!" for 2s on success. Mounted by `doctor.js#mountPromptCopyBubble` after `startDoctor` resolves — not shown on other screens |
| **Logs bubble** (purple — all screens) | `.logs-bubble` glass pill prepended as the first child of `.usage-bubbles` by `logs-panel.js`, so it sits to the **left** of the tokens pill (order: Logs | [prompt-copy on doctor only] | tokens | cost). Soft purple tint (`rgba(160,130,240,0.22)` bg, `rgba(210,190,255,0.55)` border, `#f0e8ff` text + tiny purple text-shadow). 14px list-lines SVG icon + "Logs" text. Lifts 1px on hover, purple focus ring. Click opens the `.logs-overlay` |

### Logs overlay (`logs-panel.css`)

Full-viewport dark-blurred modal (z-index 300) with fade-in entrance. The `.logs-modal` card is max 900px × 90vh, dark translucent glass (`rgba(30,20,55,0.82)` + 24px blur), scale+fade entrance animation.

| Element | Style |
|---------|-------|
| **Header** | Title "Tool Call Logs" + subtitle + right-aligned Clear (soft red pill) + Close (white glass pill) buttons |
| **Master list** | 340px left column, scrollable. Each `.log-row` shows: AI/Web type badge pill (blue for AI, green for Web), call title, green/red status dot, monospace model name or "Tavily" (truncated), duration, time. Query preview line in dim text. Selected row gets a left purple border rule and purple-tinted background |
| **Detail panel** | Right flex column. Header: title + status badge. Metadata chip grid (auto-fill columns, each chip = label + monospace value): Time, Duration, Model, Reasoning Effort, Max Tokens, Prompt Tokens, Completion Tokens, Total Tokens, Cost. Error block (red glass) when status is error. Query section: scrollable `<pre>` (max-height 280px) with full prompt text. Response section: same `<pre>` with full response or JSON-stringified Tavily result |
| **Type badges** | `.type-ai` blue tint; `.type-web` green tint. `.status-success` = green dot; `.status-error` = red dot |
| **Empty states** | "No calls logged yet." in the list when empty; "Select a log entry to view details." in the detail panel when nothing is selected |

---

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'`
- API keys stay in main process only (never in renderer or preload source)
- IPC channels centralized in `src/shared/ipc/channels.js`; preload mirrors them
- All file paths use `path.join(__dirname, ...)` for spaces and packaging compatibility
