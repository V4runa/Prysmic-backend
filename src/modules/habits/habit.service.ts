import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Habit } from './habit.entity';
import { HabitCheck } from './habit-check.entity';
import { User } from '../users/user.entity';

@Injectable()
export class HabitService {
  constructor(
    @InjectRepository(Habit)
    private habitRepo: Repository<Habit>,

    @InjectRepository(HabitCheck)
    private checkRepo: Repository<HabitCheck>,
  ) {}

  async createHabit(user: User, name: string, description?: string) {
    const habit = this.habitRepo.create({ name, description, user: { id: user.id } });
    return this.habitRepo.save(habit);
  }

  async getHabits(user: User) {
    return this.habitRepo.find({
      where: { user: { id: user.id }, isActive: true },
      relations: ['checks'],
    });
  }

  async toggleCheck(habitId: number, user: User) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, user: { id: user.id } },
    });

    if (!habit) throw new NotFoundException('Habit not found');

    const today = new Date().toISOString().split('T')[0];

    const existingCheck = await this.checkRepo.findOne({
      where: { habit, date: today },
    });

    if (existingCheck) {
      await this.checkRepo.remove(existingCheck); // Uncheck
      return { checked: false };
    } else {
      const newCheck = this.checkRepo.create({ habit, date: today });
      await this.checkRepo.save(newCheck);
      return { checked: true };
    }
  }

  async deleteHabit(habitId: number, user: User) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, user: { id: user.id } },
    });
    if (!habit) throw new NotFoundException('Habit not found');
    habit.isActive = false;
    return this.habitRepo.save(habit);
  }

  async getHabitById(habitId: number, user: User) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, user: { id: user.id } },
      relations: ['checks'],
    });
    if (!habit) throw new NotFoundException('Habit not found');
    return habit;
  }

  async updateHabit(
    habitId: number,
    user: User,
    updates: Partial<{ name: string; description: string; isActive: boolean }>,
  ) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, user: { id: user.id } },
    });
    if (!habit) throw new NotFoundException('Habit not found');

    Object.assign(habit, updates);
    return this.habitRepo.save(habit);
  }
}
