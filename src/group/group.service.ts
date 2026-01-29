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
    CreateGroupDto,
    UpdateGroupDto,
    BulkCreateGroupDto,
    BulkUpdateGroupDto,
    BulkDeleteGroupDto,
    ChangeStatusDto,
    FilterGroupDto,
} from './dto/group.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponse } from '../common/dto/api-response.dto';
import { GroupStatus, Prisma } from '@prisma/client';

import { buildMultiValueFilter } from '../common/utils/prisma-helper';

@Injectable()
export class GroupService {
    private readonly logger = new Logger(GroupService.name);
    private readonly CACHE_TTL = 300;
    private readonly CACHE_KEY = 'groups';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private autoNumberService: AutoNumberService,
        private excelUploadService: ExcelUploadService,
    ) { }

    async create(dto: CreateGroupDto, userId: string) {
        const { teamMemberIds, ...groupData } = dto;

        const generatedGroupNo = await this.autoNumberService.generateGroupNo();

        const group = await this.prisma.group.create({
            data: {
                ...groupData as any,
                groupNo: dto.groupNo || generatedGroupNo,
                status: dto.status || GroupStatus.Active,
                createdBy: userId,
                members: teamMemberIds && teamMemberIds.length > 0 ? {
                    create: teamMemberIds.map(id => ({
                        userId: id,
                        role: 'MEMBER'
                    }))
                } : undefined
            },
            include: {
                members: true
            }
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'CREATE', group.id, null, group);

        return group;
    }

    async findAll(pagination: PaginationDto, filter?: FilterGroupDto) {
        const {
            page = 1,
            limit = 25,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = pagination;
        const skip = (page - 1) * limit;

        const cleanedSearch = search?.trim();
        const where: Prisma.GroupWhereInput = {
            AND: []
        };

        const andArray = where.AND as Array<Prisma.GroupWhereInput>;

        // Handle Status Filter
        if (filter?.status as any) {
            const statusValues = typeof (filter as any).status === 'string'
                ? (filter as any).status.split(/[,\:;|]/).map(v => v.trim()).filter(Boolean)
                : Array.isArray((filter as any).status) ? (filter as any).status : [(filter as any).status];
            if (statusValues.length > 0) andArray.push({ status: { in: statusValues as any } });
        }

        if (filter?.clientGroupIds && filter.clientGroupIds.length > 0) andArray.push({ clientGroupIds: { hasSome: filter.clientGroupIds } });
        if (filter?.companyIds && filter.companyIds.length > 0) andArray.push({ companyIds: { hasSome: filter.companyIds } });
        if (filter?.locationIds && filter.locationIds.length > 0) andArray.push({ locationIds: { hasSome: filter.locationIds } });
        if (filter?.subLocationIds && filter.subLocationIds.length > 0) andArray.push({ subLocationIds: { hasSome: filter.subLocationIds } });
        if (filter?.groupName) andArray.push(buildMultiValueFilter('groupName', filter.groupName));
        if (filter?.groupNo) andArray.push(buildMultiValueFilter('groupNo', filter.groupNo));
        if (filter?.remark) andArray.push(buildMultiValueFilter('remark', filter.remark));

        if (cleanedSearch) {
            const searchValues = cleanedSearch.split(/[,\:;|]/).map(v => v.trim()).filter(Boolean);
            const allSearchConditions: Prisma.GroupWhereInput[] = [];

            for (const val of searchValues) {
                const searchLower = val.toLowerCase();
                const looksLikeCode = /^[A-Z]{2,}-\d+$/i.test(val) || /^[A-Z0-9-]+$/i.test(val);

                if (looksLikeCode) {
                    allSearchConditions.push({ groupNo: { equals: val, mode: 'insensitive' } });
                    allSearchConditions.push({ groupNo: { contains: val, mode: 'insensitive' } });
                } else {
                    allSearchConditions.push({ groupName: { contains: val, mode: 'insensitive' } });
                    allSearchConditions.push({ groupNo: { contains: val, mode: 'insensitive' } });
                }

                allSearchConditions.push({ remark: { contains: val, mode: 'insensitive' } });

                if ('active'.includes(searchLower) && searchLower.length >= 3) {
                    allSearchConditions.push({ status: 'Active' as any });
                }
                if ('inactive'.includes(searchLower) && searchLower.length >= 3) {
                    allSearchConditions.push({ status: 'Inactive' as any });
                }
            }

            if (allSearchConditions.length > 0) {
                andArray.push({ OR: allSearchConditions });
            }
        }

        if (andArray.length === 0) delete where.AND;

        const [data, total] = await Promise.all([
            this.prisma.group.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { [sortBy]: sortOrder },
                include: {
                    members: {
                        include: {
                            team: {
                                select: { id: true, firstName: true, lastName: true, teamName: true }
                            }
                        }
                    }
                },
            }),
            this.prisma.group.count({ where }),
        ]);

        // Resolve Hierarchical Names
        const allClientGroupIds = Array.from(new Set(data.flatMap(g => g.clientGroupIds || [])));
        const allCompanyIds = Array.from(new Set(data.flatMap(g => g.companyIds || [])));
        const allLocationIds = Array.from(new Set(data.flatMap(g => g.locationIds || [])));
        const allSubLocationIds = Array.from(new Set(data.flatMap(g => g.subLocationIds || [])));

        const [clientGroups, companies, locations, subLocations] = await Promise.all([
            this.prisma.clientGroup.findMany({ where: { id: { in: allClientGroupIds } }, select: { id: true, groupName: true } }),
            this.prisma.clientCompany.findMany({ where: { id: { in: allCompanyIds } }, select: { id: true, companyName: true } }),
            this.prisma.clientLocation.findMany({ where: { id: { in: allLocationIds } }, select: { id: true, locationName: true } }),
            this.prisma.subLocation.findMany({ where: { id: { in: allSubLocationIds } }, select: { id: true, subLocationName: true } }),
        ]);

        const clientGroupMap = new Map(clientGroups.map(x => [x.id, x.groupName]));
        const companyMap = new Map(companies.map(x => [x.id, x.companyName]));
        const locationMap = new Map(locations.map(x => [x.id, x.locationName]));
        const subLocationMap = new Map(subLocations.map(x => [x.id, x.subLocationName]));

        const mappedData = data.map((item) => ({
            ...item,
            clientGroupName: (item.clientGroupIds || []).map(id => clientGroupMap.get(id)).filter(Boolean).join(', '),
            companyName: (item.companyIds || []).map(id => companyMap.get(id)).filter(Boolean).join(', '),
            locationName: (item.locationIds || []).map(id => locationMap.get(id)).filter(Boolean).join(', '),
            subLocationName: (item.subLocationIds || []).map(id => subLocationMap.get(id)).filter(Boolean).join(', '),
        }));

        return new PaginatedResponse(mappedData, total, page, limit);
    }

    async findActive(pagination: PaginationDto) {
        const filter: any = { status: GroupStatus.Active };
        return this.findAll(pagination, filter);
    }

    async findMyGroups(userId: string) {
        // Get groups where user is a member AND group is Active
        const groupMembers = await this.prisma.groupMember.findMany({
            where: {
                userId,
                group: {
                    status: GroupStatus.Active
                }
            },
            include: {
                group: {
                    select: {
                        id: true,
                        groupNo: true,
                        groupName: true,
                        status: true,
                    }
                }
            }
        });

        // @ts-ignore
        return groupMembers.map(gm => gm.group);
    }

    async findById(id: string) {
        const group = await this.prisma.group.findFirst({
            where: { id },
            include: {
                members: {
                    include: {
                        team: {
                            select: { id: true, firstName: true, lastName: true, email: true }
                        }
                    }
                },
                creator: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                updater: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });

        if (!group) {
            throw new NotFoundException('Group not found');
        }

        return group;
    }

    async update(id: string, dto: UpdateGroupDto, userId: string) {
        const existing = await this.findById(id);
        const { teamMemberIds, ...groupData } = dto;

        const updated = await this.prisma.$transaction(async (tx) => {
            const grp = await tx.group.update({
                where: { id },
                data: {
                    ...groupData as any,
                    updatedBy: userId,
                },
            });

            if (teamMemberIds !== undefined) {
                // Sync members
                await tx.groupMember.deleteMany({ where: { groupId: id } });
                if (teamMemberIds.length > 0) {
                    await tx.groupMember.createMany({
                        data: teamMemberIds.map(uid => ({
                            groupId: id,
                            userId: uid,
                            role: 'MEMBER'
                        }))
                    });
                }
            }

            return grp;
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'UPDATE', id, existing, updated);

        return updated;
    }

    async changeStatus(id: string, dto: ChangeStatusDto, userId: string) {
        const existing = await this.findById(id);

        const updated = await this.prisma.group.update({
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
        const group = await this.prisma.group.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        members: true,
                        pendingTasks: true,
                        completedTasks: true,
                    }
                }
            }
        });

        if (!group) {
            throw new NotFoundException('Group not found');
        }

        const { _count } = group as any;
        const totalTasks = _count.pendingTasks + _count.completedTasks;
        const childCounts = [
            _count.members > 0 && `${_count.members} members`,
            totalTasks > 0 && `${totalTasks} tasks`,
        ].filter(Boolean);

        if (childCounts.length > 0) {
            throw new BadRequestException(
                `Cannot delete Group because it contains: ${childCounts.join(', ')}. Please delete or reassign them first.`
            );
        }

        await this.prisma.group.delete({
            where: { id },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'HARD_DELETE', id, group, null);

        return { message: 'Group deleted successfully' };
    }

    async bulkCreate(dto: BulkCreateGroupDto, userId: string) {
        this.logger.log(`[BULK_CREATE_FAST] Starting for ${dto.groups.length} records`);
        const errors: any[] = [];

        const allExisting = await this.prisma.group.findMany({
            select: { groupNo: true },
        });
        const existingNos = new Set(allExisting.map((x) => x.groupNo));

        const prefix = 'G-';
        const startNo = await this.autoNumberService.generateGroupNo();
        let currentNum = parseInt(startNo.replace(prefix, ''));

        const BATCH_SIZE = 1000;
        const dataToInsert: any[] = [];

        for (const groupDto of dto.groups) {
            let groupName = 'Unnamed Group';
            try {
                groupName = groupDto.groupName?.trim() || 'Unnamed Group';

                // Unique number logic
                let finalGroupNo = groupDto.groupNo?.trim();
                if (!finalGroupNo || existingNos.has(finalGroupNo)) {
                    finalGroupNo = `${prefix}${currentNum}`;
                    currentNum++;
                    while (existingNos.has(finalGroupNo)) {
                        finalGroupNo = `${prefix}${currentNum}`;
                        currentNum++;
                    }
                }
                existingNos.add(finalGroupNo);

                dataToInsert.push({
                    ...groupDto,
                    groupName,
                    groupNo: finalGroupNo,
                    status: groupDto.status || GroupStatus.Active,
                    createdBy: userId,
                });
            } catch (err) {
                errors.push({ groupName, error: err.message });
            }
        }

        const chunks: any[][] = this.excelUploadService.chunk(dataToInsert, BATCH_SIZE);
        let totalInserted = 0;
        for (const chunk of chunks) {
            try {
                const result = await this.prisma.group.createMany({
                    data: chunk,
                    skipDuplicates: true,
                });
                totalInserted += result.count;
            } catch (err) {
                this.logger.error(`[BATCH_INSERT_ERROR] ${err.message}`);
                errors.push({ error: 'Batch insert failed', details: err.message });
            }
        }

        this.logger.log(`[BULK_CREATE_COMPLETED] Processed: ${dto.groups.length} | Inserted Actual: ${totalInserted} | Errors: ${errors.length}`);
        await this.invalidateCache();

        return {
            success: totalInserted,
            failed: dto.groups.length - totalInserted,
            message: `Successfully inserted ${totalInserted} records.`,
            errors,
        };
    }

    async bulkUpdate(dto: BulkUpdateGroupDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const update of dto.updates) {
                try {
                    const { id, ...data } = update;

                    const updated = await tx.group.update({
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

    async bulkDelete(dto: BulkDeleteGroupDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const id of dto.ids) {
            try {
                await this.delete(id, userId);
                results.push(id);
            } catch (error) {
                errors.push({
                    id,
                    error: error.message,
                });
            }
        }

        await this.invalidateCache();

        if (results.length === 0 && errors.length > 0) {
            throw new BadRequestException(errors[0].error);
        }

        return {
            success: results.length,
            failed: errors.length,
            results,
            errors,
        };
    }



    async uploadExcel(file: Express.Multer.File, userId: string) {
        this.logger.log(`[UPLOAD] File: ${file?.originalname} | Size: ${file?.size}`);

        const columnMapping = {
            groupNo: ['groupno', 'groupnumber', 'no', 'number'],
            groupName: ['groupname', 'name', 'gname', 'group'],
            groupCode: ['groupcode', 'code', 'gcode'],
            clientGroupName: ['clientgroupname', 'clientgroup', 'groupname'],
            companyName: ['companyname', 'clientcompanyname', 'company', 'clientcompany'],
            locationName: ['locationname', 'clientlocationname', 'location', 'clientlocation'],
            subLocationName: ['sublocationname', 'sublocation', 'clientsublocationname'],
            status: ['status', 'state', 'active'],
            remark: ['remark', 'remarks', 'notes', 'description', 'comment'],
        };

        const requiredColumns = ['groupName'];

        const { data, errors: parseErrors } = await this.excelUploadService.parseFile<CreateGroupDto>(
            file,
            columnMapping,
            requiredColumns,
        );

        if (data.length === 0) {
            throw new BadRequestException('No valid data found to import. Please check file format and column names.');
        }

        // Resolve relations
        const clientGroupNames = Array.from(new Set(data.filter(r => (r as any).clientGroupName).map(r => (r as any).clientGroupName)));
        const companyNames = Array.from(new Set(data.filter(r => (r as any).companyName).map(r => (r as any).companyName)));
        const locationNames = Array.from(new Set(data.filter(r => (r as any).locationName).map(r => (r as any).locationName)));
        const subLocationNames = Array.from(new Set(data.filter(r => (r as any).subLocationName).map(r => (r as any).subLocationName)));

        const [dbClientGroups, dbCompanies, dbLocations, dbSubLocations] = await Promise.all([
            this.prisma.clientGroup.findMany({ where: { groupName: { in: clientGroupNames } }, select: { id: true, groupName: true } }),
            this.prisma.clientCompany.findMany({ where: { companyName: { in: companyNames } }, select: { id: true, companyName: true } }),
            this.prisma.clientLocation.findMany({ where: { locationName: { in: locationNames } }, select: { id: true, locationName: true } }),
            this.prisma.subLocation.findMany({ where: { subLocationName: { in: subLocationNames } }, select: { id: true, subLocationName: true } }),
        ]);

        const clientGroupMap = new Map(dbClientGroups.map(g => [g.groupName.toLowerCase(), g.id]));
        const companyMap = new Map(dbCompanies.map(c => [c.companyName.toLowerCase(), c.id]));
        const locationMap = new Map(dbLocations.map(l => [l.locationName.toLowerCase(), l.id]));
        const subLocationMap = new Map(dbSubLocations.map(s => [s.subLocationName.toLowerCase(), s.id]));

        const processedData: CreateGroupDto[] = [];
        const processingErrors: any[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            try {
                const status = (row as any).status ? this.excelUploadService.validateEnum((row as any).status as string, GroupStatus, 'Status') : GroupStatus.Active;

                const clientGroupId = clientGroupMap.get((row as any).clientGroupName?.toLowerCase());
                if (!clientGroupId) throw new Error(`Client Group "${(row as any).clientGroupName}" not found or missing`);

                const companyId = companyMap.get((row as any).companyName?.toLowerCase());
                const locationId = locationMap.get((row as any).locationName?.toLowerCase());
                const subLocationId = subLocationMap.get((row as any).subLocationName?.toLowerCase());

                processedData.push({
                    groupNo: (row as any).groupNo,
                    groupName: (row as any).groupName,
                    clientGroupIds: clientGroupId ? [clientGroupId] : [],
                    companyIds: companyId ? [companyId] : [],
                    locationIds: locationId ? [locationId] : [],
                    subLocationIds: subLocationId ? [subLocationId] : [],
                    status: status as GroupStatus,
                    remark: (row as any).remark,
                });
            } catch (err) {
                processingErrors.push({ row: i + 2, error: err.message });
            }
        }

        if (processedData.length === 0 && processingErrors.length > 0) {
            throw new BadRequestException(`Validation Failed: ${processingErrors[0].error}`);
        }

        const result = await this.bulkCreate({ groups: processedData }, userId);

        result.errors = [...(result.errors || []), ...parseErrors, ...processingErrors];
        result.failed += parseErrors.length + processingErrors.length;

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
                teamId: userId,
                action,
                entity: 'Group',
                entityId,
                oldValue: oldValue,
                newValue: newValue,
                ipAddress: '',
            },
        });
    }
}
