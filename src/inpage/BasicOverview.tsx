import { useMemo } from 'react';
import { buildRequirementCandidates } from '../core/requirements';
import { redactContacts } from '../core/schema';
import { t } from '../i18n';
import { focusRing } from './styles';

/** Available immediately, independently of credentials, worker readiness and AI results. */
export function BasicOverview({ body }: { body: string }) {
  const quotes = useMemo(() => {
    const candidates = buildRequirementCandidates(redactContacts(body), { explicitOnly: true });
    const experienceIds = new Set(candidates.experience.map((item) => item.id));
    return {
      experience: candidates.experience,
      requirements: candidates.skills.filter((item) => !experienceIds.has(item.id)),
      truncated: candidates.truncated,
    };
  }, [body]);
  const groups = [
    { title: t('page.basicExperience'), items: quotes.experience },
    { title: t('page.basicRequirements'), items: quotes.requirements },
  ];
  if (groups.every((group) => group.items.length === 0)) return null;
  return (
    <section
      className="basic-overview mt-4 text-[13px] leading-[1.6]"
      aria-label={t('page.basicRequirements')}
    >
      {groups.map(
        ({ title, items }) =>
          items.length > 0 && (
            <section className="mt-3" key={title}>
              <h4 className="font-semibold text-rh-text">{title}</h4>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-rh-text [overflow-wrap:anywhere]">
                {items.slice(0, 4).map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
              {items.length > 4 && (
                <details className="mt-2">
                  <summary className={`cursor-pointer py-1 text-[12px] text-rh-link ${focusRing}`}>
                    {t('page.expand')}
                  </summary>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-rh-text [overflow-wrap:anywhere]">
                    {items.slice(4).map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ),
      )}
      {quotes.truncated && (
        <p className="mt-3 text-[12px] text-rh-muted">{t('page.basicTruncated')}</p>
      )}
    </section>
  );
}
