import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { EmailStrategy } from './strategies/email.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [ConfigModule, PrismaModule],
    controllers: [NotificationController],
    providers: [NotificationService, EmailStrategy],
    exports: [NotificationService],
})
export class NotificationModule { }
