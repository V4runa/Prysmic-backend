import { Mood } from './mood.entity';

/** Mood fields returned by the API. The owning account is never included. */
export class MoodResponse {
  id: number;
  moodType: string;
  emoji: string;
  color?: string;
  note?: string;
  date: string;
  backfilled: boolean;
  createdAt: Date;

  static from(mood: Mood): MoodResponse {
    const response = new MoodResponse();
    response.id = mood.id;
    response.moodType = mood.moodType;
    response.emoji = mood.emoji;
    response.color = mood.color;
    response.note = mood.note;
    response.date = mood.date;
    response.backfilled = mood.backfilled;
    response.createdAt = mood.createdAt;
    return response;
  }
}
