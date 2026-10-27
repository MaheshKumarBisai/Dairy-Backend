import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const res = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const { method, originalUrl, ip } = req;
    const user = req.user;
    const userId = user?.userId || 'ANONYMOUS';
    const merchantId = user?.merchantId || 'NONE';

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              method,
              endpoint: originalUrl,
              statusCode,
              durationMs: duration,
              userId,
              merchantId,
              ip,
            }),
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          this.logger.warn(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              method,
              endpoint: originalUrl,
              statusCode,
              durationMs: duration,
              userId,
              merchantId,
              ip,
              errorName: error.name,
              errorMessage: error.message,
            }),
          );
        },
      }),
    );
  }
}
