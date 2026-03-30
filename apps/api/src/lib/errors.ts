export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function inferStatusFromError(error: unknown): number {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  if (!(error instanceof Error)) {
    return 500;
  }

  const message = error.message.toLowerCase();
  if (message.includes('forbidden') || message.includes('permission')) {
    return 403;
  }

  if (message.includes('not found')) {
    return 404;
  }

  if (message.includes('invalid') || message.includes('required') || message.includes('failed')) {
    return 400;
  }

  return 500;
}

export function inferCodeFromStatus(statusCode: number): string {
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 401) return 'UNAUTHENTICATED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}
