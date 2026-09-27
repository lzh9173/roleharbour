const interactive =
  'cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-[.48]';
const button =
  'inline-flex min-h-[39px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2.5 text-[11px] font-[550]';

export const settingsStyles = {
  panel:
    'min-w-0 rounded-2xl border border-rh-border bg-white p-5 shadow-[0_3px_12px_#051a4905] max-[410px]:rounded-xl',
  heading: 'm-0 flex items-center gap-[9px] text-[17px] font-[650] tracking-[-0.35px]',
  label: 'mb-[15px] block text-[11px] font-[550] text-rh-muted',
  field:
    'mt-1.5 block min-w-0 w-full rounded-lg border border-rh-border bg-white px-3 py-2.5 text-[12px] text-rh-text transition-[border-color,background-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-rh-muted focus:border-rh-border-strong focus:shadow-[0_0_0_3px_#1e47a91a] focus:outline-none disabled:cursor-not-allowed disabled:opacity-[.48] motion-reduce:transition-none',
  checkbox:
    'my-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-rh-link focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3 disabled:cursor-not-allowed',
  checkRow:
    'my-3 flex cursor-pointer items-start gap-[9px] text-[11px] leading-[1.6] text-rh-muted',
  checkHint: 'mt-[3px] block text-[10px] leading-[1.7] text-rh-muted',
  muted: 'my-2.5 text-[11px] leading-[1.8] text-rh-muted',
  buttonRow: 'flex flex-wrap items-center gap-[9px]',
  primary: `${interactive} ${button} border-transparent bg-rh-accent text-white shadow-[0_2px_4px_#e6027814] enabled:hover:bg-rh-accent-hover max-[410px]:px-[11px] max-[410px]:text-[10px]`,
  secondary: `${interactive} ${button} border-rh-border bg-white text-rh-muted enabled:hover:border-rh-border-strong enabled:hover:bg-rh-surface max-[410px]:px-[11px] max-[410px]:text-[10px]`,
  danger: `${interactive} ${button} border-transparent bg-rh-danger text-white`,
  iconButton: `${interactive} inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border-0 bg-transparent p-[5px] text-rh-muted enabled:hover:bg-rh-surface enabled:hover:text-rh-link`,
  textDanger: `${interactive} inline-flex items-center justify-center gap-[5px] border-0 bg-transparent px-0 py-[3px] text-[11px] font-medium text-rh-danger enabled:hover:text-rh-link`,
  link: 'text-rh-link underline focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3',
  notice:
    'my-2 flex items-center gap-2.5 rounded-[10px] border border-rh-border bg-rh-info-bg px-[15px] py-3 text-[11px] leading-[1.8] text-rh-link',
} as const;
