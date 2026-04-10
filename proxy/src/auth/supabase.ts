import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return anonClient;
}

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }
  return serviceClient;
}

export interface VerifiedUser {
  supabaseUid: string;
  email: string;
}

/**
 * Verify a Supabase access token using HMAC-SHA256 against the JWT secret.
 * Falls back to a Supabase API call if the secret is not configured.
 */
export async function verifySupabaseToken(token: string): Promise<VerifiedUser | null> {
  if (config.supabase.jwtSecret) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = parts[0];
      const payload = parts[1];
      const signature = parts[2];

      const expected = createHmac('sha256', config.supabase.jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (expected !== signature) return null;

      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf-8'),
      ) as { sub?: string; email?: string; exp?: number };

      if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;

      if (!decoded.sub || !decoded.email) return null;

      return { supabaseUid: decoded.sub, email: decoded.email };
    } catch (err) {
      logger.warn({ err }, 'JWT local verification failed, falling back to API');
    }
  }

  const { data, error } = await getAnonClient().auth.getUser(token);
  if (error || !data.user) return null;
  return {
    supabaseUid: data.user.id,
    email: data.user.email ?? '',
  };
}
