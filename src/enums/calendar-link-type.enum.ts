/**
 * The kinds of existing entities a native calendar event may optionally point
 * at. Stored as a soft (type, id) reference rather than three hard foreign keys
 * so new linkable modules can be added later without a schema migration. The
 * link is resolved at read time and silently dropped if the target no longer
 * exists, which keeps deletes in other modules from leaving broken events.
 */
export enum CalendarLinkType {
  NOTE = 'note',
  TASK = 'task',
  HABIT = 'habit',
}
