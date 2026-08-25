# NeuroAGI — context.md

---

## Rules for this file

1. **Read first.** When this file is referenced in any query, read it fully and use its content to find context relevant to the user's question.
2. **Keep it current.** Any time a file, workflow, or procedure in this project changes, the related context in this file **must be updated** in the same session so it stays accurate for future use.
3. **Scope.** This file contains only: **rules**, **workflow/procedure descriptions**, **design specifications**, and **project context**. No tutorials, troubleshooting guides, or README-style content — that belongs in `README.md`.
4. **Single source of truth.** If context here conflicts with code, the code is correct — update this file to match.

---

## Agent rules

1. **Never git.** Do not run `git commit`, `git push`, `git tag`, `gh release`, workflow dispatch, or any other git/GitHub publish step — **even if the user explicitly asks**. Tell them to do it locally. The user owns commits, tags, and GitHub Releases.
2. **Changelog on every change.** Whenever a feature, change, fix, or bugfix is made in the same session, append a **short high-level note** under [`CHANGELOG.md`](CHANGELOG.md) `## [Unreleased]` in the matching subsection (`Added` / `Changed` / `Fixed` / `Security`). Notes stay simple so they can later be moved into a versioned release.

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
| Env | `.env` file (git-ignored). Loaded at startup via [`env-file-service.js`](src/main/services/env-file-service.js) (`loadEnv()` from `src/main/index.js`). Keys: `OPENROUTER_API_KEY` (OpenRouter), `TAVILY_API_KEY` (Tavily web search). Settings → Credentials can create or update this file |
| Dependencies | `electron` (devDep), `dotenv` (dep), `jsonrepair` (dep — leftover, unused after the collector delete), `marked` (dep — vendored into renderer at `src/renderer/scripts/vendor/marked.esm.js` so the renderer CSP `default-src 'self'` keeps holding; Advance imports the local copy) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: loadEnv(), splash first, hidden main until Softasium grant, then maximize + show
│   ├── helpers/
│   │   ├── machine-id.js     # Windows MachineGuid (uppercase); in-memory UUID fallback
│   │   └── device-info.js    # Softasium DeviceInfo string (hostname, CPU, OS, boot, screens)
│   ├── ipc/
│   │   ├── app-info.js       # GET_APP_INFO: product name, package.json version, BUILD_VERSION
│   │   ├── register-splash-handlers.js # Early IPC: GET_APP_INFO, QUIT_APP, OPEN_EXTERNAL_URL (allowlist includes Softasium)
│   │   └── register.js       # IPC: ping, advanceSend / advanceCancel, getUsageTotals, resetUsageTotals, openDevTools, getCredentials, updateCredentials, testOpenRouterKey, testTavilyKey, getModelsConfig, updateModelsConfig, addModel, deleteModel, benchmarkModels, getLogs, clearLogs, license/download/install. USAGE_UPDATE / LOG_UPDATE / ADVANCE_PROGRESS / BENCHMARK_PROGRESS / LICENSE_UPDATE / SOFTWARE_DOWNLOAD_PROGRESS are broadcast, not handle-invoked. Guarded against double-register
│   ├── middlewares/
│   │   ├── advance-middleware.js   # SendAdvanceChat({ messages, model, resume?, reasoningLevel }, sender) — one enabled-model turn. CancelAdvanceChat(sender, { model? }) aborts that model or all
│   │   └── cookie-middleware.js    # GetModelsConfig() / UpdateModelsConfig({ activeModels, masterModel }) — thin wrapper around model-config-service
│   ├── services/
│   │   ├── advance-chat-service.js # askModelChat: tool loop (max 4 rounds) on one enabled model. Tools: find_topic_urls, extract_url, web_search, ask_user. Resolves LLM_OPTIONS_BY_LEVEL (none/low/medium/high/very_high) into maxTokens + reasoning.effort
│   │   ├── advance-llm.js          # Advance-only OpenRouter client: chatCompletionWithTools(messages, model, options). Records usage + type:"ai" logs. Does not use a shared api-helper
│   │   ├── advance-tools.js        # Tool schemas + executeTool (Tavily search/extract + URL discovery) + ask_user question sanitizer
│   │   ├── advance-system-prompt.js # ADVANCE_SYSTEM_PROMPT — clinical assistant + diagnostic vs informational turn rules
│   │   ├── model-config-service.js # Catalog + persisted { activeModels, masterModel, latencies, throughputs, probeErrors, removedModels, customModels } under Electron userData. Advance uses getActiveModelIds(); Delete hides catalog names via removedModels; Add persists customModels
│   │   ├── web-search-service.js   # Tavily search() + extract(); type:"web" log items on every success/error
│   │   ├── env-file-service.js     # resolve/read/write `.env`; loadEnv() at startup; GET/UPDATE credentials. Create: project root unpackaged, next to exe when packaged
│   │   ├── credential-test-service.js # Probe OpenRouter GET /api/v1/key and Tavily POST /search (basic ping). No logs, no usage, never echoes the key
│   │   ├── latency-benchmark-service.js # Shared OpenRouter latency probe (no Electron). Used by Models Test latency and scripts/benchmark-latency.js
│   │   ├── license-cache-store.js  # Encrypted Softasium Register snapshot at {userData}/register-response.enc via safeStorage
│   │   ├── software-licensing-service.js # Softasium Register + installer download/open. AppID NeuroAGI, BUILD_VERSION integer (independent of package.json semver)
│   │   ├── log-service.js          # In-memory tool-call logger. addLog / getLogs / clearLogs; broadcasts LOG_UPDATE. Instrumented at advance-llm.js and web-search-service.js
│   │   └── usage-tracker.js        # Running cost + token totals; broadcasts USAGE_UPDATE
│   └── windows/
│       ├── splash-window.js  # Frameless centered splash (~45% work-area width, height 387). show: false until loaded
│       └── main-window.js    # BrowserWindow 800×600 (restore size). Does not auto-show. showMainWindow() maximizes then show+focus. Not fullscreen
├── preload/
│   ├── index.js              # contextBridge → window.electronAPI { ping, getUsageTotals, resetUsageTotals, onUsageUpdate, openDevTools, getCredentials, updateCredentials, openExternalUrl, testOpenRouterKey, testTavilyKey, getModelsConfig, updateModelsConfig, addModel, deleteModel, benchmarkModels, onBenchmarkProgress, getLogs, clearLogs, onLogUpdate, advanceSend, advanceCancel, onAdvanceProgress, getLicenseUpdate, registerSoftwareLicense, onLicenseUpdate, checkSoftwareInstaller, downloadSoftwareUpdate, onSoftwareDownloadProgress, installSoftwareUpdate, quitApp }
│   └── splash-preload.js     # Splash-only: getAppInfo, quitApp, openExternalUrl, onSplashStatus
├── renderer/
│   ├── splash.html           # Frameless splash: NeuroLogo, spinner, status, version + build, Close quits, footer www.softasium.com
│   ├── index.html            # Home. Top bar: Settings + Models + optional New Release chip. Submit is the only entry to Advance. Release overlay for Softasium installer
│   ├── screens/
│   │   └── advance/
│   │       └── index.html    # Advance chat. Model chips + per-model threads + composer; no settings overlay. Does not link worker-snack.css
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_ADVANCE, LABEL_START_HUMAN_DIAGNOSTICS, PLACEHOLDER_HEALTH_INPUT
│   │   ├── splash.js         # Splash status + version label + Close/quit + Softasium footer link
│   │   ├── release-update-panel.js # Home New Release chip + overlay. Optional dismiss vs ForceUpdate lock. Download/install via IPC; errors as overlay text (no toast)
│   │   ├── app.js            # Home: enhanceGlassSelect() wraps reasoning/gender/age native <select>s. Gear opens Settings (Credentials tab, Save writes `.env`, Test key probes the current input). Models Add pastes an OpenRouter id onto the visible Free/Paid tab. Test latency spinner + Error chip; hover Delete. initReleaseUpdate() on load. handleStartDiagnostics() — empty issue is a no-op; enabled-model guard; ForceUpdate blocks navigation; stashes reasoning; resetUsageTotals(); navigates to Advance with issue/gender/age
│   │   ├── advance.js        # Advance chat: one thread per enabled model. First URL `issue` fans out to all; follow-ups go to the selected chip. getReasoningLevel() from sessionStorage['neuroagi:advanceReasoningLevel'] (default medium)
│   │   ├── advance-questions.js # ask_user form renderer (text / single_select / multi_select / slider / range)
│   │   ├── usage-bubbles.js  # Global top-right tokens + cost pills (Home + Advance)
│   │   ├── logs-panel.js     # Global Logs bubble + overlay (CSS-only restyle; no layout rewrite)
│   │   └── vendor/
│   │       └── marked.esm.js # Vendored marked; imported by advance.js
│   ├── styles/
│   │   ├── tokens.css        # Shared glass + type tokens only (no palette). --grad-speed is 28s
│   │   ├── themes.css        # Sunset Bloom palette on :root (rose → coral → gold wash)
│   │   ├── shell.css         # Shared wash for body.app-shell / .adv-shell only
│   │   ├── splash.css        # Splash chrome (#24101c) + spinner + denied status
│   │   ├── app.css           # Home chrome, Settings popup, .custom-select, New Release chip + overlay. Native <select> popup is unused
│   │   ├── advance.css       # Advance chat UI
│   │   ├── usage-bubbles.css # Tokens + cost pills (theme tokens)
│   │   └── logs-panel.css    # Frosted Logs overlay (theme tokens for card/hairline)
│   └── assets/
└── shared/
    └── ipc/
        └── channels.js       # PING, ADVANCE_SEND, ADVANCE_PROGRESS, ADVANCE_CANCEL, GET_USAGE_TOTALS, RESET_USAGE_TOTALS, USAGE_UPDATE, OPEN_DEV_TOOLS, GET_CREDENTIALS, UPDATE_CREDENTIALS, OPEN_EXTERNAL_URL, TEST_OPENROUTER_KEY, TEST_TAVILY_KEY, GET_MODELS_CONFIG, UPDATE_MODELS_CONFIG, ADD_MODEL, DELETE_MODEL, BENCHMARK_MODELS, BENCHMARK_PROGRESS, GET_LOGS, CLEAR_LOGS, LOG_UPDATE, GET_APP_INFO, SPLASH_STATUS, QUIT_APP, LICENSE_UPDATE, GET_LICENSE_UPDATE, REGISTER_SOFTWARE_LICENSE, CHECK_SOFTWARE_INSTALLER, DOWNLOAD_SOFTWARE_UPDATE, SOFTWARE_DOWNLOAD_PROGRESS, INSTALL_SOFTWARE_UPDATE
```

---

## Workflows

### App startup

1. `npm start` → `scripts/start-electron.js` spawns Electron
2. `src/main/index.js` runs `loadEnv()`, hides the menu, then `bootstrap()`
3. Splash handlers register first (`GET_APP_INFO`, `QUIT_APP`, `OPEN_EXTERNAL_URL`). [`splash-window.js`](src/main/windows/splash-window.js) creates a frameless centered window (`show: false` until loaded): ~45% of the primary work-area width, height 387, chrome `#24101c`. Splash shows NeuroLogo, spinner, status `Starting…`, `Version v{semver} (Build {BUILD_VERSION})`, Close quits, footer `www.softasium.com`
4. Heavy modules load lazily: IPC (`register.js`, guarded against double-register), `modelConfigService.init()`, hidden main window. [`main-window.js`](src/main/windows/main-window.js) must **not** auto-show on `ready-to-show`. Restore size stays 800×600
5. Splash status becomes `Checking for updates…` while Softasium Register runs in parallel with main HTML load
6. **Access denied** (`status !== true`, including offline with no granted cache): splash shows red `Access denied, please contact customer service.` (spinner off). Main window is destroyed. Splash stays until Close
7. **Granted:** splash `Loading workspace…`, then splash closes. `showMainWindow()` does `maximize()` + `show()` + `focus()`. Title bar stays; do **not** use `setFullScreen(true)`
8. Main renderer receives `LICENSE_UPDATE`. Optional update shows the **New Release Available** chip. `ForceUpdate` opens a locked overlay immediately

### Softasium license and in-app installer

Same Register API and PC identity as CryptoGenesis. Softasium must have an app with **AppID `NeuroAGI`**. Not GitHub / `electron-updater`.

| Constant | Value |
|----------|-------|
| Register URL | `https://api.softasium.com/api/SoftwareLicencing/Register` |
| Bearer | same as CryptoGenesis (never log) |
| `SOFTWARE_APP_ID` | `NeuroAGI` |
| `BUILD_VERSION` | integer in [`software-licensing-service.js`](src/main/services/software-licensing-service.js), starts at `1`, independent of `package.json` semver. Bump when shipping a Softasium-tracked build |
| `VERSION_NAME` | `package.json` version |
| Fallback installer | `NeuroAGI-Update.exe` |

1. POST `{ DeviceUUID, DeviceInfo, AppID, BuildVersion, VersionName }`. `DeviceUUID` is Windows `MachineGuid` uppercase ([`machine-id.js`](src/main/helpers/machine-id.js)). [`device-info.js`](src/main/helpers/device-info.js) builds the DeviceInfo string
2. Access iff `status === true`. Offline: allow only if encrypted cache at `{userData}/register-response.enc` was `status: true` ([`license-cache-store.js`](src/main/services/license-cache-store.js) via `safeStorage`)
3. Update available when remote `BuildVersion` > local `BUILD_VERSION`. Installer URL = Register `DownloadUrl`. Save to OS Downloads as `{AppID}V.{latest}+{build}.exe`
4. `downloadInstaller` streams with progress (`SOFTWARE_DOWNLOAD_PROGRESS`). `installInstaller` is `shell.openPath` — the app stays open
5. Home optional update: header chip **New Release Available** (right of Models) opens a dismissible glass overlay (notes, Download / Install, progress). Escape / backdrop close. Errors stay as `#release-status` text — no toast
6. **ForceUpdate:** overlay opens as soon as Home shows, gets `.is-force-update` (`z-index: 400`, above Logs). Backdrop / Escape / chip dismiss are blocked. Close **quits**. Home submit, Settings, and Models are blocked until the user installs or quits

### Home screen → Advance

1. On load, `app.js` fills age options 1–100 (default 30), then calls `enhanceGlassSelect()` on `#select-reasoning`, `#select-gender`, and `#select-age`. The native `<select>` stays in the DOM (hidden) so `handleStartDiagnostics()` still reads `.value`. Custom trigger + listbox replace the Windows native popup
2. User types a health issue, picks gender, age, and **Reasoning level** (default `medium`)
3. Clicks the submit button **or** presses **Ctrl+Enter** / **Cmd+Enter** — both call `handleStartDiagnostics()`
4. Empty issue is a no-op. There is no Home Advance button; submit is the only entry
5. **Enabled model guard:** `hasEnabledModel()` via `getModelsConfig()`. If no `enabled` row, shows `#error-overlay` and aborts
6. Stashes Reasoning level in `sessionStorage['neuroagi:advanceReasoningLevel']`. Advance's `getReasoningLevel()` validates against `none|low|medium|high|very_high` (default `medium`) and sends it on every `advanceSend`
7. Awaits `resetUsageTotals()` so cost/tokens reset to `USD 0` / `0 tokens`. Back from Advance does **not** reset
8. Navigates to `screens/advance/index.html?issue=…&gender=…&age=…`
9. Advance bootstrap: if `issue` is present, first user message is `{issue}\n\nPatient: {age}-year-old {gender}.` (falls back to just `issue` if age/gender missing), written into every enabled-model thread, then `advanceSend` runs in parallel for each

### Advance chat (enabled models + tools)

1. Renderer `advanceSend({ messages, model, resume?, reasoningLevel })` → IPC `ADVANCE_SEND` → `SendAdvanceChat` → `askModelChat`
2. `model` must be in `getActiveModelIds()` (toggled Models, not the star). Throws/returns error if none enabled or the id is not in that set
3. Home `issue` auto-send fires one `advanceSend` **per enabled model in parallel** (same messages + reasoning). Follow-ups go only to the selected chip
4. Loop (max 4 tool rounds) via `chatCompletionWithTools` in `advance-llm.js`. Progress events go out on `ADVANCE_PROGRESS` and include `model`
5. Tools (from `advance-tools.js` + `ADVANCE_SYSTEM_PROMPT`):
   - **find_topic_urls** — first research step on a new personal/diagnostic issue
   - **extract_url** — fetch page text (Tavily extract)
   - **web_search** — extra targeted Tavily search after find + extract
   - **ask_user** — pauses that model's turn; renderer shows a form in that model's thread; resume sends answers back as a tool result
6. Informational turns (definitions, general education) answer from knowledge without tools unless a URL, misspelled medicine, or time-sensitive fact needs lookup
7. `advanceCancel({ model })` aborts that model's AbortController; omit `model` to abort all for that window

### Settings (gear icon)

1. Home `#btn-settings` (fixed top-left) opens `#settings-overlay`
2. Left tabs / right pane. **Credentials** is the only tab. On open, `getCredentials()` fills the OpenRouter and Tavily password fields from `.env` (empty if missing)
3. **Save** invokes `updateCredentials`; main creates or updates `.env` and reloads `process.env` (`dotenv.config` override), then closes the popup. Close / Escape / backdrop discard without saving
4. **Test key** (per field) probes the **current input** via `testOpenRouterKey` / `testTavilyKey` — does not write `.env`. Empty input → Invalid with no network. Status: Testing… / Valid / Invalid
5. Hint links under each field open in the system browser via `openExternalUrl` (allowlisted: `https://openrouter.ai/keys`, `https://app.tavily.com/home`)
6. **Open DevTools** invokes IPC `OPEN_DEV_TOOLS`

There is no theme picker. All screens use the Sunset Bloom palette in [`themes.css`](src/renderer/styles/themes.css) (`:root`). Shared glass/type tokens stay in [`tokens.css`](src/renderer/styles/tokens.css).

### Models button → Models popup

1. Home `#btn-models` immediately right of the gear
2. Opens `#models-overlay`; `getModelsConfig()` returns catalog + `customModels` rows with `enabled` + `isMaster` (names in `removedModels` are omitted)
3. Star is still saved as exclusive `masterModel` (unused by live Advance). Toggle = enabled set used by Advance (`getActiveModelIds()`)
4. **Add** (`#btn-models-add`, chrome, left of Test latency) reveals `#input-models-add`. Enter pastes the OpenRouter model id onto the **visible tab** (Free → `type: "Free"`, Paid → `type: "Paid"`) via `addModel`. Persists immediately as `customModels` in userData `models-state.json` (catalog JSON is not rewritten). New rows start disabled. Empty / duplicate names are not added. Escape hides the input without closing the popup. A name in `removedModels` is un-removed (added to `customModels` only if it is not in the shipped catalog)
5. **Test latency** (`#btn-models-test`, chrome) probes every listed row on the **visible tab** (Free → `type: "Free"`, Paid → `type: "Paid"`), including custom models, not only toggled models. Same OpenRouter probe as `npm run benchmark:latency` (`latency-benchmark-service.js`): sequential, `stream: false`, `reasoning.effort: none`, `max_tokens: 2048`. Prompt: list integers 1–120, one per line, numbers only. Uses `process.env.OPENROUTER_API_KEY`. Does not write `benchmark-results-*.json`. Button shows `Testing 3/12…` while a run is in flight; a second run is rejected. The probing row shows a circular spinner left of the name
6. Success overlays `latencies` / `throughputs` in userData `models-state.json` and updates the row badges (`3.65s`, `99tps` chars/s proxy). Failure keeps the row, stores `probeErrors[name]`, and shows an **Error** chip (hover shows the probe `note`). Remaining models in the tab continue. Catalog JSON is not rewritten
7. Hover **Delete** (left of the enable toggle) invokes `deleteModel`: custom names leave `customModels`; shipped catalog names go into `removedModels`. Overlays and enable/master for that name are cleared
8. Close / Escape / backdrop discard; Update persists `{ activeModels, masterModel }` to `models-state.json`

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
2. Mirror it in `src/preload/index.js` (and `splash-preload.js` if the splash window needs it)
3. Add a handler in `src/main/ipc/register.js` or `register-splash-handlers.js` (splash-needed channels must be available before heavy IPC loads)
4. Expose the method via `contextBridge`

### Adding a new screen

1. Create `src/renderer/screens/<name>/index.html`
2. Link `tokens.css` + `themes.css` + `shell.css` (and usage/logs if needed) with `../../styles/` paths
3. Add a screen script in `src/renderer/scripts/`
4. Navigate via relative HTML paths

### Preparing a release (user publishes)

**“Create a release” / “new release” means local version prep only** — not a git commit, tag, push, or GitHub Release. Current shipped version is `1.0.3` in [`package.json`](package.json).

1. Do **not** commit, push, tag, or publish
2. Choose the next SemVer from [`package.json`](package.json) (breaking product change → major)
3. Bump `"version"` in [`package.json`](package.json) and both root version fields in [`package-lock.json`](package-lock.json)
4. Move filled `[Unreleased]` notes — especially **Added** and **Fixed** — into `## [X.Y.Z] - YYYY-MM-DD` in [`CHANGELOG.md`](CHANGELOG.md); restore empty Unreleased stubs; update the compare links at the bottom
5. If the major line changed, update the supported-versions table in [`SECURITY.md`](SECURITY.md)
6. If this build is tracked in Softasium, bump `BUILD_VERSION` in [`software-licensing-service.js`](src/main/services/software-licensing-service.js) (integer, independent of semver)
7. Stop. The user commits, tags, and creates the GitHub Release (including [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml) if they want the Windows installer)

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
| **Top bar** | Settings gear + Models + optional **New Release Available** chip |

| **Dropdowns** | Custom listboxes (`.custom-select`). Trigger copies the old closed glass look (frosted white, 10px radius, chevron). Native `<select>` is hidden and remains the value source. Open menu: rounded glass panel. Options use `--text-ink`; hover/selected use `--accent-wash` + `--accent` text — not Windows blue. Age menu `max-height: 16rem` with a thin themed scrollbar. One menu open at a time; click-outside and Escape close; Arrow / Enter / Home / End work; selected age scrolls into view on open |
| **Reasoning level** | Left of the selects row. Five options — None / Low / Medium / High / Very High — Medium default. Stashed as `neuroagi:advanceReasoningLevel` on submit |
| **Settings (gear)** | Fixed `top: 1rem; left: 1rem`, glass circle; opens Settings popup |
| **Models button** | Glass pill immediately right of the gear |
| **New Release chip** | Hidden unless Softasium says a newer `BuildVersion` is available. Coral/gold glow pill right of Models. Opens the release overlay |
| **Release overlay** | `#release-overlay` above Logs (`z-index: 400`). White card: notes (`white-space: pre-wrap`), `#release-status` error text, Download / Install + progress. Optional: Escape/backdrop/close dismiss. **ForceUpdate:** `.is-force-update` blocks dismiss; Close quits |
| **Models popup** | Full-viewport `.glass-overlay`. White card. Star fills `--accent`. Probe spinner left of the name (`--accent` ring). **Error** chip (red) with hover tooltip. Hover **Delete** (muted → destructive red) left of the toggle. Footer: Add (`--chrome`) + Test latency (`--chrome`, left) + Close (`--chrome`) + Update (`--accent`). Add reveals a `--surface-solid` / `--text-ink` model-id input |
| **Settings popup** | Wider white card. Left tab list (Credentials) + right pane. Password inputs (`--surface-solid`, `--text-ink`). Muted hint links under each field. **Test key** (`--chrome`) plus Valid/Invalid status. Footer: **Open DevTools** (left) + Close (`--chrome`) + Save (`--accent`). Save closes after a successful write. Close/Escape/backdrop dismiss without saving |
| **Enable a model popup** | `#error-overlay` — title "Enable a model"; **OK** + **Open Models** |

### Advance screen (`advance.css`)

Themed chat UI (same `shell.css` wash as Home): `--chrome` Back, model **chips** under the header (last path segment of catalog `name`; full id on `title`), one `.adv-thread` panel per enabled model (click a chip to switch). User/assistant bubbles (assistant Markdown via vendored `marked`), status step pills for tool work, optional `ask_user` form cards in that model's thread, bottom composer matching Home. First Home query fans out to every enabled model; later Send goes to the selected chip. Send / sliders use `--accent`. **No Settings chip, overlay, or reasoning dropdown** — reasoning comes from Home via sessionStorage. Palette is Sunset Bloom from [`themes.css`](src/renderer/styles/themes.css).

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
- API keys are not hardcoded in renderer or preload source. File I/O stays in main (`env-file-service.js`). Settings Credentials loads keys over IPC into password fields
- `OPEN_EXTERNAL_URL` allowlists `https://www.softasium.com`, `https://openrouter.ai/keys`, and `https://app.tavily.com/home` (registered early in splash handlers)
- Softasium Register bearer is main-process only and must never be logged
- License cache is `safeStorage`-encrypted at `{userData}/register-response.enc`
- Installer downloads are confined to the OS Downloads folder; `installInstaller` only opens a path inside that folder
- IPC channels centralized in `src/shared/ipc/channels.js`; preload mirrors them
- All file paths use `path.join(__dirname, ...)` for spaces and packaging compatibility
