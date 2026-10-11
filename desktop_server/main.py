import sys
import os
import json
import threading
import socket
import subprocess
import time
import queue
from collections import deque
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
import winreg
from flask import Flask, request, jsonify, render_template_string, Response, stream_with_context
from werkzeug.serving import make_server

try:
    from pystray import Icon as TrayIcon, MenuItem as TrayMenuItem
    from PIL import Image, ImageDraw
except ImportError:
    pass

# --- APP CONFIGURATION ---
APP_NAME = "Bojro Dev Power v6"
DEFAULT_PORT = 5000
SERVICE_NAMES = ("Forge", "ComfyUI", "LM Studio")
SERVICE_KEYS = {"Forge": "forge", "ComfyUI": "comfy", "LM Studio": "lm"}
LOG_LIMIT = 2000

app_flask = Flask(__name__)

config = {
    "forge_path": "",
    "comfy_path": "",
    "lm_path": "",
    "enable_forge": True,
    "enable_comfy": True,
    "enable_lm": True,
    "start_on_boot": False,
    "minimize_to_tray": True,
    "dark_mode": True,
    "port": DEFAULT_PORT
}

# --- GLOBAL STATE ---
server_instance = None
server_thread = None
server_lock = threading.RLock()
state_lock = threading.RLock()

processes = {name: None for name in SERVICE_NAMES}
service_states = {name: "STOPPED" for name in SERVICE_NAMES}
service_locks = {name: threading.Lock() for name in SERVICE_NAMES}
log_history = {name: deque(maxlen=LOG_LIMIT) for name in SERVICE_NAMES}

log_subscribers = set()
log_subscribers_lock = threading.Lock()
tray_icon = None

api_server_status = "starting"
api_server_error = ""

# --- PATH & SYSTEM UTILITIES ---
def resource_path(relative_path):
    base_path = getattr(sys, "_MEIPASS", os.path.abspath("."))
    return os.path.join(base_path, relative_path)

def clean_path(path):
    return os.path.normpath(path) if path else ""

def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("8.8.8.8", 80))
            return connection.getsockname()[0]
    except OSError:
        return "127.0.0.1"

def kill_existing_instance_on_port(port):
    try:
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        for line in output.strip().split('\n'):
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                if pid != "0":
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True)
    except Exception:
        pass

def get_config_path():
    app_data = os.getenv("APPDATA")
    root_folder = Path(app_data) if app_data else Path.home() / "AppData" / "Roaming"
    return root_folder / "BojroDevPower-v6" / "config.json"

def get_configured_port():
    value = config.get("port", DEFAULT_PORT)
    if isinstance(value, bool):
        return DEFAULT_PORT
    try:
        port = int(value)
    except (TypeError, ValueError):
        return DEFAULT_PORT
    return port if 1 <= port <= 65535 else DEFAULT_PORT

def save_config():
    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    update_startup_registry()

def load_config_at_startup():
    config_path = get_config_path()
    legacy_path = config_path.parent.parent / "BojroResolver" / "config.json"
    if not config_path.exists() and legacy_path.exists():
        config_path = legacy_path
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                config.update(loaded)
        except Exception:
            pass
    config["port"] = get_configured_port()

def update_startup_registry():
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE) as key:
            try:
                winreg.DeleteValue(key, "Bojro Dev Power v5")
            except FileNotFoundError:
                pass
            if getattr(sys, "frozen", False) and config.get("start_on_boot"):
                cmd = f'"{sys.executable}" --startup'
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, APP_NAME)
                except FileNotFoundError:
                    pass
    except Exception:
        pass

# --- LOGGING & EVENT STREAMING ---
def publish_event(event):
    serialized = json.dumps(event, ensure_ascii=False)
    with log_subscribers_lock:
        subscribers = tuple(log_subscribers)
    for sub in subscribers:
        try:
            sub.put_nowait(serialized)
        except queue.Full:
            pass

def append_log(name, text):
    entry = {"service": name, "text": text, "time": time.time()}
    with state_lock:
        log_history[name].append(entry)
    publish_event({"type": "log", **entry})

def is_process_running(name):
    proc = processes[name]
    return proc is not None and proc.poll() is None

def service_status_snapshot():
    with state_lock:
        return {
            name: "RUNNING" if is_process_running(name) else service_states[name]
            for name in SERVICE_NAMES
        }

def monitor_output(name, process):
    try:
        if process.stdout:
            for line in iter(process.stdout.readline, ""):
                if line:
                    append_log(name, line)
    except Exception as e:
        append_log(name, f"!!! Read error: {e}\n")
    finally:
        return_code = process.wait()
        with state_lock:
            if processes[name] is process:
                processes[name] = None
                service_states[name] = "STOPPED"
        publish_event({"type": "status", "service": name, "status": "STOPPED"})
        if return_code and return_code not in (-15, 1):
            append_log(name, f"--- {name} exited with code {return_code} ---\n")

# --- PROCESS CONTROLS ---
def _start_service(name):
    key = SERVICE_KEYS[name]
    if not config.get(f"enable_{key}", True):
        append_log(name, f"--- {name} is disabled in settings ---\n")
        return
    executable = clean_path(config.get(f"{key}_path", ""))
    if not executable or not os.path.isfile(executable):
        append_log(name, f"!!! {name} path is invalid or missing.\n")
        return

    with state_lock:
        if processes[name] is not None and processes[name].poll() is None:
            append_log(name, f"--- {name} is already running ---\n")
            return
        service_states[name] = "PENDING"

    publish_event({"type": "status", "service": name, "status": "PENDING"})
    append_log(name, f">>> Starting {name}: {executable}\n")

    try:
        proc = subprocess.Popen(
            executable,
            cwd=os.path.dirname(executable) or None,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1
        )
    except Exception as e:
        with state_lock:
            service_states[name] = "STOPPED"
        publish_event({"type": "status", "service": name, "status": "STOPPED"})
        append_log(name, f"!!! Error launching {name}: {e}\n")
        return

    with state_lock:
        processes[name] = proc
        service_states[name] = "RUNNING"
    publish_event({"type": "status", "service": name, "status": "RUNNING"})

    threading.Thread(
        target=monitor_output,
        args=(name, proc),
        daemon=True,
        name=f"{name}-output"
    ).start()

def start_service(name):
    with service_locks[name]:
        _start_service(name)

def _stop_service(name):
    with state_lock:
        proc = processes[name]
        if proc is None or proc.poll() is not None:
            processes[name] = None
            service_states[name] = "STOPPED"
            already_stopped = True
        else:
            service_states[name] = "PENDING"
            already_stopped = False

    if already_stopped:
        publish_event({"type": "status", "service": name, "status": "STOPPED"})
        return

    publish_event({"type": "status", "service": name, "status": "PENDING"})
    append_log(name, f">>> Stopping {name}...\n")

    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], check=False, capture_output=True)
        else:
            proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        append_log(name, f">>> {name} terminated.\n")
    except Exception as e:
        append_log(name, f"!!! Error stopping {name}: {e}\n")
    finally:
        with state_lock:
            if processes[name] is proc:
                processes[name] = None
                service_states[name] = "STOPPED"
        publish_event({"type": "status", "service": name, "status": "STOPPED"})

def stop_service(name):
    with service_locks[name]:
        _stop_service(name)

def launch_services():
    for name in SERVICE_NAMES:
        start_service(name)

def stop_services():
    append_log("Forge", "\n>>> STOPPING ALL SERVICES...\n")
    for name in SERVICE_NAMES:
        stop_service(name)

# --- FLASK ROUTING & REST API ---
def cors_response(data=None, status=200):
    res = jsonify(data if data is not None else {"status": "ok"})
    res.status_code = status
    res.headers["Access-Control-Allow-Origin"] = "*"
    res.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    res.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return res

@app_flask.after_request
def add_cors(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    return response

@app_flask.route("/", methods=["GET"])
def index():
    return render_template_string(HTML_TEMPLATE, app_name=APP_NAME, port=get_configured_port())

@app_flask.route("/api/state", methods=["GET"])
def get_state():
    return jsonify({
        "appName": APP_NAME,
        "config": config,
        "port": get_configured_port(),
        "localIp": get_local_ip(),
        "serverStatus": api_server_status,
        "serverError": api_server_error,
        "services": service_status_snapshot()
    })

@app_flask.route("/api/pick-file", methods=["POST"])
def pick_file():
    def open_dialog():
        dialog_root = tk.Tk()
        dialog_root.withdraw()
        dialog_root.attributes('-topmost', True)
        selected = filedialog.askopenfilename(
            filetypes=[("Executables & Scripts", "*.exe;*.bat;*.cmd"), ("All Files", "*.*")]
        )
        dialog_root.destroy()
        return selected

    result_queue = queue.Queue()
    threading.Thread(target=lambda: result_queue.put(open_dialog()), daemon=True).start()
    chosen_path = result_queue.get(timeout=60)
    return jsonify({"path": clean_path(chosen_path) if chosen_path else None})

@app_flask.route("/api/logs", methods=["GET"])
def get_logs():
    with state_lock:
        entries = [e for name in SERVICE_NAMES for e in log_history[name]]
    entries.sort(key=lambda x: x["time"])
    return jsonify(entries)

@app_flask.route("/api/logs/clear", methods=["POST"])
def clear_logs():
    payload = request.get_json(silent=True) or {}
    service = payload.get("service")
    with state_lock:
        targets = (service,) if service in SERVICE_NAMES else SERVICE_NAMES
        for name in targets:
            log_history[name].clear()
    publish_event({"type": "clear", "service": service})
    return jsonify({"status": "cleared"})

@app_flask.route("/api/events", methods=["GET"])
def event_stream():
    sub = queue.Queue(maxsize=256)
    with log_subscribers_lock:
        log_subscribers.add(sub)
    @stream_with_context
    def stream():
        try:
            yield "retry: 1500\n\n"
            while True:
                try:
                    event = sub.get(timeout=15)
                    yield f"data: {event}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            with log_subscribers_lock:
                log_subscribers.discard(sub)
    return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache"})

@app_flask.route("/api/settings", methods=["POST"])
def update_settings():
    payload = request.get_json(silent=True) or {}
    for key, value in payload.items():
        if key in config:
            config[key] = clean_path(value) if key.endswith("_path") else bool(value)
    save_config()
    return jsonify({"status": "saved", "config": config})

@app_flask.route("/api/settings/port", methods=["POST"])
def update_port():
    payload = request.get_json(silent=True) or {}
    port = payload.get("port")
    if isinstance(port, int) and 1 <= port <= 65535:
        if port == get_configured_port():
            return jsonify({"status": "unchanged", "port": port})
        config["port"] = port
        save_config()
        threading.Thread(target=restart_server, daemon=True).start()
        return jsonify({"status": "restarting", "port": port})
    return jsonify({"error": "Invalid port number."}), 400

@app_flask.route("/api/services/<service_key>/<action>", methods=["POST"])
def control_service_api(service_key, action):
    key_map = {"forge": "Forge", "comfy": "ComfyUI", "lm": "LM Studio", "comfyui": "ComfyUI"}
    resolved_name = key_map.get(service_key.lower())
    if not resolved_name or action not in ("start", "stop"):
        return jsonify({"error": "Unknown service or action."}), 404
    target = start_service if action == "start" else stop_service
    threading.Thread(target=target, args=(resolved_name,), daemon=True).start()
    return jsonify({"status": "scheduled", "service": resolved_name, "action": action})

@app_flask.route("/api/services/start", methods=["POST"])
def start_all_api():
    threading.Thread(target=launch_services, daemon=True).start()
    return jsonify({"status": "scheduled"})

@app_flask.route("/api/services/stop", methods=["POST"])
def stop_all_api():
    threading.Thread(target=stop_services, daemon=True).start()
    return jsonify({"status": "scheduled"})

# --- LEGACY /POWER ENDPOINTS FOR ANDROID APP ---
def legacy_power_action(action, service=None):
    if request.method == "OPTIONS": return cors_response()
    if service is None:
        target = launch_services if action == "start" else stop_services
        result = "started_all" if action == "start" else "stopped_all"
    else:
        target = start_service if action == "start" else stop_service
        result = f"{SERVICE_KEYS[service]}_{'started' if action == 'start' else 'stopped'}"
    threading.Thread(target=target, args=() if service is None else (service,), daemon=True).start()
    return cors_response({"status": result})

@app_flask.route('/power', methods=['GET', 'POST', 'OPTIONS'])
def remote_power_on(): return legacy_power_action("start")

@app_flask.route('/power/off', methods=['POST', 'OPTIONS'])
def remote_power_off(): return legacy_power_action("stop")

@app_flask.route('/power/forge/on', methods=['POST', 'OPTIONS'])
def remote_forge_on(): return legacy_power_action("start", "Forge")

@app_flask.route('/power/forge/off', methods=['POST', 'OPTIONS'])
def remote_forge_off(): return legacy_power_action("stop", "Forge")

@app_flask.route('/power/comfy/on', methods=['POST', 'OPTIONS'])
def remote_comfy_on(): return legacy_power_action("start", "ComfyUI")

@app_flask.route('/power/comfy/off', methods=['POST', 'OPTIONS'])
def remote_comfy_off(): return legacy_power_action("stop", "ComfyUI")

@app_flask.route('/power/lm/on', methods=['POST', 'OPTIONS'])
def remote_lm_on(): return legacy_power_action("start", "LM Studio")

@app_flask.route('/power/lm/off', methods=['POST', 'OPTIONS'])
def remote_lm_off(): return legacy_power_action("stop", "LM Studio")

# --- SERVER LIFECYCLE ---
def start_server():
    global server_instance, server_thread, api_server_status, api_server_error
    port = get_configured_port()
    try:
        server = make_server("0.0.0.0", port, app_flask, threaded=True)
    except Exception as e:
        api_server_status = "error"
        api_server_error = str(e)
        return

    with server_lock:
        server_instance = server
        server_thread = threading.current_thread()

    api_server_status = "online"
    api_server_error = ""
    print(f"API server listening on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    finally:
        server.server_close()
        with server_lock:
            server_instance = None
            server_thread = None

def restart_server():
    with server_lock:
        if server_instance:
            server_instance.shutdown()
    start_server()

def run_server_thread():
    threading.Thread(target=start_server, daemon=True, name="flask-server").start()

# --- SYSTEM TRAY INTEGRATION ---
def run_tray_icon():
    global tray_icon
    image_path = resource_path("app.ico")
    try:
        image = Image.open(image_path)
    except Exception:
        image = Image.new("RGB", (64, 64), color="#18181B")
        d = ImageDraw.Draw(image)
        d.ellipse((8, 8, 56, 56), fill="#22C55E", outline="#FAFAFA")

    def open_window(_icon, _item):
        launch_edge_app(f"http://127.0.0.1:{get_configured_port()}")

    def quit_app(icon, _item):
        icon.stop()
        os._exit(0)

    tray_icon = TrayIcon(
        "BojroDevPower-v6",
        image,
        APP_NAME,
        (TrayMenuItem("Open Dashboard", open_window, default=True), TrayMenuItem("Quit", quit_app))
    )
    tray_icon.run()

# --- MS EDGE APP LAUNCHER ---
def launch_edge_app(url):
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    for exe in edge_paths:
        if os.path.exists(exe):
            subprocess.Popen([exe, f"--app={url}", "--name=BojroDevPower"])
            return True
    import webbrowser
    webbrowser.open(url)
    return False

# --- EMBEDDED VERCEL HTML/CSS/JS TEMPLATE ---
HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ app_name }}</title>
  <style>
    :root {
      font-family: Inter, "Segoe UI", sans-serif;
      color-scheme: light dark;
      --canvas: #fafafa; --card: #ffffff; --border: #e4e4e7;
      --text: #09090b; --muted: #71717a; --soft: #f4f4f5;
      --green: #22c55e; --rose: #f43f5e; --cyan: #38bdf8;
    }
    :root[data-theme="dark"] {
      --canvas: #09090b; --card: #18181b; --border: #27272a;
      --text: #fafafa; --muted: #a1a1aa; --soft: #27272a;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--canvas); color: var(--text); padding: 32px 24px; }
    button, input { font: inherit; }
    button {
      border: 1px solid var(--border); border-radius: 10px; padding: 8px 14px;
      background: var(--card); color: var(--text); cursor: pointer; transition: all 0.15s ease;
    }
    button:hover { border-color: #a1a1aa; transform: translateY(-1px); }
    button:active { transform: scale(.98); }
    input[type="text"], input[type="number"] {
      border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px;
      background: var(--canvas); color: var(--text); outline: none;
    }
    main { max-width: 1080px; margin: 0 auto; }
    .topline { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
      background: var(--text); color: var(--canvas); font-weight: 800; font-size: 18px;
    }
    h1 { margin: 0; font-size: 22px; letter-spacing: -.03em; }
    .subtitle { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
    .api-badge {
      display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border);
      padding: 8px 14px; border-radius: 99px; background: var(--card); font-size: 12px; color: var(--muted);
    }
    .dot { width: 8px; height: 8px; border-radius: 100%; display: inline-block; background: var(--rose); }
    .dot.running { background: var(--green); box-shadow: 0 0 10px #22c55eaa; }
    .dot.pending { background: #f59e0b; animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: .3; } }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card {
      background: var(--card); border: 1px solid var(--border); border-radius: 16px;
      padding: 20px; box-shadow: 0 1px 3px #00000005;
    }
    .wide { grid-column: 1 / -1; }
    h2 { margin: 0; font-size: 16px; }
    .hint { margin: 4px 0 16px; color: var(--muted); font-size: 12px; }
    .master-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .action { border: 0; color: white; font-weight: 700; padding: 12px; border-radius: 10px; }
    .start { background: #16a34a; } .start:hover { background: #15803d; }
    .stop { background: #e11d48; } .stop:hover { background: #be123c; }
    .service { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 10px; padding: 8px 0; }
    .service + .service { border-top: 1px solid var(--border); }
    .mini { padding: 5px 12px; font-size: 12px; }
    .terminal {
      height: 260px; overflow: auto; border-radius: 10px; padding: 14px;
      background: #0a0c10; color: var(--cyan); font: 12px/1.6 "Cascadia Code", Consolas, monospace;
      white-space: pre-wrap;
    }
    .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
    .tab { border: 0; background: transparent; color: var(--muted); padding: 6px 12px; }
    .tab.active { color: var(--text); background: var(--soft); font-weight: 600; }
    .path-row { display: grid; grid-template-columns: 100px 1fr auto auto auto; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--border); }
    .pref-row { display: flex; align-items: center; gap: 20px; padding-top: 12px; border-top: 1px solid var(--border); }
    .toast {
      position: fixed; right: 24px; bottom: 24px; padding: 12px 18px; border-radius: 10px;
      background: var(--card); border: 1px solid var(--border); font-size: 13px;
      box-shadow: 0 10px 25px #0002; opacity: 0; transition: opacity .2s ease; pointer-events: none;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <main>
    <header class="topline">
      <div class="brand">
        <div class="brand-mark">B</div>
        <div><h1>{{ app_name }}</h1><p class="subtitle">Local AI Services Control Center</p></div>
      </div>
      <div class="api-badge"><span id="api-dot" class="dot"></span><span id="api-label">Connecting...</span></div>
    </header>
    <section class="grid">
      <article class="card">
        <h2>Master Control</h2><p class="hint">Start or stop all enabled services simultaneously.</p>
        <div class="master-actions">
          <button class="action start" id="start-all">START ALL</button>
          <button class="action stop" id="stop-all">STOP ALL</button>
        </div>
      </article>
      <article class="card">
        <h2>Individual Controls</h2><p class="hint">Manage services individually.</p>
        <div id="services">
          <div class="service" data-service="Forge"><span>Forge</span><span class="state"><i class="dot"></i> <span>STOPPED</span></span><button class="mini start-btn">Start</button><button class="mini stop-btn">Stop</button></div>
          <div class="service" data-service="ComfyUI"><span>ComfyUI</span><span class="state"><i class="dot"></i> <span>STOPPED</span></span><button class="mini start-btn">Start</button><button class="mini stop-btn">Stop</button></div>
          <div class="service" data-service="LM Studio"><span>LM Studio</span><span class="state"><i class="dot"></i> <span>STOPPED</span></span><button class="mini start-btn">Start</button><button class="mini stop-btn">Stop</button></div>
        </div>
      </article>
      <article class="card wide">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><h2>Live Console</h2><p class="hint">Process log output stream.</p></div>
          <div><button class="mini" id="clear-logs">Clear</button><button class="mini" id="copy-logs">Copy</button></div>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="Forge">Forge</button>
          <button class="tab" data-tab="ComfyUI">ComfyUI</button>
          <button class="tab" data-tab="LM Studio">LM Studio</button>
        </div>
        <div id="terminal" class="terminal">Waiting for process output...</div>
      </article>
      <article class="card wide">
        <h2>Service Paths</h2><p class="hint">Configure local executable or script paths.</p>
        <div class="path-row" data-key="forge">
          <span>Forge</span><input type="text" id="path-forge" placeholder="Select executable path">
          <button class="mini browse-btn">Browse...</button>
          <label><input type="checkbox" id="en-forge"> On</label>
          <button class="mini save-path-btn">Save</button>
        </div>
        <div class="path-row" data-key="comfy">
          <span>ComfyUI</span><input type="text" id="path-comfy" placeholder="Select executable path">
          <button class="mini browse-btn">Browse...</button>
          <label><input type="checkbox" id="en-comfy"> On</label>
          <button class="mini save-path-btn">Save</button>
        </div>
        <div class="path-row" data-key="lm">
          <span>LM Studio</span><input type="text" id="path-lm" placeholder="Select executable path">
          <button class="mini browse-btn">Browse...</button>
          <label><input type="checkbox" id="en-lm"> On</label>
          <button class="mini save-path-btn">Save</button>
        </div>
      </article>
      <article class="card wide">
        <h2>App Preferences</h2><p class="hint">API server and startup preferences.</p>
        <div class="pref-row">
          <label>API Port: <input type="number" id="port" style="width: 80px;" value="{{ port }}"></label>
          <button class="mini" id="apply-port">Apply</button>
          <label><input type="checkbox" id="start-boot"> Start on Boot</label>
          <label><input type="checkbox" id="minimize-tray"> Minimize to Tray</label>
          <label><input type="checkbox" id="dark-mode"> Dark Mode</label>
        </div>
      </article>
    </section>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    const serviceNames = ["Forge", "ComfyUI", "LM Studio"];
    const logs = { Forge: [], ComfyUI: [], "LM Studio": [] };
    let activeTab = "Forge";

    function toast(msg) {
      const t = document.getElementById("toast"); t.textContent = msg;
      t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500);
    }

    async function req(url, method = "GET", body = null) {
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return res.json();
    }

    function renderLogs() {
      const term = document.getElementById("terminal");
      term.textContent = logs[activeTab].join("") || "Waiting for output...";
      term.scrollTop = term.scrollHeight;
    }

    function renderState(data) {
      document.documentElement.dataset.theme = data.config.dark_mode ? "dark" : "light";
      document.getElementById("dark-mode").checked = data.config.dark_mode;
      document.getElementById("start-boot").checked = data.config.start_on_boot;
      document.getElementById("minimize-tray").checked = data.config.minimize_to_tray;
      
      document.getElementById("path-forge").value = data.config.forge_path || "";
      document.getElementById("path-comfy").value = data.config.comfy_path || "";
      document.getElementById("path-lm").value = data.config.lm_path || "";
      
      document.getElementById("en-forge").checked = data.config.enable_forge;
      document.getElementById("en-comfy").checked = data.config.enable_comfy;
      document.getElementById("en-lm").checked = data.config.enable_lm;

      const online = data.serverStatus === "online";
      document.getElementById("api-dot").className = "dot " + (online ? "running" : "");
      document.getElementById("api-label").textContent = online ? `API: http://${data.localIp}:${data.port}/power` : "Offline";

      for (const name of serviceNames) {
        const row = document.querySelector(`.service[data-service="${name}"]`);
        const st = data.services[name] || "STOPPED";
        row.querySelector(".dot").className = "dot " + (st === "RUNNING" ? "running" : st === "PENDING" ? "pending" : "");
        row.querySelector(".state span").textContent = st;
      }
    }

    async function refresh() {
      try { renderState(await req("/api/state")); } catch(e){}
    }

    function initEvents() {
      const es = new EventSource("/api/events");
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === "log") {
          logs[ev.service].push(ev.text);
          if (logs[ev.service].length > 2000) logs[ev.service].shift();
          if (ev.service === activeTab) renderLogs();
        } else if (ev.type === "status") {
          refresh();
        }
      };
    }

    document.getElementById("start-all").onclick = () => req("/api/services/start", "POST");
    document.getElementById("stop-all").onclick = () => req("/api/services/stop", "POST");

    document.querySelectorAll(".service").forEach(row => {
      const key = row.dataset.service.toLowerCase().replace(" ", "");
      row.querySelector(".start-btn").onclick = () => req(`/api/services/${key}/start`, "POST");
      row.querySelector(".stop-btn").onclick = () => req(`/api/services/${key}/stop`, "POST");
    });

    document.querySelectorAll(".tab").forEach(btn => {
      btn.onclick = () => {
        document.querySelector(".tab.active").classList.remove("active");
        btn.classList.add("active");
        activeTab = btn.dataset.tab;
        renderLogs();
      };
    });

    document.querySelectorAll(".browse-btn").forEach(btn => {
      btn.onclick = async () => {
        const res = await req("/api/pick-file", "POST");
        if (res.path) {
          const input = btn.closest(".path-row").querySelector("input[type='text']");
          input.value = res.path;
        }
      };
    });

    document.querySelectorAll(".save-path-btn").forEach(btn => {
      btn.onclick = async () => {
        const row = btn.closest(".path-row");
        const key = row.dataset.key;
        await req("/api/settings", "POST", {
          [`${key}_path`]: row.querySelector("input[type='text']").value,
          [`enable_${key}`]: row.querySelector("input[type='checkbox']").checked
        });
        toast("Path saved");
        refresh();
      };
    });

    document.getElementById("apply-port").onclick = async () => {
      const port = parseInt(document.getElementById("port").value);
      const res = await req("/api/settings/port", "POST", { port });
      if (res.status === "restarting") {
        toast(`Restarting API on port ${port}...`);
        setTimeout(() => window.location.port = port, 1500);
      }
    };

    const updatePrefs = () => req("/api/settings", "POST", {
      dark_mode: document.getElementById("dark-mode").checked,
      start_on_boot: document.getElementById("start-boot").checked,
      minimize_to_tray: document.getElementById("minimize-tray").checked
    }).then(refresh);

    document.getElementById("dark-mode").onchange = updatePrefs;
    document.getElementById("start-boot").onchange = updatePrefs;
    document.getElementById("minimize-tray").onchange = updatePrefs;

    document.getElementById("clear-logs").onclick = () => { logs[activeTab] = []; renderLogs(); };
    document.getElementById("copy-logs").onclick = () => { navigator.clipboard.writeText(logs[activeTab].join("")); toast("Copied!"); };

    refresh(); initEvents();
  </script>
</body>
</html>
"""

# --- MAIN APPLICATION ENTRY ---
if __name__ == "__main__":
    load_config_at_startup()
    kill_existing_instance_on_port(get_configured_port())
    run_server_thread()

    # Launch System Tray
    threading.Thread(target=run_tray_icon, daemon=True, name="system-tray").start()

    # If launched on Windows boot, run quietly in tray without popping up Edge window
    if "--startup" not in sys.argv:
        time.sleep(0.5)
        launch_edge_app(f"http://127.0.0.1:{get_configured_port()}")

    # Keep main process alive
    while True:
        time.sleep(1)