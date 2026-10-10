import React from 'react';
import { loadLanguagePreference, watchLanguagePreference } from '../../src/i18n/preference';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import '../../src/ui/style.css';

const stopLanguage = watchLanguagePreference();
window.addEventListener('pagehide', stopLanguage, { once: true });
// App sets the document language and title once the preference is known.
void loadLanguagePreference().then(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
