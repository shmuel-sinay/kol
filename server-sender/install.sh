#!/usr/bin/env bash
# מתקין את משדר הקול על שרת Ubuntu (נבדק על 24.04, מתאים גם ל-ARM64).
# הרצה מתוך תיקיית המאגר:  sudo KOL_KEY=<קוד> bash server-sender/install.sh
set -euo pipefail

KOL_USER="${KOL_USER:-ubuntu}"          # המשתמש ששולחן העבודה המרוחק רץ תחתיו
KOL_KEY="${KOL_KEY:?צריך להגדיר KOL_KEY}"
KOL_ROOM="${KOL_ROOM:-main}"
KOL_URL="${KOL_URL:-wss://kol-audio.onrender.com/ws}"
UID_N="$(id -u "$KOL_USER")"
RUNDIR="/run/user/$UID_N"
HERE="$(cd "$(dirname "$0")" && pwd)"
as_user() { sudo -u "$KOL_USER" XDG_RUNTIME_DIR="$RUNDIR" "$@"; }

echo "== התקנת חבילות"
apt-get update -qq
apt-get install -y -qq pulseaudio-utils >/dev/null
command -v node >/dev/null || apt-get install -y -qq nodejs npm >/dev/null
command -v npm >/dev/null || apt-get install -y -qq npm >/dev/null

echo "== שרת קול למשתמש $KOL_USER"
loginctl enable-linger "$KOL_USER"         # שרת הקול רץ גם בלי כניסה פעילה
systemctl start "user@$UID_N.service"
for i in $(seq 1 20); do [ -d "$RUNDIR" ] && break; sleep 0.5; done
if as_user pactl info >/dev/null 2>&1; then
  echo "כבר קיים שרת קול – משתמשים בו"
else
  apt-get install -y -qq pipewire pipewire-pulse wireplumber >/dev/null
  as_user systemctl --user enable --now pipewire.socket pipewire-pulse.socket wireplumber.service
fi

# כל תוכנה בשרת (גם כאלה שהופעלו בלי XDG_RUNTIME_DIR) תנגן לאותו שרת קול
mkdir -p /etc/pulse/client.conf.d
echo "default-server = unix:$RUNDIR/pulse/native" > /etc/pulse/client.conf.d/kol.conf

echo "== התקנת המשדר"
mkdir -p /opt/kol
cp "$HERE/kol-sender.js" "$HERE/ensure-sink.sh" /opt/kol/
chmod +x /opt/kol/ensure-sink.sh
[ -f /opt/kol/package.json ] || echo '{"private":true}' > /opt/kol/package.json
(cd /opt/kol && npm install --silent ws@8)
chown -R "$KOL_USER" /opt/kol

cat > /etc/kol-sender.env <<EOF
KOL_URL=$KOL_URL
KOL_KEY=$KOL_KEY
KOL_ROOM=$KOL_ROOM
KOL_RATE=24000
KOL_CHANNELS=2
EOF
chmod 600 /etc/kol-sender.env

cat > /etc/systemd/system/kol-sender.service <<EOF
[Unit]
Description=Kol - stream desktop audio to headphones
After=network-online.target user@$UID_N.service
Wants=network-online.target

[Service]
User=$KOL_USER
Environment=XDG_RUNTIME_DIR=$RUNDIR
EnvironmentFile=/etc/kol-sender.env
ExecStartPre=/opt/kol/ensure-sink.sh
ExecStart=/usr/bin/node /opt/kol/kol-sender.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now kol-sender.service
sleep 3
systemctl --no-pager status kol-sender.service | head -n 15
echo
echo "== מוכן. תוכנות שכבר פתוחות בשולחן העבודה (למשל הדפדפן) צריך לסגור ולפתוח מחדש."
