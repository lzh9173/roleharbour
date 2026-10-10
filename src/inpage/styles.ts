/** Ad wording without the list bullet the DOM reader adds (or the ad itself used). */
export function stripBullet(text: string): string {
  return text.replace(/^[-*•●▪]\s*/, '');
}

/** Ad wording for a hover hint: no list bullet, and short enough to read in a tooltip. */
export function hint(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const plain = stripBullet(text);
  return plain.length > 280 ? `${plain.slice(0, 279).trimEnd()}…` : plain;
}

export const focusRing =
  'focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-rh-focus focus-visible:outline-offset-[3px]';

export const buttonStyle = `cursor-pointer rounded-[8px] border border-rh-border bg-white px-[13px] py-2 text-rh-text leading-[1.4] hover:border-rh-border-strong hover:bg-rh-info-bg disabled:cursor-default disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${focusRing}`;

const quietButton = `cursor-pointer rounded-[8px] border border-transparent bg-transparent py-1 text-[12px] leading-[1.4] hover:border-rh-border-strong hover:bg-rh-info-bg disabled:cursor-default disabled:opacity-45 aria-disabled:cursor-default aria-disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${focusRing}`;
// Each variant sets its own colour: adding a second text colour to one of them would leave
// the winner to stylesheet order.
export const quietButtonStyle = `${quietButton} text-rh-muted`;
/** A quiet button that reads as a link, such as "Try again". */
export const quietLinkButtonStyle = `${quietButton} text-rh-link`;

export const linkStyle = `text-rh-link no-underline hover:underline [-webkit-tap-highlight-color:transparent] ${focusRing}`;

const evidenceToggle = `cursor-pointer appearance-none font-[inherit] leading-[inherit] ${focusRing}`;
/** A bare button, such as a checklist chip's label, that reveals its source sentence on click. */
export const evidenceToggleStyle = `${evidenceToggle} border-0 bg-transparent p-0 text-[inherit]`;
/** A pill that is itself the toggle, such as a visa verdict. The pill sets border, background,
 * padding and colour, which the bare-button resets above would cancel. */
export const evidencePillToggleStyle = evidenceToggle;

export const brandStyle = 'text-[13px] font-extrabold tracking-[1.2px] text-rh-navy';

const pill = 'inline-flex w-fit rounded-[6px] border px-[8px] py-[1px] text-[12px] font-[650]';
/** Short status labels: a match or supportive wording, something to check, or nothing known. */
export const pillStyle = {
  positive: `${pill} border-rh-positive-border bg-rh-positive-bg text-rh-positive`,
  warning: `${pill} border-rh-warning-border bg-rh-warning-bg text-rh-warning`,
  neutral: `${pill} border-rh-border-strong/45 bg-white text-rh-muted`,
} as const;
