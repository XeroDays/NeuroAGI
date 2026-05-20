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
| Dependencies | `electron` (devDep), `dotenv` (dep) |

---

## Project structure

```
src/
├── main/
│   ├── index.js              # Bootstrap: dotenv config, hide menu, register IPC, create window
│   ├── ipc/
│   │   └── register.js       # IPC handlers: ping, startReportCollection, OpenRouter stream
│   ├── middlewares/
│   │   └── collector-middleware.js # StartReportcollection({ issue, gender, age }) — entry from home screen
│   ├── services/
│   │   └── api-helper.js     # streamChat() → OpenRouter HTTPS SSE; reads process.env.OPENROUTER_API_KEY
│   └── windows/
│       └── main-window.js    # BrowserWindow: 800x600, hidden until ready, preload + contextIsolation
├── preload/
│   └── index.js              # contextBridge → window.electronAPI { ping, openRouterChatStream }
├── renderer/
│   ├── index.html            # Home screen
│   ├── screens/
│   │   └── diagnoses-room/
│   │       └── index.html    # Diagnoses Room chat screen
│   ├── scripts/
│   │   ├── constants.js      # APP_TITLE, SCREEN_DIAGNOSES_ROOM, labels
│   │   ├── app.js            # Home screen: populates UI, navigates with issue/gender/age params
│   │   ├── diagnoses-room.js # Chat screen: composer, send, AiHelper integration
│   │   └── ai-helper.js      # createAiChat(): conversation history, streaming bubbles via IPC
│   ├── styles/
│   │   ├── app.css           # Home screen pastel theme
│   │   └── diagnoses-room.css # Chat screen dark theme
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

### Home screen → Diagnoses Room navigation

1. User types health issue in text input, selects gender and age from dropdowns
2. Clicks submit button (arrow icon)
3. `app.js` calls `window.electronAPI.startReportCollection({ issue, gender, age })` → IPC `START_REPORT_COLLECTION`
4. Main process: `register.js` invokes `StartReportcollection()` in `collector-middleware.js`
5. After the call resolves, `app.js` builds query string (`?issue=...&gender=...&age=...`) and navigates to `screens/diagnoses-room/index.html`

### Chat streaming (Diagnoses Room ↔ OpenRouter)

1. User types message → `diagnoses-room.js` calls `chat.sendUserMessage(text)`
2. `ai-helper.js` appends user bubble, calls `window.electronAPI.openRouterChatStream({ messages, onChunk, onDone, onError })`
3. Preload generates `requestId`, listens for `openrouter-stream-event`, sends `openrouter-stream-start` to main
4. `src/main/ipc/register.js` receives, calls `api-helper.js` `streamChat()`
5. `api-helper.js` reads `process.env.OPENROUTER_API_KEY`, streams from OpenRouter SSE
6. Chunks sent back via `event.sender.send('openrouter-stream-event', { requestId, type, text })`
7. Preload forwards to `onChunk`/`onDone`/`onError` callbacks → `ai-helper.js` updates assistant bubble

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
