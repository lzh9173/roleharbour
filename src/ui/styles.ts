const interactive =
  'cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-[.48]';
const button =
  'inline-flex min-h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-[13px] font-[550]';

export const settingsStyles = {
  panel:
    'min-w-0 rounded-2xl border border-rh-border bg-rh-card p-5 max-[410px]:rounded-xl max-[410px]:p-4',
  heading: 'm-0 flex items-center gap-2 text-[16px] font-[650] text-rh-navy',
  label: 'block text-[13px] font-[550] text-rh-muted',
  field:
    'block min-w-0 w-full rounded-lg border border-rh-border bg-rh-card px-3 py-2.5 text-[13px] text-rh-text transition-[border-color,box-shadow] duration-150 focus:border-rh-border-strong focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-rh-focus)_18%,transparent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-[.48] motion-reduce:transition-none',
  muted: 'my-2 text-[13px] leading-[1.7] text-rh-muted',
  stat: 'rounded-xl bg-rh-surface px-3 py-2.5',
  statLabel: 'text-[12px] text-rh-muted',
  statValue: 'm-0 mt-0.5 text-[18px] font-[650] text-rh-text',
  buttonRow: 'flex flex-wrap items-center gap-2',
  primary: `${interactive} ${button} border-transparent bg-rh-accent text-white enabled:hover:bg-rh-accent-hover`,
  secondary: `${interactive} ${button} border-rh-border bg-rh-card text-rh-text enabled:hover:border-rh-border-strong enabled:hover:bg-rh-surface`,
  summary: `cursor-pointer py-1 text-[13px] text-rh-muted focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3`,
  link: 'text-[13px] text-rh-link underline focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3',
  success: 'mt-3 mb-0 min-h-[1px] text-[13px] leading-[1.6] text-rh-positive empty:mt-0',
  error: 'mt-3 mb-0 min-h-[1px] text-[13px] leading-[1.6] text-rh-danger empty:mt-0',
} as const;
