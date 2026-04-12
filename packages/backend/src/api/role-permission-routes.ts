// ---------------------------------------------------------------------------
// Role permission routes — admin only
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { USER_ROLES, DEFAULT_ROLE_PERMISSIONS, ROLE_PERMISSIONS, Permission, type UserRole } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate, requireRole } from './auth.js';

const ALL_PERMISSIONS = Object.values(Permission);

/** Load role permission overrides from DB into the shared ROLE_PERMISSIONS map */
export async function loadRolePermissions(): Promise<void> {
  // Reset to defaults
  for (const role of USER_ROLES) {
    ROLE_PERMISSIONS[role] = [...DEFAULT_ROLE_PERMISSIONS[role]];
  }

  const { rows } = await query<{ role: string; permissions: string[] }>(
    'SELECT role, permissions FROM role_permissions',
  );

  for (const row of rows) {
    const role = row.role as UserRole;
    if (USER_ROLES.includes(role) && role !== 'admin') {
      // Only store valid permissions
      ROLE_PERMISSIONS[role] = row.permissions.filter((p) =>
        ALL_PERMISSIONS.includes(p as Permission),
      ) as Permission[];
    }
  }

  logger.info('Role permissions loaded from DB');
}

export function registerRolePermissionRoutes(app: FastifyInstance): void {
  const adminOnly = [authenticate, requireRole('admin')];

  // GET /api/role-permissions — returns current permissions per role (any authenticated user)
  app.get('/api/role-permissions', { preHandler: [authenticate] }, async () => {
    return {
      roles: Object.fromEntries(
        USER_ROLES.map((role) => [role, ROLE_PERMISSIONS[role]]),
      ),
      allPermissions: ALL_PERMISSIONS,
    };
  });

  // PUT /api/role-permissions/:role — update permissions for a single role
  app.put<{ Params: { role: string }; Body: { permissions: string[] } }>(
    '/api/role-permissions/:role',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { role } = req.params;
      const { permissions } = req.body;

      if (!USER_ROLES.includes(role as UserRole)) {
        return reply.code(400).send({ error: 'Invalid role' });
      }

      if (role === 'admin') {
        return reply.code(400).send({ error: 'Admin permissions cannot be changed' });
      }

      if (!Array.isArray(permissions)) {
        return reply.code(400).send({ error: 'permissions must be an array' });
      }

      // Validate all permission values
      const valid = permissions.filter((p) => ALL_PERMISSIONS.includes(p as Permission)) as Permission[];

      await query(
        `INSERT INTO role_permissions (role, permissions, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (role) DO UPDATE SET permissions = $2, updated_at = NOW()`,
        [role, valid],
      );

      // Update in-memory map
      ROLE_PERMISSIONS[role as UserRole] = valid;

      logger.info({ role, permissions: valid }, 'Role permissions updated');
      return { role, permissions: valid };
    },
  );
}
