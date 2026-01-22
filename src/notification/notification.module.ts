import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { EmailStrategy } from './strategies/email.strategy';

@Module({
    imports: [ConfigModule],
    providers: [NotificationService, EmailStrategy],
    exports: [NotificationService],
})
export class NotificationModule { }
