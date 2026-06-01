# NeuroAGI

Desktop health diagnostics app built with [Electron](https://www.electronjs.org/) and JavaScript. A pastel glassmorphism experience that walks you through intake, lab results, final clarifications, and multi-model AI analysis.

<img width="770" height="542" alt="image" src="https://github.com/user-attachments/assets/f06df5a7-82bf-4b2c-a4ce-d58851b5597d" />

## What it does

NeuroAGI helps you explore a health concern step by step. You describe your issue on the home screen; AI then generates tailored follow-up questions, lab-style result inputs, and a last round of clarifications. On the doctor screen, several AI models stream independent pre-doctor analyses in parallel so you can compare perspectives.

The app uses [OpenRouter](https://openrouter.ai/) for AI requests. Multiple models work together on structured steps (questionnaire, laboratory, pre-doctor room), with a user-chosen master model consolidating their outputs. The doctor step streams prose from a dedicated set of analysis models.

## User journey

| Step | Screen | Purpose |
|------|--------|---------|
| 1 | **Home** | Enter health issue, gender, age, and reasoning depth; start a new run |
| 2 | **Questionnaire** | Answer AI-generated intake questions (you can remove questions you do not want) |
| 3 | **Laboratory** | Enter results for suggested tests and imaging (mark which reports you have) |
| 4 | **Pre-doctor room** | Answer final clarifying questions after intake and lab data are collected |
| 5 | **Doctor** | Read streaming analyses from multiple AI models, with optional reasoning views |

Use **Back** on any screen to return home. Starting a new run from home resets usage totals for that session.

## Key features

- **Multi-model pipeline** — Worker models propose content in parallel; a starred master model merges questionnaire-style steps when possible, with a fallback if merge is unavailable.
- **Models settings** — Choose which models are active, designate one master for merge steps, and browse free vs paid options with latency, throughput, and price hints.
- **Reasoning level** — On home, pick how deeply doctor models reason (None through Very High); default is Medium.
- **Usage tracking** — Cost and token totals appear in the top-right on every screen and update live during a run.
- **Doctor experience** — One tab per analysis model; live streaming, optional “thinking” view for models that expose reasoning, and a way to copy the analysis prompt on the doctor screen.
- **Developer tools** — Gear icon on home toggles DevTools for debugging.

## Requirements

- [Node.js](https://nodejs.org/) **LTS** (v18 or newer recommended)
- **npm** (included with Node)
- An [OpenRouter](https://openrouter.ai/) API key

## Getting started

1. Clone the repository and open the project folder (quote the path if it contains spaces).
2. Run `npm install`, then `npm start`.
3. Create a `.env` file in the project root with your OpenRouter API key (the file is git-ignored). Open the **Models** popup on the home screen to enable models and star a master before running questionnaire steps.

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
