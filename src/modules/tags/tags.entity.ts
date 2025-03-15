import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Note } from "../notes/notes.entity";


@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @ManyToMany(() => Note, (note) => note.tags)
  @JoinTable({ name: 'note_tags' })
  notes: Note[]; 
}
