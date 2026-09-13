import { Exclude, Expose, plainToInstance } from 'class-transformer';

@Exclude()
export class TokenPairResponseDto {
  @Expose() accessToken!: string;
  @Expose() refreshToken!: string;

  static from(entity: {
    accessToken: string;
    refreshToken: string;
  }): TokenPairResponseDto {
    return plainToInstance(TokenPairResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
