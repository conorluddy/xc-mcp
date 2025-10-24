/**
 * Central registry of all tool documentation.
 *
 * This file imports documentation constants from all tool implementations
 * and provides a unified map for the get-tool-docs MCP tool.
 *
 * Documentation is embedded as TypeScript constants to ensure it's
 * bundled with the npm package (no external .md file dependencies).
 */

// Xcodebuild documentation
import { XCODEBUILD_BUILD_DOCS } from './xcodebuild/build.js';
import { XCODEBUILD_CLEAN_DOCS } from './xcodebuild/clean.js';
import { XCODEBUILD_LIST_DOCS } from './xcodebuild/list.js';
import { XCODEBUILD_SHOWSDKS_DOCS } from './xcodebuild/showsdks.js';
import { XCODEBUILD_VERSION_DOCS } from './xcodebuild/version.js';
import { XCODEBUILD_GET_DETAILS_DOCS } from './xcodebuild/get-details.js';
import { XCODEBUILD_TEST_DOCS } from './xcodebuild/xcodebuild-test.js';

// Simctl lifecycle documentation
import { SIMCTL_LIST_DOCS } from './simctl/list.js';
import { SIMCTL_GET_DETAILS_DOCS } from './simctl/get-details.js';
import { SIMCTL_BOOT_DOCS } from './simctl/boot.js';
import { SIMCTL_SHUTDOWN_DOCS } from './simctl/shutdown.js';
import { SIMCTL_SUGGEST_DOCS } from './simctl/suggest.js';
import { SIMCTL_CREATE_DOCS } from './simctl/create.js';
import { SIMCTL_DELETE_DOCS } from './simctl/delete.js';
import { SIMCTL_ERASE_DOCS } from './simctl/erase.js';
import { SIMCTL_CLONE_DOCS } from './simctl/clone.js';
import { SIMCTL_RENAME_DOCS } from './simctl/rename.js';
import { SIMCTL_HEALTH_CHECK_DOCS } from './simctl/health-check.js';

// Simctl app management documentation
import { SIMCTL_INSTALL_DOCS } from './simctl/install.js';
import { SIMCTL_UNINSTALL_DOCS } from './simctl/uninstall.js';
import { SIMCTL_GET_APP_CONTAINER_DOCS } from './simctl/get-app-container.js';
import { SIMCTL_LAUNCH_DOCS } from './simctl/launch.js';
import { SIMCTL_TERMINATE_DOCS } from './simctl/terminate.js';
import { SIMCTL_OPENURL_DOCS } from './simctl/openurl.js';

// Simctl I/O and testing documentation
import { SIMCTL_IO_DOCS } from './simctl/io.js';
import { SIMCTL_ADDMEDIA_DOCS } from './simctl/addmedia.js';
import { SIMCTL_PRIVACY_DOCS } from './simctl/privacy.js';
import { SIMCTL_PUSH_DOCS } from './simctl/push.js';
import { SIMCTL_PBCOPY_DOCS } from './simctl/pbcopy.js';
import { SIMCTL_STATUS_BAR_DOCS } from './simctl/status-bar.js';
import { SIMCTL_SCREENSHOT_INLINE_DOCS } from './simctl/screenshot-inline.js';
import { SIMCTL_STREAM_LOGS_DOCS } from './simctl/stream-logs.js';

// IDB documentation
import { IDB_TARGETS_DOCS } from './idb/targets.js';
import { IDB_CONNECT_DOCS } from './idb/connect.js';
import { IDB_UI_TAP_DOCS } from './idb/ui-tap.js';
import { IDB_UI_INPUT_DOCS } from './idb/ui-input.js';
import { IDB_UI_GESTURE_DOCS } from './idb/ui-gesture.js';
import { IDB_UI_DESCRIBE_DOCS } from './idb/ui-describe.js';
import { IDB_LIST_APPS_DOCS } from './idb/list-apps.js';
import { IDB_INSTALL_DOCS } from './idb/install.js';
import { IDB_LAUNCH_DOCS } from './idb/launch.js';
import { IDB_TERMINATE_DOCS } from './idb/terminate.js';
import { IDB_UNINSTALL_DOCS } from './idb/uninstall.js';

// Cache documentation
import { CACHE_LIST_CACHED_RESPONSES_DOCS } from './cache/list-cached.js';
import { CACHE_GET_STATS_DOCS } from './cache/get-stats.js';
import { CACHE_GET_CONFIG_DOCS } from './cache/get-config.js';
import { CACHE_SET_CONFIG_DOCS } from './cache/set-config.js';
import { CACHE_CLEAR_DOCS } from './cache/clear.js';

// Persistence documentation
import { PERSISTENCE_ENABLE_DOCS } from './persistence/enable.js';
import { PERSISTENCE_DISABLE_DOCS } from './persistence/disable.js';
import { PERSISTENCE_STATUS_DOCS } from './persistence/status.js';

// Documentation tool documentation
import { RTFM_DOCS } from './get-tool-docs.js';

/**
 * Map of tool names to their full documentation.
 * Tool names match the MCP tool registration names.
 */
export const TOOL_DOCS: Record<string, string> = {
  // Xcodebuild tools
  'xcodebuild-build': XCODEBUILD_BUILD_DOCS,
  'xcodebuild-clean': XCODEBUILD_CLEAN_DOCS,
  'xcodebuild-list': XCODEBUILD_LIST_DOCS,
  'xcodebuild-showsdks': XCODEBUILD_SHOWSDKS_DOCS,
  'xcodebuild-version': XCODEBUILD_VERSION_DOCS,
  'xcodebuild-get-details': XCODEBUILD_GET_DETAILS_DOCS,
  'xcodebuild-test': XCODEBUILD_TEST_DOCS,

  // Simctl lifecycle tools
  'simctl-list': SIMCTL_LIST_DOCS,
  'simctl-get-details': SIMCTL_GET_DETAILS_DOCS,
  'simctl-boot': SIMCTL_BOOT_DOCS,
  'simctl-shutdown': SIMCTL_SHUTDOWN_DOCS,
  'simctl-suggest': SIMCTL_SUGGEST_DOCS,
  'simctl-create': SIMCTL_CREATE_DOCS,
  'simctl-delete': SIMCTL_DELETE_DOCS,
  'simctl-erase': SIMCTL_ERASE_DOCS,
  'simctl-clone': SIMCTL_CLONE_DOCS,
  'simctl-rename': SIMCTL_RENAME_DOCS,
  'simctl-health-check': SIMCTL_HEALTH_CHECK_DOCS,

  // Simctl app management tools
  'simctl-install': SIMCTL_INSTALL_DOCS,
  'simctl-uninstall': SIMCTL_UNINSTALL_DOCS,
  'simctl-get-app-container': SIMCTL_GET_APP_CONTAINER_DOCS,
  'simctl-launch': SIMCTL_LAUNCH_DOCS,
  'simctl-terminate': SIMCTL_TERMINATE_DOCS,
  'simctl-openurl': SIMCTL_OPENURL_DOCS,

  // Simctl I/O and testing tools
  'simctl-io': SIMCTL_IO_DOCS,
  'simctl-addmedia': SIMCTL_ADDMEDIA_DOCS,
  'simctl-privacy': SIMCTL_PRIVACY_DOCS,
  'simctl-push': SIMCTL_PUSH_DOCS,
  'simctl-pbcopy': SIMCTL_PBCOPY_DOCS,
  'simctl-status-bar': SIMCTL_STATUS_BAR_DOCS,
  screenshot: SIMCTL_SCREENSHOT_INLINE_DOCS,
  'simctl-stream-logs': SIMCTL_STREAM_LOGS_DOCS,

  // IDB tools
  'idb-targets': IDB_TARGETS_DOCS,
  'idb-connect': IDB_CONNECT_DOCS,
  'idb-ui-tap': IDB_UI_TAP_DOCS,
  'idb-ui-input': IDB_UI_INPUT_DOCS,
  'idb-ui-gesture': IDB_UI_GESTURE_DOCS,
  'idb-ui-describe': IDB_UI_DESCRIBE_DOCS,
  'idb-list-apps': IDB_LIST_APPS_DOCS,
  'idb-install': IDB_INSTALL_DOCS,
  'idb-launch': IDB_LAUNCH_DOCS,
  'idb-terminate': IDB_TERMINATE_DOCS,
  'idb-uninstall': IDB_UNINSTALL_DOCS,

  // Cache tools
  'list-cached-responses': CACHE_LIST_CACHED_RESPONSES_DOCS,
  'cache-get-stats': CACHE_GET_STATS_DOCS,
  'cache-get-config': CACHE_GET_CONFIG_DOCS,
  'cache-set-config': CACHE_SET_CONFIG_DOCS,
  'cache-clear': CACHE_CLEAR_DOCS,

  // Persistence tools
  'persistence-enable': PERSISTENCE_ENABLE_DOCS,
  'persistence-disable': PERSISTENCE_DISABLE_DOCS,
  'persistence-status': PERSISTENCE_STATUS_DOCS,

  // Documentation tool
  rtfm: RTFM_DOCS,
};
