const { PORT = 3000, TARGET_SERVICE } = process.env;

function validateJWT(token: string): { valid: boolean; expired?: boolean; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const payload = JSON.parse(atob(parts[1]));

    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) {
        return { valid: false, expired: true };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to decode JWT' };
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const { pathname, search } = new URL(request.url);

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const userAgent = request.headers.get('user-agent');
    const xForwardedFor = request.headers.get('x-forwarded-for');
    const xForwardedHost = request.headers.get('x-forwarded-host');
    const xForwardedPort = request.headers.get('x-forwarded-port');
    const xRealIp = request.headers.get('x-real-ip');
    const xRequestId = request.headers.get('x-request-id');

    // JWT validation
    let jwtStatus: string | undefined;
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie');

    let token: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieHeader) {
      const match = cookieHeader.match(/HYPER-AUTH-TOKEN=([^;]+)/);
      if (match) token = match[1];
    }

    if (token) {
      const validation = validateJWT(token);
      if (!validation.valid) {
        jwtStatus = validation.expired ? 'expired' : (validation.error || 'invalid');
        // Log JWT issue separately for visibility
        console.warn(JSON.stringify({
          alert: 'JWT_INVALID',
          status: jwtStatus,
          path: pathname,
          method: request.method,
          ...(xRealIp && { xRealIp }),
          ...(xRequestId && { xRequestId }),
        }));
      }
    }

    const context = {
      path: pathname,
      ...(search && { query: search }),
      ...(referer && { referer }),
      ...(origin && { origin }),
      ...(xForwardedFor && { xForwardedFor }),
      ...(xForwardedHost && { xForwardedHost }),
      ...(xForwardedPort && { xForwardedPort }),
      ...(xRealIp && { xRealIp }),
      ...(xRequestId && { xRequestId }),
      ...(userAgent && { userAgent }),
      ...(jwtStatus && { jwtStatus }),
    }

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

    const startTime = Date.now();

    try {
      // Forward request as-is (transparent proxy)
      const fullUrl = `${targetService}${pathname}${search}`;
      const response = await fetch(new Request(fullUrl, request));
      const duration = Date.now() - startTime;
      const contentType = response.headers.get('content-type');

      // Log response
      console.log(JSON.stringify({
        method: request.method,
        status: response.status,
        duration: `${duration}ms`,
        ...context,
        ...(contentType && { contentType }),
      }));

      // Fix: Bun auto-decompresses the body but keeps content-encoding header
      // This causes ERR_CONTENT_DECODING_FAILED in browsers
      // Remove content-encoding header to match the decompressed body
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(JSON.stringify({
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        ...context,
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
