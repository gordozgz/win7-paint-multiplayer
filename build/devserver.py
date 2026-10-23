# Static server for testing app/ in a browser, with caching disabled.
import functools
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = functools.partial(NoCache, directory='app')
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
