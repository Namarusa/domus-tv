#!/usr/bin/env python3
"""Run Domus on a Freebox Player in developer mode (Python 3 port of Free's fbx-qml-run).

Serves the tv/ folder over HTTP, asks the Player to launch it via /pub/devel
(JSON-RPC debug_qml_app) and prints the app's console here. Ctrl+C stops it.

    python tools/deploy.py                 # Player found automatically (mDNS)
    python tools/deploy.py -t 192.168.1.50 # or give the Player's IP
"""
import argparse, functools, http.server, json, os, random, select, socket, socketserver, sys, threading, time, urllib.request

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[http] " + fmt % args + "\n")


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_player(timeout=5.0):
    try:
        from zeroconf import ServiceBrowser, Zeroconf
    except ImportError:
        print("zeroconf is not installed: give the Player's IP with -t (or: pip install zeroconf)")
        return None
    found = []

    class Listener:
        def add_service(self, zc, stype, name):
            info = zc.get_service_info(stype, name)
            if info and info.addresses:
                found.append(socket.inet_ntoa(info.addresses[0]))
        def update_service(self, *a): pass
        def remove_service(self, *a): pass

    zc = Zeroconf()
    ServiceBrowser(zc, "_fbx-devel._tcp.local.", Listener())
    end = time.time() + timeout
    while not found and time.time() < end:
        time.sleep(0.1)
    zc.close()
    return found[0] if found else None


def local_ip_towards(host):
    s = socket.create_connection((host, 80), timeout=5)
    ip = s.getsockname()[0]
    s.close()
    return ip


def jsonrpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": str(random.randint(0, 9999)), "method": method, "params": params}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        rsp = json.load(r)
    if "error" in rsp:
        raise SystemExit("The Player refused the launch: %s" % rsp["error"])
    return rsp["result"]


def pump(host, port, out, stop):
    try:
        s = socket.create_connection((host, port), timeout=10)
    except OSError as e:
        out.write("(console unavailable: %s)\n" % e)
        return
    s.setblocking(False)
    while not stop.is_set():
        r, _, _ = select.select([s], [], [], 0.5)
        if r:
            try:
                data = s.recv(4096)
            except OSError:
                break
            if not data:
                break
            out.write(data.decode("utf-8", "replace"))
            out.flush()
    s.close()


def main():
    ap = argparse.ArgumentParser(description="Run Domus on a Freebox Player (developer mode)")
    ap.add_argument("-t", "--target", default="", help="Player IP (found by mDNS if omitted)")
    ap.add_argument("-p", "--port", type=int, default=8234, help="local HTTP port (default 8234)")
    ap.add_argument("-e", "--entry", default="main", help="entry point (default main)")
    a = ap.parse_args()

    saved = os.path.join(os.path.dirname(os.path.abspath(__file__)), "player.txt")
    host = a.target
    if not host and os.path.exists(saved):
        host = open(saved).read().strip()
        print("Player IP from tools/player.txt:", host)
    if not host:
        print("Looking for the Freebox Player on the network...")
        host = find_player()
    if not host:
        print("Player not found automatically (developer mode on?).")
        host = input("Adresse IP du Freebox Player : ").strip()
        if not host:
            raise SystemExit("No IP given.")
    if host and host != a.target:
        open(saved, "w").write(host + "\n")
    print("Freebox Player:", host)

    try:
        me = local_ip_towards(host)
    except OSError as e:
        raise SystemExit("Cannot reach the Player at %s (%s). Is the PC on the same network?" % (host, e))

    handler = functools.partial(NoCacheHandler, directory=APP_DIR)
    httpd = Server(("0.0.0.0", a.port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    manifest = "http://%s:%d/manifest.json" % (me, a.port)
    print("Serving", APP_DIR, "at", manifest)

    try:
        ret = jsonrpc("http://%s/pub/devel" % host, "debug_qml_app",
                      {"manifest_url": manifest, "entry_point": a.entry, "wait": False})
    except OSError as e:
        httpd.shutdown()
        raise SystemExit("The Player did not answer on /pub/devel (%s). Is developer mode on?" % e)

    print("Domus is starting on the TV. App console below; Ctrl+C to stop.\n")
    stop = threading.Event()
    for port, out in ((ret.get("stdout_port"), sys.stdout), (ret.get("stderr_port"), sys.stderr)):
        if port:
            threading.Thread(target=pump, args=(host, port, out, stop), daemon=True).start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    print("\nStopping.")
    stop.set()
    httpd.shutdown()


if __name__ == "__main__":
    main()
