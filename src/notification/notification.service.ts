import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { NotificationStrategy } from './interfaces/notification-strategy.interface';
import { EmailStrategy } from './strategies/email.strategy';
import { OtpChannel } from '../auth/dto/auth.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private strategies: Map<OtpChannel, NotificationStrategy> = new Map();

    constructor(
        private prisma: PrismaService,
        private emailStrategy: EmailStrategy,
    ) {
        this.strategies.set(OtpChannel.EMAIL, emailStrategy);
    }

    async createNotification(userId: string, data: { title: string; description: string; type?: string; metadata?: any }) {
        // @ts-ignore
        return this.prisma.notification.create({
            data: {
                userId,
                title: data.title,
                description: data.description,
                type: data.type || 'SYSTEM',
                metadata: data.metadata || {},
            },
        });
    }

    async broadcastToGroup(groupId: string, data: { title: string; description: string; type?: string; metadata?: any }) {
        // @ts-ignore
        const members = await this.prisma.groupMember.findMany({
            where: { groupId },
            select: { userId: true },
        });

        if (members.length === 0) return { count: 0 };

        const notificationsData = members.map(member => ({
            userId: member.userId,
            title: data.title,
            description: data.description,
            type: data.type || 'SYSTEM',
            metadata: data.metadata || {},
        }));

        // @ts-ignore
        return this.prisma.notification.createMany({
            data: notificationsData,
        });
    }

    async findAllForUser(userId: string) {
        // @ts-ignore
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50, // Limit to recent 50
        });
    }

    async markAsRead(id: string, userId: string) {
        // @ts-ignore
        return this.prisma.notification.update({
            where: { id, userId },
            data: { isRead: true },
        });
    }

    async markAllAsRead(userId: string) {
        // @ts-ignore
        return this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
    }

    async getUnreadCount(userId: string) {
        // @ts-ignore
        return this.prisma.notification.count({
            where: { userId, isRead: false },
        });
    }

    async sendOtp(recipient: string, otp: string, channel: OtpChannel): Promise<void> {
        const strategy = this.strategies.get(channel);
        if (!strategy) {
            throw new BadRequestException('Invalid OTP channel');
        }

        // Secure: Only log to server console for testing
        this.logger.log(`[AUTH] Generating OTP for ${recipient} via ${channel}`);

        try {
            const success = await strategy.sendOtp(recipient, otp);
            if (!success) {
                throw new Error('Notification strategy failed to deliver');
            }
        } catch (error: any) {
            this.logger.error(`[NOTIFICATION_ERROR] ${error.message}`);
            throw new BadRequestException(
                `Failed to send OTP via ${channel}: ${error.message}`
            );
        }
    }
}
