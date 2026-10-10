import { useEffect, useState, useSyncExternalStore } from 'react';
import { Languages, ShieldCheck } from 'lucide-react';
import { getLocale, t } from '../i18n';
import {
  getLanguagePreference,
  isLanguagePreference,
  languageNames,
  locales,
  saveLanguagePreference,
  subscribeLanguage,
} from '../i18n/preference';
import { EmployerSettings } from './EmployerSettings';
import { brandStyle } from '../inpage/styles';
import { settingsStyles as styles } from './styles';

export function App() {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguagePreference,
    getLanguagePreference,
  );
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const version = globalThis.chrome?.runtime?.getManifest?.().version;
  useEffect(() => {
    document.documentElement.lang = getLocale();
    document.title = t('settings.title');
  }, [language]);
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 pt-6 pb-8 max-[410px]:px-4">
      <header className="mb-5">
        <p className={`${brandStyle} m-0`}>
          RoleHarbour
          {version && (
            <span className="ml-2 text-[12px] font-medium tracking-normal text-rh-muted">
              {t('settings.version', { version })}
            </span>
          )}
        </p>
        <h1 className="mt-1 mb-2 text-[22px] font-[650] text-rh-text">{t('settings.title')}</h1>
        <p className="m-0 text-[13px] leading-[1.7] text-rh-muted">{t('settings.tagline')}</p>
      </header>
      <main className="grid gap-4" data-testid="settings-page" aria-label={t('settings.title')}>
        <EmployerSettings />
        <section className={styles.panel} data-testid="language-settings">
          <h2 className={styles.heading}>
            <Languages size={18} aria-hidden="true" />
            {t('settings.language')}
          </h2>
          <label className={`${styles.label} mt-3`} data-testid="language-setting">
            <span className="sr-only">{t('settings.language')}</span>
            <select
              className={`${styles.field} appearance-auto`}
              value={language}
              disabled={savingLanguage}
              onChange={(event) => {
                const value = event.target.value;
                if (!isLanguagePreference(value)) return;
                setSavingLanguage(true);
                setLanguageError(false);
                void saveLanguagePreference(value)
                  .catch(() => setLanguageError(true))
                  .finally(() => setSavingLanguage(false));
              }}
            >
              <option value="auto">{t('settings.followBrowser')}</option>
              {locales.map((locale) => (
                <option value={locale} key={locale} lang={locale}>
                  {languageNames[locale]}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.error} role="alert">
            {languageError ? t('settings.languageSaveFailed') : ''}
          </p>
        </section>
        <section className={styles.panel} data-testid="privacy-settings">
          <h2 className={styles.heading}>
            <ShieldCheck size={18} aria-hidden="true" />
            {t('settings.privacy')}
          </h2>
          <p className={styles.muted}>{t('settings.privacyBody')}</p>
          <a
            className={styles.link}
            href={globalThis.chrome?.runtime?.getURL?.('occupation-sources.txt') ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('settings.dataSources')}
          </a>
        </section>
      </main>
    </div>
  );
}
