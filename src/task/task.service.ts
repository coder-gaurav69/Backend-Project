import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoNumberService } from '../common/services/auto-number.service';
import { CreateTaskDto, UpdateTaskDto, FilterTaskDto } from './dto/task.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Prisma, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);

    constructor(
        private prisma: PrismaService,
        private autoNumberService: AutoNumberService,
    ) { }

    async create(dto: CreateTaskDto, userId: string) {
        const taskNo = await this.autoNumberService.generateTaskNo();

        return this.prisma.task.create({
            data: {
                ...dto,
                taskNo,
                createdBy: userId,
            },
            include: {
                project: true,
                assignee: true,
                creator: true,
            },
        });
    }

    async findAll(pagination: PaginationDto, filter: FilterTaskDto) {
        const { page = 1, limit = 25 } = pagination;
        const skip = (page - 1) * limit;

        const where: Prisma.TaskWhereInput = {
            AND: []
        };

        const andArray = where.AND as Array<Prisma.TaskWhereInput>;

        if (filter.search) {
            const searchValues = filter.search.split(/[,\:;|]/).map(v => v.trim()).filter(Boolean);
            const searchOrConditions: Prisma.TaskWhereInput[] = [];

            for (const val of searchValues) {
                const searchLower = val.toLowerCase();
                const looksLikeCode = /^[A-Z]{1,}-\d+$/i.test(val) || /^TASK-\d+$/i.test(val);

                const fieldOrConditions: Prisma.TaskWhereInput[] = [];

                if (looksLikeCode) {
                    fieldOrConditions.push({ taskNo: { equals: val, mode: 'insensitive' } });
                    fieldOrConditions.push({ taskNo: { contains: val, mode: 'insensitive' } });
                } else {
                    fieldOrConditions.push({ taskTitle: { contains: val, mode: 'insensitive' } });
                    fieldOrConditions.push({ taskNo: { contains: val, mode: 'insensitive' } });
                }

                fieldOrConditions.push({ additionalNote: { contains: val, mode: 'insensitive' } });
                fieldOrConditions.push({ remarkChat: { contains: val, mode: 'insensitive' } });
                fieldOrConditions.push({ project: { projectName: { contains: val, mode: 'insensitive' } } });
                fieldOrConditions.push({ assignee: { firstName: { contains: val, mode: 'insensitive' } } });
                fieldOrConditions.push({ assignee: { lastName: { contains: val, mode: 'insensitive' } } });
                fieldOrConditions.push({ creator: { firstName: { contains: val, mode: 'insensitive' } } });
                fieldOrConditions.push({ worker: { firstName: { contains: val, mode: 'insensitive' } } });

                if ('pending'.includes(searchLower) && searchLower.length >= 3) fieldOrConditions.push({ taskStatus: 'PENDING' });
                if ('success'.includes(searchLower) && searchLower.length >= 3) fieldOrConditions.push({ taskStatus: 'SUCCESS' });
                if ('working'.includes(searchLower) && searchLower.length >= 3) fieldOrConditions.push({ taskStatus: 'WORKING' });
                if ('review'.includes(searchLower) && searchLower.length >= 3) fieldOrConditions.push({ taskStatus: 'REVIEW' });
                if ('hold'.includes(searchLower) && searchLower.length >= 3) fieldOrConditions.push({ taskStatus: 'HOLD' });

                searchOrConditions.push({ OR: fieldOrConditions });
            }

            if (searchOrConditions.length > 0) {
                andArray.push({ OR: searchOrConditions });
            }
        }

        if (filter.taskStatus) {
            const statusValues = typeof filter.taskStatus === 'string'
                ? filter.taskStatus.split(/[,\:;|]/).map(v => v.trim()).filter(Boolean)
                : Array.isArray(filter.taskStatus) ? filter.taskStatus : [filter.taskStatus];
            if (statusValues.length > 0) andArray.push({ taskStatus: { in: statusValues as any } });
        }

        if (filter.priority) {
            const priorityValues = typeof filter.priority === 'string'
                ? filter.priority.split(/[,\:;|]/).map(v => v.trim()).filter(Boolean)
                : Array.isArray(filter.priority) ? filter.priority : [filter.priority];
            if (priorityValues.length > 0) andArray.push({ priority: { in: priorityValues as any } });
        }

        if (filter.projectId) {
            andArray.push({ projectId: filter.projectId });
        }

        if (filter.assignedTo) {
            andArray.push({ assignedTo: filter.assignedTo });
        }

        if (filter.createdBy) {
            andArray.push({ createdBy: filter.createdBy });
        }

        if (filter.workingBy) {
            andArray.push({ workingBy: filter.workingBy });
        }

        if (andArray.length === 0) delete where.AND;

        const [data, total] = await Promise.all([
            this.prisma.task.findMany({
                where,
                skip,
                take: limit,
                orderBy: { creatingTime: 'desc' },
                include: {
                    project: true,
                    assignee: true,
                    creator: true,
                    worker: true,
                },
            }),
            this.prisma.task.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: string) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: {
                project: true,
                assignee: true,
                creator: true,
                worker: true,
            },
        });

        if (!task) {
            throw new NotFoundException(`Task with ID ${id} not found`);
        }

        return task;
    }

    async update(id: string, dto: UpdateTaskDto, userId: string) {
        await this.findById(id);

        return this.prisma.task.update({
            where: { id },
            data: {
                ...dto,
            },
            include: {
                project: true,
                assignee: true,
                creator: true,
                worker: true,
            },
        });
    }

    async delete(id: string) {
        await this.findById(id);
        return this.prisma.task.delete({ where: { id } });
    }
}
