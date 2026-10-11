import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { Copy } from './copy';
import { adBlocks, initialSpan, job, sourceOf, splitBlock, type Span } from './demo-data';
import { DemoPanel } from './DemoPanel';

const blocks = adBlocks(job.body);

function JobAd({ mark, label }: { mark: Span | null; label: string }) {
  const box = useRef<HTMLElement>(null);
  const shown = useRef(mark);
  // On wide screens the ad scrolls inside its own box; bring a newly marked sentence into view
  // there without moving the page. The first highlight is left where the ad starts.
  useEffect(() => {
    if (shown.current === mark) return;
    shown.current = mark;
    const container = box.current;
    const marked = container?.querySelector<HTMLElement>('mark');
    if (!container || !marked || container.scrollHeight <= container.clientHeight) return;
    const top = marked.offsetTop;
    const bottom = top + marked.offsetHeight;
    if (top >= container.scrollTop && bottom <= container.scrollTop + container.clientHeight)
      return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      top: top - container.clientHeight / 3,
      behavior: still ? 'auto' : 'smooth',
    });
  }, [mark]);
  const lines = blocks.map((block) => ({
    block,
    pieces: splitBlock(job.body, block, mark).map((piece, index) =>
      piece.marked ? (
        // Keyed by the span so a new highlight sweeps in again.
        <mark key={`${index}:${mark?.start}`} className="source-mark">
          {piece.text}
        </mark>
      ) : (
        piece.text
      ),
    ),
  }));
  return (
    <article
      ref={box}
      aria-label={label}
      className="relative rounded-[18px] border border-rh-border bg-white px-6 py-6 text-[15px] leading-[1.65] text-rh-text sm:px-8 sm:py-8 lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto lg:overscroll-contain"
    >
      <h3 className="m-0 text-[24px] leading-tight font-extrabold tracking-[-0.02em] text-rh-navy">
        {job.title}
      </h3>
      <p className="mt-1 mb-6 flex flex-wrap items-center gap-x-3 text-[15px] text-rh-muted">
        <span className="font-semibold text-rh-text">{job.employer}</span>
        <span className="inline-flex items-center gap-1">
          <MapPin size={15} aria-hidden="true" />
          {job.location}
        </span>
      </p>
      {lines.map(({ block, pieces }, index) => {
        if (block.kind === 'heading')
          return (
            <h4 key={index} className="mt-5 mb-1 text-[15px] font-bold text-rh-navy">
              {pieces}
            </h4>
          );
        if (block.kind === 'bullet')
          return (
            <p key={index} className="relative my-1 pl-5">
              <span aria-hidden="true" className="absolute left-1 text-rh-muted">
                •
              </span>
              {pieces}
            </p>
          );
        return (
          <p key={index} className="my-3">
            {pieces}
          </p>
        );
      })}
    </article>
  );
}

export function Demo({ text }: { text: Copy['demo'] }) {
  const [mark, setMark] = useState<Span | null>(initialSpan);
  const panel = useRef<HTMLDivElement>(null);
  // Pointing at, focusing or tapping a verdict or chip highlights its sentence in the ad.
  const point = (event: SyntheticEvent) => {
    if (!panel.current || !(event.target instanceof Element)) return;
    const span = sourceOf(event.target, panel.current);
    if (span && (span.start !== mark?.start || span.end !== mark?.end)) setMark(span);
  };
  return (
    <section id="demo" className="mx-auto max-w-[1180px] px-5 pt-8 pb-20 sm:px-8 sm:pt-12 sm:pb-28">
      <div className="max-w-[720px]">
        <h2 className="display m-0 text-[clamp(32px,4.4vw,48px)] leading-[1.08] font-black tracking-[-0.03em] text-rh-navy">
          {text.title}
        </h2>
        <p className="mt-5 mb-0 text-[18px] text-rh-text">{text.body}</p>
      </div>
      <div className="mt-12 grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="lg:sticky lg:top-[88px] lg:order-2">
          <div ref={panel} onMouseOver={point} onFocus={point} onClick={point}>
            <DemoPanel />
          </div>
        </div>
        <div className="lg:order-1">
          <JobAd mark={mark} label={text.adLabel} />
        </div>
      </div>
      <p className="mt-5 mb-0 max-w-[720px] text-[14px] text-rh-muted">{text.note}</p>
    </section>
  );
}
