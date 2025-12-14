# GitHub Desktop – Signed Commits (GPG)

This guide explains how to use **GPG‑signed commits with GitHub Desktop on Windows**.
It assumes you already created a GPG key.

---

## Overview

GitHub Desktop **can sign commits**, but it must be configured to:
- Use **system Git** (not the embedded Git)
- Use the correct **gpg.exe**
- Have a working **pinentry** prompt

Once configured, commits made in GitHub Desktop will show as **Verified** on GitHub.

---

## Prerequisites

- GitHub Desktop installed
- Gpg4win installed (includes GnuPG + pinentry)
- A generated GPG key

Verify GPG is installed:

```powershell
gpg --version
```

---

## 1. Configure GitHub Desktop to Use System Git

Open **GitHub Desktop**:

1. **File → Options → Git**
2. Under **Git executable**, select:
   ```
   Use system Git
   ```
3. Save and restart GitHub Desktop

This ensures GitHub Desktop uses your global Git configuration.

---

## 2. Configure Git to Use Your GPG Key

Replace the key ID below with your own if needed.

```powershell
git config --global user.signingkey {SIGNING_KEY}
git config --global commit.gpgsign true
```

Explicitly set the GPG binary (recommended on Windows):

```powershell
git config --global gpg.program "C:\Program Files (x86)\GnuPG\bin\gpg.exe"
```

Verify configuration:

```powershell
git config --global --get user.signingkey
git config --global --get commit.gpgsign
git config --global --get gpg.program
```

---

## 3. Ensure Pinentry Works (Passphrase Prompt)

GitHub Desktop runs Git in a GUI context.
If pinentry is not configured, commits may hang or silently fail.

### Configure pinentry

Create or edit this file:

```
C:\Users\<your-username>\AppData\Roaming\gnupg\gpg-agent.conf
```

Add **one** of the following (use the one that exists):

```
pinentry-program "C:\Program Files (x86)\GnuPG\bin\pinentry-basic.exe"
```

or:

```
pinentry-program "C:\Program Files (x86)\GnuPG\bin\pinentry.exe"
```

Restart the GPG agent:

```powershell
gpgconf --kill gpg-agent
gpgconf --launch gpg-agent
```

---

## 4. Test a Signed Commit in GitHub Desktop

1. Open any repository
2. Make a small change
3. Commit using GitHub Desktop

You should see a **passphrase prompt**.
After pushing, the commit should be marked **Verified** on GitHub.

---

## 5. Verify Locally

From a terminal:

```powershell
git log --show-signature -1
```

Expected output:

```
Good signature from "<your name> <your-email>"
```

---

## Common Issues

### Commit hangs in GitHub Desktop
- pinentry is not launching
- Fix: verify `gpg-agent.conf` and restart the agent

---

### Commit is not marked "Verified" on GitHub
- Commit email must match a GitHub email
- Public GPG key must be uploaded to GitHub
- Commit must be newly created (old commits remain unsigned)

---

## Recommended Settings

```powershell
git config --global commit.gpgsign true
git config --global user.email "YOUR_USER_EMAIL"
git config --global user.name "YOUR_USER_NAME"
```

---

## Notes

- GitHub Desktop does **not** have a checkbox for signing commits
- Signing is controlled entirely by Git configuration
- Once set, signing is automatic

---

## References

- https://docs.github.com/en/authentication/managing-commit-signature-verification
- https://www.gnupg.org/
- https://desktop.github.com/
