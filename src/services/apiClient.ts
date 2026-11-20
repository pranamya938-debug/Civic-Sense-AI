import { auth } from './firebaseClient';

const TOKEN_KEY = 'civicsense_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { tokenOverride?: string } = {}
): Promise<T> {
  const { tokenOverride, headers, ...rest } = options;
  let token = tokenOverride ?? null;
  if (!token && auth?.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
      setStoredToken(token);
    } catch {
      token = getStoredToken();
    }
  }
  if (!token) {
    token = getStoredToken();
  }

  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (token) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...rest,
    headers: mergedHeaders,
  });

  const rawText = await response.text();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const trimmed = rawText.trim();

  let payload: unknown = null;
  if (trimmed.length > 0 && (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      payload = JSON.parse(trimmed);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const parsedError =
      payload !== null &&
      typeof payload === 'object' &&
      'error' in payload &&
      (payload as Record<string, unknown>).error != null
        ? String((payload as Record<string, unknown>).error)
        : '';
    const fallbackText =
      trimmed && !trimmed.startsWith('<!') && !trimmed.startsWith('<html')
        ? trimmed.slice(0, 200)
        : '';
    const errMsg: string = parsedError || fallbackText || `Request failed (${response.status})`;
    throw new Error(errMsg);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(
      `Unexpected non-JSON or empty response from ${path} (HTTP ${response.status}).`
    );
  }

  return payload as T;
}
