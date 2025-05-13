// index.js - Worker入口文件
import { graphql } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';

// 定义GraphQL Schema
const typeDefs = `
  type Query {
    modelInfo: ModelInfo
  }

  type ModelInfo {
    id: ID!
    name: String!
    description: String
    capabilities: [String]
    parameters: [Parameter]
  }

  type Parameter {
    name: String!
    description: String
    type: String!
    required: Boolean
  }

  type Mutation {
    generateCompletion(input: CompletionInput!): CompletionResponse!
    generateChat(input: ChatInput!): ChatResponse!
  }

  input CompletionInput {
    prompt: String!
    maxTokens: Int
    temperature: Float
    topP: Float
  }

  input ChatInput {
    messages: [MessageInput!]!
    temperature: Float
    maxTokens: Int
    topP: Float
  }

  input MessageInput {
    role: String!
    content: String!
  }

  type CompletionResponse {
    id: ID!
    text: String!
    finishReason: String
    usage: Usage
  }

  type ChatResponse {
    id: ID!
    message: Message!
    finishReason: String
    usage: Usage
  }

  type Message {
    role: String!
    content: String!
  }

  type Usage {
    promptTokens: Int!
    completionTokens: Int!
    totalTokens: Int!
  }
`;

// 解析器
const resolvers = {
  Query: {
    modelInfo: async (_, __, { env }) => {
      // 从环境变量获取API密钥
      const apiKey = env.DEEPSEEK_API_KEY;

      // 调用DeepSeek API获取模型信息
      const response = await fetch('https://api.deepseek.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      // 返回模型信息
      return {
        id: data.id || 'deepseek-model',
        name: data.name || 'DeepSeek AI Model',
        description: data.description || 'AI language model by DeepSeek',
        capabilities: data.capabilities || ['text-generation', 'chat'],
        parameters: data.parameters || []
      };
    }
  },

  Mutation: {
    generateCompletion: async (_, { input }, { env }) => {
      const { prompt, maxTokens, temperature, topP } = input;
      const apiKey = env.DEEPSEEK_API_KEY;

      try {
        const response = await fetch('https://api.deepseek.com/v1/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            prompt: prompt,
            max_tokens: maxTokens || 1024,
            temperature: temperature || 0.7,
            top_p: topP || 1.0
          })
        });

        const result = await response.json();

        // 如果DeepSeek API返回错误
        if (result.error) {
          throw new Error(result.error.message || 'Error from DeepSeek API');
        }

        return {
          id: result.id || crypto.randomUUID(),
          text: result.choices[0].text || '',
          finishReason: result.choices[0].finish_reason || 'stop',
          usage: {
            promptTokens: result.usage?.prompt_tokens || 0,
            completionTokens: result.usage?.completion_tokens || 0,
            totalTokens: result.usage?.total_tokens || 0
          }
        };
      } catch (error) {
        console.error('DeepSeek API error:', error);
        throw new Error(`Failed to generate completion: ${error.message}`);
      }
    },

    generateChat: async (_, { input }, { env }) => {
      const { messages, temperature, maxTokens, topP } = input;
      const apiKey = env.DEEPSEEK_API_KEY;

      try {
        // 格式化消息以符合DeepSeek API的期望
        const formattedMessages = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: formattedMessages,
            max_tokens: maxTokens || 1024,
            temperature: temperature || 0.7,
            top_p: topP || 1.0
          })
        });

        const result = await response.json();

        // 如果DeepSeek API返回错误
        if (result.error) {
          throw new Error(result.error.message || 'Error from DeepSeek API');
        }

        return {
          id: result.id || crypto.randomUUID(),
          message: {
            role: result.choices[0].message.role || 'assistant',
            content: result.choices[0].message.content || ''
          },
          finishReason: result.choices[0].finish_reason || 'stop',
          usage: {
            promptTokens: result.usage?.prompt_tokens || 0,
            completionTokens: result.usage?.completion_tokens || 0,
            totalTokens: result.usage?.total_tokens || 0
          }
        };
      } catch (error) {
        console.error('DeepSeek API error:', error);
        throw new Error(`Failed to generate chat response: ${error.message}`);
      }
    }
  }
};

// 创建可执行的Schema
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

// 处理请求
export default {
  async fetch(request, env, ctx) {
    // 处理CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // 只处理POST请求
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // 解析请求体
      const { query, variables, operationName } = await request.json();

      // 执行GraphQL查询
      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        operationName,
        contextValue: { env, request }
      });

      // 返回结果
      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        errors: [{ message: error.message }]
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};