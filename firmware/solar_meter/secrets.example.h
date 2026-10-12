// Copy this file to secrets.h and fill in your values. secrets.h is git-ignored.
// The ESP32 only joins 2.4 GHz Wi-Fi networks.
#pragma once

#define WIFI_SSID ""   // leave empty to use USB only
#define WIFI_PASS ""
// Your laptop's address on the Wi-Fi, port 4100. Find it with: ip -4 addr show wlp4s0
#define SERVER_URL "http://192.168.0.105:4100/api/meter/readings"
