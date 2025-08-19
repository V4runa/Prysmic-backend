import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import helmet from 'helmet';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
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
    process.env.FRONTEND_URL,  
    'http://localhost:3000',     
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on port ${port} (allowed origins: ${allowedOrigins.join(', ') || 'none'})`);
}
bootstrap();
