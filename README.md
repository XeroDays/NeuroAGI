# NeuroAGI

Desktop app built with [Electron](https://www.electronjs.org/) and JavaScript. A pastel glassmorphism flow: **Home** (issue + gender + age) → **Questionnaire** (LLM-generated intake) → **Laboratory** (LLM-generated lab-result inputs) → **Doctor** (summary).
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

### OpenRouter API key

The Questionnaire and Laboratory screens call [OpenRouter](https://openrouter.ai/) from the main process via a multi-model fanout + master merge (see `src/main/services/agi-service.js`).

Create a **`.env`** file in the repo root (it is git-ignored — never commit real keys) with a single line:

```
OPENROUTER_API_KEY=sk-or-...
```

The file is loaded via `dotenv` at the top of `src/main/index.js`. The worker model list (`OPENROUTER_WORKER_MODELS`) and the master model (`OPENROUTER_MASTER_MODEL`) are configured in `src/main/services/agi-service.js`.

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
├── .env                              # OPENROUTER_API_KEY (git-ignored)
├── scripts/
│   └── start-electron.js             # Spawns Electron cleanly
├── src/
│   ├── main/
│   │   ├── index.js                  # App bootstrap (dotenv, IPC, window)
│   │   ├── ipc/
│   │   │   └── register.js           # IPC handler registration
│   │   ├── middlewares/
│   │   │   └── collector-middleware.js # StartReportcollection / SubmitQuestionnaire / GotoLaboratory / SubmitLaboratory + tiered JSON parser
│   │   ├── helpers/
│   │   │   └── query-generator-helper.js # LLM prompt builders (intake, merge, laboratory)
│   │   ├── services/
│   │   │   ├── api-helper.js         # OpenRouter transport: chatCompletion / streamChat
│   │   │   └── agi-service.js        # Multi-model fanout + master Nemotron merge
│   │   └── windows/
│   │       └── main-window.js        # BrowserWindow creation
│   ├── preload/
│   │   └── index.js                  # contextBridge → window.electronAPI
│   ├── renderer/
│   │   ├── index.html                # Home screen (glass UI)
│   │   ├── screens/
│   │   │   ├── questionnaire/
│   │   │   │   └── index.html        # Questionnaire screen
│   │   │   ├── laboratory/
│   │   │   │   └── index.html        # Laboratory screen
│   │   │   └── doctor/
│   │   │       └── index.html        # Doctor screen
│   │   ├── scripts/
│   │   │   ├── constants.js          # Shared display strings
│   │   │   ├── app.js                # Home screen logic
│   │   │   ├── questionnaire.js      # Questionnaire screen logic
│   │   │   ├── laboratory.js         # Laboratory screen logic
│   │   │   └── doctor.js             # Doctor screen logic
│   │   ├── styles/
│   │   │   ├── app.css               # Home pastel theme
│   │   │   ├── questionnaire.css     # Questionnaire + Laboratory pastel theme
│   │   │   └── doctor.css            # Doctor pastel theme
│   │   └── assets/
│   │       ├── images/
│   │       ├── fonts/
│   │       └── icons/
│   └── shared/
│       └── ipc/
│           └── channels.js           # IPC channel name constants
├── .vscode/
│   └── launch.json                   # Debug Main Process
├── run.bat
├── install-deps.bat
├── context.md
└── README.md
```

The on-screen app title and shared labels live in **`src/renderer/scripts/constants.js`** (`APP_TITLE`, etc.).

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **`electron` is not recognized** | Run `npm install`, then `npm start` (the repo's script calls Electron via Node). |
| **`npm` fails in PowerShell** | Use **`npm.cmd`** or **`install-deps.bat`** / **`run.bat`**. |
| **Blank or no window** | `node ./node_modules/electron/cli.js . --disable-gpu` from the project root. |
| **“OPENROUTER_API_KEY is not set”** | Create a `.env` file in the repo root with `OPENROUTER_API_KEY=sk-or-...` (see **OpenRouter API key** above) and restart the app. |
| **Push rejected (large file)** | Do not commit **`node_modules/`**. It is listed in **`.gitignore`**. |

## License

ISC (see `package.json`).

## Disclaimer

This is a UI shell for experimentation. It is **not** a certified medical device or clinical decision tool and does not replace professional judgment. Do not use it for real patient care without appropriate validation, compliance, and oversight.
