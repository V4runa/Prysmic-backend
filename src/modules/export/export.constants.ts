/**
 * Ceilings checked inside one database snapshot, before note bodies are loaded.
 * Crossing any one refuses the whole download. Writing is never shortened to fit.
 */
export const EXPORT_BUDGET = {
  notes: 2000,
  attachments: 20000,
  tags: 2000,
  tasks: 5000,
  habits: 1000,
  habitChecks: 20000,
  moods: 5000,
  moodOptions: 200,
  calendarEvents: 5000,
  /** Sum of stored text octets (titles, HTML, descriptions). Not a truncated cap. */
  textBytes: 8 * 1024 * 1024,
  /** note/task tag-link rows materialized as id pairs, not a joined tag fanout. */
  linkRows: 10000,
} as const;

export type ExportBudget = {
  -readonly [K in keyof typeof EXPORT_BUDGET]: number;
};

export const EXPORT_BUDGET_TOKEN = Symbol('EXPORT_BUDGET');

/** Optional test hook. Production does not provide it. */
export interface ExportReadProbe {
  afterMeasures?(): Promise<void>;
}

export const EXPORT_PROBE = Symbol('EXPORT_PROBE');

export const EXPORT_FORMAT = 'prysmic.account-export';
export const EXPORT_VERSION = 1;

export const EXPORT_LIMITATIONS = [
  'Attachment file bytes are not included; only filename, type, and size.',
  'This snapshot is not a restore format and is not imported by the server.',
  'Passwords, session tokens, and other accounts are not included.',
  'Accounts over the row, tag-link, or stored-text ceilings are refused whole; writing is not shortened.',
] as const;
