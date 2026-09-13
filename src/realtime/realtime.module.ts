import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { RealtimeGateway } from './realtime.gateway';
import { DriversModule } from '../drivers/drivers.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [
    DriversModule,
    OffersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_ACCESS_EXPIRES_IN',
            '15m',
          ) as StringValue,
        },
      }),
    }),
  ],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
