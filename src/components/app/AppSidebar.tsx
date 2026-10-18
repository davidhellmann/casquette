import { FlaskConical } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarRail, SIDEBAR_STORAGE_KEY,
} from '@/components/ui/sidebar';
import { AppLogo, AppMark } from './AppMark';
import { ThemeMenu } from './ThemeMenu';
import { NavSubmenu, RESTORE_SUBMENUS } from './NavSubmenu';
import { NAV_GROUPS, BASE, navHref, type NavKey, type NavSubmenus } from './nav';
import { t } from '@/i18n/index.ts';

// Runs while the HTML is parsed, right after the sidebar element: applies a stored "collapsed"
// before the first paint, so the static (expanded) HTML never flashes. React adopts it after hydration.
const RESTORE_COLLAPSED = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==='false'){var s=document.currentScript.previousElementSibling;s.setAttribute('data-state','collapsed');s.setAttribute('data-collapsible','icon')}}catch(e){}`;

export interface AppSidebarProps {
  active: NavKey;
  /** Link to the setup steps while the demo data is shown; no demo indicator without it. */
  demoHref?: string;
  /** Last sync, already formatted. */
  lastSync?: string;
  /** Submenu entries: latest years, active bikes. */
  submenus?: NavSubmenus;
  /** Path of the current page (marks the current submenu entry). */
  path?: string;
  /** Legal notice and privacy policy of the hosting website (PUBLIC_LEGAL_URL, src/lib/legal-links.ts); none without. */
  legal?: { notice: string; privacy: string };
}

export function AppSidebar({ active, demoHref, lastSync, submenus, path = '', legal }: AppSidebarProps) {
  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" className="hover:bg-transparent active:bg-transparent">
                <a href={BASE} aria-label={t('nav.homeAria')}>
                  {/* mt: centres the ink (the cap rises ~0.3 em above the word's box, the q drops ~0.1 em below) */}
                  <AppLogo className="mt-[0.22em] text-[30px] group-data-[collapsible=icon]:hidden" />
                  <AppMark className="hidden h-[18px]! w-6! shrink-0 group-data-[collapsible=icon]:block" />
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t('nav.mainAria')}>
            {NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.key}>
                <SidebarGroupLabel className="font-mono text-[10px] tracking-widest uppercase">{t(`nav.${group.key}`)}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map(({ key, path: itemPath, icon: Icon, sub }) => sub && submenus ? (
                    <NavSubmenu key={key} item={{ key, path: itemPath, icon: Icon, sub }} entries={submenus[sub]} isSection={key === active} path={path} />
                  ) : (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton asChild isActive={key === active} tooltip={t(`nav.${key}`)}>
                        <a href={navHref(itemPath)} aria-current={key === active ? 'page' : undefined}>
                          <Icon />
                          <span>{t(`nav.${key}`)}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {demoHref && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" tooltip={t('demo.badge')}>
                  <a href={demoHref} target="_blank" rel="noopener" title={t('demo.tip')} data-demo-note>
                    <FlaskConical />
                    <span className="grid leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="font-medium">{t('demo.badge')}</span>
                      <span className="truncate text-xs text-muted-foreground">{t('demo.hint')}</span>
                    </span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <ThemeMenu />
            </SidebarMenuItem>
          </SidebarMenu>
          {lastSync && (
            <p className="px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{t('dash.lastSync', { d: lastSync })}</p>
          )}
          {legal && (
            <ul aria-label={t('nav.legalAria')} data-legal-links className="flex flex-wrap px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              <li><a href={legal.notice} className="hover:text-foreground hover:underline">{t('nav.legalNotice')}</a></li>
              <li className="before:mx-1.5 before:content-['·']"><a href={legal.privacy} className="hover:text-foreground hover:underline">{t('nav.privacyPolicy')}</a></li>
            </ul>
          )}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <script dangerouslySetInnerHTML={{ __html: RESTORE_COLLAPSED + RESTORE_SUBMENUS }} />
    </>
  );
}
