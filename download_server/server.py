from http.server import SimpleHTTPRequestHandler, HTTPServer
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print("Download server running on port 3000")
HTTPServer(("0.0.0.0", 3000), SimpleHTTPRequestHandler).serve_forever()
