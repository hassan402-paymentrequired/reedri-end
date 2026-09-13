import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import type Redis from 'ioredis';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { StorageModule } from './common/storage/storage.module';
import { SmsModule } from './common/sms/sms.module';
import { CacheModule } from './common/cache/cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { RideRequestsModule } from './ride-requests/ride-requests.module';
import { OffersModule } from './offers/offers.module';
import { TripsModule } from './trips/trips.module';
import { MatchingModule } from './matching/matching.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AdminModule } from './admin/admin.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty' },
        // Never let a JWT, password, or refresh token end up in log output.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.newPassword',
            'req.body.refreshToken',
            'req.body.code',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
        autoLogging: { ignore: (req) => req.url === '/health' },
      },
    }),
    RedisModule,
    StorageModule,
    SmsModule,
    CacheModule,
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DriversModule,
    RideRequestsModule,
    OffersModule,
    TripsModule,
    MatchingModule,
    RealtimeModule,
    MaintenanceModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
