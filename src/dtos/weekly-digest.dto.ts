import { IsArray, IsString } from 'class-validator';

export class WeeklyDigestDto {
  @IsArray()
  @IsString({ each: true })
  noteContents: string[];
}
