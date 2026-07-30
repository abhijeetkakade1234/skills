# Feature: core-ui

App shell, TanStack Query wired to sonner toasts, and the loading/error/success wrapper every
data-fetching view uses. Build this before any other feature — everything else renders inside it.

Docs: [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) ·
[sonner](https://sonner.emilkowal.ski/) · [React Router](https://reactrouter.com/en/main)

## `src/features/core-ui/query-client.ts`

```ts
import { QueryCache, MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClientError } from '../auth/api-client';

// Global fallback so a query/mutation that forgets a local error handler still surfaces
// something instead of failing silently. Components can still add their own `onError` for
// a more specific message — this is the floor, not the ceiling.
function toastForError(error: unknown) {
  if (error instanceof ApiClientError) {
    // Safe to show directly: the API only ever sends a user-facing message here, never a
    // raw stack trace (see api/core/error-handler.ts).
    toast.error(error.message);
  } else {
    toast.error('Something went wrong. Please try again.');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  queryCache: new QueryCache({ onError: toastForError }),
  mutationCache: new MutationCache({ onError: toastForError }),
});
```

## `src/features/core-ui/AsyncBoundary.tsx`

Every data-fetching view wraps its content in this instead of ad-hoc `{isLoading && ...}`
checks — guarantees loading/error/success are all handled, none silently skipped.

```tsx
import type { ReactNode } from 'react';

type AsyncBoundaryProps = {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  loadingFallback?: ReactNode;
  children: ReactNode;
};

export function AsyncBoundary({ isLoading, isError, errorMessage = 'Failed to load. Please try again.', loadingFallback, children }: AsyncBoundaryProps) {
  if (isLoading) {
    return <>{loadingFallback ?? <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>}</>;
  }
  if (isError) {
    return <div className="text-sm text-destructive">{errorMessage}</div>;
  }
  return <>{children}</>;
}
```

## `src/App.tsx`

```tsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './features/core-ui/query-client';
import { useAuth } from './features/auth/useAuth';
import { AdminRoute } from './features/admin/AdminRoute';
import { ADMIN_ROUTE_PATH } from './features/admin/admin-path';
import { HomePage } from './features/home/HomePage';
import { NotFoundPage } from './features/home/NotFoundPage';

// React.lazy() is what actually keeps AdminPage (and its imports) out of the main JS
// bundle — not the obscured path string. See features/admin/README.md.
const AdminPage = lazy(() => import('./features/admin/AdminPage'));

function Nav() {
  const { user } = useAuth();
  return (
    <nav className="flex gap-4 p-4 border-b">
      <Link to="/">Home</Link>
      {/* Only rendered once an authenticated admin's role is known — never in the DOM,
          never discoverable via view-source, for anyone else. */}
      {user?.role === 'admin' && <Link to={ADMIN_ROUTE_PATH}>Admin</Link>}
    </nav>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path={ADMIN_ROUTE_PATH}
            element={
              <AdminRoute notFoundFallback={<NotFoundPage />}>
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <AdminPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      {/* shadcn's toast primitive — every success/error/loading state should surface
          through this, never a silent failure. */}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
```

## `src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

`src/index.css`: just the Tailwind directives (shadcn's `init` will expand this with CSS
variables for its theme):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
