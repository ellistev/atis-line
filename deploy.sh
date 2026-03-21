#!/bin/bash
# Deploy atis-line to Hetzner (178.156.208.66)
# Usage: bash deploy.sh
# Requirements: git must be clean and pushed before deploying

set -e

SSH="ssh -i ~/.ssh/clawbothetnzer root@178.156.208.66"
REMOTE_DIR="/opt/atis-line"

echo "==> Checking local git status..."
if [[ -n $(git status --porcelain) ]]; then
  echo "ERROR: Uncommitted changes. Commit and push first."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: Not on main branch (on $BRANCH). Deploy from main only."
  exit 1
fi

echo "==> Pushing to origin..."
git push origin main

echo "==> Deploying to Hetzner..."
$SSH "cd $REMOTE_DIR && git pull && npm install --omit=dev && pm2 restart atis-line"

echo "==> Waiting for server..."
sleep 3

echo "==> Health check..."
curl -sf https://atis.checkonmom.ca/health | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const ok = Object.values(d.airports).filter(a => a.status === 'available').length;
  console.log('Status:', d.status, '| Airports up:', ok + '/' + Object.keys(d.airports).length);
  process.exit(d.status === 'ok' || d.status === 'degraded' ? 0 : 1);
"

echo "==> Done. https://atis.checkonmom.ca/health"
