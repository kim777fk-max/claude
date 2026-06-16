'use strict';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'cloudinaryCfg';

// Pre-embedded defaults so the app works with zero setup. Settings can override.
const DEFAULTS = {
  cloud: 'dftjmz7l5',
  preset: '',
  folder: 'claude-edits',
  backend: 'https://video-edit-backend.onrender.com',
};

// ---- config (defaults + persisted overrides) ----
function loadCfg() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch {}
  return { ...DEFAULTS, ...stored };
}
function saveCfg(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
let cfg = loadCfg();

// Ready if we can upload: a backend that signs, or an unsigned preset.
function cfgReady() { return !!cfg.backend || (cfg.cloud && cfg.preset); }
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

// ---- file selection (multiple) ----
let selectedFiles = [];   // File[]
let uploaded = [];        // { public_id, secure_url, name }[]

$('file').addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files || []);
  uploaded = [];
  renderSelected();
  if (typeof showUploadMsg === 'function') showUploadMsg('');
  $('resultList').classList.add('hidden');
  $('resultList').innerHTML = '';
  $('progressWrap').classList.add('hidden');
  $('autoStatus').classList.add('hidden');
  $('autoResult').classList.add('hidden');
  $('uploadBtn').disabled = selectedFiles.length === 0;
  $('uploadBtn').textContent = selectedFiles.length > 1
    ? `アップロード（${selectedFiles.length}本）` : 'アップロード';
  updateHandoffEnabled();
  updateAutoEnabled();
});

function fmtSize(b) { return (b / 1024 / 1024).toFixed(1) + ' MB'; }

function renderSelected() {
  const ul = $('fileList');
  ul.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.id = `sel_${i}`;
    li.innerHTML =
      `<span class="fl-name">${i + 1}. ${escapeHtml(f.name)}</span>` +
      `<span class="fl-sub">${fmtSize(f.size)}</span>` +
      `<span class="fl-bar"><i></i></span>`;
    ul.appendChild(li);
  });
  ul.classList.toggle('hidden', selectedFiles.length === 0);
}

function setFileProgress(i, pct, done) {
  const li = $(`sel_${i}`);
  if (!li) return;
  const bar = li.querySelector('.fl-bar > i');
  if (bar) bar.style.width = pct + '%';
  if (done) li.classList.add('done');
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// persistent status/error line under the upload button (so it's never "no reaction")
function showUploadMsg(text, isError) {
  const el = $('uploadMsg');
  el.textContent = text;
  el.style.color = isError ? '#fbbf24' : 'var(--muted)';
  el.classList.toggle('hidden', !text);
}

// ---- upload all selected files ----
$('uploadBtn').addEventListener('click', async () => {
  // Re-read straight from the input in case the change event never populated state.
  if (selectedFiles.length === 0) {
    const live = Array.from($('file').files || []);
    if (live.length) { selectedFiles = live; renderSelected(); }
  }
  if (selectedFiles.length === 0) { showUploadMsg('先に動画を選択してください。', true); return; }
  if (!cfgReady()) { openSettings(); return; }
  $('uploadBtn').disabled = true;
  $('progressWrap').classList.remove('hidden');
  setProgress(0);
  showUploadMsg('アップロード準備中…');

  try {
    // Signed mode: fetch one signature and reuse it for the whole batch.
    let signed = null, cloud = cfg.cloud;
    if (cfg.backend) {
      showUploadMsg('サーバーに接続中…（無料枠は初回起動に最大1分）');
      let r;
      try {
        r = await fetch(cfg.backend + '/api/sign', { method: 'POST' });
      } catch (e) {
        throw new Error('サーバーに接続できません（CORS/ネットワーク）: ' + (e.message || e));
      }
      if (!r.ok) throw new Error('署名取得に失敗 (HTTP ' + r.status + ')');
      signed = await r.json();
      cloud = signed.cloudName;
    }

    uploaded = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      showUploadMsg(`アップロード中… ${i + 1}/${selectedFiles.length}（${f.name}）`);
      $('progressText').textContent = `${i + 1}/${selectedFiles.length}`;
      const fd = new FormData();
      fd.append('file', f);
      if (signed) {
        fd.append('api_key', signed.apiKey);
        fd.append('timestamp', signed.timestamp);
        fd.append('signature', signed.signature);
        if (signed.folder) fd.append('folder', signed.folder);
      } else {
        fd.append('upload_preset', cfg.preset);
        if (cfg.folder) fd.append('folder', cfg.folder);
      }
      const res = await uploadOne(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/auto/upload`, fd, i);
      uploaded.push({ public_id: res.public_id, secure_url: res.secure_url, name: f.name });
      setFileProgress(i, 100, true);
      setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
    }

    renderResults();
    updateHandoffEnabled();
    updateAutoEnabled();
    buildHandoff();
    showUploadMsg('');
    toast(uploaded.length > 1 ? `${uploaded.length}本アップロード完了` : 'アップロード完了');
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    showUploadMsg('アップロード失敗: ' + msg, true);
    toast('アップロード失敗');
  } finally {
    $('uploadBtn').disabled = false;
  }
});

// One file upload with per-file progress; resolves parsed JSON.
function uploadOne(endpoint, fd, i) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setFileProgress(i, Math.round((ev.loaded / ev.total) * 100), false);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else {
        let msg = 'エラー (' + xhr.status + ')';
        try { msg = JSON.parse(xhr.responseText).error.message; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('通信エラー'));
    xhr.send(fd);
  });
}

function setProgress(p) {
  $('progressBar').style.width = p + '%';
}

function renderResults() {
  const ul = $('resultList');
  ul.innerHTML = '';
  uploaded.forEach((u, i) => {
    const li = document.createElement('li');
    li.className = 'done';
    li.innerHTML =
      `<span class="fl-name">${i + 1}. ${escapeHtml(u.public_id)}</span>` +
      `<a href="${u.secure_url}" target="_blank" rel="noopener">${u.secure_url}</a>`;
    ul.appendChild(li);
  });
  ul.classList.toggle('hidden', uploaded.length === 0);
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
  const ok = uploaded.length > 0;
  $('copyBtn').disabled = !ok;
  $('shareBtn').disabled = !ok;
}

function handoffText() {
  if (uploaded.length === 0) return '';
  const p = $('prompt').value.trim() || '(編集内容を記入してください)';
  const lines = ['Cloudinary の動画を編集してください。'];
  if (uploaded.length === 1) {
    lines.push(`ファイル名: ${uploaded[0].public_id}`);
    lines.push(`URL: ${uploaded[0].secure_url}`);
  } else {
    lines.push(`ファイル(${uploaded.length}本・順番どおり):`);
    uploaded.forEach((u, i) => lines.push(`${i + 1}. ${u.public_id} — ${u.secure_url}`));
  }
  lines.push(`やりたいこと: ${p}`);
  lines.push('');
  lines.push('編集後はCloudinaryにアップロードして、共有リンクを返してください。');
  return lines.join('\n');
}
function buildHandoff() {
  if (uploaded.length === 0) return;
  $('handoff').textContent = handoffText();
  $('handoff').classList.remove('hidden');
}

$('copyBtn').addEventListener('click', async () => {
  const t = handoffText();
  try {
    await navigator.clipboard.writeText(t);
    toast('コピーしました。Claudeに貼り付けてください');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('コピーしました');
  }
});

$('shareBtn').addEventListener('click', async () => {
  const t = handoffText();
  if (navigator.share) {
    try { await navigator.share({ title: '動画編集の依頼', text: t }); } catch {}
  } else {
    await navigator.clipboard.writeText(t);
    toast('共有非対応のためコピーしました');
  }
});

// ---- auto edit via backend (passes all uploaded clips) ----
function updateAutoEnabled() {
  const ok = uploaded.length > 0 && !!cfg.backend;
  $('autoBtn').classList.toggle('hidden', !cfg.backend);
  $('autoBtn').disabled = !ok;
}

$('autoBtn').addEventListener('click', async () => {
  if (uploaded.length === 0 || !cfg.backend) return;
  const prompt = $('prompt').value.trim();
  if (!prompt) { toast('やりたいことを書いてください'); return; }
  $('autoBtn').disabled = true;
  $('autoStatus').classList.remove('hidden');
  $('autoStatus').textContent = '依頼を送信中…';
  $('autoResult').classList.add('hidden');
  try {
    const urls = uploaded.map((u) => u.secure_url);
    const start = await fetch(cfg.backend + '/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urls[0], urls, prompt }),
    }).then((r) => r.json());

    // Back-compat: old sync backend returns the result directly.
    if (start.secure_url || start.skipped) {
      return showAutoResult(start);
    }
    if (!start.ok || !start.jobId) throw new Error(start.error || 'failed to start');

    // Poll the job until done/error (handles long videos without timeouts).
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      let job;
      try {
        job = await fetch(cfg.backend + '/api/job/' + start.jobId).then((r) => r.json());
      } catch { continue; } // transient (e.g. cold start) — keep polling
      if (job.status === 'queued' || job.status === 'running') {
        $('autoStatus').textContent = '編集中…（動画の長さ・本数で時間がかかります）';
        continue;
      }
      if (job.status === 'error') throw new Error(job.error || 'edit failed');
      return showAutoResult(job); // done
    }
    throw new Error('時間切れ（処理に時間がかかっています。少し待って再試行してください）');
  } catch (err) {
    $('autoStatus').textContent = '失敗: ' + (err.message || err);
  } finally {
    $('autoBtn').disabled = false;
  }
});

function showAutoResult(res) {
  if (res.skipped) {
    $('autoStatus').textContent = '編集なし: ' + (res.note || '');
    return;
  }
  $('autoStatus').textContent = res.note || '完了';
  const a = $('autoUrl');
  a.href = res.secure_url; a.textContent = res.secure_url;
  $('autoResult').classList.remove('hidden');
  toast('編集が完了しました');
}

// ---- toast ----
let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

// ---- service worker (auto-reload once when a new version takes control) ----
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

refreshSetupNotice();
updateAutoEnabled();
