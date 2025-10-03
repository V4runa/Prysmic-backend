// src/modules/moods/mood.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Mood } from './mood.entity';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { CreateMoodDto } from '../../dtos/create-mood.dto';

@Injectable()
export class MoodService {
  constructor(
    @InjectRepository(Mood)
    private readonly moodRepository: Repository<Mood>,
  ) {}

  /**
   * Get today's mood for a user
   */
  async getToday(userId: number): Promise<Mood | null> {
    const today = this.getStartOfToday();

    return this.moodRepository.findOne({
      where: {
        user: { id: userId },
        createdAt: MoreThanOrEqual(today),
      },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create or overwrite today's mood
   */
  async createOrUpdateToday(userId: number, dto: CreateMoodDto): Promise<Mood> {
    const today = this.getStartOfToday();

    const existing = await this.moodRepository.findOne({
      where: {
        user: { id: userId },
        createdAt: MoreThanOrEqual(today),
      },
      relations: ['user'],
    });

    if (existing) {
      existing.emoji = dto.emoji;
      return this.moodRepository.save(existing);
    }

    const mood = this.moodRepository.create({
      emoji: dto.emoji,
      user: { id: userId } as any,
    });

    return this.moodRepository.save(mood);
  }

  /**
   * Get last 10 mood entries
   */
  async getHistory(userId: number): Promise<Mood[]> {
    return this.moodRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  /**
   * Get all moods for the user (no limit)
   */
  async getAll(userId: number): Promise<Mood[]> {
    return this.moodRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete a mood by ID (only if it belongs to the user)
   */
  async deleteById(userId: number, moodId: number): Promise<{ message: string }> {
    const mood = await this.moodRepository.findOne({
      where: { id: moodId, user: { id: userId } },
    });

    if (!mood) {
      throw new NotFoundException('Mood entry not found');
    }

    await this.moodRepository.remove(mood);

    return { message: 'Mood entry deleted successfully' };
  }

  /**
   * Utility — returns start of current day (00:00)
   */
  private getStartOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
