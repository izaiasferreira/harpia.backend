const request = require('supertest');
const app = require('../src/app');
const path = require('path');
const fs = require('fs');

const VERSIONS_FILE = path.join(__dirname, '../apk-versions.json');

describe('App Update API', () => {
  beforeEach(() => {
    const mockVersions = {
      latest: {
        versionCode: 2,
        versionName: '1.0.1',
        url: '/files/apk/app-1.0.1.apk',
        changelog: 'Correcao de bugs',
        forceUpdate: false,
        releaseDate: '2025-06-03T00:00:00.000Z'
      },
      history: [
        {
          versionCode: 1,
          versionName: '1.0.0',
          url: '/files/apk/app-1.0.0.apk',
          changelog: 'Versao inicial',
          forceUpdate: false,
          releaseDate: '2025-01-01T00:00:00.000Z'
        }
      ]
    };
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(mockVersions, null, 2));
  });

  test('GET /api/app/update/check - deve retornar hasUpdate=true quando versao desatualizada', async () => {
    const res = await request(app)
      .get('/api/app/update/check?currentVersionCode=1')
      .expect(200);

    expect(res.body.hasUpdate).toBe(true);
    expect(res.body.versionCode).toBe(2);
    expect(res.body.versionName).toBe('1.0.1');
    expect(res.body.url).toBe('/files/apk/app-1.0.1.apk');
  });

  test('GET /api/app/update/check - deve retornar hasUpdate=false quando versao atual', async () => {
    const res = await request(app)
      .get('/api/app/update/check?currentVersionCode=2')
      .expect(200);

    expect(res.body.hasUpdate).toBe(false);
  });

  test('GET /api/app/update/check - deve funcionar sem currentVersionCode', async () => {
    const res = await request(app)
      .get('/api/app/update/check')
      .expect(200);

    expect(res.body.hasUpdate).toBe(true);
  });

  test('GET /api/app/update/versions - deve retornar manifest completo', async () => {
    const res = await request(app)
      .get('/api/app/update/versions')
      .expect(200);

    expect(res.body.latest).toBeDefined();
    expect(res.body.history).toBeDefined();
    expect(res.body.latest.versionCode).toBe(2);
    expect(res.body.latest.url).toBe('/files/apk/app-1.0.1.apk');
    expect(res.body.history.length).toBe(1);
  });
});
