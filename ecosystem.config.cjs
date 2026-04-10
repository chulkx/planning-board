module.exports = {
  apps: [{
    name: 'planning-board',
    cwd: __dirname,
    script: 'npm.cmd',
    args: 'start',
    interpreter: 'none',
    exec_mode: 'fork',
    // Reinicio automático si el proceso usa más de 300MB
    max_memory_restart: '300M',
    // Reintentos con back-off exponencial
    exp_backoff_restart_delay: 100,
    // Logs
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: 'production',
    },
  }]
}
