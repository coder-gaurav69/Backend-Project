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
    CreateSubLocationDto,
    UpdateSubLocationDto,
    BulkCreateSubLocationDto,
    BulkUpdateSubLocationDto,
    BulkDeleteSubLocationDto,
    ChangeStatusDto,
    FilterSubLocationDto,
} from './dto/sub-location.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponse } from '../common/dto/api-response.dto';
import { SubLocationStatus, Prisma } from '@prisma/client';
import { buildMultiValueFilter } from '../common/utils/prisma-helper';

@Injectable()
export class SubLocationService {
    private readonly logger = new Logger(SubLocationService.name);
    private readonly CACHE_TTL = 300;
    private readonly CACHE_KEY = 'sub_locations';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private autoNumberService: AutoNumberService,
        private excelUploadService: ExcelUploadService,
    ) { }

    async create(dto: CreateSubLocationDto, userId: string) {
        const existing = await this.prisma.subLocation.findUnique({
            where: { subLocationCode: dto.subLocationCode },
        });

        if (existing) {
            throw new ConflictException('Sub location code already exists');
        }

        const location = await this.prisma.clientLocation.findFirst({
            where: { id: dto.locationId },
        });

        if (!location) {
            throw new NotFoundException('Client location not found');
        }

        const generatedSubLocationNo = await this.autoNumberService.generateSubLocationNo();

        const subLocation = await this.prisma.subLocation.create({
            data: {
                ...dto,
                companyId: dto.companyId || location.companyId, // Ensure companyId is set
                subLocationNo: dto.subLocationNo || generatedSubLocationNo,
                status: dto.status || SubLocationStatus.ACTIVE,
                createdBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'CREATE', subLocation.id, null, subLocation);

        return subLocation;
    }

    async findAll(pagination: PaginationDto, filter?: FilterSubLocationDto) {
        const {
            page = 1,
            limit = 10,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = pagination;
        const skip = (page - 1) * limit;

        const where: Prisma.SubLocationWhereInput = {
            AND: [
                filter?.status ? { status: filter.status } : {},
                filter?.companyId ? { companyId: filter.companyId } : {},
                filter?.locationId ? { locationId: filter.locationId } : {},
                buildMultiValueFilter('subLocationName', filter?.subLocationName),
                buildMultiValueFilter('subLocationNo', filter?.subLocationNo),
                buildMultiValueFilter('subLocationCode', filter?.subLocationCode),
                buildMultiValueFilter('remark', filter?.remark),
                search ? {
                    OR: [
                        { subLocationName: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        { subLocationCode: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        { subLocationNo: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    ]
                } : {},
            ].filter(condition => condition && Object.keys(condition).length > 0) as any
        };

        const [data, total] = await Promise.all([
            this.prisma.subLocation.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { [sortBy]: sortOrder },
                include: {
                    company: {
                        select: {
                            id: true,
                            companyName: true,
                            companyCode: true,
                        }
                    },
                    location: {
                        select: {
                            id: true,
                            locationName: true,
                            locationCode: true,
                        },
                    },
                },
            }),
            this.prisma.subLocation.count({ where }),
        ]);

        const mappedData = data.map((item) => ({
            ...item,
            clientLocation: item.location,
            clientCompany: item.company,
            locationName: item.location?.locationName,
            companyName: item.company?.companyName,
        }));

        return new PaginatedResponse(mappedData, total, page, limit);
    }

    async findActive(pagination: PaginationDto) {
        const filter: FilterSubLocationDto = { status: SubLocationStatus.ACTIVE };
        return this.findAll(pagination, filter);
    }

    async findById(id: string) {
        const subLocation = await this.prisma.subLocation.findFirst({
            where: { id },
            include: {
                location: {
                    include: {
                        company: {
                            include: {
                                group: true,
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

        if (!subLocation) {
            throw new NotFoundException('Sub location not found');
        }

        return subLocation;
    }

    async update(id: string, dto: UpdateSubLocationDto, userId: string) {
        const existing = await this.findById(id);

        if (dto.subLocationCode && dto.subLocationCode !== existing.subLocationCode) {
            const duplicate = await this.prisma.subLocation.findUnique({
                where: { subLocationCode: dto.subLocationCode },
            });

            if (duplicate) {
                throw new ConflictException('Sub location code already exists');
            }
        }

        if (dto.locationId) {
            const location = await this.prisma.clientLocation.findFirst({
                where: { id: dto.locationId },
            });

            if (!location) {
                throw new NotFoundException('Client location not found');
            }
        }

        const updated = await this.prisma.subLocation.update({
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

        const updated = await this.prisma.subLocation.update({
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

        await this.prisma.subLocation.delete({
            where: { id },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'HARD_DELETE', id, existing, null);

        return { message: 'Sub location and all associated data permanently deleted successfully' };
    }

    async bulkCreate(dto: BulkCreateSubLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        const allExisting = await this.prisma.subLocation.findMany({
            select: { subLocationCode: true, subLocationNo: true },
        });

        const existingCodes = new Set(allExisting.map((x) => x.subLocationCode));
        const existingNos = new Set(allExisting.map((x) => x.subLocationNo));

        let currentNum = parseInt(
            (await this.autoNumberService.generateSubLocationNo()).replace('CS-', ''),
        );

        for (const subLocationDto of dto.subLocations) {
            try {
                const subLocationName =
                    subLocationDto.subLocationName?.trim() ||
                    subLocationDto.subLocationCode ||
                    'Unnamed Sub Location';

                let finalSubLocationCode =
                    subLocationDto.subLocationCode?.trim() || `SUBLOC-${Date.now()}`;
                const originalCode = finalSubLocationCode;
                let cSuffix = 1;
                while (existingCodes.has(finalSubLocationCode)) {
                    finalSubLocationCode = `${originalCode}-${cSuffix}`;
                    cSuffix++;
                }
                existingCodes.add(finalSubLocationCode);

                let finalSubLocationNo = subLocationDto.subLocationNo?.trim();
                if (
                    !finalSubLocationNo ||
                    !finalSubLocationNo.includes('CS-') ||
                    existingNos.has(finalSubLocationNo)
                ) {
                    finalSubLocationNo = `CS-${currentNum}`;
                    currentNum++;
                    while (existingNos.has(finalSubLocationNo)) {
                        finalSubLocationNo = `CS-${currentNum}`;
                        currentNum++;
                    }
                }
                existingNos.add(finalSubLocationNo);

                const location = await this.prisma.clientLocation.findFirst({
                    where: { id: subLocationDto.locationId },
                });

                if (!location) {
                    throw new Error('Client location not found');
                }

                const created = await this.prisma.subLocation.create({
                    data: {
                        ...subLocationDto,
                        companyId: subLocationDto.companyId || location.companyId,
                        subLocationName,
                        subLocationCode: finalSubLocationCode,
                        subLocationNo: finalSubLocationNo,
                        status: subLocationDto.status || SubLocationStatus.ACTIVE,
                        createdBy: userId,
                    },
                });
                results.push(created);
            } catch (error) {
                errors.push({
                    subLocationCode: subLocationDto.subLocationCode,
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

    async bulkUpdate(dto: BulkUpdateSubLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const update of dto.updates) {
                try {
                    const { id, ...data } = update;

                    const updated = await tx.subLocation.update({
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

    async bulkDelete(dto: BulkDeleteSubLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const id of dto.ids) {
            try {
                const existing = await this.prisma.subLocation.findUnique({ where: { id } });
                if (!existing) continue;

                await this.prisma.subLocation.delete({
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
            subLocationNo: ['sublocationno', 'sublocationnumber', 'no', 'number'],
            subLocationName: ['sublocationname', 'name', 'sname', 'sublocation'],
            subLocationCode: ['sublocationcode', 'code', 'scode'],
            locationName: ['locationname', 'clientlocationname', 'location', 'clientlocation'],
            companyName: ['companyname', 'clientcompanyname', 'company', 'clientcompany'],
            address: ['address', 'physicaladdress', 'street', 'sublocationaddress', 'addr'],
            status: ['status', 'state', 'active'],
            remark: ['remark', 'remarks', 'notes', 'description', 'comment'],
        };

        const requiredColumns = ['subLocationName', 'subLocationCode', 'locationName', 'companyName'];

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

        // Validate status enum and resolve locationName to locationId
        const processedData: CreateSubLocationDto[] = [];
        for (const row of data) {
            if (row.status) {
                this.excelUploadService.validateEnum(
                    row.status as string,
                    SubLocationStatus,
                    'Status',
                );
            }

            // Find companyId from companyName
            const company = await this.prisma.clientCompany.findFirst({
                where: {
                    companyName: row.companyName,
                },
            });

            if (!company) {
                throw new BadRequestException(
                    `Client Company not found: ${row.companyName}`,
                );
            }

            // Find locationId from locationName AND companyId
            const location = await this.prisma.clientLocation.findFirst({
                where: {
                    locationName: row.locationName,
                    companyId: company.id,
                },
            });

            if (!location) {
                throw new BadRequestException(
                    `Client Location "${row.locationName}" not found under Company "${row.companyName}"`,
                );
            }

            processedData.push({
                subLocationNo: row.subLocationNo,
                subLocationName: row.subLocationName,
                subLocationCode: row.subLocationCode,
                companyId: company.id,
                locationId: location.id,
                address: row.address,
                status: row.status,
                remark: row.remark,
            });
        }

        const result = await this.bulkCreate({ subLocations: processedData }, userId);

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
                entity: 'SubLocation',
                entityId,
                oldValue: oldValue,
                newValue: newValue,
                ipAddress: '',
            },
        });
    }
}
