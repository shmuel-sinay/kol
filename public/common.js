// עזרים משותפים לשני הדפים
function wsUrl(role, room, key) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = new URLSearchParams({ role, room: room || 'main', key: key || '' });
  return `${proto}//${location.host}/ws?${q}`;
}
function loadField(id) {
  const el = document.getElementById(id);
  const fromUrl = new URLSearchParams(location.search).get(id);
  let saved = null;
  try { saved = localStorage.getItem('kol-' + id); } catch {}
  if (fromUrl) el.value = fromUrl;
  else if (saved) el.value = saved;
}
function saveField(id) {
  try { localStorage.setItem('kol-' + id, document.getElementById(id).value); } catch {}
}
function setStatus(text, kind) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}
