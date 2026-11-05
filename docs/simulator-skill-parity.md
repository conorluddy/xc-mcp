# Simulator skill parity audit

Reference: local ios-simulator-skill `30d2ea4`; xc-mcp baseline `ac2f691`.
This is a one-time comparison, not an automated upstream synchronization mechanism.

## Ported in this update

- Keyboard HID key mapping, individual-event key sequences, modifiers, select-all/delete clearing.
- Pinch, long press, multiple taps, coordinate drag-and-drop, rotation and shake.
- Explicit deep accessibility reads through axbridge (device automation side effect documented).
- Unique-marker accessibility actions, expected-value guards, numeric value normalization,
  coordinate fallback, verified Unicode field replacement and secure-field verification caveat.
- Contrast control with read-back and reset support.
- Delivered notification listing/clearing and confirmed photo-library clearing.
- Explicit confirmation for erase/delete/uninstall; explicit `eraseSimulator: true` remains
  the fresh-install workflow's consent and is propagated to erase.
- Configurable parallel testing; zero-test execution reports NOT RUN; runner exit failures
  are not learned as successful configurations.
- Ignore malformed identifiers in stale-companion detection.

## Capability inventory

“Mapped” means a corresponding implementation exists, not that every option has been proven equivalent.

| Skill script | MCP capability | Status / remaining work |
|---|---|---|
| build_and_test | xcodebuild-build/test, workflow-build-and-run | Parallel option and runner reporting ported; full destination-option audit remains |
| log_monitor | simctl-stream-logs | Mapped; detailed filter/output comparison remains |
| hang_watcher | hang session diagnostics | Partial: raw gzip mode, aggregate storage cap, bounded stream restart require comparison/porting |
| screen_mapper | idb-ui-describe | Deep backend added; coverage hints and full mapper output parity remain |
| navigator | idb-ui-find-element, idb-semantic-action, workflow-tap-element | New semantic actions added; existing workflow still uses coordinate taps; ranking/type/index parity remains |
| gesture | idb-ui-gesture, idb-ui-tap | New primitives added; semantic drag endpoints and convenience scroll/refresh parity remain |
| keyboard | idb-ui-input | HID codes, modifiers, sequences, clear ported; hardware button aliases need further comparison |
| app_launcher | simctl/idb app lifecycle | Mapped; uninstall consent added |
| accessibility_audit | accessibility-audit | Mapped; rule-by-rule comparison remains |
| visual_diff | screenshot visual diff | Mapped; threshold/masking option audit remains |
| test_recorder | test-record-step/report | Mapped; report artifact comparison remains |
| app_state_capture | screenshots, logs, containers, UI tree | Individual components exist; composite capture artifact parity remains |
| clipboard | simctl-pbcopy | Mapped; operation-level comparison remains |
| status_bar | simctl-status-bar | Mapped |
| push_notification | simctl-push, idb-library | Delivered list/clear added |
| privacy_manager | simctl-privacy | Mapped |
| appearance | simctl-appearance | Contrast added; settings read-back covered in implementation |
| location | simctl-location | Mapped: coordinates, cities, GPX/waypoints, clearing |
| media | simctl-addmedia, idb-library | Photo clearing added; multi-file/vCard parity remains |
| sim_list | simctl-list/get-details | Mapped |
| simulator_selector | simctl-suggest | Mapped; newest-generation scoring comparison remains |
| simctl_boot | simctl-boot | Single-device mapped; batch filters remain to compare |
| simctl_shutdown | simctl-shutdown | Single-device mapped; batch filters remain to compare |
| simctl_create | simctl-create | Mapped; preset option comparison remains |
| simctl_delete | simctl-delete | Confirmation ported; batch parity remains |
| simctl_erase | simctl-erase | Confirmation ported; batch parity remains |
| sim_health_check | simctl-health-check, idb-doctor | Malformed stale IDs fixed; CLI/companion minor mismatch and axbridge guest checks remain |
| model_inspector | xcode-model-inspect | Mapped; existing model fixtures tested |
| container | simctl-container | Mapped; full filesystem/UserDefaults option audit remains |
| localization_audit | localization audit | Mapped; existing catalog fixtures tested |

## Verification and limitations

Regression tests cover keyboard command semantics, marker ambiguity against untyped nodes, numeric
AXValue guards, failed field read-back, notification output limits, duration conversion, destructive
confirmation, and malformed companion IDs. Existing tests cover the mapped implementations.

Live UI effects have not been verified: the simulator inventory was accessible outside the sandbox,
but no simulator was booted. New idb operations are based on the reference skill's command contracts.
Full feature parity is **not yet achieved**; the remaining work above must be completed before making
that claim. Build/test success alone is not evidence of simulator behavior.
