/** Response ceilings. Crossing one refuses the whole download so a file is never partial. */
export const EXPORT_LIMITS = {
  notes: 2000,
  attachments: 20000,
  tags: 2000,
  tasks: 5000,
  habits: 1000,
  habitChecks: 20000,
  moods: 5000,
  moodOptions: 200,
  calendarEvents: 5000,
} as const;

export const EXPORT_FORMAT = 'prysmic.account-export';
export const EXPORT_VERSION = 1;

export const EXPORT_LIMITATIONS = [
  'Attachment file bytes are not included; only filename, type, and size.',
  'This snapshot is not a restore format and is not imported by the server.',
  'Passwords, session tokens, and other accounts are not included.',
] as const;
