import { z } from 'zod';

export const SubscriptionRequestHistorySchema = z.object({
    id: z.number(),
    userId: z.number(),
    requestIp: z.nullable(z.string()),
    userAgent: z.nullable(z.string()),
    requestAt: z.iso.datetime().transform((str) => new Date(str)),
});
