import { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const statusCandidate =
    err && typeof err === 'object'
      ? Number((err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode)
      : NaN;
  const status = Number.isInteger(statusCandidate) && statusCandidate >= 400 && statusCandidate < 600
    ? statusCandidate
    : 500;
  console.error('[CivicSense API Error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}
