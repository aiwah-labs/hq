import path from 'path';

const ENV_FILES = [
  '.env.local',
  '../../.env.local',
  '.env',
  '../../.env',
];

export function loadMcpEnv() {
  for (const relativePath of ENV_FILES) {
    try {
      process.loadEnvFile(path.resolve(process.cwd(), relativePath));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
}
