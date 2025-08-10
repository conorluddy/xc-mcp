#!/usr/bin/env node

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class MCPTester {
  constructor() {
    this.process = null;
    this.messageId = 1;
  }

  async testMCPServer() {
    console.log('🚀 Testing MCP Server Discovery...\n');
    
    try {
      // Start the MCP server process
      this.process = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stderr.on('data', (data) => {
        console.log('Server started:', data.toString());
      });

      // Send initialization request
      await this.sendRequest({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {}
          },
          clientInfo: {
            name: 'mcp-discovery-test',
            version: '1.0.0'
          }
        }
      });

      // Wait a moment for initialization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test tools/list
      console.log('📋 Testing tools/list...');
      const toolsResponse = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'tools/list'
      });

      if (toolsResponse.result && toolsResponse.result.tools) {
        console.log(`✅ Found ${toolsResponse.result.tools.length} tools:`);
        toolsResponse.result.tools.forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description.substring(0, 100)}...`);
        });
      } else {
        console.log('❌ No tools found or invalid response');
        console.log('Response:', JSON.stringify(toolsResponse, null, 2));
      }

      // Test prompts/list
      console.log('\n📝 Testing prompts/list...');
      const promptsResponse = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'prompts/list'
      });

      if (promptsResponse.result && promptsResponse.result.prompts) {
        console.log(`✅ Found ${promptsResponse.result.prompts.length} prompts:`);
        promptsResponse.result.prompts.forEach(prompt => {
          console.log(`   - ${prompt.name}: ${prompt.description}`);
          if (prompt.arguments) {
            console.log(`     Arguments: ${prompt.arguments.map(arg => `${arg.name}${arg.required ? '*' : ''}`).join(', ')}`);
          }
        });
      } else {
        console.log('❌ No prompts found or invalid response');
        console.log('Response:', JSON.stringify(promptsResponse, null, 2));
      }

      console.log('\n🎉 MCP Discovery Test Complete!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      if (this.process) {
        this.process.kill();
      }
    }
  }

  sendRequest(request) {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      
      let responseData = '';
      const onData = (data) => {
        responseData += data.toString();
        
        // Look for complete JSON-RPC response
        try {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                this.process.stdout.removeListener('data', onData);
                resolve(response);
                return;
              }
            }
          }
        } catch (e) {
          // Continue collecting data
        }
      };

      this.process.stdout.on('data', onData);
      
      // Set timeout
      setTimeout(() => {
        this.process.stdout.removeListener('data', onData);
        reject(new Error(`Timeout waiting for response to ${request.method}`));
      }, 5000);

      this.process.stdin.write(requestStr);
    });
  }
}

const tester = new MCPTester();
tester.testMCPServer().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});