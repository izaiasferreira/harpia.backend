const { normalizeAgentId, normalizeAgentName, normalizeTextUpper } = require('../src/utils/agentNormalize');
const { agentCreateSchema, agentUpdateSchema } = require('../src/db/schemas/users');

describe('agentNormalize & validation rules', () => {
    describe('normalizeAgentId', () => {
        test('removes accents, spaces, and special characters, converting to uppercase', () => {
            expect(normalizeAgentId(' Mátriculä-123! ')).toBe('MATRICULA123');
            expect(normalizeAgentId('H5-1406272.')).toBe('H51406272');
            expect(normalizeAgentId('A/482.66381')).toBe('A48266381');
        });

        test('returns empty string for null/undefined', () => {
            expect(normalizeAgentId(null)).toBe('');
            expect(normalizeAgentId(undefined)).toBe('');
        });
    });

    describe('normalizeAgentName', () => {
        test('converts to uppercase and trims extra spaces', () => {
            expect(normalizeAgentName('  joão  da   silva  ')).toBe('JOÃO DA SILVA');
        });
    });

    describe('normalizeTextUpper', () => {
        test('converts text to uppercase', () => {
            expect(normalizeTextUpper('  carlos  gestor ')).toBe('CARLOS GESTOR');
            expect(normalizeTextUpper('metropolitana')).toBe('METROPOLITANA');
            expect(normalizeTextUpper('polo norte')).toBe('POLO NORTE');
            expect(normalizeTextUpper('leitura')).toBe('LEITURA');
        });

        test('preserves null or undefined', () => {
            expect(normalizeTextUpper(null)).toBeNull();
            expect(normalizeTextUpper(undefined)).toBeUndefined();
        });
    });

    describe('Zod Agent Schemas Validation & Transformations', () => {
        test('agentCreateSchema strips accents/spaces/special chars from id and matricula, and uppercases text fields', () => {
            const rawInput = {
                id: ' T-123.45á ',
                matricula: ' MAT-001.ç ',
                nome: ' joão da silva ',
                estado: 'pi',
                gestor: ' carlos gestor ',
                regional: ' metropolitana ',
                seccional: ' polo norte ',
                processo: ' leitura '
            };

            const parsed = agentCreateSchema.parse(rawInput);
            expect(parsed.id).toBe('T12345A');
            expect(parsed.matricula).toBe('MAT001C');
            expect(parsed.nome).toBe('JOÃO DA SILVA');
            expect(parsed.gestor).toBe('CARLOS GESTOR');
            expect(parsed.regional).toBe('METROPOLITANA');
            expect(parsed.seccional).toBe('POLO NORTE');
            expect(parsed.processo).toBe('LEITURA');
        });

        test('agentCreateSchema rejects empty id or matricula after sanitization', () => {
            expect(() => agentCreateSchema.parse({
                id: '---',
                matricula: '123',
                nome: 'NOME',
                estado: 'pi'
            })).toThrow();

            expect(() => agentCreateSchema.parse({
                id: '123',
                matricula: '!!!',
                nome: 'NOME',
                estado: 'pi'
            })).toThrow();
        });

        test('agentUpdateSchema transforms fields to uppercase and strips accents/special chars from matricula', () => {
            const rawUpdate = {
                matricula: ' mat-999.á ',
                gestor: ' maria gestor ',
                regional: ' norte ',
                seccional: ' centro ',
                processo: ' cobrança '
            };

            const parsed = agentUpdateSchema.parse(rawUpdate);
            expect(parsed.matricula).toBe('MAT999A');
            expect(parsed.gestor).toBe('MARIA GESTOR');
            expect(parsed.regional).toBe('NORTE');
            expect(parsed.seccional).toBe('CENTRO');
            expect(parsed.processo).toBe('COBRANÇA');
        });
    });
});
