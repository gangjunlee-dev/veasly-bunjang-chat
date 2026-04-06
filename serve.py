import http.server
import socketserver
import os

os.chdir("/home/user/webapp")
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", 3000), http.server.SimpleHTTPRequestHandler) as httpd:
    print("Serving on 0.0.0.0:3000")
    httpd.serve_forever()
