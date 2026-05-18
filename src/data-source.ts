import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
config();

import { Note } from './modules/notes/notes.entity';
import { Tag } from './modules/tags/tags.entity';
import { User } from './modules/users/user.entity';
import { Habit } from './modules/habits/habit.entity';
import { HabitCheck } from './modules/habits/habit-check.entity';
import { Task } from './modules/tasks/tasks.entity';
import { Mood } from './modules/moods/mood.entity';
import {
  getPostgresConnectionCore,
  type DbEnv,
} from './database/connection-options';

const isCompiled = __dirname.includes('dist');

export const dataSourceOptions: DataSourceOptions = {
  ...getPostgresConnectionCore(process.env as DbEnv),

  entities: [Note, Tag, User, Habit, HabitCheck, Task, Mood],
  migrations: [isCompiled ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
};

const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
