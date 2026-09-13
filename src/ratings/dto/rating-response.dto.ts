import { Exclude, Expose, plainToInstance } from 'class-transformer';

@Exclude()
export class RatingResponseDto {
  @Expose() id!: string;
  @Expose() tripId!: string;
  @Expose() fromUserId!: string;
  @Expose() toUserId!: string;
  @Expose() score!: number;
  @Expose() comment!: string | null;
  @Expose() createdAt!: Date;

  static from(entity: {
    id: string;
    tripId: string;
    fromUserId: string;
    toUserId: string;
    score: number;
    comment: string | null;
    createdAt: Date;
  }): RatingResponseDto {
    return plainToInstance(RatingResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
