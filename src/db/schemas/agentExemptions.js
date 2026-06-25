const { z } = require('zod');

const agentExemptionCreateSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
  reason: z.string().optional()
}).refine(data => {
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: 'Data final deve ser maior ou igual à data inicial',
  path: ['end_date']
});

module.exports = {
  agentExemptionCreateSchema
};
