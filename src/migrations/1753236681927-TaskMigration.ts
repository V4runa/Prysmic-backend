import { MigrationInterface, QueryRunner } from "typeorm";

export class TaskMigration1753236681927 implements MigrationInterface {
    name = 'TaskMigration1753236681927'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."task_priority_enum" AS ENUM('1', '2', '3')
        `);
        await queryRunner.query(`
            CREATE TABLE "task" (
                "id" SERIAL NOT NULL,
                "title" character varying NOT NULL,
                "description" character varying,
                "isComplete" boolean NOT NULL DEFAULT false,
                "isArchived" boolean NOT NULL DEFAULT false,
                "priority" "public"."task_priority_enum" NOT NULL DEFAULT '2',
                "dueDate" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "archivedAt" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" integer,
                CONSTRAINT "PK_fb213f79ee45060ba925ecd576e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "task_tags_tags" (
                "taskId" integer NOT NULL,
                "tagsId" integer NOT NULL,
                CONSTRAINT "PK_3164b85e5615433116e92980767" PRIMARY KEY ("taskId", "tagsId")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a82ea4c3f2947711e29e046eaf" ON "task_tags_tags" ("taskId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c6eff541ff72c801881f22ad11" ON "task_tags_tags" ("tagsId")
        `);
        await queryRunner.query(`
            ALTER TABLE "task"
            ADD CONSTRAINT "FK_f316d3fe53497d4d8a2957db8b9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags_tags"
            ADD CONSTRAINT "FK_a82ea4c3f2947711e29e046eafa" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags_tags"
            ADD CONSTRAINT "FK_c6eff541ff72c801881f22ad118" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "task_tags_tags" DROP CONSTRAINT "FK_c6eff541ff72c801881f22ad118"
        `);
        await queryRunner.query(`
            ALTER TABLE "task_tags_tags" DROP CONSTRAINT "FK_a82ea4c3f2947711e29e046eafa"
        `);
        await queryRunner.query(`
            ALTER TABLE "task" DROP CONSTRAINT "FK_f316d3fe53497d4d8a2957db8b9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c6eff541ff72c801881f22ad11"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a82ea4c3f2947711e29e046eaf"
        `);
        await queryRunner.query(`
            DROP TABLE "task_tags_tags"
        `);
        await queryRunner.query(`
            DROP TABLE "task"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."task_priority_enum"
        `);
    }

}
