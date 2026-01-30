import { Module, Global } from '@nestjs/common';
import { AutoNumberService } from './services/auto-number.service';
import { ExcelUploadService } from './services/excel-upload.service';
import { CloudinaryService } from './services/cloudinary.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Global Common Module
 * Provides reusable services across all HRMS modules
 */
@Global()
@Module({
    imports: [PrismaModule],
    providers: [AutoNumberService, ExcelUploadService, CloudinaryService],
    exports: [AutoNumberService, ExcelUploadService, CloudinaryService],
})
export class CommonModule { }
