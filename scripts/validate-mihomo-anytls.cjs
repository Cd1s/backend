#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load } = require('js-yaml');

require('./register-typescript.cjs');

const {
    MihomoGeneratorService,
} = require('../src/modules/subscription-template/generators/mihomo.generator.service.ts');

const TLS_OPTIONS = {
    pinnedPeerCertSha256: 'test-certificate-hash',
    verifyPeerCertByName: 'example.com',
    alpn: 'h2,http/1.1',
    enableSessionResumption: false,
    fingerprint: 'chrome',
    serverName: 'example.com',
    echConfigList: null,
    echForceQuery: null,
    echSockopt: null,
};

const REALITY_OPTIONS = {
    fingerprint: 'chrome',
    publicKey: 'test-public-key',
    shortId: '01234567',
    serverName: 'example.com',
    spiderX: null,
    mldsa65Verify: null,
};

function createFixture(security = 'tls') {
    return {
        finalRemark: 'JP2 AnyTLS',
        address: '147.78.245.53',
        port: 443,
        protocol: 'anytls',
        protocolOptions: {
            password: 'test-password',
        },
        security,
        securityOptions: security === 'tls' ? TLS_OPTIONS : REALITY_OPTIONS,
        transport: 'tcp',
        transportOptions: {
            header: null,
        },
        streamOverrides: {
            finalMask: null,
            sockopt: null,
        },
        mux: null,
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            xrayJsonTemplate: null,
            mapper: {},
        },
        metadata: {
            uuid: '00000000-0000-0000-0000-000000000001',
            tags: ['JP2', 'ANYTLS'],
            excludeFromSubscriptionTypes: [],
            inboundTag: 'ANYTLS_JP2',
            configProfileUuid: '00000000-0000-0000-0000-000000000002',
            configProfileInboundUuid: '00000000-0000-0000-0000-000000000003',
            isDisabled: false,
            isHidden: false,
            viewPosition: 1,
            remark: 'JP2',
            vlessRouteId: null,
            rawInbound: null,
        },
    };
}

function createService() {
    return new MihomoGeneratorService({
        getCachedTemplateByType: async () => ({
            proxies: [],
            'proxy-groups': [{ name: '→ Remnawave', type: 'select', proxies: [] }],
            rules: [],
        }),
    });
}

function resolveBinary() {
    const configured = process.env.MIHOMO_BIN || 'mihomo';
    if (fs.existsSync(configured)) return configured;

    const lookup = spawnSync('command', ['-v', configured], { encoding: 'utf8' });
    if (lookup.status === 0 && lookup.stdout.trim()) return lookup.stdout.trim();

    throw new Error(
        `official Mihomo binary not found; set MIHOMO_BIN or install ${configured} before running the config check`,
    );
}

function assertAnyTlsProxy(proxy) {
    assert.ok(proxy, 'Mihomo output must include the AnyTLS proxy');
    assert.equal(proxy.type, 'anytls');
    assert.equal(proxy.server, '147.78.245.53');
    assert.equal(proxy.port, 443);
    assert.equal(proxy.password, 'test-password');
    assert.equal(proxy.tls, true);
    assert.equal(proxy.sni, 'example.com');
    assert.equal(proxy.servername, undefined);
    assert.deepEqual(proxy.alpn, ['h2', 'http/1.1']);
    assert.equal(proxy['skip-cert-verify'], true);
    assert.equal(proxy['name-cert-verify'], 'example.com');
    assert.equal(proxy['client-fingerprint'], 'chrome');
    assert.equal(proxy.udp, true);
}

function runMihomoCheck(binary, yaml) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remnawave-mihomo-anytls-'));
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, yaml);

    const result = spawnSync(binary, ['-t', '-f', configPath], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });

    if (result.status !== 0) {
        throw new Error(
            `Mihomo rejected AnyTLS config (exit=${result.status}): ${result.stderr || result.stdout}`,
        );
    }
}

async function main() {
    const service = createService();
    const tlsFixture = createFixture('tls');
    const realityFixture = createFixture('reality');

    const directNode = service.buildProxyNode(tlsFixture, false);
    assertAnyTlsProxy(directNode);

    const yaml = await service.generateConfig([tlsFixture]);
    const config = load(yaml);
    const proxy = config.proxies.find((candidate) => candidate.name === tlsFixture.finalRemark);
    assertAnyTlsProxy(proxy);
    assert.ok(config['proxy-groups'][0].proxies.includes(tlsFixture.finalRemark));

    const stashYaml = await service.generateConfig([tlsFixture], true);
    const stashConfig = load(stashYaml);
    assertAnyTlsProxy(
        stashConfig.proxies.find((candidate) => candidate.name === tlsFixture.finalRemark),
    );

    const realityYaml = await service.generateConfig([realityFixture]);
    const realityConfig = load(realityYaml);
    assert.equal(
        realityConfig.proxies.some((candidate) => candidate.name === realityFixture.finalRemark),
        false,
        'Mihomo must skip AnyTLS+Reality instead of emitting unsupported reality-opts',
    );

    if (process.argv.includes('--skip-binary')) {
        process.stdout.write('mihomo_anytls_binary_check=skipped\n');
    } else {
        const binary = resolveBinary();
        runMihomoCheck(binary, yaml);
        process.stdout.write(`mihomo_anytls_binary_check=passed binary=${binary}\n`);
    }

    process.stdout.write('mihomo_anytls_yaml_valid=true\n');
}

main().catch((error) => {
    console.error(`mihomo_anytls_validation=failed reason=${error.message}`);
    process.exitCode = 1;
});
