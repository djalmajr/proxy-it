const { PORT = 3000, TARGET_SERVICE } = process.env;


const server = Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const { origin, pathname, search } = new URL(request.url);
    const startTime = Date.now();

    // Health check endpoint
    if (pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const targetService = TARGET_SERVICE;
    if (!targetService) {
      return new Response(
        JSON.stringify({
          error: "Proxy target not configured",
          message: "TARGET_SERVICE environment variable is required"
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const fullPath = `${pathname}${search}`;
    const fullUrl = `${targetService}${fullPath}`;

    // Log incoming request
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: request.method,
      origin,
      path: pathname,
      query: search,
      targetUrl: fullUrl,
      headers: Object.fromEntries(request.headers.entries())
    }));

    try {
      // Forward request as-is (transparent proxy)
      const response = await fetch(new Request(fullUrl, request));
      const duration = Date.now() - startTime;

      // Log response
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: request.method,
        targetUrl: fullUrl,
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`
      }));

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: request.method,
        targetUrl: fullUrl,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`
      }));

      return new Response(
        JSON.stringify({
          error: "Proxy request failed",
          message: error instanceof Error ? error.message : String(error)
        }),
        {
          status: 502,
          headers: { "content-type": "application/json" }
        }
      );
    }
  },
});

console.log(`🚀 Proxy server running on http://localhost:${server.port}`);
