#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"

$begin = "# BEGIN ShatteredArchive"
$end   = "# END ShatteredArchive"

$hosts = Get-Content -LiteralPath $hostsPath -Raw

# Remove the marked block (including trailing newline after END if present)
$pattern = [regex]::Escape($begin) + ".*?" + [regex]::Escape($end) + "\r?\n?"
$updated = [regex]::Replace($hosts, $pattern, "", "Singleline")

# Write back (preserve ASCII compatibility for hosts file)
Set-Content -LiteralPath $hostsPath -Value $updated -Encoding ASCII

Write-Host "✅ Removed ShatteredArchive hosts block (if present) from $hostsPath"
