import { Injectable, BadRequestException } from '@nestjs/common';
import { NotificationStrategy } from './interfaces/notification-strategy.interface';
import { EmailStrategy } from './strategies/email.strategy';
import { SmsStrategy } from './strategies/sms.strategy';
import { OtpChannel } from '../auth/dto/auth.dto';

@Injectable()
export class NotificationService {
    private strategies: Map<OtpChannel, NotificationStrategy> = new Map();

    constructor(
        private emailStrategy: EmailStrategy,
        private smsStrategy: SmsStrategy,
    ) {
        this.strategies.set(OtpChannel.EMAIL, emailStrategy);
        this.strategies.set(OtpChannel.SMS, smsStrategy);
    }

    async sendOtp(recipient: string, otp: string, channel: OtpChannel): Promise<void> {
        const strategy = this.strategies.get(channel);
        if (!strategy) {
            throw new BadRequestException('Invalid OTP channel');
        }

        // Always log OTP to console so user can see it in Render Logs
        console.log(`[AUTH DEBUG] OTP for ${recipient} via ${channel}: ${otp}`);

        const success = await strategy.sendOtp(recipient, otp);
        if (!success) {
            throw new BadRequestException(
                `Failed to send OTP via ${channel}. For testing, your OTP is ${otp}. Please check your ${channel} credentials in .env later.`
            );
        }
    }
}
