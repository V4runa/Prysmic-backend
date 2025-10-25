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

function todayWithCutoff(cutoffHour = 3): string {
  const now = new Date();
  const shifted = new Date(now.getTime() - cutoffHour * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function isoDateToEpoch(d: string): number {
  return new Date(`${d}T00:00:00.000Z`).getTime();
}

function epochToIsoDate(t: number): string {
  const d = new Date(t);
  return d.toISOString().slice(0, 10);
}

function prevDay(d: string): string {
  return epochToIsoDate(isoDateToEpoch(d) - 24 * 60 * 60 * 1000);
}

function computeStreaks(dates: string[], cutoffHour = 3): {
  currentStreak: number;
  longestStreak: number;
  checkedToday: boolean;
} {
  if (!dates || dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, checkedToday: false };
  }

  const today = todayWithCutoff(cutoffHour);
  const set = new Set(dates);

  const checkedToday = set.has(today);

  let currentStreak = 0;
  let cursor = checkedToday ? today : prevDay(today);

  if (checkedToday || set.has(cursor)) {
    while (set.has(cursor)) {
      currentStreak += 1;
      cursor = prevDay(cursor);
    }
  }

  const sorted = Array.from(set.values()).sort(
    (a, b) => isoDateToEpoch(a) - isoDateToEpoch(b),
  );
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = isoDateToEpoch(sorted[i - 1]);
    const cur = isoDateToEpoch(sorted[i]);
    if (cur - prev === 24 * 60 * 60 * 1000) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  if (sorted.length === 0) longestStreak = 0;

  return { currentStreak, longestStreak, checkedToday };
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
    const habits = await this.habitRepo.find({
      where: { userId, isActive: true },
      relations: ['checks'],
      order: { createdAt: 'DESC' },
    });

    return habits.map((h) => {
      const dates = (h.checks ?? []).map((c) => c.date);
      const s = computeStreaks(dates);

      return {
        ...h,
        checkedToday: s.checkedToday,
        currentStreak: s.currentStreak,
        longestStreak: s.longestStreak,
      } as Habit & {
        checkedToday: boolean;
        currentStreak: number;
        longestStreak: number;
      };
    });
  }

  async getHabitById(habitId: number, userId: number) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, userId },
      relations: ['checks'],
    });
    if (!habit)
      throw new NotFoundException('Habit not found or you do not have access.');

    const dates = (habit.checks ?? []).map((c) => c.date);
    const s = computeStreaks(dates);

    return {
      ...habit,
      checkedToday: s.checkedToday,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
    } as Habit & {
      checkedToday: boolean;
      currentStreak: number;
      longestStreak: number;
    };
  }

  async updateHabit(habitId: number, userId: number, dto: UpdateHabitDto) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, userId },
    });
    if (!habit) throw new NotFoundException('Habit not found');

    const normalized: UpdateHabitDto = {
      ...dto,
      frequency:
        dto.frequency !== undefined
          ? parseFrequency(dto.frequency)
          : habit.frequency,
    };

    this.habitRepo.merge(habit, normalized);
    await this.habitRepo.save(habit);

    return this.getHabitById(habitId, userId);
  }

  async deleteHabit(habitId: number, userId: number) {
    const habit = await this.habitRepo.findOne({
      where: { id: habitId, userId },
    });
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

    const today = todayWithCutoff(3);

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
