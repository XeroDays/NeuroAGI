# NeuroAGI

Desktop health diagnostics app built with [Electron](https://www.electronjs.org/) and JavaScript. You describe an issue on Home and Advance runs it across the models you enable.


<img width="770" height="542" alt="image" src="https://github.com/user-attachments/assets/f06df5a7-82bf-4b2c-a4ce-d58851b5597d" />

## What it does

NeuroAGI helps you explore a health concern with the models you turn on. Home collects the issue, name, age, gender, and reasoning level. Advance streams a reply from each enabled model, can ask follow-up questions, and turns a full pre-doctor write-up into a sectioned report.

The app uses [OpenRouter](https://openrouter.ai/) for model calls and [Tavily](https://tavily.com/) when a model searches or extracts a page. A starred master model can write a consensus report from the other replies.

## User journey

| Step | Screen | Purpose |
|------|--------|---------|
| 1 | **Home** | Describe the issue, set name, age, gender, and reasoning (default Very High), then start |
| 2 | **Advance** | Watch each enabled model stream, answer any questions it asks, then read or export the report |

Use **Back** to return home. Starting a new run resets usage totals for that session. Recent analyses on Home reopen a saved thread.

## Key features

- **Multi-model Advance** — Each enabled model runs the same issue. Chips show running, waiting, and error states.
- **Models settings** — Toggle free and paid models, star a master for consensus, filter the list, and probe latency.
- **Reasoning level** — None through Very High. The default is Very High.
- **Reports** — Structured replies show urgency, confidence, sections, and source chips, with copy and Save PDF.
- **Profiles and sessions** — Profiles and past analyses stay in your Documents folder. Profiles can be edited, exported, and imported.
- **Usage tracking** — Cost and token totals sit in the corner and update as calls finish.

## Requirements

- [Node.js](https://nodejs.org/) **LTS** (v18 or newer recommended)
- **npm** (included with Node)
- An [OpenRouter](https://openrouter.ai/) API key

## Getting started

1. Clone the repository and open the project folder (quote the path if it contains spaces).
2. Run `npm install`, then `npm start`.
3. Open **Settings → Credentials** and save your OpenRouter and Tavily keys. They are stored encrypted under Documents/NeuroAGI. Open the **Models** popup on the home screen to enable models before starting a run.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

### Windows helpers

| File | Purpose |
|------|---------|
| **`install-deps.bat`** | Installs dependencies |
| **`run.bat`** | Launches the app and pauses on errors |

Double-click **`install-deps.bat`** once after cloning, then **`run.bat`** to launch.

If PowerShell blocks `npm`, use Command Prompt, run `npm.cmd` instead of `npm`, or use the batch files above.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launches the Electron app |
| `npm run build:win` | Builds the Windows NSIS installer into `dist/` |
| `npm install` | Installs dependencies |

## Community and governance

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, development setup, and pull request guidelines |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards and enforcement |
| [SECURITY.md](SECURITY.md) | Responsible vulnerability disclosure |
| [SUPPORT.md](SUPPORT.md) | Bug reports, feature requests, and getting help |
| [CHANGELOG.md](CHANGELOG.md) | Release history and version notes |

## License

[MIT License](LICENSE)

## Disclaimer

This is a UI shell for experimentation. It is **not** a certified medical device or clinical decision tool and does not replace professional judgment. Do not use it for real patient care without appropriate validation, compliance, and oversight.
