import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// === TYPES ===

interface CoreDataAttribute {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

interface CoreDataRelationship {
  name: string;
  destination: string;
  toMany: boolean;
  inverse?: string;
  optional: boolean;
}

interface CoreDataFetchRequest {
  name: string;
  predicate: string;
}

interface CoreDataEntity {
  name: string;
  isAbstract: boolean;
  parentEntity?: string;
  representedClass?: string;
  attributes: CoreDataAttribute[];
  relationships: CoreDataRelationship[];
  fetchRequests: CoreDataFetchRequest[];
}

interface CoreDataVersion {
  name: string;
  isCurrent: boolean;
}

interface CoreDataModel {
  package: string;
  currentVersion: string | null;
  versionCount: number;
  versions?: CoreDataVersion[];
  entities: CoreDataEntity[];
}

interface SwiftDataProperty {
  name: string;
  type: string;
}

interface SwiftDataRelationship {
  name: string;
  type: string;
  toMany: boolean;
}

interface SwiftDataModel {
  className: string;
  file: string;
  properties: SwiftDataProperty[];
  relationships: SwiftDataRelationship[];
}

interface ModelInspectResult {
  coreData: CoreDataModel[];
  swiftData: SwiftDataModel[];
  note?: string;
}

interface ModelInspectArgs {
  projectPath?: string;
  coreDataOnly?: boolean;
  swiftDataOnly?: boolean;
  showVersions?: boolean;
  raw?: string;
  verbose?: boolean;
}

// === SKIP DIRS ===

const SKIP_DIR_NAMES = new Set(['node_modules', 'DerivedData', 'Pods', 'Carthage', '.git']);

function shouldSkipEntry(entryName: string): boolean {
  return SKIP_DIR_NAMES.has(entryName) || entryName.startsWith('.');
}

// === CORE DATA PARSING ===

function findXcdatamodeld(rootPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkipEntry(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.xcdatamodeld')) {
          results.push(fullPath);
        } else {
          walk(fullPath);
        }
      }
    }
  }

  walk(rootPath);
  return results.sort();
}

function detectCurrentVersion(packagePath: string): string | null {
  const plistPath = path.join(packagePath, '.xccurrentversion');
  if (!fs.existsSync(plistPath)) return null;

  try {
    const text = fs.readFileSync(plistPath, 'utf-8');
    // Parse the XML plist to extract _XCCurrentVersionName
    const match = text.match(/<key>_XCCurrentVersionName<\/key>\s*<string>([^<]+)<\/string>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function parseContentsXml(xmlPath: string): CoreDataEntity[] {
  let text: string;
  try {
    text = fs.readFileSync(xmlPath, 'utf-8');
  } catch {
    return [];
  }

  const entities: CoreDataEntity[] = [];

  // Extract each <entity ...>...</entity> block
  const entityBlockRe = /<entity\s([^>]*)>([\s\S]*?)<\/entity>/g;
  let entityMatch: RegExpExecArray | null;

  while ((entityMatch = entityBlockRe.exec(text)) !== null) {
    const attrString = entityMatch[1];
    const body = entityMatch[2];

    const entity: CoreDataEntity = {
      name: getXmlAttr(attrString, 'name') ?? '',
      isAbstract: getXmlAttr(attrString, 'isAbstract') === 'YES',
      representedClass: getXmlAttr(attrString, 'representedClassName') ?? undefined,
      attributes: [],
      relationships: [],
      fetchRequests: [],
    };

    const parentEntity = getXmlAttr(attrString, 'parentEntity');
    if (parentEntity) entity.parentEntity = parentEntity;
    if (!entity.representedClass) delete entity.representedClass;

    // Parse <attribute .../> tags
    const attrRe = /<attribute\s([^/]*)\/?>/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(body)) !== null) {
      const a = attrMatch[1];
      entity.attributes.push({
        name: getXmlAttr(a, 'name') ?? '',
        type: getXmlAttr(a, 'attributeType') ?? '',
        optional: getXmlAttr(a, 'optional') === 'YES',
        defaultValue: getXmlAttr(a, 'defaultValueString') ?? undefined,
      });
    }

    // Parse <relationship .../> tags (may be self-closing or not)
    const relRe = /<relationship\s([^/]*)\/?>/g;
    let relMatch: RegExpExecArray | null;
    while ((relMatch = relRe.exec(body)) !== null) {
      const r = relMatch[1];
      const rel: CoreDataRelationship = {
        name: getXmlAttr(r, 'name') ?? '',
        destination: getXmlAttr(r, 'destinationEntity') ?? '',
        toMany: getXmlAttr(r, 'toMany') === 'YES',
        optional: getXmlAttr(r, 'optional') === 'YES',
      };
      const inverse = getXmlAttr(r, 'inverseName');
      if (inverse) rel.inverse = inverse;
      entity.relationships.push(rel);
    }

    // Parse <fetchRequest .../> tags
    const frRe = /<fetchRequest\s([^/]*)\/?>/g;
    let frMatch: RegExpExecArray | null;
    while ((frMatch = frRe.exec(body)) !== null) {
      const f = frMatch[1];
      entity.fetchRequests.push({
        name: getXmlAttr(f, 'name') ?? '',
        predicate: getXmlAttr(f, 'predicateString') ?? '',
      });
    }

    // Clean up undefined optional fields
    entity.attributes.forEach(a => {
      if (a.defaultValue === undefined) delete a.defaultValue;
    });

    entities.push(entity);
  }

  return entities;
}

function getXmlAttr(attrString: string, attrName: string): string | null {
  // Match name="value" or name='value'
  const re = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`);
  const match = attrString.match(re);
  return match ? match[1] : null;
}

function parseXcdatamodeld(packagePath: string, showVersions: boolean): CoreDataModel {
  const currentVersion = detectCurrentVersion(packagePath);

  let versionDirs: string[] = [];
  try {
    versionDirs = fs
      .readdirSync(packagePath)
      .filter(name => name.endsWith('.xcdatamodel'))
      .sort();
  } catch {
    // ignore
  }

  const model: CoreDataModel = {
    package: path.basename(packagePath),
    currentVersion,
    versionCount: versionDirs.length,
    entities: [],
  };

  if (showVersions) {
    model.versions = versionDirs.map(v => ({ name: v, isCurrent: v === currentVersion }));
  }

  const targetVersion = currentVersion ?? (versionDirs[0] || null);
  if (!targetVersion) return model;

  const contentsPath = path.join(packagePath, targetVersion, 'contents');
  if (!fs.existsSync(contentsPath)) return model;

  model.entities = parseContentsXml(contentsPath);
  return model;
}

// === SWIFTDATA PARSING ===

function findSwiftFiles(rootPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkipEntry(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.swift')) {
        results.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return results.sort();
}

function extractClassBody(content: string, searchFrom: number): string | null {
  const braceStart = content.indexOf('{', searchFrom);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(braceStart + 1, i);
    }
  }

  return null;
}

function extractSwiftProperties(body: string): SwiftDataProperty[] {
  const properties: SwiftDataProperty[] = [];
  const propRe = /^\s*(?:var|let)\s+(\w+)\s*:\s*([^\n{=]+?)(?:\s*=\s*[^\n]+)?$/gm;

  let match: RegExpExecArray | null;
  while ((match = propRe.exec(body)) !== null) {
    const name = match[1];
    const propType = match[2].replace(/\s*\/\/.*$/, '').trim();

    // Skip if the immediately preceding line contains @Relationship.
    // match.index is at start of leading whitespace on the current line.
    const currentLineNl = body.lastIndexOf('\n', match.index);
    const prevLineNl = body.lastIndexOf('\n', Math.max(0, currentLineNl - 1));
    const precedingLine = body.slice(prevLineNl + 1, currentLineNl);
    if (precedingLine.includes('@Relationship')) continue;

    properties.push({ name, type: propType });
  }

  return properties;
}

function extractSwiftRelationships(body: string): SwiftDataRelationship[] {
  const relationships: SwiftDataRelationship[] = [];
  const relRe = /@Relationship[^\n]*\n\s*(?:var|let)\s+(\w+)\s*:\s*([^\n{=]+)/gm;

  let match: RegExpExecArray | null;
  while ((match = relRe.exec(body)) !== null) {
    const name = match[1];
    const relType = match[2].replace(/\s*\/\/.*$/, '').trim();
    const toMany = relType.startsWith('[') || relType.includes('Array<');
    relationships.push({ name, type: relType, toMany });
  }

  return relationships;
}

function findSwiftDataModels(rootPath: string): SwiftDataModel[] {
  const models: SwiftDataModel[] = [];
  const swiftFiles = findSwiftFiles(rootPath);
  const modelPattern = /@Model\s*\n\s*(?:final\s+)?class\s+(\w+)/gm;

  for (const filePath of swiftFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    modelPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = modelPattern.exec(content)) !== null) {
      const className = match[1];
      const body = extractClassBody(content, match.index + match[0].length);
      if (body === null) continue;

      models.push({
        className,
        file: path.relative(rootPath, filePath),
        properties: extractSwiftProperties(body),
        relationships: extractSwiftRelationships(body),
      });
    }
  }

  return models;
}

// === RAW SOURCE ===

function getRawSource(projectPath: string, modelName: string): string | null {
  // Search SwiftData files first
  const swiftFiles = findSwiftFiles(projectPath);
  const modelPattern = /@Model\s*\n\s*(?:final\s+)?class\s+(\w+)/gm;

  for (const filePath of swiftFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    modelPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = modelPattern.exec(content)) !== null) {
      if (match[1] !== modelName) continue;

      const classStart = match.index;
      const braceStart = content.indexOf('{', match.index + match[0].length);
      if (braceStart === -1) continue;

      let depth = 0;
      let end = braceStart;
      for (let i = braceStart; i < content.length; i++) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }

      const relPath = path.relative(projectPath, filePath);
      return `// ${relPath}\n${content.slice(classStart, end)}`;
    }
  }

  // Search Core Data XML
  const packages = findXcdatamodeld(projectPath);
  for (const packagePath of packages) {
    const currentVersion = detectCurrentVersion(packagePath);
    let versionDirs: string[] = [];
    try {
      versionDirs = fs
        .readdirSync(packagePath)
        .filter(name => name.endsWith('.xcdatamodel'))
        .sort();
    } catch {
      continue;
    }

    const target = currentVersion ?? (versionDirs[0] || null);
    if (!target) continue;

    const contentsPath = path.join(packagePath, target, 'contents');
    if (!fs.existsSync(contentsPath)) continue;

    let xmlText: string;
    try {
      xmlText = fs.readFileSync(contentsPath, 'utf-8');
    } catch {
      continue;
    }

    const entityBlockRe = /<entity\s([^>]*)>([\s\S]*?)<\/entity>/g;
    let entityMatch: RegExpExecArray | null;
    while ((entityMatch = entityBlockRe.exec(xmlText)) !== null) {
      const name = getXmlAttr(entityMatch[1], 'name');
      if (name === modelName) {
        const packageName = path.basename(packagePath);
        return `<!-- ${packageName}/${target}/contents -->\n${entityMatch[0]}`;
      }
    }
  }

  return null;
}

// === OUTPUT FORMATTERS ===

function formatSummary(result: ModelInspectResult, verbose: boolean): string {
  const lines: string[] = [];

  for (const model of result.coreData) {
    const attrCount = model.entities.reduce((sum, e) => sum + e.attributes.length, 0);
    const relCount = model.entities.reduce((sum, e) => sum + e.relationships.length, 0);
    const versionSuffix = model.currentVersion
      ? `, current: ${model.currentVersion.replace('.xcdatamodel', '')}`
      : '';
    const versionLabel = `${model.versionCount} version${model.versionCount !== 1 ? 's' : ''}${versionSuffix}`;
    lines.push(`Core Data: ${model.package} (${versionLabel})`);
    lines.push(
      `  ${model.entities.length} entities, ${attrCount} attributes, ${relCount} relationships`
    );

    if (verbose) {
      for (const entity of model.entities) {
        const abstract = entity.isAbstract ? ' (abstract)' : '';
        const parent = entity.parentEntity ? ` extends ${entity.parentEntity}` : '';
        lines.push(
          `  Entity: ${entity.name}${abstract}${parent}` +
            ` (${entity.attributes.length} attributes, ${entity.relationships.length} relationships)`
        );

        if (entity.attributes.length > 0) {
          lines.push('    Attributes:');
          for (const attr of entity.attributes) {
            const optLabel = attr.optional ? 'optional' : 'required';
            const defLabel = attr.defaultValue ? `, default: ${attr.defaultValue}` : '';
            lines.push(`      - ${attr.name}: ${attr.type} (${optLabel}${defLabel})`);
          }
        }

        if (entity.relationships.length > 0) {
          lines.push('    Relationships:');
          for (const rel of entity.relationships) {
            const card = rel.toMany ? 'toMany' : 'toOne';
            const inv = rel.inverse ? `, inverse: ${rel.inverse}` : '';
            lines.push(`      - ${rel.name}: ${rel.destination} (${card}${inv})`);
          }
        }
      }
    }
  }

  if (result.swiftData.length > 0) {
    const count = result.swiftData.length;
    const names = result.swiftData.map(m => m.className).join(', ');
    lines.push(`SwiftData: ${count} @Model class${count !== 1 ? 'es' : ''} (${names})`);

    if (verbose) {
      for (const model of result.swiftData) {
        lines.push(
          `  @Model ${model.className} (${model.properties.length} properties, ${model.relationships.length} relationships)`
        );
        lines.push(`    File: ${model.file}`);
        for (const prop of model.properties) {
          lines.push(`    - ${prop.name}: ${prop.type}`);
        }
        for (const rel of model.relationships) {
          const card = rel.toMany ? 'toMany' : 'toOne';
          lines.push(`    @Relationship ${rel.name}: ${rel.type} (${card})`);
        }
      }
    }
  }

  if (result.note) lines.push(result.note);

  return lines.join('\n');
}

// === MAIN TOOL EXPORT ===

/**
 * Inspect Core Data .xcdatamodeld packages and SwiftData @Model classes from project files.
 *
 * Examples:
 * - Inspect all models: projectPath: "/path/to/MyApp"
 * - Core Data only: projectPath: "/path/to/MyApp", coreDataOnly: true
 * - SwiftData only: projectPath: "/path/to/MyApp", swiftDataOnly: true
 * - Show version history: projectPath: "/path/to/MyApp", showVersions: true
 * - Dump raw source: projectPath: "/path/to/MyApp", raw: "Task"
 * - Verbose output: projectPath: "/path/to/MyApp", verbose: true
 *
 * Pure file analysis — no simulator or build required.
 *
 * **Full documentation:** See rtfm({ toolName: "xcode-model-inspect" }) for detailed parameters and examples
 */
export async function xcodeModelInspectTool(args: any) {
  const {
    projectPath = '.',
    coreDataOnly = false,
    swiftDataOnly = false,
    showVersions = false,
    raw,
    verbose = false,
  } = args as ModelInspectArgs;

  try {
    const resolvedPath = path.resolve(projectPath);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Project path not found or not a directory: ${resolvedPath}`
      );
    }

    // Raw mode: dump named model source
    if (raw) {
      const source = getRawSource(resolvedPath, raw);
      if (!source) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Model '${raw}' not found in project at ${resolvedPath}`
        );
      }
      return {
        content: [{ type: 'text' as const, text: source }],
        structuredContent: { coreDataModels: 0, swiftDataModels: 0, totalEntities: 0 },
      };
    }

    const result: ModelInspectResult = { coreData: [], swiftData: [] };

    if (!swiftDataOnly) {
      const packages = findXcdatamodeld(resolvedPath);
      for (const pkg of packages) {
        result.coreData.push(parseXcdatamodeld(pkg, showVersions));
      }
    }

    if (!coreDataOnly) {
      result.swiftData = findSwiftDataModels(resolvedPath);
    }

    const hasModels = result.coreData.length > 0 || result.swiftData.length > 0;
    if (!hasModels) {
      result.note = 'No Core Data or SwiftData models found in the specified project path.';
    }

    const totalEntities =
      result.coreData.reduce((sum, m) => sum + m.entities.length, 0) + result.swiftData.length;

    const summaryText = formatSummary(result, verbose);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ ...result, summary: summaryText }, null, 2),
        },
      ],
      structuredContent: {
        coreDataModels: result.coreData.length,
        swiftDataModels: result.swiftData.length,
        totalEntities,
      },
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `xcode-model-inspect failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCUMENTATION ===

export const XCODE_MODEL_INSPECT_DOCS = `
# xcode-model-inspect

Inspect Core Data .xcdatamodeld packages and SwiftData @Model classes from project source files.
Pure file analysis — no simulator, no build required.

## What it does

Recursively walks the project path and extracts:

**Core Data (.xcdatamodeld)**
- Reads .xccurrentversion to determine the active model version
- Parses entity XML: names, isAbstract, parentEntity, representedClass
- Attributes: name, attributeType, optional, defaultValueString
- Relationships: name, destinationEntity, toMany, inverseName, optional
- Fetch requests: name, predicateString

**SwiftData (@Model classes)**
- Detects @Model-decorated classes via regex
- Extracts stored properties (var/let) excluding computed and @Relationship
- Extracts @Relationship declarations with toMany detection ([] or Array<>)

## Parameters

- **projectPath** (string, optional): Root of Xcode project to inspect (default: '.')
- **coreDataOnly** (boolean, optional): Skip SwiftData scanning
- **swiftDataOnly** (boolean, optional): Skip Core Data scanning
- **showVersions** (boolean, optional): Include all .xcdatamodel version entries with current flagged
- **raw** (string, optional): Dump raw source for a named model (Swift class body or Core Data entity XML)
- **verbose** (boolean, optional): Include per-entity/property breakdown in summary text

## Returns

JSON response with:
- \`coreData\`: array of parsed .xcdatamodeld packages with entities, attributes, and relationships
- \`swiftData\`: array of @Model classes with properties and relationships
- \`summary\`: compact human-readable summary text
- \`note\`: present when no models are found (not an error)

structuredContent: \`{ coreDataModels, swiftDataModels, totalEntities }\`

## Examples

### Inspect all models
\`\`\`typescript
await xcodeModelInspectTool({ projectPath: '/path/to/MyApp' })
\`\`\`

### Core Data only with version history
\`\`\`typescript
await xcodeModelInspectTool({ projectPath: '/path/to/MyApp', coreDataOnly: true, showVersions: true })
\`\`\`

### Dump raw source for a specific model
\`\`\`typescript
await xcodeModelInspectTool({ projectPath: '/path/to/MyApp', raw: 'Task' })
\`\`\`

### Verbose output
\`\`\`typescript
await xcodeModelInspectTool({ projectPath: '/path/to/MyApp', verbose: true })
\`\`\`

## Skipped Directories

node_modules, DerivedData, Pods, Carthage, .git, and any directory starting with '.'
`;

export const XCODE_MODEL_INSPECT_DOCS_MINI =
  'Inspect Core Data .xcdatamodeld packages and SwiftData @Model classes from project files. Pure file analysis, no simulator. Use rtfm({ toolName: "xcode-model-inspect" }) for docs.';
