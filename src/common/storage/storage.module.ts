import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalDiskStorageService } from './local-disk-storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
