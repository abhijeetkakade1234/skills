# Feature: home

Minimal landing + 404. Replace `HomePage` with real screens; keep `NotFoundPage` as-is since
`AdminRoute` (see `../admin/README.md`) reuses it as the fallback for unauthorized admin access.

## `src/features/home/HomePage.tsx`

```tsx
export function HomePage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">PROJECT</h1>
      <p className="text-muted-foreground">Replace this with real screens.</p>
    </div>
  );
}
```

## `src/features/home/NotFoundPage.tsx`

```tsx
export function NotFoundPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
    </div>
  );
}
```
