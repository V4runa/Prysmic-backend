import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A task can be created from a note, the same way a habit can.
 * The pointer is nullable. Deleting the note clears it and leaves the task.
 */
export class AddTaskOriginNote1790900000000 implements MigrationInterface {
  name = 'AddTaskOriginNote1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "task" ADD "originNoteId" integer`);
    await queryRunner.query(
      `ALTER TABLE "task" ADD CONSTRAINT "FK_task_originNoteId_notes" FOREIGN KEY ("originNoteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task" DROP CONSTRAINT "FK_task_originNoteId_notes"`,
    );
    await queryRunner.query(`ALTER TABLE "task" DROP COLUMN "originNoteId"`);
  }
}
