// src/modules/moods/mood-option.service.ts

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MoodOption, DEFAULT_MOOD_OPTIONS } from './mood-option.entity';
import { CreateMoodOptionDto } from '../../dtos/create-mood-option.dto';
import { UpdateMoodOptionDto } from '../../dtos/update-mood-option.dto';

@Injectable()
export class MoodOptionService {
  constructor(
    @InjectRepository(MoodOption)
    private readonly repo: Repository<MoodOption>,
  ) {}

  /**
   * List a user's mood palette. The first time a user has none, seed the
   * defaults so existing and new users start with a usable set (they remain
   * fully editable/deletable afterwards).
   */
  async getAll(userId: number): Promise<MoodOption[]> {
    let options = await this.findForUser(userId);
    if (options.length === 0) {
      await this.seedDefaults(userId);
      options = await this.findForUser(userId);
    }
    return options;
  }

  async create(
    userId: number,
    dto: CreateMoodOptionDto,
  ): Promise<MoodOption> {
    const label = dto.label.trim();
    const existing = await this.repo.findOne({
      where: { user: { id: userId }, label },
    });
    if (existing) {
      throw new ConflictException('A mood with that name already exists.');
    }

    const last = await this.repo.findOne({
      where: { user: { id: userId } },
      order: { sortOrder: 'DESC' },
    });

    const option = this.repo.create({
      label,
      emoji: dto.emoji,
      color: dto.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      user: { id: userId } as any,
    });

    return this.repo.save(option);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateMoodOptionDto,
  ): Promise<MoodOption> {
    const option = await this.repo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!option) {
      throw new NotFoundException('Mood not found.');
    }

    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (label !== option.label) {
        const clash = await this.repo.findOne({
          where: { user: { id: userId }, label },
        });
        if (clash) {
          throw new ConflictException('A mood with that name already exists.');
        }
      }
      option.label = label;
    }
    if (dto.emoji !== undefined) option.emoji = dto.emoji;
    if (dto.color !== undefined) option.color = dto.color;

    return this.repo.save(option);
  }

  async remove(userId: number, id: number): Promise<{ message: string }> {
    const option = await this.repo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!option) {
      throw new NotFoundException('Mood not found.');
    }
    // Mood entries snapshot their label/emoji/color, so deleting an option is
    // always safe — past entries keep what they were saved with.
    await this.repo.remove(option);
    return { message: 'Mood deleted.' };
  }

  private findForUser(userId: number): Promise<MoodOption[]> {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  private async seedDefaults(userId: number): Promise<void> {
    const entities = DEFAULT_MOOD_OPTIONS.map((d, i) =>
      this.repo.create({
        label: d.label,
        emoji: d.emoji,
        color: d.color,
        sortOrder: i,
        user: { id: userId } as any,
      }),
    );
    try {
      await this.repo.save(entities);
    } catch {
      // A concurrent request may have seeded first; the unique (user,label)
      // index guards duplicates. Ignore and let the caller re-query.
    }
  }
}
