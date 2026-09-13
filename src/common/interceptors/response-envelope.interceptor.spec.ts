import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function mockContext(
  response: { statusCode: number; headersSent: boolean },
  request: { url: string } = { url: '/api/v1/things' },
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function handlerReturning(data: unknown): CallHandler {
  return { handle: () => of(data) };
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps a value in the success envelope', async () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const ctx = mockContext({ statusCode: 200, headersSent: false });

    const result = await new Promise((resolve) => {
      interceptor
        .intercept(ctx, handlerReturning({ id: '1' }))
        .subscribe(resolve);
    });

    expect(result).toEqual({
      statusCode: 200,
      message: 'Success',
      data: { id: '1' },
      path: '/api/v1/things',
      timestamp: expect.any(String),
    });
  });

  it('honors a @ResponseMessage override', async () => {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === 'responseMessage' ? 'Driver verified' : undefined,
    } as unknown as Reflector;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const ctx = mockContext({ statusCode: 200, headersSent: false });

    const result = await new Promise((resolve) => {
      interceptor.intercept(ctx, handlerReturning({})).subscribe(resolve);
    });

    expect((result as { message: string }).message).toBe('Driver verified');
  });

  it('skips wrapping when @SkipResponseEnvelope is set', async () => {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === 'skipResponseEnvelope' ? true : undefined,
    } as unknown as Reflector;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const ctx = mockContext({ statusCode: 200, headersSent: false });

    const result = await new Promise((resolve) => {
      interceptor
        .intercept(ctx, handlerReturning({ status: 'ok' }))
        .subscribe(resolve);
    });

    expect(result).toEqual({ status: 'ok' });
  });

  it('skips wrapping when the response headers were already sent', async () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const ctx = mockContext({ statusCode: 200, headersSent: true });

    const result = await new Promise((resolve) => {
      interceptor
        .intercept(ctx, handlerReturning(undefined))
        .subscribe(resolve);
    });

    expect(result).toBeUndefined();
  });

  it('passes through undefined (void/204) responses unwrapped', async () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const ctx = mockContext({ statusCode: 204, headersSent: false });

    const result = await new Promise((resolve) => {
      interceptor
        .intercept(ctx, handlerReturning(undefined))
        .subscribe(resolve);
    });

    expect(result).toBeUndefined();
  });
});
