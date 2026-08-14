#!/bin/sh
# generate-master-key.sh — thin shell wrapper around the real (pure Node)
# implementation in generate-master-key.cjs, kept for people already in a
# POSIX shell. The pnpm entry point calls the .cjs directly because `bash` on
# a Windows host may be a WSL relay stub with no distro behind it.
exec node "$(dirname "$0")/generate-master-key.cjs" "$@"
