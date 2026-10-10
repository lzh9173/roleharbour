import { settingsMessages } from './settings';
import { pageMessages } from './page';
import { errorMessages } from './errors';
import { referenceMessages } from './reference';

export const messages = {
  ...settingsMessages,
  ...pageMessages,
  ...errorMessages,
  ...referenceMessages,
} satisfies Record<string, readonly [string, string]>;

export type MessageKey = keyof typeof messages;
