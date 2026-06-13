import { xcodeModelInspectTool } from '../../../src/tools/analysis/model-inspect.js';
import * as path from 'path';

const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures');

// Suppress console.error during tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('xcodeModelInspectTool', () => {
  describe('Core Data parsing', () => {
    it('finds MyModel.xcdatamodeld package', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);

      expect(data.coreData).toHaveLength(1);
      expect(data.coreData[0].package).toBe('MyModel.xcdatamodeld');
      expect(data.coreData[0].currentVersion).toBe('MyModel.xcdatamodel');
    });

    it('finds Task and User entities', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const entities = data.coreData[0].entities as any[];

      const names = entities.map((e: any) => e.name);
      expect(names).toContain('Task');
      expect(names).toContain('User');
    });

    it('Task entity has title attribute — optional:true, type:String', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const taskEntity = data.coreData[0].entities.find((e: any) => e.name === 'Task');

      expect(taskEntity).toBeDefined();
      const titleAttr = taskEntity.attributes.find((a: any) => a.name === 'title');
      expect(titleAttr).toBeDefined();
      expect(titleAttr.optional).toBe(true);
      expect(titleAttr.type).toBe('String');
    });

    it('Task entity has owner relationship — toOne to User', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const taskEntity = data.coreData[0].entities.find((e: any) => e.name === 'Task');

      const ownerRel = taskEntity.relationships.find((r: any) => r.name === 'owner');
      expect(ownerRel).toBeDefined();
      expect(ownerRel.destination).toBe('User');
      expect(ownerRel.toMany).toBe(false);
    });

    it('User entity has to-many tasks relationship', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const userEntity = data.coreData[0].entities.find((e: any) => e.name === 'User');

      expect(userEntity).toBeDefined();
      const tasksRel = userEntity.relationships.find((r: any) => r.name === 'tasks');
      expect(tasksRel).toBeDefined();
      expect(tasksRel.toMany).toBe(true);
      expect(tasksRel.destination).toBe('Task');
    });

    it('User entity has name attribute (required)', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const userEntity = data.coreData[0].entities.find((e: any) => e.name === 'User');

      const nameAttr = userEntity.attributes.find((a: any) => a.name === 'name');
      expect(nameAttr).toBeDefined();
      expect(nameAttr.optional).toBe(false);
    });
  });

  describe('SwiftData parsing', () => {
    it('finds Task @Model class', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);

      const taskModel = data.swiftData.find((m: any) => m.className === 'Task');
      expect(taskModel).toBeDefined();
    });

    it('Task class has title and isCompleted properties', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const taskModel = data.swiftData.find((m: any) => m.className === 'Task');

      const propNames = taskModel.properties.map((p: any) => p.name);
      expect(propNames).toContain('title');
      expect(propNames).toContain('isCompleted');
    });

    it('Task class has subtasks as a to-many @Relationship', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const taskModel = data.swiftData.find((m: any) => m.className === 'Task');

      const subtasksRel = taskModel.relationships.find((r: any) => r.name === 'subtasks');
      expect(subtasksRel).toBeDefined();
      expect(subtasksRel.toMany).toBe(true);
    });

    it('subtasks is NOT listed as a plain property', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });
      const data = JSON.parse(result.content[0].text);
      const taskModel = data.swiftData.find((m: any) => m.className === 'Task');

      const propNames = taskModel.properties.map((p: any) => p.name);
      expect(propNames).not.toContain('subtasks');
    });
  });

  describe('structuredContent', () => {
    it('reports correct counts', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH });

      expect(result.structuredContent.coreDataModels).toBe(1);
      expect(result.structuredContent.swiftDataModels).toBe(1);
      // 2 Core Data entities + 1 SwiftData model = 3
      expect(result.structuredContent.totalEntities).toBe(3);
    });
  });

  describe('coreDataOnly / swiftDataOnly flags', () => {
    it('coreDataOnly skips SwiftData', async () => {
      const result = await xcodeModelInspectTool({
        projectPath: FIXTURES_PATH,
        coreDataOnly: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.swiftData).toHaveLength(0);
      expect(data.coreData.length).toBeGreaterThan(0);
    });

    it('swiftDataOnly skips Core Data', async () => {
      const result = await xcodeModelInspectTool({
        projectPath: FIXTURES_PATH,
        swiftDataOnly: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.coreData).toHaveLength(0);
      expect(data.swiftData.length).toBeGreaterThan(0);
    });
  });

  describe('showVersions', () => {
    it('includes versions array when showVersions:true', async () => {
      const result = await xcodeModelInspectTool({
        projectPath: FIXTURES_PATH,
        showVersions: true,
      });
      const data = JSON.parse(result.content[0].text);
      const model = data.coreData[0];
      expect(model.versions).toBeDefined();
      expect(model.versions).toHaveLength(1);
      expect(model.versions[0].isCurrent).toBe(true);
    });
  });

  describe('raw mode', () => {
    it('dumps Swift class body for Task', async () => {
      const result = await xcodeModelInspectTool({ projectPath: FIXTURES_PATH, raw: 'Task' });
      const text = result.content[0].text;
      expect(text).toContain('@Model');
      expect(text).toContain('class Task');
    });

    it('throws McpError for unknown model name', async () => {
      await expect(
        xcodeModelInspectTool({ projectPath: FIXTURES_PATH, raw: 'NonExistentModel' })
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws McpError for non-existent projectPath', async () => {
      await expect(
        xcodeModelInspectTool({ projectPath: '/this/does/not/exist/anywhere' })
      ).rejects.toThrow();
    });

    it('returns empty arrays with note when no models found', async () => {
      // Use a temp dir that has no models
      const result = await xcodeModelInspectTool({ projectPath: '/tmp' });
      const data = JSON.parse(result.content[0].text);
      expect(data.coreData).toHaveLength(0);
      expect(data.swiftData).toHaveLength(0);
      expect(data.note).toBeDefined();
    });
  });
});
