import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { idbTargetsRouter } from '../tools/idb/targets/index.js';
import { IDB_TARGETS_DOCS } from '../tools/idb/targets/index.js';
import { idbUiTapTool } from '../tools/idb/ui-tap.js';
import { IDB_UI_TAP_DOCS } from '../tools/idb/ui-tap.js';
import { idbUiInputTool } from '../tools/idb/ui-input.js';
import { IDB_UI_INPUT_DOCS } from '../tools/idb/ui-input.js';
import { idbUiGestureTool } from '../tools/idb/ui-gesture.js';
import { IDB_UI_GESTURE_DOCS } from '../tools/idb/ui-gesture.js';
import { idbUiDescribeTool } from '../tools/idb/ui-describe.js';
import { IDB_UI_DESCRIBE_DOCS } from '../tools/idb/ui-describe.js';
import { idbUiFindElementTool } from '../tools/idb/ui-find-element.js';
import { IDB_UI_FIND_ELEMENT_DOCS } from '../tools/idb/ui-find-element.js';
import { accessibilityQualityCheckTool } from '../tools/idb/accessibility-quality-check.js';
import { ACCESSIBILITY_QUALITY_CHECK_DOCS } from '../tools/idb/accessibility-quality-check.js';
import { idbListAppsTool } from '../tools/idb/list-apps.js';
import { IDB_LIST_APPS_DOCS } from '../tools/idb/list-apps.js';
import { idbAppTool } from '../tools/idb/app/index.js';
import { IDB_APP_DOCS } from '../tools/idb/app/index.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerIdbTools(server: McpServer): void {
  // idb-targets
  server.registerTool(
    'idb-targets',
    {
      description: IDB_TARGETS_DOCS,
      inputSchema: {
        operation: z.enum(['list', 'describe', 'focus', 'connect', 'disconnect']),
        udid: z.string().optional(),
        state: z.enum(['Booted', 'Shutdown']).optional(),
        type: z.enum(['device', 'simulator']).optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbTargetsRouter(args)
  );

  // idb-ui-tap
  server.registerTool(
    'idb-ui-tap',
    {
      description: IDB_UI_TAP_DOCS,
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
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiTapTool(args)
  );

  // idb-ui-input
  server.registerTool(
    'idb-ui-input',
    {
      description: IDB_UI_INPUT_DOCS,
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
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiInputTool(args)
  );

  // idb-ui-gesture
  server.registerTool(
    'idb-ui-gesture',
    {
      description: IDB_UI_GESTURE_DOCS,
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
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiGestureTool(args)
  );

  // idb-ui-describe
  server.registerTool(
    'idb-ui-describe',
    {
      description: IDB_UI_DESCRIBE_DOCS,
      inputSchema: {
        udid: z.string().optional(),
        operation: z.enum(['all', 'point']),
        x: z.number().optional(),
        y: z.number().optional(),
        screenContext: z.string().optional(),
        purposeDescription: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiDescribeTool(args)
  );

  // idb-ui-find-element
  server.registerTool(
    'idb-ui-find-element',
    {
      description: IDB_UI_FIND_ELEMENT_DOCS,
      inputSchema: {
        udid: z.string().optional(),
        query: z.string(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbUiFindElementTool(args)
  );

  // accessibility-quality-check
  server.registerTool(
    'accessibility-quality-check',
    {
      description: ACCESSIBILITY_QUALITY_CHECK_DOCS,
      inputSchema: {
        udid: z.string().optional(),
        screenContext: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => accessibilityQualityCheckTool(args)
  );

  // idb-list-apps
  server.registerTool(
    'idb-list-apps',
    {
      description: IDB_LIST_APPS_DOCS,
      inputSchema: {
        udid: z.string().optional(),
        filterType: z.enum(['system', 'user', 'internal']).optional(),
        runningOnly: z.boolean().optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbListAppsTool(args)
  );

  // idb-app
  server.registerTool(
    'idb-app',
    {
      description: IDB_APP_DOCS,
      inputSchema: {
        operation: z.enum(['install', 'uninstall', 'launch', 'terminate']),
        udid: z.string().optional(),
        bundleId: z.string().optional(),
        appPath: z.string().optional(),
        streamOutput: z.boolean().optional(),
        arguments: z.array(z.string()).optional(),
        environment: z.record(z.string()).optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => idbAppTool(args)
  );
}
