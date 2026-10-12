# Live INA219 readout from the ESP32 diag sketch. Run, then wiggle wires / cover the panel and watch.
import os, re, termios, select
fd = os.open("/dev/ttyACM0", os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
a = termios.tcgetattr(fd); a[4] = a[5] = termios.B115200
a[2] |= termios.CLOCAL | termios.CREAD; a[3] = 0; a[0] = 0; a[1] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
buf = b""
print("Watching the sensor. Press Ctrl+C to stop.\n")
while True:
    r, _, _ = select.select([fd], [], [], 0.5)
    if not r:
        continue
    try:
        buf += os.read(fd, 4096)
    except BlockingIOError:
        continue
    while b"\n" in buf:
        line, buf = buf.split(b"\n", 1)
        m = re.search(rb"shunt_raw=(-?\d+) .*bus_raw=0x[0-9A-F]+ \((\d+\.\d+) V\)", line)
        if not m:
            continue  # partial or garbled line from the serial port
        try:
            mA = int(m[1]) * 0.1      # 10 uV per step over a 0.1 ohm shunt
            v = float(m[2])
        except ValueError:
            continue
        bar = "#" * min(40, int(v * 6))
        print(f"voltage {v:5.2f} V  {bar:<40}  current {mA:6.1f} mA", flush=True)
