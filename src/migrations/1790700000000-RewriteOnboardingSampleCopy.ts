import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces untouched onboarding samples with the plainer starter copy.
 *
 * Each statement matches the original seed on every copy column it changes
 * (notes: title + content; habits: name + description + intent + affirmation;
 * tasks: title + description). A single edited field leaves that row as it is.
 * Pins, colors, icons, frequency, priority, completion, and timestamps are
 * not written.
 *
 * Rolling back uses the same rule in reverse: a row returns to the old sample
 * only when it still equals the replacement exactly.
 */

const OLD_START_HERE = [
  'Welcome, wanderer.',
  '',
  'Prysmic is an extension to your cognition — a calm place to set down what ' +
    'your mind would rather not carry alone. Here is the lay of the land:',
  '',
  '\u2022 Notes — capture thoughts the moment they arrive. This very note is one.',
  '\u2022 Tag Codex — give your notes color and meaning so you can find a single ' +
    'thread later. The tags on these samples are a starting palette.',
  '\u2022 Contracts — your habits, framed as quiet promises to yourself. Each ' +
    'check-in grows a streak.',
  '\u2022 Tasks — the things that need doing, sorted by what matters most.',
  '\u2022 Moods — a gentle daily check-in with how you actually feel.',
  '',
  'Everything you see right now is a sample, placed here to show you around. ' +
    'None of it is precious. Edit it, retag it, or delete it entirely — the ' +
    'space is yours.',
  '',
  'When you are ready, capture your first real thought. We will be here.',
].join('\n');

const NEW_START_HERE = [
  'Welcome, wanderer.',
  '',
  'Prysmic is a place to keep your notes, moods, and the commitments you ' +
    "want to follow through on. Here's what's here:",
  '',
  '\u2022 Notes — write down ideas and thoughts, and come back to them later. This note is one of them.',
  '\u2022 Tag Codex — create your own tags so you can organize notes and find them again. The tags on these samples are a starting set.',
  '\u2022 Contracts — habits framed as personal commitments, with check-ins and streaks.',
  '\u2022 Tasks — things you need to do, organized by what matters most.',
  '\u2022 Moods — check in with how you feel, and see it next to the rest of your day.',
  '',
  'Everything you see right now is a sample, so you can look around. Edit ' +
    "it, retag it, or delete it — it's yours.",
  '',
  "When you're ready, write your first real note.",
].join('\n');

type CopyFields = Record<string, string>;

export interface SampleRewrite {
  table: 'notes' | 'habit' | 'task';
  fields: readonly string[];
  from: CopyFields;
  to: CopyFields;
}

export const onboardingSampleRewrites: readonly SampleRewrite[] = [
  {
    table: 'notes',
    fields: ['title', 'content'],
    from: { title: '\u2726 Start Here', content: OLD_START_HERE },
    to: { title: '\u2726 Start Here', content: NEW_START_HERE },
  },
  {
    table: 'notes',
    fields: ['title', 'content'],
    from: {
      title: 'A thought worth keeping',
      content:
        'The mind is for having ideas, not holding them. The moment a ' +
        'thought feels worth keeping, give it a home here — then let it go ' +
        'from your head.\n\nTry it now: edit this note, or tag it ' +
        'differently. Nothing here is precious. It is yours to reshape.',
    },
    to: {
      title: 'A thought worth keeping',
      content:
        'When an idea feels worth keeping, write it down here so you can ' +
        'find it later.\n\nTry it now: edit this note, or tag it ' +
        'differently. These samples are yours to change or delete.',
    },
  },
  {
    table: 'notes',
    fields: ['title', 'content'],
    from: {
      title: 'Ideas are fragile things',
      content:
        'Half-formed ideas evaporate if you wait for them to be perfect. ' +
        'Capture the spark, not the finished flame.\n\nThis note is tagged ' +
        '"Ideas" — visit the Tag Codex to see how tags let you filter the ' +
        'noise down to a single thread of thought.',
    },
    to: {
      title: "An idea I'm still working on",
      content:
        "You don't need a finished thought to start a note. Write the " +
        'idea down as it is.\n\nThis note is tagged Ideas — open the Tag ' +
        'Codex to see how tags help you find notes later.',
    },
  },
  {
    table: 'habit',
    fields: ['name', 'description', 'intent', 'affirmation'],
    from: {
      name: 'Morning stillness',
      description: 'A few quiet minutes before the day asks anything of me.',
      intent: 'Begin each day from calm rather than from urgency.',
      affirmation: 'I meet the morning on my own terms.',
    },
    to: {
      name: 'Morning pause',
      description: 'A few quiet minutes at the start of the day.',
      intent: 'Start the day before jumping into everything else.',
      affirmation: 'I can take a few minutes for myself this morning.',
    },
  },
  {
    table: 'habit',
    fields: ['name', 'description', 'intent', 'affirmation'],
    from: {
      name: 'Move the body',
      description: 'Motion of any kind — a walk, a stretch, a full session.',
      intent: 'Honor the body that carries every thought I have.',
      affirmation: 'Movement is a gift I give myself, not a debt I owe.',
    },
    to: {
      name: 'Move the body',
      description: 'A walk, a stretch, or a workout — whatever fits the day.',
      intent: 'Get some movement in each day.',
      affirmation: 'A little movement is enough.',
    },
  },
  {
    table: 'habit',
    fields: ['name', 'description', 'intent', 'affirmation'],
    from: {
      name: 'Read before sleep',
      description:
        'Trade the glow of a screen for a few pages of something real.',
      intent: 'End the day with wonder instead of noise.',
      affirmation:
        'I let my last thoughts of the day be chosen, not fed to me.',
    },
    to: {
      name: 'Read before sleep',
      description: 'Read a few pages before bed instead of scrolling.',
      intent: 'Wind down with a book at the end of the day.',
      affirmation: 'I can choose how the day ends.',
    },
  },
  {
    table: 'task',
    fields: ['title', 'description'],
    from: {
      title: 'Make Prysmic yours — edit or delete these samples',
      description:
        'This whole starter set is just a demonstration. Change anything, ' +
        'or clear it all out. The empty space that remains is the point.',
    },
    to: {
      title: 'Make Prysmic yours — edit or delete these samples',
      description:
        'This starter set is just a demonstration. Change anything, or clear it all out.',
    },
  },
  {
    table: 'task',
    fields: ['title', 'description'],
    from: {
      title: 'Capture one real thought today',
      description: 'Open Notes and write a single line that is truly yours.',
    },
    to: {
      title: 'Capture one real thought today',
      description: 'Open Notes and write something of your own.',
    },
  },
];

export class RewriteOnboardingSampleCopy1790700000000
  implements MigrationInterface
{
  name = 'RewriteOnboardingSampleCopy1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applySampleRewrites(queryRunner, 'up');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await applySampleRewrites(queryRunner, 'down');
  }
}

async function applySampleRewrites(
  queryRunner: QueryRunner,
  direction: 'up' | 'down',
): Promise<void> {
  for (const rewrite of onboardingSampleRewrites) {
    const match = direction === 'up' ? rewrite.from : rewrite.to;
    const next = direction === 'up' ? rewrite.to : rewrite.from;
    await rewriteRow(queryRunner, rewrite.table, rewrite.fields, match, next);
  }
}

async function rewriteRow(
  queryRunner: QueryRunner,
  table: SampleRewrite['table'],
  fields: readonly string[],
  match: CopyFields,
  next: CopyFields,
): Promise<void> {
  const assignments = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .join(', ');
  const predicates = fields
    .map((field, index) => `"${field}" = $${fields.length + index + 1}`)
    .join(' AND ');
  await queryRunner.query(
    `UPDATE "${table}" SET ${assignments} WHERE ${predicates}`,
    [...fieldValues(next, fields), ...fieldValues(match, fields)],
  );
}

function fieldValues(copy: CopyFields, fields: readonly string[]): string[] {
  return fields.map((field) => {
    const value = copy[field];
    if (typeof value !== 'string') {
      throw new Error(`Missing onboarding sample field "${field}"`);
    }
    return value;
  });
}
