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
          text: `XC-MCP iOS Debug Workflow for project: ${projectPath}

🚨 **CRITICAL: After ANY code changes, you MUST REBUILD to get a FRESH INSTALL!**
🚨 **Without rebuilding, you're testing the OLD cached version = wasted time!**
🚨 **Always use XC-MCP tools - they provide intelligent caching and better error handling than raw CLI!**

**Project**: ${projectPath}
**Scheme**: ${scheme}${simulatorText}

## Essential Steps (NEVER skip these):

### 1. 🏗️ BUILD (ALWAYS FIRST) - Use XC-MCP Tool
**Call the \`xcodebuild-build\` XC-MCP tool** (NOT raw xcodebuild CLI):
- projectPath: "${projectPath}"
- scheme: "${scheme}"${simulator ? `\n- destination: "platform=iOS Simulator,name=${simulator}"` : ''}

🧠 **XC-MCP Advantage**: Intelligent caching, progressive disclosure, and build optimization!

⚠️ **VALIDATION CHECKPOINT**: Build MUST succeed before proceeding!

### 2. 🔍 VALIDATE BUILD SUCCESS  
- Check the \`xcodebuild-build\` tool response for \`"success": true\`
- If build fails, use \`xcodebuild-get-details\` tool for full error logs
- Fix errors and restart from step 1
- DO NOT proceed to testing with a failed build

### 3. 🔄 ENSURE SIMULATOR IS READY (If Needed)
- If simulator isn't running, use \`simctl-boot\` XC-MCP tool to start it
- Use \`simctl-list\` tool to see available simulators (not raw simctl!)

### 4. 📱 FRESH REINSTALL (Automatic but Critical)
- App automatically REINSTALLS FRESH to simulator during successful XC-MCP build
- This OVERWRITES the old version with your new changes
- The fresh install happens automatically during the build process
- **CRITICAL**: Without using XC-MCP build tools, you'll test the OLD cached version!

### 5. 🧪 TEST YOUR CHANGES
- Launch your app on the simulator
- Test the specific changes you made  
- Verify expected behavior

## 🔄 **AFTER MAKING CODE CHANGES**
**You MUST restart from Step 1 (XC-MCP BUILD TOOL) - never test without rebuilding!**

## ⚠️ Common Mistakes to Avoid:
❌ **FATAL ERROR**: Using raw xcodebuild CLI instead of XC-MCP tools
❌ **FATAL ERROR**: Testing without rebuilding after code changes
❌ **FATAL ERROR**: Testing the old cached app version instead of fresh rebuild
❌ Proceeding to test after a failed build
❌ Forgetting to validate build success with XC-MCP tools
❌ Assuming your code changes are active without rebuilding

## 🎯 Remember:
**XC-MCP REBUILD = FRESH REINSTALL = NEW CODE ACTIVE**
**NO XC-MCP REBUILD = OLD CACHED APP = WASTED TIME DEBUGGING**
**ALWAYS USE XC-MCP TOOLS FOR INTELLIGENT CACHING & ERROR HANDLING**

This workflow ensures you're always testing the LATEST version of your code changes using XC-MCP's intelligent tooling.`,
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
