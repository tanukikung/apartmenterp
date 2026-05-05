module.exports = {
  apps: [{
    name: 'apartment-erp',
    script: '.next/standalone/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    wait_ready: true,
    listen_timeout: 10000,
    shutdown_timeout: 30000,
    max_memory_restart: '1G',
    // Graceful shutdown for cron, outbox, inbox
    kill_timeout: 5000,
  }],
};
