import { lazy, Suspense, type ComponentType } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** What a page looks like while its code loads. */
export type PageShape = 'list' | 'detail' | 'form' | 'tabs' | 'blank';

export function PageSkeleton({ shape }: { shape: PageShape }) {
  if (shape === 'blank') return <Card className="h-64" aria-busy aria-label="Loading" />;
  return (
    <div className="flex flex-col gap-5" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {shape === 'list' && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <Card className="space-y-3 p-4">
            <Skeleton className="h-9 w-full max-w-md" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Card>
        </>
      )}
      {shape === 'detail' && (
        <>
          <Card className="flex gap-4 p-5">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </Card>
        </>
      )}
      {shape === 'form' && (
        <Card className="space-y-4 p-6">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      )}
      {shape === 'tabs' && (
        <Card className="space-y-4 p-5">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-40 w-full" />
        </Card>
      )}
    </div>
  );
}

/**
 * A route element whose code is downloaded on first visit (its own chunk), showing a skeleton
 * of the page meanwhile. `pick` selects the named export.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a route-element factory, not a component
export function lazyPage<M>(load: () => Promise<M>, pick: (m: M) => ComponentType, shape: PageShape) {
  const Page = lazy(() => load().then(m => ({ default: pick(m) })));
  return (
    <Suspense fallback={<PageSkeleton shape={shape} />}>
      <Page />
    </Suspense>
  );
}
