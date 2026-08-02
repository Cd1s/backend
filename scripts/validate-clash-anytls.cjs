#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { load } = require('js-yaml');

require('./register-typescript.cjs');

const {
    ClashGeneratorService,
} = require('../src/modules/subscription-template/generators/clash.generator.service.ts');

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

function createFixture(index, security = 'tls') {
    return {
        finalRemark: `AnyTLS ${index}`,
        address: `192.0.2.${index}`,
        port: 443,
        protocol: 'anytls',
        protocolOptions: { password: `test-password-${index}` },
        security,
        securityOptions: security === 'tls' ? TLS_OPTIONS : REALITY_OPTIONS,
        transport: 'tcp',
        transportOptions: { header: null },
        streamOverrides: { finalMask: null, sockopt: null },
        mux: null,
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            xrayJsonTemplate: null,
        },
        metadata: {
            uuid: `00000000-0000-0000-0000-00000000000${index}`,
            tags: ['ANYTLS'],
            excludeFromSubscriptionTypes: [],
            inboundTag: `ANYTLS_${index}`,
            configProfileUuid: '00000000-0000-0000-0000-000000000002',
            configProfileInboundUuid: '00000000-0000-0000-0000-000000000003',
            isDisabled: false,
            isHidden: false,
            viewPosition: index,
            remark: `AnyTLS ${index}`,
            vlessRouteId: null,
            rawInbound: null,
        },
    };
}

function createService() {
    return new ClashGeneratorService({
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

function assertAnyTlsProxy(proxy, index) {
    assert.ok(proxy, `Clash output must include AnyTLS proxy ${index}`);
    assert.equal(proxy.type, 'anytls');
    assert.equal(proxy.server, `192.0.2.${index}`);
    assert.equal(proxy.port, 443);
    assert.equal(proxy.password, `test-password-${index}`);
    assert.equal(proxy.udp, true);
    assert.equal(proxy.tls, true);
    assert.equal(proxy.sni, 'example.com');
    assert.equal(proxy.servername, undefined);
    assert.deepEqual(proxy.alpn, ['h2', 'http/1.1']);
    assert.equal(proxy['skip-cert-verify'], true);
    assert.equal(proxy['name-cert-verify'], 'example.com');
    assert.equal(proxy['client-fingerprint'], 'chrome');
    assert.equal(proxy['reality-opts'], undefined);
}

function runMihomoCheck(binary, yaml) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remnawave-clash-anytls-'));
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, yaml);

    const result = spawnSync(binary, ['-t', '-f', configPath], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });

    if (result.status !== 0) {
        throw new Error(
            `Mihomo rejected Clash AnyTLS config (exit=${result.status}): ${result.stderr || result.stdout}`,
        );
    }
}

async function main() {
    const service = createService();
    const hosts = Array.from({ length: 9 }, (_, index) => createFixture(index + 1));
    const directNode = service.buildProxyNode(hosts[0]);

    if (!directNode) {
        process.stdout.write('clash_anytls_currently_dropped=true\n');
    }
    assert.ok(directNode, 'CLASH generator must retain an AnyTLS proxy');

    const yaml = await service.generateConfig(hosts);
    const config = load(yaml);
    const anyTlsProxies = config.proxies.filter((proxy) => proxy.type === 'anytls');
    assert.equal(anyTlsProxies.length, 9);
    anyTlsProxies.forEach((proxy, index) => assertAnyTlsProxy(proxy, index + 1));

    const realityConfig = load(await service.generateConfig([createFixture(1, 'reality')]));
    assert.equal(
        realityConfig.proxies.some((proxy) => proxy.type === 'anytls'),
        false,
        'CLASH must skip AnyTLS+Reality instead of fabricating reality-opts',
    );

    if (process.argv.includes('--skip-binary')) {
        process.stdout.write('clash_anytls_binary_check=skipped\n');
    } else {
        const binary = resolveBinary();
        runMihomoCheck(binary, yaml);
        process.stdout.write(`clash_anytls_binary_check=passed binary=${binary}\n`);
    }

    process.stdout.write('clash_anytls_proxies=9\n');
    process.stdout.write('clash_anytls_yaml_valid=true\n');
}

main().catch((error) => {
    console.error(`clash_anytls_validation=failed reason=${error.message}`);
    process.exitCode = 1;
});
