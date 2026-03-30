// Test environment setup
// Sets env vars required by some modules before any tests run.

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.INTERNAL_APP_SHARED_SECRET = 'test-internal-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.API_KEY_PEPPER = 'test-pepper';
