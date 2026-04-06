module.exports = {
  apps: [
    {
      name: 'bunjang-cloud',
      script: 'npx',
      args: 'wrangler pages dev dist --kv=MONITOR_KV --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
