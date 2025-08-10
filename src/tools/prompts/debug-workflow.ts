import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface DebugWorkflowArgs {
  projectPath: string;
  scheme: string;
  simulator?: string;
}

export async function debugWorkflowPrompt(args: any) {
  const { projectPath, scheme, simulator } = args as DebugWorkflowArgs;

  if (!projectPath || !scheme) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'debug-workflow requires projectPath and scheme arguments'
    );
  }

  const simulatorText = simulator
    ? ` targeting simulator "${simulator}"`
    : ' (will auto-select optimal simulator)';

  return {
    description: 'iOS Debug Workflow - Complete build, install, and test cycle',
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `iOS Debug Workflow for project: ${projectPath}

🚨 **CRITICAL: After ANY code changes, you MUST REBUILD to get a FRESH INSTALL!**
🚨 **Without rebuilding, you're testing the OLD cached version = wasted time!**

**Project**: ${projectPath}
**Scheme**: ${scheme}${simulatorText}

## Essential Steps (NEVER skip these):

### 1. 🏗️ BUILD (ALWAYS FIRST)
Call \`xcodebuild-build\` with:
- projectPath: "${projectPath}"
- scheme: "${scheme}"${simulator ? `\n- destination: "platform=iOS Simulator,name=${simulator}"` : ''}

⚠️ **VALIDATION CHECKPOINT**: Build MUST succeed before proceeding!

### 2. 🔍 VALIDATE BUILD SUCCESS
- Check xcodebuild-build response for \`"success": true\`
- If build fails, fix errors and restart from step 1
- DO NOT proceed to testing with a failed build

### 3. 📱 FRESH REINSTALL (Automatic but Critical)
- App automatically REINSTALLS FRESH to simulator during successful build
- This OVERWRITES the old version with your new changes
- The fresh install happens automatically - no separate step needed
- **CRITICAL**: Without rebuilding, you'll test the OLD cached version!

### 4. 🧪 TEST YOUR CHANGES
- Launch your app on the simulator
- Test the specific changes you made
- Verify expected behavior

## 🔄 **AFTER MAKING CODE CHANGES**
**You MUST restart from Step 1 (BUILD) - never test without rebuilding!**

## ⚠️ Common Mistakes to Avoid:
❌ **FATAL ERROR**: Testing without rebuilding after code changes
❌ **FATAL ERROR**: Testing the old cached app version instead of fresh rebuild
❌ Proceeding to test after a failed build
❌ Forgetting to validate build success
❌ Assuming your code changes are active without rebuilding

## 🎯 Remember:
**REBUILD = FRESH REINSTALL = NEW CODE ACTIVE**
**NO REBUILD = OLD CACHED APP = WASTED TIME DEBUGGING**

This workflow ensures you're always testing the LATEST version of your code changes.`,
        },
      },
    ],
  };
}

export const debugWorkflowPromptDefinition = {
  name: 'debug-workflow',
  description:
    'Complete iOS debug workflow: build → install → test cycle with validation to prevent testing stale app versions',
  arguments: [
    {
      name: 'projectPath',
      description: 'Path to .xcodeproj or .xcworkspace file',
      required: true,
    },
    {
      name: 'scheme',
      description: 'Build scheme name',
      required: true,
    },
    {
      name: 'simulator',
      description: 'Target simulator (optional - will use smart defaults if not provided)',
      required: false,
    },
  ],
};
