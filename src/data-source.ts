import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
config();

import { Note } from './modules/notes/notes.entity';
import { Tag } from './modules/tags/tags.entity';
import { User } from './modules/users/user.entity';
import { Habit } from './modules/habits/habit.entity';
import { HabitCheck } from './modules/habits/habit-check.entity';
import { Task } from './modules/tasks/tasks.entity';

const isCompiled = __dirname.includes('dist');
const isProd = process.env.NODE_ENV === 'production';
const enableSSL = process.env.DB_SSL === 'true';

const useUrl = !!process.env.DATABASE_URL;

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',

  ...(useUrl
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'db' || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'ai_notes',
      }),

  entities: [Note, Tag, User, Habit, HabitCheck, Task],
  migrations: [isCompiled ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],

  synchronize: false,

  logging: !isProd,

  ssl: enableSSL ? { rejectUnauthorized: false } : false,
};

const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
