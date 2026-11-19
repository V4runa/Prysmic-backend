import { MoodOption } from './mood-option.entity';

/** Palette fields returned by the API. The owning account is never included. */
export class MoodOptionResponse {
  id: number;
  label: string;
  emoji: string;
  color: string;
  sortOrder: number;
  createdAt: Date;

  static from(option: MoodOption): MoodOptionResponse {
    const response = new MoodOptionResponse();
    response.id = option.id;
    response.label = option.label;
    response.emoji = option.emoji;
    response.color = option.color;
    response.sortOrder = option.sortOrder;
    response.createdAt = option.createdAt;
    return response;
  }
}
