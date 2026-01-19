import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AutoNumberService } from '../common/services/auto-number.service';
import { ExcelUploadService } from '../common/services/excel-upload.service';
import {
    CreateTeamDto,
    UpdateTeamDto,
    BulkCreateTeamDto,
    BulkUpdateTeamDto,
    BulkDeleteTeamDto,
    ChangeStatusDto,
    FilterTeamDto,
} from './dto/team.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponse } from '../common/dto/api-response.dto';
import { TeamStatus, LoginMethod, Prisma } from '@prisma/client';

@Injectable()
export class TeamService {
    private readonly logger = new Logger(TeamService.name);
    private readonly CACHE_TTL = 300;
    private readonly CACHE_KEY = 'teams';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private autoNumberService: AutoNumberService,
        private excelUploadService: ExcelUploadService,
    ) { }

    async create(dto: CreateTeamDto, userId: string) {
        // Validate optional relationships
        if (dto.clientGroupId) {
            const group = await this.prisma.clientGroup.findFirst({
                where: { id: dto.clientGroupId },
            });
            if (!group) throw new NotFoundException('Client group not found');
        }

        if (dto.companyId) {
            const company = await this.prisma.clientCompany.findFirst({
                where: { id: dto.companyId },
            });
            if (!company) throw new NotFoundException('Client company not found');
        }

        if (dto.locationId) {
            const location = await this.prisma.clientLocation.findFirst({
                where: { id: dto.locationId },
            });
            if (!location) throw new NotFoundException('Client location not found');
        }

        if (dto.subLocationId) {
            const subLocation = await this.prisma.subLocation.findFirst({
                where: { id: dto.subLocationId },
            });
            if (!subLocation) throw new NotFoundException('Sub location not found');
        }

        const generatedTeamNo = await this.autoNumberService.generateTeamNo();

        const team = await this.prisma.team.create({
            data: {
                ...dto,
                teamNo: dto.teamNo || generatedTeamNo,
                taskAssignPermission: dto.taskAssignPermission || false,
                loginMethod: dto.loginMethod || LoginMethod.EMAIL,
                status: dto.status || TeamStatus.ACTIVE,
                createdBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'CREATE', team.id, null, team);

        return team;
    }

    async findAll(pagination: PaginationDto, filter?: FilterTeamDto) {
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
            ...(filter?.clientGroupId && { clientGroupId: filter.clientGroupId }),
            ...(filter?.companyId && { companyId: filter.companyId }),
            ...(filter?.locationId && { locationId: filter.locationId }),
            ...(filter?.subLocationId && { subLocationId: filter.subLocationId }),
            ...(search && {
                OR: [
                    {
                        teamName: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        teamNo: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        email: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                ],
            }),
        };

        const [data, total] = await Promise.all([
            this.prisma.team.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { [sortBy]: sortOrder },
                include: {
                    clientGroup: {
                        select: { id: true, groupName: true, groupCode: true },
                    },
                    company: {
                        select: { id: true, companyName: true, companyCode: true },
                    },
                    location: {
                        select: { id: true, locationName: true, locationCode: true },
                    },
                    subLocation: {
                        select: { id: true, subLocationName: true, subLocationCode: true },
                    },
                },
            }),
            this.prisma.team.count({ where }),
        ]);

        const mappedData = data.map((item) => ({
            ...item,
            clientCompany: item.company,
            clientLocation: item.location,
            groupName: item.clientGroup?.groupName,
            companyName: item.company?.companyName,
            locationName: item.location?.locationName,
            subLocationName: item.subLocation?.subLocationName,
        }));

        return new PaginatedResponse(mappedData, total, page, limit);
    }

    async findActive(pagination: PaginationDto) {
        const filter: FilterTeamDto = { status: TeamStatus.ACTIVE };
        return this.findAll(pagination, filter);
    }

    async findById(id: string) {
        const team = await this.prisma.team.findFirst({
            where: { id },
            include: {
                clientGroup: true,
                company: true,
                location: true,
                subLocation: true,
                creator: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                updater: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });

        if (!team) {
            throw new NotFoundException('Team not found');
        }

        return team;
    }

    async update(id: string, dto: UpdateTeamDto, userId: string) {
        const existing = await this.findById(id);

        // Validate optional relationships if being updated
        if (dto.clientGroupId) {
            const group = await this.prisma.clientGroup.findFirst({
                where: { id: dto.clientGroupId },
            });
            if (!group) throw new NotFoundException('Client group not found');
        }

        if (dto.companyId) {
            const company = await this.prisma.clientCompany.findFirst({
                where: { id: dto.companyId },
            });
            if (!company) throw new NotFoundException('Client company not found');
        }

        if (dto.locationId) {
            const location = await this.prisma.clientLocation.findFirst({
                where: { id: dto.locationId },
            });
            if (!location) throw new NotFoundException('Client location not found');
        }

        if (dto.subLocationId) {
            const subLocation = await this.prisma.subLocation.findFirst({
                where: { id: dto.subLocationId },
            });
            if (!subLocation) throw new NotFoundException('Sub location not found');
        }

        const updated = await this.prisma.team.update({
            where: { id },
            data: {
                ...dto,
                updatedBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'UPDATE', id, existing, updated);

        return updated;
    }

    async changeStatus(id: string, dto: ChangeStatusDto, userId: string) {
        const existing = await this.findById(id);

        const updated = await this.prisma.team.update({
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

        await this.prisma.team.delete({
            where: { id },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'HARD_DELETE', id, existing, null);

        return { message: 'Team permanently deleted successfully' };
    }

    async bulkCreate(dto: BulkCreateTeamDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        const allExisting = await this.prisma.team.findMany({
            select: { teamNo: true },
        });

        const existingNos = new Set(allExisting.map((x) => x.teamNo));

        let currentNum = parseInt(
            (await this.autoNumberService.generateTeamNo()).replace('U-', ''),
        );

        for (const teamDto of dto.teams) {
            try {
                const teamName = teamDto.teamName?.trim() || 'Unnamed Team';

                let finalTeamNo = teamDto.teamNo?.trim();
                if (!finalTeamNo || !finalTeamNo.includes('U-') || existingNos.has(finalTeamNo)) {
                    finalTeamNo = `U-${currentNum}`;
                    currentNum++;
                    while (existingNos.has(finalTeamNo)) {
                        finalTeamNo = `U-${currentNum}`;
                        currentNum++;
                    }
                }
                existingNos.add(finalTeamNo);

                const created = await this.prisma.team.create({
                    data: {
                        ...teamDto,
                        teamName,
                        teamNo: finalTeamNo,
                        taskAssignPermission: teamDto.taskAssignPermission || false,
                        loginMethod: teamDto.loginMethod || LoginMethod.EMAIL,
                        status: teamDto.status || TeamStatus.ACTIVE,
                        createdBy: userId,
                    },
                });
                results.push(created);
            } catch (error) {
                errors.push({
                    teamName: teamDto.teamName,
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

    async bulkUpdate(dto: BulkUpdateTeamDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const update of dto.updates) {
                try {
                    const { id, ...data } = update;

                    const updated = await tx.team.update({
                        where: { id },
                        data: {
                            ...data,
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

    async bulkDelete(dto: BulkDeleteTeamDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const id of dto.ids) {
            try {
                const existing = await this.prisma.team.findUnique({ where: { id } });
                if (!existing) continue;

                await this.prisma.team.delete({
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
            teamNo: ['teamno', 'teamnumber', 'no', 'number'],
            teamName: ['teamname', 'name', 'tname', 'team'],
            email: ['email', 'mail'],
            phone: ['phone', 'contact', 'mobile', 'tel'],
            taskAssignPermission: ['taskassignpermission', 'taskassign', 'taskpermission'],
            groupName: ['groupname', 'clientgroupname', 'group', 'clientgroup'],
            companyName: ['companyname', 'clientcompanyname', 'company', 'clientcompany'],
            locationName: ['locationname', 'clientlocationname', 'location', 'clientlocation'],
            subLocationName: ['sublocationname', 'clientsublocationname', 'sublocation'],
            status: ['status', 'state', 'active'],
            loginMethod: ['loginmethod', 'login'],
            remark: ['remark', 'remarks', 'notes', 'description', 'comment'],
        };

        const requiredColumns = ['teamName'];

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

        // Validate enums and resolve names to IDs
        const processedData: CreateTeamDto[] = [];
        for (const row of data) {
            if (row.status) {
                this.excelUploadService.validateEnum(row.status as string, TeamStatus, 'Status');
            }
            if (row.loginMethod) {
                this.excelUploadService.validateEnum(
                    row.loginMethod as string,
                    LoginMethod,
                    'LoginMethod',
                );
            }

            // Resolve groupName to clientGroupId
            let clientGroupId: string | undefined = undefined;
            if (row.groupName) {
                const group = await this.prisma.clientGroup.findFirst({
                    where: { groupName: row.groupName },
                });
                if (!group) {
                    throw new BadRequestException(`Client Group not found: ${row.groupName}`);
                }
                clientGroupId = group.id;
            }

            // Resolve companyName to companyId
            let companyId: string | undefined = undefined;
            if (row.companyName) {
                const company = await this.prisma.clientCompany.findFirst({
                    where: { companyName: row.companyName },
                });
                if (!company) {
                    throw new BadRequestException(`Client Company not found: ${row.companyName}`);
                }
                companyId = company.id;
            }

            // Resolve locationName to locationId
            let locationId: string | undefined = undefined;
            if (row.locationName) {
                const location = await this.prisma.clientLocation.findFirst({
                    where: { locationName: row.locationName },
                });
                if (!location) {
                    throw new BadRequestException(`Client Location not found: ${row.locationName}`);
                }
                locationId = location.id;
            }

            // Resolve subLocationName to subLocationId
            let subLocationId: string | undefined = undefined;
            if (row.subLocationName) {
                const subLocation = await this.prisma.subLocation.findFirst({
                    where: { subLocationName: row.subLocationName },
                });
                if (!subLocation) {
                    throw new BadRequestException(`Sub Location not found: ${row.subLocationName}`);
                }
                subLocationId = subLocation.id;
            }

            processedData.push({
                teamNo: row.teamNo,
                teamName: row.teamName,
                email: row.email,
                phone: row.phone,
                taskAssignPermission: row.taskAssignPermission,
                clientGroupId,
                companyId,
                locationId,
                subLocationId,
                status: row.status,
                loginMethod: row.loginMethod,
                remark: row.remark,
            });
        }

        const result = await this.bulkCreate({ teams: processedData }, userId);

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
                entity: 'Team',
                entityId,
                oldValue: oldValue,
                newValue: newValue,
                ipAddress: '',
            },
        });
    }
}
