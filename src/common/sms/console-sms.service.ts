import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

// Placeholder implementation: logs instead of dispatching a real SMS. Fine
// for local dev/testing; replace the DI binding in sms.module.ts with a real
// provider (Twilio, Termii, Africa's Talking, ...) before this ever needs to
// reach an actual phone.
@Injectable()
export class ConsoleSmsService extends SmsService {
  private readonly logger = new Logger(ConsoleSmsService.name);

  send(phone: string, message: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${message}`);
    return Promise.resolve();
  }
}
