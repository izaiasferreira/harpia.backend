const z = require('zod');

const badgeSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  image_url: z.string().max(500).nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const profileSchema = z.object({
  id: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  profilePicUrl: z.string().max(255).nullable().optional(),
  badges: z.union([z.string(), z.array(z.number())]).default('[]')
});

const badgeCreateSchema = badgeSchema;
const profileCreateSchema = profileSchema;

module.exports = {
  badgeSchema,
  badgeCreateSchema,
  profileSchema,
  profileCreateSchema
};
