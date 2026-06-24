import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarEvents1790200000000 implements MigrationInterface {
  name = 'AddCalendarEvents1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_event_recurrence_enum" AS ENUM('none', 'daily', 'weekly', 'monthly')`,
    );

    await queryRunner.query(`
      CREATE TABLE "calendar_event" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "allDay" boolean NOT NULL DEFAULT true,
        "startDate" date NOT NULL,
        "endDate" date,
        "startTime" TIME,
        "endTime" TIME,
        "color" character varying NOT NULL DEFAULT 'cyan',
        "location" character varying,
        "recurrence" "public"."calendar_event_recurrence_enum" NOT NULL DEFAULT 'none',
        "recurrenceEndDate" date,
        "linkedType" character varying(16),
        "linkedId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_calendar_event" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_calendar_event_user_start" ON "calendar_event" ("userId", "startDate")`,
    );

    await queryRunner.query(
      `ALTER TABLE "calendar_event"
        ADD CONSTRAINT "FK_calendar_event_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendar_event" DROP CONSTRAINT "FK_calendar_event_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_calendar_event_user_start"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_event"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_event_recurrence_enum"`,
    );
  }
}
