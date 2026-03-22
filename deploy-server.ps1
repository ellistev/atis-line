# Quick deploy to Hetzner - run after merging PRs
ssh -i ~/.ssh/clawbothetnzer root@178.156.208.66 "cd /var/www/atis-line && git pull origin main && npm install --omit=dev && pm2 restart atis-line && echo 'Deployed!'"
