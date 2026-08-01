# Custom feature registry

This repository carries the backend half of the dual-core fork. The coordination repository
contains the cross-repository registry; this local copy records the backend behavior and the
validation gates that an upstream merge must preserve.

| ID           | Feature                                          | Owners                  | Backend invariant                                                                                                                 | Required validation                                                        |
| ------------ | ------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `CORE-001`   | Per-profile core selection (`xray` or `singbox`) | Backend, frontend, Node | Xray remains the default; existing profiles are not converted; `singbox` is explicit                                              | Build, seed validation, matching frontend/Node contract tests              |
| `CONFIG-001` | Native sing-box config storage and validation    | Backend, frontend       | Native JSON keys and complete inbound JSON survive API/database round trips; Xray behavior is unchanged                           | Adaptation preflight, config round-trip, isolated profile startup          |
| `USER-001`   | sing-box user synchronization                    | Backend, Node           | User injection/removal preserves unrelated users and inbounds; Remnawave identity mapping remains stable                          | Seed/inbound validation, Node user transition and restart tests            |
| `ANYTLS-001` | AnyTLS config and client output                  | Backend, frontend, Node | AnyTLS is represented only by supported sing-box/Shadowrocket output and remains attributable                                     | `validate:shadowrocket-anytls`, config editor and real transfer tests      |
| `SUB-001`    | sing-box and Shadowrocket subscription output    | Backend                 | Prepared credentials and server fields match the Node config; Xray JSON does not advertise AnyTLS                                 | Subscription validator, sing-box JSON inspection, isolated transfer        |
| `SYNC-001`   | Tested automatic upstream synchronization        | Backend                 | Update detection is commit-based; clean merges may proceed automatically; conflicts or validation failures never update `singbox` | Sync preflight, conflict-report simulation, backend gates, workflow review |

When upstream changes a shared contract or runtime command, also inspect the matching frontend and
Node branches before accepting the merge. Do not resolve a conflict by dropping a published
migration or by selecting one side for an entire file without reviewing the surrounding behavior.
