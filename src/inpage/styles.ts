export const focusRing =
  'focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-rh-focus focus-visible:outline-offset-[3px]';

export const buttonStyle = `cursor-pointer rounded-[8px] border border-rh-border bg-white px-[13px] py-2 text-rh-text leading-[1.4] hover:border-rh-border-strong hover:bg-rh-info-bg disabled:cursor-default disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${focusRing}`;

export const quietButtonStyle = `cursor-pointer rounded-[8px] border border-transparent bg-transparent py-1 text-[12px] leading-[1.4] text-rh-muted hover:border-rh-border-strong hover:bg-rh-info-bg disabled:cursor-default disabled:opacity-45 aria-disabled:cursor-default aria-disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${focusRing}`;

export const primaryButtonStyle = `cursor-pointer rounded-[8px] border border-transparent bg-rh-accent py-1 text-[12px] leading-[1.4] font-semibold text-white enabled:hover:bg-rh-accent-hover disabled:cursor-default disabled:opacity-45 aria-disabled:cursor-default aria-disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${focusRing}`;

export const linkStyle = `text-rh-link no-underline hover:underline [-webkit-tap-highlight-color:transparent] ${focusRing}`;

export const brandStyle = 'text-[13px] font-extrabold tracking-[1.2px] text-rh-navy';
