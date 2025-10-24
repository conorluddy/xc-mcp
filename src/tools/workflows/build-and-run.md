# build-and-run Tool

Orchestrates complete iOS app development workflow: build → simulator selection → boot → install → launch

## Parameters

- **projectPath** (string, required): Path to .xcodeproj or .xcworkspace
- **scheme** (string, required): Build scheme name
- **configuration** (string, optional): Build configuration (Debug/Release, default: Debug)
- **simulatorUdid** (string, optional): Specific simulator UDID, auto-selects if omitted
- **launchArguments** (array, optional): Arguments to pass to app at launch
- **environmentVariables** (object, optional): Environment variables for app
- **takeScreenshot** (boolean, optional): Capture screenshot after launch (default: false)

## Returns

Structured workflow result showing all 5 steps with individual success/failure status

## Example

```typescript
const result = await buildAndRunTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp",
  configuration: "Debug",
  launchArguments: ["--debug-mode"],
  takeScreenshot: true
});
```
