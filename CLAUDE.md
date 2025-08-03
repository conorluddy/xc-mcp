# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XC-MCP is a Model Context Protocol (MCP) server that provides intelligent access to Xcode command-line tools with advanced caching and progressive disclosure features. It wraps `xcodebuild` and `simctl` commands to solve token overflow issues while maintaining full functionality.

## Development Commands

### Build and Development
- **npm run build** - Compile TypeScript to JavaScript in `dist/`
- **npm run dev** - Development mode with TypeScript watch compilation
- **npm start** - Start the MCP server from compiled JavaScript
- **npm run clean** - Remove `dist/` build artifacts

### Code Quality and Testing
- **npm run lint** - Run ESLint on TypeScript source files
- **npm run lint:fix** - Auto-fix ESLint issues where possible
- **npm run format** - Format code with Prettier
- **npm run format:check** - Check code formatting without making changes
- **npm test** - Run Jest test suite with ESM support
- **npm run test -- --watch** - Run tests in watch mode during development
- **npm run test -- --coverage** - Run tests with coverage report (80% threshold required)
- **npm run test -- tests/__tests__/utils/** - Run specific test directory
- **npm run test -- --testNamePattern="cache"** - Run tests matching pattern

### Git Hooks and Pre-commit
- **npm run precommit** - Run lint-staged (triggered automatically by Husky)
- **npm run prepare** - Set up Husky git hooks
- Lint-staged automatically runs prettier and eslint on staged TypeScript files

### MCP Server Testing
- **node dist/index.js** - Run the MCP server directly after building
- Use stdio transport for MCP client testing
- Validate Xcode installation is available before server operations

## Architecture Overview

### Core Components
- **src/index.ts** - Main MCP server with tool registration and request routing
- **src/tools/** - Tool implementations organized by command category:
  - `xcodebuild/` - Build, clean, list, version tools with intelligent defaults
  - `simctl/` - Simulator management with progressive disclosure
  - `cache/` - Cache management and statistics tools
- **src/state/** - Intelligent caching system:
  - `simulator-cache.ts` - Simulator state with usage tracking and performance metrics
  - `project-cache.ts` - Project configuration memory and build history
- **src/utils/** - Shared utilities for command execution and validation
- **src/types/** - TypeScript definitions for Xcode data structures

### Key Architectural Features
- **Progressive Disclosure**: Returns concise summaries by default, full details on demand via cache IDs
- **Intelligent Caching**: 3-layer cache system (simulator, project, response) with smart invalidation
- **Performance Tracking**: Boot times, build metrics, and usage patterns for optimization
- **Smart Defaults**: Learns from successful builds and suggests optimal configurations

### Cache System Design
- **SimulatorCache**: 1-hour default retention, tracks device usage and boot performance
- **ProjectCache**: Remembers successful build configurations per project
- **ResponseCache**: 30-minute retention for progressive disclosure of large outputs
- All caches support configurable timeouts and selective clearing

### Tool Response Pattern
Tools return structured responses with:
- **Success indicators** and error handling
- **Cache IDs** for progressive disclosure when outputs exceed token limits
- **Smart recommendations** based on usage history
- **Performance metrics** for optimization insights

### Critical Tool Categories and Usage Patterns
- **xcodebuild-build**: Returns `buildId` for progressive access to full logs via `xcodebuild-get-details`
- **simctl-list**: Returns `cacheId` for progressive access to full device data via `simctl-get-details`
- **Cache Management**: Four-tool ecosystem (`cache-get-stats`, `cache-set-config`, `cache-get-config`, `cache-clear`)
- **Progressive Disclosure**: Large outputs (10k+ tokens) automatically cached to prevent MCP token overflow

## Development Guidelines

### Code Style and Quality Standards
- **ESLint Configuration**: TypeScript-specific rules with Prettier integration
- **Formatting**: 100-character line width, 2-space indentation, single quotes
- **Language Target**: ES2020+ with Node.js ESM modules (`"type": "module"`)
- **Coverage Requirements**: 80% minimum across branches, functions, lines, statements
- **Pre-commit Validation**: Husky + lint-staged ensures code quality before commits
- **Unused Variables**: Prefix with underscore (`_unused`) to satisfy linting

### Error Handling
- All tools validate Xcode installation before execution
- Proper async/await patterns with comprehensive error catching
- MCP-compliant error responses with appropriate error codes

### Cache Management
- Cache validity checks based on file modification times
- Configurable cache timeouts via tool parameters
- Graceful degradation when caches are invalid or missing

### Progressive Disclosure Implementation
- Large command outputs (>token limits) automatically cached with unique IDs
- Summary responses provide key information upfront
- Detail retrieval tools allow drilling down into cached full outputs
- Smart filtering and pagination for large datasets

## Testing and Quality Assurance

### Test Architecture
- **Jest with ESM Support**: Uses `ts-jest` preset with ES module transformation
- **Test Structure**: Tests in `tests/__tests__/` mirror `src/` structure
- **Coverage Thresholds**: 80% minimum across all metrics (enforced in CI)
- **Mock Integration**: Custom MCP SDK mocks for testing tool responses
- **Test Categories**: State management, utility functions, command execution, and validation

### Running Tests
- **All Tests**: `npm test` (includes TypeScript compilation validation)
- **Specific Tests**: `npm test tests/__tests__/state/` (test specific modules)
- **Coverage Report**: `npm test -- --coverage` (generates HTML + LCOV reports)
- **Watch Mode**: `npm test -- --watch` (re-run tests on file changes)
- **Pattern Matching**: `npm test -- --testNamePattern="cache"` (test specific functionality)

### Pre-commit Requirements (Automated via Husky)
- **TypeScript Compilation**: Must compile without errors
- **ESLint Validation**: No errors (warnings acceptable, max 50 on staged files)
- **Prettier Formatting**: Automatically applied to staged files
- **Test Suite**: All tests must pass before commits
- **Git Hooks**: Husky enforces pre-commit validation automatically

### Environment Dependencies
- **macOS Required**: Xcode command-line tools must be installed
- **Xcode Validation**: Tools validate installation before execution
- **Compatibility**: Xcode 15+ and iOS simulators
- **Node.js**: Version 18+ required for ESM support

## MCP Integration

### Server Configuration
- Uses `@modelcontextprotocol/sdk` for MCP protocol compliance
- Stdio transport for Claude Desktop integration
- Tool schema definitions with comprehensive parameter validation

### Client Setup Example
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "node",
      "args": ["/path/to/xc-mcp/dist/index.js"]
    }
  }
}
```

### MCP Tool Implementation Architecture
- **Main Server**: `src/index.ts` - Tool registration, request routing, and MCP protocol handling
- **Tool Modules**: Organized by command category in `src/tools/` with consistent return patterns
- **Shared State**: Global caches in `src/state/` for cross-tool intelligence
- **Validation Layer**: `src/utils/validation.ts` validates Xcode installation before tool execution
- **Command Execution**: `src/utils/command.ts` handles secure subprocess execution with proper error handling

### Tool Categories
- **Project Discovery**: `xcodebuild-list`, `xcodebuild-showsdks`, `xcodebuild-version`
- **Build Operations**: `xcodebuild-build`, `xcodebuild-clean`, `xcodebuild-get-details`
- **Simulator Management**: `simctl-list`, `simctl-get-details`, `simctl-boot`, `simctl-shutdown`
- **Cache Management**: `cache-get-stats`, `cache-set-config`, `cache-get-config`, `cache-clear`, `list-cached-responses`