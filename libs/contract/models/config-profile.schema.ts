import { z } from 'zod';

import { CONFIG_PROFILE_CORE_TYPE } from '../constants';
import { ConfigProfileInboundsSchema } from './config-profile-inbounds.schema';

export const ConfigProfileSchema = z.object({
    uuid: z.string().uuid(),
    viewPosition: z.number().int(),
    name: z.string(),
    coreType: z.enum([CONFIG_PROFILE_CORE_TYPE.XRAY, CONFIG_PROFILE_CORE_TYPE.SINGBOX]),
    config: z.unknown(),
    inbounds: z.array(ConfigProfileInboundsSchema),
    nodes: z.array(
        z.object({
            uuid: z.string().uuid(),
            name: z.string(),
            countryCode: z.string(),
        }),
    ),

    createdAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
    updatedAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
});
