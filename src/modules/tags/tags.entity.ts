import { Column, Entity, ManyToMany, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { Note } from "../notes/notes.entity";
import { User } from "../users/user.entity";
import { Task } from "../tasks/tasks.entity";

@Entity('tags')
@Unique(['name', 'user'])
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  color?: string; 

  @ManyToMany(() => Note, (note) => note.tags)
  notes: Note[]; 

  @ManyToMany(() => Task, (task) => task.tags)
  tasks: Task[];

  @ManyToOne(() => User, (user) => user.tags, { onDelete: 'CASCADE' })
  user: User;
}
