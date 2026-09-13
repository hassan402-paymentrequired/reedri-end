/**
 * Storage abstraction so the rest of the app deals in opaque keys, never
 * filesystem paths or bucket URLs directly. Swapping the local-disk
 * implementation for S3 (or anything else) later means writing one new
 * class and changing the DI binding in storage.module.ts — nothing else
 * in the codebase needs to change.
 */
export abstract class StorageService {
  abstract save(key: string, buffer: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}
