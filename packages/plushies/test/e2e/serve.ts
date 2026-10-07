/** Serve a directory over HTTP (for the e2e tests and local previews of _site). */
import {join, normalize} from 'path';

export function serveDir(dir: string, port = 0) {
  return Bun.serve({
    port,
    async fetch(request) {
      let path = normalize(decodeURIComponent(new URL(request.url).pathname));
      if (path.includes('..')) return new Response('nope', {status: 400});
      if (path.endsWith('/')) path += 'index.html';
      if (path === '/favicon.ico') return new Response(null, {status: 204});
      const file = Bun.file(join(dir, path));
      return (await file.exists()) ? new Response(file) : new Response('not found', {status: 404});
    },
  });
}

if (import.meta.main) {
  const server = serveDir(process.argv[2] ?? join(import.meta.dir, '../../_site'), Number(process.argv[3] ?? 4518));
  console.log(`serving on ${server.url}`);
}
