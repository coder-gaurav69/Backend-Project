import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DebugMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        console.log(`[DEBUG_MIDDLEWARE] ${req.method} ${req.originalUrl}`);
        console.log(`[DEBUG_MIDDLEWARE] Headers:`, JSON.stringify(req.headers));
        next();
    }
}
