import { INZ_EMPLOYER_SOURCE, type EmployerCheck } from '../employers/types';
import { formatDate, t } from '../i18n';
import { linkStyle } from './styles';

export function employerLabel(check?: EmployerCheck) {
  if (!check) return t('page.checking');
  if (check.status === 'matched') return t('page.matched');
  if (check.status === 'ambiguous' || check.matches.length) return t('page.employerReview');
  if (check.status === 'not_found') return t('page.notMatched');
  return t('page.checkUnavailable');
}
export function EmployerDetails({ check }: { check?: EmployerCheck }) {
  return (
    <section className="pb-2 text-[12px] leading-[1.7] break-words text-rh-muted">
      {check?.matches.map((match) => (
        <p className="my-2" key={`${match.nzbn}:${match.employerName}`}>
          <b>{match.employerName}</b>
          {match.tradingName &&
            match.tradingName.trim().replace(/\s+/g, ' ').toLowerCase() !==
              match.employerName.trim().replace(/\s+/g, ' ').toLowerCase() && (
              <span> · {match.tradingName}</span>
            )}
          {match.nzbn && <span> · NZBN {match.nzbn}</span>}
          {match.expiryDate && (
            <span> · {t('page.listedExpiry', { date: formatDate(match.expiryDate) })}</span>
          )}
          {match.aliasMatch && (
            <span className="block">
              {t('page.employerAliasMatch', { alias: match.aliasMatch.alias })}{' '}
              <a
                className={linkStyle}
                href={match.aliasMatch.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('page.employerAliasSource')}
              </a>
            </span>
          )}
        </p>
      ))}
      {check?.sourceDate && (
        <p className="my-2">{t('page.listDate', { date: formatDate(check.sourceDate) })}</p>
      )}
      {check?.checkedAt && (
        <p className="my-2">{t('page.checkedDate', { date: formatDate(check.checkedAt) })}</p>
      )}
      {check?.note && (check.status === 'ambiguous' || check.status === 'unavailable') && (
        <p className="my-2">{check.note}</p>
      )}
      <p className="my-2">{t('page.employerExplanation')}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        <a
          className={linkStyle}
          href={check?.snapshotSourceUrl ?? 'https://nzaei.zemo.bio/open-data/'}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('page.listSource')}
        </a>
        <a
          className={linkStyle}
          href={INZ_EMPLOYER_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('page.officialLookup')}
        </a>
      </div>
    </section>
  );
}
export function EmployerBadge({
  check,
  employer,
  compact = false,
}: {
  check?: EmployerCheck;
  employer: string;
  compact?: boolean;
}) {
  const label = employer ? employerLabel(check) : t('page.companyMissing');
  const matched = !!employer && check?.status === 'matched';
  const needsReview =
    !!employer && !!check && !matched && (check.status === 'ambiguous' || check.matches.length > 0);
  return (
    <div
      className={`employer ${compact ? 'm-0 flex items-center gap-[7px]' : 'grid grid-cols-[minmax(100px,0.34fr)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2'}`}
    >
      <span
        className={`text-rh-muted ${compact ? 'text-[11px]' : 'text-[14px] leading-[1.5] font-semibold'}`}
      >
        {t('page.accreditedList')}
      </span>
      <span
        className={`tag inline-flex w-fit max-w-full items-center gap-[5px] rounded-[6px] border px-[10px] py-[3px] text-[12px] font-[650] ${matched ? 'border-rh-positive-border bg-rh-positive-bg text-rh-positive' : needsReview ? 'border-rh-warning-border bg-rh-warning-bg text-rh-warning' : 'border-transparent bg-rh-surface text-rh-muted'}`}
      >
        {label}
      </span>
    </div>
  );
}
