# inspect-scheme Tool

Parse and display Xcode scheme configuration

## Parameters

- **projectPath** (string, required): Path to .xcodeproj or .xcworkspace
- **scheme** (string, required): Scheme name to inspect

## Returns

Parsed scheme configuration including build, launch, and test actions

## Example

```typescript
const result = await inspectSchemeTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp"
});
```
