const z = require('zod');

const dailyReportSchema = z.object({
  id: z.number().int().optional(),
  autor: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  nota: z.number().int().min(1).max(5).refine(val => val >= 1 && val <= 5, {
    message: "Nota deve ser entre 1 e 5"
  }),
  motivo: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  foto: z.string().nullable().optional(),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  data_report: z.string().or(z.date()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const dailyReportCreateSchema = dailyReportSchema;

module.exports = {
  dailyReportSchema,
  dailyReportCreateSchema
};
