# Support

This document explains how to get help with **NeuroAGI** ([Open-Health](https://github.com/XeroDays/Open-Health)),
report problems, and request features.

## Before opening an issue

Please check these resources first — your question may already be answered:

1. **[README.md](README.md)** — installation, OpenRouter setup, project layout, and troubleshooting
2. **[CHANGELOG.md](CHANGELOG.md)** — recent changes and release notes
3. **[Existing GitHub Issues](https://github.com/XeroDays/Open-Health/issues)** — search for duplicates

For development and contribution guidelines, see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Bug reports

Report reproducible bugs through [GitHub Issues](https://github.com/XeroDays/Open-Health/issues/new).

### Required information

Include the following so maintainers can investigate efficiently:

| Field | Example |
|-------|---------|
| **Operating system** | Windows 11, macOS 14, Ubuntu 22.04 |
| **Node.js version** | `node --version` output |
| **App version** | From [`package.json`](package.json) (currently 1.0.0) or git commit hash |
| **Steps to reproduce** | Numbered list from launch to failure |
| **Expected behavior** | What should happen |
| **Actual behavior** | What happened instead |
| **Logs or screenshots** | Console output, error messages, UI screenshots |

**Redact all API keys** and personal health information before posting.

### Common issues

See the [Troubleshooting](README.md#troubleshooting) section in the README for:

- Missing `OPENROUTER_API_KEY`
- PowerShell / `npm` execution policy on Windows
- Electron not found after install
- Blank window on startup

## Feature requests

Open a [GitHub Issue](https://github.com/XeroDays/Open-Health/issues/new) with:

- **Use case** — what problem you are trying to solve
- **Proposed behavior** — how you envision the feature working
- **Alternatives considered** — other approaches you evaluated

Feature requests are evaluated based on project scope, maintainability, and alignment with the experimental nature
of the application.

**Note:** NeuroAGI is not intended to become a regulated medical device without appropriate validation and
compliance. Requests that assume clinical deployment may be declined or redirected.

## Questions and discussions

For usage questions, architecture questions, or general discussion:

1. Open a [GitHub Issue](https://github.com/XeroDays/Open-Health/issues/new).
2. Prefix the title with `[Question]` for visibility.
3. Describe what you have already tried and link to relevant documentation.

GitHub Discussions is not currently enabled for this repository. Issues serve as the primary Q&A channel.

## Security issues

**Do not report security vulnerabilities in public Issues.**

Follow the responsible disclosure process in **[SECURITY.md](SECURITY.md)** using GitHub Private Vulnerability
Reporting:

[Report a vulnerability](https://github.com/XeroDays/Open-Health/security/advisories/new)

## Contributing

Want to fix a bug or add a feature yourself? See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:

- Development setup
- Branch and commit conventions
- Pull request requirements
- Manual testing checklist

All contributors must follow the **[Code of Conduct](CODE_OF_CONDUCT.md)**.

## Commercial and partnership inquiries

For commercial licensing, integration partnerships, or sponsorship discussions:

1. Open a [GitHub Issue](https://github.com/XeroDays/Open-Health/issues/new).
2. Use the title prefix **`[Partnership]`**.
3. Describe your organization, use case, and desired outcome.

Maintainers will respond when capacity allows. There is no dedicated sales or support email for this open-source
project.

## Medical disclaimer

NeuroAGI is an **experimental UI shell** for research and demonstration purposes.

- It is **not** a certified medical device or clinical decision support tool.
- It does **not** replace professional medical judgment.
- It must **not** be used for emergency care or real patient care without appropriate validation, compliance, and
  oversight.

If you or someone else may be experiencing a medical emergency, contact local emergency services immediately.

See the full disclaimer in **[README.md](README.md#disclaimer)**.

## Response expectations

This is an open-source project maintained on a **best-effort** basis:

- There is **no SLA** for issue response or resolution times.
- Critical security reports receive priority per [SECURITY.md](SECURITY.md).
- Issues may be closed if they are duplicates, out of scope, or lack information needed to reproduce.

Thank you for using and supporting NeuroAGI.
