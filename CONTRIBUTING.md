# Contributing to Shattered Archive

Thank you for your interest in contributing to Shattered Archive.

ShatteredArchive is a **Source Available** fan project focused on providing
tooling, research, and extensibility for MUD players and enthusiasts,
particularly for Dark and Shattered Lands.

Contributions of all kinds are welcome, subject to the guidelines below.

---

## Who Can Contribute

### Forks and Pull Requests

- **Anyone** may fork this repository and submit a pull request (PR).
- Pull requests are the primary way to propose changes.

### Direct Repository Access

- **Only approved contributors and maintainers** may push directly to
  branches in the main repository.
- All primary branches are protected and cannot be pushed to directly
  without appropriate permissions.

---

## Branching and Release Model

This repository uses a **release-based branching strategy** to support
development, testing, and production deployment.

### Primary Branches

- `release/dev`  
  Active development branch. New features and changes are merged here first.
  This is the default target for most pull requests.

- `release/staging`  
  Pre-production testing branch used for integration testing and validation.
  Changes are promoted here after stabilization in `release/dev`.

- `release/production`  
  Production-ready branch representing stable, released code.
  Only changes that have passed testing and review are promoted here.

### Pull Request Targeting

- Contributors should generally target **`release/dev`** when opening
  pull requests.
- Maintainers are responsible for promoting changes between
  `release/dev`, `release/staging`, and `release/production`.

---

## Pull Request Review Process

All pull requests must meet the following requirements before they can
be merged:

1. **Maintainer Approval**
   - At least **one code maintainer** must approve the PR.
   - Maintainers may request changes or clarification.

2. **Continuous Integration (CI)**
   - All required CI checks must pass.
   - CI checks **cannot be bypassed** unless:
     - Explicitly approved by a code maintainer, **and**
     - A clear reason is documented in the PR discussion.

3. **Branch Protection**
   - Pull requests must target the appropriate branch.
   - Branches must be up to date with their target branch before merging.

---

## What You Can Contribute

Contributors are encouraged to submit **anything they believe is useful**,
including but not limited to:

- Code improvements or new features
- Bug fixes
- Documentation
- Performance improvements
- Tooling or developer experience enhancements
- Research, data, references, or analysis related to the game

If you are unsure whether a contribution fits, feel free to open an issue
to discuss it first.

---

## Plugins and Extensions

### Proposing Plugins

- Plugin ideas and implementations are welcome.
- Plugins may be proposed for inclusion as part of the **core ecosystem**.

### Core vs Independent Plugins

- **Independent plugins**:
  - May be developed, licensed, and distributed independently by their authors.
  - May use different licensing terms, subject to compatibility with the
    ShatteredArchive Software.

- **Core plugins**:
  - Those merged into the main repository or distributed as part of the core system.
  - Require additional review.
  - May involve a **rights transfer or licensing agreement** with the
    project maintainer.

Details regarding plugin licensing, rights transfer, and a potential
plugin marketplace will be documented separately in future files such as:

- `PLUGINS.md`
- `PLUGIN-MARKETPLACE.md`

---

## Research Contributions

Research contributions are **always welcome**.

This includes:
- Observational data
- Analysis of game mechanics
- Mapping or indexing work
- Structured data derived from gameplay

All research must be based on user interaction with the game and must not
include proprietary server source code or raw server files.

---

## Development Standards

### Code Style and Formatting

- ESLint is enforced across the project.
- Code formatting is handled via Prettier.
- Before submitting a PR, run:

```bash
pnpm format
```

and ensure there are no linting errors.

---

### Testing Requirements

- **All new features require near-100% test coverage.**
- Tests must be meaningful, clear in intent, and explicit about expected behavior.
- Coverage requirements apply to new or modified code, not untouched legacy code.

Pull requests that introduce features without adequate tests may be rejected
or sent back for revision.

---

## Licensing of Contributions

By submitting a contribution to this repository, you agree that:

- Your contribution may be incorporated into the **ShatteredArchive Software**.
- Your contribution will be licensed under the same **Source Available license**
  as the rest of the project, unless otherwise agreed in writing.

### Plugin Licensing Flexibility

- Authors of **independent plugins** may apply different licensing terms to their
  plugins, provided those plugins are not merged into the core repository.
- Licensing and rights for plugins intended to become part of the core ecosystem
  will be discussed on a case-by-case basis.

If you have questions or special requirements regarding licensing,
please raise them before submitting your PR.

---

## Code of Conduct

All contributors are expected to follow the project’s [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Questions

If you have questions about contributing, feel free to:
- Open an issue
- Start a discussion
- Contact the maintainers via the project repository

Thank you for helping improve ShatteredArchive.
