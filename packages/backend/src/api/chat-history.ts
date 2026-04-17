import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

interface ChatHistoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/**
 * Load chat history for the authenticated user (last 24 hours)
 */
export async function loadChatHistory(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: number } | undefined)?.id;
    if (!userId) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    const result = await query<ChatHistoryMessage>(
      `SELECT id, role, content, created_at
       FROM chat_history
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC`,
      [userId],
    );

    return { messages: result.rows };
  } catch (err) {
    logger.error({ err }, 'Failed to load chat history');
    return reply.code(500).send({ error: 'Failed to load chat history' });
  }
}

/**
 * Save a single message to chat history
 */
export async function saveChatMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO chat_history (user_id, role, content)
       VALUES ($1, $2, $3)`,
      [userId, role, content],
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to save chat message');
    // Don't throw — chat should continue even if history save fails
  }
}

/**
 * Clean up old messages (older than 24 hours).
 * Call periodically via cron or on startup.
 */
export async function cleanupOldMessages(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM chat_history
       WHERE created_at < NOW() - INTERVAL '24 hours'`,
    );
    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      logger.info({ deleted }, 'Cleaned up old chat history');
    }
    return deleted;
  } catch (err) {
    logger.error({ err }, 'Failed to cleanup old chat messages');
    return 0;
  }
}
