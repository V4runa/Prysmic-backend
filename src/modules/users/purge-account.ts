import { EntityManager } from 'typeorm';
import { rowsFromQuery } from '../../database/query-rows';

/**
 * Every row that belongs to one account, in an order that satisfies the
 * foreign keys even where ON DELETE is still NO ACTION.
 *
 * Audited relations (user FK unless noted):
 * - notes, tags, note_tags (notesId / tagsId)
 * - habit (userId, and originNoteId -> notes), habit_check (habitId)
 * - task (userId, and originNoteId -> notes), task_tags (taskId / tagsId)
 * - mood (logs), mood_options (custom moods)
 * - calendar_event
 * - note_attachments (userId and noteId)
 * - auth_tokens
 * - users
 *
 * originNoteId on someone else's habit or task is set to null. That row
 * stays. Those pointers are the only other-account columns this touches,
 * and only because the note they name is about to disappear.
 */
const STATEMENTS = [
  `DELETE FROM "note_tags"
   WHERE "notesId" IN (SELECT "id" FROM "notes" WHERE "userId" = $1)
      OR "tagsId" IN (SELECT "id" FROM "tags" WHERE "userId" = $1)`,
  `DELETE FROM "task_tags"
   WHERE "taskId" IN (SELECT "id" FROM "task" WHERE "userId" = $1)
      OR "tagsId" IN (SELECT "id" FROM "tags" WHERE "userId" = $1)`,
  `DELETE FROM "habit_check"
   WHERE "habitId" IN (SELECT "id" FROM "habit" WHERE "userId" = $1)`,
  `UPDATE "habit"
   SET "originNoteId" = NULL
   WHERE "originNoteId" IN (SELECT "id" FROM "notes" WHERE "userId" = $1)`,
  `UPDATE "task"
   SET "originNoteId" = NULL
   WHERE "originNoteId" IN (SELECT "id" FROM "notes" WHERE "userId" = $1)`,
  `DELETE FROM "note_attachments"
   WHERE "userId" = $1
      OR "noteId" IN (SELECT "id" FROM "notes" WHERE "userId" = $1)`,
  `DELETE FROM "calendar_event" WHERE "userId" = $1`,
  `DELETE FROM "mood" WHERE "userId" = $1`,
  `DELETE FROM "mood_options" WHERE "userId" = $1`,
  `DELETE FROM "habit" WHERE "userId" = $1`,
  `DELETE FROM "task" WHERE "userId" = $1`,
  `DELETE FROM "notes" WHERE "userId" = $1`,
  `DELETE FROM "tags" WHERE "userId" = $1`,
  `DELETE FROM "auth_tokens" WHERE "userId" = $1`,
];

/** Removes the account and everything it owns. False when the user is already gone. */
export async function purgeAccount(
  manager: EntityManager,
  userId: number,
): Promise<boolean> {
  const locked = rowsFromQuery<{ id: number }>(
    await manager.query(`SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE`, [
      userId,
    ]),
  );
  if (locked.length === 0) return false;

  for (const sql of STATEMENTS) {
    await manager.query(sql, [userId]);
  }

  const deleted = rowsFromQuery<{ id: number }>(
    await manager.query(`DELETE FROM "users" WHERE "id" = $1 RETURNING "id"`, [
      userId,
    ]),
  );
  return deleted.length > 0;
}
