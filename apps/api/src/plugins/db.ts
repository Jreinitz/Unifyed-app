import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createDatabase, type Database } from '@unifyed/db';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

async function dbPluginCallback(fastify: FastifyInstance) {
  const db = createDatabase(env.DATABASE_URL);
  
  fastify.decorate('db', db);
  
  fastify.addHook('onClose', async () => {
    // Connection cleanup handled by postgres.js
  });
  
  fastify.log.info('Database connected');
}

export const dbPlugin = fp(dbPluginCallback, {
  name: 'db',
});
