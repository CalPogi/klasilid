#pragma once
// Lines shown in the OLED's small font (6x12): at most KL_SCREEN_CHARS characters, or they are cut off (review I4).
constexpr unsigned KL_SCREEN_CHARS = 21;  // 128 px / 6 px

#define KL_MSG_FULL_IDLE "Full: connect Wi-Fi"
#define KL_MSG_KEY_REJECTED "Key not accepted"
#define KL_MSG_CLOCK "Clock not set"
#define KL_MSG_TAP_HERE "Tap your card"
#define KL_MSG_CONNECT "Connect to Wi-Fi"
#define KL_MSG_NOT_SAVED "Tap not saved"
#define KL_MSG_RESTART "Restart the reader"
