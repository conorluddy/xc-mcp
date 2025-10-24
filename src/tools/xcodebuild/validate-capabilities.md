# validate-capabilities Tool

Check app's required permissions against Info.plist

## Parameters

- **projectPath** (string, required): Path to .xcodeproj or .xcworkspace
- **scheme** (string, required): Build scheme name
- **udid** (string, optional): Simulator UDID for permission grant suggestions

## Returns

List of required capabilities with permission grant suggestions

## Example

```typescript
const result = await validateCapabilitiesTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp",
  udid: "ABC-123"
});
```
