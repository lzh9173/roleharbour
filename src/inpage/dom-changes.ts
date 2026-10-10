/** Attributes SEEK flips when it swaps, hides or re-targets a job card or the detail pane. */
export const observedAttributes = [
  'href',
  'hidden',
  'aria-hidden',
  'class',
  'style',
  'data-job-id',
  'data-jobid',
];

/** True when a mutation is only RoleHarbour inserting or re-rendering its own hosts. */
export function isOwnMutation(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest('[data-seek-filter]')) return true;
  // A removed host is not ignored: SEEK may have dropped it, and it must be put back.
  return (
    record.type === 'childList' &&
    record.addedNodes.length > 0 &&
    !record.removedNodes.length &&
    Array.from(record.addedNodes).every(
      (node) => node instanceof Element && node.matches('[data-seek-filter]'),
    )
  );
}

/**
 * Trailing debounce with a ceiling: a burst of SEEK re-renders costs one pass once it
 * settles, and continuous churn (carousels, skeleton shimmer) still reconciles every `maxWait`.
 */
export function debounce(run: () => void, delay: number, maxWait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first: number | undefined;
  const fire = () => {
    timer = undefined;
    first = undefined;
    run();
  };
  return {
    schedule() {
      const now = Date.now();
      first ??= now;
      clearTimeout(timer);
      timer = setTimeout(fire, Math.max(0, Math.min(delay, first + maxWait - now)));
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      first = undefined;
    },
  };
}
