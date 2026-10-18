import * as React from 'react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, type AppSidebarProps } from './AppSidebar';
import { PeriodControl } from './PeriodControl';
import { YearControl, type YearSwitch } from './YearControl';
import { useIslandReady } from '@/lib/island-ready';

export interface Crumb { label: string; href?: string }

export interface AppShellProps extends AppSidebarProps {
  /** Breadcrumbs, last one = the current page. */
  crumbs: Crumb[];
  /** Show the period and zone-basis controls in the page header. */
  period?: boolean;
  /** Show the year switch in the page header (year review). */
  yearSwitch?: YearSwitch;
  children?: React.ReactNode;
}

/** The frame of every page: sidebar on the canvas, page header and content on the inset panel. */
export function AppShell({ crumbs, period = false, yearSwitch, children, ...sidebar }: AppShellProps) {
  useIslandReady();
  return (
    <SidebarProvider>
      <AppSidebar {...sidebar} />
      <SidebarInset className="min-w-0">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 px-4 py-2 lg:px-6" data-slot="page-header">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="min-w-0">
                    {i < crumbs.length - 1 && c.href
                      ? <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
                      : <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          {period && <div className="ml-auto"><PeriodControl /></div>}
          {yearSwitch && <div className="ml-auto"><YearControl {...yearSwitch} /></div>}
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
