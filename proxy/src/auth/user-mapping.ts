import type { TunnelUser } from '@home-automation/shared';
import { getServiceClient, type VerifiedUser } from './supabase.js';
import { logger } from '../logger.js';

interface RemoteUserRow {
  id: string;
  supabase_uid: string;
  home_role: 'admin' | 'member' | 'guest';
  allowed_areas: string[] | null;
  display_name: string;
}

/**
 * Look up a Supabase-authenticated user in the remote_users table
 * and return the TunnelUser identity used for forwarding requests
 * to the home instance.
 */
export async function mapToTunnelUser(verified: VerifiedUser): Promise<TunnelUser | null> {
  const { data, error } = await getServiceClient()
    .from('remote_users')
    .select('id, supabase_uid, home_role, allowed_areas, display_name')
    .eq('supabase_uid', verified.supabaseUid)
    .single();

  if (error || !data) {
    logger.warn({ uid: verified.supabaseUid, error }, 'No remote_users mapping found');
    return null;
  }

  const row = data as RemoteUserRow;
  return {
    id: row.id,
    email: verified.email,
    display_name: row.display_name,
    role: row.home_role,
    allowed_areas: row.allowed_areas,
  };
}
