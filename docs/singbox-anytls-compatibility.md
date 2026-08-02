# sing-box AnyTLS client compatibility

The fork's AnyTLS protocol output is intentional and must not be rewritten as VLESS or
Trojan. The following compatibility boundary was verified with the official sing-box binary
against the same minimal configuration containing `outbounds[4].type=anytls`:

- sing-box `1.11.4` fails with `unknown outbound type: anytls`.
- sing-box `1.12.0` accepts the configuration and exits successfully.

Therefore:

- sing-box JSON containing an AnyTLS outbound requires sing-box `>= 1.12.0`;
- an AnyTLS URI requires an iOS/client implementation that supports AnyTLS, also at least
  sing-box `1.12.0` where the official sing-box baseline is used;
- Xray JSON does not advertise or claim AnyTLS support;
- an older iOS client must be upgraded, and the AnyTLS outbound must not be downgraded to
  VLESS or Trojan.

This is a client compatibility requirement, not a Zap-Hosting panel configuration defect.
