import { createRoot, type Root } from 'react-dom/client';
import { getLocale } from '../i18n';
import css from './style.css?inline';

export interface Mount {
  host: HTMLElement;
  container: HTMLElement;
  root: Root;
  destroy: () => void;
}

let sharedSheet: CSSStyleSheet | null | undefined;

/** One parsed stylesheet for every card; falls back to a <style> copy where unsupported. */
function adoptStyles(shadow: ShadowRoot): boolean {
  if (sharedSheet === undefined) {
    try {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(css);
    } catch {
      sharedSheet = null;
    }
  }
  if (!sharedSheet || !Array.isArray(shadow.adoptedStyleSheets)) return false;
  shadow.adoptedStyleSheets = [sharedSheet];
  return true;
}

/** A closed shadow root with its own React root, tagged `data-seek-filter="<name>"`. */
export function createMount(name: string): Mount {
  const host = document.createElement('div');
  host.dataset.seekFilter = name;
  const shadow = host.attachShadow({ mode: 'closed' });
  const container = document.createElement('div');
  container.lang = getLocale();
  if (!adoptStyles(shadow)) {
    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);
  }
  shadow.append(container);
  // Keep host-site delegated card clicks from intercepting extension controls. Keyboard
  // events still reach SEEK so its dialogs keep Escape and focus trapping.
  // React's handlers run at container before the event reaches this boundary.
  for (const event of ['click', 'pointerdown'])
    shadow.addEventListener(event, (e) => e.stopPropagation());
  const root = createRoot(container);
  return {
    host,
    container,
    root,
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}
