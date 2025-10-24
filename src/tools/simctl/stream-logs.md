# stream-logs Tool

Real-time console log streaming from simulators

## Parameters

- **udid** (string, required): Simulator UDID
- **bundleId** (string, optional): App bundle ID to filter logs
- **predicate** (string, optional): Custom log predicate
- **duration** (number, optional): Seconds to stream (default: 10)
- **capture** (boolean, optional): Store logs (default: true)

## Returns

Real-time logs with timestamps and process information

## Example

```typescript
const result = await streamLogsTool({
  udid: "ABC-123",
  bundleId: "com.example.MyApp",
  duration: 30
});
```
