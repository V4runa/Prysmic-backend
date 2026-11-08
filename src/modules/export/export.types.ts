export interface ExportCoverageEntry {
  included: true;
  count: number;
}

export interface ExportNoteCoverage extends ExportCoverageEntry {
  content: 'html-and-text';
  attachments: 'metadata-only-bytes-excluded';
}

export interface ExportTagCoverage extends ExportCoverageEntry {
  linkedFrom: ['notes', 'tasks'];
}

export interface ExportHabitCoverage extends ExportCoverageEntry {
  checks: 'nested-on-each-habit';
}

export interface AccountExport {
  format: 'prysmic.account-export';
  version: 1;
  exportedAt: string;
  limitations: readonly string[];
  coverage: {
    notes: ExportNoteCoverage;
    tags: ExportTagCoverage;
    tasks: ExportCoverageEntry;
    habits: ExportHabitCoverage;
    habitChecks: ExportCoverageEntry;
    moods: ExportCoverageEntry;
    moodOptions: ExportCoverageEntry;
    calendarEvents: ExportCoverageEntry;
  };
  account: {
    id: number;
    username: string;
    email: string;
    createdAt: string;
  };
  tags: ExportTag[];
  notes: ExportNote[];
  tasks: ExportTask[];
  habits: ExportHabit[];
  moodOptions: ExportMoodOption[];
  moods: ExportMood[];
  calendarEvents: ExportCalendarEvent[];
}

export interface ExportTag {
  id: number;
  name: string;
  color: string | null;
}

export interface ExportAttachment {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  bytesIncluded: false;
}

export interface ExportNote {
  id: number;
  title: string;
  contentHtml: string;
  contentText: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tagIds: number[];
  attachments: ExportAttachment[];
}

export interface ExportTask {
  id: number;
  title: string;
  description: string | null;
  isComplete: boolean;
  isArchived: boolean;
  priority: number;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: number[];
}

export interface ExportHabitCheck {
  id: number;
  date: string;
  createdAt: string;
}

export interface ExportHabit {
  id: number;
  name: string;
  description: string | null;
  intent: string | null;
  affirmation: string | null;
  color: string;
  icon: string | null;
  frequency: string;
  isActive: boolean;
  originNoteId: number | null;
  createdAt: string;
  updatedAt: string;
  checks: ExportHabitCheck[];
}

export interface ExportMoodOption {
  id: number;
  label: string;
  emoji: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface ExportMood {
  id: number;
  moodType: string;
  emoji: string;
  color: string | null;
  note: string | null;
  date: string;
  backfilled: boolean;
  createdAt: string;
}

export interface ExportCalendarLink {
  type: 'note' | 'task' | 'habit';
  id: number;
}

export interface ExportCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  allDay: boolean;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string;
  location: string | null;
  recurrence: string;
  recurrenceEndDate: string | null;
  link: ExportCalendarLink | null;
  createdAt: string;
  updatedAt: string;
}
