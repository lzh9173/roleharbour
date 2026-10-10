/** Contract for the on-device rule engine.
 * Every evidence segment must quote the exact submitted body: body.slice(start, end) === text. */
import type { SourceSegment } from '../core/source';

export type RequirementLevel = 'required' | 'preferred' | 'unclear';
export type ExperienceEstimateBand =
  'zero_to_one' | 'one_to_three' | 'three_to_five' | 'five_to_eight' | 'eight_plus';

export type SponsorshipChoice = 'supported' | 'not_supported' | 'not_mentioned' | 'conflict';
export type WorkRightsChoice = 'required' | 'not_required' | 'not_mentioned' | 'conflict';
export type ResidencyChoice = 'citizen_or_resident_only' | 'not_mentioned' | 'conflict';

export interface LocalDecision<T extends string> {
  choice: T;
  /** Source statements supporting the choice; empty for not_mentioned. */
  evidence: SourceSegment[];
}

export interface LocalVisaDecisions {
  sponsorship: LocalDecision<SponsorshipChoice>;
  workRights: LocalDecision<WorkRightsChoice>;
  residency: LocalDecision<ResidencyChoice>;
}

export type LocalRequirementLevel = RequirementLevel | 'not_requirement';

export interface LocalExperienceEstimate {
  band: ExperienceEstimateBand;
  evidence: SourceSegment[];
}
