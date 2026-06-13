import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';

// === PRESETS ===

const CITY_ALIASES = new Set(['nyc', 'sf', 'la']);

const CITY_PRESETS: Record<string, [number, number]> = {
  dublin: [53.3498, -6.2603],
  london: [51.5074, -0.1278],
  newyork: [40.7128, -74.006],
  nyc: [40.7128, -74.006],
  sanfrancisco: [37.7749, -122.4194],
  sf: [37.7749, -122.4194],
  tokyo: [35.6762, 139.6503],
  sydney: [-33.8688, 151.2093],
  paris: [48.8566, 2.3522],
  berlin: [52.52, 13.405],
  beijing: [39.9042, 116.4074],
  mumbai: [19.076, 72.8777],
  cairo: [30.0444, 31.2357],
  saopaulo: [-23.5505, -46.6333],
  losangeles: [34.0522, -118.2437],
  la: [34.0522, -118.2437],
};

const CANONICAL_CITIES = Object.keys(CITY_PRESETS).filter(k => !CITY_ALIASES.has(k));

// === TYPES ===

interface LocationArgs {
  udid?: string;
  lat?: number;
  lng?: number;
  city?: string;
  gpx?: string;
  waypoints?: string;
  speed?: number;
  clear?: boolean;
  listScenarios?: boolean;
}

// === HELPERS ===

function resolveUdid(udid?: string): string {
  return udid?.trim() || 'booted';
}

function parseWaypoints(raw: string): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const token of raw.trim().split(/\s+/)) {
    const parts = token.split(',');
    if (parts.length !== 2) {
      throw new McpError(ErrorCode.InvalidRequest, `Expected 'lat,lng', got: ${token}`);
    }
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) {
      throw new McpError(ErrorCode.InvalidRequest, `Non-numeric coordinate in: ${token}`);
    }
    pairs.push([lat, lng]);
  }
  return pairs;
}

// === TOOL IMPLEMENTATION ===

export async function simctlLocationTool(args: any) {
  const {
    udid: rawUdid,
    lat,
    lng,
    city,
    gpx,
    waypoints,
    speed = 20,
    clear,
    listScenarios,
  } = args as LocationArgs;

  try {
    // Validate exactly one action
    const actions = [
      lat !== undefined || lng !== undefined,
      city !== undefined,
      gpx !== undefined,
      waypoints !== undefined,
      clear === true,
      listScenarios === true,
    ];
    const actionCount = actions.filter(Boolean).length;

    if (actionCount === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Exactly one action is required: lat+lng, city, gpx, waypoints, clear, or listScenarios'
      );
    }
    if (actionCount > 1) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Only one action may be specified at a time: lat+lng, city, gpx, waypoints, clear, or listScenarios'
      );
    }

    // lat and lng must both be present or both absent
    if ((lat !== undefined) !== (lng !== undefined)) {
      throw new McpError(ErrorCode.InvalidRequest, 'lat and lng must both be provided together');
    }

    const udid = resolveUdid(rawUdid);

    // === coords ===
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid latitude ${lat}: must be between -90 and 90`
        );
      }
      if (lng < -180 || lng > 180) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid longitude ${lng}: must be between -180 and 180`
        );
      }

      const command = `xcrun simctl location "${udid}" set ${lat},${lng}`;
      console.error(`[simctl-location] Executing: ${command}`);
      const result = await executeCommand(command, { timeout: 15000 });
      const success = result.code === 0;

      const responseData = {
        action: 'set_coordinate',
        udid,
        success,
        message: success
          ? `Location set: ${lat}, ${lng}`
          : `location set failed: ${result.stderr || 'unknown error'}`,
        lat,
        lng,
        command,
        guidance: success
          ? [`Location set to ${lat}, ${lng}`, `Use clear to restore real GPS`]
          : [`Ensure the simulator is booted`, `Check UDID: ${udid}`],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: !success,
      };
    }

    // === city ===
    if (city !== undefined) {
      const key = city.toLowerCase().replace(/\s+/g, '');
      if (!(key in CITY_PRESETS)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown city '${city}'. Available: ${CANONICAL_CITIES.join(', ')}`
        );
      }

      const [cityLat, cityLng] = CITY_PRESETS[key];
      const command = `xcrun simctl location "${udid}" set ${cityLat},${cityLng}`;
      console.error(`[simctl-location] Executing: ${command}`);
      const result = await executeCommand(command, { timeout: 15000 });
      const success = result.code === 0;

      const responseData = {
        action: 'set_city',
        udid,
        success,
        message: success
          ? `Location set: ${city} (${cityLat}, ${cityLng})`
          : `location set failed: ${result.stderr || 'unknown error'}`,
        city,
        lat: cityLat,
        lng: cityLng,
        command,
        guidance: success
          ? [`Location set to ${city}`, `Use clear to restore real GPS`]
          : [`Ensure the simulator is booted`, `Check UDID: ${udid}`],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: !success,
      };
    }

    // === gpx ===
    if (gpx !== undefined) {
      const command = `xcrun simctl location "${udid}" run ${gpx}`;
      console.error(`[simctl-location] Executing: ${command}`);
      const result = await executeCommand(command, { timeout: 15000 });
      const success = result.code === 0;

      const responseData = {
        action: 'run_gpx',
        udid,
        success,
        message: success
          ? `GPX scenario running: ${gpx}`
          : `GPX scenario failed: ${result.stderr || 'unknown error'}`,
        scenario: gpx,
        command,
        guidance: success
          ? [`Scenario '${gpx}' is now running`, `Use listScenarios to see available scenarios`]
          : [`Use listScenarios to see available built-in scenario names`, `Check UDID: ${udid}`],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: !success,
      };
    }

    // === waypoints ===
    if (waypoints !== undefined) {
      const parsedWaypoints = parseWaypoints(waypoints);
      if (parsedWaypoints.length < 2) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'At least two waypoints are required for waypoints action'
        );
      }

      const coordArgs = parsedWaypoints.map(([wLat, wLng]) => `${wLat},${wLng}`).join(' ');
      const command = `xcrun simctl location "${udid}" start --speed=${speed} ${coordArgs}`;
      console.error(`[simctl-location] Executing: ${command}`);
      const result = await executeCommand(command, { timeout: 15000 });
      const success = result.code === 0;

      const responseData = {
        action: 'start_waypoints',
        udid,
        success,
        message: success
          ? `Waypoint route started: ${parsedWaypoints.length} points at ${speed} m/s`
          : `Waypoint route failed: ${result.stderr || 'unknown error'}`,
        waypoints: parsedWaypoints.map(([wLat, wLng]) => ({ lat: wLat, lng: wLng })),
        speed,
        command,
        guidance: success
          ? [`Route animating at ${speed} m/s`, `Use clear to stop the route`]
          : [`Ensure the simulator is booted`, `Check waypoint format: 'lat,lng lat,lng ...'`],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: !success,
      };
    }

    // === listScenarios ===
    if (listScenarios === true) {
      const command = `xcrun simctl location "${udid}" list`;
      console.error(`[simctl-location] Executing: ${command}`);
      const result = await executeCommand(command, { timeout: 15000 });
      const success = result.code === 0;
      const scenarios = success
        ? result.stdout
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean)
        : [];

      const responseData = {
        action: 'list_scenarios',
        udid,
        success,
        message: success
          ? `Found ${scenarios.length} scenarios`
          : `list scenarios failed: ${result.stderr || 'unknown error'}`,
        scenarios,
        command,
        guidance: success
          ? [`Use gpx with one of these scenario names`, `Example: gpx: "FreewayDrive"`]
          : [`Check UDID: ${udid}`],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
        isError: !success,
      };
    }

    // === clear ===
    // (clear === true must be true if we got here, since we validated exactly one action)
    const command = `xcrun simctl location "${udid}" clear`;
    console.error(`[simctl-location] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 15000 });
    const success = result.code === 0;

    const responseData = {
      action: 'clear',
      udid,
      success,
      message: success
        ? 'Location cleared'
        : `location clear failed: ${result.stderr || 'unknown error'}`,
      command,
      guidance: success
        ? [`Location simulation removed — real GPS restored`]
        : [`Ensure the simulator is booted`, `Check UDID: ${udid}`],
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      isError: !success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-location failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCS ===

export const SIMCTL_LOCATION_DOCS = `
# simctl-location

Simulate GPS location on an iOS simulator — set fixed coordinates, use city presets,
play back GPX routes, animate along waypoints, or clear the override.

## What it does

Wraps \`xcrun simctl location <udid> set/clear/start/run/list\` to give full control
over the simulated GPS position. Exactly one action must be specified per call.

## Parameters

- **udid** (string, optional): Simulator UDID. Defaults to the booted simulator if omitted.

### Actions (exactly one required)

| Action | Params | Description |
|--------|--------|-------------|
| Coordinate | \`lat\` (number) + \`lng\` (number) | Set fixed lat/lng |
| City preset | \`city\` (string) | Named city from built-in list |
| GPX scenario | \`gpx\` (string) | Run a built-in scenario by name |
| Waypoints | \`waypoints\` (string) + optional \`speed\` (number, m/s, default 20) | Animate route |
| Clear | \`clear: true\` | Remove location override |
| List scenarios | \`listScenarios: true\` | List available GPX scenario names |

## City Presets

dublin, london, newyork, sanfrancisco, tokyo, sydney, paris, berlin, beijing,
mumbai, cairo, saopaulo, losangeles

Aliases also accepted: nyc (→ newyork), sf (→ sanfrancisco), la (→ losangeles)

## Coordinate Validation

- Latitude: -90 to 90
- Longitude: -180 to 180

## Waypoints Format

Whitespace-separated \`lat,lng\` pairs. At least 2 required.

\`\`\`
"53.34,-6.26 51.50,-0.12 48.85,2.35"
\`\`\`

## Returns

JSON response with \`action\`, \`udid\`, \`success\`, \`message\`, action-specific fields, and \`guidance\`.

## Examples

### Set coordinates
\`\`\`typescript
await simctlLocationTool({ lat: 53.3498, lng: -6.2603 })
\`\`\`

### City preset
\`\`\`typescript
await simctlLocationTool({ city: 'Dublin' })
await simctlLocationTool({ city: 'nyc' })
\`\`\`

### GPX scenario
\`\`\`typescript
await simctlLocationTool({ gpx: 'FreewayDrive' })
\`\`\`

### Waypoint animation
\`\`\`typescript
await simctlLocationTool({ waypoints: '53.34,-6.26 51.50,-0.12', speed: 10 })
\`\`\`

### Clear override
\`\`\`typescript
await simctlLocationTool({ clear: true })
\`\`\`

### List scenarios
\`\`\`typescript
await simctlLocationTool({ listScenarios: true })
\`\`\`
`;

export const SIMCTL_LOCATION_DOCS_MINI =
  'Simulate GPS location on a simulator: set coords, city presets, GPX routes, waypoints, or clear. Use rtfm({ toolName: "simctl-location" }) for docs.';
