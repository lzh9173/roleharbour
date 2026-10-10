import { t } from '../i18n';
import type { EmployerCheck } from '../employers';
import type { SeekCard } from './seek';
import { EmployerBadge } from './EmployerBadge';
import { focusRing } from './styles';

export function CardLabel({
  card,
  employerCheck,
}: {
  card: SeekCard;
  employerCheck?: EmployerCheck;
}) {
  return (
    <div className="mt-[var(--roleharbour-card-margin-top)] flex flex-wrap items-center gap-2 border-t border-rh-border pt-[13px]">
      <span className="text-[10px] font-extrabold tracking-[0.7px] whitespace-nowrap text-rh-navy">
        RoleHarbour
      </span>
      <div className="flex flex-wrap items-center gap-[6px] text-[12px]">
        <EmployerBadge employer={card.employer} check={employerCheck} />
      </div>
      <a
        aria-label={t('page.viewRequirementsFor', { title: card.title })}
        className={`card-action ml-auto rounded-[7px] bg-rh-info-bg px-[10px] py-[6px] text-[12px] font-[650] text-rh-link no-underline hover:underline max-[480px]:ml-0 ${focusRing}`}
        href={`${card.url}#seek-filter`}
      >
        {t('page.viewRequirements')}
      </a>
    </div>
  );
}

export function insertCardLabel(card: SeekCard, host: HTMLElement) {
  const recommended = card.element.querySelector(
    ':scope > a[data-automation^="recommendedJobLink_"]',
  );
  const content = recommended
    ? Array.from(card.element.children).find((child) =>
        child.querySelector('[data-automation="jobTitle"]'),
      )
    : undefined;
  if (content) {
    // Feed actions are absolutely positioned at the card's bottom edge. Keep
    // SEEK's existing time/status row last so those actions retain their space.
    host.dataset.seekFilterPlacement = 'feed';
    const footer = content.lastElementChild;
    if (
      content.children.length > 1 &&
      footer &&
      !footer.querySelector('[data-automation="jobTitle"]')
    )
      footer.before(host);
    else content.prepend(host);
  } else card.element.append(host);
}
