const { VALID_STATE_VALUES, VALID_STATE_VALUES_ALL } = require('../../constants/states');
const z = require('zod');

const permissionSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  modules: z.array(z.string()).default([]),
  filters: z.union([z.string(), z.array(z.any())]).nullable().optional(),
  user_count: z.number().int().default(0),
  state: z.enum(VALID_STATE_VALUES_ALL).default('pi').transform(v => v.toLowerCase()),
  ativo: z.boolean().default(true),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const userPermissionSchema = z.object({
  id: z.number().int().optional(),
  user_id: z.number().int(),
  permission_id: z.number().int(),
  state: z.enum(VALID_STATE_VALUES_ALL).default('pi').transform(v => v.toLowerCase()),
  created_at: z.date().optional()
});

const permissionCreateSchema = permissionSchema;
const userPermissionCreateSchema = userPermissionSchema;

module.exports = {
  permissionSchema,
  permissionCreateSchema,
  userPermissionSchema,
  userPermissionCreateSchema
};
