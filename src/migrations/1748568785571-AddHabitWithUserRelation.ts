import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitWithUserRelation1748568785571 implements MigrationInterface {
    name = 'AddHabitWithUserRelation1748568785571'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "habit" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" character varying, "intent" character varying, "affirmation" character varying, "color" character varying NOT NULL DEFAULT 'cyan', "icon" character varying, "frequency" "public"."habit_frequency_enum" NOT NULL DEFAULT 'daily', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "originNoteId" integer, "userId" integer, CONSTRAINT "PK_71654d5d0512043db43bac9abfc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "habit_check" ADD CONSTRAINT "FK_4f631d3373657e5bcfa7028e35e" FOREIGN KEY ("habitId") REFERENCES "habit"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "habit" ADD CONSTRAINT "FK_52202c28f0e9699f9ce660fb815" FOREIGN KEY ("originNoteId") REFERENCES "notes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "habit" ADD CONSTRAINT "FK_999000e9ce7a69128f471f0a3f9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habit" DROP CONSTRAINT "FK_999000e9ce7a69128f471f0a3f9"`);
        await queryRunner.query(`ALTER TABLE "habit" DROP CONSTRAINT "FK_52202c28f0e9699f9ce660fb815"`);
        await queryRunner.query(`ALTER TABLE "habit_check" DROP CONSTRAINT "FK_4f631d3373657e5bcfa7028e35e"`);
        await queryRunner.query(`DROP TABLE "habit"`);
    }

}
