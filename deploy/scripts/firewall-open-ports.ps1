param(
  [string]$Mode = "prod" # prod|dev|all
)

$Project = "ShatteredArchive"

# prod = nginx entry only
$prodPorts = @(80, 443)

# dev = expose Vite UIs on LAN (optional)
$devPorts = @(30080, 40080)

# all = everything (usually NOT recommended)
$allPorts = @(80, 443, 30080, 31000, 40080, 41000)

switch ($Mode) {
  "prod" { $ports = $prodPorts }
  "dev"  { $ports = $devPorts }
  "all"  { $ports = $allPorts }
  default {
    Write-Host "Unknown Mode '$Mode' (expected prod|dev|all)"
    exit 1
  }
}

foreach ($port in $ports) {
  $ruleName = "$Project $Mode TCP $port"

  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Host "Adding firewall rule: $ruleName"
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Direction Inbound `
      -Protocol TCP `
      -LocalPort $port `
      -Action Allow `
      -Profile Private | Out-Null
  } else {
    Write-Host "Firewall rule already exists: $ruleName"
  }
}
