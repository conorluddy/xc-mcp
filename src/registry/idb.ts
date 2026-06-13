import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDescription } from './types.js';
import {
  idbTargetsRouter,
  IDB_TARGETS_DOCS,
  IDB_TARGETS_DOCS_MINI,
} from '../tools/idb/targets/index.js';
import { idbUiTapTool, IDB_UI_TAP_DOCS, IDB_UI_TAP_DOCS_MINI } from '../tools/idb/ui-tap.js';
import {
  idbUiInputTool,
  IDB_UI_INPUT_DOCS,
  IDB_UI_INPUT_DOCS_MINI,
} from '../tools/idb/ui-input.js';
import {
  idbUiGestureTool,
  IDB_UI_GESTURE_DOCS,
  IDB_UI_GESTURE_DOCS_MINI,
} from '../tools/idb/ui-gesture.js';
import {
  idbUiDescribeTool,
  IDB_UI_DESCRIBE_DOCS,
  IDB_UI_DESCRIBE_DOCS_MINI,
} from '../tools/idb/ui-describe.js';
import {
  idbUiFindElementTool,
  IDB_UI_FIND_ELEMENT_DOCS,
  IDB_UI_FIND_ELEMENT_DOCS_MINI,
} from '../tools/idb/ui-find-element.js';
import {
  accessibilityQualityCheckTool,
  ACCESSIBILITY_QUALITY_CHECK_DOCS,
  ACCESSIBILITY_QUALITY_CHECK_DOCS_MINI,
} from '../tools/idb/accessibility-quality-check.js';
import {
  idbListAppsTool,
  IDB_LIST_APPS_DOCS,
  IDB_LIST_APPS_DOCS_MINI,
} from '../tools/idb/list-apps.js';
import { idbInstallTool, IDB_INSTALL_DOCS } from '../tools/idb/install.js';
import { idbUninstallTool, IDB_UNINSTALL_DOCS } from '../tools/idb/uninstall.js';
import { idbLaunchTool, IDB_LAUNCH_DOCS } from '../tools/idb/launch.js';
import { idbTerminateTool, IDB_TERMINATE_DOCS } from '../tools/idb/terminate.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerIdbTools(server: McpServer): void {
  // idb-targets
  server.registerTool(
    'idb-targets',
    {
      title: 'Manage IDB Targets',
      description: getDescription(IDB_TARGETS_DOCS, IDB_TARGETS_DOCS_MINI),
      inputSchema: {
        operation: z.enum(['list', 'describe', 'focus', 'connect', 'disconnect']),
        udid: z.string().optional(),
        state: z.enum(['Booted', 'Shutdown']).optional(),
        type: z.enum(['device', 'simulator']).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbTargetsRouter(args)
  );

  // idb-ui-tap
  server.registerTool(
    'idb-ui-tap',
    {
      title: 'Tap UI Element',
      description: getDescription(IDB_UI_TAP_DOCS, IDB_UI_TAP_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        x: z.number(),
        y: z.number(),
        numberOfTaps: z.number().default(1),
        duration: z.number().optional(),
        applyScreenshotScale: z.boolean().optional(),
        screenshotScaleX: z.number().optional(),
        screenshotScaleY: z.number().optional(),
        actionName: z.string().optional(),
        screenContext: z.string().optional(),
        expectedOutcome: z.string().optional(),
        testScenario: z.string().optional(),
        step: z.number().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiTapTool(args)
  );

  // idb-ui-input
  server.registerTool(
    'idb-ui-input',
    {
      title: 'Send Text/Key Input',
      description: getDescription(IDB_UI_INPUT_DOCS, IDB_UI_INPUT_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        operation: z.enum(['text', 'key', 'key-sequence']),
        text: z.string().optional(),
        key: z
          .enum([
            'home',
            'lock',
            'siri',
            'delete',
            'return',
            'space',
            'escape',
            'tab',
            'up',
            'down',
            'left',
            'right',
          ])
          .optional(),
        keySequence: z.array(z.string()).optional(),
        actionName: z.string().optional(),
        fieldContext: z.string().optional(),
        expectedOutcome: z.string().optional(),
        isSensitive: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiInputTool(args)
  );

  // idb-ui-gesture
  server.registerTool(
    'idb-ui-gesture',
    {
      title: 'Perform Gesture / Button Press',
      description: getDescription(IDB_UI_GESTURE_DOCS, IDB_UI_GESTURE_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        operation: z.enum(['swipe', 'button']),
        direction: z.enum(['up', 'down', 'left', 'right']).optional(),
        startX: z.number().optional(),
        startY: z.number().optional(),
        endX: z.number().optional(),
        endY: z.number().optional(),
        duration: z
          .number()
          .default(200)
          .describe('Swipe duration in milliseconds (e.g., 200 for 200ms, default: 200ms)'),
        buttonType: z
          .enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI', 'SCREENSHOT', 'APP_SWITCH'])
          .optional(),
        actionName: z.string().optional(),
        expectedOutcome: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiGestureTool(args)
  );

  // idb-ui-describe
  server.registerTool(
    'idb-ui-describe',
    {
      title: 'Describe Accessibility Tree',
      description: getDescription(IDB_UI_DESCRIBE_DOCS, IDB_UI_DESCRIBE_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        operation: z.enum(['all', 'point']),
        x: z.number().optional(),
        y: z.number().optional(),
        screenContext: z.string().optional(),
        purposeDescription: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiDescribeTool(args)
  );

  // idb-ui-find-element
  server.registerTool(
    'idb-ui-find-element',
    {
      title: 'Find UI Element',
      description: getDescription(IDB_UI_FIND_ELEMENT_DOCS, IDB_UI_FIND_ELEMENT_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        query: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiFindElementTool(args)
  );

  // accessibility-quality-check
  server.registerTool(
    'accessibility-quality-check',
    {
      title: 'Accessibility Quality Check',
      description: getDescription(
        ACCESSIBILITY_QUALITY_CHECK_DOCS,
        ACCESSIBILITY_QUALITY_CHECK_DOCS_MINI
      ),
      inputSchema: {
        udid: z.string().optional(),
        screenContext: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => accessibilityQualityCheckTool(args)
  );

  // idb-list-apps
  server.registerTool(
    'idb-list-apps',
    {
      title: 'List Installed Apps (IDB)',
      description: getDescription(IDB_LIST_APPS_DOCS, IDB_LIST_APPS_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        filterType: z.enum(['system', 'user', 'internal']).optional(),
        runningOnly: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbListAppsTool(args)
  );

  // idb-install
  server.registerTool(
    'idb-install',
    {
      title: 'Install App (IDB)',
      description: getDescription(IDB_INSTALL_DOCS, IDB_INSTALL_DOCS),
      inputSchema: {
        udid: z.string().optional(),
        appPath: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbInstallTool(args)
  );

  // idb-uninstall
  server.registerTool(
    'idb-uninstall',
    {
      title: 'Uninstall App (IDB)',
      description: getDescription(IDB_UNINSTALL_DOCS, IDB_UNINSTALL_DOCS),
      inputSchema: {
        udid: z.string().optional(),
        bundleId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUninstallTool(args)
  );

  // idb-launch
  server.registerTool(
    'idb-launch',
    {
      title: 'Launch App (IDB)',
      description: getDescription(IDB_LAUNCH_DOCS, IDB_LAUNCH_DOCS),
      inputSchema: {
        udid: z.string().optional(),
        bundleId: z.string(),
        streamOutput: z.boolean().optional(),
        arguments: z.array(z.string()).optional(),
        environment: z.record(z.string(), z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbLaunchTool(args)
  );

  // idb-terminate
  server.registerTool(
    'idb-terminate',
    {
      title: 'Terminate App (IDB)',
      description: getDescription(IDB_TERMINATE_DOCS, IDB_TERMINATE_DOCS),
      inputSchema: {
        udid: z.string().optional(),
        bundleId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbTerminateTool(args)
  );
}
