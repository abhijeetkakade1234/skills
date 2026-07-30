# Feature: auth (frontend)

Access token in memory only (never `localStorage`/`sessionStorage` — XSS-readable storage of
a bearer token is a common finding in `jwt-cryptography-audit`). Refresh token lives in the
httpOnly cookie the API set; this code never touches it directly.

## `src/features/auth/auth-store.ts`

```ts
type User = { id: string; email: string; name: string; role: 'user' | 'editor' | 'admin' };
type AuthState = { user: User | null; accessToken: string | null };

let state: AuthState = { user: null, accessToken: null };
const listeners = new Set<() => void>();

export function getAuthState() {
  return state;
}
export function setAuthState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export function clearAuthState() {
  setAuthState({ user: null, accessToken: null });
}
export function subscribeAuthState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

## `src/features/auth/useAuth.ts`

```ts
import { useSyncExternalStore } from 'react';
import { getAuthState, subscribeAuthState } from './auth-store';

export function useAuth() {
  return useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState);
}
```

## `src/features/auth/api-client.ts`

Every API call goes through this — no component calls `fetch` directly, so the auth header,
envelope unwrapping, and 401-refresh-retry-once logic stay in one place instead of being
reimplemented (inconsistently) per feature.

```ts
import { getAuthState, setAuthState, clearAuthState } from './auth-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Coalesce concurrent 401s into a single refresh call instead of one per failed request.
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      const body = (await res.json()) as Envelope<{ accessToken: string }>;
      if (!res.ok || !body.success) return false;
      setAuthState({ accessToken: body.data.accessToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const { accessToken } = getAuthState();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, init, true);
    clearAuthState();
  }

  const body = (await res.json()) as Envelope<T>;
  if (!body.success) throw new ApiClientError(body.error.code, body.error.message, res.status);
  return body.data;
}
```

## Usage pattern (login form → TanStack mutation → toast)

```tsx
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from './api-client';
import { setAuthState } from './auth-store';

function useLogin() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiFetch<{ accessToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setAuthState({ accessToken: data.accessToken, user: data.user });
      toast.success('Logged in');
    },
    // No onError needed here — query-client.ts's global MutationCache handler already
    // toasts ApiClientError.message. Add one only if this specific call needs a different
    // message than the server's.
  });
}
```
