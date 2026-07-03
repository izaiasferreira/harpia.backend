const { VALID_STATE_VALUES, VALID_STATE_VALUES_ALL } = require('../../constants/states');
const z = require('zod');

const loginSchema = z.object({
  id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  estado: z.enum(VALID_STATE_VALUES_ALL).transform(v => v.toLowerCase()),
  telegram_id: z.string().nullable().optional()
});

const loginCreateSchema = loginSchema;
const loginUpdateSchema = loginSchema.partial();

module.exports = {
  loginSchema,
  loginCreateSchema,
  loginUpdateSchema
};
