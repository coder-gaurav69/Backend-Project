import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AutoNumberService } from '../common/services/auto-number.service';
import { ExcelUploadService } from '../common/services/excel-upload.service';
import {
    CreateProjectDto,
    UpdateProjectDto,
    BulkCreateProjectDto,
    BulkUpdateProjectDto,
    BulkDeleteProjectDto,
    ChangeStatusDto,
    FilterProjectDto,
} from './dto/project.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponse } from '../common/dto/api-response.dto';
import { ProjectStatus, ProjectPriority, Prisma } from '@prisma/client';

@Injectable()
export class ProjectService {
    private readonly logger = new Logger(ProjectService.name);
    private readonly CACHE_TTL = 300;
    private readonly CACHE_KEY = 'projects';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private autoNumberService: AutoNumberService,
        private excelUploadService: ExcelUploadService,
    ) { }

    async create(dto: CreateProjectDto, userId: string) {
        const subLocation = await this.prisma.subLocation.findFirst({
            where: { id: dto.subLocationId },
        });

        if (!subLocation) {
            throw new NotFoundException('Sub location not found');
        }

        const generatedProjectNo = await this.autoNumberService.generateProjectNo();

        const project = await this.prisma.project.create({
            data: {
                ...dto,
                deadline: dto.deadline ? new Date(dto.deadline) : null,
                projectNo: dto.projectNo || generatedProjectNo,
                priority: dto.priority || ProjectPriority.MEDIUM,
                status: dto.status || ProjectStatus.ACTIVE,
                createdBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'CREATE', project.id, null, project);

        return project;
    }

    async findAll(pagination: PaginationDto, filter?: FilterProjectDto) {
        const {
            page = 1,
            limit = 10,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = pagination;
        const skip = (page - 1) * limit;

        const where = {
            ...(filter?.status && { status: filter.status }),
            ...(filter?.priority && { priority: filter.priority }),
            ...(filter?.subLocationId && { subLocationId: filter.subLocationId }),
            ...(search && {
                OR: [
                    {
                        projectName: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        projectNo: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                ],
            }),
        };

        const [data, total] = await Promise.all([
            this.prisma.project.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { [sortBy]: sortOrder },
                include: {
                    subLocation: {
                        select: {
                            id: true,
                            subLocationName: true,
                            subLocationCode: true,
                            location: {
                                select: {
                                    id: true,
                                    locationName: true,
                                    company: {
                                        select: {
                                            id: true,
                                            companyName: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.project.count({ where }),
        ]);

        const mappedData = data.map((item) => ({
            ...item,
            subLocationName: item.subLocation?.subLocationName,
            locationName: item.subLocation?.location?.locationName,
            companyName: item.subLocation?.location?.company?.companyName,
        }));

        return new PaginatedResponse(mappedData, total, page, limit);
    }

    async findActive(pagination: PaginationDto) {
        const filter: FilterProjectDto = { status: ProjectStatus.ACTIVE };
        return this.findAll(pagination, filter);
    }

    async findById(id: string) {
        const project = await this.prisma.project.findFirst({
            where: { id },
            include: {
                subLocation: {
                    include: {
                        location: {
                            include: {
                                company: {
                                    include: {
                                        group: true,
                                    }
                                },
                            },
                        },
                    },
                },
                creator: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                updater: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        return project;
    }

    async update(id: string, dto: UpdateProjectDto, userId: string) {
        const existing = await this.findById(id);

        if (dto.subLocationId) {
            const subLocation = await this.prisma.subLocation.findFirst({
                where: { id: dto.subLocationId },
            });

            if (!subLocation) {
                throw new NotFoundException('Sub location not found');
            }
        }

        const updated = await this.prisma.project.update({
            where: { id },
            data: {
                ...dto,
                deadline: dto.deadline ? new Date(dto.deadline) : undefined,
                updatedBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'UPDATE', id, existing, updated);

        return updated;
    }

    async changeStatus(id: string, dto: ChangeStatusDto, userId: string) {
        const existing = await this.findById(id);

        const updated = await this.prisma.project.update({
            where: { id },
            data: {
                status: dto.status,
                updatedBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'STATUS_CHANGE', id, existing, updated);

        return updated;
    }

    async delete(id: string, userId: string) {
        const existing = await this.findById(id);

        await this.prisma.project.delete({
            where: { id },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'HARD_DELETE', id, existing, null);

        return { message: 'Project permanently deleted successfully' };
    }

    async bulkCreate(dto: BulkCreateProjectDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        const allExisting = await this.prisma.project.findMany({
            select: { projectNo: true },
        });

        const existingNos = new Set(allExisting.map((x) => x.projectNo));

        let currentNum = parseInt(
            (await this.autoNumberService.generateProjectNo()).replace('P-', ''),
        );

        for (const projectDto of dto.projects) {
            try {
                const projectName = projectDto.projectName?.trim() || 'Unnamed Project';

                let finalProjectNo = projectDto.projectNo?.trim();
                if (
                    !finalProjectNo ||
                    !finalProjectNo.includes('P-') ||
                    existingNos.has(finalProjectNo)
                ) {
                    finalProjectNo = `P-${currentNum}`;
                    currentNum++;
                    while (existingNos.has(finalProjectNo)) {
                        finalProjectNo = `P-${currentNum}`;
                        currentNum++;
                    }
                }
                existingNos.add(finalProjectNo);

                const subLocation = await this.prisma.subLocation.findFirst({
                    where: { id: projectDto.subLocationId },
                });

                if (!subLocation) {
                    throw new Error('Sub location not found');
                }

                const created = await this.prisma.project.create({
                    data: {
                        ...projectDto,
                        projectName,
                        projectNo: finalProjectNo,
                        deadline: projectDto.deadline ? new Date(projectDto.deadline) : null,
                        priority: projectDto.priority || ProjectPriority.MEDIUM,
                        status: projectDto.status || ProjectStatus.ACTIVE,
                        createdBy: userId,
                    },
                });
                results.push(created);
            } catch (error) {
                errors.push({
                    projectName: projectDto.projectName,
                    error: error.message,
                });
            }
        }

        await this.invalidateCache();

        return {
            success: results.length,
            failed: errors.length,
            results,
            errors,
        };
    }

    async bulkUpdate(dto: BulkUpdateProjectDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const update of dto.updates) {
                try {
                    const { id, ...data } = update;

                    const updated = await tx.project.update({
                        where: { id },
                        data: {
                            ...data,
                            deadline: data.deadline ? new Date(data.deadline) : undefined,
                            updatedBy: userId,
                        },
                    });

                    results.push(updated);
                } catch (error) {
                    errors.push({
                        id: update.id,
                        error: error.message,
                    });
                }
            }
        });

        await this.invalidateCache();

        return {
            success: results.length,
            failed: errors.length,
            results,
            errors,
        };
    }

    async bulkDelete(dto: BulkDeleteProjectDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const id of dto.ids) {
            try {
                const existing = await this.prisma.project.findUnique({ where: { id } });
                if (!existing) continue;

                await this.prisma.project.delete({
                    where: { id },
                });

                await this.logAudit(userId, 'HARD_DELETE', id, existing, null);
                results.push(id);
            } catch (error) {
                errors.push({
                    id,
                    error: error.message,
                });
            }
        }

        await this.invalidateCache();

        return {
            success: results.length,
            failed: errors.length,
            results,
            errors,
        };
    }



    async uploadExcel(file: Express.Multer.File, userId: string) {
        const columnMapping = {
            projectNo: ['projectno', 'projectnumber'],
            projectName: ['projectname', 'name'],
            subLocationName: ['sublocationname', 'clientsublocationname'], // Changed from subLocationId
            deadline: ['deadline', 'duedate', 'enddate'],
            priority: ['priority'],
            status: ['status'],
            remark: ['remark', 'remarks', 'notes', 'description'],
        };

        const requiredColumns = ['projectName', 'subLocationName'];

        const { data, errors } = await this.excelUploadService.parseFile<any>(
            file,
            columnMapping,
            requiredColumns,
        );

        if (data.length === 0) {
            throw new BadRequestException(
                'No valid data found to import. Please check file format and column names.',
            );
        }

        // Validate enums and resolve subLocationName to subLocationId
        const processedData: CreateProjectDto[] = [];
        for (const row of data) {
            if (row.status) {
                this.excelUploadService.validateEnum(
                    row.status as string,
                    ProjectStatus,
                    'Status',
                );
            }
            if (row.priority) {
                this.excelUploadService.validateEnum(
                    row.priority as string,
                    ProjectPriority,
                    'Priority',
                );
            }

            // Resolve subLocationName to subLocationId
            const subLocation = await this.prisma.subLocation.findFirst({
                where: {
                    subLocationName: row.subLocationName,
                },
            });

            if (!subLocation) {
                throw new BadRequestException(
                    `Sub Location not found: ${row.subLocationName}`,
                );
            }

            processedData.push({
                projectNo: row.projectNo,
                projectName: row.projectName,
                subLocationId: subLocation.id, // Use the resolved subLocationId
                deadline: row.deadline,
                priority: row.priority,
                status: row.status,
                remark: row.remark,
            });
        }

        const result = await this.bulkCreate({ projects: processedData }, userId);

        if (result.success === 0 && result.failed > 0) {
            const firstError = result.errors?.[0]?.error || 'Unknown validation error';
            throw new BadRequestException(
                `Upload Failed: All ${result.failed} records failed validation. Example error: ${firstError}`,
            );
        }

        return result;
    }

    private async invalidateCache() {
        await this.redisService.deleteCachePattern(`${this.CACHE_KEY}:*`);
    }

    private async logAudit(
        userId: string,
        action: string,
        entityId: string,
        oldValue: any,
        newValue: any,
    ) {
        await this.prisma.auditLog.create({
            data: {
                userId,
                action,
                entity: 'Project',
                entityId,
                oldValue: oldValue,
                newValue: newValue,
                ipAddress: '',
            },
        });
    }
}
