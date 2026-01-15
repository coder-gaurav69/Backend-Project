import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStrategy } from '../interfaces/notification-strategy.interface';
import { OtpChannel } from '../../auth/dto/auth.dto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require('twilio');

@Injectable()
export class SmsStrategy implements NotificationStrategy {
    private client: any;
    private readonly logger = new Logger(SmsStrategy.name);

    constructor(private configService: ConfigService) {
        const sid = this.configService.get('TWILIO_SID');
        const token = this.configService.get('TWILIO_AUTH_TOKEN');
        if (sid && token) {
            this.client = twilio(sid, token);
        }
    }

    getChannelName(): OtpChannel {
        return OtpChannel.SMS;
    }

    async sendOtp(recipient: string, otp: string): Promise<boolean> {
        if (!this.client) {
            this.logger.warn('Twilio client not initialized. Check TWILIO_SID and TWILIO_AUTH_TOKEN');
            return false;
        }

        try {
            await this.client.messages.create({
                body: `Your OTP is: ${otp}`,
                from: this.configService.get('TWILIO_FROM'),
                to: recipient,
            });
            this.logger.log(`OTP sent to SMS: ${recipient}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send SMS OTP to ${recipient}: ${error.message}`);
            return false;
        }
    }
}
