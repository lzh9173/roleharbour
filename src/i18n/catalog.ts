import { settingsMessages } from './settings';
import { pageMessages } from './page';
import { errorMessages } from './errors';
import { referenceMessages } from './reference';

export const messages = {
  ...settingsMessages,
  ...pageMessages,
  ...errorMessages,
  ...referenceMessages,
  'page.requirementRequired': ['必需', 'Required'],
  'page.requirementPreferred': ['加分', 'Preferred'],
  'page.requirementUnclear': ['其他', 'Other requirements'],
  'page.categorySkillsTools': ['技能与工具', 'Skills & tools'],
  'page.categoryQualifications': ['学历与资质', 'Qualifications & licences'],
  'page.categoryPersonalTeam': ['个人与协作能力', 'Personal & teamwork skills'],
} satisfies Record<string, readonly [string, string]>;

export type MessageKey = keyof typeof messages;
