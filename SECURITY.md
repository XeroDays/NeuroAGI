# Security Policy

## Supported versions

Security fixes are applied to actively maintained release lines. Use the latest version when possible.

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

The current release is tracked in [`package.json`](package.json) and [`CHANGELOG.md`](CHANGELOG.md).

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

We use **GitHub Private Vulnerability Reporting** for responsible disclosure:

1. Open the [Open-Health repository](https://github.com/XeroDays/Open-Health).
2. Go to the **Security** tab.
3. Click **Report a vulnerability**, or use this direct link:
   [Report a vulnerability](https://github.com/XeroDays/Open-Health/security/advisories/new).

Private reports allow maintainers to assess and fix issues before public disclosure.

### What to include

Provide as much detail as possible to help us reproduce and remediate the issue:

- Description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if available)
- Affected version(s) and platform(s) (Windows, macOS, Linux)
- Any suggested fix or mitigation

**Do not** include real API keys, `.env` contents, or patient health information in your report. Use redacted or
synthetic examples.

## Response timeline

We aim to follow these targets for confirmed security reports:

| Milestone | Target |
|-----------|--------|
| Initial acknowledgment | Within **72 hours** |
| Status update | Within **14 days** of acknowledgment |
| Fix or mitigation plan | As soon as practicable; coordinated disclosure target **90 days** |

Timelines may vary for complex issues. We will keep you informed of progress when you report through GitHub's
private vulnerability workflow.

## Scope

### In scope

- Vulnerabilities in NeuroAGI application code (main process, preload bridge, renderer, IPC)
- Insecure handling of secrets (for example, accidental exposure of `OPENROUTER_API_KEY`)
- Dependency vulnerabilities with a demonstrable impact on this application
- Electron security misconfigurations introduced by this project (for example, unsafe `nodeIntegration` or broken
  context isolation)

### Out of scope

- Vulnerabilities in the **OpenRouter** platform or third-party LLM providers
- Incorrect, unsafe, or misleading **LLM-generated medical content** (report these as bugs via
  [`SUPPORT.md`](SUPPORT.md), not as security advisories)
- Social engineering attacks against maintainers or users
- Issues requiring physical access to an unlocked machine with the app already running
- Denial-of-service against external APIs beyond what this client controls

## Safe harbor

We support good-faith security research on in-scope components. If you:

- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Report vulnerabilities through the private reporting process above
- Allow reasonable time for remediation before public disclosure

we will not pursue legal action against you for your research activities within scope.

## Sensitive data and secrets

- Never commit `.env` files or API keys. The `.env` file is listed in [`.gitignore`](.gitignore).
- Do not submit real patient data in issues, pull requests, or security reports.
- If you accidentally expose a key, rotate it immediately at [OpenRouter](https://openrouter.ai/) and notify
  maintainers if it was committed to a public fork or branch.

## Non-security bugs

For general bugs, feature requests, and usage questions, use the channels described in [`SUPPORT.md`](SUPPORT.md).

## Medical disclaimer

NeuroAGI is not a certified medical device. Security reporting focuses on software vulnerabilities, not clinical
accuracy of model output. See the disclaimer in [`README.md`](README.md).

## Security-related contributions

Security fixes are welcome through pull requests after coordinated disclosure when appropriate. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for development and review guidelines.

Thank you for helping keep NeuroAGI and its users safe.
