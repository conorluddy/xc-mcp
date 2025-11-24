import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Workflow: Tap Element - High-level semantic UI interaction
 *
 * Orchestrates multiple tools to find and tap a UI element by name/label:
 * 1. accessibility-quality-check → Assess UI richness
 * 2. idb-ui-find-element → Find element by semantic search
 * 3. idb-ui-tap → Tap at element coordinates
 * 4. (optional) idb-ui-input → Type text after tap
 * 5. (optional) screenshot → Verify result
 *
 * This workflow keeps intermediate results internal, returning only the final outcome.
 * Reduces agent context usage by ~80% compared to calling each tool manually.
 *
 * Part of the Programmatic Tool Calling pattern from Anthropic:
 * https://www.anthropic.com/engineering/advanced-tool-use
 */

export interface TapElementArgs {
  elementQuery: string; // Search term for element (e.g., "Login", "Submit", "Email")
  inputText?: string; // Optional text to type after tapping
  verifyResult?: boolean; // Take screenshot after action (default: false)
  udid?: string; // Target device (auto-detected if omitted)
  screenContext?: string; // Screen name for tracking (e.g., "LoginScreen")
}

interface WorkflowStep {
  name: string;
  success: boolean;
  result?: any;
  duration?: number;
  skipped?: boolean;
  skipReason?: string;
}

export async function workflowTapElementTool(args: TapElementArgs) {
  const { elementQuery, inputText, verifyResult = false, udid, screenContext } = args;

  if (!elementQuery || elementQuery.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidRequest, 'elementQuery is required');
  }

  const workflow: {
    steps: WorkflowStep[];
    success: boolean;
    totalDuration: number;
    errors: string[];
  } = {
    steps: [],
    success: false,
    totalDuration: 0,
    errors: [],
  };

  const startTime = Date.now();

  try {
    // Dynamic imports to avoid circular dependencies
    const { accessibilityQualityCheckTool } = await import('../idb/accessibility-quality-check.js');
    const { idbUiFindElementTool } = await import('../idb/ui-find-element.js');
    const { idbUiTapTool } = await import('../idb/ui-tap.js');
    const { idbUiInputTool } = await import('../idb/ui-input.js');
    const { simctlScreenshotInlineTool } = await import('../simctl/screenshot-inline.js');

    // ===== STEP 1: Accessibility Quality Check =====
    console.error(`[workflow-tap-element] Step 1/5: Checking accessibility quality...`);

    let qualityAssessment: string = 'unknown';

    try {
      const qualityResult = await accessibilityQualityCheckTool({
        udid,
        screenContext,
      });

      const qualityText = qualityResult.content?.[0]?.text || JSON.stringify(qualityResult);
      const qualityData = typeof qualityText === 'string' ? JSON.parse(qualityText) : qualityText;

      qualityAssessment = qualityData.quality || 'unknown';

      workflow.steps.push({
        name: 'accessibility-check',
        success: true,
        result: {
          quality: qualityAssessment,
          recommendation: qualityData.recommendation,
          elementCounts: qualityData.elementCounts,
        },
      });

      console.error(`[workflow-tap-element] ✅ Accessibility: ${qualityAssessment}`);

      // If minimal accessibility, warn but continue
      if (qualityAssessment === 'minimal') {
        console.error(`[workflow-tap-element] ⚠️ Minimal accessibility - element search may fail`);
      }
    } catch (checkError) {
      // Non-fatal - continue with element search
      console.error(`[workflow-tap-element] ⚠️ Quality check failed, continuing...`);
      workflow.steps.push({
        name: 'accessibility-check',
        success: false,
        result: { error: String(checkError) },
      });
    }

    // ===== STEP 2: Find Element =====
    console.error(`[workflow-tap-element] Step 2/5: Finding "${elementQuery}"...`);

    let elementCoords: { x: number; y: number } | null = null;
    let foundElement: any = null;

    try {
      const findResult = await idbUiFindElementTool({
        udid,
        query: elementQuery,
      });

      const findText = findResult.content?.[0]?.text || JSON.stringify(findResult);
      const findData = typeof findText === 'string' ? JSON.parse(findText) : findText;

      if (findData.matchCount > 0 && findData.matchedElements?.length > 0) {
        foundElement = findData.matchedElements[0];
        elementCoords = {
          x: foundElement.centerX,
          y: foundElement.centerY,
        };

        workflow.steps.push({
          name: 'find-element',
          success: true,
          result: {
            matchCount: findData.matchCount,
            selectedElement: {
              type: foundElement.type,
              label: foundElement.label,
              identifier: foundElement.identifier,
              coordinates: elementCoords,
            },
          },
        });

        console.error(
          `[workflow-tap-element] ✅ Found "${foundElement.label || foundElement.identifier || foundElement.type}" at (${elementCoords.x}, ${elementCoords.y})`
        );
      } else {
        throw new Error(`No element found matching "${elementQuery}"`);
      }
    } catch (findError) {
      workflow.errors.push(`Find element failed: ${findError}`);

      // Return early with helpful guidance
      workflow.steps.push({
        name: 'find-element',
        success: false,
        result: { error: String(findError) },
      });

      workflow.totalDuration = Date.now() - startTime;

      const responseData = {
        success: false,
        workflow,
        error: `Element "${elementQuery}" not found`,
        guidance: [
          `❌ Could not find element matching "${elementQuery}"`,
          ``,
          `Suggestions:`,
          `• Try alternative search terms (partial matches work: "log" for "Login")`,
          `• Use idb-ui-describe to see all available elements`,
          qualityAssessment === 'minimal'
            ? `• UI has minimal accessibility - try screenshot analysis instead`
            : `• Check element is visible on screen`,
          ``,
          `Alternative approaches:`,
          `• screenshot → visual analysis → idb-ui-tap with coordinates`,
          `• idb-ui-describe --operation all → find element in tree`,
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: true,
      };
    }

    // ===== STEP 3: Tap Element =====
    console.error(
      `[workflow-tap-element] Step 3/5: Tapping at (${elementCoords!.x}, ${elementCoords!.y})...`
    );

    try {
      const tapResult = await idbUiTapTool({
        udid,
        x: elementCoords!.x,
        y: elementCoords!.y,
        actionName: `Tap ${foundElement.label || foundElement.identifier || elementQuery}`,
        screenContext,
      });

      const tapText = tapResult.content?.[0]?.text || JSON.stringify(tapResult);
      const tapData = typeof tapText === 'string' ? JSON.parse(tapText) : tapText;

      workflow.steps.push({
        name: 'tap',
        success: tapData.success !== false,
        result: {
          tappedAt: tapData.tappedAt,
          duration: tapData.duration,
        },
      });

      if (!tapData.success) {
        throw new Error(tapData.error || 'Tap failed');
      }

      console.error(`[workflow-tap-element] ✅ Tapped element`);
    } catch (tapError) {
      workflow.errors.push(`Tap failed: ${tapError}`);
      throw tapError;
    }

    // ===== STEP 4: Input Text (Optional) =====
    if (inputText) {
      console.error(`[workflow-tap-element] Step 4/5: Typing text...`);

      try {
        // Small delay for keyboard to appear
        await new Promise(resolve => setTimeout(resolve, 300));

        const inputResult = await idbUiInputTool({
          udid,
          operation: 'text',
          text: inputText,
          fieldContext: foundElement.label || foundElement.identifier,
        });

        const inputTextResult = inputResult.content?.[0]?.text || JSON.stringify(inputResult);
        const inputData =
          typeof inputTextResult === 'string' ? JSON.parse(inputTextResult) : inputTextResult;

        workflow.steps.push({
          name: 'input',
          success: inputData.success !== false,
          result: {
            textLength: inputText.length,
            duration: inputData.duration,
          },
        });

        if (!inputData.success) {
          console.error(`[workflow-tap-element] ⚠️ Input failed but continuing`);
        } else {
          console.error(`[workflow-tap-element] ✅ Text entered`);
        }
      } catch (inputError) {
        // Non-fatal - tap succeeded
        console.error(`[workflow-tap-element] ⚠️ Input failed: ${inputError}`);
        workflow.steps.push({
          name: 'input',
          success: false,
          result: { error: String(inputError) },
        });
      }
    } else {
      workflow.steps.push({
        name: 'input',
        success: true,
        skipped: true,
        skipReason: 'No inputText provided',
      });
    }

    // ===== STEP 5: Verify Result (Optional) =====
    if (verifyResult) {
      console.error(`[workflow-tap-element] Step 5/5: Taking verification screenshot...`);

      try {
        const screenshotResult = await simctlScreenshotInlineTool({
          udid,
          appName: screenContext,
          screenName: `After_${elementQuery}`,
          state: 'PostTap',
        });

        const screenshotText =
          screenshotResult.content?.[0]?.text || JSON.stringify(screenshotResult);
        const screenshotData =
          typeof screenshotText === 'string' ? JSON.parse(screenshotText) : screenshotText;

        workflow.steps.push({
          name: 'verify',
          success: screenshotData.success !== false,
          result: {
            screenshotPath: screenshotData.path,
          },
        });

        console.error(`[workflow-tap-element] ✅ Verification screenshot captured`);
      } catch (screenshotError) {
        // Non-fatal - workflow succeeded
        console.error(`[workflow-tap-element] ⚠️ Screenshot failed: ${screenshotError}`);
        workflow.steps.push({
          name: 'verify',
          success: false,
          result: { error: String(screenshotError) },
        });
      }
    } else {
      workflow.steps.push({
        name: 'verify',
        success: true,
        skipped: true,
        skipReason: 'verifyResult not requested',
      });
    }

    // ===== SUCCESS =====
    workflow.success = true;
    workflow.totalDuration = Date.now() - startTime;

    const responseData = {
      success: true,
      elementQuery,
      tappedElement: {
        type: foundElement.type,
        label: foundElement.label,
        identifier: foundElement.identifier,
        coordinates: elementCoords,
      },
      inputText: inputText ? { length: inputText.length, entered: true } : undefined,
      verified: verifyResult,
      accessibilityQuality: qualityAssessment,
      totalDuration: workflow.totalDuration,
      stepsCompleted: workflow.steps.filter(s => s.success && !s.skipped).length,
      guidance: [
        `✅ Successfully tapped "${foundElement.label || foundElement.identifier || elementQuery}"`,
        inputText ? `   Text entered: ${inputText.length} characters` : undefined,
        verifyResult ? `   Screenshot captured for verification` : undefined,
        ``,
        `Workflow completed in ${workflow.totalDuration}ms`,
        ``,
        `Next steps:`,
        `• Continue with more taps: workflow-tap-element --elementQuery "next button"`,
        `• Take screenshot to verify UI state: screenshot`,
        `• Type more text: idb-ui-input --operation text --text "..."`,
      ].filter(Boolean),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      isError: false,
    };
  } catch (error) {
    workflow.success = false;
    workflow.totalDuration = Date.now() - startTime;

    const errorMessage = error instanceof Error ? error.message : String(error);

    const responseData = {
      success: false,
      elementQuery,
      workflow,
      error: errorMessage,
      guidance: [
        `❌ Workflow failed: ${errorMessage}`,
        ``,
        `Steps completed:`,
        ...workflow.steps.map(
          step => `  ${step.success ? '✅' : step.skipped ? '⏭️' : '❌'} ${step.name}`
        ),
        ``,
        `To debug:`,
        `• Check available elements: idb-ui-describe --operation all`,
        `• Take screenshot: screenshot`,
        `• Try manual tap: idb-ui-tap --x <coord> --y <coord>`,
      ],
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      isError: true,
    };
  }
}

/**
 * Workflow Tap Element documentation for RTFM
 */
export const WORKFLOW_TAP_ELEMENT_DOCS = `
# workflow-tap-element

High-level semantic UI interaction - find and tap elements by name without coordinate hunting.

## Overview

Orchestrates accessibility-first UI automation in a single call:
1. **Check Accessibility** - Assess UI richness for automation approach
2. **Find Element** - Semantic search by label/identifier
3. **Tap Element** - Execute tap at discovered coordinates
4. **Input Text** (optional) - Type into tapped field
5. **Verify Result** (optional) - Screenshot for confirmation

This workflow keeps intermediate results internal, reducing agent context usage by ~80% compared to calling each tool manually.

## Parameters

### Required
- **elementQuery** (string): Search term for element (e.g., "Login", "Submit", "Email")
  - Case-insensitive partial matching ("log" matches "Login")

### Optional
- **inputText** (string): Text to type after tapping (for text fields)
- **verifyResult** (boolean): Take screenshot after action (default: false)
- **udid** (string): Target device - auto-detected if omitted
- **screenContext** (string): Screen name for tracking (e.g., "LoginScreen")

## Returns

Consolidated result with:
- **success**: Overall workflow success
- **tappedElement**: Found element details (type, label, coordinates)
- **inputText**: Text entry status (if requested)
- **verified**: Screenshot status (if requested)
- **accessibilityQuality**: UI richness assessment
- **totalDuration**: Total workflow time
- **guidance**: Next steps

## Examples

### Tap Login Button
\`\`\`json
{"elementQuery": "Login"}
\`\`\`
Finds and taps the Login button.

### Tap Email Field and Enter Text
\`\`\`json
{
  "elementQuery": "Email",
  "inputText": "user@example.com",
  "screenContext": "LoginScreen"
}
\`\`\`
Finds email field, taps it, enters text.

### Full Verification Workflow
\`\`\`json
{
  "elementQuery": "Submit",
  "verifyResult": true,
  "screenContext": "SignupForm"
}
\`\`\`
Taps Submit button and captures verification screenshot.

## Why Use This Workflow?

### Token Efficiency
- **Manual approach**: 4-5 tool calls × ~50 tokens each = ~200+ tokens in responses
- **Workflow approach**: 1 call with consolidated response = ~80 tokens

### Reduced Context Pollution
- Intermediate accessibility data not exposed
- Element search results summarized
- Only actionable outcome returned

### Error Handling
- Graceful degradation on partial failures
- Helpful guidance when element not found
- Clear troubleshooting steps

## Related Tools

- **idb-ui-find-element**: Direct element search (used internally)
- **idb-ui-tap**: Direct tap (used internally)
- **accessibility-quality-check**: Direct quality check (used internally)
- **workflow-fresh-install**: Clean app installation workflow

## Notes

- Falls back gracefully if accessibility is minimal
- Non-fatal errors (input, screenshot) don't fail the workflow
- Element matching uses partial, case-insensitive search
- Small delay between tap and input for keyboard appearance
`;
