import { formatDate, formatNumber, t } from '../i18n';
import { EMPLOYER_OPEN_DATA } from '../employers/types';
import type { EmployerLookupState } from './employer-lookup';
import { isUserAction } from './actions';
import { brandStyle, buttonStyle, focusRing, linkStyle } from './styles';

/** The strip above a SEEK results list: job count, list status and the settings entry. */
export function Toolbar({
  count,
  lookup,
  settingsError,
  onSettings,
}: {
  count: number;
  lookup: EmployerLookupState;
  settingsError: string;
  onSettings: () => void;
}) {
  const { busy, message, cache } = lookup;
  return (
    <div className="my-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-rh-border bg-rh-surface px-4 py-[13px]">
      <span className={`${brandStyle} whitespace-nowrap`}>RoleHarbour</span>
      <div className="min-w-[170px] flex-1">
        <p className="m-0 text-[12px] text-rh-muted">
          {t('page.jobCount', { count: formatNumber(count) })}
        </p>
        <details className="mt-[3px] text-[11px]">
          <summary className={`cursor-pointer text-rh-muted ${focusRing}`}>
            {busy
              ? t('page.readingList')
              : message
                ? t('page.listReadError')
                : t('page.listInformation')}
          </summary>
          {message && <p className="mt-2 text-[12px] text-rh-muted">{message}</p>}
          <p className="mt-2 text-[12px] text-rh-muted">
            {cache?.snapshotDate
              ? t('page.localListSummary', {
                  date: formatDate(cache.snapshotDate),
                  count: formatNumber(cache.recordCount),
                })
              : t('page.noLocalList')}
          </p>
          <p className="mt-2 text-[12px] text-rh-muted">{t('page.listMatchNote')}</p>
          <a
            className={linkStyle}
            href={cache?.snapshotSourceUrl ?? EMPLOYER_OPEN_DATA}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('page.listSource')}
          </a>
        </details>
      </div>
      <button
        type="button"
        className={`${buttonStyle} text-[12px]`}
        onClick={(event) => {
          if (isUserAction(event.nativeEvent)) onSettings();
        }}
      >
        {t('page.settings')}
      </button>
      {settingsError && (
        <p className="m-0 basis-full text-[12px] text-rh-warning" role="alert">
          {settingsError}
        </p>
      )}
    </div>
  );
}
