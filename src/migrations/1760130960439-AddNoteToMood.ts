import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNoteToMood1760130960439 implements MigrationInterface {
    name = 'AddNoteToMood1760130960439'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habit" DROP CONSTRAINT "FK_habit_user"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_user"`);
        await queryRunner.query(`DROP INDEX "public"."idx_habit_userId"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notes_userId"`);
        await queryRunner.query(`ALTER TABLE "mood" ADD "note" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mood" DROP COLUMN "note"`);
        await queryRunner.query(`CREATE INDEX "idx_notes_userId" ON "notes" ("userId") `);
        await queryRunner.query(`CREATE INDEX "idx_habit_userId" ON "habit" ("userId") `);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_notes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "habit" ADD CONSTRAINT "FK_habit_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
