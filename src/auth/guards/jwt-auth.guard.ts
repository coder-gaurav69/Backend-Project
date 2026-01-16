import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    canActivate(context: ExecutionContext) {
        const url = context.switchToHttp().getRequest().url;
        console.log(`[JWT_AUTH_GUARD] Checking URL: ${url}`);
        return super.canActivate(context);
    }
}
