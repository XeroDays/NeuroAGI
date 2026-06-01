# Changelog

All notable changes to **NeuroAGI** ([Open-Health](https://github.com/XeroDays/Open-Health)) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

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

[Unreleased]: https://github.com/XeroDays/Open-Health/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/XeroDays/Open-Health/releases/tag/v1.0.0
