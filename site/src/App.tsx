import { useEffect, useState } from 'react';
import { Check, Download, Play } from 'lucide-react';
import { applyLanguagePreference } from '../../src/i18n/preference';
import crest from '../../brand/logo/crest.svg';
import haru from '../../brand/haru/full-front.png';
import haruCalm from '../../brand/haru/face-closed-eyes.png';
import poster from '../../brand/promo/poster.png';
import promo from '../../brand/promo/roleharbour-promo.mp4';
import { copy, type Lang } from './copy';
import { Demo } from './Demo';
import { Features } from './Features';

const repository = 'https://github.com/lzh9173/roleharbour';
const links = {
  store:
    'https://chromewebstore.google.com/detail/roleharbour-%C2%B7-nz-job-comp/mbeoakplonnbmiekenheljopipkhdhpe',
  release: `${repository}/releases/latest`,
  privacy: `${repository}/blob/main/docs/PRIVACY.md`,
  changelog: `${repository}/blob/main/CHANGELOG.md`,
};
const LANG_KEY = 'roleharbour-site-lang';
const focus =
  'focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-rh-focus focus-visible:outline-offset-[3px]';
const primaryButton = `inline-flex items-center gap-2 rounded-[12px] bg-rh-navy px-6 py-[14px] text-[16px] font-semibold text-white no-underline hover:bg-[#0b2a6b] ${focus}`;
const secondaryButton = `inline-flex items-center gap-2 rounded-[12px] border border-rh-border-strong/40 bg-white px-6 py-[14px] text-[16px] font-semibold text-rh-navy no-underline hover:border-rh-navy ${focus}`;
const sectionTitle =
  'display m-0 text-[clamp(32px,4.4vw,48px)] leading-[1.08] font-black tracking-[-0.03em]';

/** English unless the link (?lang=zh) or an earlier visit chose Chinese. */
function initialLang(): Lang {
  const param = new URLSearchParams(window.location.search).get('lang');
  if (param === 'en' || param === 'zh') return param;
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // Storage can be blocked; the page still works in English.
  }
  return 'en';
}

/** The demo panel's labels come from the extension's catalogue, switched with the page. */
function applyPanelLanguage(lang: Lang) {
  applyLanguagePreference(lang === 'zh' ? 'zh-CN' : 'en');
}

function Brand({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-[10px] text-[19px] font-extrabold tracking-[-0.02em] text-rh-navy">
      <img src={crest} alt="" width={size} height={size} />
      RoleHarbour
    </span>
  );
}

function LanguageSwitch({
  lang,
  label,
  onChange,
}: {
  lang: Lang;
  label: string;
  onChange: (lang: Lang) => void;
}) {
  const options: Array<[Lang, string]> = [
    ['en', 'EN'],
    ['zh', '中文'],
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-[10px] border border-rh-border bg-white p-[3px]"
    >
      {options.map(([value, name]) => (
        <button
          key={value}
          type="button"
          lang={value === 'zh' ? 'zh-CN' : 'en'}
          aria-pressed={lang === value}
          onClick={() => onChange(value)}
          className={`cursor-pointer rounded-[7px] border-0 px-3 py-[5px] text-[13px] font-semibold ${focus} ${
            lang === value
              ? 'bg-rh-navy text-white'
              : 'bg-transparent text-rh-muted hover:text-rh-navy'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const initial = initialLang();
    applyPanelLanguage(initial);
    return initial;
  });
  const choose = (next: Lang) => {
    applyPanelLanguage(next);
    setLang(next);
  };
  const text = copy[lang];

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = text.documentTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', text.description);
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not remembering the choice is fine.
    }
  }, [lang, text]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-rh-border/70 bg-brand-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href="#top" className={`rounded-[8px] no-underline ${focus}`}>
            <Brand />
          </a>
          <nav className="flex items-center gap-6">
            <ul className="m-0 hidden list-none gap-6 p-0 text-[15px] md:flex">
              {(['demo', 'features', 'privacy', 'install'] as const).map((id) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className={`rounded-[4px] font-medium text-rh-text no-underline hover:text-rh-navy ${focus}`}
                  >
                    {text.nav[id]}
                  </a>
                </li>
              ))}
            </ul>
            <LanguageSwitch lang={lang} label={text.languageLabel} onChange={choose} />
            <a
              href={repository}
              className={`hidden rounded-[4px] text-[15px] font-medium text-rh-text no-underline hover:text-rh-navy sm:inline ${focus}`}
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 pt-12 pb-16 sm:px-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] md:pt-20 md:pb-24">
          <div>
            <h1 className="display m-0 text-[clamp(52px,8.4vw,100px)] leading-[0.96] font-black tracking-[-0.045em] text-rh-navy">
              {text.hero.titleStart}
              <br />
              <span className="marker marker-sweep">{text.hero.titleMarked}</span>
            </h1>
            <p className="mt-8 mb-0 max-w-[560px] text-[19px] leading-[1.6] text-rh-text">
              {text.hero.lead}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={links.store} className={primaryButton}>
                <Download size={18} aria-hidden="true" />
                {text.hero.get}
              </a>
              <a href="#tour" className={secondaryButton}>
                <Play size={18} aria-hidden="true" />
                {text.hero.tour}
              </a>
            </div>
            <p className="mt-5 mb-0 text-[14px] text-rh-muted">{text.hero.meta}</p>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[320px] md:max-w-[460px]">
            <div className="absolute inset-[6%] rounded-full bg-brand-sky" aria-hidden="true" />
            <img
              src={haru}
              alt={text.hero.haruAlt}
              className="absolute bottom-0 left-1/2 h-[108%] w-auto max-w-none -translate-x-1/2"
            />
          </div>
        </section>

        <Demo text={text.demo} />
        <Features text={text.features} />

        <section id="privacy" className="bg-rh-navy text-white">
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div>
              <h2 className={`${sectionTitle} max-w-[640px] text-white`}>{text.privacy.title}</h2>
              <p className="mt-6 mb-0 max-w-[600px] text-[18px] text-[#dbe4f5]">
                {text.privacy.body}
              </p>
              <ul className="mt-10 mb-0 grid list-none gap-4 p-0">
                {text.privacy.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[17px]">
                    <span className="mt-[3px] inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-brand-amber text-rh-navy">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            {/* The face art is 150 px wide, so it stays near that size: the head rises out of the
                sky disc and the disc's lower arc crops the shoulders. */}
            <div className="relative mx-auto h-[270px] w-[220px] overflow-hidden rounded-b-[110px]">
              <div className="absolute bottom-0 size-[220px] rounded-full bg-brand-sky" />
              <img
                src={haruCalm}
                alt=""
                width={150}
                height={221}
                className="absolute bottom-[-12px] left-1/2 w-[170px] -translate-x-1/2"
              />
            </div>
          </div>
        </section>

        <section id="tour" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className={`${sectionTitle} text-rh-navy`}>{text.video.title}</h2>
          <p className="mt-5 mb-0 max-w-[640px] text-[18px]">{text.video.body}</p>
          <video
            className="mt-10 block aspect-video w-full rounded-[18px] border border-rh-border bg-white shadow-[0_12px_40px_#051a4912]"
            src={promo}
            poster={poster}
            controls
            preload="none"
            playsInline
            aria-label={text.video.label}
          />
        </section>

        <section id="install" className="border-t border-rh-border bg-white">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-8 sm:py-28 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <h2 className={`${sectionTitle} text-rh-navy`}>{text.install.title}</h2>
              <p className="mt-5 mb-0 text-[18px]">{text.install.body}</p>
              <a href={links.store} className={`${primaryButton} mt-8`}>
                <Download size={18} aria-hidden="true" />
                {text.install.store}
              </a>
            </div>
            <div>
              <h3 className="m-0 mb-6 text-[20px] leading-snug font-bold text-rh-navy">
                {text.install.manualTitle}
              </h3>
              <ol className="m-0 grid list-none gap-6 p-0">
                {text.install.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-4 text-[17px]">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-rh-navy text-[15px] font-extrabold text-rh-navy">
                      {index + 1}
                    </span>
                    <span className="pt-[5px]">{step}</span>
                  </li>
                ))}
              </ol>
              <a href={links.release} className={`${secondaryButton} mt-8`}>
                <Download size={18} aria-hidden="true" />
                {text.install.download}
              </a>
              <ul className="mt-8 mb-0 grid list-none gap-2 rounded-[12px] bg-brand-paper px-5 py-4 text-[15px] text-rh-muted">
                {text.install.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-rh-border">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] text-rh-navy">
              {text.limits.title}
            </h2>
            <ul className="mt-6 mb-0 grid list-disc gap-x-12 gap-y-3 pl-5 text-[15px] text-rh-text marker:text-rh-muted md:grid-cols-2">
              {text.limits.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-rh-border bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-5 py-10 sm:px-8">
          <div className="grid gap-1">
            <Brand size={30} />
            <span className="text-[14px] text-rh-muted">{text.footer.tagline}</span>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[14px]">
            <li>
              <a
                className={`text-rh-link no-underline hover:underline ${focus}`}
                href={links.store}
              >
                {text.footer.store}
              </a>
            </li>
            <li>
              <a className={`text-rh-link no-underline hover:underline ${focus}`} href={repository}>
                {text.footer.source}
              </a>
            </li>
            <li>
              <a
                className={`text-rh-link no-underline hover:underline ${focus}`}
                href={links.privacy}
              >
                {text.footer.privacy}
              </a>
            </li>
            <li>
              <a
                className={`text-rh-link no-underline hover:underline ${focus}`}
                href={links.changelog}
              >
                {text.footer.changelog}
              </a>
            </li>
          </ul>
          <p className="m-0 w-full text-[13px] text-rh-muted">{text.footer.haru}</p>
        </div>
      </footer>
    </>
  );
}
