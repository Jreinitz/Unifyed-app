import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { orders } from '@unifyed/db/schema';
import { 
  listOrdersQuerySchema,
  getOrderParamsSchema,
  type ListOrdersResponse,
  type GetOrderResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';

export async function ordersRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /orders - List orders
  fastify.get('/', async (request, reply) => {
    const query = listOrdersQuerySchema.parse(request.query);
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(orders.creatorId, request.creator.id)];
    if (status) {
      conditions.push(eq(orders.status, status));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(orders)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const orderList = await fastify.db
      .select()
      .from(orders)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(orders.createdAt);

    const response: ListOrdersResponse = {
      orders: orderList.map(o => ({
        ...o,
        lineItems: o.lineItems as Array<{
          variantId: string;
          externalVariantId: string;
          title: string;
          quantity: number;
          price: number;
        }> | null,
      })),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };

    return reply.send(response);
  });

  // GET /orders/:id - Get single order
  fastify.get('/:id', async (request, reply) => {
    const { id } = getOrderParamsSchema.parse(request.params);

    const [order] = await fastify.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.creatorId, request.creator.id)))
      .limit(1);

    if (!order) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
    }

    const response: GetOrderResponse = {
      order: {
        ...order,
        lineItems: order.lineItems as Array<{
          variantId: string;
          externalVariantId: string;
          title: string;
          quantity: number;
          price: number;
        }> | null,
      },
    };

    return reply.send(response);
  });
}
