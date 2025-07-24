import { MigrationInterface, QueryRunner } from "typeorm";

export class WhateverNameYouWant1753316936942 implements MigrationInterface {
    name = 'WhateverNameYouWant1753316936942'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "task_tags" DROP CONSTRAINT "FK_a82ea4c3f2947711e29e046eafa"
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags" DROP CONSTRAINT "FK_c6eff541ff72c801881f22ad118"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a82ea4c3f2947711e29e046eaf"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c6eff541ff72c801881f22ad11"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1470ad368e79cb5636163a4bf8" ON "task_tags" ("taskId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_858daeb22a80374e11b779fc72" ON "task_tags" ("tagsId")
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags"
            ADD CONSTRAINT "FK_1470ad368e79cb5636163a4bf8d" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags"
            ADD CONSTRAINT "FK_858daeb22a80374e11b779fc72a" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "task_tags" DROP CONSTRAINT "FK_858daeb22a80374e11b779fc72a"
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags" DROP CONSTRAINT "FK_1470ad368e79cb5636163a4bf8d"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_858daeb22a80374e11b779fc72"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1470ad368e79cb5636163a4bf8"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c6eff541ff72c801881f22ad11" ON "task_tags" ("tagsId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a82ea4c3f2947711e29e046eaf" ON "task_tags" ("taskId")
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags"
            ADD CONSTRAINT "FK_c6eff541ff72c801881f22ad118" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags"
            ADD CONSTRAINT "FK_a82ea4c3f2947711e29e046eafa" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    }

}
