import { DataSource, DataSourceOptions } from 'typeorm';
import { Note } from './modules/notes/notes.entity';
import { Tag } from './modules/tags/tags.entity';
import { config } from 'dotenv';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'ai_notes',
  entities: [Note, Tag],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
};

const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
