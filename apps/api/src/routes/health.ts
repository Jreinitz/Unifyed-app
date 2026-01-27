import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { type HealthResponse } from '@unifyed/types/api';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';

    // Check database
    try {
      await fastify.db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch (err) {
      request.log.error(err, 'Database health check failed');
    }

    // Check Redis
    try {
      await fastify.redis.ping();
      redisStatus = 'connected';
    } catch (err) {
      request.log.error(err, 'Redis health check failed');
    }

    const response: HealthResponse = {
      status: dbStatus === 'connected' && redisStatus === 'connected' ? 'ok' : 'degraded',
      version: process.env['npm_package_version'] ?? '0.0.1',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };

    return reply.send(response);
  });
}
