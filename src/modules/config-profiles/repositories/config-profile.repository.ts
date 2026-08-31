import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '@prisma/client';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';
import { values } from '@common/helpers/kysely/values';

import { ConfigProfileConverter } from '../converters/config-profile.converter';
import { ConfigProfileInboundWithSquadsEntity } from '../entities';
import { ConfigProfileInboundEntity } from '../entities/config-profile-inbound.entity';
import { ConfigProfileWithInboundsAndNodesEntity } from '../entities/config-profile-with-inbounds-and-nodes.entity';
import { ConfigProfileEntity } from '../entities/config-profile.entity';

const SNIPPET_USAGE_JSONPATH = `$ ? (
    @.snippets[*] == $name
    || @.outbounds[*].snippet == $name
    || @.routing.rules[*].snippet == $name
    || @.routing.balancers[*].snippet == $name
)`;

@Injectable()
export class ConfigProfileRepository {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly qb: TxKyselyService,
        private readonly configProfileConverter: ConfigProfileConverter,
    ) {}

    public async create(
        entity: ConfigProfileEntity,
        inbounds: ConfigProfileInboundEntity[],
    ): Promise<{ uuid: string }> {
        const model = this.configProfileConverter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.configProfiles.create({
            select: {
                uuid: true,
            },
            data: {
                ...model,
                config: model.config as Prisma.InputJsonValue,
                configProfileInbounds: {
                    create: inbounds.map((inbound) => ({
                        ...inbound,
                    })),
                },
            },
        });

        return {
            uuid: result.uuid,
        };
    }

    public async findByUUID(uuid: string): Promise<ConfigProfileEntity | null> {
        const result = await this.prisma.tx.configProfiles.findUnique({
            where: { uuid },
        });
        if (!result) {
            return null;
        }
        return this.configProfileConverter.fromPrismaModelToEntity(result);
    }

    public async update({
        uuid,
        ...data
    }: Partial<ConfigProfileEntity>): Promise<ConfigProfileEntity> {
        const result = await this.prisma.tx.configProfiles.update({
            where: {
                uuid,
            },
            data: {
                ...data,
                config: data.config as Prisma.InputJsonValue,
            },
        });

        return this.configProfileConverter.fromPrismaModelToEntity(result);
    }

    public async findByCriteria(
        dto: Partial<Omit<ConfigProfileEntity, 'tags'>>,
    ): Promise<ConfigProfileEntity[]> {
        const configProfileList = await this.prisma.tx.configProfiles.findMany({
            where: dto,
        });
        return this.configProfileConverter.fromPrismaModelsToEntities(configProfileList);
    }

    public async findFirstByCriteria(
        dto: Partial<Omit<ConfigProfileEntity, 'tags'>>,
    ): Promise<ConfigProfileEntity | null> {
        const result = await this.prisma.tx.configProfiles.findFirst({
            where: dto,
        });

        if (!result) {
            return null;
        }

        return this.configProfileConverter.fromPrismaModelToEntity(result);
    }

    public async deleteByUUID(uuid: string): Promise<boolean> {
        const result = await this.prisma.tx.configProfiles.delete({ where: { uuid } });
        return !!result;
    }

    public async getTotalConfigProfiles(): Promise<number> {
        return await this.prisma.tx.configProfiles.count();
    }

    public async getAllConfigProfiles(): Promise<ConfigProfileWithInboundsAndNodesEntity[]> {
        // Kysely's CamelCasePlugin recursively rewrites keys inside JSON columns.
        // Core configs must remain byte-compatible with their native JSON field names.
        const result = await this.prisma.tx.configProfiles.findMany({
            orderBy: {
                viewPosition: 'asc',
            },
            include: {
                configProfileInbounds: true,
                nodes: {
                    orderBy: {
                        viewPosition: 'asc',
                    },
                    select: {
                        uuid: true,
                        name: true,
                        countryCode: true,
                    },
                },
            },
        });

        return result.map(({ configProfileInbounds, config, ...item }) => {
            return new ConfigProfileWithInboundsAndNodesEntity({
                ...item,
                config: config as object,
                inbounds: configProfileInbounds.map(
                    (inbound) =>
                        new ConfigProfileInboundEntity({
                            ...inbound,
                            rawInbound: inbound.rawInbound as object | null,
                        }),
                ),
            });
        });
    }

    public async getUuidsBySnippetName(name: string): Promise<string[]> {
        const result = await this.qb.kysely
            .selectFrom('configProfiles')
            .select('configProfiles.uuid')
            .where(
                sql<boolean>`jsonb_path_exists(
                    ${sql.ref('config_profiles.config')},
                    ${SNIPPET_USAGE_JSONPATH}::jsonpath,
                    jsonb_build_object('name', ${name}::text)
                )`,
            )
            .orderBy('configProfiles.viewPosition', 'asc')
            .execute();

        return result.map((row) => row.uuid);
    }

    public async getConfigProfileByUUID(
        uuid: string,
    ): Promise<ConfigProfileWithInboundsAndNodesEntity | null> {
        // Keep config and rawInbound JSON untouched (sing-box uses snake_case fields).
        const result = await this.prisma.tx.configProfiles.findUnique({
            where: {
                uuid,
            },
            include: {
                configProfileInbounds: true,
                nodes: {
                    orderBy: {
                        viewPosition: 'asc',
                    },
                    select: {
                        uuid: true,
                        name: true,
                        countryCode: true,
                    },
                },
            },
        });

        if (!result) {
            return null;
        }

        const { configProfileInbounds, config, ...item } = result;

        return new ConfigProfileWithInboundsAndNodesEntity({
            ...item,
            config: config as object,
            inbounds: configProfileInbounds.map(
                (inbound) =>
                    new ConfigProfileInboundEntity({
                        ...inbound,
                        rawInbound: inbound.rawInbound as object | null,
                    }),
            ),
        });
    }

    public async createManyConfigProfileInbounds(inbounds: ConfigProfileInboundEntity[]): Promise<{
        count: number;
    }> {
        const result = await this.prisma.tx.configProfileInbounds.createMany({
            data: inbounds.map((inbound) => ({
                ...inbound,
                rawInbound: inbound.rawInbound as Prisma.InputJsonValue,
            })),
        });

        return {
            count: result.count,
        };
    }

    public async deleteManyConfigProfileInboundsByUUIDs(uuids: string[]): Promise<{
        count: number;
    }> {
        const result = await this.prisma.tx.configProfileInbounds.deleteMany({
            where: { uuid: { in: uuids } },
        });

        return {
            count: result.count,
        };
    }

    public async updateConfigProfileInbound(
        inbound: ConfigProfileInboundEntity,
    ): Promise<ConfigProfileInboundEntity> {
        const result = await this.prisma.tx.configProfileInbounds.update({
            where: { uuid: inbound.uuid },
            data: {
                ...inbound,
                rawInbound: inbound.rawInbound as Prisma.InputJsonValue,
            },
        });

        return new ConfigProfileInboundEntity(result);
    }

    public async getInboundsByProfileUuid(
        profileUuid: string,
    ): Promise<ConfigProfileInboundEntity[]> {
        const result = await this.prisma.tx.configProfileInbounds.findMany({
            where: { profileUuid },
        });

        return result.map((item) => new ConfigProfileInboundEntity(item));
    }

    public async getInboundsWithSquadsByProfileUuid(
        profileUuid: string,
    ): Promise<ConfigProfileInboundWithSquadsEntity[]> {
        const result = await this.prisma.tx.configProfileInbounds.findMany({
            where: {
                profileUuid,
            },
            include: {
                internalSquadInbounds: {
                    select: {
                        internalSquadUuid: true,
                    },
                },
            },
        });

        return result.map(({ internalSquadInbounds, ...item }) => {
            return new ConfigProfileInboundWithSquadsEntity({
                ...item,
                rawInbound: item.rawInbound as object | null,
                activeSquads: internalSquadInbounds.map(({ internalSquadUuid }) => ({
                    uuid: internalSquadUuid,
                })),
            });
        });
    }

    public async getAllInbounds(): Promise<ConfigProfileInboundWithSquadsEntity[]> {
        const result = await this.prisma.tx.configProfileInbounds.findMany({
            include: {
                internalSquadInbounds: {
                    select: {
                        internalSquadUuid: true,
                    },
                },
            },
        });

        return result.map(({ internalSquadInbounds, ...item }) => {
            return new ConfigProfileInboundWithSquadsEntity({
                ...item,
                rawInbound: item.rawInbound as object | null,
                activeSquads: internalSquadInbounds.map(({ internalSquadUuid }) => ({
                    uuid: internalSquadUuid,
                })),
            });
        });
    }

    public async reorderMany(
        dto: {
            uuid: string;
            viewPosition: number;
        }[],
    ): Promise<boolean> {
        if (dto.length === 0) return true;

        const v = values(
            dto.map(({ uuid, viewPosition }) => ({
                uuid: sql<string>`${uuid}::uuid`,
                viewPosition: sql<number>`${viewPosition}::int`,
            })),
            'v',
        );

        await this.qb.kysely
            .updateTable('configProfiles')
            .from(v)
            .set((eb) => ({ viewPosition: eb.ref('v.viewPosition') }))
            .whereRef('configProfiles.uuid', '=', 'v.uuid')
            .execute();

        await this.prisma.tx
            .$executeRaw`SELECT setval('config_profiles_view_position_seq', (SELECT MAX(view_position) FROM config_profiles) + 1)`;

        return true;
    }
    public async findAllTags(): Promise<string[]> {
        const result = await this.qb.kysely
            .selectFrom('configProfiles')
            .select(sql<string>`unnest(tags)`.as('tag'))
            .distinct()
            .where('tags', 'is not', null)
            .orderBy('tag')
            .execute();

        return result.map((value) => value.tag);
    }

    public async setTags(uuid: string, tags: string[]): Promise<string[]> {
        const result = await this.prisma.tx.configProfiles.update({
            where: { uuid },
            data: { tags },
            select: { tags: true },
        });

        return result.tags;
    }
}
