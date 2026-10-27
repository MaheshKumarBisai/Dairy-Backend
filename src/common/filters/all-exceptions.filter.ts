import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorMessage = 'An unexpected internal error occurred. Please try again later.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        errorMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        if (Array.isArray(resObj.message)) {
          errorMessage = resObj.message.join(', ');
          errorCode = 'VALIDATION_ERROR';
        } else {
          errorMessage = resObj.message || exception.message;
          errorCode = resObj.error || this.getErrorCodeFromStatus(status);
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle known Prisma errors safely
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[])?.join(', ') || 'field';
          errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
          errorMessage = `A record with this ${target} already exists.`;
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          errorCode = 'RESOURCE_NOT_FOUND';
          errorMessage = 'The requested resource was not found.';
          break;
        }
        case 'P2003': {
          status = HttpStatus.BAD_REQUEST;
          errorCode = 'FOREIGN_KEY_CONSTRAINT_FAILED';
          errorMessage = 'Referenced entity does not exist.';
          break;
        }
        default: {
          status = HttpStatus.BAD_REQUEST;
          errorCode = `DATABASE_ERROR_${exception.code}`;
          errorMessage = 'Database operation could not be completed.';
          break;
        }
      }
    } else {
      this.logger.error('Unhandled Exception Caught:', exception);
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode.toUpperCase().replace(/\s+/g, '_'),
        message: errorMessage,
      },
    });
  }

  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
