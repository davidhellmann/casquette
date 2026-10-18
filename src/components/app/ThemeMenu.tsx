import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { DEFAULT_THEME, followSystemTheme, readThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import { t } from '@/i18n/index.ts';

const ICONS = { light: Sun, dark: Moon, auto: Monitor } as const;
const PREFS: ThemePreference[] = ['light', 'dark', 'auto'];

/** Light / dark / auto switch for the sidebar footer. */
export function ThemeMenu() {
  // Static HTML shows the default; the stored choice is read after hydration.
  const [pref, setPref] = React.useState<ThemePreference>(DEFAULT_THEME);
  React.useEffect(() => {
    setPref(readThemePreference());
    return followSystemTheme();
  }, []);
  const Icon = ICONS[pref];
  const choose = (v: string) => {
    setPref(v as ThemePreference);
    setThemePreference(v as ThemePreference);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip={t('theme.label')} data-testid="theme-menu">
          <Icon />
          <span>{t('theme.label')}</span>
          <span className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{t(`theme.${pref}`)}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={pref} onValueChange={choose}>
          {PREFS.map((p) => {
            const I = ICONS[p];
            return (
              <DropdownMenuRadioItem key={p} value={p}>
                <I />
                {t(`theme.${p}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
