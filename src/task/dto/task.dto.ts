import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsNotEmpty, IsArray } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class CreateTaskDto {
    @IsString()
    @IsNotEmpty()
    taskTitle: string;

    @IsString()
    @IsNotEmpty()
    priority: string;

    @IsOptional()
    @IsString()
    additionalNote?: string;

    @IsOptional()
    @IsDateString()
    deadline?: string;

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    reminderTime?: string[];

    @IsOptional()
    @IsString()
    document?: string;

    @IsUUID()
    @IsNotEmpty()
    projectId: string;

    @IsOptional()
    @IsUUID()
    assignedTo?: string;

    @IsOptional()
    @IsUUID()
    targetGroupId?: string;

    @IsOptional()
    @IsUUID()
    targetTeamId?: string;
}

export class UpdateTaskDto {
    @IsOptional()
    @IsString()
    taskTitle?: string;

    @IsOptional()
    @IsString()
    priority?: string;

    @IsOptional()
    @IsString()
    additionalNote?: string;

    @IsOptional()
    @IsDateString()
    deadline?: string;

    @IsOptional()
    @IsDateString()
    completeTime?: string;

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    reviewedTime?: string[];

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    reminderTime?: string[];

    @IsOptional()
    @IsString()
    document?: string;

    @IsOptional()
    @IsString()
    remarkChat?: string;

    @IsOptional()
    @IsUUID()
    projectId?: string;

    @IsOptional()
    @IsUUID()
    assignedTo?: string;

    @IsOptional()
    @IsUUID()
    targetGroupId?: string;

    @IsOptional()
    @IsUUID()
    targetTeamId?: string;

    @IsOptional()
    @IsUUID()
    workingBy?: string;
}

import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterTaskDto extends PaginationDto {
    @IsOptional()
    @IsEnum(TaskStatus)
    taskStatus?: TaskStatus;

    @IsOptional()
    @IsString()
    priority?: string;

    @IsOptional()
    @IsUUID()
    projectId?: string;

    @IsOptional()
    @IsUUID()
    assignedTo?: string;

    @IsOptional()
    @IsUUID()
    targetGroupId?: string;

    @IsOptional()
    @IsUUID()
    targetTeamId?: string;

    @IsOptional()
    @IsUUID()
    createdBy?: string;

    @IsOptional()
    @IsUUID()
    workingBy?: string;

    @IsOptional()
    @IsString()
    viewMode?: TaskViewMode;
}

export enum TaskViewMode {
    MY_PENDING = 'MY_PENDING',
    MY_COMPLETED = 'MY_COMPLETED',
    TEAM_PENDING = 'TEAM_PENDING',
    TEAM_COMPLETED = 'TEAM_COMPLETED',
    REVIEW_PENDING_BY_ME = 'REVIEW_PENDING_BY_ME',
    REVIEW_PENDING_BY_TEAM = 'REVIEW_PENDING_BY_TEAM',
}
