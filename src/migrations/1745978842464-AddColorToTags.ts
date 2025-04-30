import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColorToTags1745978842464 implements MigrationInterface {
    name = 'AddColorToTags1745978842464'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if column exists
        const table = await queryRunner.getTable("tags");
        const columnExists = table?.columns.find(column => column.name === "color");

        if (!columnExists) {
            await queryRunner.query(`ALTER TABLE "tags" ADD "color" character varying`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Check if column exists before dropping
        const table = await queryRunner.getTable("tags");
        const columnExists = table?.columns.find(column => column.name === "color");

        if (columnExists) {
            await queryRunner.query(`ALTER TABLE "tags" DROP COLUMN "color"`);
        }
    }
}
