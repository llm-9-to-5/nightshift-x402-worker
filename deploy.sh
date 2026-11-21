#!/bin/bash
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in env.
set -e; cd "$(dirname "$0")"; npx wrangler deploy 2>&1 | tail -15
