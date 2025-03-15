import { Controller, Get, Post, Body, Param, Delete, Put, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto } from './type';
import { User } from './user.entity';

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    // Create a new user
    @Post()
    async create(@Body() createUserDto: CreateUserDto): Promise<User> {
        return this.userService.create(createUserDto);
    }

    // Get all users
    @Get()
    async findAll(): Promise<User[]> {
        return this.userService.findAll();
    }

    // Get a user by ID
    @Get(':id')
    async findById(@Param('id') id: number): Promise<User> {
        const user = await this.userService.findById(id);
        if(!user) {
          throw new NotFoundException('User not found');
        }
        return user;
    }

    // Get a user by username
    @Get('username/:username')
    async findByUsername(@Param('username') username: string): Promise<User | null> {
        const user = await this.userService.findByUsername(username);
        return user;
    }

    // Get a user by email
    @Get('email/:email')
    async findByEmail(@Param('email') email: string): Promise<User | null> {
        const user = await this.userService.findByEmail(email);
        return user;
    }

    // Update a user
    @Put(':id')
    async update(@Param('id') id: number, @Body() updateUserDto: UpdateUserDto): Promise<User> {
        return this.userService.update(id, updateUserDto);
    }

    // Delete a user
    @Delete(':id')
    async remove(@Param('id') id: number): Promise<void> {
        return this.userService.remove(id);
    }
}