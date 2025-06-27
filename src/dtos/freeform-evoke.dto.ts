import { IsString } from 'class-validator';

export class FreeformEvokeDto {
  @IsString()
  input: string;

  @IsString()
  familiarName: string;
}
