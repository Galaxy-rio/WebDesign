import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://design.galaxyrio.top',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
