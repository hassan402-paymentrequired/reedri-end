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
