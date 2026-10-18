// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Purely static – locally with `npm run dev`, or `npm run build` → dist/
  devToolbar: { enabled: false },
  // React islands for the interactive UI (shadcn/ui, charts, tables) – see docs/adr/
  integrations: [react()],
  // Type: Geist (UI & headlines) + Geist Mono (labels, numeric details), Damion only for the logo – served locally via the Astro Fonts API
  fonts: [
    { provider: fontProviders.fontsource(), name: 'Geist', cssVariable: '--font-geist', weights: ['100 900'], styles: ['normal'], subsets: ['latin', 'latin-ext'], fallbacks: ['sans-serif'] },
    { provider: fontProviders.fontsource(), name: 'Geist Mono', cssVariable: '--font-geist-mono', weights: ['100 900'], styles: ['normal'], subsets: ['latin', 'latin-ext'], fallbacks: ['monospace'] },
    { provider: fontProviders.fontsource(), name: 'Damion', cssVariable: '--font-damion', weights: [400], styles: ['normal'], subsets: ['latin'], display: 'block', fallbacks: ['cursive'] },
  ],
  vite: {
    plugins: [tailwindcss()],
    build: { chunkSizeWarningLimit: 1500 },
  },
});
