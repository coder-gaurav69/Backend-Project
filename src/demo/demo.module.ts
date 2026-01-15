import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { AuthModule } from '../auth/auth.module';
import { ClientGroupModule } from '../client-group/client-group.module';
import { PdfModule } from '../pdf/pdf.module';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [AuthModule, ClientGroupModule, PdfModule, RedisModule],
    controllers: [DemoController],
    providers: [DemoService],
})
export class DemoModule { }
