// src/modules/moods/mood.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mood } from './mood.entity';
import { MoodService } from './mood.service';
import { MoodController } from './mood.controller';
import { UserModule } from '../users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mood]),
    forwardRef(() => UserModule),
],
  providers: [MoodService],
  controllers: [MoodController],
})
export class MoodModule {}
