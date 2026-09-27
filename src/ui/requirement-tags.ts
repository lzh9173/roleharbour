import type { RequirementLevel } from '../core/requirements';

export type RequirementCategory = 'skills' | 'qualifications' | 'personal';
export interface RequirementTag {
  text: string;
  category: RequirementCategory;
  level: RequirementLevel;
}

const credential =
  /\b(?:degrees?|bachelor['’]?s?|master['’]?s?|diplomas?|qualifications?|certifi\w*|licen[cs]\w*|registr\w*|accredit\w*|apprenticeship|endorsements?|clearances?)\b/i;
const personal =
  /^(?:(?:strong|good|excellent|effective)\s+)?(?:(?:(?:verbal|written)(?:\s+(?:and|&)\s+(?:verbal|written))?\s+)?communication(?: skills)?|interpersonal(?: skills)?|teamwork|(?:persistent )?problem[ -]solving|analytical thinking|logical thinking|curiosity|willingness to learn|learning & adaptability|attention to detail|quality focus|quality & product improvement|organi[sz]ational skills|independent work)$|^Interest: /i;
const guarded =
  /\b(?:no|not|without|neither|cannot|(?:is|are|do|does|ca|could|would|should|was|were|need)n['’]t|won['’]t|if|unless|when|until|provided|sometimes|may|might|either|or|one of|any of|including|such as|for example)\b|\be\.g\.|或/i;
const compound =
  /\b(?:health and safety|health and wellbeing|research and development|learning and development|food and beverage|care and support)\b/i;

function category(text: string): RequirementCategory {
  // These describe operating systems/processes rather than an applicant's award.
  if (
    /\b(?:certificate|licen[cs]e|registration) (?:management|rotation|automation|systems?|workflows?|APIs?)\b|\b(?:user|device|domain) registration\b|\bsoftware licensing\b/i.test(
      text,
    )
  )
    return 'skills';
  return credential.test(text) ? 'qualifications' : personal.test(text) ? 'personal' : 'skills';
}

/** Split independent noun lists, never parentheses, alternatives or shared credentials. */
function independentList(text: string): string[] {
  if (guarded.test(text) || compound.test(text)) return [text];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const separators = /[()]|[,;]\s*(?:(?:and|&)\s+)?|\s+(?:and|&)\s+/gi;
  for (const match of text.matchAll(separators)) {
    if (match[0] === '(') depth++;
    else if (match[0] === ')') depth = Math.max(0, depth - 1);
    else if (!depth) {
      parts.push(text.slice(start, match.index).trim());
      start = match.index! + match[0].length;
    }
  }
  parts.push(text.slice(start).trim());
  if (parts.length < 2) return [text];
  // An adjective can share the following noun: preventive and corrective
  // maintenance must not become an unqualified "preventive" requirement.
  if (parts.slice(0, -1).some((part) => /^[a-z]+(?:ive|al|ic|ary|ory|ent|ant|ed|ing)$/i.test(part)))
    return [text];
  // Preserve modifiers that can govern the whole list and credential suffixes
  // shared by earlier names, e.g. "Current forklift, first aid ... certificates".
  if (
    /^(?:(?:a|an|the)\s+)?(?:current|valid|full|restricted|advanced|level\s+\d|certificates?\s+in)\b/i.test(
      text,
    ) ||
    (credential.test(text) &&
      /\b(?:certificates?|certifications?|licen[cs]es?|qualifications?)$/i.test(text) &&
      !parts.every((part) => credential.test(part)))
  )
    return [text];
  const independent = (raw: string) => {
    const part = raw.replace(
      /^(?:experience (?:with|in)|knowledge of|familiarity with|understanding of)\s+/i,
      '',
    );
    return (
      part.length > 0 &&
      part.split(/\s+/).length <= 7 &&
      /^[\p{L}\p{N}.+#()/&'’ -]+$/u.test(part) &&
      !/\b(?:how|that|which|while|where|you|we|they|must|should|can|will|have|has|is|are|was|were|to|with|in|for|of|within|supporting|working)\b/i.test(
        part,
      )
    );
  };
  return parts.every(independent) ? parts : [text];
}

/** Small, explicit paraphrases of stated capabilities; unmatched scopes stay intact. */
function conciseLabels(text: string): string[] {
  const value = text
    .replace(/^nice[ -]to[ -]have\s*:?\s*/i, '')
    .replace(
      /^(?:(?:good|sound|basic|working|practical)\s+)?(?:knowledge|understanding|experience)\s+(?:of|with|in|using)\s+/i,
      '',
    )
    .replace(/^strong,?\s+hands-on experience with\s+/i, 'Hands-on: ')
    .replace(/^good (HTML and CSS) skills$/i, '$1')
    .replace(/^proficient with (.+) as part of daily development practice$/i, '$1 (daily use)')
    .trim();
  if (
    !value ||
    /^(?:required|preferred|essential|desirable|skills|requirements)\s*:?$/i.test(value)
  )
    return [];
  const degree = value.match(/^(?:a |an )?((?:bachelor|master)['’]s degree)\s+in\s+(.+)$/i);
  if (degree) return [`${degree[1]} — ${degree[2]}`];
  // Parenthesised examples are optional illustrations of an already named tool
  // family. Never turn those brands into separate mandatory tags.
  const withoutExamples = value
    .replace(/\s*\((?:e\.g\.|for example|such as)\s+[^()]+\)\s*$/i, '')
    .trim();
  if (
    withoutExamples !== value &&
    !/\b(?:not|without|except|excluding|only|must|required|mandatory)\b/i.test(value) &&
    /\b(?:tools?|software|systems?|platforms?|applications?)$/i.test(withoutExamples)
  )
    return [withoutExamples];
  const organisation = value.match(
    /^good organi[sz]ational skills with a focus on quality and product improvement; able to work effectively in (.+ or similar)$/i,
  );
  if (organisation)
    return ['Organisational skills', 'Quality & product improvement', organisation[1]!];
  if (guarded.test(value)) return [value];

  const plain = value.replace(/^(?:strong|excellent|good|effective)\s+/i, '');
  if (/^logical, analytical thinker with high attention to detail$/i.test(plain))
    return ['Logical thinking', 'Analytical thinking', 'Attention to detail'];
  if (/^able to learn and adapt quickly$/i.test(plain)) return ['Learning & adaptability'];
  if (
    /^data analysis and troubleshooting skills\s*[—–-]\s*tenacious in solving problems$/i.test(
      plain,
    )
  )
    return ['Data analysis', 'Troubleshooting', 'Persistent problem-solving'];
  const handsOn = value.match(/^Hands-on: (.+)$/);
  if (handsOn) return independentList(handsOn[1]!).map((part) => `Hands-on: ${part}`);
  if (/^analytical and problem[ -]solving (?:skills|abilities)$/i.test(plain))
    return ['Analytical thinking', 'Problem-solving'];
  if (/^(?:verbal and written|written and verbal) communication(?: skills)?$/i.test(plain))
    return ['Verbal & written communication'];
  if (/^(?:communication|interpersonal) skills$/i.test(plain))
    return [plain.replace(/ skills$/i, '').replace(/^./, (letter) => letter.toUpperCase())];
  if (
    /^(?:work|working) collaboratively (?:within|in|as part of) a team(?: environment)?$/i.test(
      plain,
    )
  )
    return ['Teamwork'];
  if (/^(?:work|working) independently$/i.test(plain)) return ['Independent work'];
  if (
    /^curiosity and a willingness to learn(?: unfamiliar technologies and business domains)?$/i.test(
      plain,
    )
  )
    return ['Curiosity', 'Willingness to learn'];
  if (/^attention to detail and pride in producing quality work$/i.test(plain))
    return ['Attention to detail', 'Quality focus'];
  if (/^attention to detail$/i.test(plain)) return ['Attention to detail'];
  if (/^(?:a )?(?:genuine|keen|strong) interest in (.+)$/i.test(value))
    return [value.replace(/^(?:a )?(?:genuine|keen|strong) interest in /i, 'Interest: ')];
  if (
    /^(?:confident,?\s+)?practical experience with (.+?) and (?:their|its) application in a professional setting$/i.test(
      value,
    )
  )
    return [
      value.replace(
        /^(?:confident,?\s+)?practical experience with (.+?) and (?:their|its) application in a professional setting$/i,
        '$1 (professional use)',
      ),
    ];
  if (/^databases and data structures and how data is organi[sz]ed$/i.test(value))
    return ['Databases', 'Data structures'];
  if (/^source control and Git familiarity for version management$/i.test(value))
    return ['Source control (Git)'];
  if (/^software delivery practices across the development lifecycle$/i.test(value))
    return ['Software development lifecycle'];
  if (/^Agile delivery approaches and iterative delivery$/i.test(value))
    return ['Agile delivery', 'Iterative delivery'];
  return independentList(value).flatMap((part) => (part === value ? [part] : conciseLabels(part)));
}

export function requirementTags(text: string, level: RequirementLevel): RequirementTag[] {
  const advantage = text.match(/^Some (.+ knowledge) is an advantage but not required$/i);
  if (
    advantage &&
    !/\b(?:no|not|without|if|unless|only|must|required|except)\b/i.test(advantage[1]!)
  )
    return [{ text: advantage[1]!, category: category(advantage[1]!), level: 'preferred' }];
  const preferredHeading = /^nice[ -]to[ -]have/i.test(text);
  // Preserve a mixed/contradictory statement instead of assigning its required
  // clause to the heading's preferred level.
  const effectiveLevel =
    preferredHeading && !/\b(?:required|essential|mandatory|must)\b/i.test(text)
      ? 'preferred'
      : level;
  // The examples qualify formats, not APIs. Retain their optional relationship.
  const apiFormats = text.match(
    /^(?:working knowledge of\s+)?(APIs) and data formats such as (.+)$/i,
  );
  const labels =
    apiFormats && !/\b(?:no|not|without|unless)\b/i.test(text)
      ? [apiFormats[1]!, `Data formats (e.g. ${apiFormats[2]!})`]
      : conciseLabels(text);
  return labels.map((label) => ({ text: label, category: category(label), level: effectiveLevel }));
}
