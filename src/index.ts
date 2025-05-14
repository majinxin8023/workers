/**
 * Cloudflare Worker to handle GraphQL requests and call DeepSeek API
 * Expects a POST request with a GraphQL query containing the user's message
 * Forwards the message to DeepSeek API and returns the response
 */

// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
// @ts-ignore
const DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY; // Replace with your DeepSeek API key

// Define GraphQL request body interface
interface GraphQLRequestBody {
  query: string;
  variables?: { message?: string };
}

// Define GraphQL response interface
interface GraphQLResponse {
  data?: { sendMessage: { response: string } };
  errors?: { message: string }[];
}

// Define DeepSeek API response interface
interface DeepSeekResponse {
  choices: { message: { content: string } }[];
}

/**
 * Handles incoming fetch requests
 * @param event - The fetch event
 */
addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event.request));
});

/**
 * Main request handler
 * Only accepts POST requests with GraphQL content
 * @param request - The incoming request
 * @returns Response - The response
 */
async function handleRequest(request: Request): Promise<Response> {
  // Ensure the request is a POST
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Parse the GraphQL request body
    const body: GraphQLRequestBody = await request.json();
    const { query, variables } = body;

    // Validate GraphQL query
    if (!query || !query.includes('sendMessage')) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Invalid GraphQL query' }] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract message from variables
    const message = variables?.message;
    if (!message) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Message is required' }] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call DeepSeek API
    const deepSeekResponse = await callDeepSeekAPI(message);

    // Format GraphQL response
    const response: GraphQLResponse = {
      data: { sendMessage: { response: deepSeekResponse } },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ errors: [{ message: `Server error: ${error.message}` }] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Calls the DeepSeek API with the user's message
 * @param message - The user's input message
 * @returns Promise<string> - The response from DeepSeek
 */
async function callDeepSeekAPI(message: string): Promise<string> {
  const payload = {
    model: 'deepseek-r1',
    messages: [{ role: 'user', content: message }],
    max_tokens: 500,
    temperature: 0.7,
  };

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.statusText}`);
  }

  const data: DeepSeekResponse = await response.json();
  return data.choices[0]?.message?.content || 'No response from DeepSeek';
}