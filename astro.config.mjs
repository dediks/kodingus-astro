// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://kodingus.com',
  markdown: {
    shikiConfig: {
      // Dual themes that respond to the site's data-theme attribute
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },

  integrations: [sitemap()],
});