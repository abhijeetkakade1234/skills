# Feature: admin (obscured route)

Read [`../../../reference/architecture.md`](../../../reference/architecture.md#admin-route-obscurity--what-it-buys-and-what-it-doesnt)
first. Summary: the path being non-guessable and the bundle being code-split are UX/deterrent
properties. The actual gate is server-side (`api/features/rbac/middleware.ts`'s
`requireRole('admin')`), and it runs on every admin API call regardless of how this frontend
route was reached.

## `src/features/admin/admin-path.ts`

Single source of truth for the path — must match the static mount in the API repo's
`src/index.ts` (see `api/features/rbac/README.md`). Generate an 8+ char random slug at
scaffold time; don't use `/admin`, `/dashboard`, `/internal`, or anything guessable.

```ts
export const ADMIN_ROUTE_PATH = '/admin-REPLACE-WITH-RANDOM-SLUG';
```

## `src/features/admin/AdminRoute.tsx`

UX-only gate. If a non-admin lands here (guessed URL, stale bookmark, role downgraded after
login), render exactly what a nonexistent route would render — not an "Access denied" page,
which would confirm to a prober that something real lives at this path.

```tsx
import type { ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';

export function AdminRoute({ children, notFoundFallback }: { children: ReactNode; notFoundFallback: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <>{notFoundFallback}</>;
  return <>{children}</>;
}
```

## `src/features/admin/AdminPage.tsx`

Imported via `React.lazy()` in `App.tsx` (see `../core-ui/README.md`) so this — and anything
it imports — ships as its own chunk, absent from the main bundle a non-admin (or a bot
scanning `main.js`) ever downloads.

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../auth/api-client';
import { AsyncBoundary } from '../core-ui/AsyncBoundary';
import { ADMIN_ROUTE_PATH } from './admin-path';

export default function AdminPage() {
  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<{ data: unknown[]; nextCursor: string | null; hasMore: boolean }>(`${ADMIN_ROUTE_PATH}/users`),
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Admin</h1>
      <AsyncBoundary isLoading={usersQuery.isLoading} isError={usersQuery.isError}>
        <pre className="mt-4 text-sm">{JSON.stringify(usersQuery.data, null, 2)}</pre>
      </AsyncBoundary>
    </div>
  );
}
```
