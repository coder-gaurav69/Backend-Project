import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const url = request.url;
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);

        console.log(`[ROLES_GUARD] Checking URL: ${url}`);

        if (!requiredRoles) {
            console.log(`[ROLES_GUARD] No roles required for ${url}. Access Granted.`);
            return true;
        }

        const { user } = request;
        if (!user) {
            console.log(`[ROLES_GUARD] No user found in request for ${url}. Access Denied.`);
            return false;
        }

        const hasPermission = requiredRoles.some((role) => user.role === role);

        if (!hasPermission) {
            console.log(`[ROLES_GUARD] Access Denied for ${url}. User Role: ${user?.role}, Required Roles: ${requiredRoles}`);
        } else {
            console.log(`[ROLES_GUARD] Access Granted for ${url}. User Role: ${user?.role}`);
        }

        return hasPermission;
    }
}
