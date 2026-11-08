#!/usr/bin/env bash
# בשרת אין כרטיס קול. יוצרים "רמקול וירטואלי" ומגדירים אותו כברירת מחדל,
# כדי שהתוכנות ינגנו אליו והמשדר יקלוט ממנו.
for i in $(seq 1 30); do pactl info >/dev/null 2>&1 && break; sleep 1; done
if ! pactl list short sinks | grep -q '\bkol\b'; then
  pactl load-module module-null-sink sink_name=kol sink_properties=device.description=Kol >/dev/null
fi
pactl set-default-sink kol
exit 0
