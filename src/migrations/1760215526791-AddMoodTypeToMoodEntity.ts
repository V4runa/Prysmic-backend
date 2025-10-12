import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMoodTypeToMoodEntity1760215526791 implements MigrationInterface {
    name = 'AddMoodTypeToMoodEntity1760215526791'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mood" ADD "moodType" character varying(24) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mood" DROP COLUMN "moodType"`);
    }

}
