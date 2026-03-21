#!/bin/bash
# Deploy atis-line to production (178.156.208.66)
# Usage: bash deploy.sh
# Run from the atis-line directory on your local machine.

set -e

SERVER="root@178.156.208.66"
SSH_KEY="$HOME/.ssh/clawbothetnzer"
DEPLOY_DIR="/var/www/atis-line"

echo "==> Deploying atis-line to production..."

# Run tests first
echo "==> Running tests..."
npm test
echo "==> Tests passed."

# Push to GitHub
echo "==> Pushing to GitHub..."
git push origin main

# Deploy on server
echo "==> Pulling on server and restarting..."
ssh -i "$SSH_KEY" "$SERVER" "
  set -e
  cd $DEPLOY_DIR
  git pull origin main
  npm install --omit=dev
  pm2 restart atis-line --update-env
  pm2 save
  echo 'Deploy complete'
"

echo "==> Verifying health..."
sleep 5
curl -sf https://atis.checkonmom.ca/health | python3 -m json.tool 2>/dev/null || curl -s https://atis.checkonmom.ca/health

echo "==> Done! atis-line is live at https://atis.checkonmom.ca"
