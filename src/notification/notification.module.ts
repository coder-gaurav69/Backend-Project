import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { EmailStrategy } from './strategies/email.strategy';
import { SmsStrategy } from './strategies/sms.strategy';

@Module({
    imports: [ConfigModule],
    providers: [NotificationService, EmailStrategy, SmsStrategy],
    exports: [NotificationService],
})
export class NotificationModule { }
