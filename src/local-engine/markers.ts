/** Required, preferred and negated-requirement wording shared by the strength classifier and
 * the experience estimate.
 */
import { materials } from '../../data/skills/vocabulary';
import { AP } from './structure';

const materialPatterns = materials.flatMap((material) =>
  material.patterns.map((pattern) => new RegExp(pattern, 'i')),
);
/** "Send your cover letter and CV": application instructions that name a material are asks
 * even under an apply heading, where other lines are logistics. */
export function asksApplicationMaterial(text: string): boolean {
  return materialPatterns.some((pattern) => pattern.test(text));
}

export const negatedRequirement = new RegExp(
  [
    `\\b(?:not|isn${AP}t|aren${AP}t|never)\\s+(?:\\w+\\s+){0,2}(?:required|essential|necessary|needed|mandatory|compulsory|a (?:must|requirement|prerequisite))\\b`,
    // "No experience required", but not "a licence with no demerit points is required".
    `(?:^|[^\\w\\s]\\s*|\\b(?:but|and|so|as|because|though|although)\\s+)no\\s+(?:[\\w/-]+\\s+){0,5}(?:is\\s+|are\\s+)?(?:required|necessary|needed|essential|mandatory|compulsory)\\b`,
    `\\bnone (?:is |are )?(?:required|necessary|needed)\\b`,
    `\\b(?:there is|there${AP}s) no (?:need|requirement)\\b`,
    `\\b(?:don${AP}t|do not|doesn${AP}t|does not|won${AP}t|will not)\\s+(?:\\w+\\s+){0,1}(?:need|require|have to)\\b`,
    `\\bnot a (?:requirement|prerequisite|must)\\b`,
    `\\b(?:without|no) (?:any )?(?:previous |prior )?(?:experience|qualifications?)\\b[^.]{0,40}\\b(?:welcome|encouraged|considered|apply)\\b`,
    `\\b(?:no|zero) (?:previous |prior |formal |industry |relevant )*experience\\??\\s*(?:[-–—,]\\s*)?no (?:problem|worries)\\b`,
    `\\bno (?:problem|worries) if you (?:don${AP}t|do not) have\\b`,
  ].join('|'),
  'i',
);
/** "Where required", "as necessary": a conditional adverbial on a duty, not a requirement. */
const notConditional =
  '(?<!\\b(?:where|when|whenever|wherever|as|if|if and when|as and when|unless) (?:otherwise )?)';
export const requiredMarker = new RegExp(
  `(?<![-‐‑])\\b(?:must(?![-‐‑])|${notConditional}(?:required|necessary)|requires|requirement|essential|mandatory|compulsory|minimum(?! wage)|prerequisite|non[- ]negotiable|(?<!\\b(?:everything|anything|whatever) (?:that )?)(?<!\\b(?:if|when|whenever|whether|in case) )(?:you|applicants?|candidates?)(?: will| shall)?(?: just| only| simply| also| still)? need|you${AP}ll (?:just |only |also )?need|all you need is|we need|we require|(?:the )?(?:role|position|job) requires?|needs? to (?:have|hold|be|possess|show|demonstrate)|(?:is|are) needed|expected to (?:have|hold|be|possess)|a must|(?:will|must|to) be (?:safety[- ]checked|police[- ](?:checked|vetted)|vetted)|(?:will|must|to) (?:undergo|pass|complete) (?:a |an )?(?:[\\w'’-]+ ){0,4}(?:check|vet|vetting|screening|test))\\b`,
  'i',
);
export const preferredMarker = new RegExp(
  `(?<![-‐‑])\\b(?:preferred|preferably|preferable|preference|desirable|desired|(?<!take )advantage(?:ous)?|an asset|a (?:big |huge |real |definite )?plus|(?:is|are|would be|a|as a) (?:big |huge |real |definite |nice )?bonus|bonus (?:points|if)|ideally|nice[- ]to[- ]have|would be (?:great|nice|good|beneficial|helpful|useful|valued|welcome|appreciated|ideal|handy|well regarded|highly regarded|looked upon favou?rably)|(?:is|are) (?:beneficial|helpful|useful|handy)|beneficial|highly (?:regarded|valued|desirable)|well regarded|(?:is|are|will be) (?:highly )?valued|(?:regarded|viewed|looked (?:up)?on) (?:favou?rably|positively)|favou?rably|(?:will be |is |are )?(?:favou?red)|even better|great if|optional|would help|(?:will |would |can |could )?(?:help|helps|make|makes) you stand out|set(?:s)? you apart|we${AP}?d (?:love|like) (?:it if )?(?:you|someone|to see)|we would (?:love|like) (?:it if )?(?:you|someone|to see))\\b`,
  'i',
);
