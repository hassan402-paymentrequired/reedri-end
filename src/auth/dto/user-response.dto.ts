import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { Role } from '@prisma/client';

@Exclude()
export class UserResponseDto {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() phone!: string;
  @Expose() role!: Role;
  @Expose() rating!: number;
  @Expose() createdAt!: Date;

  static from(entity: {
    id: string;
    name: string;
    phone: string;
    role: Role;
    rating: number;
    createdAt: Date;
  }): UserResponseDto {
    return plainToInstance(UserResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
