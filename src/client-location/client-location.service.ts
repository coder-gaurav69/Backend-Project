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
    CreateClientLocationDto,
    UpdateClientLocationDto,
    BulkCreateClientLocationDto,
    BulkUpdateClientLocationDto,
    BulkDeleteClientLocationDto,
    ChangeStatusDto,
    FilterClientLocationDto,
} from './dto/client-location.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponse } from '../common/dto/api-response.dto';
import { LocationStatus, Prisma } from '@prisma/client';
import { buildMultiValueFilter } from '../common/utils/prisma-helper';

@Injectable()
export class ClientLocationService {
    private readonly logger = new Logger(ClientLocationService.name);
    private readonly CACHE_TTL = 300;
    private readonly CACHE_KEY = 'client_locations';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private autoNumberService: AutoNumberService,
        private excelUploadService: ExcelUploadService,
    ) { }

    async create(dto: CreateClientLocationDto, userId: string) {
        const existing = await this.prisma.clientLocation.findUnique({
            where: { locationCode: dto.locationCode },
        });

        if (existing) {
            throw new ConflictException('Location code already exists');
        }

        const company = await this.prisma.clientCompany.findFirst({
            where: { id: dto.companyId },
        });

        if (!company) {
            throw new NotFoundException('Client company not found');
        }

        const generatedLocationNo = await this.autoNumberService.generateLocationNo();

        const location = await this.prisma.clientLocation.create({
            data: {
                ...dto,
                locationNo: dto.locationNo || generatedLocationNo,
                status: dto.status || LocationStatus.ACTIVE,
                createdBy: userId,
            },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'CREATE', location.id, null, location);

        return location;
    }

    async findAll(pagination: PaginationDto, filter?: FilterClientLocationDto) {
        const {
            page = 1,
            limit = 10,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = pagination;
        const skip = (page - 1) * limit;

        const where: Prisma.ClientLocationWhereInput = {
            AND: [
                filter?.status ? { status: filter.status } : {},
                filter?.companyId ? { companyId: filter.companyId } : {},
                buildMultiValueFilter('locationName', filter?.locationName),
                buildMultiValueFilter('locationNo', filter?.locationNo),
                buildMultiValueFilter('locationCode', filter?.locationCode),
                buildMultiValueFilter('remark', filter?.remark),
                search ? {
                    OR: [
                        { locationName: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        { locationCode: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        { locationNo: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    ]
                } : {},
            ].filter(condition => condition && Object.keys(condition).length > 0) as any
        };

        const [data, total] = await Promise.all([
            this.prisma.clientLocation.findMany({
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
                        },
                    },
                },
            }),
            this.prisma.clientLocation.count({ where }),
        ]);

        const mappedData = data.map((item) => ({
            ...item,
            clientCompany: item.company,
            companyName: item.company?.companyName, // Flattened for table column accessor
        }));

        return new PaginatedResponse(mappedData, total, page, limit);
    }

    async findActive(pagination: PaginationDto) {
        const filter: FilterClientLocationDto = { status: LocationStatus.ACTIVE };
        return this.findAll(pagination, filter);
    }

    async findById(id: string) {
        const location = await this.prisma.clientLocation.findFirst({
            where: { id },
            include: {
                company: {
                    include: {
                        group: true,
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

        if (!location) {
            throw new NotFoundException('Client location not found');
        }

        return location;
    }

    async update(id: string, dto: UpdateClientLocationDto, userId: string) {
        const existing = await this.findById(id);

        if (dto.locationCode && dto.locationCode !== existing.locationCode) {
            const duplicate = await this.prisma.clientLocation.findUnique({
                where: { locationCode: dto.locationCode },
            });

            if (duplicate) {
                throw new ConflictException('Location code already exists');
            }
        }

        if (dto.companyId) {
            const company = await this.prisma.clientCompany.findFirst({
                where: { id: dto.companyId },
            });

            if (!company) {
                throw new NotFoundException('Client company not found');
            }
        }

        const updated = await this.prisma.clientLocation.update({
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

        const updated = await this.prisma.clientLocation.update({
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

        await this.prisma.clientLocation.delete({
            where: { id },
        });

        await this.invalidateCache();
        await this.logAudit(userId, 'HARD_DELETE', id, existing, null);

        return { message: 'Client location and all associated data permanently deleted successfully' };
    }

    async bulkCreate(dto: BulkCreateClientLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        const allExisting = await this.prisma.clientLocation.findMany({
            select: { locationCode: true, locationNo: true },
        });

        const existingCodes = new Set(allExisting.map((x) => x.locationCode));
        const existingNos = new Set(allExisting.map((x) => x.locationNo));

        let currentNum = parseInt(
            (await this.autoNumberService.generateLocationNo()).replace('CL-', ''),
        );

        for (const locationDto of dto.locations) {
            try {
                const locationName =
                    locationDto.locationName?.trim() ||
                    locationDto.locationCode ||
                    'Unnamed Location';

                let finalLocationCode =
                    locationDto.locationCode?.trim() || `LOC-${Date.now()}`;
                const originalCode = finalLocationCode;
                let cSuffix = 1;
                while (existingCodes.has(finalLocationCode)) {
                    finalLocationCode = `${originalCode}-${cSuffix}`;
                    cSuffix++;
                }
                existingCodes.add(finalLocationCode);

                let finalLocationNo = locationDto.locationNo?.trim();
                if (
                    !finalLocationNo ||
                    !finalLocationNo.includes('CL-') ||
                    existingNos.has(finalLocationNo)
                ) {
                    finalLocationNo = `CL-${currentNum}`;
                    currentNum++;
                    while (existingNos.has(finalLocationNo)) {
                        finalLocationNo = `CL-${currentNum}`;
                        currentNum++;
                    }
                }
                existingNos.add(finalLocationNo);

                const company = await this.prisma.clientCompany.findFirst({
                    where: { id: locationDto.companyId },
                });

                if (!company) {
                    throw new Error('Client company not found');
                }

                const created = await this.prisma.clientLocation.create({
                    data: {
                        ...locationDto,
                        locationName,
                        locationCode: finalLocationCode,
                        locationNo: finalLocationNo,
                        status: locationDto.status || LocationStatus.ACTIVE,
                        createdBy: userId,
                    },
                });
                results.push(created);
            } catch (error) {
                errors.push({
                    locationCode: locationDto.locationCode,
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

    async bulkUpdate(dto: BulkUpdateClientLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const update of dto.updates) {
                try {
                    const { id, ...data } = update;

                    const updated = await tx.clientLocation.update({
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

    async bulkDelete(dto: BulkDeleteClientLocationDto, userId: string) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const id of dto.ids) {
            try {
                const existing = await this.prisma.clientLocation.findUnique({ where: { id } });
                if (!existing) continue;

                await this.prisma.clientLocation.delete({
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
            deletedIds: results,
            errors,
        };
    }



    async uploadExcel(file: Express.Multer.File, userId: string) {
        const columnMapping = {
            locationNo: ['locationno', 'locationnumber', 'no', 'number'],
            locationName: ['locationname', 'name', 'lname', 'location'],
            locationCode: ['locationcode', 'code', 'lcode'],
            companyName: ['companyname', 'clientcompanyname', 'company', 'clientcompany'],
            address: ['address', 'physicaladdress', 'street', 'locationaddress', 'addr'],
            status: ['status', 'state', 'active'],
            remark: ['remark', 'remarks', 'notes', 'description', 'comment'],
        };

        const requiredColumns = ['locationName', 'locationCode', 'companyName'];

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

        // Validate status enum and resolve companyName to companyId
        const processedData: CreateClientLocationDto[] = [];
        for (const row of data) {
            if (row.status) {
                this.excelUploadService.validateEnum(
                    row.status as string,
                    LocationStatus,
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

            processedData.push({
                locationNo: row.locationNo,
                locationName: row.locationName,
                locationCode: row.locationCode,
                companyId: company.id, // Use the resolved companyId
                address: row.address,
                status: row.status,
                remark: row.remark,
            });
        }

        const result = await this.bulkCreate({ locations: processedData }, userId);

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
                entity: 'ClientLocation',
                entityId,
                oldValue: oldValue,
                newValue: newValue,
                ipAddress: '',
            },
        });
    }
}
