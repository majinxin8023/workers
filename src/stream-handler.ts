
// stream-handler.js - Worker中的流式处理
async function handleStreamingRequest(env, messages, params) {
  const apiKey = env.DEEPSEEK_API_KEY;

  // 创建Transform Stream来处理流式响应
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // 异步处理流式响应
  (async () => {
    try {
      const encoder = new TextEncoder();
      const response:any = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'  // 请求流式响应
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          stream: true,  // 启用流式响应
          ...params
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`DeepSeek API error: ${error.error?.message || 'Unknown error'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码数据块
        const chunk = decoder.decode(value, { stream: true });

        // 处理SSE格式的数据
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);

            // 检查结束信号
            if (data === '[DONE]') {
              await writer.write(encoder.encode('data: [DONE]\n\n'));
              continue;
            }

            try {
              // 格式化为GraphQL兼容的格式
              const parsedData = JSON.parse(data);
              const formattedChunk = {
                id: parsedData.id,
                delta: {
                  role: parsedData.choices[0].delta.role,
                  content: parsedData.choices[0].delta.content || ''
                },
                finishReason: parsedData.choices[0].finish_reason
              };

              // 写入GraphQL格式的响应块
              await writer.write(
                encoder.encode(`data: ${JSON.stringify(formattedChunk)}\n\n`)
              );
            } catch (e) {
              console.error('Error parsing streaming data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      const errorMessage = {
        error: {
          message: error.message
        }
      };

      const encoder = new TextEncoder();
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`)
      );
    } finally {
      await writer.close();
    }
  })();

  return readable;
}

export { handleStreamingRequest };