# NeuroAGI

Desktop app built with [Electron](https://www.electronjs.org/) and JavaScript. Two screens: a cyan glass-style home view and a **Diagnoses Room** workspace.

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

> **Note:** If the GitHub repository is still named differently (e.g. `Open-Health`), use that URL and `cd` into the folder name you get after clone.

### Windows (recommended helpers)

| File | Purpose |
|------|---------|
| **`install-deps.bat`** | Runs `npm.cmd install` (dependencies into `node_modules`) |
| **`run.bat`** | Runs the app via `npm.cmd start` and pauses on errors |

Double-click **`install-deps.bat`** once after cloning, then **`run.bat`** to launch.

### Windows: PowerShell and `npm`

If PowerShell shows **“running scripts is disabled”** when you run `npm`:

- Use **Command Prompt** (`cmd.exe`) instead, or  
- Run **`npm.cmd install`** and **`npm.cmd start`** (note the **`.cmd`**), or  
- For your user only: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

The **`start`** script uses `node ./node_modules/electron/cli.js .` so the `electron` binary does not need to be on your `PATH`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launches the Electron app |
| `npm install` | Installs dependencies (creates `node_modules`; not committed to Git) |

## Project layout

```
├── main.js              # Electron main process
├── preload.js           # Preload / contextBridge bridge
├── package.json
├── renderer/            # UI (HTML, CSS, ES modules)
│   ├── index.html
│   ├── diagnoses-room.html
│   ├── styles/
│   ├── scripts/
│   └── assets/
├── resources/build/     # Reserved for installer icons (e.g. electron-builder)
├── run.bat
├── install-deps.bat
└── CLAUDE.md            # Detailed context for contributors / AI assistants
```

The on-screen app title and shared labels live in **`renderer/scripts/constants.js`** (`APP_TITLE`, etc.).

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **`electron` is not recognized** | Run `npm install`, then `npm start` (the repo’s script calls Electron via Node). |
| **`npm` fails in PowerShell** | Use **`npm.cmd`** or **`install-deps.bat`** / **`run.bat`**. |
| **Blank or no window** | `node ./node_modules/electron/cli.js . --disable-gpu` from the project root. |
| **Push rejected (large file)** | Do not commit **`node_modules/`**. It is listed in **`.gitignore`**. |

## License

ISC (see `package.json`).

## Disclaimer

This is a UI shell for experimentation. It is **not** a certified medical device or clinical decision tool and does not replace professional judgment. Do not use it for real patient care without appropriate validation, compliance, and oversight.
