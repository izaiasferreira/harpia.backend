const z = require('zod');

const etapaSchema = z.object({
  etapa: z.string().min(1).max(50),
  data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase())
});

const feriadoSchema = z.object({
  id: z.number().int().optional(),
  date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  created_at: z.date().optional()
});

const etapaCreateSchema = etapaSchema;
const feriadoCreateSchema = feriadoSchema;

module.exports = {
  etapaSchema,
  etapaCreateSchema,
  feriadoSchema,
  feriadoCreateSchema
};
