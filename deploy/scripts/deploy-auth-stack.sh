#!/usr/bin/env bash
#
# Idempotent deployment for the auth hub + the C# site that consumes it.
#
# Everything this used to require a human for is now done by the services themselves:
#   - the C# site GENERATES its own Ed25519 keypair on first boot and publishes the
#     PUBLIC half into the shared sa-service-pubkeys volume (ServiceKeyProvisioner)
#   - auth-server SCANS that volume and registers what it finds, and reconciles each
#     service's SSO redirect URIs from its declarative SERVICE_REGISTRY, at boot and
#     every 30s thereafter (service-registry-reconciler.ts)
#
# So there is no register-service, no copying a printed private key between hosts, and
# no register-redirect-uri. Re-running this script is safe: existing keys are reused,
# never regenerated, and a converged registry produces no writes.
#
# Usage:
#   deploy-auth-stack.sh [--prod|--local] [--build] [--no-verify]
#
set -euo pipefail

MODE="prod"
DO_BUILD=0
DO_VERIFY=1
# --prebuilt: the C# publish output was produced elsewhere and uploaded (the current
# real workflow — publish on a dev box, zip, copy to the server). The docker image is
# still rebuilt so the uploaded output actually gets baked in; only `dotnet publish` is
# skipped. Without this, --build on a host with no .NET SDK just warns and ships
# whatever output is already there.
DO_DOTNET=1

while [ $# -gt 0 ]; do
  case "$1" in
    --prod)       MODE="prod" ;;
    --local)      MODE="local" ;;
    --build)      DO_BUILD=1 ;;
    --prebuilt)   DO_DOTNET=0 ;;
    --no-verify)  DO_VERIFY=0 ;;
    -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# Resolve repo roots from THIS script's location rather than the caller's cwd, so the
# script works from anywhere (and so a stray `cd` cannot silently retarget a deploy).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SA_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DSL_ROOT="${DSL_ROOT:-$(cd "$SA_ROOT/../DSL" 2>/dev/null && pwd || true)}"

if [ "$MODE" = "prod" ]; then
  SA_COMPOSE="$SA_ROOT/deploy/docker-compose.yml"
  DSL_COMPOSE="${DSL_ROOT:-}/Server/docker-compose-prod.yml"
else
  SA_COMPOSE="$SA_ROOT/deploy/docker-compose.shattered-archive-experimental.yml"
  DSL_COMPOSE="${DSL_ROOT:-}/Server/docker-compose.yml"
fi

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWARN: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$SA_COMPOSE" ] || die "compose file not found: $SA_COMPOSE"
if [ -z "${DSL_ROOT:-}" ] || [ ! -f "$DSL_COMPOSE" ]; then
  warn "DSL compose not found (looked for ${DSL_COMPOSE:-<unset>}). Deploying the hub only."
  warn "Set DSL_ROOT=/path/to/DSL to deploy the C# site in the same run."
  DSL_COMPOSE=""
fi

# ---------------------------------------------------------------------------
# 1. Pre-flight: the redirect URIs the hub will accept must EXACTLY equal the ones
#    the C# site sends. /api/sso/approve matches byte-for-byte and answers a single
#    generic 400 for both "unknown service" and "unregistered redirect URI", so a
#    mismatch here is invisible at runtime and costs an afternoon. Cheap to check,
#    so it is checked every deploy.
# ---------------------------------------------------------------------------
preflight_redirect_uris() {
  [ -n "$DSL_COMPOSE" ] || return 0
  command -v node >/dev/null 2>&1 || { warn "node not found — skipping redirect-URI consistency check"; return 0; }

  local sa_json dsl_json
  sa_json="$(docker compose -f "$SA_COMPOSE" config --format json 2>/dev/null)" || {
    warn "could not render $SA_COMPOSE — skipping consistency check"; return 0; }
  dsl_json="$(docker compose -f "$DSL_COMPOSE" config --format json 2>/dev/null)" || {
    warn "could not render $DSL_COMPOSE — skipping consistency check"; return 0; }

  SA_JSON="$sa_json" DSL_JSON="$dsl_json" node -e '
    const sa = JSON.parse(process.env.SA_JSON);
    const dsl = JSON.parse(process.env.DSL_JSON);
    const authEnv = (sa.services["auth-server"] || {}).environment || {};
    const siteEnv = (dsl.services["shatteredarchive-csharp"] || {}).environment || {};

    const raw = authEnv.SERVICE_REGISTRY;
    if (!raw || !raw.trim()) {
      console.error("SERVICE_REGISTRY is unset on auth-server. The reconciler will SKIP entirely (by design), so nothing gets registered.");
      process.exit(1);
    }
    let registry;
    try { registry = JSON.parse(raw); }
    catch (e) { console.error("SERVICE_REGISTRY is not valid JSON: " + e.message); process.exit(1); }

    const declared = new Set((registry["shattered-web"] || {}).redirectUris || []);
    const required = [siteEnv.AuthHub__RedirectUri, siteEnv.GameSso__CallbackRedirectUri].filter(Boolean);
    const missing = required.filter((u) => !declared.has(u));

    if (missing.length) {
      console.error("Redirect URI mismatch — the C# site sends these, but auth-server does not declare them:");
      for (const u of missing) console.error("  MISSING: " + JSON.stringify(u));
      console.error("Declared in SERVICE_REGISTRY:");
      for (const u of declared) console.error("  - " + JSON.stringify(u));
      console.error("These are matched byte-for-byte; a trailing slash or scheme difference counts as a mismatch.");
      process.exit(1);
    }
    console.log("redirect URIs agree across both compose files (" + required.length + " checked)");
  ' || die "pre-flight failed — fix the compose files before deploying (nothing has been changed)"
}

# ---------------------------------------------------------------------------
# 2. Bring up the hub stack FIRST. It owns both shared resources the C# stack
#    declares as external (the sa-shared network and the sa-service-pubkeys volume),
#    and `docker compose up` fails outright against ones that do not exist yet.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Refuse --prod on a machine already running the experimental stack.
#
# Both compose files BIND-MOUNT the same host directory (../apps/auth-server/data) but
# each takes its encryption key from its OWN project-scoped volume
# (shatteredarchive_auth-server-secrets vs shatteredarchive-prod_auth-server-secrets).
# Start the second stack on one host and its auth-server reads data encrypted under the
# other stack's key, fails the AES-GCM auth tag, and LOCKS the store:
#   "cannot read .../auth-accounts.json (Unsupported state or unable to authenticate
#    data) — store LOCKED until fixed or removed on the host"
#
# Nothing is lost when that happens (read() locks and throws; write() refuses while
# locked, so the files are never rewritten) but login is down until the intruding stack
# is stopped. On a REAL production host only one stack exists and this cannot occur —
# it is purely a dev-replica hazard, and one this script caused before the guard existed.
# ---------------------------------------------------------------------------
preflight_stack_collision() {
  [ "$MODE" = "prod" ] || return 0
  command -v docker >/dev/null 2>&1 || return 0

  local running
  running="$(docker ps --filter 'name=shatteredarchive-auth-server' --format '{{.Names}}' 2>/dev/null || true)"
  [ -n "$running" ] || return 0

  die "$(cat <<MSG
the EXPERIMENTAL auth stack is running on this host ($running).

Both stacks bind-mount the same apps/auth-server/data but use different encryption keys,
so starting the prod stack here would lock that store and take login down until stopped.
Your data would not be damaged, only unreadable by the wrong stack.

Use --local on this machine, or stop the experimental stack first:
  docker compose -f deploy/docker-compose.shattered-archive-experimental.yml stop auth-server
MSG
)"
}

log "Pre-flight checks"
preflight_stack_collision
preflight_redirect_uris

log "Deploying auth hub stack ($MODE)"
if [ "$DO_BUILD" -eq 1 ]; then
  docker compose -f "$SA_COMPOSE" build auth-server auth-client
fi
docker compose -f "$SA_COMPOSE" up -d auth-server auth-client

if [ -n "$DSL_COMPOSE" ]; then
  if [ "$DO_BUILD" -eq 1 ]; then
    # The C# image does NOT build from source: both Dockerfiles COPY a prebuilt
    # publish output from the build context (Dockerfile-Prod copies ./net8.0,
    # Server.Web.Public/Dockerfile copies Server.Web.Public/bin/Release/net8.0/).
    # So `docker compose build` alone silently ships whatever output happens to be
    # sitting there — which is exactly how a code change can appear to deploy and
    # not take effect. Produce the output here so --build genuinely means "build".
    if [ "$DO_DOTNET" -eq 0 ]; then
      log "Using the prebuilt C# publish output already in the build context (--prebuilt)"
      if [ "$MODE" = "prod" ] && [ ! -d "$DSL_ROOT/Server/net8.0" ]; then
        die "--prebuilt was passed but $DSL_ROOT/Server/net8.0 does not exist — upload the publish output first"
      fi
    elif command -v dotnet >/dev/null 2>&1; then
      if [ "$MODE" = "prod" ]; then
        PUBLISH_DIR="$DSL_ROOT/Server/net8.0"
      else
        PUBLISH_DIR="$DSL_ROOT/Server/Server.Web.Public/bin/Release/net8.0"
      fi
      log "Publishing C# site (Release) -> $PUBLISH_DIR"
      dotnet publish "$DSL_ROOT/Server/Server.Web.Public/Server.Web.Public.csproj" \
        -c Release -o "$PUBLISH_DIR" --nologo -v q
    else
      warn "dotnet SDK not found on this host."
      warn "The C# image copies a PREBUILT publish output, so the image will ship whatever"
      warn "is already in the build context — possibly stale code. Either install the SDK"
      warn "here, or publish elsewhere and upload the output before running this."
    fi
    docker compose -f "$DSL_COMPOSE" build shatteredarchive-csharp
  fi

  log "Deploying C# site"
  docker compose -f "$DSL_COMPOSE" up -d shatteredarchive-csharp
fi

# ---------------------------------------------------------------------------
# 3. Verify convergence. The C# site publishes its key at startup and the hub picks
#    it up on its next 30s pass, so a freshly-started pair needs a moment — this
#    polls rather than asserting immediately.
# ---------------------------------------------------------------------------
if [ "$DO_VERIFY" -eq 1 ]; then
  log "Waiting for the hub to register the site's published key"

  AUTH_CONTAINER="$(docker compose -f "$SA_COMPOSE" ps -q auth-server 2>/dev/null || true)"
  if [ -z "$AUTH_CONTAINER" ]; then
    warn "could not resolve the auth-server container — skipping verification"
    exit 0
  fi

  deadline=$(( $(date +%s) + 90 ))
  registered=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if docker exec "$AUTH_CONTAINER" sh -c 'ls /repo/apps/auth-server/service-public-keys/*.pub' >/dev/null 2>&1 \
       && docker logs "$AUTH_CONTAINER" 2>&1 | grep -q "Service registry"; then
      registered=1
      break
    fi
    sleep 5
  done

  if [ "$registered" -eq 1 ]; then
    log "Converged. Published keys and recent registry activity:"
    docker exec "$AUTH_CONTAINER" sh -c 'ls -1 /repo/apps/auth-server/service-public-keys/' || true
    docker logs "$AUTH_CONTAINER" 2>&1 | grep "Service registry" | tail -10 || true
  else
    warn "No registration observed within 90s."
    warn "Check, in order:"
    warn "  1. docker logs <csharp> | grep -i 'public key'   (did the site publish?)"
    warn "  2. docker logs <auth-server> | grep -i 'registry' (did the hub skip, and why?)"
    warn "  3. that both stacks mount the SAME sa-service-pubkeys volume"
    exit 1
  fi
fi

log "Done. No manual key or redirect-URI steps were required."
