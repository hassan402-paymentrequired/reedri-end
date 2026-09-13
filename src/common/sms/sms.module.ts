import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { ConsoleSmsService } from './console-sms.service';

@Global()
@Module({
  providers: [{ provide: SmsService, useClass: ConsoleSmsService }],
  exports: [SmsService],
})
export class SmsModule {}
