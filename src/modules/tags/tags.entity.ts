import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Note } from "../notes/notes.entity";


@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  color?: string; 

  @ManyToMany(() => Note, (note) => note.tags)
  notes: Note[]; 
}
