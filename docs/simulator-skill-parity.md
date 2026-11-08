# Simulator skill parity audit

Reference: local ios-simulator-skill `30d2ea4`; xc-mcp baseline `ac2f691`.
This is a one-time comparison, not an automated upstream synchronization mechanism.

## Ported in this update

- Keyboard HID key mapping, individual-event key sequences, modifiers, select-all/delete clearing.
- Pinch, long press, multiple taps, coordinate drag-and-drop, rotation and shake.
- Explicit deep accessibility reads through axbridge (device automation side effect documented).
- Unique-marker accessibility actions, expected-value guards, numeric value normalization,
  coordinate fallback, verified Unicode field replacement and secure-field verification caveat.
- Tap workflow uses accessibility presses for a single matching Button/Link/Switch/CheckBox/Tab,
  rechecks marker uniqueness, and stops on rejected semantic actions.
- Contrast control with read-back and reset support.
- Delivered notification listing/clearing and confirmed photo-library clearing.
- Explicit confirmation for erase/delete/uninstall; explicit `eraseSimulator: true` remains
  the fresh-install workflow's consent and is propagated to erase.
- Configurable parallel testing; zero-test execution reports NOT RUN; runner exit failures
  are not learned as successful configurations.
- Ignore malformed identifiers in stale-companion detection.

## Capability inventory

“Mapped” means a corresponding implementation exists, not that every option has been proven equivalent.

| Skill script | MCP capability | Audit result |
|---|---|---|
| build_and_test | xcodebuild-build/test, workflow-build-and-run | Audited: destination accepts name/id and OS pinning; configuration, clean and onlyTesting map to reference options; parallel/reporting fixes ported |
| log_monitor | simctl-stream-logs | Audited: bounded duration, bundle/custom predicates, severity classification, deduplication and capped summaries; outputPath preserves full captured output |
| hang_watcher | hang session diagnostics | Raw NDJSON/gzip mode, aggregate storage cap and bounded stream retries added; retries run while the MCP server is alive |
| screen_mapper | idb-ui-describe | Deep backend and labelled-leaf coverage hint added; type counts, interactive previews and full cached tree provide mapper data |
| navigator | idb-ui-find-element, idb-semantic-action, workflow-tap-element | New semantic actions added; workflow uses semantic presses for single control matches; exact/type/identifier/index selection, nested traversal and control ranking added |
| gesture | idb-ui-gesture, idb-ui-tap | Label drag endpoints, repeated content-direction scroll and pull-to-refresh added alongside gesture primitives |
| keyboard | idb-ui-input | HID codes, modifiers, sequences, clear and all reference hardware button aliases ported |
| app_launcher | simctl/idb app lifecycle | Mapped; uninstall consent added |
| accessibility_audit | accessibility-audit | Audited: same critical/warning/info rules; all matching rules in highest severity tier now reported; xc-mcp also checks small targets |
| visual_diff | screenshot visual diff | Audited: threshold ratio, dimension checks, diff/report and side-by-side artifacts; algorithm: skill adds reference luminance cutoff. Reference has no masking option |
| test_recorder | test-record-step/report | Audited: screenshots, accessibility snapshots, step metadata and Markdown report; optional assertionPassed records explicit pass/fail |
| app_state_capture | screenshots, logs, containers, UI tree | app-state-capture added: screenshot, AX tree, recent logs, device metadata, summary and README in one directory |
| clipboard | simctl-pbcopy | Audited: reference only exposes copy; simctl-pbcopy supplies it |
| status_bar | simctl-status-bar | Mapped |
| push_notification | simctl-push, idb-library | Delivered list/clear added |
| privacy_manager | simctl-privacy | Mapped |
| appearance | simctl-appearance | Contrast added; settings read-back covered in implementation |
| location | simctl-location | Mapped: coordinates, cities, GPX/waypoints, clearing |
| media | simctl-addmedia, idb-library | Photo clearing and validated mediaPaths batch import added. Reference media.py does not expose vCard import |
| sim_list | simctl-list/get-details | Mapped |
| simulator_selector | simctl-suggest | Generation-based mainline iPhone scoring added; newer base model outranks previous-generation Pro with other factors equal; runtime scoring uses runtime metadata |
| simctl_boot | simctl-boot | Single-device plus all/deviceType/runtime batch selection added |
| simctl_shutdown | simctl-shutdown | Single-device plus all/deviceType/runtime batch selection added |
| simctl_create | simctl-create | Audited: device type, runtime and name mapped; list tool supplies available types/runtimes. Reference has no create presets |
| simctl_delete | simctl-delete | Confirmation plus all/deviceType/runtime batch selection added |
| simctl_erase | simctl-erase | Confirmation plus all/deviceType/runtime batch selection added |
| sim_health_check | simctl-health-check, idb-doctor | Malformed stale IDs fixed; doctor adds CLI/companion minor mismatch and executable axbridge guest checks |
| model_inspector | xcode-model-inspect | Mapped; existing model fixtures tested |
| container | simctl-container | Audited: ls, cat, UserDefaults and Core Data paths mapped; export added with overwrite protection |
| localization_audit | localization audit | Mapped; existing catalog fixtures tested |

## Verification and limitations

The implementation and option-audit gaps above are addressed. “Audited” records capability
mapping, not byte-for-byte output compatibility with the Python scripts. MCP responses retain
xc-mcp's schemas and progressive disclosure. Reference-only CLI formatting and environment
variable names are not copied.

Regression coverage includes keyboard semantics and aliases, marker ambiguity, numeric AXValue
guards, field read-back, destructive consent, batch partial failures, nested navigation/ranking,
coverage hints, raw gzip output, restart exhaustion, storage pruning, media path validation,
container export overwrite protection, and diagnostic bundle failure reporting.

Live verification on 2026-11-05 used the already booted iPhone 17 Pro / iOS 27.0:
- A first accessibility read timed out; retry succeeded.
- Built element search returned three matching static-text elements and the expected selected label.
- Built app-state-capture successfully wrote screenshot, accessibility, logs, device metadata,
  summary and README under `/tmp/xc-mcp-parity-live/capture-C4I022`.

Destructive operations and the full gesture/keyboard/settings matrix have unit/command-contract
coverage, not live effect verification. Do not interpret this audit as exhaustive end-to-end
certification. Hang stream retry supervision lasts only while the MCP server is running;
active sessions are preserved during storage pruning, so the cap is best-effort when captures
alone exceed it. Raw capture can contain private app log content.

## Duo integration verification — 2026-11-08

Verified with Xcode 27.1 (27A9269), iOS 27.1 and explicitly selected iPhone Duo
`DD124D1F-540F-453D-BCBB-602F0854D2B6`. The initial bootstatus reported a migration
failure, but subsequent simulator services and live operations succeeded.

- Bundled helper compiled, signed and read hinge angle through CoreMotion.
- Open (180°), partial (90°), inner portrait rotation and closed (0°) verified by readback.
- Installed `xc-mcp` passed MCP initialize, tools/list, rtfm and tools/call.
- Default and mini registered 81 tools; build-only registered 18 and excluded Duo controls.
- Installed MCP file captures: inner 2007×2853 and cover 1398×2034, both non-black.
- Installed MCP inline cover capture returned image and metadata successfully.
- Build, lint and all 79 Jest suites / 1,560 tests passed; lint retains the existing
  command.ts non-null assertion warning.

The selected simulator was left closed. Video display selection, other Xcode/runtime
versions and inner-display touch routing were not live-verified. Private backend source
is XC-MCP's focused implementation, informed by hinge and duoctl's published mechanism.
Replace it when official headless equivalents support verified behavior, independently
for fold and rotation; retain the MCP interface where practical.

A subsequent no-pause ten-case matrix completed in 53.7 seconds: seven cases passed.
Cover landscape, inner landscape and inner flipped landscape timed out. The two
inner landscape rotations passed in the earlier paused run. End-to-end hinge cases
were 3.3–7.0 seconds; these include command startup and readback. Rapid rotation
reliability remains a known limitation. The five-second polling budget starts after
initial readback and action dispatch, so total request time can exceed five seconds.
