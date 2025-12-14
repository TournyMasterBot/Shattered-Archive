# GitHub Actions – Local Testing Guide

This document explains how to **run and test GitHub Actions locally** using Docker.
This allows you to validate workflows before pushing commits to GitHub.

We use **`act`**, a tool that executes `.github/workflows/*.yml` files locally by
simulating GitHub Actions runners inside Docker containers.

---

## Prerequisites

Before starting, ensure you have:

- **Docker**
  - Docker Desktop (Windows / macOS)
  - Docker Engine (Linux)
- **Git**
- A cloned copy of this repository

Docker **must be running** before using `act`.

---

## Installing `act`

### Windows

Install using `winget`:

```powershell
winget install nektos.act
```

Restart your terminal after installation.

---

### macOS

Install using Homebrew:

```bash
brew install act
```

---

### Linux

Install using the official install script:

```bash
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

Or download a binary directly from the releases page:
https://github.com/nektos/act/releases

---

## Verifying Installation

From the repository root, run:

```bash
act --version
```

You should see the installed version printed.

---

## Running GitHub Actions Locally

### List Available Workflows

```bash
act -l
```

This shows all workflows and jobs defined under `.github/workflows`.

---

### Run the Default Workflow (Push Event)

```bash
act
```

This simulates a `push` event.

---

### Run a Specific Event

```bash
act pull_request
```

---

### Run a Specific Workflow File

```bash
act -W .github/workflows/ci.yml
```

---

## Runner Images (Important)

GitHub uses managed runners like `ubuntu-latest`.
Locally, `act` maps these to Docker images.

If a workflow fails due to missing tools, explicitly specify the runner image:

```bash
act -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest
```

This is the recommended default for most projects.

---

## Environment Variables and Secrets

### Passing Secrets Inline

```bash
act -s MY_SECRET=value
```

---

### Using an Environment File

Create a `.env.ci` file:

```env
API_KEY=example
TOKEN=example
```

Run with:

```bash
act --env-file .env.ci
```

⚠️ **Never commit `.env` files to git.**

---

## Running `act` via Docker (No Local Install)

If you prefer not to install `act` locally, you can run it entirely via Docker:

```bash
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:/repo" \
  -w /repo \
  ghcr.io/catthehacker/act:latest \
  act -l
```

This approach:
- Requires Docker only
- Uses the host Docker daemon
- Works consistently across platforms

---

## Common Issues

### Docker Is Not Running
Ensure Docker Desktop / Docker Engine is running before executing `act`.

---

### Workflow Uses Unsupported Runners
`act` does **not** support:
- `windows-latest`
- `macos-latest`

Workflows must be runnable on `ubuntu-latest`.

---

### Missing Tools in Runner
Use the full Ubuntu runner:

```bash
act -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest
```

---

## Recommended Usage for This Repository

For most development workflows, use:

```bash
act -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest
```

This mirrors GitHub’s hosted runner behavior as closely as possible.

---

## Additional Resources

- act repository: https://github.com/nektos/act
- GitHub Actions documentation: https://docs.github.com/en/actions
