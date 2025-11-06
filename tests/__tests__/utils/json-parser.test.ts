import { parseFlexibleJson, detectJsonFormat } from '../../../src/utils/json-parser.js';

describe('json-parser', () => {
  describe('parseFlexibleJson', () => {
    describe('JSON Array Format', () => {
      it('should parse standard JSON array', () => {
        const input = '[{"id":1,"name":"foo"},{"id":2,"name":"bar"}]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1, name: 'foo' });
        expect(result[1]).toEqual({ id: 2, name: 'bar' });
      });

      it('should parse JSON array with whitespace', () => {
        const input = '  [\n  {"id": 1},\n  {"id": 2}\n]  ';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 2 });
      });

      it('should parse empty JSON array', () => {
        const input = '[]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(0);
      });

      it('should parse single element JSON array', () => {
        const input = '[{"id":1}]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ id: 1 });
      });

      it('should parse JSON array with complex nested objects', () => {
        const input = '[{"id":1,"nested":{"key":"value"}},{"id":2,"arr":[1,2,3]}]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1, nested: { key: 'value' } });
        expect(result[1]).toEqual({ id: 2, arr: [1, 2, 3] });
      });
    });

    describe('NDJSON Format', () => {
      it('should parse standard NDJSON', () => {
        const input = '{"id":1,"name":"foo"}\n{"id":2,"name":"bar"}';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1, name: 'foo' });
        expect(result[1]).toEqual({ id: 2, name: 'bar' });
      });

      it('should parse NDJSON with empty lines', () => {
        const input = '{"id":1}\n\n{"id":2}\n\n\n{"id":3}';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 2 });
        expect(result[2]).toEqual({ id: 3 });
      });

      it('should parse NDJSON with trailing newline', () => {
        const input = '{"id":1}\n{"id":2}\n';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
      });

      it('should parse NDJSON with Windows line endings', () => {
        const input = '{"id":1}\r\n{"id":2}\r\n';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 2 });
      });

      it('should skip malformed NDJSON lines but parse valid ones', () => {
        const input = '{"id":1}\n{invalid json}\n{"id":2}';
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 2 });
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[json-parser] Failed to parse line')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('Single Object Format', () => {
      it('should wrap single JSON object in array', () => {
        const input = '{"id":1,"name":"foo"}';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ id: 1, name: 'foo' });
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array for empty string', () => {
        const result = parseFlexibleJson('');
        expect(result).toHaveLength(0);
      });

      it('should return empty array for whitespace-only string', () => {
        const result = parseFlexibleJson('   \n  \n  ');
        expect(result).toHaveLength(0);
      });

      it('should handle very long lines without crashing', () => {
        const longObject = { data: 'a'.repeat(10000) };
        const input = JSON.stringify([longObject, longObject]);
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(longObject);
      });
    });

    describe('Real-world IDB Output', () => {
      it('should parse IDB ui describe-all output (JSON array)', () => {
        // This is the actual format IDB returns
        const input =
          '[{"role":"AXButton","role_description":"button","AXLabel":"Positions","enabled":true},{"role":"AXButton","role_description":"button","AXLabel":"Submissions","enabled":true}]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('AXButton');
        expect(result[0].AXLabel).toBe('Positions');
        expect(result[1].AXLabel).toBe('Submissions');
      });

      it('should handle IDB output with complex AXFrame values', () => {
        const input =
          '[{"type":"Button","frame":"{{25, 292}, {173.66666666666666, 119.99999999999994}}","enabled":true}]';
        const result = parseFlexibleJson(input);

        expect(result).toHaveLength(1);
        expect(result[0].frame).toBe('{{25, 292}, {173.66666666666666, 119.99999999999994}}');
      });
    });
  });

  describe('detectJsonFormat', () => {
    it('should detect JSON array format', () => {
      expect(detectJsonFormat('[{"id":1}]')).toBe('array');
      expect(detectJsonFormat('[]')).toBe('array');
      expect(detectJsonFormat('  [{"id":1}]  ')).toBe('array');
    });

    it('should detect NDJSON format', () => {
      expect(detectJsonFormat('{"id":1}\n{"id":2}')).toBe('ndjson');
      expect(detectJsonFormat('{"id":1}\n{"id":2}\n{"id":3}')).toBe('ndjson');
    });

    it('should detect single object format', () => {
      expect(detectJsonFormat('{"id":1}')).toBe('single');
      expect(detectJsonFormat('  {"id":1}  ')).toBe('single');
    });

    it('should return unknown for invalid JSON', () => {
      expect(detectJsonFormat('{invalid}')).toBe('unknown');
      expect(detectJsonFormat('not json at all')).toBe('unknown');
      expect(detectJsonFormat('')).toBe('unknown');
      expect(detectJsonFormat('   ')).toBe('unknown');
    });

    it('should detect format for real IDB output', () => {
      const idbOutput = '[{"role":"AXButton","AXLabel":"Test"}]';
      expect(detectJsonFormat(idbOutput)).toBe('array');
    });
  });
});
