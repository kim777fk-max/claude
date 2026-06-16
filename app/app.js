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

// Ready if we can upload: either an unsigned preset, or a backend that signs.
function cfgReady() { return (cfg.cloud && cfg.preset) || cfg.backend; }
function refreshSetupNotice() {
  $('setupNotice').classList.toggle('hidden', cfgReady());
}

// ---- settings dialog ----
function openSettings() {
  $('cfgCloud').value = cfg.cloud || '';
  $('cfgPreset').value = cfg.preset || '';
  $('cfgFolder').value = cfg.folder || 'claude-edits';
  $('cfgBackend').value = cfg.backend || '';
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
      backend: $('cfgBackend').value.trim().replace(/\/$/, ''),
    };
    saveCfg(cfg);
    refreshSetupNotice();
    updateAutoEnabled();
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
  $('autoStatus').classList.add('hidden');
  $('autoResult').classList.add('hidden');
  updateHandoffEnabled();
  updateAutoEnabled();
});

// ---- upload to Cloudinary (signed via backend, or unsigned via preset) ----
$('uploadBtn').addEventListener('click', async () => {
  if (!selectedFile) return;
  if (!cfgReady()) { openSettings(); return; }
  $('uploadBtn').disabled = true;
  $('progressWrap').classList.remove('hidden');
  setProgress(0);
  try {
    const fd = new FormData();
    fd.append('file', selectedFile);
    let cloud = cfg.cloud;

    if (cfg.backend) {
      // signed upload — backend returns a signature; no preset needed
      const sign = await fetch(cfg.backend + '/api/sign', { method: 'POST' }).then((r) => {
        if (!r.ok) throw new Error('sign failed (' + r.status + ')');
        return r.json();
      });
      cloud = sign.cloudName;
      fd.append('api_key', sign.apiKey);
      fd.append('timestamp', sign.timestamp);
      fd.append('signature', sign.signature);
      if (sign.folder) fd.append('folder', sign.folder);
    } else {
      // unsigned upload via preset
      fd.append('upload_preset', cfg.preset);
      if (cfg.folder) fd.append('folder', cfg.folder);
    }

    const res = await uploadXHR(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/auto/upload`, fd);
    uploaded = { public_id: res.public_id, secure_url: res.secure_url };
    setProgress(100);
    $('rPublicId').textContent = res.public_id;
    const a = $('rUrl');
    a.href = res.secure_url; a.textContent = res.secure_url;
    $('result').classList.remove('hidden');
    updateHandoffEnabled();
    updateAutoEnabled();
    buildHandoff();
    toast('アップロード完了');
  } catch (err) {
    $('progressWrap').classList.add('hidden');
    toast('アップロード失敗: ' + (err.message || err));
  } finally {
    $('uploadBtn').disabled = false;
  }
});

// XHR upload with progress, resolved as parsed JSON.
function uploadXHR(endpoint, fd) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = 'エラー (' + xhr.status + ')';
        try { msg = JSON.parse(xhr.responseText).error.message; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('通信エラー'));
    xhr.send(fd);
  });
}

// ---- auto edit via backend ----
function updateAutoEnabled() {
  const ok = !!uploaded && !!cfg.backend;
  $('autoBtn').classList.toggle('hidden', !cfg.backend);
  $('autoBtn').disabled = !ok;
}

$('autoBtn').addEventListener('click', async () => {
  if (!uploaded || !cfg.backend) return;
  const prompt = $('prompt').value.trim();
  if (!prompt) { toast('やりたいことを書いてください'); return; }
  $('autoBtn').disabled = true;
  $('autoStatus').classList.remove('hidden');
  $('autoStatus').textContent = '編集中… (動画の長さによって時間がかかります)';
  $('autoResult').classList.add('hidden');
  try {
    const res = await fetch(cfg.backend + '/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: uploaded.secure_url, prompt }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'failed');
    if (res.skipped) {
      $('autoStatus').textContent = '編集なし: ' + (res.note || '');
    } else {
      $('autoStatus').textContent = res.note || '完了';
      const a = $('autoUrl');
      a.href = res.secure_url; a.textContent = res.secure_url;
      $('autoResult').classList.remove('hidden');
      toast('編集が完了しました');
    }
  } catch (err) {
    $('autoStatus').textContent = '失敗: ' + (err.message || err);
  } finally {
    $('autoBtn').disabled = false;
  }
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
updateAutoEnabled();
