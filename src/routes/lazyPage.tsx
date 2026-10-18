import { lazy, Suspense, type ComponentType } from 'react'
import { Loader2 } from 'lucide-react'

// Route pages as separate chunks (React.lazy), so the first screen does not
// download every page and chart library at once. Each loader is remembered to be
// prefetched once the app is idle, so later navigation does not wait (on the
// stand every page is already in the browser before the demo clicks through).

const loaders: (() => Promise<unknown>)[] = []

const loading = (
  <div className="flex h-full min-h-40 items-center justify-center">
    <Loader2 className="size-5 animate-spin text-muted-foreground" />
  </div>
)

/** A page component loaded on first render; `name` is its named export. */
export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ComponentType {
  loaders.push(load)
  const Page: ComponentType = lazy(() =>
    load().then((m) => ({ default: m[name] as ComponentType })),
  )
  return function LazyPage() {
    return (
      <Suspense fallback={loading}>
        <Page />
      </Suspense>
    )
  }
}

/** Fetch every page chunk in the background (idempotent: modules are cached). */
export function prefetchPages(): void {
  for (const load of loaders) void load().catch(() => {})
}
