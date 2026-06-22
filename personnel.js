// OSINT GOTHAM — Personnel Tracking Module
// Storage: IndexedDB (supports binary image data, large payloads)

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const PERSDB = {
  db: null,

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('osint_gotham_personnel', 1);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('personnel')) {
          const ps = db.createObjectStore('personnel', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('callsign',  'callsign',  { unique: false });
          ps.createIndex('groupId',   'groupId',   { unique: false });
          ps.createIndex('citizenId', 'citizenId', { unique: false });
        }
        if (!db.objectStoreNames.contains('logs')) {
          const ls = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          ls.createIndex('personnelId', 'personnelId', { unique: false });
        }
      };

      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror   = e => reject(e.target.error);
    });
  },

  _store(name, mode = 'readonly') {
    return this.db.transaction([name], mode).objectStore(name);
  },

  async getAll(store) {
    return new Promise((res, rej) => {
      const r = this._store(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },

  async get(store, id) {
    return new Promise((res, rej) => {
      const r = this._store(store).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },

  async put(store, data) {
    return new Promise((res, rej) => {
      const r = this._store(store, 'readwrite').put(data);
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },

  async del(store, id) {
    return new Promise((res, rej) => {
      const r = this._store(store, 'readwrite').delete(id);
      r.onsuccess = () => res();
      r.onerror   = e => rej(e.target.error);
    });
  },

  async getLogsFor(personnelId) {
    return new Promise((res, rej) => {
      const r = this._store('logs').index('personnelId').getAll(personnelId);
      r.onsuccess = () => res(r.result.sort((a, b) => b.timestamp - a.timestamp));
      r.onerror   = e => rej(e.target.error);
    });
  }
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let persState = {
  list: [],
  selected: null,
  pendingLogPics: []
};
let formTags = [];

// ─── TAG HELPERS ──────────────────────────────────────────────────────────────
function addFormTag() {
  const input = document.getElementById('tag-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val || formTags.includes(val)) { input.value = ''; return; }
  formTags.push(val);
  input.value = '';
  renderFormTags();
}

function removeFormTag(tag) {
  formTags = formTags.filter(t => t !== tag);
  renderFormTags();
}

function renderFormTags() {
  const wrap = document.getElementById('form-tags-list');
  if (!wrap) return;
  wrap.innerHTML = formTags.map(t =>
    `<span class="pers-tag-pill">${t}<button onclick="removeFormTag('${t.replace(/'/g, "\\'")}')">×</button></span>`
  ).join('');
}

// ─── OPEN / CLOSE ─────────────────────────────────────────────────────────────
async function openPersModal() {
  document.getElementById('modal-personnel').classList.add('active');
  await PERSDB.open();
  persState.list = await PERSDB.getAll('personnel');
  renderPersList();
  renderPersDetail();
  renderBottomPersonnel();
}

function closePersModal() {
  document.getElementById('modal-personnel').classList.remove('active');
}

// ─── LIST ────────────────────────────────────────────────────────────────────
function renderPersList(q = '') {
  const el = document.getElementById('pers-list');
  q = q.toLowerCase();

  const filtered = persState.list.filter(p =>
    !q ||
    (p.fullName  || '').toLowerCase().includes(q) ||
    (p.nickName  || '').toLowerCase().includes(q) ||
    (p.callsign  || '').toLowerCase().includes(q) ||
    (p.groupId   || '').toLowerCase().includes(q)
  );

  el.innerHTML = '';
  if (!filtered.length) {
    el.innerHTML = '<div class="pers-list-empty">NO SUBJECTS</div>';
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pers-card' + (persState.selected?.id === p.id ? ' active' : '');
    card.dataset.id = p.id;
    card.innerHTML = `
      ${p.photo
        ? `<img src="${p.photo}" class="pers-thumb" />`
        : `<div class="pers-thumb pers-thumb-empty"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="8" cy="6" r="3.5"/><path d="M2 15 c0-4 12-4 12 0"/></svg></div>`}
      <div class="pers-card-info">
        <div class="pers-card-name">${p.fullName || '—'}</div>
        <div class="pers-card-meta">${p.callsign ? '['+p.callsign+']' : ''} ${p.groupId || ''}</div>
      </div>`;
    card.addEventListener('click', () => selectPerson(p.id));
    el.appendChild(card);
  });
}

// ─── SELECT ───────────────────────────────────────────────────────────────────
async function selectPerson(id) {
  persState.selected = await PERSDB.get('personnel', id);
  renderPersList(document.getElementById('pers-search-input').value);
  renderPersDetail();
  showSubjectInSidebar(persState.selected);
}

// ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
function dc(label, val, extra = '', small = false) {
  const v = val || '—';
  return `<div class="pd-dos-cell${extra ? ' '+extra : ''}">
    <div class="pd-dos-lbl">${label}</div>
    <div class="pd-dos-val${small?' pd-dos-val-sm':''}">${v}</div>
    ${v !== '—' ? `<button class="pd-dos-copy" onclick="navigator.clipboard.writeText('${v.replace(/'/g,"\\'")}');this.textContent='✓';setTimeout(()=>this.textContent='⎘',1200)" title="Copy">⎘</button>` : ''}
  </div>`;
}

async function renderPersDetail() {
  const panel = document.getElementById('pers-detail');
  const p = persState.selected;

  if (!p) {
    panel.innerHTML = '<div class="pers-placeholder">← SELECT A SUBJECT OR ADD NEW</div>';
    return;
  }

  const logs  = await PERSDB.getLogsFor(p.id);
  const sm    = p.socialMedia || {};

  const smRows = Object.entries(sm).filter(([,v]) => v)
    .map(([k,v]) => `<div class="pd-row"><span class="pd-k">${k.toUpperCase()}</span><span class="pd-v">${v}</span></div>`).join('');

  const relPicsHtml = (p.relatedPics || []).map((src, i) =>
    `<div class="pers-pic-wrap">
      <img src="${src}" class="pers-pic-thumb" onclick="viewImg('${src}')" />
      <button class="pers-pic-del" onclick="deleteRelatedPic(${p.id},${i})">×</button>
    </div>`
  ).join('');

  const logsHtml = logs.map(lg => {
    const date = new Date(lg.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
    const typeLabel = lg.type ? lg.type[0]+lg.type.slice(1).toLowerCase() : 'Note';
    const atts = (lg.attachments||[]).map(src =>
      `<img src="${src}" class="pers-log-img" onclick="viewImg('${src}')" />`).join('');
    return `<div class="pers-log-entry">
      <div class="pers-log-hd">
        <span class="pers-log-badge pers-badge-${(lg.type||'note').toLowerCase()}">${typeLabel}</span>
        <button class="pers-log-del" onclick="deleteLog(${lg.id},${p.id})">×</button>
      </div>
      <div class="pers-log-body">${(lg.content||'').replace(/\n/g,'<br>')}</div>
      ${atts ? `<div class="pers-log-atts">${atts}</div>` : ''}
      <div class="pers-log-foot">Logged · ${date}</div>
    </div>`;
  }).join('') || '<div class="pd-dos-empty">No log entries yet</div>';

  const subtitle = [
    p.groupId   ? `Class: ${p.groupId}` : '',
    p.citizenId ? `ID: ${p.citizenId}`  : ''
  ].filter(Boolean).join(' · ');

  const tagLine   = (p.tags||[]).join(', ') || '—';
  const smEntries = Object.entries(p.socialMedia || {}).filter(([,v]) => v);

  panel.innerHTML = `
  <div class="pd-dossier">

    <!-- Header: name + actions -->
    <div class="pd-dos-hd">
      <div class="pd-dos-hd-text">
        <div class="pd-dos-title">${p.fullName || '—'}${p.nickName ? ` <span class="pd-dos-nick">"${p.nickName}"</span>` : ''}</div>
        ${subtitle ? `<div class="pd-dos-sub">${subtitle}</div>` : ''}
      </div>
      <div class="pd-actions">
        <button class="pers-btn pers-btn-fill" onclick="showEditForm(${p.id})">Edit</button>
        <button class="pers-btn pers-btn-danger" onclick="deletePerson(${p.id})">Delete</button>
      </div>
    </div>

    <!-- Photo + info grid -->
    <div class="pd-dos-profile">
      <div class="pd-dos-photo-col">
        ${p.photo
          ? `<img src="${p.photo}" class="pd-dos-photo" onclick="viewImg('${p.photo}')" />`
          : `<div class="pd-dos-photo pd-dos-photo-empty"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1"><circle cx="18" cy="12" r="7"/><path d="M4 34 c0-9 28-9 28 0"/></svg></div>`}
      </div>
      <div class="pd-dos-grid">
        ${dc('Callsign', p.callsign)}
        ${dc('Birth Date', p.birthDate)}
        ${dc('MBTI', p.mbti)}
        ${dc('Group', p.groupId)}
        ${dc('Address', p.address, 'pd-dos-span2')}
        ${dc('Contact', p.phone, 'pd-dos-span2')}
        ${dc('Citizen ID', p.citizenId)}
        ${dc('Email', p.email, '', true)}
        ${dc('Specialties', tagLine, 'pd-dos-span2')}
        ${smEntries.map(([k,v]) => dc(k, v, 'pd-dos-span2', true)).join('')}
      </div>
    </div>

    <!-- Related images -->
    <div class="pd-dos-section">
      <div class="pd-dos-section-hd">
        RELATED IMAGES
        <label class="pers-attach-btn" style="margin-left:6px">+ Add
          <input type="file" accept="image/*" multiple style="display:none" onchange="addRelatedPics(event,${p.id})">
        </label>
      </div>
      ${relPicsHtml
        ? `<div class="pers-gallery">${relPicsHtml}</div>`
        : `<div class="pd-dos-empty">No images attached</div>`}
    </div>

    <!-- OSINT Feed -->
    <div class="pd-dos-section">
      <div class="pd-dos-section-hd">OSINT FEED</div>
      <div class="pers-log-composer">
        <div class="pers-log-composer-top">
          <select id="log-type-sel" class="pers-sel" style="flex:0 0 110px">
            ${['NOTE','SIGHTING','CONFIRMED','SUSPECTED','ASSOCIATE','LOCATION','COMMS','ACTIVITY','SIGINT','ELINT']
              .map(t => `<option value="${t}">${t[0]+t.slice(1).toLowerCase()}</option>`).join('')}
          </select>
          <textarea id="log-text-input" class="pers-textarea" placeholder="Log entry content..." rows="3" style="flex:1;min-width:0"></textarea>
        </div>
        <div class="pers-log-composer-row">
          <label class="pers-attach-btn">
            📎 Attach photo
            <input type="file" accept="image/*" multiple style="display:none" id="log-pic-input" onchange="cachePics(event)">
          </label>
          <span id="log-pic-count" class="pers-empty-note"></span>
          <button class="pers-submit-btn" onclick="submitLog(${p.id})">Submit log</button>
        </div>
      </div>
      <div id="pers-logs-list" class="pers-logs-list">${logsHtml}</div>
    </div>

  </div>`;
}

function pdRow(label, value) {
  if (!value) return '';
  return `<div class="pd-row"><span class="pd-k">${label}</span><span class="pd-v">${value}</span></div>`;
}

// ─── ADD / EDIT FORM ─────────────────────────────────────────────────────────
function showAddForm() {
  persState.selected = null;
  renderPersForm(null);
}

async function showEditForm(id) {
  const p = await PERSDB.get('personnel', id);
  renderPersForm(p);
}

function renderPersForm(p) {
  const panel = document.getElementById('pers-detail');
  const sm = p?.socialMedia || {};
  formTags = [...(p?.tags || [])];
  const mbtiOpts = ['','INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
                       'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

  panel.innerHTML = `
  <div class="pd-inner">

    <div class="pd-form-header">
      <span class="pd-form-title">${p ? 'Edit Subject' : 'New Subject'}</span>
      <button class="pers-btn" onclick="cancelForm()">✕ Cancel</button>
    </div>

    <!-- Photo upload -->
    <div class="pf-photo-section">
      <label class="pf-photo-drop" for="form-photo-inp" id="form-photo-prev">
        ${p?.photo
          ? `<img src="${p.photo}" class="pf-photo-img" />`
          : `<div class="pf-photo-placeholder">
               <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1"><circle cx="13" cy="9" r="5"/><path d="M3 25 c0-7 20-7 20 0"/></svg>
               <span>Set photo</span>
             </div>`}
        <input type="file" accept="image/*" id="form-photo-inp" style="display:none" onchange="previewPhoto(event)">
      </label>
    </div>

    <!-- Identity -->
    <div class="pf-section">
      <div class="pf-section-hd">Identity</div>
      <div class="pers-fld">
        <label>FULL NAME</label>
        <input type="text" name="fullName" value="${p?.fullName || ''}" class="pers-input" placeholder="Subject full name">
      </div>
      <div class="pers-form-grid">
        ${fld('Callsign','callsign',p?.callsign,'text')}
        ${fld('Nickname','nickName',p?.nickName,'text')}
        ${fld('Date of Birth','birthDate',p?.birthDate,'date')}
        <div class="pers-fld">
          <label>MBTI</label>
          <select name="mbti" class="pers-input pers-sel">
            ${mbtiOpts.map(m => `<option value="${m}" ${p?.mbti===m?'selected':''}>${m||'— SELECT —'}</option>`).join('')}
          </select>
        </div>
        ${fld('Citizen ID','citizenId',p?.citizenId,'text')}
        ${fld('Group ID','groupId',p?.groupId,'text')}
      </div>
    </div>

    <!-- Contact -->
    <div class="pf-section">
      <div class="pf-section-hd">Contact</div>
      <div class="pers-form-grid">
        ${fld('Phone','phone',p?.phone,'tel')}
        ${fld('Email','email',p?.email,'email')}
      </div>
      <div class="pers-fld" style="margin-top:5px">
        <label>ADDRESS</label>
        <input type="text" name="address" value="${p?.address || ''}" class="pers-input" placeholder="Address / Location">
      </div>
    </div>

    <!-- Social Media -->
    <div class="pf-section">
      <div class="pf-section-hd">Social Media</div>
      <div class="pf-sm-grid">
        ${fld('Instagram','sm_instagram',sm.instagram,'text')}
        ${fld('Facebook','sm_facebook',sm.facebook,'text')}
        ${fld('Twitter / X','sm_twitter',sm.twitter,'text')}
        ${fld('Telegram','sm_telegram',sm.telegram,'text')}
        ${fld('LINE','sm_line',sm.line,'text')}
        ${fld('TikTok','sm_tiktok',sm.tiktok,'text')}
        ${fld('LinkedIn','sm_linkedin',sm.linkedin,'text')}
      </div>
    </div>

    <!-- Tags -->
    <div class="pf-section">
      <div class="pf-section-hd">Tags</div>
      <div class="pf-tag-row">
        <input type="text" id="tag-input" class="pers-input" placeholder="Add tag..."
          onkeydown="if(event.key==='Enter'){event.preventDefault();addFormTag()}">
        <button class="pf-tag-add-btn" onclick="addFormTag()">+</button>
      </div>
      <div class="pf-tags-wrap" id="form-tags-list"></div>
    </div>

    <!-- Save -->
    <div class="pf-save-row">
      <button class="pf-save-btn" onclick="savePerson(${p?.id ?? 'null'})">Save record</button>
    </div>

  </div>`;
  renderFormTags();
}

function fld(label, name, value, type) {
  return `<div class="pers-fld">
    <label>${label.toUpperCase()}</label>
    <input type="${type}" name="${name}" value="${value || ''}" class="pers-input" placeholder="${label}">
  </div>`;
}

function cancelForm() {
  if (persState.selected) renderPersDetail();
  else document.getElementById('pers-detail').innerHTML =
    '<div class="pers-placeholder">← SELECT A SUBJECT OR ADD NEW</div>';
}

// ─── SAVE ────────────────────────────────────────────────────────────────────
async function savePerson(existingId) {
  const panel  = document.getElementById('pers-detail');
  const inputs = panel.querySelectorAll('[name]');
  const data   = { socialMedia: {} };

  inputs.forEach(inp => {
    if (inp.name.startsWith('sm_')) {
      data.socialMedia[inp.name.slice(3)] = inp.value.trim();
    } else {
      data[inp.name] = inp.value.trim();
    }
  });

  // Photo (stored inside the pf-photo-drop label)
  const photoEl = panel.querySelector('#form-photo-prev img');
  if (photoEl) data.photo = photoEl.src;
  else if (existingId) {
    const ex = await PERSDB.get('personnel', existingId);
    data.photo = ex?.photo || null;
  }

  data.tags = [...formTags];

  if (existingId) {
    const ex = await PERSDB.get('personnel', existingId);
    data.id          = existingId;
    data.relatedPics = ex?.relatedPics || [];
    data.createdAt   = ex?.createdAt   || Date.now();
  } else {
    data.relatedPics = [];
    data.createdAt   = Date.now();
  }
  data.updatedAt = Date.now();

  const newId = await PERSDB.put('personnel', data);
  persState.list     = await PERSDB.getAll('personnel');
  persState.selected = await PERSDB.get('personnel', data.id || newId);

  renderPersList(document.getElementById('pers-search-input').value);
  renderPersDetail();
  renderBottomPersonnel();
}

// ─── DELETE SUBJECT ───────────────────────────────────────────────────────────
async function deletePerson(id) {
  const ok = await showConfirm('DELETE SUBJECT', 'Remove this subject and all associated logs? This cannot be undone.');
  if (!ok) return;
  const logs = await PERSDB.getLogsFor(id);
  for (const lg of logs) await PERSDB.del('logs', lg.id);
  await PERSDB.del('personnel', id);
  persState.list     = await PERSDB.getAll('personnel');
  persState.selected = null;
  showSubjectInSidebar(null);
  renderPersList(document.getElementById('pers-search-input').value);
  renderBottomPersonnel();
  document.getElementById('pers-detail').innerHTML =
    '<div class="pers-placeholder">← SELECT A SUBJECT OR ADD NEW</div>';
}

// ─── BOTTOM PANEL TABLE ───────────────────────────────────────────────────────
function renderBottomPersonnel() {
  const tbody = document.getElementById('personnel-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  persState.list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="hl-purple">${p.fullName || '—'}</td>
      <td style="color:var(--yellow);font-size:8px">${p.callsign || '—'}</td>
      <td style="font-size:8px;color:var(--subtext)">${p.groupId || '—'}</td>`;
    tr.addEventListener('click', () => {
      showSubjectInSidebar(p);
      persState.selected = p;
    });
    tbody.appendChild(tr);
  });
  const cnt = document.getElementById('cnt-personnel');
  if (cnt) cnt.textContent = persState.list.length;
}

// ─── RIGHT SIDEBAR SUBJECT DISPLAY ───────────────────────────────────────────
function showSubjectInSidebar(p) {
  const section = document.getElementById('rp-subject');
  if (!section) return;
  if (!p) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const photoEl = document.getElementById('rp-sub-photo');
  if (p.photo) {
    photoEl.innerHTML = `<img src="${p.photo}" />`;
  } else {
    photoEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--overlay0)"><circle cx="7" cy="5.5" r="3"/><path d="M1.5 13 c0-4 11-4 11 0"/></svg>`;
  }
  document.getElementById('rp-sub-name').textContent     = p.fullName  || '—';
  document.getElementById('rp-sub-callsign').textContent = p.callsign  || '—';
  document.getElementById('rp-sub-group').textContent    = p.groupId   || '—';
  document.getElementById('rp-sub-mbti').textContent     = p.mbti      || '—';
  document.getElementById('rp-sub-dob').textContent      = p.birthDate || '—';
  document.getElementById('rp-sub-address').textContent  = p.address   || '—';
  const tagsWrap = document.getElementById('rp-sub-tags');
  if (tagsWrap) {
    tagsWrap.innerHTML = (p.tags||[]).map(t => `<span class="rp-tag">${t}</span>`).join('');
    tagsWrap.style.display = (p.tags||[]).length ? '' : 'none';
  }
  const viewBtn = document.getElementById('rp-sub-view');
  if (viewBtn) {
    if (p.photo) {
      viewBtn.style.display = '';
      viewBtn.onclick = () => viewImg(p.photo);
    } else {
      viewBtn.style.display = 'none';
    }
  }
}

// ─── IN-APP CONFIRM DIALOG ────────────────────────────────────────────────────
function showConfirm(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-confirm');
    if (!overlay) { resolve(window.confirm(message)); return; }
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.add('active');
    const done = (val) => { overlay.classList.remove('active'); resolve(val); };
    document.getElementById('confirm-ok-btn').onclick     = () => done(true);
    document.getElementById('confirm-cancel-btn').onclick = () => done(false);
  });
}

// ─── INIT WIDGET (called from app.js DOMContentLoaded) ───────────────────────
async function initPersonnelWidget() {
  await PERSDB.open();
  persState.list = await PERSDB.getAll('personnel');
  renderBottomPersonnel();
}

// ─── PHOTO UTILS ─────────────────────────────────────────────────────────────
function previewPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    const prev = document.getElementById('form-photo-prev');
    // Keep the hidden file input, just swap the visible content
    const input = prev.querySelector('input[type="file"]');
    prev.innerHTML = `<img src="${ev.target.result}" class="pf-photo-img" />`;
    if (input) prev.appendChild(input);
  };
  r.readAsDataURL(file);
}

async function addRelatedPics(e, personnelId) {
  const person = await PERSDB.get('personnel', personnelId);
  if (!person) return;
  const pics = [...(person.relatedPics || [])];
  for (const file of Array.from(e.target.files)) {
    await new Promise(res => {
      const r = new FileReader();
      r.onload = ev => { pics.push(ev.target.result); res(); };
      r.readAsDataURL(file);
    });
  }
  person.relatedPics = pics;
  await PERSDB.put('personnel', person);
  persState.selected = person;
  renderPersDetail();
}

async function deleteRelatedPic(personnelId, idx) {
  const person = await PERSDB.get('personnel', personnelId);
  if (!person) return;
  person.relatedPics.splice(idx, 1);
  await PERSDB.put('personnel', person);
  persState.selected = person;
  renderPersDetail();
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function cachePics(e) {
  persState.pendingLogPics = Array.from(e.target.files);
  const el = document.getElementById('log-pic-count');
  if (el) el.textContent = persState.pendingLogPics.length
    ? persState.pendingLogPics.length + ' file(s) ready'
    : '';
}

async function submitLog(personnelId) {
  const typeEl    = document.getElementById('log-type-sel');
  const contentEl = document.getElementById('log-text-input');
  const content   = contentEl?.value?.trim() || '';
  const type      = typeEl?.value || 'NOTE';

  const attachments = [];
  for (const file of persState.pendingLogPics) {
    await new Promise(res => {
      const r = new FileReader();
      r.onload = ev => { attachments.push(ev.target.result); res(); };
      r.readAsDataURL(file);
    });
  }

  await PERSDB.put('logs', { personnelId, timestamp: Date.now(), type, content, attachments });
  persState.pendingLogPics = [];
  persState.selected = await PERSDB.get('personnel', personnelId);
  renderPersDetail();
}

async function deleteLog(logId, personnelId) {
  await PERSDB.del('logs', logId);
  persState.selected = await PERSDB.get('personnel', personnelId);
  renderPersDetail();
}

// ─── IMAGE LIGHTBOX ──────────────────────────────────────────────────────────
function viewImg(src) {
  let ov = document.getElementById('pers-img-viewer');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pers-img-viewer';
    ov.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;object-fit:contain;border:1px solid rgba(203,166,247,0.3)">`;
}
