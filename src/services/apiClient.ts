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

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const errMsg =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      `Request failed (${response.status})`;
    throw new Error(errMsg);
  }

  return payload as T;
}
