const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Ensure env vars are loaded/set for test
if (!process.env.ADMIN_TOKEN) {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.KITCHEN_TOKEN = 'test-kitchen-token';
}

const { app, server } = require('../index');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // server is not listening when imported by jest because we wrapped startServer in require.main === module
});

describe('API Endpoints', () => {
  it('GET /health should return status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  describe('Menu APIs', () => {
    it('GET /api/menu should require admin token', async () => {
      const res = await request(app).get('/api/menu');
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/menu should return menu array when authorized', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('menu');
      expect(res.body).toHaveProperty('categories');
      expect(Array.isArray(res.body.menu)).toBeTruthy();
    });
  });

  describe('Tables APIs', () => {
    it('GET /api/tables should require admin token', async () => {
      const res = await request(app).get('/api/tables');
      expect(res.statusCode).toEqual(401);
    });

    it('GET /api/tables should return tables list when authorized', async () => {
      const res = await request(app)
        .get('/api/tables')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`);
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('id');
        expect(res.body[0]).toHaveProperty('number');
      }
    });
  });
});
