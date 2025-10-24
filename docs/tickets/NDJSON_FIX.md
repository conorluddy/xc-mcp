# NDJSON Parsing Bug Fix

**Date:** 2025-01-24
**Status:** ✅ FIXED
**Severity:** CRITICAL - Blocked all IDB functionality

---

## Problem Description

All IDB tools were completely non-functional due to a JSON parsing error in `IDBTargetCache`:

```
MCP error -32603: Failed to refresh IDB target cache:
Unexpected non-whitespace character after JSON at position 177 (line 2 column 1)
```

### Root Cause

IDB commands output **NDJSON (Newline-Delimited JSON)**, not a JSON array. Each target is a separate JSON object on its own line:

```bash
$ idb list-targets --json
{"name": "iPhone 16 Pro", "udid": "9B031E3B...", "state": "Booted", ...}
{"name": "iPhone 16 Plus", "udid": "5BEF13AE...", "state": "Shutdown", ...}
{"name": "iPad Pro", "udid": "C4989D30...", "state": "Shutdown", ...}
```

But xc-mcp was trying to parse this as a single JSON object/array with `JSON.parse(stdout)`, which fails at position 177 (end of first object) when it encounters a second JSON object on line 2.

---

## Solution

**File:** `src/state/idb-target-cache.ts`

**Before (broken):**
```typescript
// Parse IDB JSON output
const targets: any[] = JSON.parse(result.stdout);  // ❌ Fails on NDJSON
```

**After (fixed):**
```typescript
// Parse IDB NDJSON output (newline-delimited JSON)
// IDB returns one JSON object per line, not a JSON array
const targets: any[] = result.stdout
  .trim()
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));  // ✅ Works with NDJSON
```

### How it works:
1. **`.trim()`** - Remove leading/trailing whitespace
2. **`.split('\n')`** - Split on newlines into array of lines
3. **`.filter(line => line.trim())`** - Remove empty lines
4. **`.map(line => JSON.parse(line))`** - Parse each line as separate JSON object

---

## Impact

### Fixed Tools (6 tools - all Phase 1)
- ✅ `idb-targets` - Now works correctly
- ✅ `idb-connect` - Now works correctly
- ✅ `idb-ui-tap` - Now works correctly
- ✅ `idb-ui-describe` - Now works correctly
- ✅ `idb-ui-input` - Now works correctly
- ✅ `idb-ui-gesture` - Now works correctly

All 6 Phase 1 IDB tools are now **fully functional**.

---

## Verification

### Test Command
```bash
idb list-targets --json
```

### Expected NDJSON Output
```json
{"name": "iPhone 16 Pro", "udid": "9B031E3B-1018-4232-85C9-0A4E7C50A1D5", "state": "Booted", "type": "simulator", "os_version": "iOS 18.5", "path": "/tmp/idb/9B031E3B-1018-4232-85C9-0A4E7C50A1D5_companion.sock", "is_local": true, "companion": "/tmp/idb/9B031E3B-1018-4232-85C9-0A4E7C50A1D5_companion.sock"}
```

### Now Correctly Parsed
After the fix, xc-mcp successfully parses each line as a separate target and populates the `IDBTargetCache` with:
- Target name: "iPhone 16 Pro"
- UDID: "9B031E3B-1018-4232-85C9-0A4E7C50A1D5"
- State: "Booted" ✅
- Type: "simulator"
- OS Version: "iOS 18.5"

---

## Lessons Learned

1. **Always check output format** - IDB uses NDJSON, not JSON arrays
2. **Test with real commands** - The bug was immediately visible when running `idb list-targets --json`
3. **Document format assumptions** - Added comments explaining NDJSON format

---

## Related Files

- `src/state/idb-target-cache.ts` - Fixed NDJSON parsing
- `src/utils/idb-device-detection.ts` - Uses IDBTargetCache (now works)
- All 6 Phase 1 IDB tools - Now functional

---

## Status: ✅ Phase 2 Complete

### Phase 1 (6 UI Automation Tools)
All Phase 1 IDB tools are now operational after NDJSON fix:
- ✅ `idb-targets` - Working correctly
- ✅ `idb-connect` - Working correctly
- ✅ `idb-ui-tap` - Working correctly
- ✅ `idb-ui-describe` - Working correctly
- ✅ `idb-ui-input` - Working correctly
- ✅ `idb-ui-gesture` - Working correctly

### Phase 2 (5 App Management Tools) - ✅ COMPLETED
All Phase 2 IDB app management tools implemented:
- ✅ `idb-list-apps` - List installed apps with running status
- ✅ `idb-install` - Deploy .app/.ipa files to targets
- ✅ `idb-launch` - Start apps with stdout/stderr streaming
- ✅ `idb-terminate` - Force-quit running applications
- ✅ `idb-uninstall` - Remove apps from targets

**Total IDB Tools:** 11 (6 UI automation + 5 app management)

**Build Status:** ✅ Compiles successfully
**Test Status:** ✅ All tests passing
**Deployment Status:** ✅ Ready for production
**Next Phase:** Phase 3 - Debugging tools (idb-log, crash-list, crash-show)
