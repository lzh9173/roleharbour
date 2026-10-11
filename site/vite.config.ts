import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { docPages } from './docs';

const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('..', import.meta.url));

// The promotional site: the home page plus the privacy notice and changelog, built with
// relative URLs so it works from any path, including its GitHub Pages path /roleharbour/.
export default defineConfig({
  root,
  base: './',
  plugins: [tailwindcss(), docPages(repository)],
  oxc: { jsx: { runtime: 'automatic' } },
  // Brand art and the demo's job ad are imported from brand/ and promo/, outside site/.
  server: { fs: { allow: [repository] } },
  build: {
    outDir: fileURLToPath(new URL('../output/site', import.meta.url)),
    emptyOutDir: true,
    // Keep the promo video and images as files rather than inlined data URLs.
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: ['index.html', 'privacy.html', 'changelog.html'].map((page) => root + page),
      // lucide-react marks its modules "use client", which means nothing outside a server
      // components setup.
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
      },
    },
  },
});
