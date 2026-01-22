import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { CreateTaskDto, UpdateTaskDto, FilterTaskDto } from './dto/task.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskController {
    constructor(private readonly taskService: TaskService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.HR, UserRole.EMPLOYEE)
    @UseInterceptors(FilesInterceptor('files'))
    create(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() dto: CreateTaskDto,
        @GetUser('id') userId: string
    ) {
        return this.taskService.create(dto, userId, files);
    }

    @Get()
    findAll(
        @Query() pagination: PaginationDto,
        @Query() filter: FilterTaskDto,
        @GetUser('id') userId: string,
        @GetUser('role') role: UserRole
    ) {
        return this.taskService.findAll(pagination, filter, userId, role);
    }

    @Get(':id')
    findById(@Param('id') id: string) {
        return this.taskService.findById(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateTaskDto,
        @GetUser('id') userId: string,
    ) {
        return this.taskService.update(id, dto, userId);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    delete(@Param('id') id: string) {
        return this.taskService.delete(id);
    }
}
