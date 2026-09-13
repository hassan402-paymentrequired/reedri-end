/**
 * SMS abstraction so the rest of the app deals in "send this message to this
 * phone number", never a specific provider's SDK. Swapping the console-log
 * implementation for Twilio/Termii/Africa's Talking/etc. later means writing
 * one new class and changing the DI binding in sms.module.ts — nothing else
 * in the codebase needs to change.
 */
export abstract class SmsService {
  abstract send(phone: string, message: string): Promise<void>;
}
