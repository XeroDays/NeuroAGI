# NeuroAGI

Desktop app built with [Electron](https://www.electronjs.org/) and JavaScript. Two screens: a cyan glass-style home view and a **Diagnoses Room** workspace.
<img width="968" height="660" alt="image" src="https://github.com/user-attachments/assets/5b08d4f1-bd1d-4874-b628-e49985040343" />

## Requirements

- [Node.js](https://nodejs.org/) **LTS** (v18 or newer recommended)
- **npm** (included with Node)

## Quick start

```bash
git clone https://github.com/XeroDays/NeuroAGI.git
cd NeuroAGI
npm install
npm start
```

If the project folder path contains spaces, quote it, e.g. `cd "C:\path\to\NeuroAGI"`.

### OpenRouter (Diagnoses Room chat)

The **Diagnoses Room** screen streams replies from [OpenRouter](https://openrouter.ai/).

Set your API key either as an environment variable **`OPENROUTER_API_KEY`** or by creating `OPENROUTER_API_KEY.txt` in the repo root (this file is git-ignored; never commit real keys):

- **Windows (cmd):** `set OPENROUTER_API_KEY=sk-or-...` then `npm start`
- **Windows (PowerShell):** `$env:OPENROUTER_API_KEY="sk-or-..."; npm start`
- **macOS / Linux:** `export OPENROUTER_API_KEY=sk-or-...` then `npm start`

File option:
- Put the key as a single line inside `OPENROUTER_API_KEY.txt` (repo root).

The default model is configured in **`api-helper.js`** (`OPENROUTER_MODEL`).

> **Note:** If the GitHub repository is still named differently (e.g. `Open-Health`), use that URL and `cd` into the folder name you get after clone.

### Windows (recommended helpers)

| File | Purpose |
|------|---------|
| **`install-deps.bat`** | Runs `npm.cmd install` (dependencies into `node_modules`) |
| **`run.bat`** | Runs the app via `npm.cmd start` and pauses on errors |

Double-click **`install-deps.bat`** once after cloning, then **`run.bat`** to launch.

### Windows: PowerShell and `npm`

If PowerShell shows **"running scripts is disabled"** when you run `npm`:

- Use **Command Prompt** (`cmd.exe`) instead, or  
- Run **`npm.cmd install`** and **`npm.cmd start`** (note the **`.cmd`**), or  
- For your user only: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launches the Electron app via `scripts/start-electron.js` |
| `npm install` | Installs dependencies (creates `node_modules`; not committed to Git) |

## Project layout

```
├── package.json
├── scripts/
│   └── start-electron.js       # Spawns Electron cleanly
├── src/
│   ├── main/
│   │   ├── index.js             # App bootstrap (lifecycle, IPC, window)
│   │   ├── ipc/
│   │   │   └── register.js      # IPC handler registration
│   │   └── windows/
│   │       └── main-window.js   # BrowserWindow creation
│   ├── preload/
│   │   └── index.js             # contextBridge → window.electronAPI
│   ├── renderer/
│   │   ├── index.html           # Home screen (glass UI)
│   │   ├── screens/
│   │   │   └── diagnoses-room/
│   │   │       └── index.html   # Diagnoses Room screen
│   │   ├── scripts/
│   │   │   ├── constants.js     # Shared display strings
│   │   │   ├── app.js           # Home screen logic
│   │   │   ├── diagnoses-room.js
│   │   │   └── ai-helper.js     # Chat stream orchestration
│   │   ├── styles/
│   │   │   ├── app.css          # Home / glass theme
│   │   │   └── diagnoses-room.css # Dark chat theme
│   │   └── assets/
│   │       ├── images/
│   │       ├── fonts/
│   │       └── icons/
│   └── shared/
│       └── ipc/
│           └── channels.js      # IPC channel name constants
├── .vscode/
│   └── launch.json              # Debug Main Process
├── run.bat
├── install-deps.bat
├── CLAUDE.md
└── README.md
```

The on-screen app title and shared labels live in **`src/renderer/scripts/constants.js`** (`APP_TITLE`, etc.).

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **`electron` is not recognized** | Run `npm install`, then `npm start` (the repo's script calls Electron via Node). |
| **`npm` fails in PowerShell** | Use **`npm.cmd`** or **`install-deps.bat`** / **`run.bat`**. |
| **Blank or no window** | `node ./node_modules/electron/cli.js . --disable-gpu` from the project root. |
| **Diagnoses Room: “OPENROUTER_API_KEY is not set”** | Set the env var or `OPENROUTER_API_KEY.txt` (see **OpenRouter** above) and restart the app. |
| **Push rejected (large file)** | Do not commit **`node_modules/`**. It is listed in **`.gitignore`**. |

## License

ISC (see `package.json`).

## Disclaimer

This is a UI shell for experimentation. It is **not** a certified medical device or clinical decision tool and does not replace professional judgment. Do not use it for real patient care without appropriate validation, compliance, and oversight.
