import { Column, Entity, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Note } from "../notes/notes.entity";
import { User } from "../users/user.entity";

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

  @ManyToOne(() => User, (user) => user.tags, { onDelete: 'CASCADE' })
  user: User;
}
