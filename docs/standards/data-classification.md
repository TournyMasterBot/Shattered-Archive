# Data classification

> **DRAFT — owner to confirm.** Derived from `PRIVACY.md`, `SECURITY.md` and the "Security and privacy" rules in
> `.github/copilot-instructions.md`; no earlier classification document existed. Until confirmed, `/scope-work` follows it and says so.

## Classes

| Class | What it is here | Examples |
|---|---|---|
| **Public** | Safe for anyone to read | Source code, docs, public game data, anything on the .com site |
| **Internal** | Not secret, but not for publication | Dev-replica hostnames and ports, internal service wiring, plans and bug reports that name no person |
| **Personal** | Identifies or profiles a person (PRIVACY.md: logs, character names, accounts) | Account email, character names, in-game identifiers, IP addresses, gameplay logs, Discord handles of reporters |
| **Restricted** | Grants access if leaked | Passwords and hashes, API keys, device-bound credentials, session cookies (`__Host-sa_session`), encryption keys, `.env` and `secrets/` contents, tokens |

## Rules for work items, PR bodies and screenshots

Work-item folders are committed and end up in a public PR, so every document in them is held to **Public or Internal**.

1. **Personal and Restricted data never appear as values.** Name the category instead: "a player's email", "the signing key",
   "a log excerpt containing character names". Use placeholders (`<account-email>`, `<character>`, `<token>`).
2. **Logs and transcripts** quoted in a bug report are scrubbed first: character names, accounts, IPs and tokens replaced.
   Say what was removed.
3. **Screenshots** are retaken or cropped if they show Personal or Restricted data; use test accounts and fake characters.
4. **Scope documents classify the data the work touches** (what is read, written, stored, sent, logged) and flag any change
   that moves data up a class, stores Personal data where it was not stored, widens who can read it, or logs it.
5. **Restricted data in the work itself** (new secret, key rotation, credential flow) is flagged for the owner in the scope
   document; the document describes the shape of the change, never the secret.
6. **Unsure of the class: treat it as the higher one** and ask.

## Where each class may be stored by the work

| Class | Committed docs / PR | Code and tests | Logs | Local-only files |
|---|---|---|---|---|
| Public | yes | yes | yes | yes |
| Internal | yes | yes | yes | yes |
| Personal | no (placeholders) | fake data only | no | only when the user supplied it for the task |
| Restricted | no | no (env / secret store) | no | only in the existing git-ignored secret locations |
