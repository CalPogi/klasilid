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

// The animated screen (plan 8): capitals in the 5 x 8 label font, at most 24 letters (124 px). KL_DOT is "·" in UTF-8.
#define KL_DOT "\xC2\xB7"
#define KL_MSG_BTN_TAP "TAP YOUR CARD"
#define KL_MSG_BTN_NO_WIFI "NO WI-FI " KL_DOT " TAPS KEPT"
#define KL_MSG_BTN_CLOCK "CLOCK NOT SET"
#define KL_MSG_BTN_KEY "KEY NOT ACCEPTED"
#define KL_MSG_BAND_UNKNOWN "SHOW YOUR ADVISER"
#define KL_MSG_BAND_CLOCK "SAVED " KL_DOT " CHECK THE TIME"
#define KL_MSG_BAND_FULL "CONNECT TO WI-FI"
#define KL_MSG_BAND_STORAGE "RESTART THE READER"
