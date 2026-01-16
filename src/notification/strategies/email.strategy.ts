import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationStrategy } from '../interfaces/notification-strategy.interface';
import { OtpChannel } from '../../auth/dto/auth.dto';

@Injectable()
export class EmailStrategy implements NotificationStrategy {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailStrategy.name);

    constructor(private configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get('SMTP_HOST'),
            port: parseInt(this.configService.get('SMTP_PORT', '587')),
            secure: this.configService.get('SMTP_SECURE') === 'true',
            auth: {
                user: this.configService.get('SMTP_USER'),
                pass: this.configService.get('SMTP_PASS'),
            },
            // Prevent hanging: Fail after 10 seconds if connection or greeting fails
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    getChannelName(): OtpChannel {
        return OtpChannel.EMAIL;
    }

    async sendOtp(recipient: string, otp: string): Promise<boolean> {
        try {
            await this.transporter.sendMail({
                from: this.configService.get('SMTP_FROM', '"HRMS Support" <no-reply@hrms.com>'),
                to: recipient,
                subject: 'Your Verification Code',
                text: `Your OTP is: ${otp}`,
                html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
            });
            this.logger.log(`OTP sent to email: ${recipient}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send email OTP to ${recipient}: ${error.message}`);
            // In dev mode, we might not have a real SMTP, so we can return true if configured to mock
            // But strictly keeping it false for now as per requirements "return success only if delivered"
            return false;
        }
    }
}
