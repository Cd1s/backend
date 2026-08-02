import { PrismaClient } from '@prisma/client';
import consola from 'consola';

import {
    SUBSCRIPTION_TEMPLATE_TYPE,
    SUBSCRIPTION_TEMPLATE_TYPE_VALUES,
} from '@libs/contracts/constants';

import {
    DEFAULT_TEMPLATE_CLASH,
    DEFAULT_TEMPLATE_MIHOMO,
    DEFAULT_TEMPLATE_SINGBOX,
    DEFAULT_TEMPLATE_STASH,
    DEFAULT_TEMPLATE_XRAY_JSON,
} from '@modules/subscription-template/constants';

function isLegacySingBoxTemplate(templateJson: unknown): boolean {
    if (!templateJson || typeof templateJson !== 'object') return false;

    const template = templateJson as {
        dns?: { fakeip?: unknown; independent_cache?: unknown; servers?: unknown };
        inbounds?: unknown;
    };
    const dnsServers = Array.isArray(template.dns?.servers) ? template.dns.servers : [];
    const inbounds = Array.isArray(template.inbounds) ? template.inbounds : [];
    const hasLegacyDnsServer = dnsServers.some(
        (server) =>
            server &&
            typeof server === 'object' &&
            ('address' in server || 'address_strategy' in server),
    );
    const hasLegacyInbound = inbounds.some(
        (inbound) =>
            inbound &&
            typeof inbound === 'object' &&
            ('sniff' in inbound || 'inet4_address' in inbound || 'inet6_address' in inbound),
    );

    return (
        hasLegacyDnsServer ||
        hasLegacyInbound ||
        template.dns?.fakeip !== undefined ||
        template.dns?.independent_cache !== undefined
    );
}

export async function seedSubscriptionTemplate(prisma: PrismaClient) {
    consola.start('Seeding subscription templates...');

    const deletedTemplates = await prisma.subscriptionTemplate.deleteMany({
        where: {
            templateType: {
                notIn: [...SUBSCRIPTION_TEMPLATE_TYPE_VALUES],
            },
        },
    });

    consola.success(`Deleted unknown templates: ${deletedTemplates.count}`);

    for (const templateType of SUBSCRIPTION_TEMPLATE_TYPE_VALUES) {
        const existingConfig = await prisma.subscriptionTemplate.findUnique({
            where: {
                templateType_name: {
                    templateType,
                    name: 'Default',
                },
            },
        });

        switch (templateType) {
            case SUBSCRIPTION_TEMPLATE_TYPE.STASH:
                if (existingConfig) {
                    consola.info(`Default ${templateType} config already exists`);
                    continue;
                }

                await prisma.subscriptionTemplate.create({
                    data: { templateType, name: 'Default', templateYaml: DEFAULT_TEMPLATE_STASH },
                });

                break;
            case SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO:
                if (existingConfig) {
                    consola.info(`Default ${templateType} config already exists`);
                    continue;
                }

                await prisma.subscriptionTemplate.create({
                    data: { templateType, name: 'Default', templateYaml: DEFAULT_TEMPLATE_MIHOMO },
                });
                break;
            case SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX:
                if (existingConfig) {
                    if (isLegacySingBoxTemplate(existingConfig.templateJson)) {
                        await prisma.subscriptionTemplate.update({
                            where: { uuid: existingConfig.uuid },
                            data: { templateJson: DEFAULT_TEMPLATE_SINGBOX },
                        });
                        consola.success(`Updated legacy default ${templateType} config`);
                        break;
                    }

                    consola.info(`Default ${templateType} config already exists`);
                    continue;
                }

                await prisma.subscriptionTemplate.create({
                    data: { templateType, name: 'Default', templateJson: DEFAULT_TEMPLATE_SINGBOX },
                });
                break;
            case SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON:
                if (existingConfig) {
                    consola.info(`Default ${templateType} config already exists`);
                    continue;
                }

                await prisma.subscriptionTemplate.create({
                    data: {
                        templateType,
                        name: 'Default',
                        templateJson: DEFAULT_TEMPLATE_XRAY_JSON,
                    },
                });

                break;
            case SUBSCRIPTION_TEMPLATE_TYPE.CLASH:
                if (existingConfig) {
                    consola.info(`Default ${templateType} config already exists`);
                    continue;
                }

                await prisma.subscriptionTemplate.create({
                    data: { templateType, name: 'Default', templateYaml: DEFAULT_TEMPLATE_CLASH },
                });

                break;
            case SUBSCRIPTION_TEMPLATE_TYPE.XRAY_BASE64:
                break;
            default:
                consola.error(`Unknown template type: ${templateType}`);
                process.exit(1);
        }
    }
}
