import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get()
    findAll(@GetUser('id') userId: string) {
        return this.notificationService.findAllForUser(userId);
    }

    @Get('unread-count')
    getUnreadCount(@GetUser('id') userId: string) {
        return this.notificationService.getUnreadCount(userId);
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string, @GetUser('id') userId: string) {
        return this.notificationService.markAsRead(id, userId);
    }

    @Patch('mark-all-read')
    markAllAsRead(@GetUser('id') userId: string) {
        return this.notificationService.markAllAsRead(userId);
    }
}
