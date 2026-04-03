// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { ApiClientError } from '@hq/api-client';

export function asText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function toMcpError(error: unknown): Error {
  if (error instanceof ApiClientError) {
    return new Error(`[${error.status}/${error.code}] ${error.message}`);
  }
  if (error instanceof Error) return error;
  return new Error('Unknown error.');
}
