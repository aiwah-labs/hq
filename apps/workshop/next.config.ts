import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const config: NextConfig = {
  transpilePackages: [
    '@hq/db',
    '@hq/auth',
    '@hq/api-client',
    '@hq/services',
    '@hq/objects',
    '@hq/actions',
    '@hq/files',
    '@hq/integrations',
    '@hq/jobs',
    '@hq/storage',
    '@hq/agents',
    '@hq/workflows',
    '@hq/events',
  ],
  webpack(webpackConfig: Configuration) {
    // Monorepo packages use NodeNext moduleResolution which emits .js imports
    // pointing at .ts source files. Tell webpack to resolve .js → .ts/.tsx.
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return webpackConfig;
  },
};
export default config;
