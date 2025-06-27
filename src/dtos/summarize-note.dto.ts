import { IsString } from 'class-validator';

export class SummarizeNoteDto {
  @IsString()
  noteContent: string;
}
