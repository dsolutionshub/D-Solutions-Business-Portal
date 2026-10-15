import type { ReactNode } from 'react';

/** A form section like the prototype: title and description on the left, fields on the right. */
export function FormSection({
  title,
  description,
  children
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-wrap gap-6 border-b p-5 last:border-b-0 sm:p-6">
      <div className="max-w-[300px] flex-[1_1_220px]">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="grid min-w-0 flex-[999_1_420px] grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        {children}
      </div>
    </section>
  );
}
