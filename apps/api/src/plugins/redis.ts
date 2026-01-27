import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: InstanceType<typeof Redis>;
    queues: {
      catalogSync: Queue;
      streamDetection: Queue;
      reservationExpiry: Queue;
      eventProcessor: Queue;
    };
  }
}

async function redisPluginCallback(fastify: FastifyInstance) {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Parse Redis URL for BullMQ connection
  const redisUrl = new URL(env.REDIS_URL);
  const connection: { host: string; port: number; password?: string; username?: string } = { 
    host: redisUrl.hostname || 'localhost', 
    port: parseInt(redisUrl.port || '6379', 10),
  };
  if (redisUrl.password) connection.password = redisUrl.password;
  if (redisUrl.username) connection.username = redisUrl.username;
  
  const queues = {
    catalogSync: new Queue('catalog-sync', { connection }),
    streamDetection: new Queue('stream-detection', { connection }),
    reservationExpiry: new Queue('reservation-expiry', { connection }),
    eventProcessor: new Queue('event-processor', { connection }),
  };

  fastify.decorate('redis', redis);
  fastify.decorate('queues', queues);

  fastify.addHook('onClose', async () => {
    await Promise.all([
      redis.quit(),
      ...Object.values(queues).map(q => q.close()),
    ]);
  });

  fastify.log.info('Redis connected');
}

export const redisPlugin = fp(redisPluginCallback, {
  name: 'redis',
});
