const z = require('zod');

const FENCE_TYPES = ['speed', 'min_speed', 'enter', 'exit'];
const FENCE_STATES = ['pi', 'ma'];

const geoPointSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

const geometrySchema = z.array(geoPointSchema).min(3).max(10000);

const geofenceFields = {
    name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
    type: z.enum(FENCE_TYPES, { errorMap: () => ({ message: `Tipo inválido. Use: ${FENCE_TYPES.join(', ')}` }) }),
    estado: z.enum(FENCE_STATES, { errorMap: () => ({ message: `Estado inválido. Use: ${FENCE_STATES.join(', ')}` }) }),
    geometry: geometrySchema,
    speed_limit: z.number().int().min(1).max(300).nullable().optional(),
    is_active: z.boolean().optional(),
};

const validateSpeedLimit = (val, ctx) => {
    if (val.type === 'speed' && val.speed_limit == null) {
        ctx.addIssue({
            code: 'custom',
            path: ['speed_limit'],
            message: 'speed_limit é obrigatório para o tipo "speed"',
        });
    }
};

const geofenceCreateSchema = z.object(geofenceFields).superRefine(validateSpeedLimit);

const geofenceUpdateSchema = z.object({
    name: geofenceFields.name.optional(),
    type: geofenceFields.type.optional(),
    estado: geofenceFields.estado.optional(),
    geometry: geofenceFields.geometry.optional(),
    speed_limit: geofenceFields.speed_limit,
    is_active: geofenceFields.is_active,
}).superRefine(validateSpeedLimit);

module.exports = {
    geofenceCreateSchema,
    geofenceUpdateSchema,
    geoPointSchema,
    geometrySchema,
    FENCE_TYPES,
    FENCE_STATES,
};
