const z = require('zod');

const appAlertCreateSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(255),
  content_type: z.enum(['html', 'image']),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  link_url: z.string().nullable().optional().transform(v => v?.trim() || null).refine(v => {
    if (!v) return true;
    if (v.startsWith('/')) return true;
    try { new URL(v); return true; } catch { return false; }
  }, 'URL inválida'),
  is_active: z.boolean().default(true),
  filters: z.object({
    estado: z.array(z.string()).default([]),
    regional: z.array(z.string()).default([]),
    seccional: z.array(z.string()).default([]),
    cargo: z.array(z.string()).default([]),
    processo: z.array(z.string()).default([]),
  }).default({}),
  frequency: z.enum(['once', 'daily', 'weekly']).or(
    z.string().regex(/^weekday:[1-7](,[1-7])*$/, 'Formato de dia inválido. Use weekday:1,3,5')
  ).default('once'),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
});

const appAlertUpdateSchema = appAlertCreateSchema.partial();

module.exports = { appAlertCreateSchema, appAlertUpdateSchema };
