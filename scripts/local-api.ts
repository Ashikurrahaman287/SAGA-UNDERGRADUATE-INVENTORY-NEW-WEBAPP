import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { config } from 'dotenv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

config({ path: path.resolve(process.cwd(), '.env') });

const apiRoot = path.resolve(process.cwd(), 'api');

type Route = {
  pattern: RegExp;
  keys: string[];
  modulePath: string;
};

function findTsFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTsFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

const routes: Route[] = findTsFiles(apiRoot).flatMap((modulePath) => {
  const relative = path.relative(apiRoot, modulePath).replaceAll(path.sep, '/');
  let routePath = relative.replace(/\.ts$/, '');
  if (routePath.endsWith('/index')) routePath = routePath.slice(0, -'/index'.length);
  if (!routePath) return [];

  const keys: string[] = [];
  const patternSource = routePath
    .split('/')
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        keys.push(segment.slice(1, -1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return [{
    pattern: new RegExp(`^/api/${patternSource}/?$`),
    keys,
    modulePath,
  }];
});

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const item of (header || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator > 0) {
      const name = item.slice(0, separator).trim();
      cookies[name] = decodeURIComponent(item.slice(separator + 1).trim());
    }
  }
  return cookies;
}

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', 'http://localhost:3000');
    const route = routes.find((candidate) => candidate.pattern.test(url.pathname));

    if (!route) {
      outgoing.statusCode = 404;
      outgoing.setHeader('Content-Type', 'application/json');
      outgoing.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }));
      return;
    }

    const match = route.pattern.exec(url.pathname);
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match?.[index + 1] || '');
    });

    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body: unknown = undefined;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    const headers = Object.fromEntries(
      Object.entries(incoming.headers).map(([key, value]) => [key, value]) as Array<[string, string | string[] | undefined]>,
    );

    if (headers.origin && typeof headers.origin === 'string') {
      try {
        headers.host = new URL(headers.origin).host;
      } catch {
        // Keep the request host when the Origin header is malformed.
      }
    }

    const query = {
      ...Object.fromEntries(url.searchParams.entries()),
      ...params,
    };
    const request = {
      method: incoming.method,
      url: incoming.url,
      headers,
      cookies: parseCookies(incoming.headers.cookie),
      query,
      params,
      body,
      socket: incoming.socket,
    };

    const response = {
      status(code: number) {
        outgoing.statusCode = code;
        return response;
      },
      setHeader(name: string, value: number | string | readonly string[]) {
        outgoing.setHeader(name, value as number | string | readonly string[]);
        return response;
      },
      getHeader(name: string) {
        return outgoing.getHeader(name);
      },
      json(payload: unknown) {
        if (!outgoing.headersSent) outgoing.setHeader('Content-Type', 'application/json');
        outgoing.end(JSON.stringify(payload));
      },
      end(payload?: unknown) {
        outgoing.end(payload);
      },
    };

    const module = await import(`file://${route.modulePath.replaceAll('\\', '/')}`);
    await module.default(request as unknown as VercelRequest, response as unknown as VercelResponse);
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.setHeader('Content-Type', 'application/json');
    outgoing.statusCode = 500;
    outgoing.end(JSON.stringify({
      error: { code: 'LOCAL_API_ERROR', message: 'The local API encountered an error.' },
    }));
  }
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Local API listening at http://127.0.0.1:3000');
});
