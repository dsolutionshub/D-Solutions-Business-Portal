import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/lib/useTabParam';

export interface PageTab {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/** A card with underline tabs; the selected tab is kept in ?tab= so it can be linked to. */
export function PageTabs({ tabs, defaultTab }: { tabs: PageTab[]; defaultTab: string }) {
  const [tab, setTab] = useTabParam(
    tabs.map(t => t.value),
    defaultTab
  );
  return (
    <Card>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto overflow-y-hidden border-b px-3">
          <TabsList className="h-auto gap-0.5 rounded-none bg-transparent p-0">
            {tabs.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="-mb-px h-[42px] gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-subtle-foreground">
                    {t.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map(t => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
