import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoNumberService } from '../common/services/auto-number.service';
import { RedisService } from '../redis/redis.service';
import { CreateTaskDto, UpdateTaskDto, FilterTaskDto, TaskViewMode } from './dto/task.dto';
import { NotificationService } from '../notification/notification.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Prisma, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly CACHE_KEY = 'tasks';

    constructor(
        private prisma: PrismaService,
        private autoNumberService: AutoNumberService,
        private redisService: RedisService,
        private notificationService: NotificationService,
    ) { }

    async create(dto: CreateTaskDto, userId: string, files?: Express.Multer.File[]) {
        const taskNo = await this.autoNumberService.generateTaskNo();
        const { toTitleCase } = await import('../common/utils/string-helper');
        const fs = await import('fs');
        const path = await import('path');

        let attachment = dto.attachment;
        if (files && files.length > 0) {
            const file = files[0];
            const fileName = `${Date.now()}-${file.originalname}`;
            const uploadPath = path.join(process.cwd(), 'uploads', fileName);
            fs.writeFileSync(uploadPath, file.buffer);
            attachment = `/uploads/${fileName}`;
        }

        const task = await this.prisma.pendingTask.create({
            data: {
                ...dto,
                taskStatus: dto.taskStatus || TaskStatus.Pending,
                taskTitle: toTitleCase(dto.taskTitle),
                additionalNote: dto.additionalNote ? toTitleCase(dto.additionalNote) : undefined,
                taskNo,
                createdBy: userId,
                attachment,
                // Sanitize UUIDs to handle strings from FormData
                assignedTo: dto.assignedTo && dto.assignedTo !== 'null' ? dto.assignedTo : null,
                targetGroupId: dto.targetGroupId && dto.targetGroupId !== 'null' ? dto.targetGroupId : null,
                targetTeamId: dto.targetTeamId && dto.targetTeamId !== 'null' ? dto.targetTeamId : null,
            } as any,
            include: {
                project: true,
                assignee: true,
                creator: true,
                targetGroup: true,
                targetTeam: true,
            },
        });

        // Send notifications
        if (task.assignedTo) {
            await this.notificationService.createNotification(task.assignedTo, {
                title: 'New Task Assigned',
                description: `A new task "${task.taskTitle}" has been assigned to you.`,
                type: 'TASK',
                metadata: { taskId: task.id, taskNo: task.taskNo },
            });
        }

        await this.invalidateCache();
        return task;
    }

    async findAll(pagination: PaginationDto, filter: FilterTaskDto, userId?: string, role?: string) {
        const { page = 1, limit = 25 } = pagination;
        const skip = (page - 1) * limit;
        const { toTitleCase } = await import('../common/utils/string-helper');

        // Identify which "database" (table) to query
        const isCompletedView = filter.viewMode === TaskViewMode.MY_COMPLETED || filter.viewMode === TaskViewMode.TEAM_COMPLETED;
        const model: any = isCompletedView ? this.prisma.completedTask : this.prisma.pendingTask;

        const where: any = { AND: [] };
        const andArray = where.AND;

        // If we are filtering by view mode and have a userId (Team ID)
        if (filter.viewMode && userId) {
            // Find current user's team info
            const userTeam = await this.prisma.team.findUnique({
                where: { id: userId },
                select: { id: true, clientGroupId: true, companyId: true, locationId: true, subLocationId: true }
            });

            let teamMemberIds: string[] = [];
            if (userTeam) {
                // Find potential team members based on location/group hierarchy
                const teamMembers = await this.prisma.team.findMany({
                    where: {
                        AND: [
                            { status: 'Active' },
                            { OR: [{ clientGroupId: userTeam.clientGroupId }, { clientGroupId: null }] },
                            { OR: [{ companyId: userTeam.companyId }, { companyId: null }] },
                            { OR: [{ locationId: userTeam.locationId }, { locationId: null }] },
                            { OR: [{ subLocationId: userTeam.subLocationId }, { subLocationId: null }] }
                        ]
                    },
                    select: { id: true }
                });
                teamMemberIds = teamMembers.map(t => t.id);
            }

            switch (filter.viewMode) {
                case TaskViewMode.MY_PENDING:
                    andArray.push({ assignedTo: userId, taskStatus: TaskStatus.Pending });
                    break;
                case TaskViewMode.MY_COMPLETED:
                    andArray.push({ assignedTo: userId, taskStatus: TaskStatus.Completed });
                    break;
                case TaskViewMode.TEAM_PENDING:
                    // Assigned to any team member OR target team is user's team
                    andArray.push({
                        OR: [
                            { assignedTo: { in: teamMemberIds } },
                            { targetTeamId: userTeam?.id }
                        ],
                        taskStatus: TaskStatus.Pending
                    });
                    break;
                case TaskViewMode.TEAM_COMPLETED:
                    andArray.push({
                        OR: [
                            { assignedTo: { in: teamMemberIds } },
                            { targetTeamId: userTeam?.id }
                        ],
                        taskStatus: TaskStatus.Completed
                    });
                    break;
                case TaskViewMode.REVIEW_PENDING_BY_ME:
                    andArray.push({ createdBy: userId, taskStatus: TaskStatus.Review });
                    break;
                case TaskViewMode.REVIEW_PENDING_BY_TEAM:
                    andArray.push({ createdBy: { in: teamMemberIds }, taskStatus: TaskStatus.Review });
                    break;
            }
        }

        if (filter.search) {
            const val = filter.search;
            const searchTitle = toTitleCase(val);
            andArray.push({
                OR: [
                    { taskTitle: { contains: val, mode: 'insensitive' } },
                    { taskTitle: { contains: searchTitle, mode: 'insensitive' } },
                    { taskNo: { contains: val, mode: 'insensitive' } },
                    { additionalNote: { contains: val, mode: 'insensitive' } },
                ]
            });
        }

        const [data, total] = await Promise.all([
            model.findMany({
                where,
                skip,
                take: limit,
                orderBy: { creatingTime: 'desc' },
                include: {
                    project: { select: { id: true, projectName: true, projectNo: true } },
                    assignee: { select: { id: true, firstName: true, lastName: true, email: true, teamName: true } },
                    creator: { select: { id: true, firstName: true, lastName: true, email: true } },
                    targetTeam: { select: { id: true, teamName: true, email: true } },
                    targetGroup: { select: { id: true, groupName: true, groupCode: true } }
                },
            }),
            model.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findById(id: string) {
        // Try Pending first, then Completed
        let task = await this.prisma.pendingTask.findUnique({
            where: { id },
            include: { project: true, assignee: true, creator: true, targetGroup: true, targetTeam: true }
        } as any);

        if (!task) {
            task = (await this.prisma.completedTask.findUnique({
                where: { id },
                include: { project: true, assignee: true, creator: true, targetGroup: true, targetTeam: true }
            } as any)) as any;
        }

        if (!task) throw new NotFoundException(`Task with ID ${id} not found`);
        return task;
    }

    async update(id: string, dto: UpdateTaskDto, userId: string) {
        const existingTask = await this.findById(id);
        const { toTitleCase } = await import('../common/utils/string-helper');

        // Check for Status Change to Completed
        if (dto.taskStatus === TaskStatus.Completed && (existingTask as any).taskStatus !== TaskStatus.Completed) {
            // Move from Pending to Completed
            const { id: _, updatedAt: __, ...taskData } = existingTask as any;
            const [deleted, created] = await this.prisma.$transaction([
                this.prisma.pendingTask.delete({ where: { id } }),
                this.prisma.completedTask.create({
                    data: {
                        ...taskData,
                        taskStatus: TaskStatus.Completed,
                        completeTime: new Date(),
                        completedAt: new Date(),
                    }
                })
            ]);
            await this.invalidateCache();
            return created;
        }

        // Normal update in PeindingTask (since only pending tasks are usually editable)
        const model: any = (existingTask as any).taskStatus === TaskStatus.Completed ? this.prisma.completedTask : this.prisma.pendingTask;

        const updated = await model.update({
            where: { id },
            data: {
                ...dto,
                taskTitle: dto.taskTitle ? toTitleCase(dto.taskTitle) : undefined,
                additionalNote: dto.additionalNote ? toTitleCase(dto.additionalNote) : undefined,
                remarkChat: dto.remarkChat ? toTitleCase(dto.remarkChat) : undefined,
            },
        });

        await this.invalidateCache();
        return updated;
    }

    async delete(id: string) {
        const existing = await this.findById(id);
        const model: any = (existing as any).taskStatus === TaskStatus.Completed ? this.prisma.completedTask : this.prisma.pendingTask;
        const deleted = await model.delete({ where: { id } });
        await this.invalidateCache();
        return deleted;
    }

    private async invalidateCache() {
        await this.redisService.deleteCachePattern(`${this.CACHE_KEY}:*`);
    }
}
