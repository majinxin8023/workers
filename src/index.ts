// 导入必要的模块
import { buildSchema } from "graphql";
import { graphql } from "graphql";

// 定义GraphQL schema - 描述API的结构和类型
const schema = buildSchema(`
  type Query {
    # 聊天接口 - 发送消息到DeepSeek并获取回复
    chat(message: String!): ChatResponse
    # 获取模型信息
    getModelInfo: ModelInfo
  }

  # 聊天响应类型
  type ChatResponse {
    success: Boolean!
    message: String
    reply: String
    usage: Usage
  }

  # 使用统计类型
  type Usage {
    prompt_tokens: Int
    completion_tokens: Int
    total_tokens: Int
  }

  # 模型信息类型
  type ModelInfo {
    model: String!
    description: String!
  }
`);

// 根解析器 - 处理GraphQL查询的具体逻辑
const rootResolver = {
  // 聊天功能解析器
  chat: async ({ message }, context) => {
    try {
      console.log(`收到消息：${message}`, context);
      // 从环境变量获取DeepSeek API密钥
      const apiKey = context.env.DEEPSEEK_API_KEY;

      if (!apiKey) {
        console.error("DeepSeek API密钥未配置");
        return {
          success: false,
          message: "服务器配置错误：DeepSeek API密钥未配置。请联系管理员。",
          reply: null,
          usage: null,
        };
      }

      // 调用DeepSeek API
      const response = await fetch(
        "https://api.deepseek.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "user",
                content: message,
              },
            ],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        }
      );

      // 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DeepSeek API错误: ${response.status} - ${errorText}`);
        return {
          success: false,
          message: `API请求失败: ${response.status} - ${errorText}`,
          reply: null,
          usage: null,
        };
      }

      // 解析响应数据
      const data = await response.json();

      return {
        success: true,
        message: "请求成功",
        reply: data.choices[0].message.content,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total_tokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("服务器错误:", error);
      return {
        success: false,
        message: `服务器错误: ${error.message}`,
        reply: null,
        usage: null,
      };
    }
  },

  // 获取模型信息解析器
  getModelInfo: () => {
    return {
      model: "deepseek-chat",
      description: "DeepSeek Chat模型 - 强大的对话AI助手",
    };
  },
};

// 主要的fetch事件处理器
export default {
  async fetch(request, env, ctx) {
    // 添加环境变量调试日志
    console.log("Environment variables:", {
      hasApiKey: !!env.DEEPSEEK_API_KEY,
      envKeys: Object.keys(env),
    });

    // 处理CORS预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // 获取请求的路径
    const url = new URL(request.url);

    // 处理GraphQL请求
    if (url.pathname === "/graphql" && request.method === "POST") {
      try {
        // 解析请求体
        const body = await request.json();
        const { query, variables } = body;

        // 执行GraphQL查询
        const result = await graphql({
          schema,
          source: query,
          rootValue: rootResolver,
          variableValues: variables,
          contextValue: { env }, // 传递环境变量到解析器
        });

        // 返回GraphQL响应
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        console.error("GraphQL execution error:", error);
        return new Response(
          JSON.stringify({
            errors: [{ message: error.message }],
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }
    // 404响应
    return new Response("Not Found", { status: 404 });
  },
};
