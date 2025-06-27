import { IsArray, IsString } from 'class-validator';

export class ExportChatDto {
  @IsArray()
  @IsString({ each: true })
  dialogue: string[];
}
