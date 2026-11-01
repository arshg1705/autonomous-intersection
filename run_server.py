#!/usr/bin/env python3
"""
Autonomous Intersection Simulation Local HTTP Server
Launches local web server and opens simulation in browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching headers for smooth Three.js asset loading
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    server_address = ("", PORT)
    try:
        httpd = socketserver.TCPServer(server_address, QuietHandler)
    except OSError:
        # If port 8000 is taken, try 8080
        httpd = socketserver.TCPServer(("", 8080), QuietHandler)
        print("Port 8000 in use, using port 8080 instead.")

    port = httpd.server_address[1]
    url = f"http://localhost:{port}"

    print("=" * 70)
    print("🚦 AUTONOMOUS INTERSECTION: LLM-DRIVEN MULTI-AGENT TRAFFIC CONTROL")
    print("=" * 70)
    print(f"🚀 Simulation Server running at: {url}")
    print("✨ Features:")
    print("  • 20 Autonomous Vehicles navigating a 4-way intersection")
    print("  • Single batch LLM API call per tick with structured JSON")
    print("  • Strict local observability (zero global x,y coordinates in prompts)")
    print("  • Dual 3D WebGL (Three.js) and 2D Canvas Radar views")
    print("  • Zero collisions guaranteed via rigorous OBB SAT physics")
    print("  • Support for Gemini 2.0 Flash, Groq, OpenAI, Ollama & Offline Reasoner")
    print("=" * 70)
    print("Press Ctrl+C to stop the server.\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    main()
