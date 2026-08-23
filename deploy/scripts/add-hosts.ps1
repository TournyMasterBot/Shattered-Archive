#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"

$entries = @(
  "127.0.0.1 shatteredarchive.dev",
  "127.0.0.1 game-client.shatteredarchive.dev",
  "127.0.0.1 game-server.shatteredarchive.dev",
  "127.0.0.1 web-client.shatteredarchive.dev",
  "127.0.0.1 web-server.shatteredarchive.dev",
  "127.0.0.1 build.shatteredarchive.dev",
  "127.0.0.1 auth.shatteredarchive.dev",
  "127.0.0.1 kingdom-tactics.shatteredarchive.dev",
  "127.0.0.1 scrum-poker.shatteredarchive.dev",
  "127.0.0.1 soulsteel.shatteredarchive.dev",
  "127.0.0.1 simulacrum.shatteredarchive.dev"
)

$begin = "# BEGIN ShatteredArchive"
$end   = "# END ShatteredArchive"

$hosts = Get-Content -LiteralPath $hostsPath -Raw

# Remove previous block if present
$pattern = [regex]::Escape($begin) + ".*?" + [regex]::Escape($end) + "\r?\n?"
$hosts = [regex]::Replace($hosts, $pattern, "", "Singleline")

$block = $begin + "`r`n" + ($entries -join "`r`n") + "`r`n" + $end + "`r`n"

# Ensure trailing newline then append
if (-not $hosts.EndsWith("`r`n") -and -not $hosts.EndsWith("`n")) { $hosts += "`r`n" }
Set-Content -LiteralPath $hostsPath -Value ($hosts + $block) -Encoding ASCII

Write-Host "✅ Updated hosts file at $hostsPath"
Write-Host $block
