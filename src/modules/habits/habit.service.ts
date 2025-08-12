import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Habit } from './habit.entity';
import { HabitCheck } from './habit-check.entity';
import { CreateHabitDto } from '../../dtos/create-habit.dto';
import { UpdateHabitDto } from '../../dtos/update-habit.dto';
import { HabitFrequency } from '../../enums/habit-frequency.enum';

function parseFrequency(value?: string): HabitFrequency {
  if (Object.values(HabitFrequency).includes(value as HabitFrequency)) {
    return value as HabitFrequency;
  }
  return HabitFrequency.DAILY;
}

@Injectable()
export class HabitService {
  constructor(
    @InjectRepository(Habit)
    private habitRepo: Repository<Habit>,
    @InjectRepository(HabitCheck)
    private checkRepo: Repository<HabitCheck>,
  ) {}

  async createHabit(userId: number, dto: CreateHabitDto) {
    const habit = this.habitRepo.create({
      ...dto,
      frequency: parseFrequency(dto.frequency),
      userId,
    });
    return this.habitRepo.save(habit);
  }

  async getHabits(userId: number) {
    return this.habitRepo.find({
      where: { userId, isActive: true },
      relations: ['checks'],
      order: { createdAt: 'DESC' },
    });
  }

  async getHabitById(habitId: number, userId: number) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, userId },
      relations: ['checks'],
    });
    if (!habit) throw new NotFoundException('Habit not found or you do not have access.');
    return habit;
  }

  async updateHabit(habitId: number, userId: number, dto: UpdateHabitDto) {
    const habit = await this.habitRepo.findOne({ where: { id: habitId, userId } });
    if (!habit) throw new NotFoundException('Habit not found');

    Object.assign(habit, {
      ...dto,
      frequency: dto.frequency ? parseFrequency(dto.frequency) : habit.frequency,
    });
    return this.habitRepo.save(habit);
  }

  async deleteHabit(habitId: number, userId: number) {
    const habit = await this.habitRepo.findOne({ where: { id: habitId, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    habit.isActive = false;
    return this.habitRepo.save(habit);
  }

  async toggleCheck(habitId: number, userId: number) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, userId },
      relations: ['checks'],
    });
    if (!habit) throw new NotFoundException('Habit not found');

    const today = new Date().toISOString().split('T')[0];

    const existing = await this.checkRepo.findOne({
      where: { habit: { id: habit.id }, date: today },
      relations: ['habit'],
    });

    if (existing) {
      await this.checkRepo.remove(existing);
      return { checked: false };
    }

    const newCheck = this.checkRepo.create({ habit, date: today });
    await this.checkRepo.save(newCheck);
    return { checked: true };
  }
}
