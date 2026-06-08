const z = require('zod');

const loginSchema = z.object({
  id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).transform(v => v.toLowerCase()),
  telegram_id: z.string().nullable().optional()
});

const loginCreateSchema = loginSchema;
const loginUpdateSchema = loginSchema.partial();

module.exports = {
  loginSchema,
  loginCreateSchema,
  loginUpdateSchema
};
