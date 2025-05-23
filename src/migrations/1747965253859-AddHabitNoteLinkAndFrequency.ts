import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitNoteLinkAndFrequency1747965253859 implements MigrationInterface {
    name = 'AddHabitNoteLinkAndFrequency1747965253859'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habit" ADD "intent" character varying`);
        await queryRunner.query(`ALTER TABLE "habit" ADD "affirmation" character varying`);
        await queryRunner.query(`ALTER TABLE "habit" ADD "color" character varying NOT NULL DEFAULT 'cyan'`);
        await queryRunner.query(`ALTER TABLE "habit" ADD "icon" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."habit_frequency_enum" AS ENUM('daily', 'weekly', 'monthly')`);
        await queryRunner.query(`ALTER TABLE "habit" ADD "frequency" "public"."habit_frequency_enum" NOT NULL DEFAULT 'daily'`);
        await queryRunner.query(`ALTER TABLE "habit" ADD "originNoteId" integer`);
        await queryRunner.query(`ALTER TABLE "habit" ADD CONSTRAINT "FK_52202c28f0e9699f9ce660fb815" FOREIGN KEY ("originNoteId") REFERENCES "notes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habit" DROP CONSTRAINT "FK_52202c28f0e9699f9ce660fb815"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "originNoteId"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "frequency"`);
        await queryRunner.query(`DROP TYPE "public"."habit_frequency_enum"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "icon"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "color"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "affirmation"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP COLUMN "intent"`);
    }

}
