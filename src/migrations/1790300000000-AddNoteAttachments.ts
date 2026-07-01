import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoteAttachments1790300000000 implements MigrationInterface {
  name = 'AddNoteAttachments1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "note_attachments" (
        "id" SERIAL NOT NULL,
        "noteId" integer NOT NULL,
        "userId" integer NOT NULL,
        "filename" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "size" integer NOT NULL,
        "data" bytea NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_note_attachments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_note_attachments_note" ON "note_attachments" ("noteId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "note_attachments"
        ADD CONSTRAINT "FK_note_attachments_note"
        FOREIGN KEY ("noteId") REFERENCES "notes"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "note_attachments"
        ADD CONSTRAINT "FK_note_attachments_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "note_attachments" DROP CONSTRAINT "FK_note_attachments_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_attachments" DROP CONSTRAINT "FK_note_attachments_note"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_note_attachments_note"`,
    );
    await queryRunner.query(`DROP TABLE "note_attachments"`);
  }
}
