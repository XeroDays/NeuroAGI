# NeuroAGI — context.md

---

## Rules for this file

1. **Read first.** When this file is referenced in any query, read it fully and use its content to find context relevant to the user's question.
2. **Keep it current.** Any time a file, workflow, or procedure in this project changes, the related context in this file **must be updated** in the same session so it stays accurate for future use.
3. **Scope.** This file contains only: **rules**, **workflow/procedure descriptions**, **design specifications**, and **project context**. No tutorials, troubleshooting guides, or README-style content — that belongs in `README.md`.
4. **Single source of truth.** If context here conflicts with code, the code is correct — update this file to match.

---

## Project context

**NeuroAGI** is an Electron + JavaScript desktop app for health diagnostics. The live product is **Home → Advance chat**. The old Questionnaire / Laboratory / Pre-doctor Room / Doctor chain (and its collector/fanout IPC) has been deleted.

| Key | Value |
|-----|-------|
| Runtime | Electron ^28 |
| Language | JavaScript (CommonJS in main/preload, ES modules in renderer) |
| UI | Plain HTML + CSS + JS (no framework) |
| Entry | `src/main/index.js` |
| Start | `npm start` → `scripts/start-electron.js` |
| API | OpenRouter (chat completions) + Tavily (search / extract) |
| Env | `.env` file at project root (git-ignored); loads via `dotenv` at top of `src/main/index.js`. Keys: `OPENROUTER_API_KEY` (OpenRouter), `TAVILY_API_KEY` (Tavily web search) |
| Dependencies | `electron` (devDep), `dotenv` (dep), `jsonrepair` (dep — leftover, unused after the collector delete), `marked` (dep — vendored into renderer at `src/renderer/scripts/vendor/marked.esm.js` so the renderer CSP `default-src 'self'` keeps holding; Advance imports the local copy) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: dotenv config, hide menu, register IPC, create window
│   ├── ipc/
│   │   └── register.js       # IPC: ping, advanceSend / advanceCancel, getUsageTotals, resetUsageTotals, openDevTools, getModelsConfig, updateModelsConfig, getLogs, clearLogs. USAGE_UPDATE / LOG_UPDATE / ADVANCE_PROGRESS are broadcast, not handle-invoked
│   ├── middlewares/
│   │   ├── advance-middleware.js   # SendAdvanceChat({ messages, resume?, reasoningLevel }, sender) — starred-master chat turn for Advance. CancelAdvanceChat(sender) aborts the in-flight turn
│   │   └── cookie-middleware.js    # GetModelsConfig() / UpdateModelsConfig({ activeModels, masterModel }) — thin wrapper around model-config-service
│   ├── services/
│   │   ├── advance-chat-service.js # askMasterChat: tool loop (max 4 rounds) on the starred master. Tools: find_topic_urls, extract_url, web_search, ask_user. Resolves LLM_OPTIONS_BY_LEVEL (none/low/medium/high/very_high) into maxTokens + reasoning.effort
│   │   ├── advance-llm.js          # Advance-only OpenRouter client: chatCompletionWithTools(messages, model, options). Records usage + type:"ai" logs. Does not use a shared api-helper
│   │   ├── advance-tools.js        # Tool schemas + executeTool (Tavily search/extract + URL discovery) + ask_user question sanitizer
│   │   ├── advance-system-prompt.js # ADVANCE_SYSTEM_PROMPT — clinical assistant + diagnostic vs informational turn rules
│   │   ├── model-config-service.js # Catalog + persisted { activeModels, masterModel } under Electron userData. Advance uses getMasterModelRuntimeId()
│   │   ├── web-search-service.js   # Tavily search() + extract(); type:"web" log items on every success/error
│   │   ├── log-service.js          # In-memory tool-call logger. addLog / getLogs / clearLogs; broadcasts LOG_UPDATE. Instrumented at advance-llm.js and web-search-service.js
│   │   └── usage-tracker.js        # Running cost + token totals; broadcasts USAGE_UPDATE
│   └── windows/
│       └── main-window.js    # BrowserWindow 800×600 (restore size). On ready-to-show: maximize() then show(). Not fullscreen
├── preload/
│   └── index.js              # contextBridge → window.electronAPI { ping, getUsageTotals, resetUsageTotals, onUsageUpdate, openDevTools, getModelsConfig, updateModelsConfig, getLogs, clearLogs, onLogUpdate, advanceSend, advanceCancel, onAdvanceProgress }
├── renderer/
│   ├── index.html            # Home. Top bar: Settings + Models only (no Advance shortcut). Submit is the only entry to Advance
│   ├── screens/
│   │   └── advance/
│   │       └── index.html    # Advance chat. Thread + composer; no settings overlay. Does not link worker-snack.css
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_ADVANCE, LABEL_START_HUMAN_DIAGNOSTICS, PLACEHOLDER_HEALTH_INPUT
│   │   ├── app.js            # Home: enhanceGlassSelect() wraps reasoning/gender/age native <select>s. Gear opens Settings (Open DevTools). handleStartDiagnostics() — empty issue is a no-op; master-model guard; stashes reasoning; resetUsageTotals(); navigates to Advance with issue/gender/age
│   │   ├── advance.js        # Advance chat: getReasoningLevel() from sessionStorage['neuroagi:advanceReasoningLevel'] (default medium). URL `issue` auto-composes the first message and calls handleSend()
│   │   ├── advance-questions.js # ask_user form renderer (text / single_select / multi_select / slider / range)
│   │   ├── usage-bubbles.js  # Global top-right tokens + cost pills (Home + Advance)
│   │   ├── logs-panel.js     # Global Logs bubble + overlay (CSS-only restyle; no layout rewrite)
│   │   └── vendor/
│   │       └── marked.esm.js # Vendored marked; imported by advance.js
│   ├── styles/
│   │   ├── tokens.css        # Shared glass + type tokens only (no palette). --grad-speed is 28s
│   │   ├── themes.css        # Sunset Bloom palette on :root (rose → coral → gold wash)
│   │   ├── shell.css         # Shared wash for body.app-shell / .adv-shell only
│   │   ├── app.css           # Home chrome, Settings popup, .custom-select. Native <select> popup is unused
│   │   ├── advance.css       # Advance chat UI
│   │   ├── usage-bubbles.css # Tokens + cost pills (theme tokens)
│   │   └── logs-panel.css    # Frosted Logs overlay (theme tokens for card/hairline)
│   └── assets/
└── shared/
    └── ipc/
        └── channels.js       # PING, ADVANCE_SEND, ADVANCE_PROGRESS, ADVANCE_CANCEL, GET_USAGE_TOTALS, RESET_USAGE_TOTALS, USAGE_UPDATE, OPEN_DEV_TOOLS, GET_MODELS_CONFIG, UPDATE_MODELS_CONFIG, GET_LOGS, CLEAR_LOGS, LOG_UPDATE
```

---

## Workflows

### App startup

1. `npm start` → `scripts/start-electron.js` spawns Electron
2. `src/main/index.js` runs: loads `.env` via `dotenv`, hides menu, registers IPC handlers, creates main window
3. `main-window.js` creates a hidden BrowserWindow (800×600 — this is the restore size after un-maximize), loads `src/renderer/index.html`
4. On `ready-to-show`: `win.maximize()` then `win.show()` then `win.focus()`. Title bar stays; do **not** use `setFullScreen(true)`. Restore returns to 800×600

### Home screen → Advance

1. On load, `app.js` fills age options 1–100 (default 30), then calls `enhanceGlassSelect()` on `#select-reasoning`, `#select-gender`, and `#select-age`. The native `<select>` stays in the DOM (hidden) so `handleStartDiagnostics()` still reads `.value`. Custom trigger + listbox replace the Windows native popup
2. User types a health issue, picks gender, age, and **Reasoning level** (default `medium`)
3. Clicks the submit button **or** presses **Ctrl+Enter** / **Cmd+Enter** — both call `handleStartDiagnostics()`
4. Empty issue is a no-op. There is no Home Advance button; submit is the only entry
5. **Master model guard:** `isMasterModelSelected()` via `getModelsConfig()`. If no persisted `isMaster`, shows `#error-overlay` and aborts
6. Stashes Reasoning level in `sessionStorage['neuroagi:advanceReasoningLevel']`. Advance's `getReasoningLevel()` validates against `none|low|medium|high|very_high` (default `medium`) and sends it on every `advanceSend`
7. Awaits `resetUsageTotals()` so cost/tokens reset to `USD 0` / `0 tokens`. Back from Advance does **not** reset
8. Navigates to `screens/advance/index.html?issue=…&gender=…&age=…`
9. Advance bootstrap: if `issue` is present, first user message is `{issue}\n\nPatient: {age}-year-old {gender}.` (falls back to just `issue` if age/gender missing), written into `#adv-input`, then `handleSend()` runs automatically

### Advance chat (master + tools)

1. Renderer `advanceSend({ messages, resume?, reasoningLevel })` → IPC `ADVANCE_SEND` → `SendAdvanceChat` → `askMasterChat`
2. Uses the starred master only (`getMasterModelRuntimeId()`). Throws if none starred
3. Loop (max 4 tool rounds) via `chatCompletionWithTools` in `advance-llm.js`. Progress events go out on `ADVANCE_PROGRESS`
4. Tools (from `advance-tools.js` + `ADVANCE_SYSTEM_PROMPT`):
   - **find_topic_urls** — first research step on a new personal/diagnostic issue
   - **extract_url** — fetch page text (Tavily extract)
   - **web_search** — extra targeted Tavily search after find + extract
   - **ask_user** — pauses the turn; renderer shows a form; resume sends answers back as a tool result
5. Informational turns (definitions, general education) answer from knowledge without tools unless a URL, misspelled medicine, or time-sensitive fact needs lookup
6. `advanceCancel` aborts the in-flight AbortController for that sender

### Settings (gear icon)

1. Home `#btn-settings` (fixed top-left) opens `#settings-overlay`
2. **Open DevTools** invokes IPC `OPEN_DEV_TOOLS`
3. **Close** / Escape / backdrop dismiss the popup

There is no theme picker. All screens use the Sunset Bloom palette in [`themes.css`](src/renderer/styles/themes.css) (`:root`). Shared glass/type tokens stay in [`tokens.css`](src/renderer/styles/tokens.css).

### Models button → Models popup

1. Home `#btn-models` immediately right of the gear
2. Opens `#models-overlay`; `getModelsConfig()` returns catalog rows with `enabled` + `isMaster`
3. Star = exclusive master used by Advance. Toggle = persisted worker set (not used by the live Advance path; still saved independently)
4. Close / Escape / backdrop discard; Update persists `{ activeModels, masterModel }` to userData `models-state.json`

### Usage tracker (top-right bubbles)

1. `usage-tracker.js` holds `totalUSD` + `totalTokens` in memory (not persisted)
2. Home submit calls `resetUsageTotals()` before navigating to Advance
3. `advance-llm.js` and Tavily calls record into the tracker; every record broadcasts `USAGE_UPDATE`
4. `usage-bubbles.js` on Home and Advance seeds via `getUsageTotals()` and live-updates. Cost: `'USD ' + n.toString()`. Tokens: `n.toLocaleString() + ' tokens'`

### Tool-call logger (Logs bubble → overlay)

Records every Advance OpenRouter call (`advance-llm.js`, type `"ai"`) and every Tavily search/extract (`web-search-service.js`, type `"web"`). Session-only; Clear or process exit empties the list. `resetUsageTotals()` does **not** clear logs.

1. `log-service.js#addLog` stamps `id` + `timestamp`, broadcasts `LOG_UPDATE { logs }`
2. `logs-panel.js` prepends `.logs-bubble` as the first child of `.usage-bubbles` (order: Logs | tokens | cost)
3. Overlay uses theme tokens (`--logs-card`, `--hairline-rgb`); JS layout is unchanged

### Adding a new IPC channel

1. Add the name to `src/shared/ipc/channels.js`
2. Mirror it in `src/preload/index.js`
3. Add a handler in `src/main/ipc/register.js`
4. Expose the method via `contextBridge`

### Adding a new screen

1. Create `src/renderer/screens/<name>/index.html`
2. Link `tokens.css` + `themes.css` + `shell.css` (and usage/logs if needed) with `../../styles/` paths
3. Add a screen script in `src/renderer/scripts/`
4. Navigate via relative HTML paths

---

## Design

### Theme

All screens share [`tokens.css`](src/renderer/styles/tokens.css) (glass + type) + [`themes.css`](src/renderer/styles/themes.css) (palette) + [`shell.css`](src/renderer/styles/shell.css) (rotating wash). The only palette is **Sunset Bloom** on `:root` (rose–coral–gold `#ff6b9d` → `#ffe8c8`, accent `#e85d4c`, chrome `#24101c`). Chrome stays darker than the wash so buttons still contrast. `--grad-speed` is 28s. Inputs stay `--surface-solid` white with `--text-ink`. Send / Back / Logs Close use `--chrome` → `--accent` hover. Dropdown selected/hover uses `--accent-wash`. No hosted fonts (renderer CSP is `default-src 'self'`).

### Home screen (`app.css`)

| Element | Style |
|---------|-------|
| **Background** | Shared wash from `shell.css` (Sunset Bloom palette from `themes.css`) |
| **Title** | White, centered, responsive clamp sizing |
| **Text input** | Solid white, rounded (`14px`), dark text; 80% viewport width |
| **Submit button** | `--chrome` rounded square inside the input; hover `--accent`. Only path to Advance |
| **Top bar** | Settings gear + Models only |
| **Dropdowns** | Custom listboxes (`.custom-select`). Trigger copies the old closed glass look (frosted white, 10px radius, chevron). Native `<select>` is hidden and remains the value source. Open menu: rounded glass panel. Options use `--text-ink`; hover/selected use `--accent-wash` + `--accent` text — not Windows blue. Age menu `max-height: 16rem` with a thin themed scrollbar. One menu open at a time; click-outside and Escape close; Arrow / Enter / Home / End work; selected age scrolls into view on open |
| **Reasoning level** | Left of the selects row. Five options — None / Low / Medium / High / Very High — Medium default. Stashed as `neuroagi:advanceReasoningLevel` on submit |
| **Settings (gear)** | Fixed `top: 1rem; left: 1rem`, glass circle; opens Settings popup (Open DevTools) |
| **Models button** | Glass pill immediately right of the gear |
| **Models popup** | Full-viewport `.glass-overlay`. White card. Star fills `--accent`. Footer: Close (`--chrome`) + Update (`--accent`) |
| **Settings popup** | Compact white card like the error modal. Footer: **Open DevTools** (left) + Close (`--chrome`). Close/Escape/backdrop dismiss |
| **Master model required popup** | `#error-overlay` — title "Master model required"; **OK** + **Open Models** |

### Advance screen (`advance.css`)

Themed chat UI (same `shell.css` wash as Home): `--chrome` Back, `#adv-thread` of user/assistant bubbles (assistant Markdown via vendored `marked`), status step pills for tool work, optional `ask_user` form cards, bottom composer matching Home. Send / sliders use `--accent`. **No Settings chip, overlay, or reasoning dropdown** — reasoning comes from Home via sessionStorage. Palette is Sunset Bloom from [`themes.css`](src/renderer/styles/themes.css).

### Global UI — Usage bubbles (`usage-bubbles.css`)

Rendered on Home and Advance. `.usage-bubbles` is fixed at `top: 1rem; right: 1rem`. Tokens pill left, cost pill right.

| Element | Style |
|---------|-------|
| **Cost bubble** | `--bubble-cost-bg` glass. `USD ` + raw `Number.toString()` |
| **Tokens bubble** | `--bubble-tokens-bg` glass. `n.toLocaleString() + ' tokens'` |
| **Logs bubble** | First child of `.usage-bubbles`. Accent glass, hairline focus ring |

### Logs overlay (`logs-panel.css`)

Full-viewport overlay (z-index 300). The `.logs-modal` card uses `--logs-card` + stronger blur, `--hairline-rgb` dividers, so the wash shows through — not a flat charcoal panel.

| Element | Style |
|---------|-------|
| **Header** | `--fs-title` / `--text-muted`; hairline divider |
| **Clear** | Destructive red glass (not muddy brown) |
| **Close** | `--chrome` fill, `--accent` hover (same language as Home send) |
| **Panes** | Hairline split; empty states use `--text-muted` plus a small themed rule |
| **List** | Selected row accent left rule; row hover hairline wash; thin themed scrollbar |
| **Detail chips / pre** | `--logs-chip` / `--logs-pre` surfaces for readable query/response blocks |
| **Type badges** | `.type-ai` blue tint; `.type-web` green tint |

---

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'`
- API keys stay in main process only (never in renderer or preload source)
- IPC channels centralized in `src/shared/ipc/channels.js`; preload mirrors them
- All file paths use `path.join(__dirname, ...)` for spaces and packaging compatibility
