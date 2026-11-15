#pragma once
namespace buzzer {
void begin();
void ok();       // one short beep: known card
void unknown();  // two short beeps: card not registered
void error();    // one long beep: reader full or storage error
}
