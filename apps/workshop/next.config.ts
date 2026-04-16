import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@hq/db', '@hq/auth', '@hq/api-client'] };
export default config;
