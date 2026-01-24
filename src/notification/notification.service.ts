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

    async createNotification(teamId: string, data: { title: string; description: string; type?: string; metadata?: any }) {
        return this.prisma.notification.create({
            data: {
                teamId,
                title: data.title,
                description: data.description,
                type: data.type || 'SYSTEM',
                metadata: data.metadata || {},
            },
        });
    }

    async broadcastToGroup(groupId: string, data: { title: string; description: string; type?: string; metadata?: any }) {
        const members = await this.prisma.groupMember.findMany({
            where: { groupId },
            select: { userId: true }, // Note: userId in GroupMember still refers to the member (Team) ID
        });

        if (members.length === 0) return { count: 0 };

        const notificationsData = members.map(member => ({
            teamId: member.userId,
            title: data.title,
            description: data.description,
            type: data.type || 'SYSTEM',
            metadata: data.metadata || {},
        }));

        return this.prisma.notification.createMany({
            data: notificationsData,
        });
    }

    async findAllForUser(teamId: string) {
        return this.prisma.notification.findMany({
            where: { teamId },
            orderBy: { createdAt: 'desc' },
            take: 50, // Limit to recent 50
        });
    }

    async markAsRead(id: string, teamId: string) {
        return this.prisma.notification.update({
            where: { id, teamId }, // Ensure we only update if it belongs to the team
            data: { isRead: true },
        });
    }

    async markAllAsRead(teamId: string) {
        return this.prisma.notification.updateMany({
            where: { teamId, isRead: false },
            data: { isRead: true },
        });
    }

    async getUnreadCount(teamId: string) {
        return this.prisma.notification.count({
            where: { teamId, isRead: false },
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

    async sendInvitation(recipient: string, teamName: string, token: string): Promise<void> {
        try {
            await this.emailStrategy.sendInvitation(recipient, teamName, token);
        } catch (error: any) {
            this.logger.error(`[INVITATION_ERROR] ${error.message}`);
            throw new BadRequestException(`Failed to send invitation: ${error.message}`);
        }
    }
}
