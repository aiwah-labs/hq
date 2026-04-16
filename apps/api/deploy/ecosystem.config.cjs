module.exports = {
  apps: [
    {
      name: 'aiwah-api',
      cwd: '/var/www/aiwah-hq/apps/api',
      script: 'pnpm',
      args: 'start',
      env_file: '/var/www/aiwah-hq/.env',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3003,
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
