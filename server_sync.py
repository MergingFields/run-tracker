import http.server
import socketserver
import json
import time
import os
import mimetypes

# --- CONFIGURATION ---
PORT = 8000
DIRECTORY_TO_SERVE = "." # Current directory

# --- GLOBAL STATE ---
# This holds the "Truth" of when the performance started.
# We initialize it to 0. It will be set when you visit the /admin/start URL.
SERVER_STATE = {
    "trackStartTime": 0,    # Unix Timestamp (ms)
    "isPlaying": False,     # Is the show running?
    "currentLyric": "Waiting for start...",
    "songId": "15A01"
}

class SyncHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom Handler to serve files AND handle Sync API calls.
    """

    def do_GET(self):
        # 1. Handle API Request: Get Sync Status
        if self.path.startswith("/api/sync-status.json"):
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') # Allow cross-origin for debug
            self.end_headers()
            
            # Send the current state as JSON
            self.wfile.write(json.dumps(SERVER_STATE).encode())
            return

        # 2. Handle Admin Request: START the Track
        # Visiting http://localhost:8000/admin/start resets the timer.
        elif self.path == "/admin/start":
            current_time_ms = int(time.time() * 1000)
            SERVER_STATE["trackStartTime"] = current_time_ms
            SERVER_STATE["isPlaying"] = True
            SERVER_STATE["currentLyric"] = "Show Started!"
            
            print(f"COMMAND: Track STARTED at {current_time_ms}")
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>OK: Track Started.</h1><a href='/viewer-video.html'>Go to Viewer</a>")
            return

        # 3. Handle Admin Request: STOP the Track
        elif self.path == "/admin/stop":
            SERVER_STATE["isPlaying"] = False
            SERVER_STATE["currentLyric"] = "Show Paused."
            print("COMMAND: Track STOPPED")
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>OK: Track Stopped.</h1>")
            return

        # 4. Standard File Serving (HTML, Video, etc.)
        else:
            # Clean up query parameters (remove ?songId=...) so we can find the file on disk
            path_cleaned = self.path.split('?')[0]
            
            # Check if file exists
            file_path = os.path.join(os.getcwd(), path_cleaned.strip("/"))
            
            # Default to serving the file normally
            if os.path.exists(file_path) and os.path.isfile(file_path):
                super().do_GET()
            elif path_cleaned == "/":
                 # Redirect root to viewer
                 self.send_response(301)
                 self.send_header('Location', '/viewer-video.html')
                 self.end_headers()
            else:
                # Robust Error Handling
                print(f"ERROR: 404 Not Found - {self.path}")
                self.send_error(404, "File Not Found")

# --- SERVER STARTUP ---
print("-" * 40)
print(f"Server starting on http://localhost:{PORT}")
print(f"1. Put video in: ./media/videos/15A01.mp4")
print(f"2. Open Viewer:  http://localhost:{PORT}/viewer-video.html")
print(f"3. START TRACK:  http://localhost:{PORT}/admin/start")
print("-" * 40)

# Ensure media directory exists to prevent confusion
if not os.path.exists("media/videos"):
    print("WARNING: 'media/videos' folder not found. Please create it.")

# Start the server
with socketserver.TCPServer(("", PORT), SyncHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopping...")
        httpd.server_close()