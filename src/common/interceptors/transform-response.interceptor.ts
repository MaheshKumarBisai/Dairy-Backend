import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((res) => {
        // If the controller already returned a custom formatted response
        if (res && typeof res === 'object' && 'success' in res && ('data' in res || 'error' in res)) {
          return res;
        }

        let message = 'Request completed successfully';
        let data = res;

        if (res && typeof res === 'object' && '__message' in res) {
          message = res.__message;
          delete res.__message;
          data = res.data !== undefined ? res.data : res;
        }

        return {
          success: true,
          data: data !== undefined ? data : null,
          message,
        };
      }),
    );
  }
}
