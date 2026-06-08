import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotesModule } from './modules/notes/notes.module';
import { TagsModule } from './modules/tags/tags.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/user.module';
import { HabitModule } from './modules/habits/habit.module';
import { TaskModule } from './modules/tasks/tasks.module';
import { getPostgresConnectionCore } from './database/connection-options';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...getPostgresConnectionCore({
          DATABASE_URL: config.get<string>('DATABASE_URL'),
          DB_HOST: config.get<string>('DB_HOST'),
          DB_PORT: config.get<string>('DB_PORT'),
          DB_USERNAME: config.get<string>('DB_USERNAME'),
          DB_PASSWORD: config.get<string>('DB_PASSWORD'),
          DB_NAME: config.get<string>('DB_NAME'),
          DB_SSL: config.get<string>('DB_SSL'),
          RUNNING_IN_DOCKER: config.get<string>('RUNNING_IN_DOCKER'),
          NODE_ENV: config.get<string>('NODE_ENV'),
        }),
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    UserModule,
    NotesModule,
    TagsModule,
    HabitModule,
    TaskModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
