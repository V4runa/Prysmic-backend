import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Habit } from './habit.entity';
import { HabitCheck } from './habit-check.entity';
import { HabitService } from './habit.service';
import { HabitController } from './habit.controller';
import { UserModule } from '../users/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Habit, HabitCheck]),
    forwardRef(() => UserModule),
  ],
  providers: [HabitService],
  controllers: [HabitController],
})
export class HabitModule {}
