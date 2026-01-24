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

        const identity = request.user;
        if (!identity) {
            console.log(`[ROLES_GUARD] No identity found in request for ${url}. Access Denied.`);
            return false;
        }

        const hasPermission = requiredRoles.some((role) => identity.role === role);

        if (!hasPermission) {
            console.log(`[ROLES_GUARD] Access Denied for ${url}. Identity Role: ${identity?.role}, Required Roles: ${requiredRoles}`);
        } else {
            console.log(`[ROLES_GUARD] Access Granted for ${url}. Identity Role: ${identity?.role}`);
        }

        return hasPermission;
    }
}
