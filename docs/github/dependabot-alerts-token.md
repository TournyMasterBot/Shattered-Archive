# Dependabot Alerts — Token Setup

This document explains how to create a GitHub Personal Access Token (PAT) with
the minimum permissions required to read Dependabot security alerts, and how to
invoke the fetch script.

---

## Required Permission

The GitHub GraphQL `vulnerabilityAlerts` field on a repository requires the
**`security_events`** read scope.

For a **private repository** the `repo` scope is also required, because
`security_events` alone cannot read repository metadata on private repos.

---

## Creating a Fine-Grained PAT (recommended)

Fine-grained tokens are scoped to specific repositories and give you the
smallest possible blast radius.

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens** (direct path: `https://github.com/settings/personal-access-tokens/new`).

2. Fill in the form:
   | Field | Value |
   |---|---|
   | **Token name** | `shattered-archive-dependabot-read` (or similar) |
   | **Expiration** | Set an appropriate date — 7–30 days is reasonable for a one-off audit |
   | **Resource owner** | `TournyMasterBot` |
   | **Repository access** | **Only select repositories** → `Shattered-Archive` |

3. Under **Repository permissions**, set:
   | Permission | Access |
   |---|---|
   | **Security events** | Read-only |
   | **Metadata** | Read-only _(auto-granted, required for all fine-grained tokens)_ |

   Leave everything else at **No access**.

4. Click **Generate token** and copy it immediately — GitHub will not show it again.

> **Do not store the token in any file, environment file, or commit.**
> The fetch script is designed to prompt for it securely at runtime.

---

## Creating a Classic PAT (alternative)

If fine-grained tokens are not available for your organisation:

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Set the minimum required scopes:
   - `security_events` — read Dependabot alerts
   - `repo` — required if `Shattered-Archive` is a private repository
4. Set an expiration and generate.

---

## Invoking the Fetch Script

The script `scripts/fetch-dependabot-alerts.ps1` never accepts the token as a
command-line argument (which would expose it in shell history and process
listings). Instead it always prompts for the token securely at runtime.

### Interactive use (recommended)

```powershell
# From the repo root — you will be prompted to paste the token
.\scripts\fetch-dependabot-alerts.ps1
```

The prompt uses `Read-Host -AsSecureString`, so the token is masked and never
echoed to the terminal.

### Non-interactive / CI use

Set the token in the current session only (not persisted to any file):

```powershell
$env:GH_DEPENDABOT_TOKEN = "<paste token here>"
.\scripts\fetch-dependabot-alerts.ps1
# Clear it immediately after
Remove-Item Env:\GH_DEPENDABOT_TOKEN
```

> If running in a CI environment (GitHub Actions, etc.), pass the token via a
> repository secret and reference it as `${{ secrets.GH_DEPENDABOT_TOKEN }}`.
> The script reads `$env:GH_DEPENDABOT_TOKEN` automatically before falling
> back to the interactive prompt.

---

## Output

Fetched data is written to `.security-updates/` in the repo root:

| File | Description |
|---|---|
| `alerts-YYYYMMDD-HHmmss.json` | Raw alert data (all fields) |
| `summary-YYYYMMDD-HHmmss.md` | Human-readable summary grouped by severity |

These files are excluded from git via `.gitignore`. Only `.security-updates/.gitkeep`
is committed, to preserve the folder.

---

## Revoking the Token

Once you have finished reviewing and addressing the alerts, revoke the token
immediately:

1. Go to **GitHub → Settings → Developer settings → Personal access tokens**.
2. Find the token by name and click **Delete**.
