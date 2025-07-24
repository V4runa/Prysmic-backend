import { MigrationInterface, QueryRunner } from "typeorm";

export class FixTaskTagsTableName1753310586900 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename the table from task_tags_tags to task_tags
        await queryRunner.query(`
            ALTER TABLE "task_tags_tags" RENAME TO "task_tags"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert the table name back to task_tags_tags
        await queryRunner.query(`
            ALTER TABLE "task_tags" RENAME TO "task_tags_tags"
        `);
    }

}
