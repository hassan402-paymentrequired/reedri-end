import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { ActiveProfile } from '@prisma/client';

@Exclude()
export class ActiveProfileResponseDto {
  @Expose() id!: string;
  @Expose() activeProfile!: ActiveProfile;

  static from(entity: {
    id: string;
    activeProfile: ActiveProfile;
  }): ActiveProfileResponseDto {
    return plainToInstance(ActiveProfileResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
