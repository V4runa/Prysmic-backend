// src/modules/moods/mood.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Mood } from './mood.entity';
import { Repository } from 'typeorm';
import { CreateMoodDto } from '../../dtos/create-mood.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class MoodService {
  constructor(
    @InjectRepository(Mood)
    private readonly moodRepository: Repository<Mood>,
  ) {}

  /**
   * Get today's mood for a user, bucketed by the user's local day.
   */
  async getToday(userId: number, clientDate?: string): Promise<Mood | null> {
    const day = this.resolveDay(clientDate);

    return this.moodRepository.findOne({
      where: {
        user: { id: userId },
        date: day,
      },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create or overwrite today's mood (one per local calendar day).
   */
  async createOrUpdateToday(userId: number, dto: CreateMoodDto): Promise<Mood> {
    const day = this.resolveDay(dto.date);

    const existing = await this.moodRepository.findOne({
      where: {
        user: { id: userId },
        date: day,
      },
      relations: ['user'],
    });

    if (existing) {
      existing.emoji = dto.emoji;
      if (dto.note !== undefined) existing.note = dto.note;
      if (dto.moodType !== undefined) existing.moodType = dto.moodType;
      return this.moodRepository.save(existing);
    }

    const mood = this.moodRepository.create({
      emoji: dto.emoji,
      date: day,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.moodType !== undefined ? { moodType: dto.moodType } : {}),
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
   * Get moods for the user, newest first.
   * limit/offset are optional; when omitted all moods are returned.
   */
  async getAll(
    userId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Mood[]> {
    return this.moodRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      ...(options.limit !== undefined ? { take: options.limit } : {}),
      ...(options.offset !== undefined ? { skip: options.offset } : {}),
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
   * Prefer the client's local calendar day so buckets match the user's
   * timezone. Falls back to the server's current day when missing/invalid.
   */
  private resolveDay(clientDate?: string): string {
    if (clientDate && ISO_DATE.test(clientDate)) {
      return clientDate;
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
