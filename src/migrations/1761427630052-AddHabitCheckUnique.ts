import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitCheckUnique1761427630052 implements MigrationInterface {
    name = 'AddHabitCheckUnique1761427630052'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_35be1df1e1741caca455fbf422"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_35be1df1e1741caca455fbf422" ON "habit_check" ("date", "habitId") `);
    }

}
