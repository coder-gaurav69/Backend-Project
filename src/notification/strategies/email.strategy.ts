import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationStrategy } from '../interfaces/notification-strategy.interface';
import { OtpChannel } from '../../auth/dto/auth.dto';

@Injectable()
export class EmailStrategy implements NotificationStrategy, OnModuleInit {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailStrategy.name);
    private smtpProvider: 'gmail' | 'brevo' | 'custom';

    constructor(private configService: ConfigService) {
        this.initializeTransporter();
    }

    async onModuleInit() {
        // Verify SMTP connection on startup
        try {
            await this.transporter.verify();
            this.logger.log(`✅ SMTP connection verified successfully`);
        } catch (error) {
            this.logger.error(`❌ SMTP connection failed: ${error.message}`);
            this.logger.warn('⚠️  Email OTP delivery may fail. Please check your SMTP credentials.');
        }
    }

    private initializeTransporter() {
        const smtpHost = this.configService.get('SMTP_HOST', '');
        const smtpUser = this.configService.get('SMTP_USER', '');
        const smtpPass = this.configService.get('SMTP_PASS', '');
        const smtpPort = parseInt(this.configService.get('SMTP_PORT', '587'));
        const smtpSecure = this.configService.get('SMTP_SECURE', 'false') === 'true';

        // Pure SMTP configuration - provider agnostic
        this.smtpProvider = 'custom';

        if (!smtpHost || !smtpUser || !smtpPass) {
            this.logger.error('❌ SMTP configuration incomplete. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
            throw new Error('SMTP configuration is required');
        }

        const transportConfig = {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure, // true for 465, false for 587
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        };

        this.logger.log(`📧 Initializing SMTP: ${smtpHost}:${smtpPort} (Secure: ${smtpSecure})`);

        this.transporter = nodemailer.createTransport({
            ...transportConfig,
            pool: true, // Use connection pooling for better performance
            maxConnections: 5,
            maxMessages: 100,
            connectionTimeout: 30000, // 30 seconds
            greetingTimeout: 30000,
            socketTimeout: 45000, // 45 seconds
            tls: {
                rejectUnauthorized: false, // Accept self-signed certificates
                minVersion: 'TLSv1.2',
            },
        });
    }

    getChannelName(): OtpChannel {
        return OtpChannel.EMAIL;
    }

    async sendOtp(recipient: string, otp: string): Promise<boolean> {
        const startTime = Date.now();

        try {
            const fromEmail = this.configService.get('SMTP_FROM', '"HRMS Support" <noreply@yourapp.com>');

            this.logger.log(`📤 Sending OTP to ${recipient}...`);

            const info = await this.transporter.sendMail({
                from: fromEmail,
                to: recipient,
                subject: '🔐 Your HRMS Verification Code',
                text: `Your OTP verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Verification Code</h1>
                        </div>
                        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                            <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
                            <p style="font-size: 16px; margin-bottom: 20px;">Your OTP verification code is:</p>
                            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                                <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px;">${otp}</span>
                            </div>
                            <p style="font-size: 14px; color: #666; margin-top: 20px;">⏱️ This code will expire in <strong>10 minutes</strong>.</p>
                            <p style="font-size: 14px; color: #666; margin-top: 10px;">If you didn't request this code, please ignore this email.</p>
                            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} HRMS. All rights reserved.</p>
                        </div>
                    </body>
                    </html>
                `,
            });

            const duration = Date.now() - startTime;
            this.logger.log(`✅ OTP sent successfully to ${recipient} in ${duration}ms (MessageID: ${info.messageId})`);

            return true;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`❌ Failed to send OTP to ${recipient} after ${duration}ms: ${error.message}`);
            this.logger.error(`Error details: ${JSON.stringify({ code: error.code, command: error.command })}`);

            // Re-throw with more context
            throw new Error(`Email delivery failed: ${error.message}`);
        }
    }
}
