# NeuroAGI — project context

This file is the **handoff / memory** for AI assistants and developers working on this repo. Update it when architecture or workflows change.

**Process note:** Changes made to this codebase (including edits to this file) may be **monitored and reviewed by other agents** or reviewers. Prefer clear commits, accurate updates to this document when behavior changes, and consistency with the conventions described below.

---

## Product intent

**NeuroAGI** is a desktop app (Electron + JavaScript). Current state: **one window**, **two HTML screens**:

- **Home** (`renderer/index.html`) — glass-style UI; entry to the Diagnoses Room.
- **Diagnoses Room** (`renderer/diagnoses-room.html`) — dark, ChatGPT-like **chat UI**: message list, bottom composer, **streaming assistant replies** via **[OpenRouter](https://openrouter.ai/)** (see **Diagnoses Room and OpenRouter**).

There is **no separate backend service** in-repo; the main process calls OpenRouter over HTTPS. No database or clinical data pipeline yet.

---

## Stack

| Layer | Choice |
|--------|--------|
| Runtime | **Electron** (^28, see `package.json`) |
| Language | **JavaScript** (CommonJS `require` in main/preload; ES modules in renderer) |
| UI | **HTML + CSS + JS** under `src/renderer/` (no React/Vue; optional later) |
| Build | None — `npm start` runs Electron via **`scripts/start-electron.js`** |

---

## Project layout (source tree)

```
NeuroAGI/
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
├── CLAUDE.md
├── run.bat
├── install-deps.bat
├── .vscode/
│   └── launch.json              # Debug Main Process
├── scripts/
│   └── start-electron.js        # Spawns Electron cleanly
└── src/
    ├── main/
    │   ├── index.js              # App bootstrap (lifecycle, IPC, window)
    │   ├── ipc/
    │   │   └── register.js       # ipcMain.handle + ipcMain.on registrations
    │   ├── middleware/            # Business logic (add modules here)
    │   ├── services/
    │   │   └── api-helper.js     # OpenRouter streaming chat (SSE); OPENROUTER_MODEL
    │   └── windows/
    │       └── main-window.js    # BrowserWindow creation + config
    ├── preload/
    │   └── index.js              # contextBridge → window.electronAPI (incl. openRouterChatStream)
    ├── renderer/
    │   ├── index.html            # Home screen (glass UI)
    │   ├── screens/
    │   │   └── diagnoses-room/
    │   │       └── index.html    # Diagnoses Room chat screen (dark theme)
    │   ├── scripts/
    │   │   ├── constants.js      # APP_TITLE, screen names, labels
    │   │   ├── app.js            # Home: title + navigate to diagnoses room
    │   │   ├── diagnoses-room.js # Diagnoses Room UI wiring (composer, send)
    │   │   └── ai-helper.js      # Chat orchestration: history + stream → DOM
    │   ├── styles/
    │   │   ├── app.css           # Home / glass theme
    │   │   └── diagnoses-room.css # Diagnoses Room dark chat theme
    │   └── assets/
    │       ├── images/
    │       ├── fonts/
    │       └── icons/
    └── shared/
        └── ipc/
            └── channels.js       # IPC channel name constants
```

| Path | Purpose |
|------|---------|
| `package.json` | `name`: `neuro-agi`; `main`: `src/main/index.js`; `scripts.start`: `node scripts/start-electron.js` |
| `scripts/start-electron.js` | Spawns Electron cleanly (clears `ELECTRON_RUN_AS_NODE`, inherits stdio) |
| `src/main/index.js` | App bootstrap: hide menu, register IPC, create window; macOS re-activate; quit on all windows closed |
| `src/main/windows/main-window.js` | Creates `BrowserWindow` (800×600, hidden until ready, then show+focus); preload + `contextIsolation`; loads `src/renderer/index.html` |
| `src/main/ipc/register.js` | All IPC registrations: `ping` (handle) + OpenRouter stream (on/send) |
| `src/main/middleware/` | Business logic modules (add as features grow) |
| `src/main/services/api-helper.js` | `streamChat(messages, onDelta, onDone, onError)` — OpenRouter HTTPS stream; reads `OPENROUTER_API_KEY` |
| `src/preload/index.js` | `contextBridge.exposeInMainWorld('electronAPI', { ping, openRouterChatStream })` |
| `src/shared/ipc/channels.js` | Shared IPC channel name constants |
| `src/renderer/index.html` | Home screen; glass UI; `type="module"` → `scripts/app.js` |
| `src/renderer/screens/diagnoses-room/index.html` | Diagnoses Room: dark chat layout; loads `diagnoses-room.css`; link back to `../../index.html` |
| `src/renderer/scripts/constants.js` | Shared strings: **`APP_TITLE`**, **`SCREEN_DIAGNOSES_ROOM`**, button label |
| `src/renderer/scripts/ai-helper.js` | `createAiChat({ messagesEl, onStreamingChange })` — conversation array, calls `electronAPI.openRouterChatStream`, updates assistant bubble from stream |
| `src/renderer/scripts/diagnoses-room.js` | Diagnoses Room UI wiring: titles, composer, Enter/send, `AiHelper` integration |
| `src/renderer/styles/app.css` | Home / glass theme |
| `src/renderer/styles/diagnoses-room.css` | Diagnoses Room dark chat theme (bubbles, composer) |
| `src/renderer/scripts/*.js` | ES modules (`import` from `constants.js`); no Node in renderer |
| `src/renderer/assets/images/` | Images; **`logo.png`** is the window / taskbar / Dock icon via `main-window.js` |
| `src/renderer/assets/fonts/` | Webfonts |
| `src/renderer/assets/icons/` | SVG/PNG icons for the UI |
| `.vscode/launch.json` | Debug Main Process (Electron from `node_modules`) |
| `run.bat` | Windows: `npm.cmd start` + `pause` (avoids PowerShell blocking `npm.ps1`) |
| `install-deps.bat` | Windows: `npm.cmd install` + `pause` |
| `.gitignore` | `node_modules/`, `dist/`, `out/`, `*.log`, `.DS_Store` |
| `README.md` | Public repo overview, install, troubleshooting |
| `CLAUDE.md` | This file |

---

## Requirements

- **Node.js** LTS (18+ recommended)
- **npm** (ships with Node)
- **OpenRouter** (optional for Diagnoses Room): an API key in **`OPENROUTER_API_KEY`** when exercising chat; see **`README.md`**

---

## How to run

Project folder path may include spaces—quote paths in shells.

```powershell
cd "D:\Projects\37. Open Health"
npm install   # first time or after clone / pull
npm start
```

**Windows — batch files (recommended if PowerShell blocks npm):**

- **`install-deps.bat`**: `npm.cmd install` from project root.
- **`run.bat`**: `npm.cmd start` then `pause` so errors stay visible.

**Why `npm.cmd`:** Some Windows setups disable running scripts, so **`npm`** in **PowerShell** tries **`npm.ps1`** and fails with *"running scripts is disabled"*. **`npm.cmd`** (or **Command Prompt**) avoids that. **`run.bat`** / **`install-deps.bat`** call **`npm.cmd`** explicitly.

**PowerShell alternatives:** `npm.cmd install` / `npm.cmd start`, or `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

**Direct Electron (e.g. GPU issues), from project root:**

```powershell
node ./node_modules/electron/cli.js . --disable-gpu
```

Human-facing steps are also in **[README.md](README.md)**.

---

## Electron architecture (how pieces fit)

```mermaid
flowchart TB
  subgraph main [Main process — src/main/]
    index[index.js]
    ipc[ipc/register.js]
    win[windows/main-window.js]
  end
  subgraph preload [Preload — src/preload/]
    preloadjs[index.js]
  end
  subgraph renderer [Renderer — src/renderer/]
    html[index.html]
    css[styles/app.css]
    js[scripts/app.js]
    screens[screens/diagnoses-room/]
  end
  subgraph shared [Shared — src/shared/]
    channels[ipc/channels.js]
  end
  index --> ipc
  index --> win
  win -->|creates window + preload path| preloadjs
  win -->|loadFile renderer/index.html| html
  html --> css
  html --> js
  html -->|navigate| screens
  preloadjs -->|contextBridge| html
  ipc -.->|uses| channels
  preloadjs -.->|mirrors| channels
```

- **Main process** (`src/main/`): `index.js` bootstraps; `windows/` creates BrowserWindow; `ipc/` registers handlers; `middleware/` and `services/` hold business logic.
- **Renderer** (`src/renderer/`): sandboxed; **`nodeIntegration: false`** so no raw `require` in the page.
- **Preload** (`src/preload/`): runs before the page; use **`contextBridge.exposeInMainWorld`** for `window.electronAPI`.
- **Shared** (`src/shared/`): constants and types used by both main and preload (IPC channels, enums, DTOs).

---

## Diagnoses Room and OpenRouter

**Flow:** User sends a message in the renderer → **`ai-helper.js`** appends a user bubble and calls **`window.electronAPI.openRouterChatStream({ messages, onChunk, onDone, onError })`** → preload **`ipcRenderer.send('openrouter-stream-start', { requestId, messages })`** → **`main.js`** **`ipcMain.on('openrouter-stream-start', …)`** calls **`api-helper.js`** **`streamChat`** → OpenRouter HTTPS stream → main **`event.sender.send('openrouter-stream-event', { requestId, type: 'chunk'|'done'|'error', … })`** → preload forwards to callbacks → **`ai-helper`** updates the assistant bubble text (and history).

**Secrets:** **`OPENROUTER_API_KEY`** is read **only in the main process** (`api-helper.js`).
Set it either via:
- environment variable **`OPENROUTER_API_KEY`** before **`npm start`**, or
- create a git-ignored `OPENROUTER_API_KEY.txt` in the repo root (single line; never commit real keys).

**Model:** Default model id is **`OPENROUTER_MODEL`** in **`api-helper.js`** (change in one place).

```mermaid
flowchart LR
  subgraph ren [Renderer]
    DR[diagnoses-room.js]
    AI[ai-helper.js]
    DR --> AI
  end
  subgraph pre [preload.js]
    API[electronAPI]
  end
  subgraph mainProc [Main]
    M[main.js]
    AH[api-helper.js]
    M --> AH
  end
  OpenRouterNode[OpenRouter API]
  AI --> API
  API --> M
  AH --> OpenRouterNode
  M --> API
```

### IPC channels (main ↔ renderer)

| Channel / pattern | Direction | Purpose |
|-------------------|-----------|---------|
| **`openrouter-stream-start`** | Renderer → main (`send` with `{ requestId, messages }`) | Start streaming completion; **`messages`** is `{ role, content }[]`. |
| **`openrouter-stream-event`** | Main → renderer (`send` to sender) | Stream lifecycle: **`chunk`** (delta text), **`done`**, **`error`** (message string); all include **`requestId`**. |

### `window.electronAPI` (preload)

| Method | Behavior |
|--------|----------|
| **`openRouterChatStream({ messages, onChunk, onDone, onError })`** | Registers listener for **`openrouter-stream-event`**, sends **`openrouter-stream-start`**, removes listener on **done** / **error**. Returns a **cleanup** function (v1: optional; does not abort the HTTP stream). |

---

## Security conventions (do not weaken casually)

- **`contextIsolation: true`**, **`nodeIntegration: false`**
- **Paths**: `path.join(__dirname, ...)` so paths with spaces and packaging work.
- **CSP** on `src/renderer/index.html`: `default-src 'self'; script-src 'self'; style-src 'self'`. Adjust if you add inline scripts/styles or external URLs.
- For main ↔ renderer communication, use **`ipcMain` / `ipcRenderer`** with channels exposed only through **`src/preload/index.js`**.
- IPC channel names are centralized in **`src/shared/ipc/channels.js`**; preload mirrors them (cannot reliably `require` shared modules with sandbox on).

---

## Window behavior (`src/main/windows/main-window.js`)

- Default size **800×600**.
- **`show: false`** until `ready-to-show`, then **`show()`** and **`focus()`**.
- **Menu hidden** (`autoHideMenuBar: true` + `setMenuBarVisibility(false)` + `Menu.setApplicationMenu(null)` in bootstrap).
- **`activate`** (macOS): recreate window if none.
- **`window-all-closed`**: on Windows/Linux, **`app.quit()`**; on macOS, app often stays running until explicit quit.

---

## App icon and branding

| Concern | How it works in this repo |
|---------|----------------------------|
| **Window / taskbar (Windows, Linux)** | **`BrowserWindow`** **`icon`** set to **`src/renderer/assets/images/logo.png`** in `main-window.js`. |
| **macOS Dock** | In **`ready-to-show`** callback, **`app.dock.setIcon(iconPath)`** when **`process.platform === 'darwin'`**. |
| **Logo inside the page** | Optional **`<img src="assets/images/logo.png" alt="…">`** in `src/renderer/index.html`. |
| **`.exe` / installer icon** | Add a multi-size **`.ico`** and point **electron-builder** (or similar) at it when packaging is added. |

---

## Extending the app

| Goal | Where to work |
|------|----------------|
| New screen | `src/renderer/screens/<name>/index.html` + script in `src/renderer/scripts/` |
| New UI on home | `src/renderer/index.html`, `src/renderer/styles/app.css`, `src/renderer/scripts/app.js` |
| Static assets | `src/renderer/assets/images|fonts|icons/` (paths relative to HTML file) |
| New IPC channel | Add to `src/shared/ipc/channels.js`, mirror in `src/preload/index.js`, handle in `src/main/ipc/register.js` |
| Business logic | `src/main/middleware/` (called from IPC handlers) |
| Data / helper services | `src/main/services/` |
| Safe APIs for the page | `src/preload/index.js` + handlers in `src/main/ipc/register.js` |
| OS menus, shortcuts, second windows | `src/main/` |

Current **`window.electronAPI`**: `ping` + `openRouterChatStream` in `src/preload/index.js`. See **Diagnoses Room and OpenRouter** for chat IPC flow.

---

## Production readiness (architecture vs shipping)

### Solid for real apps (keep)

| Area | Notes |
|------|--------|
| **`src/` source tree** | Clean separation: main, preload, renderer, shared. |
| **Main + preload + shared isolation** | Each concern in its own folder under `src/`. |
| **Isolation + CSP** | Aligns with current Electron guidance. |
| **IPC channels centralized** | `src/shared/ipc/channels.js` — single source of truth. |

### Still needed before "production ship"

| Gap | Typical next step |
|-----|-------------------|
| **No installer / bundle** | Add **electron-builder**, **electron-forge**, or equivalent. |
| **No auto-update** | Plan **electron-updater** or vendor store updates once installers exist. |
| **Dev vs prod** | Disable **DevTools** and trim menus when `app.isPackaged` or `NODE_ENV === 'production'`. |
| **`electron` in `devDependencies`** | Already correct for development; bundler strips it for distribution. |
| **Quality / CI** | Linting, tests, and CI are not in scope yet. |
| **Regulated / clinical data** | If the app handles real PHI, compliance (encryption, audit, BAAs, etc.) is separate from architecture. |

---

## Dependencies

- **`electron`** — only dependency in `package.json` (`devDependencies`).

---

## Troubleshooting

| Symptom | What to try |
|---------|----------------|
| **`npm` / "running scripts is disabled"** (PowerShell) | Use **`npm.cmd`**, **Command Prompt**, **`install-deps.bat`** / **`run.bat`**, or relax execution policy for **CurrentUser** |
| **`electron` is not recognized** | Run **`npm install`**; start script uses `scripts/start-electron.js` which requires Electron from `node_modules` |
| Git push rejected — **large file** / **`electron.exe`** | **`node_modules`** was committed by mistake; keep **`node_modules/`** in **`.gitignore`** |
| Terminal opens and closes immediately | Use **`run.bat`** or a persistent terminal |
| Window does not appear | `node ./node_modules/electron/cli.js . --disable-gpu`; check console for load errors |
| **`npm` not found** | Install Node LTS; reopen terminal |
| CSS/JS not loading | Paths relative to the HTML file loading them; CSP includes `style-src 'self'` |

---

## Changelog (high level)

- Scaffold: Electron + preload + CSP, `run.bat`.
- **Renderer layout:** `renderer/` as web root with `styles/`, `scripts/`, `assets/`.
- **Production readiness** section added.
- **App icon and branding:** `logo.png` wired in `main-window.js`.
- **Two renderer screens:** home (`index.html`) → `screens/diagnoses-room/index.html`; shared `constants.js`.
- **Git / Windows:** `.gitignore`, `install-deps.bat`, `run.bat`, `npm.cmd` pattern.
- **README.md** for GitHub onboarding; **CLAUDE.md** for project context.
- **Project rename:** product and UI title **NeuroAGI**; npm package name **`neuro-agi`**.
- **Restructured to `src/` layout** (following Flowter template): `src/main/` (index, ipc, windows, middleware, services), `src/preload/`, `src/renderer/` (with `screens/` for additional pages), `src/shared/` (IPC channels). Added `scripts/start-electron.js`, `.vscode/launch.json`. Electron moved to `devDependencies`.
