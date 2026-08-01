const assert = require('node:assert/strict');

require('./register-typescript.cjs');

const {
    XrayGeneratorService,
} = require('../src/modules/subscription-template/generators/xray.generator.service.ts');

const service = new XrayGeneratorService();
const fixture = {
    finalRemark: 'JP2 AnyTLS',
    address: '147.78.245.53',
    port: 443,
    protocol: 'anytls',
    protocolOptions: {
        password: 'test-password',
    },
    security: 'tls',
    securityOptions: {
        pinnedPeerCertSha256: 'test-certificate-hash',
        verifyPeerCertByName: null,
        alpn: 'h2,http/1.1',
        enableSessionResumption: false,
        fingerprint: 'chrome',
        serverName: '147.78.245.53',
        echConfigList: null,
        echForceQuery: null,
        echSockopt: null,
    },
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

const links = service.generateLinks([fixture], false);
assert.equal(links.length, 1);

const parsed = new URL(links[0]);
assert.equal(parsed.protocol, 'anytls:');
assert.equal(decodeURIComponent(parsed.username), fixture.protocolOptions.password);
assert.equal(parsed.hostname, fixture.address);
assert.equal(parsed.port, String(fixture.port));
assert.equal(parsed.searchParams.get('security'), 'tls');
assert.equal(parsed.searchParams.get('type'), 'tcp');
assert.equal(parsed.searchParams.get('udp'), '1');
assert.equal(parsed.searchParams.get('sni'), fixture.securityOptions.serverName);
assert.equal(parsed.searchParams.get('alpn'), fixture.securityOptions.alpn);
assert.equal(parsed.searchParams.get('fp'), fixture.securityOptions.fingerprint);
assert.equal(parsed.searchParams.get('insecure'), '1');
assert.equal(decodeURIComponent(parsed.hash.slice(1)), fixture.finalRemark);

service.generateConfig([fixture], true, false).then((encoded) => {
    assert.equal(Buffer.from(encoded, 'base64').toString(), links[0]);
    process.stdout.write('shadowrocket_anytls_uri_valid=true\n');
});
