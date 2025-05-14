import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { NotesModule } from '../notes/notes.module';
import { AuthModule } from '../auth/auth.module';
import { HabitModule } from '../habits/habit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => NotesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => HabitModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
