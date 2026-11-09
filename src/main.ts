import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import helmet from 'helmet';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  // Fallback only. Rate limits prefer X-Real-IP, which Railway's edge sets to
  // the visitor. req.ip alone can be a shared proxy hop.
  const http = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: number) => void;
  };
  http.set('trust proxy', 1);
  const configService = app.get(ConfigService);
  const port = Number(configService.get<number>('PORT')) || 3001;

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = [
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((u) => u.trim())
      : []),
    'http://localhost:3000',
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port, '0.0.0.0');
  console.log(
    `🚀 Server running on port ${port} (allowed origins: ${allowedOrigins.join(', ') || 'none'})`,
  );
}
bootstrap();
