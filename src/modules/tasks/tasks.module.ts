import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './tasks.entity';
import { TaskService } from './tasks.service';
import { TaskController } from './tasks.controller';
import { Tag } from '../tags/tags.entity';
import { User } from '../users/user.entity';
import { UserModule } from '../users/user.module';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Tag, User]),
    UserModule,
    TagsModule,
  ],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
