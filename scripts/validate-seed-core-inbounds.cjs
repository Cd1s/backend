const assert = require('node:assert/strict');

require('./register-typescript.cjs');

const {
    createCoreConfig,
} = require('../src/common/helpers/core-config/core-config.factory.ts');
const { syncInbounds } = require('../prisma/seed/seeders/6_sync-inbounds.ts');

const fixture = {
    inbounds: [
        {
            type: 'anytls',
            tag: 'ANYTLS_JP2',
            listen: '0.0.0.0',
            listen_port: 443,
            users: [],
            tls: {
                enabled: true,
                server_name: '147.78.245.53',
                certificate: ['test-certificate'],
                key: ['test-key'],
            },
        },
    ],
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: { final: 'direct' },
};

const config = createCoreConfig('singbox', fixture);

assert.deepEqual(config.getAllInbounds(), [
    {
        tag: 'ANYTLS_JP2',
        rawInbound: {
            type: 'anytls',
            tag: 'ANYTLS_JP2',
            listen: '0.0.0.0',
            listen_port: 443,
            users: [],
            tls: {
                enabled: true,
                server_name: '147.78.245.53',
                certificate: ['test-certificate'],
                key: ['test-key'],
            },
        },
        type: 'anytls',
        network: 'tcp',
        security: 'tls',
        port: 443,
    },
]);

const existingInbound = {
    uuid: '00000000-0000-0000-0000-000000000001',
    profileUuid: '00000000-0000-0000-0000-000000000002',
    tag: 'ANYTLS_JP2',
    type: 'anytls',
    network: 'tcp',
    security: 'tls',
    port: 443,
    rawInbound: fixture.inbounds[0],
};
const calls = {
    create: 0,
    delete: 0,
    update: 0,
};
const prisma = {
    configProfiles: {
        findMany: async () => [
            {
                uuid: existingInbound.profileUuid,
                name: 'JP2-AnyTLS',
                coreType: 'singbox',
                config: fixture,
            },
        ],
    },
    configProfileInbounds: {
        findMany: async () => [structuredClone(existingInbound)],
        createMany: async () => {
            calls.create += 1;
        },
        deleteMany: async () => {
            calls.delete += 1;
        },
        update: async () => {
            calls.update += 1;
        },
    },
};

syncInbounds(prisma).then(() => {
    assert.deepEqual(calls, {
        create: 0,
        delete: 0,
        update: 0,
    });
    process.stdout.write('seed_singbox_anytls_inbound_valid=true\n');
});
