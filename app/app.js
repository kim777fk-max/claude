'use strict';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'cloudinaryCfg';

// ---- config (persisted in localStorage) ----
function loadCfg() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function saveCfg(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
let cfg = loadCfg();

function cfgReady() { return cfg.cloud && cfg.preset; }
function refreshSetupNotice() {
  $('setupNotice').classList.toggle('hidden', cfgReady());
}

// ---- settings dialog ----
function openSettings() {
  $('cfgCloud').value = cfg.cloud || '';
  $('cfgPreset').value = cfg.preset || '';
  $('cfgFolder').value = cfg.folder || 'claude-edits';
  $('settings').showModal();
}
$('settingsBtn').addEventListener('click', openSettings);
$('openSetup').addEventListener('click', openSettings);
$('settings').addEventListener('close', () => {
  if ($('settings').returnValue === 'save') {
    cfg = {
      cloud: $('cfgCloud').value.trim(),
      preset: $('cfgPreset').value.trim(),
      folder: $('cfgFolder').value.trim() || 'claude-edits',
    };
    saveCfg(cfg);
    refreshSetupNotice();
    toast('設定を保存しました');
  }
});

// ---- file selection ----
let selectedFile = null;
let uploaded = null; // { public_id, secure_url }

$('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  selectedFile = f;
  uploaded = null;

  const url = URL.createObjectURL(f);
  const v = $('preview');
  if (f.type.startsWith('video/')) {
    v.src = url; v.classList.remove('hidden');
  } else {
    v.classList.add('hidden');
  }
  $('fileMeta').textContent = `${f.name} ・ ${(f.size / 1024 / 1024).toFixed(1)} MB`;
  $('fileMeta').classList.remove('hidden');

  $('uploadBtn').disabled = false;
  $('result').classList.add('hidden');
  $('progressWrap').classList.add('hidden');
  updateHandoffEnabled();
});

// ---- upload to Cloudinary (unsigned) ----
$('uploadBtn').addEventListener('click', () => {
  if (!selectedFile) return;
  if (!cfgReady()) { openSettings(); return; }

  const fd = new FormData();
  fd.append('file', selectedFile);
  fd.append('upload_preset', cfg.preset);
  if (cfg.folder) fd.append('folder', cfg.folder);
  fd.append('tags', 'claude-edit-app');

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud)}/auto/upload`;
  const xhr = new XMLHttpRequest();
  xhr.open('POST', endpoint);

  $('uploadBtn').disabled = true;
  $('progressWrap').classList.remove('hidden');
  setProgress(0);

  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
  };
  xhr.onload = () => {
    $('uploadBtn').disabled = false;
    if (xhr.status >= 200 && xhr.status < 300) {
      const res = JSON.parse(xhr.responseText);
      uploaded = { public_id: res.public_id, secure_url: res.secure_url };
      setProgress(100);
      $('rPublicId').textContent = res.public_id;
      const a = $('rUrl');
      a.href = res.secure_url; a.textContent = res.secure_url;
      $('result').classList.remove('hidden');
      updateHandoffEnabled();
      buildHandoff();
      toast('アップロード完了');
    } else {
      let msg = `エラー (${xhr.status})`;
      try { msg += ': ' + (JSON.parse(xhr.responseText).error.message); } catch {}
      toast(msg);
      $('progressWrap').classList.add('hidden');
    }
  };
  xhr.onerror = () => {
    $('uploadBtn').disabled = false;
    $('progressWrap').classList.add('hidden');
    toast('通信エラー。設定とネットワークを確認してください');
  };
  xhr.send(fd);
});

function setProgress(p) {
  $('progressBar').style.width = p + '%';
  $('progressText').textContent = p + '%';
}

// ---- prompt + handoff text ----
$('chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-t]');
  if (!btn) return;
  const ta = $('prompt');
  ta.value = (ta.value ? ta.value.trim() + '\n' : '') + btn.dataset.t;
  ta.focus();
  buildHandoff();
});
$('prompt').addEventListener('input', buildHandoff);

function updateHandoffEnabled() {
  const ok = !!uploaded;
  $('copyBtn').disabled = !ok;
  $('shareBtn').disabled = !ok;
}

function handoffText() {
  if (!uploaded) return '';
  const p = $('prompt').value.trim() || '(編集内容を記入してください)';
  return [
    'Cloudinary の動画を編集してください。',
    `ファイル名: ${uploaded.public_id}`,
    `URL: ${uploaded.secure_url}`,
    `やりたいこと: ${p}`,
    '',
    '編集後はCloudinaryにアップロードして、共有リンクを返してください。',
  ].join('\n');
}
function buildHandoff() {
  if (!uploaded) return;
  const t = handoffText();
  $('handoff').textContent = t;
  $('handoff').classList.remove('hidden');
}

$('copyBtn').addEventListener('click', async () => {
  const t = handoffText();
  try {
    await navigator.clipboard.writeText(t);
    toast('コピーしました。Claudeに貼り付けてください');
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('コピーしました');
  }
});

$('shareBtn').addEventListener('click', async () => {
  const t = handoffText();
  if (navigator.share) {
    try { await navigator.share({ title: '動画編集の依頼', text: t }); }
    catch {}
  } else {
    await navigator.clipboard.writeText(t);
    toast('共有非対応のためコピーしました');
  }
});

// ---- toast ----
let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

// ---- service worker (installable PWA) ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

refreshSetupNotice();
