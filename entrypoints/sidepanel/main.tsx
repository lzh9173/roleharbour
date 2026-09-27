import React from 'react';
import { getLocale, t } from '../../src/i18n';
import { loadLanguagePreference, watchLanguagePreference } from '../../src/i18n/preference';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import '../../src/ui/style.css';

const stopLanguage = watchLanguagePreference();
window.addEventListener('pagehide', stopLanguage, { once: true });
void loadLanguagePreference().then(() => {
  document.documentElement.lang = getLocale();
  document.title = t('settings.title');
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
