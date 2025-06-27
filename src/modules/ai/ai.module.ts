import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FamiliarEngineService } from './familiar-engine.service';

import { Note } from '../notes/notes.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Note, User])],
  controllers: [AiController],
  providers: [AiService, FamiliarEngineService],
})
export class AiModule {}
