const { normalizePoint } = require('../src/workers/trackingSyncWorker');

describe('normalizePoint resiliente (worker de staging)', () => {
    it('aceita ponto válido e retorna ponto normalizado', () => {
        const pt = normalizePoint('T12345', {
            lat: -3.73,
            lng: -38.52,
            speed: 10,
            accuracy: 15,
            batteryLevel: 80,
            isCharging: false,
            networkType: 'WIFI',
            gpsEnabled: true,
            deviceModel: 'A',
            devicePlatform: 'Android',
            osVersion: '13',
            timestamp: Date.now(),
        }, 81);

        expect(pt).not.toBeNull();
        expect(pt.lat).toBe(-3.73);
        expect(pt.lng).toBe(-38.52);
        expect(pt.speedLimitApplied).toBe(81);
    });

    it('aceita lat/lng/timestamp como string numérica (coercion)', () => {
        const pt = normalizePoint('T12345', {
            lat: '-3.73',
            lng: '-38.52',
            timestamp: String(Date.now()),
        }, 81);

        expect(pt).not.toBeNull();
        expect(pt.lat).toBe(-3.73);
        expect(pt.lng).toBe(-38.52);
    });

    it('NÃO lança e retorna null para payload sem lat/lng', () => {
        expect(() => normalizePoint('T12345', { timestamp: Date.now() }, 81)).not.toThrow();
        expect(normalizePoint('T12345', { timestamp: Date.now() }, 81)).toBeNull();
    });

    it('retorna null para payload legado com latitude/longitude', () => {
        const pt = normalizePoint('T12345', { latitude: 1, longitude: 2, timestamp: Date.now() }, 81);
        expect(pt).toBeNull();
    });

    it('retorna null para timestamp em formato ISO (sem NaN silencioso)', () => {
        const pt = normalizePoint('T12345', { lat: 1, lng: 2, timestamp: '2026-08-10T02:00:00.000Z' }, 81);
        expect(pt).toBeNull();
    });

    it('retorna null para lat como string não numérica', () => {
        const pt = normalizePoint('T12345', { lat: 'abc', lng: 2, timestamp: Date.now() }, 81);
        expect(pt).toBeNull();
    });
});
