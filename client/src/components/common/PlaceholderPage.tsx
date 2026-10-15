import { Hammer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

/** Temporary body for screens not built yet. Removed screen by screen in steps 3–5. */
export function PlaceholderPage({
  title,
  description,
  step,
  actions,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  step: number;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      {children ?? (
        <Card>
          <StepNotice step={step} />
        </Card>
      )}
    </>
  );
}

/** "Built in step N" notice, for use inside a card or tab. */
export function StepNotice({
  step,
  what = 'This screen',
  detail
}: {
  step: number;
  what?: string;
  detail?: string;
}) {
  return (
    <EmptyState
      icon={Hammer}
      title={`${what} is built in step ${step}`}
      description={detail ?? 'The route, layout and navigation are in place.'}
    />
  );
}
