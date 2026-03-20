module.exports = {
  apps: [{
    name: 'planning-board',
    cwd: __dirname,
    script: 'npm.cmd',
    args: 'start',
    interpreter: 'none',
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
  }]
}
