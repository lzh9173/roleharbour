import { readFileSync } from 'node:fs';
import { marked } from 'marked';
import type { Plugin } from 'vite';

/** A Markdown file from the repository, rendered as HTML. */
export function renderDoc(path: string): string {
  return marked.parse(readFileSync(path, 'utf8'), { async: false });
}

/**
 * Fills each `<!-- doc: path -->` in a page with that repository file, rendered at build time.
 * The repository is private, so the site publishes the privacy notice and changelog itself.
 */
export function docPages(repository: string): Plugin {
  return {
    name: 'roleharbour-doc-pages',
    transformIndexHtml: (html) =>
      html.replace(/<!-- doc: (\S+) -->/g, (_, path: string) => renderDoc(repository + path)),
  };
}
