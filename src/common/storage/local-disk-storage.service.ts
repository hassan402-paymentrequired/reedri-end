import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { StorageService } from './storage.service';

@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    super();
    this.baseDir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  // Defense in depth: keys are built internally from a UUID, never from raw
  // user input, but this guarantees a bug elsewhere can't escape baseDir.
  private resolveKey(key: string): string {
    const path = resolve(join(this.baseDir, key));
    if (!path.startsWith(this.baseDir)) {
      throw new InternalServerErrorException('Invalid storage key');
    }
    return path;
  }
}
