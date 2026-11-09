import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two foreign keys still block deleting an account:
 * - habit.originNoteId is ON DELETE NO ACTION, so a note cannot go away
 *   while any habit still points at it.
 * - note_tags.tagsId is ON DELETE NO ACTION, so a tag cannot go away while
 *   a note is still linked to it.
 *
 * SET NULL keeps the other person's habit and clears only the dangling
 * pointer. CASCADE on the tag side removes the link and leaves the note.
 */
export class CascadeOwnedUserData1790600000000 implements MigrationInterface {
  name = 'CascadeOwnedUserData1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "habit" DROP CONSTRAINT IF EXISTS "FK_52202c28f0e9699f9ce660fb815"`,
    );
    await queryRunner.query(
      `ALTER TABLE "habit" ADD CONSTRAINT "FK_52202c28f0e9699f9ce660fb815" FOREIGN KEY ("originNoteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" DROP CONSTRAINT IF EXISTS "FK_993c9e3195b19f2928a42cf113b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "note_tags" DROP CONSTRAINT IF EXISTS "FK_993c9e3195b19f2928a42cf113b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "habit" DROP CONSTRAINT IF EXISTS "FK_52202c28f0e9699f9ce660fb815"`,
    );
    await queryRunner.query(
      `ALTER TABLE "habit" ADD CONSTRAINT "FK_52202c28f0e9699f9ce660fb815" FOREIGN KEY ("originNoteId") REFERENCES "notes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
