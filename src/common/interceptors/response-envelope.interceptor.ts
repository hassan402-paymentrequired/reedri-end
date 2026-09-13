import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../decorators/skip-response-envelope.decorator';
import { SuccessResponse } from './response-envelope.types';

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();
    const message = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data) => {
        // A handler that already wrote the response itself (e.g. a binary
        // file download via @Res()) has nothing left for us to wrap.
        if (response.headersSent) {
          return data;
        }
        // void/204 responses have no body to wrap.
        if (data === undefined) {
          return data;
        }
        return {
          statusCode: response.statusCode,
          message: message ?? 'Success',
          data,
          path: request.url,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
