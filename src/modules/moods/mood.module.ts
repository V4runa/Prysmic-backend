// src/modules/moods/mood.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mood } from './mood.entity';
import { MoodOption } from './mood-option.entity';
import { MoodService } from './mood.service';
import { MoodController } from './mood.controller';
import { MoodOptionService } from './mood-option.service';
import { MoodOptionController } from './mood-option.controller';
import { UserModule } from '../users/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Mood, MoodOption]),
    forwardRef(() => UserModule),
  ],
  providers: [MoodService, MoodOptionService],
  controllers: [MoodController, MoodOptionController],
})
export class MoodModule {}
