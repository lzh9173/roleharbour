import { t } from '../i18n';
import { z } from 'zod';

/** The visible job advert, read from SEEK's DOM and checked again in the background. */
export const draftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: () => t('reference.validation.title') })
    .max(240),
  employer: z.string().trim().max(240),
  location: z.string().trim().max(100),
  body: z
    .string()
    .trim()
    .min(40, { error: () => t('reference.validation.body') })
    .max(24000),
  sourceUrl: z.union([
    z.literal(''),
    z.url().refine(
      (value) => {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password;
      },
      { error: () => t('reference.validation.url') },
    ),
  ]),
});
export type JobDraft = z.infer<typeof draftSchema>;
export const settingsMessageSchema = z.object({ type: z.literal('employers:refresh') }).strict();

// Preserve positions so citations still point to the supplied text. The mask is neither a
// bullet (which would split statements) nor a letter or digit, and a phone number never
// spans a line break, so "N years" on the next line survives.
const MASK = '·';
export function redactContacts(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (s) => MASK.repeat(s.length))
    .replace(/(?:\+64[ \t()-]*|\b0[2-9][ \t()-]*)\d[\d \t()-]{6,}\d\b/g, (s) =>
      MASK.repeat(s.length),
    );
}
