# Forwards signed solar_meter readings from the ESP32's USB serial port to the operator service.
# The bridge only relays: the operator checks each reading's signature, so it can't alter them.
# Usage: python3 usb_bridge.py [port] [server]
#   defaults: /dev/ttyACM0  http://localhost:4100/api/meter/readings
import fcntl, json, os, select, struct, sys, termios, time, urllib.error, urllib.request

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyACM0"
SERVER = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:4100/api/meter/readings"


def set_lines(fd, dtr, rts):
    """Sets DTR and RTS together. On ESP32 boards they drive EN (reset) and GPIO0 (boot mode)."""
    bits = (termios.TIOCM_DTR if dtr else 0) | (termios.TIOCM_RTS if rts else 0)
    fcntl.ioctl(fd, termios.TIOCMSET, struct.pack("I", bits))


def run_mode_reset(fd):
    """Restarts the ESP32 into its normal program (not download mode), like esptool's hard reset."""
    set_lines(fd, dtr=False, rts=True)  # EN low: hold in reset, GPIO0 high
    time.sleep(0.1)
    set_lines(fd, dtr=False, rts=False)  # release: boots the firmware


def open_serial(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
    a = termios.tcgetattr(fd)
    a[4] = a[5] = termios.B115200
    a[2] |= termios.CLOCAL | termios.CREAD
    a[2] &= ~termios.HUPCL  # closing the port must not toggle the reset lines
    a[0] = a[1] = a[3] = 0
    termios.tcsetattr(fd, termios.TCSANOW, a)
    # Opening the port can leave the reset/boot lines in a random state; start from a clean run.
    run_mode_reset(fd)
    return fd


def post(reading):
    body = json.dumps({**reading, "source": "usb"}).encode()
    req = urllib.request.Request(SERVER, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=2) as res:
        return res.status


# The ESP32 prints a reading about every 0.7 s. This long without data means it's stuck (or still in
# download mode), so restart it into its program; after a few silent restarts, reopen the port.
STALE_SECONDS = 15
MAX_RESETS = 3


def main():
    print(f"Bridging {PORT} -> {SERVER}  (Ctrl+C to stop)")
    fd, buf, server_ok = None, b"", None
    last_data = time.monotonic()
    resets = 0
    while True:
        if fd is None:
            try:
                fd = open_serial(PORT)
                last_data = time.monotonic()
                print("ESP32 connected")
            except OSError as e:
                print(f"Waiting for ESP32 on {PORT}: {e.strerror}")
                time.sleep(2)
                continue
        try:
            ready, _, _ = select.select([fd], [], [], 1.0)
            if not ready:
                if time.monotonic() - last_data > STALE_SECONDS:
                    if resets >= MAX_RESETS:
                        raise OSError("no data after restarts")
                    resets += 1
                    print(f"No data from the ESP32, restarting it ({resets}/{MAX_RESETS})")
                    run_mode_reset(fd)
                    last_data = time.monotonic()
                continue
            chunk = os.read(fd, 4096)
            if not chunk:
                raise OSError("disconnected")
            buf += chunk
            last_data = time.monotonic()
            resets = 0
        except BlockingIOError:
            continue
        except OSError as e:
            print(f"ESP32 disconnected ({e.strerror or e}), reconnecting")
            os.close(fd)
            fd, buf = None, b""
            time.sleep(1)
            continue

        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            line = line.strip()
            if line.startswith(b"#"):
                print(line.decode(errors="replace"))
                continue
            try:
                reading = json.loads(line)
                int(reading["mv"]), int(reading["ua"]), str(reading["sig"])
            except (ValueError, KeyError, TypeError):
                continue  # partial or garbled line
            try:
                post(reading)
                if server_ok is not True:
                    print("Operator reachable, forwarding signed readings")
                server_ok = True
                print(f"  {reading['mv'] / 1000:6.3f} V  {reading['ua'] / 1000:8.3f} mA  #{reading['n']}", end="\r", flush=True)
            except urllib.error.HTTPError as e:
                print(f"\nOperator rejected reading {reading['b']}:{reading['n']}: {e.read().decode(errors='replace')}")
                continue
            except OSError as e:
                if server_ok is not False:
                    print(f"\nOperator not reachable ({e}). Is the operator service running?")
                server_ok = False


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped")
