import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  RIDE_MATCH_RADIUS_KM: Joi.number().positive().default(5),
  OFFER_EXPIRY_SECONDS: Joi.number().positive().default(60),
  // Comma-separated list of allowed origins. Unset -> '*' (fine for local
  // dev; set explicitly before this is reachable from anywhere but localhost).
  CORS_ORIGIN: Joi.string().optional(),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: Joi.number().positive().default(10),
});
