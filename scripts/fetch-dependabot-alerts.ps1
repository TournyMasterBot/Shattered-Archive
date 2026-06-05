<#
.SYNOPSIS
    Fetches open Dependabot security alerts for Shattered-Archive via the GitHub GraphQL API.

.DESCRIPTION
    Writes a JSON file and a markdown summary into .security-updates/ in the repo root.
    The token is never stored — it is read from $env:GH_DEPENDABOT_TOKEN or prompted
    securely at runtime.

    See docs/github/dependabot-alerts-token.md for token setup instructions.

.EXAMPLE
    # Interactive — prompts for token
    .\scripts\fetch-dependabot-alerts.ps1

.EXAMPLE
    # Non-interactive — token in current session only
    $env:GH_DEPENDABOT_TOKEN = "<token>"; .\scripts\fetch-dependabot-alerts.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
$Owner    = "TournyMasterBot"
$RepoName = "Shattered-Archive"
$Endpoint = "https://api.github.com/graphql"
$OutDir   = Join-Path $PSScriptRoot "..\\.security-updates"

# ---------------------------------------------------------------------------
# Resolve token — env var first, then secure prompt
# ---------------------------------------------------------------------------
$plainToken = $env:GH_DEPENDABOT_TOKEN

if (-not $plainToken) {
    $secure     = Read-Host -Prompt "GitHub token (security_events scope)" -AsSecureString
    $plainToken = [System.Net.NetworkCredential]::new("", $secure).Password
    $secure.Dispose()
}

if (-not $plainToken) {
    Write-Error "No token supplied. Aborting."
    exit 1
}

# ---------------------------------------------------------------------------
# GraphQL query (paginated)
# ---------------------------------------------------------------------------
$graphqlQuery = @'
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    vulnerabilityAlerts(first: 100, states: [OPEN], after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        state
        dependencyScope
        vulnerableManifestPath
        vulnerableRequirements
        securityVulnerability {
          severity
          package {
            name
            ecosystem
          }
          vulnerableVersionRange
          firstPatchedVersion {
            identifier
          }
        }
        securityAdvisory {
          summary
          description
          cvss {
            score
          }
          identifiers {
            type
            value
          }
          publishedAt
        }
      }
    }
  }
}
'@

# ---------------------------------------------------------------------------
# Fetch all pages
# ---------------------------------------------------------------------------
$headers = @{
    Authorization = "Bearer $plainToken"
    "Content-Type" = "application/json"
    "User-Agent"   = "Shattered-Archive/security-audit-script"
}

# Clear plaintext token from memory as soon as headers are built
$plainToken = $null
[System.GC]::Collect()

$allAlerts = [System.Collections.Generic.List[object]]::new()
$cursor    = $null
$page      = 0

Write-Host "Fetching Dependabot alerts for $Owner/$RepoName..."

do {
    $page++
    $variables = @{ owner = $Owner; name = $RepoName }
    if ($cursor) { $variables["after"] = $cursor }

    $body = @{
        query     = $graphqlQuery
        variables = $variables
    } | ConvertTo-Json -Compress -Depth 5

    try {
        $response = Invoke-RestMethod -Uri $Endpoint -Method POST -Headers $headers -Body $body
    } catch {
        Write-Error "GraphQL request failed (page $page): $_"
        exit 1
    }

    if ($response.PSObject.Properties['errors']) {
        $errText = $response.errors | ConvertTo-Json -Depth 5
        Write-Error "GraphQL errors on page ${page}:`n$errText"
        exit 1
    }

    $pageData  = $response.data.repository.vulnerabilityAlerts
    $pageNodes = $pageData.nodes

    if ($pageNodes -and $pageNodes.Count -gt 0) {
        foreach ($node in $pageNodes) { $allAlerts.Add($node) }
    }

    $hasNextPage = $pageData.pageInfo.hasNextPage
    $cursor      = $pageData.pageInfo.endCursor

    Write-Host "  Page $page - $($pageNodes.Count) alerts (total so far: $($allAlerts.Count))"

} while ($hasNextPage)

# Clear headers (contains auth token)
$headers = $null
[System.GC]::Collect()

Write-Host "Total open alerts: $($allAlerts.Count)"

# ---------------------------------------------------------------------------
# Write output files
# ---------------------------------------------------------------------------
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

# Raw JSON
$jsonPath = Join-Path $OutDir "alerts-$timestamp.json"
$allAlerts | ConvertTo-Json -Depth 20 | Out-File -FilePath $jsonPath -Encoding utf8
Write-Host "JSON written: $jsonPath"

# Markdown summary
$severityOrder = @{ CRITICAL = 0; HIGH = 1; MODERATE = 2; LOW = 3 }

$sortedAlerts = $allAlerts | Sort-Object {
    $sev = $_.securityVulnerability.severity
    if ($severityOrder.ContainsKey($sev)) { $severityOrder[$sev] } else { 99 }
}

$mdLines = [System.Collections.Generic.List[string]]::new()
$mdLines.Add("# Dependabot Alert Summary")
$mdLines.Add("")
$mdLines.Add("**Repository:** $Owner/$RepoName")
$mdLines.Add("**Fetched:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$mdLines.Add("**Total open alerts:** $($allAlerts.Count)")
$mdLines.Add("")

# Severity counts
$counts = $allAlerts | Group-Object { $_.securityVulnerability.severity }
$mdLines.Add("## Counts by Severity")
$mdLines.Add("")
$mdLines.Add("| Severity | Count |")
$mdLines.Add("|---|---|")
foreach ($sev in @("CRITICAL", "HIGH", "MODERATE", "LOW")) {
    $cnt = ($counts | Where-Object Name -eq $sev | Select-Object -ExpandProperty Count -ErrorAction SilentlyContinue)
    if (-not $cnt) { $cnt = 0 }
    $mdLines.Add("| $sev | $cnt |")
}
$mdLines.Add("")

# Alert detail grouped by severity
foreach ($sev in @("CRITICAL", "HIGH", "MODERATE", "LOW")) {
    $group = $sortedAlerts | Where-Object { $_.securityVulnerability.severity -eq $sev }
    if (-not $group) { continue }

    $mdLines.Add("## $sev")
    $mdLines.Add("")

    foreach ($alert in $group) {
        $vuln    = $alert.securityVulnerability
        $pkg     = $vuln.package
        $advisory = $alert.securityAdvisory
        $ids     = $advisory.identifiers | ForEach-Object { "$($_.type): $($_.value)" }
        if ($ids) { $idStr = $ids -join ", " } else { $idStr = "N/A" }
        if ($vuln.firstPatchedVersion) { $fixVer = $vuln.firstPatchedVersion.identifier } else { $fixVer = "No fix available" }
        if ($advisory.cvss -and $advisory.cvss.score) { $cvss = $advisory.cvss.score } else { $cvss = "N/A" }
        if ($alert.dependencyScope) { $scope = $alert.dependencyScope } else { $scope = "N/A" }

        $mdLines.Add("### Alert #$($alert.number) - $($pkg.name) ($($pkg.ecosystem))")
        $mdLines.Add("")
        $mdLines.Add("| Field | Value |")
        $mdLines.Add("|---|---|")
        $mdLines.Add("| **Package** | ``$($pkg.name)`` |")
        $mdLines.Add("| **Ecosystem** | $($pkg.ecosystem) |")
        $mdLines.Add("| **Vulnerable range** | ``$($vuln.vulnerableVersionRange)`` |")
        $mdLines.Add("| **Fix version** | ``$fixVer`` |")
        $mdLines.Add("| **CVSS score** | $cvss |")
        $mdLines.Add("| **Scope** | $scope |")
        $mdLines.Add("| **Manifest** | ``$($alert.vulnerableManifestPath)`` |")
        $mdLines.Add("| **Identifiers** | $idStr |")
        $mdLines.Add("")
        $mdLines.Add("> $($advisory.summary)")
        $mdLines.Add("")
    }
}

$mdPath = Join-Path $OutDir "summary-$timestamp.md"
$mdLines | Out-File -FilePath $mdPath -Encoding utf8
Write-Host "Summary written: $mdPath"

# ---------------------------------------------------------------------------
# Console summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Severity breakdown:"
foreach ($sev in @("CRITICAL", "HIGH", "MODERATE", "LOW")) {
    $cnt = @($allAlerts | Where-Object { $_.securityVulnerability.severity -eq $sev }).Count
    if ($cnt -gt 0) {
        Write-Host "  ${sev}: $cnt"
    }
}
Write-Host ""
Write-Host "Done. Review .security-updates/ to plan remediation."
