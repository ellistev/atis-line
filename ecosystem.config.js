module.exports = {
  apps: [{
    name: 'atis-line',
    script: 'server.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    kill_timeout: 5000,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3338,
    },
    // Log rotation
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    max_size: '10M',
    retain: 5,
    // Restart policy
    exp_backoff_restart_delay: 1000,
    max_restarts: 50,
    restart_delay: 5000,
  }],
};
