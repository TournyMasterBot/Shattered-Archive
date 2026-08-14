# No elevation needed: issuing leaf certs uses the mkcert CA in the user
# profile. Only the one-time `mkcert -install` (trust the CA) needs admin.
$ErrorActionPreference = "Stop"

# Optional: make output predictable in Windows terminals
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  throw "mkcert is not installed. Run: winget install FiloSottile.mkcert"
}

$certDir = Join-Path $PSScriptRoot "..\nginx\certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "Generating mkcert certificates into: $certDir"

# NOTE: apex + wildcard — the wildcard covers every one-level subdomain
# (game-client, web-client, game-server, web-server, build, ...), so adding
# a new subdomain to nginx never requires touching this script again.
mkcert `
  -cert-file (Join-Path $certDir "shatteredarchive.dev.pem") `
  -key-file  (Join-Path $certDir "shatteredarchive.dev-key.pem") `
  "shatteredarchive.dev" `
  "*.shatteredarchive.dev"

Write-Host "Certificates generated successfully."
