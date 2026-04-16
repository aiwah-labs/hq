module.exports = {
  apps: [
    {
      name: 'aiwah-workshop',
      cwd: '/var/www/aiwah-hq/apps/workshop',
      script: 'pnpm',
      args: 'start',
      env_file: '/var/www/aiwah-hq/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
