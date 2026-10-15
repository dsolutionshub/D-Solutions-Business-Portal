import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { ThemeProvider } from './theme/ThemeProvider';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

/** Mutations show their error as a toast unless they opt out with `meta: { silent: true }`. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors (validation, not found, forbidden) — only network/5xx.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2
    }
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  })
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
