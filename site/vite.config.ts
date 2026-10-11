import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('..', import.meta.url));

// The promotional site: one static page, built with relative URLs so it works from any
// path, including a GitHub Pages project path such as /roleharbour/.
export default defineConfig({
  root,
  base: './',
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: 'automatic' } },
  // Brand art and the demo's job ad are imported from brand/ and promo/, outside site/.
  server: { fs: { allow: [repository] } },
  build: {
    outDir: fileURLToPath(new URL('../output/site', import.meta.url)),
    emptyOutDir: true,
    // Keep the promo video and images as files rather than inlined data URLs.
    assetsInlineLimit: 0,
    rolldownOptions: {
      // lucide-react marks its modules "use client", which means nothing outside a server
      // components setup.
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
      },
    },
  },
});
