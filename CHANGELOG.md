# Changelog

All notable changes to **NeuroAGI** ([Open-Health](https://github.com/XeroDays/Open-Health)) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Models popup Add: paste an OpenRouter model id onto the visible Free or Paid tab
- Test latency spinner on the probing model row, plus an Error chip (hover shows the failure)
- Hover Delete on Models rows to remove a model from the list
- Splash window with Softasium Register (AppID `NeuroAGI`) before the main window shows
- Optional **New Release Available** chip and ForceUpdate lock overlay; installer downloads to OS Downloads from the Register `DownloadUrl`

### Changed

- Test latency keeps failed models in the list instead of auto-removing them

### Fixed

### Security

## [1.0.3] - 2026-08-25

Settings credentials, per-model Advance threads, and Models Test latency.

### Added

- Settings Credentials tab: save OpenRouter and Tavily keys to `.env` from the app
- Test key buttons in Settings to check OpenRouter and Tavily keys without saving
- Models popup Test latency: probe the visible Free or Paid tab, update latency/tps badges, drop failed models

### Changed

- Settings Save closes the popup after a successful write
- Advance runs every enabled model in parallel; chips switch per-model threads (star is ignored)
- Latency probe lists 1–120 instead of a letter-count / OK reply, with reasoning off and a 2048 token cap

### Fixed

### Security

## [1.0.2] - 2026-08-24

Home → Advance chat is now the live product. The old Questionnaire / Laboratory / Pre-doctor Room / Doctor chain is gone.

### Added

- Advance chat with a starred-master tool loop (find topic URLs, extract page, web search, ask the user)
- Tavily search and extract, plus a session Logs overlay for AI and web calls
- Sunset Bloom theme, custom glass dropdowns, and Markdown assistant replies
- Cancel for an in-flight Advance turn

### Changed

- Home submit is the only path into Advance; reasoning level is chosen on Home
- Settings is Open DevTools only; the starred model is the exclusive Advance master
- Window maximizes on show (title bar stays; not fullscreen)

### Fixed

### Security

## [1.0.0] - 2026-06-01

First stable release of the NeuroAGI multi-screen diagnostic flow.

### Added

- Electron desktop application with pastel glassmorphism UI across Home, Questionnaire, Laboratory, Pre-doctor Room,
  and Doctor screens
- Multi-model OpenRouter integration with parallel worker fanout and master-model merge
  ([`src/main/services/agi-service.js`](src/main/services/agi-service.js))
- Configurable model catalog ([`models-catalog.json`](models-catalog.json)) with user-selectable active models and
  starred master model ([`models-state.json`](models-state.json))
- Models popup for enabling/disabling models, selecting a master merge model, and viewing latency, throughput, price,
  and label badges
- LLM-generated intake questionnaire with tiered JSON parsing (strict → normalize → jsonrepair) and master-merge
  fallback
- LLM-generated laboratory test inputs with per-card "I have this report" toggle
- Pre-doctor Room screen for final clarifying questions before doctor analysis
- Doctor screen with per-model tabs, streaming markdown responses, live reasoning panel, and "See thinking"
  collapsible view
- User-selectable reasoning level on Home screen (none through very_high) threaded into doctor streaming calls
- Real-time usage tracking for API cost and token totals with persistent bubbles across screen navigation
- Usage totals reset on new diagnostic run from Home
- Clipboard copy of full doctor LLM prompt via prompt-copy bubble on Doctor screen
- IPC bridge via preload script with context isolation (`window.electronAPI`)
- Windows helper scripts (`install-deps.bat`, `run.bat`) and VS Code main-process debug configuration
- Environment-based OpenRouter API key loading via `.env` and `dotenv`
- Project documentation: `README.md`, `context.md`, and governance/community files

### Changed

- Refactored diagnostic reasoning framework and middleware LLM options for JSON vs prose workloads
- Enhanced medical intake questionnaire generation prompts and styling across screens
- Updated model catalog entries with versioning, type designation, throughput metrics, and pricing display
- Improved gradient animations and background styles application-wide
- Consolidated laboratory and pre-doctor room UI on shared questionnaire stylesheet

### Fixed

- Logo display and asset path corrections
- Master-merge fallback when master model JSON parse fails or returns empty results

[Unreleased]: https://github.com/XeroDays/Open-Health/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/XeroDays/Open-Health/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/XeroDays/Open-Health/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/XeroDays/Open-Health/releases/tag/v1.0.0
