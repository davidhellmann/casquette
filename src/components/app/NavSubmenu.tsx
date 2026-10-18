import * as React from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar';
import { t } from '@/i18n/index.js';
import { navHref, samePath, type NavItem, type NavSubEntry, type NavSubKey } from './nav';

/** Open submenus, remembered across pages: `{ "years": true, "gear": false }`. */
export const NAV_OPEN_STORAGE_KEY = 'rc_nav_open';

// Runs while the HTML is parsed, after the sidebar: opens the remembered submenus before the first paint
// (their content is always rendered and hidden by `data-state`). React adopts the state after hydration.
export const RESTORE_SUBMENUS = `try{var o=JSON.parse(localStorage.getItem(${JSON.stringify(NAV_OPEN_STORAGE_KEY)})||'{}');for(var k in o)if(o[k])document.querySelectorAll('[data-nav-sub="'+k+'"]').forEach(function(g){[g].concat([].slice.call(g.querySelectorAll('[data-nav-part]'))).forEach(function(e){e.setAttribute('data-state','open');if(e.hasAttribute('aria-expanded'))e.setAttribute('aria-expanded','true')})})}catch(e){}`;

function readStored(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(NAV_OPEN_STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}

/** Open state of one submenu: open on its own section, otherwise as the user left it. */
function useSubmenuOpen(key: NavSubKey, auto: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = React.useState(auto);
  React.useEffect(() => {
    if (!auto && readStored()[key]) setOpen(true);
  }, [key, auto]);
  const set = React.useCallback((v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(NAV_OPEN_STORAGE_KEY, JSON.stringify({ ...readStored(), [key]: v })); } catch { /* storage unavailable */ }
  }, [key]);
  return [open, set];
}

/** Label of an entry: the name, its detail (date, km) below in a second line (mono, muted) – uses the narrow sidebar's width. */
function EntryContent({ e }: { e: NavSubEntry }) {
  return (
    <span className="grid min-w-0 flex-1 leading-tight">
      <span className="truncate">{e.label}</span>
      <span data-testid="entry-detail" className="truncate font-mono text-[10.5px] text-muted-foreground tabular-nums">{e.detail}</span>
    </span>
  );
}

export interface NavSubmenuProps {
  item: NavItem & { sub: NavSubKey };
  entries: NavSubEntry[];
  /** The section of the current page. */
  isSection: boolean;
  /** Path of the current page. */
  path: string;
}

/**
 * A section with a collapsible submenu (latest years, active bikes) and an "All …" link to its overview.
 * In the collapsed sidebar the icon opens the same entries as a flyout.
 */
export function NavSubmenu({ item, entries, isSection, path }: NavSubmenuProps) {
  const { state, isMobile } = useSidebar();
  const [open, setOpen] = useSubmenuOpen(item.sub, isSection);
  const { key, icon: Icon } = item;
  const label = t(`nav.${key}`);
  const href = navHref(item.path);
  const current = entries.find((e) => samePath(e.href, path));
  const all = t(`nav.all.${item.sub}`);

  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={isSection} tooltip={label}>
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-56">
            <DropdownMenuLabel className="font-mono text-[10px] font-normal tracking-widest text-muted-foreground uppercase">{label}</DropdownMenuLabel>
            {entries.map((e) => (
              <DropdownMenuItem key={e.href} asChild>
                <a href={e.href} aria-current={e === current ? 'page' : undefined} className="data-[active=true]:font-medium" data-active={e === current}>
                  <EntryContent e={e} />
                </a>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={href}>{all}<ArrowRight className="ml-auto text-muted-foreground" aria-hidden="true" /></a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} data-nav-sub={item.sub}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isSection} tooltip={label}>
          <a href={href} aria-current={isSection && !current ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild data-nav-part="">
          <SidebarMenuAction className="text-muted-foreground transition-transform data-[state=open]:rotate-90" aria-label={t('nav.subToggle', { name: label })}>
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount data-nav-part="" className="data-[state=closed]:hidden">
          <SidebarMenuSub aria-label={label} className="mt-0.5 mr-0 pr-1">
            {entries.map((e) => (
              <SidebarMenuSubItem key={e.href}>
                <SidebarMenuSubButton asChild isActive={e === current} className="h-auto py-1.5 text-[13px]">
                  <a href={e.href} aria-current={e === current ? 'page' : undefined}><EntryContent e={e} /></a>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-[13px] text-muted-foreground">
                <a href={href}>
                  <span className="flex-1">{all}</span>
                  <ArrowRight className="size-3.5! text-muted-foreground!" aria-hidden="true" />
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
