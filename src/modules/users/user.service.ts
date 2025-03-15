import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";
import { CreateUserDto, UpdateUserDto } from "./type";
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {}

    // Create a new user
    async create(createUserDto: CreateUserDto): Promise<User> {
      const { password, email, username } = createUserDto;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = this.userRepository.create({
        email,
        username,
        password: hashedPassword,
      });
      return await this.userRepository.save(user);
    }

    // Find a user by email
    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email }, relations: ['notes'] });
    }

    // Find a user by username
    async findByUsername(username: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { username }, relations: ['notes'] });
    }

    // Get all users
    async findAll(): Promise<User[]> {
        return this.userRepository.find({ relations: ['notes'] });
    } 

    // Get a user by ID
    async findById(id: number): Promise<User | null> {
        return this.userRepository.findOne({ where: { id }, relations: ['notes'] });
    } 
    
   // Update a user
   async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
        throw new NotFoundException('User not found');
    }
    const { username, email, password } = updateUserDto;
    if(password) {
        user.password = await bcrypt.hash(password, 10);
    }
    if(username) {
        user.username = username;
    }
    if(email) {
        user.email = email;
    }
    return await this.userRepository.save(user);
   }
   
   // Delete a user

async remove(id: number): Promise<void> {
  const user = await this.userRepository.findOne({ where: { id }, relations: ['notes'] });
  if (!user) {
    throw new Error('User not found');
  }
  await this.userRepository.remove(user);
}

}