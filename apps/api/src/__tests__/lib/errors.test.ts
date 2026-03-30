import { describe, it, expect } from 'vitest';
import { ApiError, inferStatusFromError, inferCodeFromStatus } from '../../lib/errors.js';

// ── ApiError ─────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('stores statusCode, code, and message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Resource not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
    expect(err.name).toBe('ApiError');
  });

  it('stores optional details', () => {
    const details = { field: 'email', issue: 'invalid' };
    const err = new ApiError(400, 'BAD_REQUEST', 'Validation failed', details);
    expect(err.details).toEqual(details);
  });

  it('extends Error', () => {
    const err = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
    expect(err instanceof Error).toBe(true);
  });
});

// ── inferStatusFromError ─────────────────────────────────────────────────────

describe('inferStatusFromError', () => {
  it('returns statusCode from ApiError', () => {
    expect(inferStatusFromError(new ApiError(403, 'FORBIDDEN', 'No access'))).toBe(403);
  });

  it('returns 403 for "forbidden" in message', () => {
    expect(inferStatusFromError(new Error('forbidden operation'))).toBe(403);
  });

  it('returns 403 for "permission" in message', () => {
    expect(inferStatusFromError(new Error('missing permission'))).toBe(403);
  });

  it('returns 404 for "not found" in message', () => {
    expect(inferStatusFromError(new Error('Note not found.'))).toBe(404);
  });

  it('returns 400 for "invalid" in message', () => {
    expect(inferStatusFromError(new Error('Invalid input'))).toBe(400);
  });

  it('returns 400 for "required" in message', () => {
    expect(inferStatusFromError(new Error('Field required'))).toBe(400);
  });

  it('returns 400 for "failed" in message', () => {
    expect(inferStatusFromError(new Error('Validation failed'))).toBe(400);
  });

  it('returns 500 for unknown errors', () => {
    expect(inferStatusFromError(new Error('Something unexpected'))).toBe(500);
  });

  it('returns 500 for non-Error values', () => {
    expect(inferStatusFromError('string error')).toBe(500);
    expect(inferStatusFromError(42)).toBe(500);
    expect(inferStatusFromError(null)).toBe(500);
  });
});

// ── inferCodeFromStatus ──────────────────────────────────────────────────────

describe('inferCodeFromStatus', () => {
  it('maps 400 to BAD_REQUEST', () => {
    expect(inferCodeFromStatus(400)).toBe('BAD_REQUEST');
  });

  it('maps 401 to UNAUTHENTICATED', () => {
    expect(inferCodeFromStatus(401)).toBe('UNAUTHENTICATED');
  });

  it('maps 403 to FORBIDDEN', () => {
    expect(inferCodeFromStatus(403)).toBe('FORBIDDEN');
  });

  it('maps 404 to NOT_FOUND', () => {
    expect(inferCodeFromStatus(404)).toBe('NOT_FOUND');
  });

  it('maps 429 to RATE_LIMITED', () => {
    expect(inferCodeFromStatus(429)).toBe('RATE_LIMITED');
  });

  it('maps 500 to INTERNAL_ERROR', () => {
    expect(inferCodeFromStatus(500)).toBe('INTERNAL_ERROR');
  });

  it('defaults unknown codes to INTERNAL_ERROR', () => {
    expect(inferCodeFromStatus(502)).toBe('INTERNAL_ERROR');
    expect(inferCodeFromStatus(418)).toBe('INTERNAL_ERROR');
  });
});
