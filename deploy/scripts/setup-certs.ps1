#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# Optional: make output predictable in Windows terminals
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  throw "mkcert is not installed. Run: winget install FiloSottile.mkcert"
}

$certDir = Join-Path $PSScriptRoot "..\nginx\certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "Generating mkcert certificates into: $certDir"

# NOTE: .dev and subdomains
mkcert `
  -cert-file (Join-Path $certDir "shatteredarchive.dev.pem") `
  -key-file  (Join-Path $certDir "shatteredarchive.dev-key.pem") `
  "shatteredarchive.dev" `
  "game-client.shatteredarchive.dev" `
  "web-client.shatteredarchive.dev" `
  "game-server.shatteredarchive.dev" `
  "web-server.shatteredarchive.dev"

Write-Host "Certificates generated successfully."
