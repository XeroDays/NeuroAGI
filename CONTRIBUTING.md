# Contributing to NeuroAGI

Thank you for your interest in contributing to **NeuroAGI** (the [Open-Health](https://github.com/XeroDays/Open-Health)
repository). This project is an Electron desktop application that orchestrates multi-model LLM workflows for
experimental health-intake diagnostics.

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Architecture primer](#architecture-primer)
- [Branch naming conventions](#branch-naming-conventions)
- [Commit message conventions](#commit-message-conventions)
- [Pull request process](#pull-request-process)
- [Testing requirements](#testing-requirements)
- [Code review expectations](#code-review-expectations)
- [Medical and safety note](#medical-and-safety-note)
- [Security](#security)
- [Getting help](#getting-help)

## Ways to contribute

We welcome contributions in many forms:

- **Bug reports** — reproducible issues with clear steps and environment details.
- **Feature requests and enhancements** — well-scoped improvements to the app flow, UI, or LLM integration.
- **Documentation** — improvements to `README.md`, `context.md`, or these governance files.
- **Model catalog updates** — additions or corrections in [`models-catalog.json`](models-catalog.json).
- **Prompt and middleware improvements** — changes to
  [`src/main/helpers/query-generator-helper.js`](src/main/helpers/query-generator-helper.js) or
  [`src/main/middlewares/collector-middleware.js`](src/main/middlewares/collector-middleware.js).
- **Renderer and styling** — UI/UX improvements in `src/renderer/`.

Before starting significant work, open a GitHub Issue to discuss the approach. This helps avoid duplicate effort and
ensures changes align with project direction.

## Development setup

### Prerequisites

- [Node.js](https://nodejs.org/) **LTS** (v18 or newer recommended)
- **npm** (included with Node)
- Git

### Clone and install

```bash
git clone https://github.com/XeroDays/Open-Health.git
cd Open-Health
npm install
```

If your project folder path contains spaces, quote it when changing directories.

### Environment configuration

Create a `.env` file in the repository root (this file is git-ignored and must never be committed):

```text
OPENROUTER_API_KEY=sk-or-...
```

The key is loaded via `dotenv` at startup in [`src/main/index.js`](src/main/index.js). Worker and master model
configuration lives in [`src/main/services/agi-service.js`](src/main/services/agi-service.js) and the user-facing
Models popup (backed by [`models-catalog.json`](models-catalog.json) and [`models-state.json`](models-state.json)).

### Run the application

```bash
npm start
```

On Windows, you may also use the helper scripts:

| File | Purpose |
|------|---------|
| [`install-deps.bat`](install-deps.bat) | Runs `npm.cmd install` |
| [`run.bat`](run.bat) | Runs the app via `npm.cmd start` |

If PowerShell blocks `npm`, use Command Prompt, run `npm.cmd` directly, or use the `.bat` helpers. See
[`README.md`](README.md#windows-powershell-and-npm) for details.

### Debug the main process

Use the **Debug Main Process** launch configuration in [`.vscode/launch.json`](.vscode/launch.json) to attach a
debugger to the Electron main process.

## Architecture primer

NeuroAGI follows a standard Electron architecture:

| Layer | Location | Notes |
|-------|----------|-------|
| Main process | [`src/main/`](src/main/) | App bootstrap, IPC handlers, OpenRouter API calls |
| Preload | [`src/preload/index.js`](src/preload/index.js) | `contextBridge` exposing `window.electronAPI` |
| Renderer | [`src/renderer/`](src/renderer/) | HTML/CSS/JS screens (ES modules) |
| IPC channels | [`src/shared/ipc/channels.js`](src/shared/ipc/channels.js) | Shared channel name constants |

The diagnostic flow is: **Home** → **Questionnaire** → **Laboratory** → **Pre-doctor Room** → **Doctor**.

For detailed workflow and design specifications, see [`context.md`](context.md). When you change behavior or
structure, update `context.md` in the same pull request so it stays accurate.

## Branch naming conventions

Create feature branches from `main` using these prefixes:

| Prefix | Use for |
|--------|---------|
| `feature/<short-description>` | New features or enhancements |
| `fix/<short-description>` | Bug fixes |
| `docs/<short-description>` | Documentation-only changes |
| `chore/<short-description>` | Maintenance, dependencies, tooling |

Examples:

- `feature/doctor-export-markdown`
- `fix/questionnaire-rate-limit-message`
- `docs/update-contributing-guide`

Use lowercase, hyphen-separated descriptions. Keep branch names concise and descriptive.

## Commit message conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) to keep history readable and to support future
automation.

### Format

```text
<type>(<optional-scope>): <short summary>

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Maintenance, dependencies, tooling |
| `style` | Formatting, whitespace (no logic change) |

### Scopes (optional but encouraged)

Use a scope that matches the area of the codebase: `doctor`, `questionnaire`, `laboratory`, `models`, `ipc`,
`renderer`, `middleware`, etc.

### Examples

```text
feat(doctor): add collapsible reasoning panel toggle
fix(questionnaire): handle OpenRouter 429 rate-limit errors
docs: update OpenRouter setup in README
refactor(middleware): extract JSON parser tiers into helper
chore: bump electron to 28.3.0
```

Write summaries in the imperative mood ("add feature" not "added feature"). Keep the subject line under 72
characters when possible.

## Pull request process

1. **Fork** the repository and create a branch from `main`.
2. **Make focused changes** — one logical change per pull request when possible.
3. **Test manually** using the checklist in [Testing requirements](#testing-requirements).
4. **Update documentation** if your change affects setup, workflow, or architecture (`README.md`, `context.md`, or
   [`CHANGELOG.md`](CHANGELOG.md) for user-visible changes).
5. **Open a pull request** against `main` with a clear description.

### Pull request description template

Include the following in your PR description:

```markdown
## Summary
Brief description of what changed and why.

## Related issue
Fixes #123 (or "N/A")

## How to test
1. Step-by-step manual test instructions
2. Expected result

## Checklist
- [ ] Manual smoke test completed (see CONTRIBUTING.md)
- [ ] No secrets or `.env` files in the diff
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated for user-visible changes
```

Maintainers will review your PR and may request changes. Address feedback promptly and keep the branch up to date
with `main` if needed.

## Testing requirements

This project does not currently have an automated test suite. All contributions must be validated with manual
smoke testing before submission.

### Required smoke test

Run through the full diagnostic flow after your changes:

1. **Home screen** — enter issue, gender, and age; select a reasoning level; click Start.
2. **Questionnaire** — verify questions load via OpenRouter; submit answers.
3. **Laboratory** — verify lab tests load; toggle "I have this report" on at least one card; submit.
4. **Pre-doctor Room** — verify clarifying questions load; submit.
5. **Doctor screen** — verify streaming responses from active models; check tabs, reasoning panel, and markdown
   rendering.

### Additional checks

- **Models popup** — enable/disable models; set a master model; confirm changes persist in `models-state.json`.
- **Usage bubbles** — confirm cost and token totals update during API calls and reset when starting a new run from
  Home.
- **Error handling** — if applicable, verify behavior for missing `OPENROUTER_API_KEY` and rate-limit (429)
  responses.
- **No secrets in diff** — confirm `.env`, API keys, and patient data are not committed.

Document your test steps and results in the pull request description.

## Code review expectations

- **Maintainer review is required** before merging.
- **Keep changes focused** — avoid unrelated refactors in the same PR.
- **Match existing style** — CommonJS in main/preload (`require`/`module.exports`); ES modules in renderer
  (`import`/`export`).
- **Preserve security boundaries** — do not expose Node.js APIs to the renderer outside the preload bridge; keep
  `contextIsolation` intact.
- **Do not commit generated or local artifacts** — `node_modules/`, `.env`, build output, or personal
  `models-state.json` overrides unless intentionally part of the change.
- **Respond to feedback** — discuss trade-offs openly; update the PR until it meets project standards.

## Medical and safety note

NeuroAGI is an **experimental UI shell** for research and demonstration. It is **not** a certified medical device
or clinical decision support tool.

Contributions must not:

- Remove or weaken medical disclaimers in the UI or documentation.
- Present the application as suitable for real patient care without appropriate validation and compliance.
- Encourage users to rely on LLM output for emergency or life-critical decisions.

Preserve and respect the disclaimer in [`README.md`](README.md).

## Security

If you discover a security vulnerability, **do not** open a public GitHub Issue. Follow the responsible disclosure
process in [`SECURITY.md`](SECURITY.md).

Never commit API keys, `.env` files, or real patient health information.

## Getting help

- **Usage questions and bug reports** — see [`SUPPORT.md`](SUPPORT.md).
- **Project overview and troubleshooting** — see [`README.md`](README.md).

Thank you for helping improve NeuroAGI.
