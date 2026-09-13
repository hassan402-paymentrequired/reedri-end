import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();
  });

  it('/health (GET) reports database and redis as up', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string };
        expect(body.status).toBe('ok');
      });
  });

  it('/auth/register (POST) wraps the created token pair in the success envelope', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Ada Lovelace',
        phone: `+2348000${Date.now().toString().slice(-6)}`,
        password: 'correct-horse-battery-staple',
        role: 'RIDER',
      })
      .expect(201)
      .expect((res) => {
        const body = res.body as {
          statusCode: number;
          message: string;
          data: { accessToken: string; refreshToken: string };
          path: string;
          timestamp: string;
        };
        expect(body.statusCode).toBe(201);
        expect(body.message).toBe('Success');
        expect(typeof body.data.accessToken).toBe('string');
        expect(typeof body.data.refreshToken).toBe('string');
        expect(body.path).toBe('/api/v1/auth/register');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  it('rejects an unauthenticated ride request creation', () => {
    return request(app.getHttpServer())
      .post('/api/v1/ride-requests')
      .send({
        pickupLat: 6.5,
        pickupLng: 3.3,
        dropoffLat: 6.6,
        dropoffLng: 3.4,
        suggestedFare: 1000,
      })
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
