// ============================================================
// app.js — Frontend (Static Site)
// ============================================================

// callAPI ถูก define ใน api.js แล้ว

// ===== CONSTANTS =====
var ITEMS_PER_PAGE = 20;
var ROLE_LABELS = { admin:'ผู้ดูแลระบบ', staff:'เจ้าหน้าที่คลัง', accountant:'เจ้าหน้าที่บัญชี', employee:'พนักงาน' };
var ROLE_COLORS = { admin:'bg-navy-100 text-navy-700', staff:'bg-blue-100 text-blue-700', accountant:'bg-purple-100 text-purple-700', employee:'bg-green-100 text-green-700' };
var NO_DEPT     = 'ไม่ระบุแผนก';

/** canApprove — อนุมัติ/ปฏิเสธคำขอเบิกได้: ผู้ดูแลระบบ และเจ้าหน้าที่บัญชี */
function canApprove() {
  return !!AUTH.user && (AUTH.user.role === 'admin' || AUTH.user.role === 'accountant');
}
/** canStocktake — ตรวจนับและบันทึกฉบับร่างได้: เจ้าหน้าที่บัญชี และผู้ดูแลระบบ (ยืนยันปรับยอดได้เฉพาะผู้ดูแลระบบ) */
function canStocktake() {
  return canApprove();
}

// ===== CONFIG / แผนก (โหลดครั้งเดียวตอนเข้าระบบ) =====
var _APP_CONFIG  = {};
var _DEPARTMENTS = [];

function parseListString(raw) {
  return String(raw || '').split(/[,\n]/).map(function(x){ return x.trim(); })
    .filter(function(x){ return x !== ''; });
}

/** applyPublicConfig — นำค่าตั้งค่าระบบมาใช้กับหน้าเว็บ (ชื่อระบบ โลโก้ รายชื่อแผนก) */
function applyPublicConfig(cfg) {
  if (!cfg) return;
  _APP_CONFIG  = cfg;
  setApiCapabilities(cfg);
  _DEPARTMENTS = parseListString(cfg.departments);
  var appName = cfg.app_name || 'ระบบวัสดุสิ้นเปลือง';
  var sbName  = document.getElementById('sidebarAppName');
  var lgName  = document.getElementById('loginAppName');
  if (sbName) sbName.textContent = appName;
  if (lgName) lgName.textContent = appName;
  if (cfg.app_logo) updateLogoDisplay(cfg.app_logo);
}

/** loadAppConfig — ดึงค่าตั้งค่าระบบที่เปิดเผยได้ (ใช้เฉพาะตอนยังไม่ได้เข้าระบบ / รีเฟรชภายหลัง) */
function loadAppConfig() {
  return callAPI('getPublicConfig', AUTH.token).then(function(res) {
    if (!res || !res.success) return;
    applyPublicConfig(res.data || {});
  }).catch(function(){ /* ใช้ค่าเริ่มต้นถ้าโหลดไม่ได้ */ });
}

/** deptOptionsHTML — <option> รายชื่อแผนก (รวมค่าปัจจุบันที่อาจไม่อยู่ในลิสต์) */
function deptOptionsHTML(selected) {
  selected = selected || '';
  var list = _DEPARTMENTS.slice();
  if (selected && list.indexOf(selected) === -1) list.push(selected);
  var html = '<option value="">— ไม่ระบุแผนก —</option>';
  list.forEach(function(d) {
    html += '<option value="' + escHtml(d) + '"' + (d === selected ? ' selected' : '') + '>' + escHtml(d) + '</option>';
  });
  return html;
}

/** userDept — แผนกของผู้ใช้ที่ล็อกอินอยู่ */
function userDept() {
  return (AUTH.user && AUTH.user.department) || '';
}

/** applyUserToShell — อัปเดตชื่อ/บทบาท/แผนก บนแถบเมนูซ้าย */
function applyUserToShell() {
  if (!AUTH.user) return;
  var nameEl = document.getElementById('sidebarName');
  if (nameEl) nameEl.textContent = AUTH.user.name || AUTH.user.username;
  var roleEl = document.getElementById('sidebarRole');
  if (roleEl) {
    var t = ROLE_LABELS[AUTH.user.role] || AUTH.user.role;
    if (AUTH.user.department) t += ' • ' + AUTH.user.department;
    roleEl.textContent = t;
  }
}

/**
 * refreshMyProfile — ดึงข้อมูลบัญชีตัวเองล่าสุดจากเซิร์ฟเวอร์ (ชื่อ/บทบาท/แผนก)
 * ใช้ให้แผนกที่ผู้ดูแลระบบเพิ่งกำหนดมีผลทันที โดยไม่ต้อง logout หรือรีหน้าเว็บ
 */
function refreshMyProfile() {
  if (!AUTH.token || !AUTH.user) return Promise.resolve(null);
  return callAPI('getMyProfile', AUTH.token).then(function(res) {
    if (!res || !res.success || !res.data) return null;
    var u = res.data;
    AUTH.user.department = u.department || '';
    AUTH.user.name       = u.name || AUTH.user.name;
    AUTH.user.role       = u.role || AUTH.user.role;
    localStorage.setItem('sup_user', JSON.stringify(AUTH.user));
    applyUserToShell();
    return u;
  }).catch(function(){ return null; });
}

// ===== URL PARAMS (for QR) =====
var _QR_ACTION = '';
var _QR_ITEM_ID = '';

// ===== AUTH =====
var AUTH = {
  token: localStorage.getItem('sup_token') || '',
  user:  JSON.parse(localStorage.getItem('sup_user')  || 'null'),
  set: function(token, user) {
    AUTH.token = token; AUTH.user = user;
    localStorage.setItem('sup_token', token);
    localStorage.setItem('sup_user', JSON.stringify(user));
  },
  clear: function() {
    clearDashCache();
    AUTH.token = ''; AUTH.user = null;
    localStorage.removeItem('sup_token');
    localStorage.removeItem('sup_user');
  },
  hasRole: function(roles) {
    if (!AUTH.user) return false;
    if (!Array.isArray(roles)) roles = [roles];
    return roles.indexOf(AUTH.user.role) !== -1;
  }
};

// ===== LOADING =====
function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'กำลังโหลด...';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ===== ALERTS =====
function showSuccess(msg) { Swal.fire({ icon:'success', title:'สำเร็จ', text:msg, timer:2000, showConfirmButton:false, customClass:{popup:'swal2-popup'} }); }
function showError(msg)   { Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text:msg, customClass:{popup:'swal2-popup'} }); }
function showConfirm(title, text, cb, confirmText) {
  Swal.fire({
    title:title, text:text, icon:'warning', showCancelButton:true,
    confirmButtonText: confirmText||'ยืนยัน', cancelButtonText:'ยกเลิก',
    reverseButtons:true, customClass:{popup:'swal2-popup'}
  }).then(function(r){ if(r.isConfirmed) cb(); });
}

// ===== MODAL =====
function openModal(title, bodyHtml, footerHtml, sizeClass) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml || '';
  document.getElementById('modalBox').className = 'bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col ' + (sizeClass || 'max-w-lg');
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
  document.getElementById('modalFooter').innerHTML = '';
}

// ===== UTILITIES =====
function formatDate(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function togglePass(inputId, btn) {
  var inp = document.getElementById(inputId);
  var isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  btn.querySelector('i').className = isPass ? 'fi fi-rr-eye-crossed text-sm' : 'fi fi-rr-eye text-sm';
}
function getStockClass(stock, min) {
  if (stock <= 0) return 'stock-critical';
  if (stock <= min) return 'stock-low';
  return 'stock-ok';
}
function getStockLabel(stock, min) {
  if (stock <= 0) return 'หมด';
  if (stock <= min) return 'ใกล้หมด';
  return 'ปกติ';
}
function imgUrl(fileId, size) {
  if (!fileId) return '';
  return getFileDataUrl(fileId) || '';
}

// ===== PAGINATION =====
function renderPagination(containerId, total, currentPage, onPageClick) {
  var totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  if (totalPages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }
  var html = '<div class="flex items-center justify-between mt-4">';
  html += '<p class="text-xs text-gray-500">ทั้งหมด ' + total + ' รายการ</p>';
  html += '<div class="flex gap-1">';
  if (currentPage > 1) html += '<button class="page-btn" onclick="(' + onPageClick + ')(' + (currentPage-1) + ')"><i class="fi fi-rr-angle-left"></i></button>';
  var start = Math.max(1, currentPage-2), end = Math.min(totalPages, currentPage+2);
  for (var p = start; p <= end; p++) {
    html += '<button class="page-btn ' + (p===currentPage?'active':'') + '" onclick="(' + onPageClick + ')(' + p + ')">' + p + '</button>';
  }
  if (currentPage < totalPages) html += '<button class="page-btn" onclick="(' + onPageClick + ')(' + (currentPage+1) + ')"><i class="fi fi-rr-angle-right"></i></button>';
  html += '</div></div>';
  document.getElementById(containerId).innerHTML = html;
}

// ===== LOGIN =====
function setLoginRole(role) {
  document.getElementById('loginRole').value = role;
  ['admin','staff','employee'].forEach(function(r) {
    var tab = document.getElementById('tab' + r.charAt(0).toUpperCase() + r.slice(1));
    if (r === role) { tab.className = 'role-tab active-tab flex-1 py-3.5 text-sm font-semibold text-center transition-all border-b-2'; }
    else            { tab.className = 'role-tab flex-1 py-3.5 text-sm font-semibold text-center transition-all border-b-2 border-transparent text-gray-400 hover:text-gray-600'; }
  });
}

function doLogin() {
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value;
  var role     = document.getElementById('loginRole').value;
  if (!username || !password) { showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  var btn = document.getElementById('btnLogin');
  btn.disabled = true; btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> กำลังเข้าสู่ระบบ...';
  callAPI('login', username, password, role).then(function(res) {
    btn.disabled = false; btn.innerHTML = '<i class="fi fi-rr-sign-in"></i> เข้าสู่ระบบ';
    if (res.success) {
      // login คืน user + config มาให้ครบแล้ว จึงเข้าหน้าหลักได้เลย
      // ไม่ต้องยิง validateSession / getPublicConfig / getMyProfile ซ้ำอีก 3 รอบ
      AUTH.set(res.token, res.user);
      applyPublicConfig(res.config);
      showMainShell();
      // backend ส่งข้อมูล Dashboard มากับ login แล้ว (ถ้าเป็นเวอร์ชันเก่าที่ไม่ส่ง จะไปเรียกเองตามปกติ)
      loadPage('dashboard', res.dashboard ? Promise.resolve(res.dashboard) : null);
      if (_QR_ACTION === 'withdraw' && _QR_ITEM_ID) {
        setTimeout(function() { openWithdrawFromQR(_QR_ITEM_ID); }, 800);
      }
    } else { showError(res.message); }
  }).catch(function(err) {
    btn.disabled = false; btn.innerHTML = '<i class="fi fi-rr-sign-in"></i> เข้าสู่ระบบ';
    showError(err && err.isBackendError
      ? err.message
      : 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือการ Deploy ของ Google Apps Script');
  });
}

function doLogout() {
  showConfirm('ออกจากระบบ', 'ต้องการออกจากระบบใช่หรือไม่?', function() {
    showLoading('กำลังออกจากระบบ...');
    // ออกจากระบบในเครื่องเสมอ แม้ backend จะไม่ตอบ (session ฝั่ง backend หมดอายุเองภายหลัง)
    callAPI('logout', AUTH.token).catch(function(){}).then(function() {
      AUTH.clear(); location.reload();
    });
  }, 'ออกจากระบบ');
}

function showForgotModal()  { document.getElementById('forgotModal').classList.remove('hidden'); }
function closeForgotModal() { document.getElementById('forgotModal').classList.add('hidden'); }
function submitForgotPassword() {
  var email = document.getElementById('forgotEmail').value.trim();
  if (!email) { showError('กรุณากรอกอีเมล'); return; }
  showLoading('กำลังส่งรหัสผ่านชั่วคราว...');
  callAPI('forgotPassword', email).then(function(res) {
    hideLoading(); closeForgotModal();
    if (res.success) showSuccess(res.message);
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

// ===== APP INIT =====
/**
 * initApp — เปิดเว็บขณะมี token ค้างอยู่
 * แสดงหน้าหลักทันทีจากข้อมูลผู้ใช้ที่จำไว้ในเครื่อง แล้วตรวจสอบสิทธิ์กับ backend เบื้องหลัง
 * (เดิมบล็อกทั้งหน้าจอด้วย "กำลังตรวจสอบสิทธิ์..." จน backend ตอบ ซึ่งบางรอบใช้เวลา 30 วินาทีขึ้นไป)
 * bootstrap รอบเดียวได้ทั้ง สิทธิ์ผู้ใช้ + config + ข้อมูล Dashboard
 */
function initApp() {
  var boot = callAPI('bootstrap', AUTH.token, true);
  var hasCachedUser = !!(AUTH.user && AUTH.user.id);

  if (hasCachedUser) {
    showMainShell();
    loadPage('dashboard', boot.then(function(res) {
      if (res && res.success && res.dashboard) return res.dashboard;
      if (res && res.success) return callAPI('getDashboardStats', AUTH.token);   // backend เวอร์ชันเก่า
      return res;
    }));
  } else {
    showLoading('กำลังตรวจสอบสิทธิ์...');
  }

  boot.then(function(res) {
    hideLoading();
    if (!res || !res.success || !res.user) {
      // token ใช้ไม่ได้แล้ว (หมดอายุ / บัญชีถูกระงับ) -> กลับหน้า login
      AUTH.clear(); closeModal(); showLoginPage();
      if (hasCachedUser) showError((res && res.message) || 'กรุณาเข้าสู่ระบบใหม่');
      loadAppConfig();
      return;
    }
    AUTH.user = res.user;
    localStorage.setItem('sup_user', JSON.stringify(AUTH.user));
    applyPublicConfig(res.config);
    if (hasCachedUser) {
      showMainShell();   // บทบาท/แผนกอาจถูกผู้ดูแลระบบแก้ไขระหว่างที่ไม่ได้เปิดเว็บ
    } else {
      showMainShell();
      loadPage('dashboard', res.dashboard ? Promise.resolve(res.dashboard) : null);
    }
    // QR action จาก URL
    if (_QR_ACTION === 'withdraw' && _QR_ITEM_ID) {
      setTimeout(function() { openWithdrawFromQR(_QR_ITEM_ID); }, 800);
    }
  }).catch(function() {
    hideLoading();
    // เชื่อมต่อ backend ไม่ได้ (ไม่ใช่ token ผิด) — ถ้าเปิดหน้าหลักไปแล้วให้อยู่หน้าเดิม ผู้ใช้กดลองใหม่ได้
    if (!hasCachedUser) showLoginPage();
  });
}

function showLoginPage() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('mainShell').classList.add('hidden');
}

function showMainShell() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainShell').classList.remove('hidden');
  applyUserToShell();
  var isAdmin  = AUTH.user.role === 'admin';
  var isStaff  = AUTH.user.role === 'staff';
  var notEmp   = AUTH.user.role !== 'employee';
  document.getElementById('menuItems').style.display    = isAdmin ? '' : 'none';
  document.getElementById('menuReceive').style.display  = notEmp  ? '' : 'none';
  document.getElementById('menuStocktake').style.display = canStocktake() ? '' : 'none';
  document.getElementById('menuPrintQR').style.display   = notEmp ? '' : 'none';
  document.getElementById('menuInventorySection').style.display = notEmp ? '' : 'none';
  document.getElementById('menuApprove').style.display  = canApprove() ? '' : 'none';
  document.getElementById('menuAdminSection').style.display = isAdmin ? '' : 'none';
  document.getElementById('menuReportLabel').style.display  = notEmp ? '' : 'none';
  document.getElementById('menuReportSection').style.display= notEmp ? '' : 'none';
  updateClock();
  if (!_clockTimer) _clockTimer = setInterval(updateClock, 60000);
}
var _clockTimer = null;

function updateClock() {
  var el = document.getElementById('topDateTime');
  if (el) el.textContent = new Date().toLocaleString('th-TH', { weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ===== NAVIGATION =====
var _currentPage = '';
var _pageCache   = {};

function loadPage(page, preloaded) {
  _currentPage = page;
  document.querySelectorAll('.menu-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-page') === page);
  });
  var titles = {
    dashboard:'ภาพรวมระบบ', stock:'สต็อกคงเหลือ', items:'รายการวัสดุ',
    receive:'รับวัสดุเข้าคลัง', stocktake:'นับสต็อก', printqr:'พิมพ์ QR สติ๊กเกอร์', withdraw:'เบิกวัสดุ', approve:'อนุมัติการเบิก',
    transactions:'ประวัติเคลื่อนไหว', reports:'รายงาน',
    users:'จัดการผู้ใช้งาน', settings:'ตั้งค่าระบบ', profile:'โปรไฟล์', manual:'คู่มือการใช้งาน'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  document.getElementById('pageBreadcrumb').textContent = 'ระบบวัสดุสิ้นเปลือง / ' + (titles[page] || page);
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
  var content = document.getElementById('mainContent');
  content.innerHTML = '<div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-4 border-navy-600 border-t-transparent rounded-full animate-spin"></div></div>';
  // render ทันที ไม่ต้องรอ setTimeout
  if (page === 'dashboard')    renderDashboard(preloaded);
  else if (page === 'stock')        renderStock();
  else if (page === 'items')        renderItems();
  else if (page === 'receive')      renderReceive();
  else if (page === 'stocktake')    renderStocktake();
  else if (page === 'printqr')      renderPrintQRLabels();
  else if (page === 'withdraw')     renderWithdraw();
  else if (page === 'approve')      renderApprove();
  else if (page === 'transactions') renderTransactions();
  else if (page === 'reports')      renderReports();
  else if (page === 'users')        renderUsers();
  else if (page === 'settings')     renderSettings();
  else if (page === 'profile')      renderProfile();
  else if (page === 'manual')       renderManual();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('hidden');
}

// ===== GLOBAL SEARCH =====
var _globalSearchTimer;
function debounceGlobalSearch() {
  clearTimeout(_globalSearchTimer);
  _globalSearchTimer = setTimeout(performGlobalSearch, 300);
}
function performGlobalSearch() {
  var q = (document.getElementById('globalSearch')||{}).value||'';
  var resultsDiv = document.getElementById('globalSearchResults');
  if (!q || q.length < 2) { resultsDiv.classList.add('hidden'); return; }
  var term = q.toLowerCase();
  var matches = (_itemsData || []).filter(function(i) {
    return i.active !== false && (
      (i.name||'').toLowerCase().includes(term) ||
      (i.item_code||'').toLowerCase().includes(term) ||
      (i.category||'').toLowerCase().includes(term)
    );
  }).slice(0, 8);
  if (matches.length === 0) { resultsDiv.classList.add('hidden'); return; }
  var html = '';
  matches.forEach(function(item) {
    var img = imgUrl(item.image_file_id);
    var imgHtml = img ? '<img src="' + img + '" class="w-8 h-8 object-cover rounded-lg border border-gray-200">' : '<div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><i class="fi fi-rr-box-open-full text-gray-400 text-xs"></i></div>';
    html += '<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" onclick="globalSearchGoTo(\'' + item.id + '\')">';
    html += imgHtml;
    html += '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-800 truncate">' + escHtml(item.name) + '</p>';
    html += '<p class="text-xs text-gray-500">' + escHtml(item.item_code) + ' • คงเหลือ ' + item.current_stock + ' ' + escHtml(item.unit) + '</p></div>';
    html += '<i class="fi fi-rr-angle-right text-gray-400 text-xs"></i></div>';
  });
  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove('hidden');
}
function globalSearchGoTo(itemId) {
  document.getElementById('globalSearch').value = '';
  document.getElementById('globalSearchResults').classList.add('hidden');
  showItemDetailModal(itemId);
}
// ปิด dropdown เมื่อ click นอก
window.addEventListener('click', function(e) {
  var gs = document.getElementById('globalSearch');
  var gr = document.getElementById('globalSearchResults');
  if (gs && gr && !gs.contains(e.target) && !gr.contains(e.target)) {
    gr.classList.add('hidden');
  }
});

// ===== DASHBOARD =====
var _charts = {};

// ----- แคช Dashboard ในเครื่อง: เปิดหน้าแล้วเห็นข้อมูลรอบล่าสุดทันที ระหว่างรอ backend ส่งข้อมูลใหม่ -----
var DASH_CACHE_PREFIX = 'sup_dash_';
var _dashSeq = 0;   // ลำดับการโหลด ใช้ทิ้งคำตอบของรอบเก่าที่มาถึงทีหลัง

function dashCacheKey() { return DASH_CACHE_PREFIX + ((AUTH.user && AUTH.user.id) || ''); }
function readDashCache() {
  try {
    var c = JSON.parse(localStorage.getItem(dashCacheKey()) || 'null');
    return (c && c.data && c.data.kpi) ? c : null;
  } catch (e) { return null; }
}
function writeDashCache(data) {
  try { localStorage.setItem(dashCacheKey(), JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
}
function clearDashCache() {
  try {
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf(DASH_CACHE_PREFIX) === 0) localStorage.removeItem(k);
    });
  } catch (e) {}
}
// มีการเขียนข้อมูลจากเครื่องนี้ (อนุมัติ/รับเข้า/ปรับยอด ฯลฯ) -> ตัวเลขที่แคชไว้ไม่ตรงแล้ว
window.onApiWrite = function(fnName) {
  if (fnName !== 'login' && fnName !== 'logout') clearDashCache();
};

function dashTime(t) {
  return new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/** dashStatusHTML — แถบสถานะข้อมูลบนสุดของ Dashboard (state: fresh | updating | failed) */
function dashStatusHTML(state, time) {
  var at = time ? 'ข้อมูล ณ ' + dashTime(time) + ' น.' : '';
  if (state === 'updating') {
    return '<span class="w-3 h-3 border-2 border-navy-600 border-t-transparent rounded-full animate-spin"></span>'
      + '<span>' + (at ? at + ' — ' : '') + 'กำลังอัปเดตข้อมูลล่าสุด...</span>';
  }
  if (state === 'failed') {
    return '<i class="fi fi-rr-triangle-warning text-amber-500"></i><span class="text-amber-700">อัปเดตข้อมูลล่าสุดไม่สำเร็จ — แสดง' + at + '</span>'
      + '<button onclick="renderDashboard()" class="text-navy-600 hover:underline font-medium">ลองใหม่</button>';
  }
  return '<span>' + at + '</span><button onclick="renderDashboard()" title="โหลดข้อมูลล่าสุด" class="text-navy-600 hover:underline"><i class="fi fi-rr-refresh mr-1"></i>รีเฟรช</button>';
}

/**
 * renderDashboard — แสดงข้อมูลที่แคชไว้ทันที (ถ้ามี) แล้วโหลดข้อมูลล่าสุดมาแทนเบื้องหลัง
 * preloaded = Promise ของข้อมูล Dashboard ที่ได้มากับ login / bootstrap (ไม่ต้องเรียก backend อีกรอบ)
 */
function renderDashboard(preloaded) {
  var seq    = ++_dashSeq;
  var cached = readDashCache();
  var shown  = document.getElementById('dashStatus');   // มี Dashboard แสดงอยู่แล้ว (กดรีเฟรช / เพิ่งอนุมัติจากหน้านี้)
  if (cached) buildDashboard(cached.data, 'updating', cached.t, !!shown);
  else if (shown) shown.innerHTML = dashStatusHTML('updating', 0);

  (preloaded || callAPI('getDashboardStats', AUTH.token)).then(function(res) {
    if (res && res.success && res.kpi) writeDashCache(res);
    if (seq !== _dashSeq || _currentPage !== 'dashboard') return;   // ผู้ใช้ไปหน้าอื่นแล้ว / มีรอบใหม่กว่า
    if (!res || !res.success || !res.kpi) { dashboardLoadFailed((res && res.message) || '', cached); return; }
    buildDashboard(res, 'fresh', Date.now(), !!cached);
  }).catch(function(err) {
    console.error('โหลด Dashboard ไม่สำเร็จ:', err);
    if (seq !== _dashSeq || _currentPage !== 'dashboard') return;
    dashboardLoadFailed('', cached);
  });
}

/** dashboardLoadFailed — โหลดไม่สำเร็จหลังลองซ้ำครบแล้ว: คงข้อมูลเดิมไว้ (ถ้ามี) และให้กดลองใหม่ได้ */
function dashboardLoadFailed(message, cached) {
  var status = document.getElementById('dashStatus');
  if (cached && status) { status.innerHTML = dashStatusHTML('failed', cached.t); return; }
  document.getElementById('mainContent').innerHTML = '<div class="card p-10 text-center max-w-lg mx-auto mt-6">'
    + '<i class="fi fi-rr-triangle-warning text-5xl text-gray-300 block mb-3"></i>'
    + '<p class="font-semibold text-gray-700">โหลดข้อมูล Dashboard ไม่สำเร็จ</p>'
    + '<p class="text-sm text-gray-500 mt-1 mb-4">' + escHtml(message || 'ระบบหลังบ้าน (Google Apps Script) ไม่ตอบกลับ ระบบลองใหม่ให้อัตโนมัติแล้ว กรุณาลองอีกครั้ง') + '</p>'
    + '<button onclick="loadPage(\'dashboard\')" class="btn-primary"><i class="fi fi-rr-refresh mr-1"></i>ลองใหม่</button></div>';
}

function buildDashboard(res, state, time, noFade) {
  var d  = res;
  var kpi= res.kpi;

  var badge = document.getElementById('pendingBadge');
  if (kpi.pending > 0) { badge.textContent = kpi.pending; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }
  updateStocktakeBadge(kpi.pending_stocktake);

  var lowBadge = document.getElementById('lowStockBadge');
  if (kpi.low_stock > 0) { lowBadge.textContent = kpi.low_stock; lowBadge.classList.remove('hidden'); }
  else { lowBadge.classList.add('hidden'); }

  var html = '<div class="' + (noFade ? '' : 'fade-in ') + 'space-y-5">';
  html += '<div id="dashStatus" class="flex items-center justify-end gap-2 text-xs text-gray-400">' + dashStatusHTML(state, time) + '</div>';

  if (d.low_stock_items && d.low_stock_items.length > 0) {
    html += '<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">';
    html += '<i class="fi fi-rr-triangle-warning text-amber-500 text-lg mt-0.5 flex-shrink-0"></i>';
    html += '<div class="flex-1">';
    html += '<p class="font-semibold text-amber-800 text-sm">วัสดุใกล้หมด/หมดสต็อก</p>';
    html += '<p class="text-xs text-amber-700 mt-1">' + d.low_stock_items.map(function(i){ return i.name + ' (เหลือ ' + i.current_stock + ' ' + i.unit + ')'; }).join(' • ') + '</p>';
    html += '</div></div>';
  }

  html += '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">';
  var kpis = [
    { label:'รายการวัสดุ', value:kpi.total_items, icon:'fi-rr-box-open-full', color:'bg-blue-100', iconColor:'text-blue-600', danger:false },
    { label:'สต็อกต่ำ/หมด', value:kpi.low_stock, icon:'fi-rr-triangle-warning', color:'bg-amber-100', iconColor:'text-amber-600', danger: kpi.low_stock > 0 },
    { label:'รออนุมัติ', value:kpi.pending, icon:'fi-rr-time-forward', color:'bg-purple-100', iconColor:'text-purple-600', danger: kpi.pending > 0 },
    { label:'เคลื่อนไหววันนี้', value:kpi.today_tx, icon:'fi-rr-activity', color:'bg-green-100', iconColor:'text-green-600', danger:false }
  ];
  kpis.forEach(function(k) {
    html += '<div class="card kpi-card p-4">';
    html += '<div class="flex items-center justify-between mb-3">';
    html += '<div class="w-11 h-11 ' + k.color + ' rounded-xl flex items-center justify-center"><i class="fi ' + k.icon + ' ' + k.iconColor + ' text-xl"></i></div>';
    if (k.danger && k.value > 0) html += '<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">!</span>';
    html += '</div>';
    html += '<p class="text-2xl font-bold text-gray-800">' + k.value + '</p>';
    html += '<p class="text-xs text-gray-500 mt-0.5">' + k.label + '</p>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="card">';
  html += '<div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-arrow-right text-navy-600"></i> Workflow การเบิกวัสดุ</h3></div>';
  html += '<div class="card-body"><div class="flex items-center justify-center gap-2 flex-wrap">';
  var wfSteps = [
    { label:'ยื่นขอ', color:'bg-blue-500', icon:'fi-rr-inbox-out' },
    { label:'รออนุมัติ', color:'bg-amber-500', icon:'fi-rr-time-forward' },
    { label:'อนุมัติ', color:'bg-green-500', icon:'fi-rr-check-circle' },
    { label:'จ่ายวัสดุ', color:'bg-purple-500', icon:'fi-rr-hand-holding-box' },
    { label:'เสร็จสิ้น', color:'bg-teal-500', icon:'fi-rr-badge-check' }
  ];
  var wfCounts = [kpi.pending + (kpi.today_tx||0), kpi.pending, 0, kpi.today_tx, 0];
  wfSteps.forEach(function(s, i) {
    html += '<div class="text-center"><div class="wf-bubble ' + s.color + ' mx-auto"><i class="fi ' + s.icon + ' text-base"></i></div>';
    html += '<p class="text-xs text-gray-600 mt-1">' + s.label + '</p>';
    html += '<p class="text-sm font-bold text-navy-700">' + (wfCounts[i]||0) + '</p></div>';
    if (i < wfSteps.length-1) html += '<i class="fi fi-rr-angle-right wf-arrow mt-3"></i>';
  });
  html += '</div></div></div>';

  html += '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">';
  html += '<div class="card lg:col-span-2"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-chart-histogram text-navy-600"></i> สถิติรับ-เบิก 6 เดือนล่าสุด</h3></div>';
  html += '<div class="card-body"><div style="position:relative;height:220px"><canvas id="chartMonthly"></canvas></div></div></div>';
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-chart-pie text-navy-600"></i> สัดส่วนวัสดุ</h3></div>';
  html += '<div class="card-body"><div style="position:relative;height:220px"><canvas id="chartCategory"></canvas></div></div></div>';
  html += '</div>';

  html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">';
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-chart-line text-navy-600"></i> เทรนด์การเบิกรายเดือน</h3></div>';
  html += '<div class="card-body"><div style="position:relative;height:220px"><canvas id="chartWdTrend"></canvas></div></div></div>';
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-chart-bar text-navy-600"></i> การเบิกตามหมวดหมู่</h3></div>';
  html += '<div class="card-body"><div style="position:relative;height:220px"><canvas id="chartWdCat"></canvas></div></div></div>';
  html += '</div>';

  html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm">รายการเคลื่อนไหวล่าสุด</h3>';
  html += '<button onclick="loadPage(\'transactions\')" class="text-xs text-navy-600 hover:underline">ดูทั้งหมด</button></div>';
  html += '<div class="card-body p-0"><div class="divide-y">';
  if (d.recent_transactions && d.recent_transactions.length > 0) {
    d.recent_transactions.slice(0,6).forEach(function(t) {
      var meta = txTypeMeta(t);
      html += '<div class="flex items-center gap-3 px-4 py-3">';
      html += '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ' + meta.bg + '">';
      html += '<i class="fi ' + meta.icon + ' text-sm"></i></div>';
      html += '<div class="flex-1 min-w-0"><p class="text-xs font-medium text-gray-700 truncate">' + escHtml(t.item_name) + '</p>';
      html += '<p class="text-xs text-gray-400">' + meta.sign + t.quantity + ' ' + (t.unit||'') + ' • ' + (t.actor_name||'-') + '</p></div>';
      html += '<span class="text-xs text-gray-400 flex-shrink-0">' + formatDate(t.date) + '</span></div>';
    });
  } else { html += '<p class="text-center text-xs text-gray-400 py-6">ยังไม่มีรายการ</p>'; }
  html += '</div></div></div>';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm">คำขอเบิกรออนุมัติ</h3>';
  if (canApprove()) html += '<button onclick="loadPage(\'approve\')" class="text-xs text-navy-600 hover:underline">จัดการ</button>';
  html += '</div><div class="card-body p-0"><div class="divide-y">';
  if (d.recent_pending && d.recent_pending.length > 0) {
    d.recent_pending.forEach(function(w) {
      html += '<div class="flex items-center gap-3 px-4 py-3">';
      html += '<div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fi fi-rr-time-forward text-amber-600 text-sm"></i></div>';
      html += '<div class="flex-1 min-w-0"><p class="text-xs font-medium text-gray-700 truncate">' + escHtml(w.item_name) + '</p>';
      html += '<p class="text-xs text-gray-400">' + w.quantity_requested + ' ' + w.unit + ' • ' + escHtml(w.requested_by_name) + '</p></div>';
      if (canApprove()) {
        html += '<div class="flex gap-1 flex-shrink-0">';
        html += '<button onclick="quickApprove(\'' + w.id + '\',' + w.quantity_requested + ')" class="btn-success btn-sm text-xs px-2 py-1 rounded-lg"><i class="fi fi-rr-check"></i></button>';
        html += '<button onclick="quickReject(\'' + w.id + '\')" class="btn-danger btn-sm text-xs px-2 py-1 rounded-lg"><i class="fi fi-rr-cross"></i></button></div>';
      }
      html += '</div>';
    });
  } else { html += '<p class="text-center text-xs text-gray-400 py-6">ไม่มีคำขอรออนุมัติ</p>'; }
  html += '</div></div></div>';

  html += '</div>';

  if (d.top_items && d.top_items.length > 0) {
    html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-star text-amber-500"></i> Top 5 วัสดุที่เบิกมากสุด</h3></div>';
    html += '<div class="card-body space-y-3">';
    var maxQty = d.top_items[0].qty || 1;
    d.top_items.forEach(function(item, idx) {
      var pct = Math.round(item.qty / maxQty * 100);
      html += '<div class="flex items-center gap-3">';
      html += '<span class="text-xs font-bold text-gray-400 w-4 text-right">' + (idx+1) + '</span>';
      html += '<div class="flex-1"><p class="text-xs font-medium text-gray-700 mb-1 truncate">' + escHtml(item.name) + '</p>';
      html += '<div class="progress-bar"><div class="progress-fill bg-navy-600" style="width:' + pct + '%"></div></div></div>';
      html += '<span class="text-xs font-bold text-navy-700 w-8 text-right">' + item.qty + '</span></div>';
    });
    html += '</div></div>';
  }

  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;

  setTimeout(function() {
    if (_charts.monthly) _charts.monthly.destroy();
    var ctxM = document.getElementById('chartMonthly');
    if (ctxM) {
      _charts.monthly = new Chart(ctxM, {
        type:'bar',
        data:{
          labels: d.monthly.map(function(m){ return m.label; }),
          datasets:[
            { label:'รับเข้า', data:d.monthly.map(function(m){ return m.receive; }), backgroundColor:'#3b82f6', borderRadius:6, barPercentage:0.6 },
            { label:'เบิกออก', data:d.monthly.map(function(m){ return m.withdraw; }), backgroundColor:'#8b5cf6', borderRadius:6, barPercentage:0.6 }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{family:'Sarabun',size:11},boxWidth:12}}}, scales:{y:{ticks:{font:{family:'Sarabun',size:11}},grid:{color:'#f3f4f6'}},x:{ticks:{font:{family:'Sarabun',size:11}},grid:{display:false}}} }
      });
    }
    if (_charts.category) _charts.category.destroy();
    var ctxC = document.getElementById('chartCategory');
    if (ctxC && d.category_stock) {
      var cats = Object.keys(d.category_stock);
      var vals = cats.map(function(k){ return d.category_stock[k]; });
      var colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];
      _charts.category = new Chart(ctxC, {
        type:'doughnut',
        data:{ labels:cats, datasets:[{ data:vals, backgroundColor:colors.slice(0,cats.length), borderWidth:0, hoverOffset:6 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{position:'bottom',labels:{font:{family:'Sarabun',size:10},boxWidth:10,padding:8}} } }
      });
    }
    // Withdrawal trend line chart
    if (_charts.wdTrend) _charts.wdTrend.destroy();
    var ctxT = document.getElementById('chartWdTrend');
    if (ctxT && d.monthly) {
      _charts.wdTrend = new Chart(ctxT, {
        type:'line',
        data:{
          labels: d.monthly.map(function(m){ return m.label; }),
          datasets:[{
            label:'เบิกออก',
            data:d.monthly.map(function(m){ return m.withdraw; }),
            borderColor:'#8b5cf6',
            backgroundColor:'rgba(139,92,246,0.15)',
            fill:true,
            tension:0.3,
            pointRadius:4,
            pointBackgroundColor:'#8b5cf6'
          }]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{font:{family:'Sarabun',size:11}},grid:{color:'#f3f4f6'}},x:{ticks:{font:{family:'Sarabun',size:11}},grid:{display:false}}} }
      });
    }
    // Category withdrawal bar chart
    if (_charts.wdCat) _charts.wdCat.destroy();
    var ctxW = document.getElementById('chartWdCat');
    var catTotals = d.withdraw_by_category || {};
    if (ctxW && Object.keys(catTotals).length > 0) {
      var catKeys = Object.keys(catTotals).sort(function(a,b){ return catTotals[b] - catTotals[a]; }).slice(0,6);
      var catVals = catKeys.map(function(k){ return catTotals[k]; });
      var barColors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
      _charts.wdCat = new Chart(ctxW, {
        type:'bar',
        data:{ labels:catKeys, datasets:[{ label:'จำนวนเบิก', data:catVals, backgroundColor:barColors.slice(0,catKeys.length), borderRadius:6, barPercentage:0.6 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){ return c.raw + ' รายการ'; }}}}, scales:{y:{ticks:{font:{family:'Sarabun',size:11}},grid:{color:'#f3f4f6'}},x:{ticks:{font:{family:'Sarabun',size:10}},grid:{display:false}}} }
      });
    } else if (ctxW) {
      // ถ้าไม่มีข้อมูลการเบิก แสดงข้อความ
      ctxW.parentNode.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-gray-400">ยังไม่มีข้อมูลการเบิก</div>';
    }
  }, 100);
}

function quickApprove(wdId, qty) {
  showConfirm('อนุมัติการเบิก', 'ยืนยันอนุมัติ ' + qty + ' รายการ?', function() {
    showLoading('กำลังอนุมัติ...');
    callAPI('approveWithdrawal', AUTH.token, wdId, qty).then(function(res) {
      hideLoading();
      if (res.success) { showSuccess('อนุมัติสำเร็จ'); renderDashboard(); }
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  }, 'อนุมัติ');
}

function quickReject(wdId) {
  Swal.fire({
    title:'เหตุผลที่ปฏิเสธ', input:'text', inputPlaceholder:'ระบุเหตุผล...',
    showCancelButton:true, confirmButtonText:'ปฏิเสธ', cancelButtonText:'ยกเลิก',
    inputValidator:function(v){ if(!v) return 'กรุณาระบุเหตุผล'; },
    customClass:{popup:'swal2-popup'}
  }).then(function(r) {
    if (!r.isConfirmed) return;
    showLoading('กำลังดำเนินการ...');
    callAPI('rejectWithdrawal', AUTH.token, wdId, r.value).then(function(res) {
      hideLoading();
      if (res.success) { showSuccess('ปฏิเสธคำขอแล้ว'); renderDashboard(); }
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  });
}

// ===== ITEMS =====
var _itemsData = [];
var _itemsPage = 1;
var _itemsFilter = { search:'', category:'all', stock:'all' };
var _itemImageFileId = null;
var _itemsCacheTime = 0;
var _configLogoFileId = null;
var ITEMS_CACHE_TTL = 30000; // 30 วินาที

function renderItems() {
  if (AUTH.user.role !== 'admin') { loadPage('stock'); return; }
  showLoading('โหลดรายการวัสดุ...');
  // reuse cache ถ้ายังไม่หมดอายุ
  if (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL) {
    hideLoading();
    updateLowStockBadge(_itemsData);
    _itemsPage = 1;
    buildItemsPage();
    return;
  }
  callAPI('getItems', AUTH.token).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    _itemsData = res.data;
    _itemsCacheTime = Date.now();
    updateLowStockBadge(_itemsData);
    _itemsPage  = 1;
    buildItemsPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildItemsPage() {
  var filtered = filterItems(_itemsData, _itemsFilter);
  var paged    = paginate(filtered, _itemsPage);
  var cats     = getCategoryList(_itemsData);

  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">';
  html += '<div class="flex gap-2 flex-wrap">';
  html += '<div class="relative"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>';
  html += '<input type="text" id="itemSearch" placeholder="ค้นหาวัสดุ..." value="' + escHtml(_itemsFilter.search) + '"';
  html += ' onkeyup="debounceItemFilter()" class="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 w-48"></div>';
  html += '<div class="relative"><i class="fi fi-rr-barcode-read absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>';
  html += '<input type="text" id="itemBarcodeSearch" placeholder="ยิงบาร์โค้ดค้นหา..." onkeydown="handleItemBarcodeScan(event)" class="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 w-48"></div>';
  html += '<select id="itemCatFilter" onchange="applyItemFilter()" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">';
  html += '<option value="all">ทุกหมวดหมู่</option>';
  cats.forEach(function(c){ html += '<option value="' + escHtml(c) + '" ' + (_itemsFilter.category===c?'selected':'') + '>' + escHtml(c) + '</option>'; });
  html += '</select>';
  html += '<select id="itemStockFilter" onchange="applyItemFilter()" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">';
  html += '<option value="all">สต็อกทั้งหมด</option><option value="low" ' + (_itemsFilter.stock==='low'?'selected':'') + '>ใกล้หมด</option><option value="ok" ' + (_itemsFilter.stock==='ok'?'selected':'') + '>ปกติ</option>';
  html += '</select></div>';
  html += '<div class="flex gap-2 flex-wrap">';
  html += '<button onclick="downloadCSVSample()" class="btn-secondary flex items-center gap-2 whitespace-nowrap btn-sm"><i class="fi fi-rr-download"></i> ไฟล์ตัวอย่าง</button>';
  html += '<button onclick="openImportCSVModal()" class="btn-success flex items-center gap-2 whitespace-nowrap btn-sm"><i class="fi fi-rr-upload"></i> นำเข้า CSV</button>';
  html += '<button onclick="openBulkAddItemsModal()" class="btn-primary flex items-center gap-2 whitespace-nowrap" style="background:#0e7490"><i class="fi fi-rr-add-document"></i> เพิ่มหลายรายการ</button>';
  html += '<button onclick="openAddItemModal()" class="btn-primary flex items-center gap-2 whitespace-nowrap"><i class="fi fi-rr-plus"></i> เพิ่มวัสดุใหม่</button></div></div>';

  html += '<div class="flex gap-2 flex-wrap text-xs">';
  html += '<span class="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium"><i class="fi fi-rr-box-open-full mr-1"></i>ทั้งหมด: ' + _itemsData.length + '</span>';
  var lowCount = _itemsData.filter(function(i){ return i.current_stock <= i.min_stock; }).length;
  if (lowCount > 0) html += '<span class="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-medium"><i class="fi fi-rr-triangle-warning mr-1"></i>ใกล้หมด: ' + lowCount + '</span>';
  html += '</div>';

  html += '<div class="card overflow-hidden">';
  html += '<div class="hidden md:block overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-gray-600 text-xs">';
  html += '<tr><th class="px-4 py-3 text-left w-10">#</th><th class="px-4 py-3 text-left w-14">รูป</th><th class="px-4 py-3 text-left">รหัส</th><th class="px-4 py-3 text-left">ชื่อวัสดุ</th><th class="px-4 py-3 text-left">ขนาด</th><th class="px-4 py-3 text-left">หน่วย</th><th class="px-4 py-3 text-left">หมวดหมู่</th><th class="px-4 py-3 text-center">สต็อก</th><th class="px-4 py-3 text-center">ขั้นต่ำ</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead>';
  html += '<tbody class="divide-y divide-gray-100">';
  if (paged.length === 0) {
    html += '<tr><td colspan="11" class="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>';
  }
  paged.forEach(function(item, idx) {
    var sClass = getStockClass(item.current_stock, item.min_stock);
    var sLabel = getStockLabel(item.current_stock, item.min_stock);
    var imgUrlSrc = imgUrl(item.image_file_id);
    var imgHtml = imgUrlSrc ? '<img src="' + imgUrlSrc + '" class="w-10 h-10 object-cover rounded-lg border border-gray-200">' : '<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400"><i class="fi fi-rr-box-open-full text-sm"></i></div>';
    html += '<tr>';
    html += '<td class="px-4 py-3 text-gray-400 text-xs">' + ((_itemsPage-1)*ITEMS_PER_PAGE + idx + 1) + '</td>';
    html += '<td class="px-4 py-3">' + imgHtml + '</td>';
    html += '<td class="px-4 py-3 font-mono text-xs text-navy-700">' + escHtml(item.item_code) + '</td>';
    html += '<td class="px-4 py-3 font-medium text-gray-800">' + escHtml(item.name) + '</td>';
    html += '<td class="px-4 py-3 text-gray-500 text-xs">' + escHtml(item.size||'-') + '</td>';
    html += '<td class="px-4 py-3 text-gray-600 text-xs">' + escHtml(item.unit) + '</td>';
    html += '<td class="px-4 py-3 text-xs text-gray-500">' + escHtml(item.category||'-') + '</td>';
    html += '<td class="px-4 py-3 text-center font-bold text-gray-800">' + item.current_stock + '</td>';
    html += '<td class="px-4 py-3 text-center text-gray-500 text-xs">' + item.min_stock + '</td>';
    html += '<td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span></td>';
    html += '<td class="px-4 py-3 text-center"><div class="flex items-center justify-center gap-1">';
    html += '<button title="ดูรายละเอียด" onclick="showItemDetailModal(\'' + item.id + '\')" class="w-7 h-7 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-200"><i class="fi fi-rr-eye text-xs"></i></button>';
    html += '<button title="QR Code" onclick="showQRModal(\'' + item.id + '\')" class="w-7 h-7 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center hover:bg-teal-200"><i class="fi fi-rr-qr-scan text-xs"></i></button>';
    html += '<button title="แก้ไข" onclick="openEditItemModal(\'' + item.id + '\')" class="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200"><i class="fi fi-rr-edit text-xs"></i></button>';
    html += '<button title="ลบ" onclick="deleteItemConfirm(\'' + item.id + '\',\'' + escHtml(item.name) + '\')" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200"><i class="fi fi-rr-trash text-xs"></i></button>';
    html += '</div></td></tr>';
  });
  html += '</tbody></table></div>';

  html += '<div class="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">';
  if (paged.length === 0) html += '<p class="col-span-full text-center text-sm text-gray-400 py-8">ไม่พบรายการ</p>';
  paged.forEach(function(item) {
    var sClass = getStockClass(item.current_stock, item.min_stock);
    var sLabel = getStockLabel(item.current_stock, item.min_stock);
    var imgUrlSrc = imgUrl(item.image_file_id);
    var imgHtml = imgUrlSrc ? '<img src="' + imgUrlSrc + '" class="w-14 h-14 object-cover rounded-xl border border-gray-200">' : '<div class="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-box-open-full text-gray-400 text-xl"></i></div>';
    html += '<div class="card p-4 flex flex-col gap-3">';
    html += '<div class="flex items-start justify-between">';
    html += '<div>' + imgHtml + '</div>';
    html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span></div>';
    html += '<div><p class="font-semibold text-gray-800 text-sm leading-snug">' + escHtml(item.name) + '</p>';
    html += '<p class="text-xs text-gray-400 mt-0.5">' + escHtml(item.item_code) + ' • ' + escHtml(item.size||'') + '</p>';
    html += '<p class="text-xs text-gray-500 mt-0.5">' + escHtml(item.category||'') + '</p></div>';
    html += '<div class="flex justify-between text-xs text-gray-500"><span>คงเหลือ</span><span class="font-bold text-gray-800">' + item.current_stock + ' ' + escHtml(item.unit) + '</span></div>';
    html += '<div class="flex gap-2 pt-1">';
    html += '<button onclick="showItemDetailModal(\'' + item.id + '\')" class="flex-1 btn-secondary btn-sm text-xs"><i class="fi fi-rr-eye mr-1"></i>ดู</button>';
    html += '<button onclick="showQRModal(\'' + item.id + '\')" class="flex-1 btn-success btn-sm text-xs" style="background:#e0f2f1;color:#00695c;border-color:#b2dfdb"><i class="fi fi-rr-qr-scan mr-1"></i>QR</button>';
    html += '<button onclick="openEditItemModal(\'' + item.id + '\')" class="flex-1 btn-primary btn-sm text-xs"><i class="fi fi-rr-edit mr-1"></i>แก้ไข</button>';
    html += '</div></div>';
  });
  html += '</div></div>';

  html += '<div id="itemsPagination"></div>';
  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('itemsPagination', filtered.length, _itemsPage, function(p) { _itemsPage = p; buildItemsPage(); });
}

function filterItems(data, f) {
  return data.filter(function(i) {
    if (f.search && !i.name.toLowerCase().includes(f.search.toLowerCase()) && !(i.item_code||'').toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.category !== 'all' && i.category !== f.category) return false;
    if (f.stock === 'low' && i.current_stock > i.min_stock) return false;
    if (f.stock === 'ok'  && i.current_stock <= i.min_stock) return false;
    return true;
  });
}
function getCategoryList(data) {
  var cats = {};
  data.forEach(function(i){ if(i.category) cats[i.category]=1; });
  return Object.keys(cats).sort();
}
function paginate(data, page) {
  return data.slice((page-1)*ITEMS_PER_PAGE, page*ITEMS_PER_PAGE);
}

function handleItemBarcodeScan(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var input = document.getElementById('itemBarcodeSearch');
  var code = (input||{}).value||'';
  if (!code.trim()) return;
  var item = _itemsData.find(function(i){ return (i.barcode||'') === code.trim(); });
  if (input) input.value = '';
  if (item) showItemDetailModal(item.id);
  else showError('ไม่พบวัสดุที่มีบาร์โค้ดนี้');
}

var _filterTimer;
function debounceItemFilter() { clearTimeout(_filterTimer); _filterTimer = setTimeout(applyItemFilter, 400); }
function applyItemFilter() {
  _itemsFilter.search   = (document.getElementById('itemSearch') || {}).value || '';
  _itemsFilter.category = (document.getElementById('itemCatFilter') || {}).value || 'all';
  _itemsFilter.stock    = (document.getElementById('itemStockFilter') || {}).value || 'all';
  _itemsPage = 1;
  buildItemsPage();
}

function downloadCSVSample() {
  var csv = 'รหัส,ชื่อวัสดุ,ขนาด,หน่วย,หมวดหมู่,สต็อกเริ่มต้น,สต็อกขั้นต่ำ,รายละเอียด\n';
  csv += 'SUP-001,ถุงมือยาง (ไม่มีแป้ง) สีฟ้า,size S,กล่อง,อุปกรณ์ป้องกัน,20,5,ถุงมือยางไม่มีแป้งสำหรับงานทั่วไป\n';
  csv += 'SUP-002,ถุงมือยาง (ไม่มีแป้ง) สีฟ้า,size M,กล่อง,อุปกรณ์ป้องกัน,15,5,ถุงมือยางไม่มีแป้งสำหรับงานทั่วไป\n';
  csv += 'SUP-003,สำลี,200 g.,ถุง,วัสถุดิบทางการแพทย์,50,10,สำลีสะอาดบริสุทธิ์ 200 กรัม\n';
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ตัวอย่าง_รายการวัสดุ.csv';
  link.click();
}

var _csvImportRows = [];
function openImportCSVModal() {
  _csvImportRows = [];
  var body = '<div class="space-y-4">';
  body += '<p class="text-sm text-gray-600">อัปโหลดไฟล์ CSV ตามรูปแบบตัวอย่าง ระบบจะแสดงตัวอย่างข้อมูลก่อนนำเข้า</p>';
  body += '<input type="file" id="csvImportFile" accept=".csv" onchange="previewCSVImport()" class="form-input py-1.5">';
  body += '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">';
  body += '<p class="font-semibold mb-1">หมายเหตุ</p>';
  body += '<ul class="list-disc list-inside space-y-0.5">';
  body += '<li>รองรับไฟล์ .csv เท่านั้น (UTF-8)</li>';
  body += '<li>คอลัมน์: รหัส,ชื่อวัสดุ,ขนาด,หน่วย,หมวดหมู่,สต็อกเริ่มต้น,สต็อกขั้นต่ำ,รายละเอียด</li>';
  body += '<li>หากไม่มีรหัส ระบบจะสร้างรหัสอัตโนมัติ</li>';
  body += '</ul></div>';
  body += '<div id="csvImportPreview"></div>';
  body += '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="handleCSVImport()" class="btn-success"><i class="fi fi-rr-upload mr-1"></i>นำเข้า</button>';
  openModal('นำเข้ารายการวัสดุจาก CSV', body, footer);
}

function previewCSVImport() {
  var input = document.getElementById('csvImportFile');
  var previewDiv = document.getElementById('csvImportPreview');
  if (!input || !input.files[0]) { previewDiv.innerHTML = ''; return; }
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    _csvImportRows = parseCSV(e.target.result);
    if (_csvImportRows.length === 0) { previewDiv.innerHTML = '<p class="text-sm text-red-500">ไม่พบข้อมูลในไฟล์</p>'; return; }
    var html = '<p class="text-sm font-medium text-gray-700 mb-2">ตัวอย่างข้อมูล (' + _csvImportRows.length + ' รายการ)</p>';
    html += '<div class="max-h-64 overflow-y-auto border border-gray-200 rounded-xl">';
    html += '<table class="w-full text-xs"><thead class="bg-gray-50 text-gray-600 sticky top-0">';
    html += '<tr><th class="px-2 py-1.5 text-left">รหัส</th><th class="px-2 py-1.5 text-left">ชื่อ</th><th class="px-2 py-1.5 text-left">หน่วย</th><th class="px-2 py-1.5 text-center">สต็อก</th><th class="px-2 py-1.5 text-center">ขั้นต่ำ</th></tr></thead><tbody class="divide-y divide-gray-100">';
    _csvImportRows.forEach(function(row) {
      html += '<tr><td class="px-2 py-1.5">' + escHtml(row['รหัส'] || '-') + '</td>';
      html += '<td class="px-2 py-1.5">' + escHtml(row['ชื่อวัสดุ'] || '') + '</td>';
      html += '<td class="px-2 py-1.5">' + escHtml(row['หน่วย'] || '') + '</td>';
      html += '<td class="px-2 py-1.5 text-center">' + escHtml(row['สต็อกเริ่มต้น'] || '0') + '</td>';
      html += '<td class="px-2 py-1.5 text-center">' + escHtml(row['สต็อกขั้นต่ำ'] || '5') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    previewDiv.innerHTML = html;
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(function(l){ return l.trim() !== ''; });
  if (lines.length < 2) return [];
  var headers = lines[0].split(',').map(function(h){ return h.trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(',');
    if (cols.length < 2) continue;
    var row = {};
    headers.forEach(function(h, idx){ row[h] = (cols[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function handleCSVImport() {
  var rows = _csvImportRows;
  if (!rows || rows.length === 0) { showError('กรุณาเลือกไฟล์ CSV ก่อน'); return; }
  showConfirm('ยืนยันนำเข้า', 'พบ ' + rows.length + ' รายการ ยืนยันนำเข้า?', function() {
    showLoading('กำลังนำเข้า ' + rows.length + ' รายการ...');
    var promises = rows.map(function(row) {
      var itemCode = row['รหัส'] || '';
      var name = row['ชื่อวัสดุ'] || '';
      if (!name) return Promise.resolve({ success: false, message: 'ขาดชื่อวัสดุ' });
      var data = {
        item_code: itemCode,
        name: name,
        size: row['ขนาด'] || '',
        unit: row['หน่วย'] || 'ชิ้น',
        category: row['หมวดหมู่'] || '',
        current_stock: parseInt(row['สต็อกเริ่มต้น'] || 0),
        min_stock: parseInt(row['สต็อกขั้นต่ำ'] || 5),
        description: row['รายละเอียด'] || ''
      };
      return callAPI('addItem', AUTH.token, data);
    });
    Promise.all(promises).then(function(results) {
      hideLoading(); closeModal();
      var ok = results.filter(function(r){ return r && r.success; }).length;
      var fail = results.length - ok;
      if (fail > 0) showError('นำเข้าสำเร็จ ' + ok + ' รายการ ล้มเหลว ' + fail + ' รายการ');
      else showSuccess('นำเข้าสำเร็จ ' + ok + ' รายการ');
      _itemsCacheTime = 0;
      renderItems();
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  });
}

// ===== เพิ่มวัสดุหลายรายการพร้อมกัน =====
var _bulkRowSeq = 0;

function openBulkAddItemsModal() {
  _bulkRowSeq = 0;
  var cats  = getCategoryList(_itemsData);
  var units = {};
  _itemsData.forEach(function(i){ if (i.unit) units[i.unit] = 1; });

  var body = '<div class="space-y-3">';
  body += '<div class="flex flex-wrap items-end gap-2">';
  body += '<div><label class="form-label mb-1">หมวดหมู่เริ่มต้นของแถวใหม่</label>';
  body += '<input type="text" id="bulkDefCat" list="bulkCatList" placeholder="เช่น วัสดุแพ็คกิ้ง" class="form-input py-1.5 text-sm w-48"></div>';
  body += '<div><label class="form-label mb-1">หน่วยเริ่มต้น</label>';
  body += '<input type="text" id="bulkDefUnit" list="bulkUnitList" placeholder="เช่น กล่อง" class="form-input py-1.5 text-sm w-32"></div>';
  body += '<button onclick="bulkAddRows(1)" class="btn-secondary btn-sm flex items-center gap-1"><i class="fi fi-rr-plus"></i> เพิ่มแถว</button>';
  body += '<button onclick="bulkAddRows(5)" class="btn-secondary btn-sm flex items-center gap-1"><i class="fi fi-rr-plus"></i> เพิ่ม 5 แถว</button>';
  body += '<button onclick="toggleBulkPaste()" class="btn-secondary btn-sm flex items-center gap-1"><i class="fi fi-rr-clipboard-list"></i> วางจาก Excel</button>';
  body += '</div>';

  body += '<datalist id="bulkCatList">' + cats.map(function(c){ return '<option value="' + escHtml(c) + '">'; }).join('') + '</datalist>';
  body += '<datalist id="bulkUnitList">' + Object.keys(units).map(function(u){ return '<option value="' + escHtml(u) + '">'; }).join('') + '</datalist>';

  body += '<div id="bulkPasteBox" class="hidden bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">';
  body += '<p class="text-xs text-amber-800">คัดลอกจาก Excel แล้ววางในช่องนี้ได้เลย — 1 บรรทัด = 1 รายการ<br>ลำดับคอลัมน์: <b>ชื่อวัสดุ | ขนาดบรรจุ | หน่วย | หมวดหมู่ | สต็อกเริ่มต้น | สต็อกขั้นต่ำ | ราคา/หน่วย</b></p>';
  body += '<textarea id="bulkPasteText" rows="4" class="form-input text-xs font-mono" placeholder="ถุงมือยาง&#9;size S&#9;กล่อง&#9;อุปกรณ์ป้องกัน&#9;20&#9;5"></textarea>';
  body += '<button onclick="bulkParsePaste()" class="btn-success btn-sm"><i class="fi fi-rr-check mr-1"></i>แปลงเป็นรายการ</button></div>';

  body += '<div class="overflow-x-auto border border-gray-200 rounded-xl">';
  body += '<table class="w-full text-xs" id="bulkTable"><thead class="bg-gray-50 text-gray-600">';
  body += '<tr><th class="px-2 py-2 w-8">#</th>';
  body += '<th class="px-2 py-2 text-left min-w-[180px]">ชื่อวัสดุ *</th>';
  body += '<th class="px-2 py-2 text-left min-w-[100px]">ขนาดบรรจุ</th>';
  body += '<th class="px-2 py-2 text-left min-w-[90px]">หน่วย *</th>';
  body += '<th class="px-2 py-2 text-left min-w-[140px]">หมวดหมู่</th>';
  body += '<th class="px-2 py-2 w-20">สต็อกเริ่มต้น</th>';
  body += '<th class="px-2 py-2 w-20">ขั้นต่ำ</th>';
  body += '<th class="px-2 py-2 w-24">ราคา/หน่วย</th>';
  body += '<th class="px-2 py-2 w-10"></th></tr></thead>';
  body += '<tbody id="bulkTableBody"></tbody></table></div>';
  body += '<p class="text-xs text-gray-400" id="bulkHint">กรอกได้ทีละหลายรายการ แล้วกด "บันทึกทั้งหมด" ครั้งเดียว • แถวที่ไม่ได้กรอกชื่อจะถูกข้ามอัตโนมัติ</p>';
  body += '</div>';

  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitBulkAddItems()" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึกทั้งหมด</button>';
  openModal('เพิ่มวัสดุหลายรายการพร้อมกัน', body, footer, 'max-w-5xl');
  bulkAddRows(5);
}

function toggleBulkPaste() {
  var box = document.getElementById('bulkPasteBox');
  if (box) box.classList.toggle('hidden');
}

function bulkRowHTML(id, v) {
  v = v || {};
  function inp(field, type, val, extra) {
    return '<input type="' + type + '" data-bulk="' + field + '" value="' + escHtml(String(val === undefined || val === null ? '' : val)) + '"'
      + (extra || '') + ' class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-400">';
  }
  return '<tr id="bulkRow' + id + '" class="border-t border-gray-100">'
    + '<td class="px-2 py-1.5 text-center text-gray-400 bulk-no"></td>'
    + '<td class="px-2 py-1.5">' + inp('name', 'text', v.name || '', ' placeholder="ชื่อวัสดุ"') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('size', 'text', v.size || '') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('unit', 'text', v.unit || '', ' list="bulkUnitList"') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('category', 'text', v.category || '', ' list="bulkCatList"') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('current_stock', 'number', v.current_stock !== undefined ? v.current_stock : 0, ' min="0"') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('min_stock', 'number', v.min_stock !== undefined ? v.min_stock : 5, ' min="0"') + '</td>'
    + '<td class="px-2 py-1.5">' + inp('price', 'number', v.price !== undefined ? v.price : 0, ' min="0" step="0.01"') + '</td>'
    + '<td class="px-2 py-1.5 text-center"><button onclick="bulkRemoveRow(' + id + ')" title="ลบแถว" class="w-6 h-6 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"><i class="fi fi-rr-trash text-xs"></i></button></td>'
    + '</tr>';
}

function bulkAddRows(n, values) {
  var tbody = document.getElementById('bulkTableBody');
  if (!tbody) return;
  var defCat  = (document.getElementById('bulkDefCat')||{}).value||'';
  var defUnit = (document.getElementById('bulkDefUnit')||{}).value||'';
  var html = '';
  for (var i = 0; i < n; i++) {
    var v = (values && values[i]) ? values[i] : {};
    if (!v.category) v.category = defCat;
    if (!v.unit)     v.unit     = defUnit;
    html += bulkRowHTML(++_bulkRowSeq, v);
  }
  tbody.insertAdjacentHTML('beforeend', html);
  bulkRenumber();
}

function bulkRemoveRow(id) {
  var tr = document.getElementById('bulkRow' + id);
  if (tr) tr.parentNode.removeChild(tr);
  var tbody = document.getElementById('bulkTableBody');
  if (tbody && tbody.rows.length === 0) bulkAddRows(1);
  else bulkRenumber();
}

function bulkRenumber() {
  var tbody = document.getElementById('bulkTableBody');
  if (!tbody) return;
  for (var i = 0; i < tbody.rows.length; i++) {
    var cell = tbody.rows[i].querySelector('.bulk-no');
    if (cell) cell.textContent = (i + 1);
  }
}

function bulkParsePaste() {
  var text = (document.getElementById('bulkPasteText')||{}).value||'';
  var lines = text.split(/\r?\n/).filter(function(l){ return l.trim() !== ''; });
  if (!lines.length) { showError('ยังไม่ได้วางข้อมูล'); return; }
  var values = lines.map(function(line) {
    var c = line.split(/\t|,/).map(function(x){ return x.trim(); });
    return {
      name: c[0] || '', size: c[1] || '', unit: c[2] || '', category: c[3] || '',
      current_stock: c[4] !== undefined && c[4] !== '' ? parseInt(c[4]) || 0 : 0,
      min_stock:     c[5] !== undefined && c[5] !== '' ? parseInt(c[5]) || 5 : 5,
      price:         c[6] !== undefined && c[6] !== '' ? parseFloat(c[6]) || 0 : 0
    };
  });
  // ลบแถวว่างที่ยังไม่ได้กรอกออกก่อน
  var tbody = document.getElementById('bulkTableBody');
  if (tbody) {
    for (var i = tbody.rows.length - 1; i >= 0; i--) {
      var nameEl = tbody.rows[i].querySelector('[data-bulk="name"]');
      if (nameEl && !nameEl.value.trim()) tbody.deleteRow(i);
    }
  }
  bulkAddRows(values.length, values);
  var box = document.getElementById('bulkPasteBox');
  if (box) box.classList.add('hidden');
  var pasteText = document.getElementById('bulkPasteText');
  if (pasteText) pasteText.value = '';
  showSuccess('แปลงข้อมูล ' + values.length + ' รายการเรียบร้อย ตรวจสอบแล้วกดบันทึก');
}

function readBulkItemRows() {
  var tbody = document.getElementById('bulkTableBody');
  var rows = [];
  if (!tbody) return rows;
  for (var i = 0; i < tbody.rows.length; i++) {
    var tr = tbody.rows[i];
    var get = function(f) {
      var el = tr.querySelector('[data-bulk="' + f + '"]');
      return el ? el.value.trim() : '';
    };
    var name = get('name');
    if (!name) continue;   // ข้ามแถวว่าง
    rows.push({
      name: name,
      size: get('size'),
      unit: get('unit'),
      category: get('category'),
      current_stock: parseInt(get('current_stock')) || 0,
      min_stock: parseInt(get('min_stock')) || 5,
      price: parseFloat(get('price')) || 0
    });
  }
  return rows;
}

function submitBulkAddItems() {
  var rows = readBulkItemRows();
  if (!rows.length) { showError('กรุณากรอกอย่างน้อย 1 รายการ'); return; }
  var missingUnit = rows.filter(function(r){ return !r.unit; });
  if (missingUnit.length) { showError('กรุณากรอกหน่วยนับให้ครบ (' + missingUnit.length + ' รายการยังไม่ได้กรอก)'); return; }

  showConfirm('ยืนยันการบันทึก', 'เพิ่มวัสดุใหม่ ' + rows.length + ' รายการเข้าระบบ?', function() {
    showLoading('กำลังบันทึก ' + rows.length + ' รายการ...');
    callAPI('addItemsBulk', AUTH.token, rows).then(function(res) {
      hideLoading();
      if (res.success) {
        closeModal();
        _itemsCacheTime = 0;
        if (res.failed > 0) {
          Swal.fire({
            icon: 'warning',
            title: 'บันทึกสำเร็จ ' + res.added + ' รายการ',
            html: '<div style="text-align:left;font-size:13px">ข้าม ' + res.failed + ' รายการ:<br>' + (res.errors||[]).map(escHtml).join('<br>') + '</div>',
            customClass: { popup: 'swal2-popup' }
          });
        } else {
          showSuccess(res.message);
        }
        renderItems();
      } else {
        showError((res.message || 'บันทึกไม่สำเร็จ') + ((res.errors && res.errors.length) ? '\n' + res.errors.join('\n') : ''));
      }
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  }, 'บันทึกทั้งหมด');
}

function openAddItemModal() {
  _itemImageFileId = null;
  var body = itemFormHTML({});
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitAddItem()" class="btn-primary"><i class="fi fi-rr-plus mr-1"></i>เพิ่มวัสดุ</button>';
  openModal('เพิ่มรายการวัสดุใหม่', body, footer, 'max-w-2xl');
}
function openEditItemModal(id) {
  var item = _itemsData.find(function(i){ return i.id === id; });
  if (!item) return;
  _itemImageFileId = item.image_file_id || null;
  var body = itemFormHTML(item);
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitEditItem(\'' + id + '\')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button>';
  openModal('แก้ไขรายการวัสดุ', body, footer, 'max-w-2xl');
}
function itemFormHTML(item) {
  var fid = _itemImageFileId || item.image_file_id || '';
  var imgSection = '';
  if (fid) {
    var imgSrc = imgUrl(fid);
    imgSection = '<div class="sm:col-span-2"><label class="form-label">รูปภาพวัสดุ</label><div class="flex items-center gap-3"><img id="itemImgPreview" src="' + (imgSrc||'') + '" class="w-24 h-24 object-cover rounded-xl border border-gray-200"><button onclick="removeItemImage()" type="button" class="text-red-500 text-sm hover:underline">ลบรูป</button></div><input type="hidden" id="itemImageFileId" value="' + fid + '"></div>';
  } else {
    imgSection = '<div class="sm:col-span-2"><label class="form-label">รูปภาพวัสดุ</label><input type="file" id="itemImageFile" accept="image/*" onchange="handleItemImageUpload(this)" class="form-input py-1.5"><p class="text-xs text-gray-400 mt-1">รองรับ JPG, PNG (สูงสุด 5MB)</p><div id="itemImagePreview"></div></div>';
  }
  return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
    + fieldHTML('ชื่อวัสดุ *', 'itemName', 'text', item.name||'', 'sm:col-span-2')
    + fieldHTML('ขนาดบรรจุ', 'itemSize', 'text', item.size||'')
    + fieldHTML('หน่วย *', 'itemUnit', 'text', item.unit||'')
    + barcodeFieldHTML(item.barcode||'')
    + categoryFieldHTML(item.id ? (item.category||'') : (item.category||'วัสดุทำความสะอาด'))
    + fieldHTML('ราคาต่อหน่วย', 'itemPrice', 'number', item.price||0, '', '0.01')
    + fieldHTML('ผู้จำหน่าย/ซัพพลายเออร์', 'itemSupplier', 'text', item.supplier||'')
    + (item.id
        // ตอนแก้ไข: ยอดสต็อกแก้ที่นี่ไม่ได้ ต้องผ่าน รับเข้า / เบิก / นับสต็อก เท่านั้น เพื่อให้มีประวัติกำกับ
        ? '<input type="hidden" id="itemEditId" value="' + escHtml(item.id) + '">'
          + '<div><label class="form-label">สต็อกคงเหลือ</label>'
          + '<input type="number" id="itemStock" value="' + (item.current_stock||0) + '" class="form-input bg-gray-100 text-gray-500" readonly>'
          + '<p class="text-xs text-gray-400 mt-1">แก้ยอดได้ที่เมนู รับวัสดุเข้าคลัง / นับสต็อก</p></div>'
        : fieldHTML('สต็อกเริ่มต้น', 'itemStock', 'number', item.current_stock||0))
    + fieldHTML('สต็อกขั้นต่ำ', 'itemMinStock', 'number', item.min_stock||5)
    + fieldHTML('ตำแหน่งจัดเก็บ', 'itemLocation', 'text', item.storage_location||'', 'sm:col-span-2')
    + textareaFieldHTML('รายละเอียด/หมายเหตุ', 'itemDescription', item.description||'', 'sm:col-span-2')
    + imgSection
    + '</div>';
}
function fieldHTML(label, id, type, value, extra, step) {
  return '<div class="' + (extra||'') + '">'
    + '<label class="form-label">' + escHtml(label) + '</label>'
    + '<input type="' + type + '" id="' + id + '"' + (step ? ' step="' + step + '" min="0"' : '') + ' value="' + escHtml(String(value)) + '" class="form-input"></div>';
}
function textareaFieldHTML(label, id, value, extra) {
  return '<div class="' + (extra||'') + '">'
    + '<label class="form-label">' + escHtml(label) + '</label>'
    + '<textarea id="' + id + '" rows="2" class="form-input">' + escHtml(value||'') + '</textarea></div>';
}
var NEW_CATEGORY_VALUE = '__new__';
var DEFAULT_CATEGORIES = ['วัสดุทำความสะอาด','น้ำยาทำความสะอาด','อุปกรณ์ทำความสะอาด','อุปกรณ์ป้องกัน','วัสดุบรรจุภัณฑ์','อุปกรณ์จัดเก็บ','อุปกรณ์ไฟฟ้า','อุปกรณ์อื่นๆ','อื่นๆ'];

/** categoryOptionList — หมวดหมู่ที่เลือกได้: หมวดหมู่ที่มีใช้อยู่ในระบบ + หมวดหมู่ตั้งต้น */
function categoryOptionList() {
  var cats = getCategoryList(_itemsData);
  DEFAULT_CATEGORIES.forEach(function(c){ if (cats.indexOf(c) === -1) cats.push(c); });
  return cats.sort(function(a, b){ return a.localeCompare(b, 'th'); });
}

/** categoryFieldHTML — ช่องหมวดหมู่แบบ Dropdown (เลือก "+ เพิ่มหมวดหมู่ใหม่" เพื่อพิมพ์ชื่อหมวดหมู่เองได้) */
function categoryFieldHTML(value) {
  value = value || '';
  var cats = categoryOptionList();
  if (value && cats.indexOf(value) === -1) cats.unshift(value);
  var html = '<div><label class="form-label">หมวดหมู่</label>'
    + '<select id="itemCategory" class="form-input" onchange="onItemCategoryChange(this)">'
    + '<option value="">— เลือกหมวดหมู่ —</option>';
  cats.forEach(function(c) {
    html += '<option value="' + escHtml(c) + '"' + (c === value ? ' selected' : '') + '>' + escHtml(c) + '</option>';
  });
  html += '<option value="' + NEW_CATEGORY_VALUE + '">+ เพิ่มหมวดหมู่ใหม่...</option></select>'
    + '<input type="text" id="itemCategoryNew" placeholder="พิมพ์ชื่อหมวดหมู่ใหม่" class="form-input mt-2 hidden"></div>';
  return html;
}
function onItemCategoryChange(sel) {
  var inp = document.getElementById('itemCategoryNew');
  if (!inp) return;
  var isNew = sel.value === NEW_CATEGORY_VALUE;
  inp.classList.toggle('hidden', !isNew);
  if (isNew) inp.focus();
}
/** readItemCategory — ค่าหมวดหมู่จากฟอร์ม (รวมกรณีพิมพ์หมวดหมู่ใหม่) */
function readItemCategory() {
  var sel = document.getElementById('itemCategory');
  if (!sel) return '';
  if (sel.value !== NEW_CATEGORY_VALUE) return sel.value;
  return ((document.getElementById('itemCategoryNew')||{}).value||'').trim();
}

function barcodeFieldHTML(value) {
  return '<div><label class="form-label">บาร์โค้ด</label>'
    + '<div class="relative"><i class="fi fi-rr-barcode-read absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>'
    + '<input type="text" id="itemBarcode" value="' + escHtml(value) + '" placeholder="ยิงบาร์โค้ดหรือกรอกเลข..." class="form-input pl-9"></div></div>';
}

function submitAddItem() {
  var data = readItemForm();
  if (!data) return;
  showLoading('กำลังบันทึก...');
  callAPI('addItem', AUTH.token, data).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) { showSuccess(res.message); renderItems(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}
function submitEditItem(id) {
  var data = readItemForm();
  if (!data) return;
  showLoading('กำลังบันทึก...');
  callAPI('updateItem', AUTH.token, id, data).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) { showSuccess(res.message); renderItems(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}
function readItemForm() {
  var name = (document.getElementById('itemName')||{}).value||'';
  var unit = (document.getElementById('itemUnit')||{}).value||'';
  if (!name.trim()) { showError('กรุณากรอกชื่อวัสดุ'); return null; }
  if (!unit.trim()) { showError('กรุณากรอกหน่วย'); return null; }
  var category = readItemCategory();
  if (!category && (document.getElementById('itemCategory')||{}).value === NEW_CATEGORY_VALUE) {
    showError('กรุณาพิมพ์ชื่อหมวดหมู่ใหม่'); return null;
  }
  return {
    name: name, size: (document.getElementById('itemSize')||{}).value||'',
    unit: unit, category: category,
    barcode: (document.getElementById('itemBarcode')||{}).value||'',
    price: parseFloat((document.getElementById('itemPrice')||{}).value)||0,
    supplier: (document.getElementById('itemSupplier')||{}).value||'',
    storage_location: (document.getElementById('itemLocation')||{}).value||'',
    description: (document.getElementById('itemDescription')||{}).value||'',
    current_stock: parseInt((document.getElementById('itemStock')||{}).value)||0,
    min_stock: parseInt((document.getElementById('itemMinStock')||{}).value)||5,
    image_file_id: (document.getElementById('itemImageFileId')||{}).value||_itemImageFileId||''
  };
}
function handleItemImageUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (!file.type.match('image.*')) { showError('กรุณาเลือกไฟล์รูปภาพ'); input.value=''; return; }
  if (file.size > 5 * 1024 * 1024) { showError('ไฟล์ใหญ่เกิน 5MB'); input.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    showLoading('กำลังอัปโหลดรูป...');
    callAPI('uploadFile', AUTH.token, base64, file.type, file.name).then(function(res) {
      hideLoading();
      if (res.success) {
        _itemImageFileId = res.file_id;
        var preview = document.getElementById('itemImagePreview');
        var imgSrc = imgUrl(res.file_id);
        if (preview) preview.innerHTML = '<img src="' + (imgSrc||'') + '" class="w-24 h-24 object-cover rounded-xl border border-gray-200 mt-2">';
        showSuccess('อัปโหลดรูปเรียบร้อย');
      } else {
        showError(res.message || 'อัปโหลดไม่สำเร็จ');
      }
    }).catch(function() { hideLoading(); showError('อัปโหลดไม่สำเร็จ'); });
  };
  reader.readAsDataURL(file);
}
function removeItemImage() {
  _itemImageFileId = null;
  var name = (document.getElementById('itemName')||{}).value||'';
  var size = (document.getElementById('itemSize')||{}).value||'';
  var unit = (document.getElementById('itemUnit')||{}).value||'';
  var barcode = (document.getElementById('itemBarcode')||{}).value||'';
  var cat  = readItemCategory();
  var price = (document.getElementById('itemPrice')||{}).value||0;
  var supplier = (document.getElementById('itemSupplier')||{}).value||'';
  var location = (document.getElementById('itemLocation')||{}).value||'';
  var description = (document.getElementById('itemDescription')||{}).value||'';
  var stock = (document.getElementById('itemStock')||{}).value||0;
  var min   = (document.getElementById('itemMinStock')||{}).value||5;
  var editId = (document.getElementById('itemEditId')||{}).value||'';  // คงสถานะ เพิ่ม/แก้ไข ไว้ตอน render ฟอร์มใหม่
  var fakeItem = {id:editId, name:name, size:size, unit:unit, barcode:barcode, category:cat, price:price, supplier:supplier, storage_location:location, description:description, current_stock:stock, min_stock:min, image_file_id:''};
  var body = itemFormHTML(fakeItem);
  document.getElementById('modalBody').innerHTML = body;
}

function deleteItemConfirm(id, name) {
  showConfirm('ลบรายการวัสดุ', 'ต้องการลบ "' + name + '" ใช่หรือไม่?', function() {
    showLoading('กำลังลบ...');
    callAPI('deleteItem', AUTH.token, id).then(function(res) {
      hideLoading();
      if (res.success) { showSuccess(res.message); renderItems(); }
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  }, 'ลบ');
}

function showItemDetailModal(itemId) {
  var item = _itemsData.find(function(i){ return i.id === itemId; });
  if (!item) return;
  var sClass = getStockClass(item.current_stock, item.min_stock);
  var sLabel = getStockLabel(item.current_stock, item.min_stock);
  var pct = item.min_stock > 0 ? Math.min(100, Math.round(item.current_stock / (item.min_stock * 3) * 100)) : 50;
  var barColor = item.current_stock <= 0 ? 'bg-red-500' : item.current_stock <= item.min_stock ? 'bg-amber-400' : 'bg-green-500';

  var imgUrlSrc = imgUrl(item.image_file_id);
  var imgSection = '';
  if (imgUrlSrc) {
    imgSection = '<div class="flex justify-center mb-4"><img src="' + imgUrlSrc + '" class="w-40 h-40 object-cover rounded-2xl border border-gray-200 shadow-sm"></div>';
  } else {
    imgSection = '<div class="flex justify-center mb-4"><div class="w-24 h-24 bg-gray-100 rounded-2xl flex items-center justify-center"><i class="fi fi-rr-box-open-full text-gray-300 text-4xl"></i></div></div>';
  }

  var body = '<div class="text-center mb-5">'
    + imgSection
    + '<p class="font-mono text-xs text-navy-600 mb-1">' + escHtml(item.item_code) + '</p>'
    + '<h2 class="text-lg font-bold text-gray-800">' + escHtml(item.name) + '</h2>'
    + (item.size ? '<p class="text-sm text-gray-500 mt-1">' + escHtml(item.size) + '</p>' : '')
    + '</div>';

  body += '<div class="space-y-3">';
  body += '<div class="grid grid-cols-2 gap-3">'
    + '<div class="bg-gray-50 rounded-xl p-3 text-center"><p class="text-xs text-gray-400 mb-1">หมวดหมู่</p><p class="text-sm font-semibold text-gray-700">' + escHtml(item.category || '-') + '</p></div>'
    + '<div class="bg-gray-50 rounded-xl p-3 text-center"><p class="text-xs text-gray-400 mb-1">หน่วย</p><p class="text-sm font-semibold text-gray-700">' + escHtml(item.unit) + '</p></div>'
    + '</div>';

  body += '<div class="bg-white border border-gray-200 rounded-xl p-4">'
    + '<div class="flex items-center justify-between mb-2">'
    + '<span class="text-sm text-gray-500">คงเหลือในระบบ</span>'
    + '<span class="text-xl font-bold text-gray-800">' + item.current_stock + ' <span class="text-sm font-normal text-gray-500">' + item.unit + '</span></span>'
    + '</div>'
    + '<div class="progress-bar mb-2"><div class="progress-fill ' + barColor + '" style="width:' + pct + '%"></div></div>'
    + '<div class="flex items-center justify-between">'
    + '<span class="text-xs text-gray-400">ขั้นต่ำ: ' + item.min_stock + ' ' + item.unit + '</span>'
    + '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span>'
    + '</div></div>';

  if (item.price || item.supplier || item.storage_location) {
    body += '<div class="grid grid-cols-2 gap-3">';
    if (item.price) body += '<div class="bg-gray-50 rounded-xl p-3 text-center"><p class="text-xs text-gray-400 mb-1">ราคาต่อหน่วย</p><p class="text-sm font-semibold text-gray-700">' + Number(item.price).toLocaleString('th-TH', {minimumFractionDigits:2}) + ' บาท</p></div>';
    if (item.storage_location) body += '<div class="bg-gray-50 rounded-xl p-3 text-center"><p class="text-xs text-gray-400 mb-1">ตำแหน่งจัดเก็บ</p><p class="text-sm font-semibold text-gray-700">' + escHtml(item.storage_location) + '</p></div>';
    if (item.supplier) body += '<div class="bg-gray-50 rounded-xl p-3 text-center col-span-2"><p class="text-xs text-gray-400 mb-1">ผู้จำหน่าย/ซัพพลายเออร์</p><p class="text-sm font-semibold text-gray-700">' + escHtml(item.supplier) + '</p></div>';
    body += '</div>';
  }

  if (item.description) {
    body += '<div class="bg-gray-50 rounded-xl p-3"><p class="text-xs text-gray-400 mb-1">หมายเหตุ / รายละเอียด</p><p class="text-sm text-gray-700">' + escHtml(item.description) + '</p></div>';
  }

  if (item.created_at || item.updated_at) {
    body += '<div class="text-xs text-gray-400 text-center pt-1">'
      + (item.created_at ? '<span>เพิ่มเมื่อ: ' + formatDate(item.created_at) + '</span>' : '')
      + (item.updated_at ? ' <span class="mx-1">|</span> <span>อัปเดตล่าสุด: ' + formatDate(item.updated_at) + '</span>' : '')
      + '</div>';
  }

  // ประวัติการรับเข้า (วันที่ / จำนวน / ร้าน / ราคา) — โหลดเมื่อกดเปิดดู
  body += '<div class="border border-gray-200 rounded-xl overflow-hidden">'
    + '<button type="button" onclick="toggleItemReceiveHistory(\'' + item.id + '\')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-navy-700 hover:bg-navy-50 transition">'
    + '<span><i class="fi fi-rr-inbox-in mr-2"></i>ประวัติการรับเข้า</span>'
    + '<i id="itemRecvChevron" class="fi fi-rr-angle-small-down text-base"></i></button>'
    + '<div id="itemRecvHistory" class="hidden border-t border-gray-200"></div></div>';

  body += '</div>';

  var footer = '<button onclick="closeModal()" class="btn-secondary">ปิด</button>'
    + '<button onclick="openWithdrawModal(\'' + item.id + '\')" class="btn-primary"><i class="fi fi-rr-inbox-out mr-1"></i>เบิกวัสดุ</button>';
  openModal('รายละเอียดวัสดุ', body, footer);
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** toggleItemReceiveHistory — เปิด/ปิดประวัติการรับเข้าของวัสดุในหน้ารายละเอียด (โหลดจากเซิร์ฟเวอร์ครั้งแรกที่เปิด) */
function toggleItemReceiveHistory(itemId) {
  var box = document.getElementById('itemRecvHistory');
  var chevron = document.getElementById('itemRecvChevron');
  if (!box) return;
  var willOpen = box.classList.contains('hidden');
  box.classList.toggle('hidden', !willOpen);
  if (chevron) chevron.className = 'fi ' + (willOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down') + ' text-base';
  if (!willOpen || box.getAttribute('data-loaded')) return;

  box.innerHTML = '<p class="text-center text-xs text-gray-400 py-4">กำลังโหลด...</p>';
  callAPI('getReceives', AUTH.token, { item_id: itemId }).then(function(res) {
    if (!res || !res.success) { box.innerHTML = '<p class="text-center text-xs text-red-500 py-4">' + escHtml((res && res.message) || 'โหลดประวัติไม่สำเร็จ') + '</p>'; return; }
    // เผื่อ backend เวอร์ชันเก่าที่ยังไม่กรองตาม item_id ให้
    var rows = (res.data || []).filter(function(r){ return r.item_id === itemId; });
    rows.sort(function(a, b){ return (b.date || '') > (a.date || '') ? 1 : -1; });
    box.setAttribute('data-loaded', '1');
    box.innerHTML = itemReceiveHistoryHTML(rows);
  }).catch(function() {
    box.innerHTML = '<p class="text-center text-xs text-red-500 py-4">โหลดประวัติไม่สำเร็จ</p>';
  });
}

function itemReceiveHistoryHTML(rows) {
  if (!rows.length) return '<p class="text-center text-xs text-gray-400 py-4">ยังไม่มีประวัติการรับเข้า</p>';
  var totalQty = 0;
  var html = '<div class="max-h-64 overflow-y-auto"><table class="w-full text-xs">'
    + '<thead class="bg-gray-50 text-gray-500 sticky top-0"><tr>'
    + '<th class="px-3 py-2 text-left">วันที่รับเข้า</th><th class="px-3 py-2 text-center">จำนวน</th>'
    + '<th class="px-3 py-2 text-left">ชื่อร้าน</th><th class="px-3 py-2 text-right">ราคา/หน่วย</th></tr></thead>'
    + '<tbody class="divide-y divide-gray-100">';
  rows.forEach(function(r) {
    totalQty += Number(r.quantity) || 0;
    html += '<tr title="' + escHtml((r.receive_no || '') + (r.received_by_name ? ' • รับโดย ' + r.received_by_name : '') + (r.note ? ' • ' + r.note : '')) + '">'
      + '<td class="px-3 py-2 text-gray-600 whitespace-nowrap">' + formatDate(r.date) + '</td>'
      + '<td class="px-3 py-2 text-center font-bold text-blue-700 whitespace-nowrap">+' + r.quantity + ' ' + escHtml(r.unit || '') + '</td>'
      + '<td class="px-3 py-2 text-gray-700">' + escHtml(r.supplier || '-') + '</td>'
      + '<td class="px-3 py-2 text-right text-gray-700 whitespace-nowrap">' + (Number(r.unit_price) ? formatMoney(r.unit_price) : '-') + '</td></tr>';
  });
  html += '</tbody></table></div>'
    + '<p class="text-xs text-gray-400 px-3 py-2 border-t border-gray-100">รับเข้าทั้งหมด ' + rows.length + ' ครั้ง รวม ' + totalQty + ' ' + escHtml(rows[0].unit || '') + '</p>';
  return html;
}

// ===== QR CODE =====
function showQRModal(itemId) {
  var item = _itemsData.find(function(i){ return i.id === itemId; });
  if (!item) return;
  var baseUrl = window.location.origin + window.location.pathname;
  var qrUrl  = baseUrl + '?action=withdraw&item_id=' + itemId;
  var body = '<div class="text-center">'
    + '<p class="font-semibold text-gray-700 mb-1">' + escHtml(item.name) + '</p>'
    + '<p class="text-xs text-gray-500 mb-4">' + escHtml(item.item_code) + ' • ' + escHtml(item.size||'') + ' • ' + item.unit + '</p>'
    + '<div id="qrCanvas" class="flex justify-center mb-4"></div>'
    + '<p class="text-xs text-gray-400 break-all border rounded-lg px-3 py-2 bg-gray-50">' + escHtml(qrUrl) + '</p>'
    + '<p class="text-xs text-gray-400 mt-3">พนักงานสแกน QR นี้ด้วยกล้องมือถือเพื่อเบิกวัสดุ</p></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ปิด</button>'
    + '<button onclick="printQRLabel(\'' + escHtml(JSON.stringify(item).replace(/'/g,'&#39;')) + '\')" class="btn-primary"><i class="fi fi-rr-print mr-1"></i>พิมพ์</button>';
  openModal('QR Code — ' + item.name, body, footer);
  setTimeout(function() {
    new QRCode(document.getElementById('qrCanvas'), {
      text: qrUrl, width:180, height:180,
      colorDark:'#1a2566', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M
    });
  }, 100);
}

function printQRLabel(itemJson) {
  var item = JSON.parse(itemJson);
  var baseUrl = window.location.origin + window.location.pathname;
  var qrUrl  = baseUrl + '?action=withdraw&item_id=' + item.id;
  var win = window.open('', '_blank');
  var css = 'body{font-family:sarabun,sans-serif;margin:0;padding:0;background:#fff}' +
    '.label{width:58mm;height:40mm;border:1.5px dashed #ccc;padding:3mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;margin:4mm auto}' +
    '.name{font-size:11px;font-weight:700;color:#1a2566;margin:0 0 1mm;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.meta{font-size:8px;color:#666;margin:0 0 1mm}' +
    '.qr-wrap{width:22mm;height:22mm;margin:0 auto}' +
    '@media print{.label{border-style:solid!important;border-color:#333!important;page-break-inside:avoid;margin:2mm}}';
  win.document.write('<html><head><title>ป้าย ' + item.name + '</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">'
    + '<style>' + css + '</style></head><body>'
    + '<div class="label">'
    + '<p class="name">' + escHtml(item.name) + '</p>'
    + '<p class="meta">' + escHtml(item.item_code) + (item.size ? ' • ' + escHtml(item.size) : '') + '</p>'
    + '<div class="qr-wrap" id="qr"></div>'
    + '</div>'
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>'
    + '<script>new QRCode(document.getElementById("qr"),{text:"' + qrUrl + '",width:80,height:80,colorDark:"#1a2566",correctLevel:QRCode.CorrectLevel.M});'
    + 'setTimeout(function(){window.print();window.close();},700);<\/script>'
    + '</body></html>');
  win.document.close();
}

// ===== STOCK =====
var _stockData = [];
var _stockView = 'card';

function updateLowStockBadge(items) {
  var lowBadge = document.getElementById('lowStockBadge');
  if (!lowBadge) return;
  var count = (items || []).filter(function(i){ return i.active !== false && i.current_stock <= i.min_stock; }).length;
  if (count > 0) { lowBadge.textContent = count; lowBadge.classList.remove('hidden'); }
  else { lowBadge.classList.add('hidden'); }
}

function renderStock() {
  showLoading('โหลดสต็อก...');
  // reuse cache ถ้ายังไม่หมดอายุ
  if (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL) {
    hideLoading();
    _stockData = _itemsData;
    updateLowStockBadge(_itemsData);
    buildStockPage();
    return;
  }
  callAPI('getItems', AUTH.token).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    _itemsData = res.data;
    _itemsCacheTime = Date.now();
    _stockData = res.data;
    updateLowStockBadge(_itemsData);
    buildStockPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildStockPage() {
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">';
  html += '<div class="flex gap-2 flex-wrap">';
  html += '<div class="relative"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>'
    + '<input type="text" id="stockSearch" placeholder="ค้นหา..." onkeyup="filterStock()" class="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 w-44"></div>';
  html += '<select id="stockCatFilter" onchange="filterStock()" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">';
  html += '<option value="">ทุกหมวด</option>';
  getCategoryList(_stockData).forEach(function(c){ html += '<option>' + escHtml(c) + '</option>'; });
  html += '</select></div>';
  html += '<div class="flex gap-2">';
  html += '<button onclick="openWithdrawSelectModal()" class="btn-primary flex items-center gap-2 whitespace-nowrap"><i class="fi fi-rr-inbox-out"></i> เบิกหลายรายการ</button>';
  html += '<button onclick="setStockView(\'card\')" id="btnCardView" class="px-3 py-2 border rounded-xl text-sm ' + (_stockView==='card'?'bg-navy-700 text-white border-navy-700':'border-gray-300 text-gray-600 hover:bg-gray-50') + '"><i class="fi fi-rr-grid"></i></button>';
  html += '<button onclick="setStockView(\'table\')" id="btnTableView" class="px-3 py-2 border rounded-xl text-sm ' + (_stockView==='table'?'bg-navy-700 text-white border-navy-700':'border-gray-300 text-gray-600 hover:bg-gray-50') + '"><i class="fi fi-rr-list"></i></button>';
  html += '</div></div>';

  html += '<div id="stockContent">' + buildStockContent(_stockData) + '</div>';
  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;
}

function buildStockContent(data) {
  if (_stockView === 'card') {
    var html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">';
    if (data.length === 0) html += '<p class="col-span-4 text-center text-gray-400 py-10">ไม่พบรายการ</p>';
    data.forEach(function(item) {
      var sClass = getStockClass(item.current_stock, item.min_stock);
      var sLabel = getStockLabel(item.current_stock, item.min_stock);
      var pct = item.min_stock > 0 ? Math.min(100, Math.round(item.current_stock / (item.min_stock*3) * 100)) : 50;
      var barColor = item.current_stock <= 0 ? 'bg-red-500' : item.current_stock <= item.min_stock ? 'bg-amber-400' : 'bg-green-500';
      html += '<div class="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">';
      html += '<div class="flex items-start justify-between">';
      var imgUrlSrc = imgUrl(item.image_file_id);
      var cardImg = imgUrlSrc ? '<img src="' + imgUrlSrc + '" class="w-10 h-10 object-cover rounded-xl border border-gray-200">' : '<div class="w-10 h-10 bg-navy-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-box-open-full text-navy-700 text-lg"></i></div>';
      html += '<div>' + cardImg + '</div>';
      html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span></div>';
      html += '<div><p class="font-semibold text-gray-800 text-sm leading-snug">' + escHtml(item.name) + '</p>';
      html += '<p class="text-xs text-gray-400 mt-0.5">' + escHtml(item.size||'') + ' • ' + escHtml(item.category||'') + '</p></div>';
      html += '<div><div class="flex justify-between text-xs text-gray-500 mb-1"><span>คงเหลือ</span><span class="font-bold text-gray-800">' + item.current_stock + ' ' + item.unit + '</span></div>';
      html += '<div class="progress-bar"><div class="progress-fill ' + barColor + '" style="width:' + pct + '%"></div></div>';
      html += '<p class="text-xs text-gray-400 mt-1">ขั้นต่ำ: ' + item.min_stock + ' ' + item.unit + '</p></div>';
      html += '<div class="flex gap-2 pt-1">';
      html += '<button onclick="showItemDetailModal(\'' + item.id + '\')" class="flex-1 btn-secondary btn-sm text-xs" title="ดูรายละเอียด"><i class="fi fi-rr-eye mr-1"></i>ดู</button>';
      if (AUTH.user.role !== 'employee') {
        html += '<button onclick="openReceiveModal(\'' + item.id + '\')" class="flex-1 btn-success btn-sm text-xs"><i class="fi fi-rr-inbox-in mr-1"></i>รับเข้า</button>';
      }
      html += '<button onclick="openWithdrawModal(\'' + item.id + '\')" class="flex-1 btn-primary btn-sm text-xs"><i class="fi fi-rr-inbox-out mr-1"></i>เบิก</button>';
      html += '</div></div>';
    });
    return html + '</div>';
  } else {
    var html = '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
    html += '<tr><th class="px-4 py-3 text-left">รหัส</th><th class="px-4 py-3 text-left">ชื่อวัสดุ</th><th class="px-4 py-3 text-left">หน่วย</th>';
    html += '<th class="px-4 py-3 text-center">สต็อก</th><th class="px-4 py-3 text-center">ขั้นต่ำ</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">การดำเนินการ</th></tr>';
    html += '</thead><tbody class="divide-y divide-gray-100">';
    if (data.length === 0) html += '<tr><td colspan="7" class="text-center py-8 text-gray-400">ไม่พบรายการ</td></tr>';
    data.forEach(function(item) {
      var sClass = getStockClass(item.current_stock, item.min_stock);
      html += '<tr><td class="px-4 py-2.5 font-mono text-xs text-navy-700">' + escHtml(item.item_code) + '</td>';
      html += '<td class="px-4 py-2.5 font-medium text-gray-700">' + escHtml(item.name) + '</td>';
      html += '<td class="px-4 py-2.5 text-xs text-gray-500">' + escHtml(item.unit) + '</td>';
      html += '<td class="px-4 py-2.5 text-center font-bold">' + item.current_stock + '</td>';
      html += '<td class="px-4 py-2.5 text-center text-gray-400">' + item.min_stock + '</td>';
      html += '<td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + sClass + '">' + getStockLabel(item.current_stock, item.min_stock) + '</span></td>';
      html += '<td class="px-4 py-2.5 text-center"><div class="flex gap-1 justify-center">';
      html += '<button onclick="showItemDetailModal(\'' + item.id + '\')" class="btn-secondary btn-sm text-xs" title="ดูรายละเอียด"><i class="fi fi-rr-eye"></i></button>';
      if (AUTH.user.role !== 'employee') html += '<button onclick="openReceiveModal(\'' + item.id + '\')" class="btn-success btn-sm text-xs"><i class="fi fi-rr-inbox-in mr-1"></i>รับเข้า</button>';
      html += '<button onclick="openWithdrawModal(\'' + item.id + '\')" class="btn-primary btn-sm text-xs"><i class="fi fi-rr-inbox-out mr-1"></i>เบิก</button>';
      html += '</div></td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }
}

function setStockView(view) {
  _stockView = view;
  buildStockPage();
}
function filterStock() {
  var q   = (document.getElementById('stockSearch')||{}).value||'';
  var cat = (document.getElementById('stockCatFilter')||{}).value||'';
  var filtered = _stockData.filter(function(i) {
    if (q && !i.name.toLowerCase().includes(q.toLowerCase()) && !(i.item_code||'').toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && i.category !== cat) return false;
    return true;
  });
  document.getElementById('stockContent').innerHTML = buildStockContent(filtered);
}

// ===== RECEIVE =====
var _receiveData = [];
var _receivePage = 1;

function renderReceive() {
  showLoading('โหลดข้อมูลรับเข้า...');
  var itemsPromise = (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL)
    ? Promise.resolve({ success: true, data: _itemsData })
    : callAPI('getItems', AUTH.token).then(function(res){ _itemsData = res.data||[]; _itemsCacheTime = Date.now(); return res; });
  Promise.all([ itemsPromise, callAPI('getReceives', AUTH.token, {}) ]).then(function(results) {
    hideLoading();
    _itemsData   = results[0].data || [];
    _receiveData = results[1].data || [];
    _receivePage = 1;
    buildReceivePage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildReceivePage() {
  var paged = paginate(_receiveData, _receivePage);
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between">';
  html += '<h3 class="font-semibold text-gray-700">ประวัติรับวัสดุเข้าคลัง</h3>';
  html += '<button onclick="openReceiveModal(null)" class="btn-primary flex items-center gap-2"><i class="fi fi-rr-plus"></i> บันทึกรับเข้า</button></div>';

  html += '<div class="card overflow-hidden"><div class="overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
  html += '<tr><th class="px-4 py-3 text-left">เลขที่รับ</th><th class="px-4 py-3 text-left">วันที่</th>';
  html += '<th class="px-4 py-3 text-left">รายการ</th><th class="px-4 py-3 text-center">จำนวน</th>';
  html += '<th class="px-4 py-3 text-left">ร้าน/ผู้จำหน่าย</th><th class="px-4 py-3 text-right">ราคา/หน่วย</th><th class="px-4 py-3 text-right">รวมเงิน</th>';
  html += '<th class="px-4 py-3 text-left">ผู้รับ</th><th class="px-4 py-3 text-left">หมายเหตุ</th></tr></thead>';
  html += '<tbody class="divide-y divide-gray-100">';
  if (paged.length === 0) html += '<tr><td colspan="9" class="text-center py-10 text-gray-400">ยังไม่มีรายการรับเข้า</td></tr>';
  paged.forEach(function(r) {
    html += '<tr><td class="px-4 py-2.5 font-mono text-xs text-navy-700">' + escHtml(r.receive_no) + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-600">' + formatDate(r.date) + '</td>';
    html += '<td class="px-4 py-2.5 font-medium text-gray-700">' + escHtml(r.item_name||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-center font-bold text-blue-700 whitespace-nowrap">+' + r.quantity + ' ' + escHtml(r.unit||'') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-600">' + escHtml(r.supplier||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-right text-gray-600 whitespace-nowrap">' + (Number(r.unit_price) ? formatMoney(r.unit_price) : '-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-right text-gray-600 whitespace-nowrap">' + (Number(r.total_price) ? formatMoney(r.total_price) : '-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500">' + escHtml(r.received_by_name||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-400">' + escHtml(r.note||'-') + '</td></tr>';
  });
  html += '</tbody></table></div></div>';
  html += '<div id="receivePagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('receivePagination', _receiveData.length, _receivePage, function(p){ _receivePage=p; buildReceivePage(); });
}

function openReceiveModal(itemId) {
  if (itemId) { openReceiveDetailModal(itemId); return; }
  _openRecSelect();
}
function _openRecSelect() {
  var body = '<div class="space-y-3">'
    + '<div><label class="form-label">ยิงบาร์โค้ด</label>'
    + '<div class="relative"><i class="fi fi-rr-barcode-read absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>'
    + '<input type="text" id="recItemBarcode" placeholder="ยิงบาร์โค้ดเพื่อค้นหาวัสดุ..." onkeydown="handleRecBarcodeScan(event)" class="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"></div></div>'
    + '<div class="flex items-center justify-between">'
    + '<label class="form-label mb-0">เลือกวัสดุ *</label>'
    + '<button type="button" onclick="openAddItemInlineForReceive()" class="text-xs text-navy-600 hover:underline font-medium flex items-center gap-1"><i class="fi fi-rr-plus"></i>ไม่พบ? เพิ่มวัสดุใหม่</button>'
    + '</div>'
    + '<div class="relative"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>'
    + '<input type="text" id="recItemSearch" placeholder="ค้นหาวัสดุ..." onkeyup="filterRecItemList()" class="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"></div>'
    + '<div id="recItemList" class="max-h-72 overflow-y-auto space-y-1">' + buildRecItemList(_itemsData) + '</div>'
    + '</div>';
  openModal('เลือกวัสดุที่ต้องการรับเข้า', body, '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>');
}
function openAddItemInlineForReceive(prefillBarcode) {
  _itemImageFileId = null;
  var body = itemFormHTML({ barcode: prefillBarcode || '' });
  var footer = '<button onclick="_openRecSelect()" class="btn-secondary"><i class="fi fi-rr-arrow-left mr-1"></i>กลับ</button>'
    + '<button onclick="submitAddItemForReceive()" class="btn-primary"><i class="fi fi-rr-plus mr-1"></i>เพิ่มวัสดุ</button>';
  openModal('เพิ่มวัสดุใหม่', body, footer, 'max-w-2xl');
}
function submitAddItemForReceive() {
  var data = readItemForm();
  if (!data) return;
  showLoading('กำลังบันทึก...');
  callAPI('addItem', AUTH.token, data).then(function(res) {
    hideLoading();
    if (res.success) {
      _itemsData.push(res.data);
      _itemsCacheTime = Date.now();
      showSuccess(res.message);
      openReceiveDetailModal(res.data.id);
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}
function buildRecItemList(data) {
  if (data.length === 0) {
    return '<div class="text-center py-6"><p class="text-sm text-gray-400 mb-3">ไม่พบรายการที่ค้นหา</p>'
      + '<button onclick="openAddItemInlineForReceive()" class="btn-primary btn-sm"><i class="fi fi-rr-plus mr-1"></i>เพิ่มวัสดุใหม่</button></div>';
  }
  return data.map(function(i) {
    var imgUrlSrc = imgUrl(i.image_file_id);
    var imgHtml = imgUrlSrc ? '<img src="' + imgUrlSrc + '" class="w-9 h-9 object-cover rounded-xl border border-gray-200 flex-shrink-0">' : '<div class="w-9 h-9 bg-navy-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fi fi-rr-box-open-full text-navy-700 text-sm"></i></div>';
    return '<div onclick="selectRecItem(\'' + i.id + '\')" class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-navy-50 border border-transparent hover:border-navy-200 transition">'
      + imgHtml
      + '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-700 truncate">' + escHtml(i.name) + '</p>'
      + '<p class="text-xs text-gray-400">' + escHtml(i.item_code) + ' • ' + escHtml(i.size||'') + ' • คงเหลือ ' + i.current_stock + ' ' + i.unit + '</p></div></div>';
  }).join('');
}
function filterRecItemList() {
  var q = ((document.getElementById('recItemSearch')||{}).value||'').toLowerCase();
  var filtered = _itemsData.filter(function(i){
    return !q || i.name.toLowerCase().includes(q) || (i.item_code||'').toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q);
  });
  document.getElementById('recItemList').innerHTML = buildRecItemList(filtered);
}
function selectRecItem(id) { closeModal(); openReceiveDetailModal(id); }
function handleRecBarcodeScan(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var input = document.getElementById('recItemBarcode');
  var code = (input||{}).value||'';
  if (!code.trim()) return;
  var scannedCode = code.trim();
  var item = _itemsData.find(function(i){ return (i.barcode||'') === scannedCode; });
  if (item) { closeModal(); openReceiveDetailModal(item.id); }
  else {
    showConfirm('ไม่พบวัสดุ', 'ไม่พบวัสดุที่มีบาร์โค้ด "' + scannedCode + '" ต้องการเพิ่มวัสดุใหม่หรือไม่?', function() {
      openAddItemInlineForReceive(scannedCode);
    }, 'เพิ่มวัสดุใหม่');
  }
}
function openReceiveDetailModal(itemId) {
  var item = _itemsData.find(function(i){ return i.id === itemId; });
  if (!item) { showError('ไม่พบรายการวัสดุ'); return; }
  var body = '<div class="space-y-4">';
  body += '<input type="hidden" id="recItemId" value="' + itemId + '">';
  body += '<p class="text-sm text-gray-600">รายการ: <b>' + escHtml(item.name) + '</b> (คงเหลือ ' + item.current_stock + ' ' + item.unit + ')</p>';
  body += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
  body += fieldHTML('จำนวนที่รับ *', 'recQty', 'number', 1);
  body += fieldHTML('วันที่รับเข้า', 'recDate', 'date', new Date().toISOString().split('T')[0]);
  // ร้าน/ราคา ของการรับเข้าครั้งนี้ — เก็บเป็นประวัติให้กดดูย้อนหลังได้ที่หน้ารายละเอียดวัสดุ
  var suppliers = {};
  _itemsData.forEach(function(i){ if (i.supplier) suppliers[i.supplier] = 1; });
  body += '<div><label class="form-label">ชื่อร้าน/ผู้จำหน่าย</label>'
    + '<input type="text" id="recSupplier" list="recSupplierList" value="' + escHtml(item.supplier||'') + '" placeholder="ร้านที่ซื้อ" class="form-input">'
    + '<datalist id="recSupplierList">' + Object.keys(suppliers).map(function(n){ return '<option value="' + escHtml(n) + '">'; }).join('') + '</datalist></div>';
  body += fieldHTML('ราคาต่อหน่วย (บาท)', 'recPrice', 'number', item.price||0, '', '0.01');
  body += '</div>';
  body += '<div class="sm:col-span-2"><label class="form-label">หมายเหตุ</label><textarea id="recNote" class="form-input" rows="2"></textarea></div>';
  body += '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitReceive()" class="btn-success"><i class="fi fi-rr-inbox-in mr-1"></i>บันทึกรับเข้า</button>';
  openModal('รับวัสดุเข้าคลัง', body, footer);
}

function submitReceive() {
  var itemId = (document.getElementById('recItemId')||{}).value||'';
  var qty    = parseInt((document.getElementById('recQty')||{}).value||0);
  var date   = (document.getElementById('recDate')||{}).value||'';
  var note   = (document.getElementById('recNote')||{}).value||'';
  var supplier = ((document.getElementById('recSupplier')||{}).value||'').trim();
  var price    = parseFloat((document.getElementById('recPrice')||{}).value)||0;
  if (!itemId) { showError('กรุณาเลือกวัสดุ'); return; }
  if (!qty || qty <= 0) { showError('จำนวนไม่ถูกต้อง'); return; }
  if (price < 0) { showError('ราคาไม่ถูกต้อง'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('addReceive', AUTH.token, { item_id:itemId, quantity:qty, date:date, note:note, supplier:supplier, unit_price:price }).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) { showSuccess(res.message); _itemsCacheTime = 0; renderReceive(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

// ===== STOCKTAKE =====
// ขั้นตอน: เจ้าหน้าที่บัญชีตรวจนับ -> "บันทึกฉบับร่าง" (ยังไม่แตะสต็อก) -> ผู้ดูแลระบบ "ยืนยันปรับยอด" จึงปรับสต็อกจริง
var NO_CATEGORY = 'ไม่ระบุหมวดหมู่';
var _stDrafts = [];     // ฉบับร่างที่รอยืนยัน + ประวัติการตรวจนับล่าสุด
var _stDraft  = null;   // ฉบับร่างที่รอยืนยันอยู่ (ระบบให้มีได้ครั้งละ 1 ฉบับ)
var _stCounts = {};     // item_id -> จำนวนที่นับจริงที่กรอกอยู่บนจอ
var _stMoved  = {};     // item_id -> บรรทัดในฉบับร่างที่ยอดระบบเปลี่ยนไปหลังบันทึกร่าง
var _stDirty  = false;  // มีการแก้ไขที่ยังไม่ได้บันทึกฉบับร่าง
var _stView   = { sort:'category', category:'all', search:'', onlyDiff:false };

function updateStocktakeBadge(n) {
  var el = document.getElementById('stocktakeBadge');
  if (!el) return;
  if (n > 0 && canStocktake()) { el.textContent = n; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

/** stApiError — ข้อความ error จาก backend (แปลกรณี Apps Script ยังเป็นเวอร์ชันเก่าที่ไม่มีฟังก์ชันฉบับร่าง) */
function stApiError(res, fallback) {
  var msg = (res && res.message) || fallback || 'เกิดข้อผิดพลาด';
  if (/Unknown function|Use GET for/i.test(msg)) {
    return 'ระบบหลังบ้านยังเป็นเวอร์ชันเก่า กรุณานำไฟล์ code.gs ล่าสุดไปวางใน Google Apps Script แล้ว Deploy เวอร์ชันใหม่';
  }
  return msg;
}

function renderStocktake() {
  if (!canStocktake()) { loadPage('dashboard'); return; }
  showLoading('โหลดข้อมูล...');
  // ดึงยอดล่าสุดทุกครั้ง (ไม่ใช้แคช) เพราะผลต่างคำนวณเทียบกับยอดในระบบ ณ ตอนนับ
  Promise.all([ callAPI('getItems', AUTH.token), callAPI('getStocktakes', AUTH.token) ]).then(function(results) {
    hideLoading();
    var itemsRes = results[0] || {};
    var stRes    = results[1] || {};
    if (!itemsRes.success) { showError(itemsRes.message || 'โหลดข้อมูลไม่สำเร็จ'); return; }
    _itemsData = itemsRes.data || [];
    _itemsCacheTime = Date.now();
    if (!stRes.success) showError(stApiError(stRes, 'โหลดฉบับร่างไม่สำเร็จ'));
    _stDrafts = (stRes.success && stRes.data) || [];
    _stDraft  = _stDrafts.find(function(d){ return d.status === 'pending'; }) || null;
    initStocktakeCounts();
    updateStocktakeBadge(_stDraft ? 1 : 0);
    buildStocktakePage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

/** initStocktakeCounts — ตั้งค่าช่อง "นับจริง" เริ่มต้น: ใช้ค่าจากฉบับร่างที่ค้างอยู่ ถ้าไม่มีให้เท่ากับยอดในระบบ */
function initStocktakeCounts() {
  _stCounts = {}; _stMoved = {}; _stDirty = false;
  var lineById = {};
  if (_stDraft) (_stDraft.lines || []).forEach(function(l){ lineById[l.item_id] = l; });
  _itemsData.forEach(function(item) {
    var sys  = Number(item.current_stock) || 0;
    var line = lineById[item.id];
    if (!line) { _stCounts[item.id] = sys; return; }
    if (Number(line.system) === sys) { _stCounts[item.id] = Number(line.actual); return; }
    // ยอดระบบเปลี่ยนหลังบันทึกร่าง (มีการรับเข้า/เบิก) — คงผลต่างเดิมไว้ ซึ่งตรงกับที่ระบบจะใช้ปรับตอนยืนยัน
    _stCounts[item.id] = Math.max(0, sys + (Number(line.actual) - Number(line.system)));
    _stMoved[item.id]  = line;
  });
}

function stCat(item) { return item.category || NO_CATEGORY; }

/** stDiffOf — ผลต่าง (นับจริง - ระบบ) ของวัสดุ; ช่องที่เว้นว่างถือว่ายังไม่ได้นับ = ไม่มีผลต่าง */
function stDiffOf(item) {
  var v = _stCounts[item.id];
  if (v === '' || v === undefined || v === null || isNaN(v)) return 0;
  return Number(v) - (Number(item.current_stock) || 0);
}

function stDiffCount() {
  return _itemsData.filter(function(i){ return stDiffOf(i) !== 0; }).length;
}

/** stVisibleItems — รายการที่แสดงตามตัวกรอง พร้อมจัดเรียง (ค่าเริ่มต้น: จัดกลุ่มตามหมวดหมู่) */
function stVisibleItems() {
  var q = _stView.search.toLowerCase();
  var list = _itemsData.filter(function(i) {
    if (_stView.category !== 'all' && stCat(i) !== _stView.category) return false;
    if (q && (i.name || '').toLowerCase().indexOf(q) === -1 && (i.item_code || '').toLowerCase().indexOf(q) === -1
          && (i.barcode || '').toLowerCase().indexOf(q) === -1) return false;
    if (_stView.onlyDiff && stDiffOf(i) === 0) return false;
    return true;
  });
  var byCode = function(a, b){ return (a.item_code || '').localeCompare(b.item_code || ''); };
  if (_stView.sort === 'name') {
    list.sort(function(a, b){ return (a.name || '').localeCompare(b.name || '', 'th') || byCode(a, b); });
  } else if (_stView.sort === 'code') {
    list.sort(byCode);
  } else {
    list.sort(function(a, b){ return stCat(a).localeCompare(stCat(b), 'th') || byCode(a, b); });
  }
  return list;
}

function stDiffHTML(diff) {
  if (diff === 0) return '<span class="st-diff text-xs font-medium text-gray-400">-</span>';
  return '<span class="st-diff text-sm font-bold ' + (diff > 0 ? 'text-green-600' : 'text-red-600') + '">' + (diff > 0 ? '+' : '') + diff + '</span>';
}

function stRowsHTML() {
  var list = stVisibleItems();
  if (!list.length) return '<tr><td colspan="4" class="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>';
  var grouped = _stView.sort === 'category';
  var perCat  = {};
  list.forEach(function(i){ perCat[stCat(i)] = (perCat[stCat(i)] || 0) + 1; });

  var html = '';
  var lastCat = null;
  list.forEach(function(item) {
    var cat = stCat(item);
    if (grouped && cat !== lastCat) {
      lastCat = cat;
      html += '<tr class="bg-navy-50"><td colspan="4" class="px-4 py-2 text-xs font-bold text-navy-700">'
        + '<i class="fi fi-rr-folder mr-1.5"></i>' + escHtml(cat)
        + ' <span class="font-normal text-gray-500">(' + perCat[cat] + ' รายการ)</span></td></tr>';
    }
    var sys   = Number(item.current_stock) || 0;
    var val   = _stCounts[item.id];
    var moved = _stMoved[item.id];
    html += '<tr><td class="px-4 py-3"><p class="font-medium text-gray-800">' + escHtml(item.name) + '</p>'
      + '<p class="text-xs text-gray-500">' + escHtml(item.item_code) + ' • ' + escHtml(item.unit)
      + (item.size ? ' • ' + escHtml(item.size) : '') + (grouped ? '' : ' • ' + escHtml(cat)) + '</p>';
    if (moved) {
      html += '<p class="text-xs text-amber-600 mt-0.5"><i class="fi fi-rr-triangle-warning mr-1"></i>ยอดระบบเปลี่ยนจาก ' + moved.system + ' เป็น ' + sys
        + ' หลังบันทึกร่าง (ตอนนั้นนับได้ ' + moved.actual + ') — คงผลต่างเดิมไว้ให้ กรุณาตรวจสอบ</p>';
    }
    html += '</td>';
    html += '<td class="px-4 py-3 text-center font-bold text-gray-800">' + sys + '</td>';
    html += '<td class="px-4 py-3 text-center"><input type="number" min="0" inputmode="numeric" data-id="' + item.id + '" value="' + (val === undefined || val === null ? '' : val) + '"'
      + ' oninput="stOnCount(this)" class="st-count w-20 border border-gray-300 rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"></td>';
    html += '<td class="px-4 py-3 text-center">' + stDiffHTML(stDiffOf(item)) + '</td></tr>';
  });
  return html;
}

function stSummaryHTML() {
  var n = stDiffCount();
  var html = '<span class="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium"><i class="fi fi-rr-box-open-full mr-1"></i>ทั้งหมด: ' + _itemsData.length + ' รายการ</span>';
  html += '<span class="' + (n > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700') + ' px-3 py-1.5 rounded-full font-medium"><i class="fi fi-rr-clipboard-list mr-1"></i>มีผลต่าง: ' + n + ' รายการ</span>';
  if (_stDirty) html += '<span class="bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-medium"><i class="fi fi-rr-pencil mr-1"></i>มีการแก้ไขที่ยังไม่ได้บันทึกฉบับร่าง</span>';
  return html;
}

function stRefreshSummary() {
  var el = document.getElementById('stSummary');
  if (el) el.innerHTML = stSummaryHTML();
}

function stRefreshTable() {
  var el = document.getElementById('stTableBody');
  if (el) el.innerHTML = stRowsHTML();
}

function stOnCount(inp) {
  var id = inp.getAttribute('data-id');
  var v  = parseInt(inp.value);
  _stCounts[id] = isNaN(v) ? '' : v;
  _stDirty = true;
  var item = _itemsData.find(function(i){ return i.id === id; });
  var cell = inp.closest('tr').querySelector('.st-diff');
  if (item && cell) cell.outerHTML = stDiffHTML(stDiffOf(item));
  stRefreshSummary();
}

function stSetView(key, value) {
  _stView[key] = value;
  stRefreshTable();
}

/** stWhoWhen — "โดยใคร, วัน/เวลา" ของฉบับร่าง */
function stWhoWhen(d) {
  var name = d.saved_by_name || d.created_by_name || '-';
  var role = ROLE_LABELS[d.saved_by_role || d.created_by_role] || '';
  return escHtml(name) + (role ? ' (' + role + ')' : '') + ' • ' + formatDateTime(d.saved_at || d.created_at);
}

function buildStocktakePage() {
  var isAdmin = AUTH.user.role === 'admin';
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">';
  html += '<h3 class="font-semibold text-gray-700"><i class="fi fi-rr-clipboard-list text-navy-600 mr-2"></i>นับสต็อก</h3>';
  html += '<div class="flex gap-2 flex-wrap">';
  html += '<button onclick="submitStocktakeDraft()" class="btn-secondary flex items-center gap-2"><i class="fi fi-rr-document"></i> บันทึกฉบับร่าง</button>';
  if (isAdmin) html += '<button onclick="openStocktakeApprove()" class="btn-primary flex items-center gap-2"><i class="fi fi-rr-disk"></i> ยืนยันปรับยอด</button>';
  html += '</div></div>';

  if (_stDraft) {
    var isOwner = _stDraft.created_by === AUTH.user.id || _stDraft.saved_by === AUTH.user.id;
    html += '<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">';
    html += '<div class="min-w-0"><p class="font-semibold text-amber-800 text-sm"><i class="fi fi-rr-document mr-1.5"></i>ฉบับร่าง ' + escHtml(_stDraft.draft_no) + ' — รอผู้ดูแลระบบยืนยัน</p>';
    html += '<p class="text-xs text-amber-700 mt-1">บันทึกโดย: ' + stWhoWhen(_stDraft) + ' • ผลต่าง ' + (_stDraft.diff_count || 0) + ' รายการ</p>';
    if (_stDraft.note) html += '<p class="text-xs text-amber-700 mt-0.5">หมายเหตุ: ' + escHtml(_stDraft.note) + '</p>';
    html += '</div><div class="flex gap-2 flex-shrink-0">';
    html += '<button onclick="openStocktakeDetail(\'' + _stDraft.id + '\')" class="btn-secondary btn-sm text-xs"><i class="fi fi-rr-eye mr-1"></i>ดูผลต่าง</button>';
    if (isAdmin || isOwner) html += '<button onclick="doRejectStocktake(\'' + _stDraft.id + '\')" class="btn-danger btn-sm text-xs"><i class="fi fi-rr-cross mr-1"></i>' + (isAdmin ? 'ไม่อนุมัติ' : 'ยกเลิกฉบับร่าง') + '</button>';
    html += '</div></div>';
  } else {
    html += '<p class="text-xs text-gray-500">กรอกจำนวนที่นับได้จริงในช่อง "นับจริง" แล้วกด "บันทึกฉบับร่าง" — สต็อกในระบบจะถูกปรับก็ต่อเมื่อผู้ดูแลระบบกดยืนยันฉบับร่างแล้วเท่านั้น</p>';
  }

  // ตัวกรอง / การเรียง
  var cats = {};
  _itemsData.forEach(function(i){ cats[stCat(i)] = 1; });
  html += '<div class="card p-3 flex flex-wrap gap-2 items-center">';
  html += '<div class="relative"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>';
  html += '<input type="text" placeholder="ค้นหาวัสดุ..." value="' + escHtml(_stView.search) + '" oninput="stSetView(\'search\', this.value)" class="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 w-44"></div>';
  html += '<select onchange="stSetView(\'category\', this.value)" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">';
  html += '<option value="all">ทุกหมวดหมู่</option>';
  Object.keys(cats).sort(function(a, b){ return a.localeCompare(b, 'th'); }).forEach(function(c) {
    html += '<option value="' + escHtml(c) + '"' + (_stView.category === c ? ' selected' : '') + '>' + escHtml(c) + '</option>';
  });
  html += '</select>';
  html += '<select onchange="stSetView(\'sort\', this.value)" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">';
  [['category','เรียงตามหมวดหมู่'],['code','เรียงตามรหัสวัสดุ'],['name','เรียงตามชื่อวัสดุ']].forEach(function(o) {
    html += '<option value="' + o[0] + '"' + (_stView.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  });
  html += '</select>';
  html += '<label class="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer"><input type="checkbox"' + (_stView.onlyDiff ? ' checked' : '') + ' onchange="stSetView(\'onlyDiff\', this.checked)" class="rounded"> เฉพาะที่มีผลต่าง</label>';
  html += '<input type="text" id="stNote" maxlength="200" value="' + escHtml((_stDraft && _stDraft.note) || '') + '" oninput="_stDirty=true;stRefreshSummary()" placeholder="หมายเหตุ เช่น ตรวจนับสิ้นเดือน ต.ค. 2569" class="flex-1 min-w-[200px] border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">';
  html += '</div>';

  html += '<div id="stSummary" class="flex gap-2 flex-wrap text-xs">' + stSummaryHTML() + '</div>';

  html += '<div class="card overflow-hidden"><div class="overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-gray-600 text-xs">';
  html += '<tr><th class="px-4 py-3 text-left">รหัส/ชื่อ</th><th class="px-4 py-3 text-center whitespace-nowrap">ระบบ</th><th class="px-4 py-3 text-center whitespace-nowrap">นับจริง</th><th class="px-4 py-3 text-center whitespace-nowrap">ผลต่าง</th></tr></thead>';
  html += '<tbody id="stTableBody" class="divide-y divide-gray-100">' + stRowsHTML() + '</tbody></table></div></div>';

  // ประวัติการตรวจนับ
  var closed = _stDrafts.filter(function(d){ return d.status !== 'pending'; });
  if (closed.length) {
    html += '<div class="card overflow-hidden"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-time-past text-navy-600"></i> ประวัติการตรวจนับ</h3></div>';
    html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-gray-600 text-xs">';
    html += '<tr><th class="px-4 py-2 text-left">เลขที่</th><th class="px-4 py-2 text-left">ตรวจนับโดย / เวลา</th><th class="px-4 py-2 text-center whitespace-nowrap">ผลต่าง</th>';
    html += '<th class="px-4 py-2 text-center">สถานะ</th><th class="px-4 py-2 text-left">ดำเนินการโดย / เวลา</th><th class="px-4 py-2 text-center">ดู</th></tr></thead><tbody class="divide-y divide-gray-100">';
    closed.forEach(function(d) {
      html += '<tr><td class="px-4 py-2 font-mono text-xs text-navy-700 whitespace-nowrap">' + escHtml(d.draft_no) + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-600">' + stWhoWhen(d) + '</td>';
      html += '<td class="px-4 py-2 text-center text-xs font-bold text-gray-700">' + (d.diff_count || 0) + '</td>';
      html += '<td class="px-4 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ' + (_statusBadgeClass[d.status] || '') + '">' + stStatusLabel(d.status) + '</span></td>';
      html += '<td class="px-4 py-2 text-xs text-gray-600">' + escHtml(d.approved_by_name || '-') + (d.approved_at ? ' • ' + formatDateTime(d.approved_at) : '') + '</td>';
      html += '<td class="px-4 py-2 text-center"><button title="ดูรายละเอียด" onclick="openStocktakeDetail(\'' + d.id + '\')" class="w-7 h-7 bg-gray-100 text-gray-600 rounded-lg inline-flex items-center justify-center hover:bg-gray-200"><i class="fi fi-rr-eye text-xs"></i></button></td></tr>';
    });
    html += '</tbody></table></div></div>';
  }

  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;
}

function stStatusLabel(status) {
  return { pending:'ฉบับร่าง รอยืนยัน', approved:'ยืนยันปรับยอดแล้ว', rejected:'ไม่อนุมัติ/ยกเลิก' }[status] || status;
}

/** submitStocktakeDraft — บันทึกฉบับร่างการตรวจนับ (เฉพาะรายการที่นับจริงไม่ตรงกับระบบ) ยังไม่ปรับสต็อก */
function submitStocktakeDraft() {
  var lines = [];
  var bad   = '';
  _itemsData.forEach(function(item) {
    var v = _stCounts[item.id];
    if (v === '' || v === undefined || v === null || isNaN(v)) return;   // เว้นว่าง = ยังไม่ได้นับ
    if (Number(v) < 0) { bad = bad || item.name; return; }
    var sys = Number(item.current_stock) || 0;
    if (Number(v) !== sys) lines.push({ item_id: item.id, system: sys, actual: Number(v) });
  });
  if (bad) { showError('จำนวนที่นับของ "' + bad + '" ต้องไม่ติดลบ'); return; }

  var note = ((document.getElementById('stNote') || {}).value || '').trim();
  var text = (lines.length
    ? 'พบผลต่าง ' + lines.length + ' รายการ'
    : 'ไม่พบผลต่าง (นับจริงตรงกับระบบทุกรายการ)')
    + ' — บันทึกเป็นฉบับร่างเพื่อรอผู้ดูแลระบบยืนยัน? (สต็อกยังไม่ถูกปรับ)';
  showConfirm(_stDraft ? 'บันทึกทับฉบับร่าง ' + _stDraft.draft_no : 'บันทึกฉบับร่าง', text, function() {
    showLoading('กำลังบันทึกฉบับร่าง...');
    callAPI('saveStocktakeDraft', AUTH.token, {
      id: _stDraft ? _stDraft.id : '', note: note, total_items: _itemsData.length, lines: lines
    }).then(function(res) {
      hideLoading();
      if (res && res.success) { showSuccess(res.message); renderStocktake(); }
      else showError(stApiError(res, 'บันทึกฉบับร่างไม่สำเร็จ'));
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด ไม่สามารถบันทึกฉบับร่างได้'); });
  }, 'บันทึกฉบับร่าง');
}

/** openStocktakeApprove — ผู้ดูแลระบบเปิดฉบับร่างเพื่อตรวจผลต่างก่อนยืนยันปรับยอด */
function openStocktakeApprove() {
  if (!_stDraft) { showError('ยังไม่มีฉบับร่างรอยืนยัน กรุณาตรวจนับแล้วกด "บันทึกฉบับร่าง" ก่อน'); return; }
  if (_stDirty) { showError('มีการแก้ไขที่ยังไม่ได้บันทึก กรุณากด "บันทึกฉบับร่าง" ก่อนยืนยันปรับยอด'); return; }
  openStocktakeDetail(_stDraft.id);
}

/** openStocktakeDetail — รายละเอียดฉบับร่าง/ประวัติการตรวจนับ: ยอดระบบ นับจริง ผลต่าง และยอดหลังปรับ */
function openStocktakeDetail(id) {
  var d = _stDrafts.find(function(x){ return x.id === id; });
  if (!d) return;
  var isAdmin   = AUTH.user.role === 'admin';
  var isPending = d.status === 'pending';
  var isOwner   = d.created_by === AUTH.user.id || d.saved_by === AUTH.user.id;
  var lines = (d.lines || []).slice().sort(function(a, b) {
    return (a.category || NO_CATEGORY).localeCompare(b.category || NO_CATEGORY, 'th') || (a.item_code || '').localeCompare(b.item_code || '');
  });

  var body = '<div class="space-y-3">';
  body += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">';
  body += '<div class="bg-gray-50 rounded-xl p-3"><p class="text-xs text-gray-400 mb-1">ตรวจนับ/บันทึกร่างโดย</p><p class="font-semibold text-gray-700">' + stWhoWhen(d) + '</p></div>';
  body += '<div class="bg-gray-50 rounded-xl p-3"><p class="text-xs text-gray-400 mb-1">สถานะ</p><p><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (_statusBadgeClass[d.status] || '') + '">' + stStatusLabel(d.status) + '</span>';
  if (!isPending) body += ' <span class="text-xs text-gray-500">โดย ' + escHtml(d.approved_by_name || '-') + ' • ' + formatDateTime(d.approved_at) + '</span>';
  body += '</p></div></div>';
  if (d.note) body += '<p class="text-xs text-gray-500"><b>หมายเหตุ:</b> ' + escHtml(d.note) + '</p>';
  if (d.status === 'rejected' && d.reject_reason) body += '<p class="text-xs text-red-600"><b>เหตุผล:</b> ' + escHtml(d.reject_reason) + '</p>';

  if (!lines.length) {
    body += '<div class="bg-green-50 text-green-700 rounded-xl p-4 text-sm text-center"><i class="fi fi-rr-check-circle mr-1"></i>นับจริงตรงกับยอดในระบบทุกรายการ ไม่มีผลต่าง</div>';
  } else {
    body += '<div class="border border-gray-200 rounded-xl overflow-hidden"><div class="overflow-x-auto max-h-[50vh] overflow-y-auto"><table class="w-full text-sm">';
    body += '<thead class="bg-gray-50 text-gray-600 text-xs sticky top-0"><tr><th class="px-3 py-2 text-left">รายการ</th><th class="px-3 py-2 text-center whitespace-nowrap">ระบบ (ตอนนับ)</th>';
    body += '<th class="px-3 py-2 text-center whitespace-nowrap">นับจริง</th><th class="px-3 py-2 text-center whitespace-nowrap">ผลต่าง</th>';
    if (d.status !== 'rejected') body += '<th class="px-3 py-2 text-center whitespace-nowrap">' + (isPending ? 'สต็อกหลังปรับ' : 'ปรับเป็น') + '</th>';
    body += '</tr></thead><tbody class="divide-y divide-gray-100">';
    lines.forEach(function(l) {
      var diff  = Number(l.actual) - Number(l.system);
      var moved = isPending && Number(l.current_stock) !== Number(l.system);
      var after = isPending ? Math.max(0, Number(l.current_stock) + diff) : l.after;
      body += '<tr><td class="px-3 py-2"><p class="font-medium text-gray-800">' + escHtml(l.item_name) + '</p>';
      body += '<p class="text-xs text-gray-500">' + escHtml(l.item_code) + (l.category ? ' • ' + escHtml(l.category) : '') + '</p>';
      if (moved) body += '<p class="text-xs text-amber-600"><i class="fi fi-rr-triangle-warning mr-1"></i>มีการรับเข้า/เบิกหลังนับ ยอดระบบปัจจุบัน ' + l.current_stock + '</p>';
      body += '</td><td class="px-3 py-2 text-center text-gray-700">' + l.system + '</td>';
      body += '<td class="px-3 py-2 text-center font-bold text-gray-800">' + l.actual + '</td>';
      body += '<td class="px-3 py-2 text-center">' + stDiffHTML(diff) + '</td>';
      if (d.status !== 'rejected') body += '<td class="px-3 py-2 text-center font-bold ' + (moved ? 'text-amber-600' : 'text-navy-700') + '">' + (after === undefined || after === null ? '-' : after) + ' <span class="text-xs font-normal text-gray-400">' + escHtml(l.unit || '') + '</span></td>';
      body += '</tr>';
    });
    body += '</tbody></table></div></div>';
  }
  if (isPending) {
    body += '<p class="text-xs text-gray-500"><i class="fi fi-rr-info mr-1"></i>' + (isAdmin
      ? 'เมื่อกด "ยืนยันปรับสต็อก" ระบบจะปรับยอดตามผลต่างข้างต้นและบันทึกลงประวัติเคลื่อนไหวประเภท "ปรับยอด"'
      : 'ฉบับร่างนี้รอผู้ดูแลระบบยืนยัน สต็อกในระบบยังไม่ถูกปรับ') + '</p>';
  }
  body += '</div>';

  var footer = '<button onclick="closeModal()" class="btn-secondary">ปิด</button>';
  if (isPending && isAdmin) {
    footer += '<button onclick="doRejectStocktake(\'' + d.id + '\')" class="btn-danger"><i class="fi fi-rr-cross mr-1"></i>ไม่อนุมัติ</button>'
      + '<button onclick="doApproveStocktake(\'' + d.id + '\')" class="btn-success"><i class="fi fi-rr-check mr-1"></i>ยืนยันปรับสต็อก</button>';
  } else if (isPending && isOwner) {
    footer += '<button onclick="doRejectStocktake(\'' + d.id + '\')" class="btn-danger"><i class="fi fi-rr-cross mr-1"></i>ยกเลิกฉบับร่าง</button>';
  }
  openModal((isPending ? 'ฉบับร่างตรวจนับ ' : 'ผลการตรวจนับ ') + d.draft_no, body, footer, 'max-w-3xl');
}

/** doApproveStocktake — ผู้ดูแลระบบยืนยันฉบับร่าง -> ปรับสต็อกจริง */
function doApproveStocktake(id) {
  var d = _stDrafts.find(function(x){ return x.id === id; });
  if (!d) return;
  showConfirm('ยืนยันปรับสต็อก', 'ระบบจะปรับสต็อก ' + (d.diff_count || 0) + ' รายการตามฉบับร่าง ' + d.draft_no + ' และไม่สามารถยกเลิกย้อนหลังได้ ยืนยัน?', function() {
    showLoading('กำลังปรับยอด...');
    callAPI('approveStocktake', AUTH.token, id).then(function(res) {
      hideLoading();
      if (res && res.success) { closeModal(); showSuccess(res.message); }
      else showError(stApiError(res, 'ปรับยอดไม่สำเร็จ'));
      renderStocktake();   // โหลดยอดและสถานะล่าสุดเสมอ ไม่ว่าจะสำเร็จหรือไม่
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด ไม่สามารถปรับยอดได้'); });
  }, 'ยืนยันปรับสต็อก');
}

/** doRejectStocktake — ผู้ดูแลระบบไม่อนุมัติ หรือผู้บันทึกยกเลิกฉบับร่างของตนเอง (สต็อกไม่ถูกปรับ) */
function doRejectStocktake(id) {
  var isAdmin = AUTH.user.role === 'admin';
  var title   = isAdmin ? 'ไม่อนุมัติฉบับร่าง' : 'ยกเลิกฉบับร่าง';
  Swal.fire({
    title: title, text: 'สต็อกในระบบจะไม่ถูกปรับ และต้องตรวจนับ/บันทึกฉบับร่างใหม่', icon: 'warning',
    input: 'text', inputPlaceholder: 'เหตุผล (ถ้ามี)',
    showCancelButton: true, confirmButtonText: title, cancelButtonText: 'กลับ',
    reverseButtons: true, customClass: { popup: 'swal2-popup' }
  }).then(function(r) {
    if (!r.isConfirmed) return;
    showLoading('กำลังบันทึก...');
    callAPI('rejectStocktake', AUTH.token, id, r.value || '').then(function(res) {
      hideLoading();
      if (res && res.success) { closeModal(); showSuccess(res.message); }
      else showError(stApiError(res, 'ดำเนินการไม่สำเร็จ'));
      renderStocktake();
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  });
}

// ===== PRINT QR LABELS =====
var _printQRFilter = { search:'', category:'all' };
function renderPrintQRLabels() {
  showLoading('โหลดข้อมูล...');
  var itemsPromise = (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL)
    ? Promise.resolve({ success: true, data: _itemsData })
    : callAPI('getItems', AUTH.token).then(function(res){ _itemsData = res.data||[]; _itemsCacheTime = Date.now(); return res; });
  itemsPromise.then(function(res) {
    hideLoading();
    _itemsData = res.data || [];
    buildPrintQRPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildPrintQRPage() {
  var filtered = _itemsData.filter(function(i) {
    if (i.active === false) return false;
    if (_printQRFilter.search && !i.name.toLowerCase().includes(_printQRFilter.search.toLowerCase()) && !(i.item_code||'').toLowerCase().includes(_printQRFilter.search.toLowerCase())) return false;
    if (_printQRFilter.category !== 'all' && i.category !== _printQRFilter.category) return false;
    return true;
  });
  var cats = getCategoryList(_itemsData);

  var html = '<div class="fade-in space-y-4">';
  // Toolbar
  html += '<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">';
  html += '<div class="flex gap-2 flex-wrap">';
  html += '<div class="relative"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>';
  html += '<input type="text" id="printQRSearch" placeholder="ค้นหาวัสดุ..." value="' + escHtml(_printQRFilter.search) + '" onkeyup="debouncePrintQRFilter()" class="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 w-48"></div>';
  html += '<select id="printQRCat" onchange="applyPrintQRFilter()" class="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">';
  html += '<option value="all">ทุกหมวด</option>';
  cats.forEach(function(c){ html += '<option value="' + escHtml(c) + '" ' + (_printQRFilter.category===c?'selected':'') + '>' + escHtml(c) + '</option>'; });
  html += '</select></div>';
  html += '<div class="flex gap-2">';
  html += '<button onclick="toggleSelectAllQR()" class="btn-secondary btn-sm"><i class="fi fi-rr-check mr-1"></i>เลือกทั้งหมด/ยกเลิก</button>';
  html += '<button onclick="printSelectedQRLabels()" class="btn-primary btn-sm"><i class="fi fi-rr-print mr-1"></i>พิมพ์ที่เลือก</button></div></div>';
  html += '<p class="text-xs text-gray-500">เลือกรายการที่ต้องการพิมพ์แล้วกดปุ่ม พิมพ์ที่เลือก (เลือกได้สูงสุด 20 รายการ/หน้า)</p>';

  // Grid
  html += '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">';
  if (filtered.length === 0) html += '<p class="col-span-full text-center text-gray-400 py-10">ไม่พบรายการ</p>';
  filtered.forEach(function(item) {
    var img = imgUrl(item.image_file_id);
    var imgHtml = img ? '<img src="' + img + '" class="w-10 h-10 object-cover rounded-lg border border-gray-200">' : '<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><i class="fi fi-rr-box-open-full text-gray-400 text-sm"></i></div>';
    html += '<label class="card p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" class="qr-print-check w-4 h-4 accent-navy-600 flex-shrink-0" data-id="' + item.id + '">';
    html += imgHtml;
    html += '<div class="min-w-0"><p class="text-sm font-medium text-gray-800 truncate">' + escHtml(item.name) + '</p>';
    html += '<p class="text-xs text-gray-500">' + escHtml(item.item_code) + '</p></div>';
    html += '</label>';
  });
  html += '</div></div>';
  document.getElementById('mainContent').innerHTML = html;
}

var _printQRFilterTimer;
function debouncePrintQRFilter() { clearTimeout(_printQRFilterTimer); _printQRFilterTimer = setTimeout(applyPrintQRFilter, 300); }
function applyPrintQRFilter() {
  _printQRFilter.search   = (document.getElementById('printQRSearch')||{}).value||'';
  _printQRFilter.category = (document.getElementById('printQRCat')||{}).value||'all';
  buildPrintQRPage();
}
function toggleSelectAllQR() {
  var checks = document.querySelectorAll('.qr-print-check');
  var allChecked = Array.prototype.every.call(checks, function(c){ return c.checked; });
  checks.forEach(function(c){ c.checked = !allChecked; });
}

function printSelectedQRLabels() {
  var selected = [];
  document.querySelectorAll('.qr-print-check:checked').forEach(function(c) {
    var id = c.getAttribute('data-id');
    var item = _itemsData.find(function(i){ return i.id === id; });
    if (item) selected.push(item);
  });
  if (selected.length === 0) { showError('กรุณาเลือกอย่างน้อย 1 รายการ'); return; }

  var baseUrl = window.location.origin + window.location.pathname;
  var win = window.open('', '_blank');
  var css = 'body{font-family:sarabun,sans-serif;margin:0;padding:8mm;background:#fff}' +
    '@media print{@page{size:A4;margin:8mm}}' +
    '.sheet{display:flex;flex-wrap:wrap;gap:4mm;justify-content:flex-start}' +
    '.label{width:44mm;height:30mm;border:1px solid #ccc;padding:2mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-inside:avoid}' +
    '.name{font-size:9px;font-weight:700;color:#1a2566;margin:0 0 0.5mm;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.meta{font-size:7px;color:#666;margin:0 0 1mm}' +
    '.qr-wrap{width:16mm;height:16mm}';

  var bodyHtml = '<div class="sheet">';
  selected.forEach(function(item) {
    var qrUrl = baseUrl + '?action=withdraw&item_id=' + item.id;
    bodyHtml += '<div class="label">';
    bodyHtml += '<p class="name">' + escHtml(item.name) + '</p>';
    bodyHtml += '<p class="meta">' + escHtml(item.item_code) + (item.size ? ' • ' + escHtml(item.size) : '') + '</p>';
    bodyHtml += '<div class="qr-wrap" id="qr_' + item.id + '"></div>';
    bodyHtml += '</div>';
  });
  bodyHtml += '</div>';

  var scriptHtml = '';
  selected.forEach(function(item) {
    var qrUrl = baseUrl + '?action=withdraw&item_id=' + item.id;
    scriptHtml += 'new QRCode(document.getElementById("qr_' + item.id + '"),{text:"' + qrUrl + '",width:60,height:60,colorDark:"#1a2566",correctLevel:QRCode.CorrectLevel.M});';
  });

  win.document.write('<html><head><title>พิมพ์ QR สติ๊กเกอร์</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">'
    + '<style>' + css + '</style></head><body>' + bodyHtml
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>'
    + '<script>' + scriptHtml + 'setTimeout(function(){window.print();},' + (selected.length * 150 + 300) + ');<\/script>'
    + '</body></html>');
  win.document.close();
}

// ===== WITHDRAW =====
var _wdData   = [];
var _wdPage   = 1;
var _wdFilter = 'all';

function renderWithdraw() {
  showLoading('โหลดข้อมูล...');
  var itemsPromise = (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL)
    ? Promise.resolve({ success: true, data: _itemsData })
    : callAPI('getItems', AUTH.token).then(function(res){ _itemsData = res.data||[]; _itemsCacheTime = Date.now(); return res; });
  refreshMyProfile();
  Promise.all([ itemsPromise, callAPI('getWithdrawals', AUTH.token, { status:'all' }) ]).then(function(results) {
    hideLoading();
    _itemsData = results[0].data || [];
    _wdData    = results[1].data || [];
    _wdPage    = 1;
    buildWithdrawPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildWithdrawPage() {
  var filtered = _wdFilter === 'all' ? _wdData : _wdData.filter(function(w){ return w.status === _wdFilter; });
  var paged    = paginate(filtered, _wdPage);

  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">';
  html += '<h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-inbox-out text-navy-600"></i> รายการคำขอเบิกวัสดุ</h3>';
  html += '<button onclick="openWithdrawSelectModal()" class="btn-primary flex items-center gap-2"><i class="fi fi-rr-plus"></i> ยื่นคำขอเบิก</button></div>';

  html += '<div class="flex gap-2 border-b">';
  ['all','pending','approved','rejected'].forEach(function(s) {
    var labels = { all:'ทั้งหมด', pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' };
    var count  = s === 'all' ? _wdData.length : _wdData.filter(function(w){ return w.status===s; }).length;
    html += '<button onclick="setWdFilter(\'' + s + '\')" class="pb-2.5 px-3 text-sm font-medium border-b-2 transition '
      + (_wdFilter===s ? 'border-navy-700 text-navy-700' : 'border-transparent text-gray-500 hover:text-gray-700') + '">'
      + labels[s] + ' <span class="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">' + count + '</span></button>';
  });
  html += '</div>';

  html += '<div class="card overflow-hidden"><div class="overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
  html += '<tr><th class="px-4 py-3 text-left">เลขที่เบิก</th><th class="px-4 py-3 text-left">วันที่</th>';
  html += '<th class="px-4 py-3 text-left">รายการ</th><th class="px-4 py-3 text-center">ขอ/อนุมัติ</th>';
  html += '<th class="px-4 py-3 text-left">วัตถุประสงค์</th><th class="px-4 py-3 text-left">ผู้ขอ</th>';
  html += '<th class="px-4 py-3 text-left">แผนกที่เบิก</th>';
  html += '<th class="px-4 py-3 text-center">สถานะ</th>';
  html += '<th class="px-4 py-3 text-center">จัดการ</th>';
  html += '</tr></thead><tbody class="divide-y divide-gray-100">';

  if (paged.length === 0) {
    html += '<tr><td colspan="9" class="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>';
  }
  paged.forEach(function(w) {
    var badgeClass = w.status==='approved'?'badge-approved':w.status==='rejected'?'badge-rejected':'badge-pending';
    var statusLabel = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' }[w.status]||w.status;
    html += '<tr>';
    html += '<td class="px-4 py-2.5 font-mono text-xs text-navy-700">' + escHtml(w.withdraw_no) + (w.via_qr?'<span class="ml-1 text-teal-600 text-xs" title="สแกน QR"><i class="fi fi-rr-qr-scan"></i></span>':'')
      + (w.batch_no?'<span class="block text-[10px] text-gray-400" title="ยื่นพร้อมกันเป็นชุด">ชุด ' + escHtml(w.batch_no) + '</span>':'') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500">' + formatDate(w.requested_at) + '</td>';
    html += '<td class="px-4 py-2.5 font-medium text-gray-700 max-w-xs truncate">' + escHtml(w.item_name) + '</td>';
    html += '<td class="px-4 py-2.5 text-center text-xs"><span class="text-gray-800 font-bold">' + w.quantity_requested + '</span>';
    if (w.status==='approved') html += '<span class="text-green-600 ml-1">/' + w.quantity_approved + '</span>';
    html += ' <span class="text-gray-400">' + escHtml(w.unit) + '</span></td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">' + escHtml(w.purpose||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-600">' + escHtml(w.requested_by_name||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs"><span class="px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 font-medium">' + escHtml(w.department||NO_DEPT) + '</span></td>';
    html += '<td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + badgeClass + '">' + statusLabel + '</span></td>';
    html += '<td class="px-4 py-2.5 text-center"><div class="flex gap-1 justify-center">';
    if (w.status === 'pending') {
      if (canApprove()) {
        html += '<button onclick="openApproveModal(\'' + w.id + '\',' + w.quantity_requested + ')" class="btn-success btn-sm text-xs"><i class="fi fi-rr-check mr-1"></i>อนุมัติ</button>';
        html += '<button onclick="openRejectModal(\'' + w.id + '\')" class="btn-danger btn-sm text-xs"><i class="fi fi-rr-cross mr-1"></i>ปฏิเสธ</button>';
      }
      if (w.requested_by === AUTH.user.id) {
        html += '<button onclick="doCancelWithdrawal(\'' + w.id + '\')" class="btn-secondary btn-sm text-xs"><i class="fi fi-rr-cross mr-1"></i>ยกเลิก</button>';
      }
    } else {
      html += '<span class="text-xs text-gray-400">—</span>';
    }
    html += '</div></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';

  html += '<div class="md:hidden space-y-3" id="wdMobileCards">';
  paged.forEach(function(w) {
    var badgeClass = w.status==='approved'?'badge-approved':w.status==='rejected'?'badge-rejected':'badge-pending';
    var statusLabel = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' }[w.status]||w.status;
    html += '<div class="card p-4 space-y-2">';
    html += '<div class="flex items-start justify-between">';
    html += '<div><p class="font-semibold text-gray-800 text-sm">' + escHtml(w.item_name) + '</p>';
    html += '<p class="text-xs text-navy-700 font-mono">' + escHtml(w.withdraw_no) + '</p></div>';
    html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + badgeClass + '">' + statusLabel + '</span></div>';
    html += '<div class="grid grid-cols-2 gap-1 text-xs text-gray-500">';
    html += '<span><i class="fi fi-rr-calendar-day mr-1"></i>' + formatDate(w.requested_at) + '</span>';
    html += '<span><i class="fi fi-rr-layers mr-1"></i>' + w.quantity_requested + ' ' + escHtml(w.unit) + '</span>';
    html += '<span><i class="fi fi-rr-user mr-1"></i>' + escHtml(w.requested_by_name||'-') + '</span>';
    html += '<span><i class="fi fi-rr-briefcase mr-1"></i>' + escHtml(w.department||NO_DEPT) + '</span>';
    html += '<span class="col-span-2"><i class="fi fi-rr-target mr-1"></i>' + escHtml(w.purpose||'-') + '</span></div>';
    if (w.status === 'pending') {
      html += '<div class="flex gap-2 pt-1">';
      if (canApprove()) {
        html += '<button onclick="openApproveModal(\'' + w.id + '\',' + w.quantity_requested + ')" class="flex-1 btn-success btn-sm text-xs">อนุมัติ</button>';
        html += '<button onclick="openRejectModal(\'' + w.id + '\')" class="flex-1 btn-danger btn-sm text-xs">ปฏิเสธ</button>';
      }
      if (w.requested_by === AUTH.user.id) {
        html += '<button onclick="doCancelWithdrawal(\'' + w.id + '\')" class="flex-1 btn-secondary btn-sm text-xs"><i class="fi fi-rr-cross mr-1"></i>ยกเลิก</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  html += '<div id="wdPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('wdPagination', filtered.length, _wdPage, function(p){ _wdPage=p; buildWithdrawPage(); });
}

function setWdFilter(f) { _wdFilter=f; _wdPage=1; buildWithdrawPage(); }

function openWithdrawSelectModal() {
  if (_itemsData.length === 0) {
    showLoading('โหลด...');
    callAPI('getItems', AUTH.token).then(function(res){ hideLoading(); _itemsData = res.data||[]; _openWdSelect(); });
  } else _openWdSelect();
}
function _openWdSelect() {
  _wdCart = [];
  var body = '<div class="space-y-3">'
    + wdDeptFieldHTML()
    + '<div class="flex gap-2">'
    + '<div class="relative flex-1"><i class="fi fi-rr-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>'
    + '<input type="text" id="wdItemSearch" placeholder="ค้นหาวัสดุ แล้วกดเพื่อเพิ่มลงรายการ..." onkeyup="filterWdItemList()" class="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"></div>'
    + '<button onclick="startWdQRScanner()" class="btn-primary px-3 py-2.5 rounded-xl" title="สแกน QR"><i class="fi fi-rr-qr-scan text-lg"></i></button></div>'
    + '<div id="wdItemList" class="max-h-56 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1">' + buildWdItemList(_itemsData) + '</div>'
    + '<div id="wdQRReader" class="hidden"></div>'
    + '<div id="wdCartBox"></div>'
    + '<div><label class="form-label">วัตถุประสงค์ *</label><input type="text" id="wdPurpose" class="form-input" placeholder="ระบุวัตถุประสงค์ (ใช้กับทุกรายการในคำขอนี้)..."></div>'
    + '<div><label class="form-label">หมายเหตุ</label><textarea id="wdNote" class="form-input" rows="2"></textarea></div>'
    + '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button id="wdSubmitBtn" onclick="submitWithdrawBulk()" class="btn-primary"><i class="fi fi-rr-inbox-out mr-1"></i>ยื่นคำขอเบิก</button>';
  openModal('เบิกวัสดุ (เลือกได้หลายรายการ)', body, footer, 'max-w-2xl');
  renderWdCart();
  refreshWdDeptField();
}

// ===== ตะกร้าเบิก (เบิกครั้งละหลายรายการ) =====
var _wdCart = [];

function wdCartAdd(itemId) {
  var item = _itemsData.find(function(i){ return i.id === itemId; });
  if (!item) { showError('ไม่พบรายการวัสดุ'); return; }
  if (item.current_stock <= 0) { showError('"' + item.name + '" สต็อกหมด ไม่สามารถเบิกได้'); return; }
  var line = _wdCart.find(function(l){ return l.id === itemId; });
  if (line) {
    if (line.qty >= item.current_stock) { showError('"' + item.name + '" คงเหลือ ' + item.current_stock + ' ' + item.unit + ' เท่านั้น'); return; }
    line.qty++;
  } else {
    _wdCart.push({ id:item.id, name:item.name, size:item.size||'', unit:item.unit, code:item.item_code, stock:item.current_stock, qty:1 });
  }
  renderWdCart();
}

function wdCartRemove(itemId) {
  _wdCart = _wdCart.filter(function(l){ return l.id !== itemId; });
  renderWdCart();
}

function wdCartSetQty(itemId, val) {
  var line = _wdCart.find(function(l){ return l.id === itemId; });
  if (!line) return;
  var qty = parseInt(val) || 0;
  if (qty < 1) qty = 1;
  if (qty > line.stock) { qty = line.stock; showError('"' + line.name + '" คงเหลือ ' + line.stock + ' ' + line.unit + ' เท่านั้น'); }
  line.qty = qty;
  var input = document.getElementById('wdQty_' + itemId);
  if (input) input.value = qty;
}

function renderWdCart() {
  var box = document.getElementById('wdCartBox');
  if (!box) return;
  var html = '<div class="border border-navy-100 rounded-xl overflow-hidden">';
  html += '<div class="bg-navy-50 px-3 py-2 flex items-center justify-between">';
  html += '<span class="text-sm font-semibold text-navy-800"><i class="fi fi-rr-shopping-cart mr-1"></i>รายการที่จะเบิก</span>';
  html += '<span class="text-xs font-bold text-navy-700">' + _wdCart.length + ' รายการ</span></div>';
  if (!_wdCart.length) {
    html += '<p class="text-center text-sm text-gray-400 py-5">ยังไม่ได้เลือกรายการ — กดที่วัสดุด้านบนเพื่อเพิ่ม (เลือกได้หลายรายการ)</p>';
  } else {
    html += '<div class="max-h-56 overflow-y-auto divide-y divide-gray-100">';
    _wdCart.forEach(function(l) {
      html += '<div class="flex items-center gap-2 px-3 py-2">';
      html += '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-700 truncate">' + escHtml(l.name) + (l.size ? ' <span class="text-gray-400 text-xs">(' + escHtml(l.size) + ')</span>' : '') + '</p>';
      html += '<p class="text-xs text-gray-400">' + escHtml(l.code||'') + ' • คงเหลือ ' + l.stock + ' ' + escHtml(l.unit) + '</p></div>';
      html += '<input type="number" id="wdQty_' + l.id + '" value="' + l.qty + '" min="1" max="' + l.stock + '" onchange="wdCartSetQty(\'' + l.id + '\', this.value)" class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-navy-400">';
      html += '<span class="text-xs text-gray-500 w-12 truncate">' + escHtml(l.unit) + '</span>';
      html += '<button onclick="wdCartRemove(\'' + l.id + '\')" title="ลบออก" class="w-7 h-7 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200 flex-shrink-0"><i class="fi fi-rr-trash text-xs"></i></button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  box.innerHTML = html;

  var btn = document.getElementById('wdSubmitBtn');
  if (btn) {
    btn.innerHTML = '<i class="fi fi-rr-inbox-out mr-1"></i>ยื่นคำขอเบิก' + (_wdCart.length ? ' (' + _wdCart.length + ' รายการ)' : '');
  }
}

function submitWithdrawBulk() {
  var dept    = (document.getElementById('wdDept')||{}).value||'';
  var purpose = (document.getElementById('wdPurpose')||{}).value||'';
  var note    = (document.getElementById('wdNote')||{}).value||'';
  if (!_wdCart.length) { showError('กรุณาเลือกรายการวัสดุที่ต้องการเบิกอย่างน้อย 1 รายการ'); return; }
  if (!dept) { showError('กรุณาเลือกแผนกที่เบิก'); return; }
  if (!purpose.trim()) { showError('กรุณาระบุวัตถุประสงค์'); return; }

  var payload = {
    items: _wdCart.map(function(l){ return { item_id:l.id, quantity:l.qty }; }),
    purpose: purpose, note: note, department: dept, via_qr: false
  };
  showLoading('กำลังยื่นคำขอ ' + _wdCart.length + ' รายการ...');
  callAPI('addWithdrawalBulk', AUTH.token, payload).then(function(res) {
    hideLoading();
    if (res.success) {
      closeModal();
      _wdCart = [];
      if (res.failed > 0) {
        Swal.fire({ icon:'warning', title:res.message,
          html:'<div style="text-align:left;font-size:13px">' + (res.errors||[]).map(escHtml).join('<br>') + '</div>',
          customClass:{popup:'swal2-popup'} });
      } else {
        showSuccess(res.message);
      }
      if (_currentPage === 'withdraw') renderWithdraw();
      else if (_currentPage === 'dashboard') renderDashboard();
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}
function startWdQRScanner() {
  document.getElementById('wdItemSearch').parentNode.parentNode.classList.add('hidden');
  document.getElementById('wdItemList').classList.add('hidden');
  var qrDiv = document.getElementById('wdQRReader');
  qrDiv.classList.remove('hidden');
  qrDiv.innerHTML = '<div class="text-center py-4"><div id="wd-qr-reader" class="mx-auto" style="width:280px"></div><button onclick="stopWdQRScanner()" class="btn-secondary btn-sm mt-3"><i class="fi fi-rr-cross mr-1"></i>ปิดกล้อง</button></div>';
  setTimeout(function() {
    try {
      _qrScanner = new Html5Qrcode('wd-qr-reader');
      _qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        function(decodedText) {
          stopWdQRScanner();
          try {
            var url = new URL(decodedText);
            var action = url.searchParams.get('action');
            var itemId = url.searchParams.get('item_id');
            if (action === 'withdraw' && itemId) {
              var found = _itemsData.find(function(i){ return i.id == itemId || i.item_code === itemId; });
              if (found) wdCartAdd(found.id);
              else { closeModal(); openWithdrawFromQR(itemId); }
            } else {
              showError('QR Code ไม่ถูกต้อง');
              stopWdQRScanner();
            }
          } catch(e) {
            showError('QR Code ไม่ถูกต้อง');
            stopWdQRScanner();
          }
        },
        function(errorMessage) {}
      ).catch(function(err) {
        console.error(err);
        showError('ไม่สามารถเปิดกล้องได้');
      });
    } catch(e) {
      console.error(e);
      showError('เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง');
    }
  }, 200);
}
function stopWdQRScanner() {
  if (_qrScanner) {
    _qrScanner.stop().then(function() {
      _qrScanner = null;
      document.getElementById('wdItemSearch').parentNode.parentNode.classList.remove('hidden');
      document.getElementById('wdItemList').classList.remove('hidden');
      document.getElementById('wdQRReader').classList.add('hidden');
    }).catch(function() {
      _qrScanner = null;
      document.getElementById('wdItemSearch').parentNode.parentNode.classList.remove('hidden');
      document.getElementById('wdItemList').classList.remove('hidden');
      document.getElementById('wdQRReader').classList.add('hidden');
    });
  } else {
    document.getElementById('wdItemSearch').parentNode.parentNode.classList.remove('hidden');
    document.getElementById('wdItemList').classList.remove('hidden');
    document.getElementById('wdQRReader').classList.add('hidden');
  }
}
function buildWdItemList(data) {
  if (data.length === 0) return '<p class="text-center text-sm text-gray-400 py-4">ไม่พบรายการ</p>';
  return data.map(function(i) {
    var sClass = getStockClass(i.current_stock, i.min_stock);
    var imgUrlSrc = imgUrl(i.image_file_id);
    var imgHtml = imgUrlSrc ? '<img src="' + imgUrlSrc + '" class="w-9 h-9 object-cover rounded-xl border border-gray-200 flex-shrink-0">' : '<div class="w-9 h-9 bg-navy-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fi fi-rr-box-open-full text-navy-700 text-sm"></i></div>';
    return '<div onclick="wdCartAdd(\'' + i.id + '\')" class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-navy-50 border border-transparent hover:border-navy-200 transition">'
      + imgHtml
      + '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-700 truncate">' + escHtml(i.name) + '</p>'
      + '<p class="text-xs text-gray-400">' + escHtml(i.item_code) + ' • ' + escHtml(i.size||'') + ' • ' + i.current_stock + ' ' + i.unit + '</p></div>'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ' + sClass + '">' + getStockLabel(i.current_stock, i.min_stock) + '</span>'
      + '<span class="w-7 h-7 bg-navy-700 text-white rounded-lg flex items-center justify-center flex-shrink-0" title="เพิ่มลงรายการเบิก"><i class="fi fi-rr-plus text-xs"></i></span></div>';
  }).join('');
}
function filterWdItemList() {
  var q = (document.getElementById('wdItemSearch')||{}).value||'';
  var filtered = _itemsData.filter(function(i){ return !q || i.name.toLowerCase().includes(q.toLowerCase()) || (i.item_code||'').includes(q); });
  document.getElementById('wdItemList').innerHTML = buildWdItemList(filtered);
}
function selectWdItem(id) {
  wdCartAdd(id);
}

/** wdDeptFieldHTML - ช่อง "แผนกที่เบิก" ในฟอร์มเบิกวัสดุ (ผูกกับบัญชีผู้ใช้) */
function wdDeptFieldHTML() {
  return '<div id="wdDeptWrap">' + wdDeptFieldInnerHTML() + '</div>';
}

/**
 * refreshWdDeptField — ดึงแผนกล่าสุดมาอัปเดตในฟอร์มที่เปิดอยู่
 * (ผู้ดูแลระบบเพิ่งกำหนดแผนกให้ ก็เห็นผลทันทีโดยไม่ต้องรีหน้าเว็บ)
 */
function refreshWdDeptField() {
  var before = userDept();
  refreshMyProfile().then(function() {
    if (userDept() === before) return;
    var wrap = document.getElementById('wdDeptWrap');
    if (wrap) wrap.innerHTML = wdDeptFieldInnerHTML();
  });
}

function wdDeptFieldInnerHTML() {
  var dept = userDept();
  if (dept) {
    return '<div class="flex flex-wrap items-center gap-2 bg-navy-50 border border-navy-100 rounded-xl px-3 py-2">'
      + '<span class="text-xs text-gray-500"><i class="fi fi-rr-briefcase mr-1"></i>แผนกที่เบิก</span>'
      + '<span class="px-2 py-0.5 bg-navy-700 text-white rounded-full text-xs font-semibold">' + escHtml(dept) + '</span>'
      + '<span class="text-xs text-gray-400 ml-auto truncate">' + escHtml(AUTH.user.name || AUTH.user.username || '') + '</span>'
      + '<input type="hidden" id="wdDept" value="' + escHtml(dept) + '"></div>';
  }
  return '<div><label class="form-label">แผนกที่เบิก *</label>'
    + '<select id="wdDept" class="form-input">' + deptOptionsHTML('') + '</select>'
    + '<p class="text-xs text-amber-600 mt-1"><i class="fi fi-rr-triangle-warning mr-1"></i>บัญชีนี้ยังไม่ได้ผูกแผนก กรุณาเลือกแผนก หรือแจ้งผู้ดูแลระบบให้กำหนดแผนกให้</p></div>';
}

/**
 * openWithdrawModal — เปิดฟอร์มเบิกแบบเลือกได้หลายรายการ
 * โดยใส่วัสดุที่กดปุ่ม "เบิก" มาให้เป็นรายการแรก แล้วเพิ่มรายการอื่นต่อได้เลย
 * (ใช้จากหน้าสต็อกคงเหลือ และหน้ารายละเอียดวัสดุ)
 */
function openWithdrawModal(itemId) {
  if (_itemsData.length === 0) {
    showLoading('โหลด...');
    callAPI('getItems', AUTH.token).then(function(res) {
      hideLoading();
      _itemsData = res.data || [];
      _itemsCacheTime = Date.now();
      _openWdSelect();
      if (itemId) wdCartAdd(itemId);
    }).catch(function(){ hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
    return;
  }
  _openWdSelect();
  if (itemId) wdCartAdd(itemId);
}

function openWithdrawFromQR(itemId) {
  showLoading('โหลดข้อมูล...');
  function _build(item) {
    hideLoading();
    var img = imgUrl(item.image_file_id);
    var body = '<div class="space-y-4">';
    body += '<input type="hidden" id="wdItemId" value="' + itemId + '">';
    body += '<input type="hidden" id="wdViaQr" value="true">';
    if (img) body += '<div class="flex justify-center"><img src="' + img + '" class="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow-sm"></div>';
    body += wdDeptFieldHTML();
    body += '<p class="text-sm text-gray-600 text-center">รายการ: <b>' + escHtml(item.name) + '</b> (คงเหลือ ' + item.current_stock + ' ' + item.unit + ')</p>';
    body += fieldHTML('จำนวนที่ต้องการเบิก *', 'wdQty', 'number', 1);
    body += '<div class="sm:col-span-2"><label class="form-label">วัตถุประสงค์ *</label><input type="text" id="wdPurpose" class="form-input" placeholder="ระบุวัตถุประสงค์..."></div>';
    body += '<div class="sm:col-span-2"><label class="form-label">หมายเหตุ</label><textarea id="wdNote" class="form-input" rows="2"></textarea></div>';
    body += '</div>';
    var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
      + '<button onclick="submitWithdraw()" class="btn-primary"><i class="fi fi-rr-inbox-out mr-1"></i>ยื่นคำขอเบิก</button>';
    openModal('เบิกวัสดุ (QR)', body, footer);
    refreshWdDeptField();
  }
  // reuse cache ถ้ามี
  if (_itemsData.length > 0 && (Date.now() - _itemsCacheTime) < ITEMS_CACHE_TTL) {
    var item = _itemsData.find(function(i){ return i.id == itemId; });
    if (!item) item = _itemsData.find(function(i){ return i.item_code === itemId; });
    if (item) { _build(item); return; }
  }
  callAPI('getItems', AUTH.token).then(function(res) {
    _itemsData = res.data || [];
    _itemsCacheTime = Date.now();
    var item = _itemsData.find(function(i){ return i.id == itemId; });
    if (!item) item = _itemsData.find(function(i){ return i.item_code === itemId; });
    if (!item) { hideLoading(); showError('ไม่พบรายการวัสดุจาก QR (ID: ' + itemId + ')'); return; }
    _build(item);
  }).catch(function(){ hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function submitWithdraw() {
  var itemId  = (document.getElementById('wdItemId')||{}).value||'';
  var qty     = parseInt((document.getElementById('wdQty')||{}).value||0);
  var purpose = (document.getElementById('wdPurpose')||{}).value||'';
  var note    = (document.getElementById('wdNote')||{}).value||'';
  var viaQr   = (document.getElementById('wdViaQr')||{}).value==='true';
  var dept    = (document.getElementById('wdDept')||{}).value||'';
  if (!itemId) { showError('ไม่พบรายการวัสดุ'); return; }
  if (!qty || qty <= 0) { showError('กรุณาระบุจำนวนที่ถูกต้อง'); return; }
  if (!dept) { showError('กรุณาเลือกแผนกที่เบิก'); return; }
  if (!purpose) { showError('กรุณาระบุวัตถุประสงค์'); return; }
  showLoading('กำลังยื่นคำขอ...');
  callAPI('addWithdrawal', AUTH.token, { item_id:itemId, quantity:qty, purpose:purpose, note:note, via_qr:viaQr, department:dept }).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) {
      showSuccess('ยื่นคำขอ ' + res.withdraw_no + ' เรียบร้อย รอการอนุมัติ');
      if (_currentPage === 'withdraw') renderWithdraw();
      else if (_currentPage === 'dashboard') renderDashboard();
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

// ===== APPROVE =====
var _approveData = [];
var _approvePage = 1;

function renderApprove() {
  if (!canApprove()) { loadPage('dashboard'); return; }
  showLoading('โหลดคำขอเบิก...');
  callAPI('getWithdrawals', AUTH.token, { status:'all' }).then(function(res) {
    hideLoading();
    _approveData = res.data || [];
    _approvePage = 1;
    buildApprovePage('pending');
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

/** groupApproveData — จัดกลุ่มคำขอเบิกตาม batch_no (ยื่นพร้อมกันเป็นชุด) ให้เป็นการ์ดเดียว */
function groupApproveData(data) {
  var groups = [];
  var byBatch = {};
  data.forEach(function(w) {
    if (w.batch_no) {
      if (!byBatch[w.batch_no]) {
        var g = { batch_no: w.batch_no, items: [] };
        byBatch[w.batch_no] = g;
        groups.push(g);
      }
      byBatch[w.batch_no].items.push(w);
    } else {
      groups.push({ batch_no: null, items: [w] });
    }
  });
  return groups;
}

function buildApprovePage(filterStatus) {
  filterStatus = filterStatus || 'pending';
  var data    = _approveData.filter(function(w){ return filterStatus==='all'?true:w.status===filterStatus; });
  var groups  = groupApproveData(data);
  var paged   = paginate(groups, _approvePage);
  var pendingCount = _approveData.filter(function(w){ return w.status==='pending'; }).length;

  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between">';
  html += '<h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-check-circle text-navy-600"></i> อนุมัติการเบิกวัสดุ';
  if (pendingCount > 0) html += ' <span class="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">' + pendingCount + '</span>';
  html += '</h3>';
  html += '<div class="flex gap-2">';
  ['pending','approved','rejected','all'].forEach(function(s){
    var labels = {pending:'รอดำเนินการ',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธแล้ว',all:'ทั้งหมด'};
    html += '<button onclick="buildApprovePage(\'' + s + '\')" class="px-3 py-1.5 rounded-xl text-xs font-medium border transition '
      + (filterStatus===s?'bg-navy-700 text-white border-navy-700':'border-gray-300 text-gray-600 hover:bg-gray-50') + '">' + labels[s] + '</button>';
  });
  html += '</div></div>';

  if (paged.length === 0) {
    html += '<div class="card p-12 text-center"><i class="fi fi-rr-check-circle text-5xl text-green-400 block mb-3"></i><p class="text-gray-500">ไม่มีรายการ' + (filterStatus==='pending'?' รออนุมัติ':'') + '</p></div>';
  } else {
    paged.forEach(function(g) {
      html += g.items.length > 1 ? buildApproveBatchCard(g) : buildApproveSingleCard(g.items[0]);
    });
  }
  html += '<div id="approvePagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('approvePagination', groups.length, _approvePage, function(p){ _approvePage=p; buildApprovePage(filterStatus); });
}

var _statusBadgeClass = { approved:'badge-approved', rejected:'badge-rejected', pending:'badge-pending' };
var _statusLabel      = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' };

/** buildApproveSingleCard — การ์ดคำขอเบิกแบบ 1 รายการ (ไม่ได้ยื่นเป็นชุด) */
function buildApproveSingleCard(w) {
  var badgeClass = _statusBadgeClass[w.status] || 'badge-pending';
  var statusLabel = _statusLabel[w.status] || w.status;
  var html = '<div class="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">';
  html += '<div class="w-12 h-12 bg-' + (w.status==='pending'?'amber':'gray') + '-100 rounded-xl flex items-center justify-center flex-shrink-0">';
  html += '<i class="fi fi-rr-inbox-out text-' + (w.status==='pending'?'amber':'gray') + '-600 text-xl"></i></div>';
  html += '<div class="flex-1 min-w-0"><div class="flex flex-wrap items-center gap-2 mb-1">';
  html += '<span class="font-bold text-gray-800 text-sm">' + escHtml(w.item_name) + '</span>';
  html += '<span class="font-mono text-xs text-navy-600">#' + escHtml(w.withdraw_no) + '</span>';
  if (w.batch_no) html += '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full" title="ยื่นพร้อมกันเป็นชุด แต่รายการอื่นในชุดถูกดำเนินการไปแล้ว">ชุด #' + escHtml(w.batch_no) + '</span>';
  html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + badgeClass + '">' + statusLabel + '</span>';
  if (w.via_qr) html += '<span class="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full"><i class="fi fi-rr-qr-scan mr-0.5"></i>QR</span>';
  html += '</div>';
  html += '<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-gray-500">';
  html += '<span><i class="fi fi-rr-user mr-1"></i>' + escHtml(w.requested_by_name||'-') + '</span>';
  html += '<span><i class="fi fi-rr-briefcase mr-1"></i>แผนก: <b class="text-navy-700">' + escHtml(w.department||NO_DEPT) + '</b></span>';
  html += '<span><i class="fi fi-rr-layers mr-1"></i>' + w.quantity_requested + ' ' + escHtml(w.unit) + '</span>';
  html += '<span><i class="fi fi-rr-target mr-1"></i>' + escHtml(w.purpose||'-') + '</span>';
  html += '<span><i class="fi fi-rr-calendar-day mr-1"></i>' + formatDate(w.requested_at) + '</span>';
  html += '</div>';
  if (w.status === 'approved') {
    html += '<p class="text-xs text-green-700 mt-1"><i class="fi fi-rr-check mr-1"></i>อนุมัติ ' + w.quantity_approved + ' ' + w.unit + ' โดย ' + escHtml(w.approved_by_name||'-') + ' เมื่อ ' + formatDate(w.approved_at) + '</p>';
  }
  if (w.status === 'rejected' && w.reject_reason) {
    html += '<p class="text-xs text-red-700 mt-1"><i class="fi fi-rr-cross mr-1"></i>เหตุผล: ' + escHtml(w.reject_reason) + '</p>';
  }
  html += '</div>';
  if (w.status === 'pending') {
    html += '<div class="flex gap-2 flex-shrink-0">';
    html += '<button onclick="openApproveModal(\'' + w.id + '\',' + w.quantity_requested + ')" class="btn-success flex items-center gap-1.5"><i class="fi fi-rr-check"></i> อนุมัติ</button>';
    html += '<button onclick="openRejectModal(\'' + w.id + '\')" class="btn-danger flex items-center gap-1.5"><i class="fi fi-rr-cross"></i> ปฏิเสธ</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/**
 * buildApproveBatchCard — การ์ดคำขอเบิกที่ยื่นพร้อมกันเป็นชุด (เลือกหลายรายการตอนเบิก)
 * รวมรายการทั้งหมดไว้ในการ์ดเดียว อนุมัติ/ปฏิเสธได้ทีเดียวทั้งชุด
 */
function buildApproveBatchCard(g) {
  var items = g.items;
  var first = items[0];
  var pending = items.filter(function(w){ return w.status === 'pending'; });
  var allSameStatus = items.every(function(w){ return w.status === first.status; });

  var html = '<div class="card p-4 space-y-3">';
  html += '<div class="flex flex-wrap items-center gap-2">';
  html += '<div class="w-10 h-10 bg-' + (pending.length?'amber':'gray') + '-100 rounded-xl flex items-center justify-center flex-shrink-0">';
  html += '<i class="fi fi-rr-inbox-out text-' + (pending.length?'amber':'gray') + '-600 text-lg"></i></div>';
  html += '<span class="font-bold text-gray-800 text-sm">คำขอเบิก ' + items.length + ' รายการ</span>';
  html += '<span class="font-mono text-xs text-navy-600">ชุด #' + escHtml(g.batch_no) + '</span>';
  if (allSameStatus) html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (_statusBadgeClass[first.status]||'badge-pending') + '">' + (_statusLabel[first.status]||first.status) + '</span>';
  if (first.via_qr) html += '<span class="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full"><i class="fi fi-rr-qr-scan mr-0.5"></i>QR</span>';
  html += '</div>';

  html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500">';
  html += '<span><i class="fi fi-rr-user mr-1"></i>' + escHtml(first.requested_by_name||'-') + '</span>';
  html += '<span><i class="fi fi-rr-briefcase mr-1"></i>แผนก: <b class="text-navy-700">' + escHtml(first.department||NO_DEPT) + '</b></span>';
  html += '<span><i class="fi fi-rr-target mr-1"></i>' + escHtml(first.purpose||'-') + '</span>';
  html += '<span><i class="fi fi-rr-calendar-day mr-1"></i>' + formatDate(first.requested_at) + '</span>';
  html += '</div>';

  html += '<div class="border border-gray-100 rounded-xl divide-y divide-gray-100">';
  items.forEach(function(w) {
    html += '<div class="flex items-center gap-2 px-3 py-2 text-sm">';
    html += '<span class="flex-1 min-w-0 truncate text-gray-700">' + escHtml(w.item_name) + '</span>';
    html += '<span class="text-xs text-gray-500 flex-shrink-0">' + w.quantity_requested + (w.status==='approved' && w.quantity_approved!==w.quantity_requested ? ' <span class="text-green-600">(อนุมัติ ' + w.quantity_approved + ')</span>' : '') + ' ' + escHtml(w.unit) + '</span>';
    html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ' + (_statusBadgeClass[w.status]||'badge-pending') + '">' + (_statusLabel[w.status]||w.status) + '</span>';
    html += '</div>';
    if (w.status === 'rejected' && w.reject_reason) {
      html += '<div class="px-3 pb-2 -mt-1"><p class="text-xs text-red-700"><i class="fi fi-rr-cross mr-1"></i>เหตุผล: ' + escHtml(w.reject_reason) + '</p></div>';
    }
  });
  html += '</div>';

  if (pending.length > 0) {
    var partial = pending.length < items.length;
    html += '<div class="flex gap-2 justify-end">';
    html += '<button onclick="openBatchApproveModal(\'' + g.batch_no + '\')" class="btn-success flex items-center gap-1.5"><i class="fi fi-rr-check"></i> ' + (partial ? 'อนุมัติที่เหลือ' : 'อนุมัติทั้งชุด') + ' (' + pending.length + ')</button>';
    html += '<button onclick="openBatchRejectModal(\'' + g.batch_no + '\')" class="btn-danger flex items-center gap-1.5"><i class="fi fi-rr-cross"></i> ' + (partial ? 'ปฏิเสธที่เหลือ' : 'ปฏิเสธทั้งชุด') + '</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function openBatchApproveModal(batchNo) {
  var items = _approveData.filter(function(w){ return w.batch_no === batchNo && w.status === 'pending'; });
  if (!items.length) { showError('ไม่มีรายการที่รออนุมัติในชุดนี้'); return; }
  var first = items[0];
  var body = '<div class="space-y-3">';
  body += '<div class="text-sm text-gray-600"><p>ผู้ขอเบิก: <b>' + escHtml(first.requested_by_name||'-') + '</b> • แผนก: <b class="text-navy-700">' + escHtml(first.department||NO_DEPT) + '</b></p>';
  body += '<p>วัตถุประสงค์: ' + escHtml(first.purpose||'-') + '</p></div>';
  body += '<div class="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">';
  items.forEach(function(w) {
    body += '<div class="flex items-center gap-3 px-3 py-2.5">';
    body += '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-700 truncate">' + escHtml(w.item_name) + '</p>';
    body += '<p class="text-xs text-gray-400">ขอ ' + w.quantity_requested + ' ' + escHtml(w.unit) + '</p></div>';
    body += '<input type="number" data-approve-id="' + w.id + '" value="' + w.quantity_requested + '" min="1" max="' + w.quantity_requested + '" class="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-navy-400">';
    body += '</div>';
  });
  body += '</div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="doApproveBatch(\'' + batchNo + '\')" class="btn-success"><i class="fi fi-rr-check mr-1"></i>ยืนยันอนุมัติ (' + items.length + ' รายการ)</button>';
  openModal('อนุมัติการเบิกทั้งชุด', body, footer, 'max-w-lg');
}

function doApproveBatch(batchNo) {
  var inputs = document.querySelectorAll('[data-approve-id]');
  var approvals = [];
  var invalid = false;
  inputs.forEach(function(el) {
    var qty = parseInt(el.value);
    if (!qty || qty <= 0) invalid = true;
    approvals.push({ id: el.getAttribute('data-approve-id'), quantity: qty });
  });
  if (invalid) { showError('กรุณาระบุจำนวนให้ถูกต้องทุกรายการ'); return; }
  closeModal();
  showLoading('กำลังอนุมัติ ' + approvals.length + ' รายการ...');
  callAPI('approveWithdrawalBatch', AUTH.token, batchNo, approvals).then(function(res) {
    hideLoading();
    if (res.success) {
      if (res.failed > 0) {
        Swal.fire({ icon:'warning', title:res.message,
          html:'<div style="text-align:left;font-size:13px">' + (res.errors||[]).map(escHtml).join('<br>') + '</div>',
          customClass:{popup:'swal2-popup'} });
      } else showSuccess(res.message);
      renderApprove();
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function openBatchRejectModal(batchNo) {
  var body = '<div class="space-y-3">'
    + '<p class="text-sm text-gray-600">กรุณาระบุเหตุผลที่ปฏิเสธคำขอเบิกชุดนี้ (มีผลกับทุกรายการที่ยังรออนุมัติในชุดนี้)</p>'
    + '<div><label class="form-label">เหตุผล *</label>'
    + '<input type="text" id="rejectReason" placeholder="ระบุเหตุผล..." class="form-input"></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="doRejectBatch(\'' + batchNo + '\')" class="btn-danger"><i class="fi fi-rr-cross mr-1"></i>ยืนยันปฏิเสธ</button>';
  openModal('ปฏิเสธคำขอเบิกทั้งชุด', body, footer);
}

function doRejectBatch(batchNo) {
  var reason = (document.getElementById('rejectReason')||{}).value||'';
  if (!reason.trim()) { showError('กรุณาระบุเหตุผล'); return; }
  closeModal();
  showLoading('กำลังดำเนินการ...');
  callAPI('rejectWithdrawalBatch', AUTH.token, batchNo, reason).then(function(res) {
    hideLoading();
    if (res.success) { showSuccess(res.message); renderApprove(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function openApproveModal(wdId, qty) {
  var wd = _approveData.find(function(w){ return w.id === wdId; });
  var item = wd && _itemsData.find(function(i){ return i.id === wd.item_id; });
  var img = item ? imgUrl(item.image_file_id) : '';
  var imgHtml = img ? '<div class="flex justify-center"><img src="' + img + '" class="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow-sm"></div>' : '';
  var body = '<div class="space-y-4">';
  body += imgHtml;
  body += '<div class="text-center"><p class="font-semibold text-gray-800">' + escHtml((wd && wd.item_name) || '-') + '</p>';
  body += '<p class="text-xs text-gray-500">ผู้ขอเบิก: <b>' + escHtml((wd && wd.requested_by_name) || '-') + '</b> • แผนก: <b class="text-navy-700">' + escHtml((wd && wd.department) || NO_DEPT) + '</b></p>';
  body += '<p class="text-xs text-gray-500">วัตถุประสงค์: ' + escHtml((wd && wd.purpose) || '-') + '</p></div>';
  body += '<div><label class="form-label">จำนวนที่อนุมัติ *</label>';
  body += '<input type="number" id="approveQty" value="' + qty + '" min="1" max="' + qty + '" class="form-input">';
  body += '<p class="text-xs text-gray-400 mt-1">จำนวนที่ขอ: ' + qty + ' ' + escHtml((wd && wd.unit) || '') + '</p></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="doApprove(\'' + wdId + '\')" class="btn-success"><i class="fi fi-rr-check mr-1"></i>ยืนยันอนุมัติ</button>';
  openModal('อนุมัติการเบิก', body, footer);
}

function doApprove(wdId) {
  var qty = parseInt((document.getElementById('approveQty')||{}).value||0);
  if (!qty || qty <= 0) { showError('กรุณาระบุจำนวน'); return; }
  closeModal();
  showLoading('กำลังอนุมัติ...');
  callAPI('approveWithdrawal', AUTH.token, wdId, qty).then(function(res) {
    hideLoading();
    if (res.success) { showSuccess(res.message); renderApprove(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function openRejectModal(wdId) {
  var body = '<div class="space-y-3">'
    + '<p class="text-sm text-gray-600">กรุณาระบุเหตุผลที่ปฏิเสธคำขอเบิกนี้</p>'
    + '<div><label class="form-label">เหตุผล *</label>'
    + '<input type="text" id="rejectReason" placeholder="ระบุเหตุผล..." class="form-input"></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="doReject(\'' + wdId + '\')" class="btn-danger"><i class="fi fi-rr-cross mr-1"></i>ยืนยันปฏิเสธ</button>';
  openModal('ปฏิเสธคำขอเบิก', body, footer);
}

function doReject(wdId) {
  var reason = (document.getElementById('rejectReason')||{}).value||'';
  if (!reason.trim()) { showError('กรุณาระบุเหตุผล'); return; }
  closeModal();
  showLoading('กำลังดำเนินการ...');
  callAPI('rejectWithdrawal', AUTH.token, wdId, reason).then(function(res) {
    hideLoading();
    if (res.success) { showSuccess(res.message); renderApprove(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function doCancelWithdrawal(wdId) {
  showConfirm('ยืนยันยกเลิก', 'ยกเลิกคำขอเบิกนี้?', function() {
    showLoading('กำลังยกเลิก...');
    callAPI('cancelWithdrawal', AUTH.token, wdId).then(function(res) {
      hideLoading();
      if (res.success) { showSuccess(res.message); renderWithdraw(); }
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  });
}

// ===== TRANSACTIONS =====
var _txData   = [];
var _txPage   = 1;
var _txFilter = { type:'all', date_from:'', date_to:'' };

function renderTransactions() {
  showLoading('โหลดประวัติ...');
  callAPI('getTransactions', AUTH.token, {}).then(function(res) {
    hideLoading();
    _txData = res.data || [];
    _txPage = 1;
    buildTransactionsPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

/** txTypeMeta — ป้าย/สี/เครื่องหมาย ตามประเภทการเคลื่อนไหว */
function txTypeMeta(t) {
  if (t.type === 'receive') return { label:'รับเข้า', badge:'badge-receive', text:'text-blue-700', bg:'bg-blue-100', icon:'fi-rr-inbox-in text-blue-600', sign:'+' };
  if (t.type === 'adjust') {
    var d = (t.diff !== undefined && t.diff !== null) ? Number(t.diff) : (Number(t.stock_after||0) - Number(t.stock_before||0));
    return { label:'ปรับยอด', badge:'bg-amber-100 text-amber-700', text: d < 0 ? 'text-red-600' : 'text-green-600',
             bg:'bg-amber-100', icon:'fi-rr-clipboard-list text-amber-600', sign: d < 0 ? '-' : '+' };
  }
  return { label:'เบิกออก', badge:'badge-withdraw', text:'text-purple-700', bg:'bg-purple-100', icon:'fi-rr-inbox-out text-purple-600', sign:'-' };
}

function buildTransactionsPage() {
  var filtered = applyTxFilter(_txData);
  var paged    = paginate(filtered, _txPage);

  var html = '<div class="fade-in space-y-4">';
  html += '<div class="card p-4"><div class="flex flex-wrap gap-3 items-end">';
  html += '<div><label class="form-label">ประเภท</label><select id="txTypeFilter" onchange="applyTxFilterUI()" class="form-input w-36">';
  ['all','receive','withdraw','adjust'].forEach(function(t){
    var labels={all:'ทั้งหมด',receive:'รับเข้า',withdraw:'เบิกออก',adjust:'ปรับยอด'};
    html += '<option value="' + t + '" ' + (_txFilter.type===t?'selected':'') + '>' + labels[t] + '</option>';
  });
  html += '</select></div>';
  html += '<div><label class="form-label">จากวันที่</label><input type="date" id="txDateFrom" value="' + _txFilter.date_from + '" onchange="applyTxFilterUI()" class="form-input w-40"></div>';
  html += '<div><label class="form-label">ถึงวันที่</label><input type="date" id="txDateTo" value="' + _txFilter.date_to + '" onchange="applyTxFilterUI()" class="form-input w-40"></div>';
  html += '<button onclick="clearTxFilter()" class="btn-secondary btn-sm"><i class="fi fi-rr-refresh mr-1"></i>ล้างตัวกรอง</button>';
  html += '</div></div>';

  var totalR = filtered.filter(function(t){ return t.type==='receive'; }).length;
  var totalW = filtered.filter(function(t){ return t.type==='withdraw'; }).length;
  html += '<div class="flex gap-2 text-xs">';
  html += '<span class="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full"><i class="fi fi-rr-inbox-in mr-1"></i>รับเข้า: ' + totalR + '</span>';
  html += '<span class="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full"><i class="fi fi-rr-inbox-out mr-1"></i>เบิกออก: ' + totalW + '</span>';
  var totalA = filtered.filter(function(t){ return t.type==='adjust'; }).length;
  if (totalA) html += '<span class="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full"><i class="fi fi-rr-clipboard-list mr-1"></i>ปรับยอด: ' + totalA + '</span>';
  html += '<span class="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full">ทั้งหมด: ' + filtered.length + '</span></div>';

  html += '<div class="card overflow-hidden"><div class="overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
  html += '<tr><th class="px-4 py-3 text-left">วันที่</th><th class="px-4 py-3 text-center">ประเภท</th>';
  html += '<th class="px-4 py-3 text-left">เลขที่อ้างอิง</th><th class="px-4 py-3 text-left">รายการ</th>';
  html += '<th class="px-4 py-3 text-center">จำนวน</th><th class="px-4 py-3 text-center">ก่อน</th>';
  html += '<th class="px-4 py-3 text-center">หลัง</th><th class="px-4 py-3 text-left">ผู้ดำเนินการ</th></tr></thead>';
  html += '<tbody class="divide-y divide-gray-100">';
  if (paged.length === 0) html += '<tr><td colspan="8" class="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>';
  paged.forEach(function(t) {
    var meta = txTypeMeta(t);
    html += '<tr>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">' + formatDate(t.date) + '</td>';
    html += '<td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + meta.badge + '">' + meta.label + '</span></td>';
    html += '<td class="px-4 py-2.5 font-mono text-xs text-navy-700">' + escHtml(t.ref_id||'-') + '</td>';
    html += '<td class="px-4 py-2.5 font-medium text-gray-700 max-w-xs">' + escHtml(t.item_name||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-center font-bold ' + meta.text + '">' + meta.sign + t.quantity + '</td>';
    html += '<td class="px-4 py-2.5 text-center text-xs text-gray-500">' + (t.stock_before||0) + '</td>';
    html += '<td class="px-4 py-2.5 text-center text-xs font-bold text-gray-700">' + (t.stock_after||0) + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500">' + escHtml(t.actor_name||'-') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  html += '<div id="txPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('txPagination', filtered.length, _txPage, function(p){ _txPage=p; buildTransactionsPage(); });
}

function applyTxFilter(data) {
  return data.filter(function(t) {
    if (_txFilter.type !== 'all' && t.type !== _txFilter.type) return false;
    if (_txFilter.date_from && (t.date||'') < _txFilter.date_from) return false;
    if (_txFilter.date_to   && (t.date||'') > _txFilter.date_to)   return false;
    return true;
  });
}
function applyTxFilterUI() {
  _txFilter.type      = (document.getElementById('txTypeFilter')||{}).value||'all';
  _txFilter.date_from = (document.getElementById('txDateFrom')||{}).value||'';
  _txFilter.date_to   = (document.getElementById('txDateTo')||{}).value||'';
  _txPage = 1;
  buildTransactionsPage();
}
function clearTxFilter() {
  _txFilter = { type:'all', date_from:'', date_to:'' };
  _txPage   = 1;
  buildTransactionsPage();
}

// ===== REPORTS =====
var _reportCharts = {};

function renderReports() {
  var now = new Date();
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">';

  html += '<div class="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">';
  html += '<div class="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-inbox-in text-blue-600 text-xl"></i></div>';
  html += '<div><p class="font-semibold text-gray-800">รายงานรับวัสดุเข้า</p><p class="text-xs text-gray-400 mt-0.5">ประวัติการรับวัสดุทั้งหมด</p></div>';
  html += '<button onclick="loadReceiveReport()" class="btn-primary btn-sm mt-auto"><i class="fi fi-rr-eye mr-1"></i>ดูรายงาน</button></div>';

  html += '<div class="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">';
  html += '<div class="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-inbox-out text-purple-600 text-xl"></i></div>';
  html += '<div><p class="font-semibold text-gray-800">รายงานเบิกวัสดุออก</p><p class="text-xs text-gray-400 mt-0.5">ประวัติการเบิกและอนุมัติ</p></div>';
  html += '<button onclick="loadWithdrawReport()" class="btn-primary btn-sm mt-auto"><i class="fi fi-rr-eye mr-1"></i>ดูรายงาน</button></div>';

  html += '<div class="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">';
  html += '<div class="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-calendar text-green-600 text-xl"></i></div>';
  html += '<div><p class="font-semibold text-gray-800">สรุปรายเดือน</p><p class="text-xs text-gray-400 mt-0.5">ยอดรับ-เบิกตาราง Matrix</p></div>';
  html += '<div class="flex gap-2 mt-auto">';
  html += '<select id="rptYear" class="form-input flex-1 text-xs">';
  for (var y = now.getFullYear(); y >= now.getFullYear()-2; y--) {
    html += '<option value="' + y + '">' + (y+543) + '</option>';
  }
  html += '</select>';
  html += '<select id="rptMonth" class="form-input flex-1 text-xs">';
  var mNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  for (var m = 1; m <= 12; m++) {
    html += '<option value="' + m + '" ' + (m===now.getMonth()+1?'selected':'') + '>' + mNames[m-1] + '</option>';
  }
  html += '</select></div>';
  html += '<button onclick="loadMonthlyReport()" class="btn-success btn-sm"><i class="fi fi-rr-chart-histogram mr-1"></i>ดูรายงาน</button></div>';
  html += '</div>';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-triangle-warning text-amber-500"></i> รายการวัสดุที่ต้องเติมสต็อก</h3>';
  html += '<button onclick="exportLowStock()" class="btn-warning btn-sm flex items-center gap-1"><i class="fi fi-rr-file-spreadsheet"></i> Export</button></div>';
  html += '<div class="card-body" id="lowStockReport"><div class="flex justify-center py-4"><div class="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin"></div></div></div></div>';

  html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">';
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-chart-histogram text-navy-600"></i> ยอดเบิกรายเดือน (6 เดือนล่าสุด)</h3></div>';
  html += '<div class="card-body"><div style="position:relative;height:220px"><canvas id="rptChartMonthly"></canvas></div></div></div>';
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-star text-amber-500"></i> Top 10 วัสดุที่เบิกมากสุด</h3></div>';
  html += '<div class="card-body" id="rptTopItems"><div class="flex justify-center py-4"><div class="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin"></div></div></div></div>';
  html += '</div>';

  html += '<div id="reportDataSection"></div></div>';
  document.getElementById('mainContent').innerHTML = html;

  Promise.all([
    callAPI('getDashboardStats', AUTH.token),
    callAPI('getItems', AUTH.token)
  ]).then(function(results) {
    var stats = results[0];
    var items = results[1].data || [];
    var lowItems = items.filter(function(i){ return i.current_stock <= (i.min_stock||5); });

    var lsHtml = '';
    if (lowItems.length === 0) {
      lsHtml = '<p class="text-center text-sm text-gray-400 py-4">ไม่มีรายการวัสดุที่ต้องเติม</p>';
    } else {
      lsHtml = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
      lsHtml += '<tr><th class="px-4 py-2 text-left">รหัส</th><th class="px-4 py-2 text-left">ชื่อวัสดุ</th><th class="px-4 py-2 text-center">คงเหลือ</th><th class="px-4 py-2 text-center">ขั้นต่ำ</th><th class="px-4 py-2 text-center">สถานะ</th></tr>';
      lsHtml += '</thead><tbody class="divide-y divide-gray-100">';
      lowItems.forEach(function(i) {
        var sc = getStockClass(i.current_stock, i.min_stock);
        lsHtml += '<tr><td class="px-4 py-2 font-mono text-xs text-navy-700">' + escHtml(i.item_code) + '</td>';
        lsHtml += '<td class="px-4 py-2 font-medium text-gray-700">' + escHtml(i.name) + '</td>';
        lsHtml += '<td class="px-4 py-2 text-center font-bold">' + i.current_stock + ' ' + escHtml(i.unit) + '</td>';
        lsHtml += '<td class="px-4 py-2 text-center text-gray-400">' + i.min_stock + '</td>';
        lsHtml += '<td class="px-4 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + sc + '">' + getStockLabel(i.current_stock, i.min_stock) + '</span></td></tr>';
      });
      lsHtml += '</tbody></table></div>';
    }
    document.getElementById('lowStockReport').innerHTML = lsHtml;

    if (stats.top_items && stats.top_items.length > 0) {
      var tiHtml = '<div class="space-y-2">';
      var maxQ = stats.top_items[0].qty || 1;
      stats.top_items.forEach(function(item, idx) {
        var pct = Math.round(item.qty / maxQ * 100);
        tiHtml += '<div class="flex items-center gap-2">';
        tiHtml += '<span class="text-xs font-bold text-gray-400 w-5 text-right">' + (idx+1) + '</span>';
        tiHtml += '<div class="flex-1"><p class="text-xs font-medium text-gray-700 mb-0.5 truncate">' + escHtml(item.name) + '</p>';
        tiHtml += '<div class="progress-bar"><div class="progress-fill bg-navy-600" style="width:' + pct + '%"></div></div></div>';
        tiHtml += '<span class="text-xs font-bold text-navy-700 w-8 text-right">' + item.qty + '</span></div>';
      });
      tiHtml += '</div>';
      document.getElementById('rptTopItems').innerHTML = tiHtml;
    } else {
      document.getElementById('rptTopItems').innerHTML = '<p class="text-center text-sm text-gray-400 py-4">ยังไม่มีข้อมูลการเบิก</p>';
    }

    if (stats.monthly && document.getElementById('rptChartMonthly')) {
      if (_reportCharts.monthly) _reportCharts.monthly.destroy();
      _reportCharts.monthly = new Chart(document.getElementById('rptChartMonthly'), {
        type:'bar',
        data:{
          labels: stats.monthly.map(function(m){ return m.label; }),
          datasets:[
            { label:'รับเข้า', data:stats.monthly.map(function(m){ return m.receive; }), backgroundColor:'#3b82f6', borderRadius:5, barPercentage:0.6 },
            { label:'เบิกออก', data:stats.monthly.map(function(m){ return m.withdraw; }), backgroundColor:'#8b5cf6', borderRadius:5, barPercentage:0.6 }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{family:'Sarabun',size:11},boxWidth:12}}}, scales:{y:{ticks:{font:{family:'Sarabun',size:11}},grid:{color:'#f3f4f6'}},x:{ticks:{font:{family:'Sarabun',size:11}},grid:{display:false}}} }
      });
    }
  }).catch(function(err) { console.error(err); });
}

function loadReceiveReport() {
  showLoading('โหลดรายงาน...');
  callAPI('getReceives', AUTH.token, {}).then(function(res) {
    hideLoading();
    var data = res.data || [];
    var html = '<div class="card mt-4"><div class="card-header">';
    html += '<h3 class="font-semibold text-gray-700 text-sm">รายงานรับวัสดุเข้าคลัง (' + data.length + ' รายการ)</h3>';
    html += '<button onclick="exportReport(\'receives\')" class="btn-success btn-sm flex items-center gap-1"><i class="fi fi-rr-file-spreadsheet"></i> Export CSV</button></div>';
    html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
    html += '<tr><th class="px-4 py-2 text-left">เลขที่</th><th class="px-4 py-2 text-left">วันที่</th><th class="px-4 py-2 text-left">รายการ</th><th class="px-4 py-2 text-center">จำนวน</th><th class="px-4 py-2 text-left">ร้าน/ผู้จำหน่าย</th><th class="px-4 py-2 text-right">ราคา/หน่วย</th><th class="px-4 py-2 text-right">รวมเงิน</th><th class="px-4 py-2 text-left">ผู้รับ</th><th class="px-4 py-2 text-left">หมายเหตุ</th></tr>';
    html += '</thead><tbody class="divide-y">';
    if (!data.length) html += '<tr><td colspan="9" class="text-center py-8 text-gray-400">ไม่มีรายการ</td></tr>';
    data.slice(0,50).forEach(function(r) {
      html += '<tr><td class="px-4 py-2 font-mono text-xs text-navy-700">' + escHtml(r.receive_no) + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-500">' + formatDate(r.date) + '</td>';
      html += '<td class="px-4 py-2 text-gray-700">' + escHtml(r.item_name||'-') + '</td>';
      html += '<td class="px-4 py-2 text-center font-bold text-blue-700 whitespace-nowrap">+' + r.quantity + ' ' + escHtml(r.unit||'') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-600">' + escHtml(r.supplier||'-') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-right text-gray-600 whitespace-nowrap">' + (Number(r.unit_price) ? formatMoney(r.unit_price) : '-') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-right text-gray-600 whitespace-nowrap">' + (Number(r.total_price) ? formatMoney(r.total_price) : '-') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-500">' + escHtml(r.received_by_name||'-') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-400">' + escHtml(r.note||'-') + '</td></tr>';
    });
    if (data.length > 50) html += '<tr><td colspan="9" class="text-center py-3 text-xs text-gray-400">แสดง 50 รายการแรก Export เพื่อดูทั้งหมด</td></tr>';
    html += '</tbody></table></div></div>';
    document.getElementById('reportDataSection').innerHTML = html;
    document.getElementById('reportDataSection').scrollIntoView({ behavior:'smooth' });
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function loadWithdrawReport() {
  showLoading('โหลดรายงาน...');
  callAPI('getWithdrawals', AUTH.token, { status:'all' }).then(function(res) {
    hideLoading();
    var data = res.data || [];
    var html = '<div class="card mt-4"><div class="card-header">';
    html += '<h3 class="font-semibold text-gray-700 text-sm">รายงานเบิกวัสดุออก (' + data.length + ' รายการ)</h3>';
    html += '<button onclick="exportReport(\'withdrawals\')" class="btn-success btn-sm flex items-center gap-1"><i class="fi fi-rr-file-spreadsheet"></i> Export CSV</button></div>';
    html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
    html += '<tr><th class="px-4 py-2 text-left">เลขที่</th><th class="px-4 py-2 text-left">วันที่</th><th class="px-4 py-2 text-left">รายการ</th><th class="px-4 py-2 text-center">ขอ/อนุมัติ</th><th class="px-4 py-2 text-left">ผู้เบิก</th><th class="px-4 py-2 text-left">แผนก</th><th class="px-4 py-2 text-left">วัตถุประสงค์</th><th class="px-4 py-2 text-center">สถานะ</th></tr>';
    html += '</thead><tbody class="divide-y">';
    if (!data.length) html += '<tr><td colspan="8" class="text-center py-8 text-gray-400">ไม่มีรายการ</td></tr>';
    data.slice(0,50).forEach(function(w) {
      var bc = w.status==='approved'?'badge-approved':w.status==='rejected'?'badge-rejected':'badge-pending';
      var sl = {pending:'รออนุมัติ',approved:'อนุมัติ',rejected:'ปฏิเสธ'}[w.status]||w.status;
      html += '<tr><td class="px-4 py-2 font-mono text-xs text-navy-700">' + escHtml(w.withdraw_no) + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-500">' + formatDate(w.requested_at) + '</td>';
      html += '<td class="px-4 py-2 text-gray-700">' + escHtml(w.item_name||'-') + '</td>';
      html += '<td class="px-4 py-2 text-center text-xs">' + w.quantity_requested + (w.quantity_approved?'/' + w.quantity_approved:'') + ' ' + escHtml(w.unit||'') + '</td>';
      html += '<td class="px-4 py-2 text-xs text-gray-500">' + escHtml(w.requested_by_name||'-') + '</td>';
      html += '<td class="px-4 py-2 text-xs"><span class="px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 font-medium">' + escHtml(w.department||NO_DEPT) + '</span></td>';
      html += '<td class="px-4 py-2 text-xs text-gray-400">' + escHtml(w.purpose||'-') + '</td>';
      html += '<td class="px-4 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + bc + '">' + sl + '</span></td></tr>';
    });
    if (data.length > 50) html += '<tr><td colspan="8" class="text-center py-3 text-xs text-gray-400">แสดง 50 รายการแรก Export เพื่อดูทั้งหมด</td></tr>';
    html += '</tbody></table></div></div>';
    document.getElementById('reportDataSection').innerHTML = html;
    document.getElementById('reportDataSection').scrollIntoView({ behavior:'smooth' });
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

var _monthlyReport = null;   // ผลรายงานรายเดือนล่าสุด (ใช้ตอน Export)

function loadMonthlyReport() {
  var year  = parseInt((document.getElementById('rptYear')||{}).value||new Date().getFullYear());
  var month = parseInt((document.getElementById('rptMonth')||{}).value||new Date().getMonth()+1);
  showLoading('โหลดรายงานรายเดือน...');
  callAPI('getMonthlyReport', AUTH.token, year, month).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    res.year = year; res.month = month;
    _monthlyReport = res;
    buildMonthlyReport();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

var _monthlyDeptView = true;   // แสดงคอลัมน์แยกตามแผนกหรือไม่

function toggleMonthlyDeptView() {
  _monthlyDeptView = !_monthlyDeptView;
  buildMonthlyReport();
}

function buildMonthlyReport() {
  var res = _monthlyReport;
  if (!res) return;
  var year   = res.year;
  var month  = res.month;
  var data   = res.data || [];
  var depts  = res.departments || [];
  var totals = res.dept_totals || {};
  var mNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var daysInMonth = new Date(year, month, 0).getDate();
  var grandTotal = depts.reduce(function(sum, d){ return sum + (totals[d]||0); }, 0);

  var html = '';

  // ---------- สรุปยอดเบิกแยกตามแผนก ----------
  html += '<div class="card mt-4"><div class="card-header">';
  html += '<h3 class="font-semibold text-gray-700 text-sm flex items-center gap-2"><i class="fi fi-rr-briefcase text-navy-600"></i> ยอดเบิกแยกตามแผนก — ' + mNames[month-1] + ' ' + (year+543) + '</h3>';
  html += '<span class="text-xs text-gray-500">รวมทั้งหมด <b class="text-navy-700">' + grandTotal + '</b> ชิ้น</span></div>';
  html += '<div class="card-body">';
  if (!depts.length) {
    html += '<p class="text-center text-sm text-gray-400 py-4">เดือนนี้ยังไม่มีการเบิกวัสดุ</p>';
  } else {
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">';
    depts.forEach(function(d) {
      var qty = totals[d] || 0;
      var pct = grandTotal > 0 ? Math.round(qty / grandTotal * 100) : 0;
      html += '<div class="flex items-center gap-2">';
      html += '<span class="text-xs font-medium text-gray-700 w-28 truncate" title="' + escHtml(d) + '">' + escHtml(d) + '</span>';
      html += '<div class="flex-1 progress-bar"><div class="progress-fill bg-navy-600" style="width:' + pct + '%"></div></div>';
      html += '<span class="text-xs font-bold text-navy-700 w-16 text-right">' + qty + ' <span class="text-gray-400 font-normal">(' + pct + '%)</span></span>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div></div>';

  // ---------- ตาราง Matrix ----------
  html += '<div class="card mt-4"><div class="card-header flex-wrap gap-2">';
  html += '<h3 class="font-semibold text-gray-700 text-sm">สรุปการเบิกวัสดุ ' + mNames[month-1] + ' ' + (year+543) + '</h3>';
  html += '<div class="flex gap-2">';
  html += '<button onclick="toggleMonthlyDeptView()" class="btn-secondary btn-sm flex items-center gap-1"><i class="fi fi-rr-briefcase"></i> ' + (_monthlyDeptView ? 'ซ่อนคอลัมน์แผนก' : 'แสดงคอลัมน์แผนก') + '</button>';
  html += '<button onclick="exportMonthlyExcel(' + year + ',' + month + ')" class="btn-success btn-sm flex items-center gap-1"><i class="fi fi-rr-file-spreadsheet"></i> Export CSV</button></div></div>';
  html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">';
  html += '<thead class="bg-navy-700 text-white sticky top-0">';
  html += '<tr><th class="px-2 py-2 text-left min-w-[160px] border border-navy-600">ชื่อวัสดุ</th>';
  html += '<th class="px-2 py-2 text-center border border-navy-600 w-12">หน่วย</th>';
  html += '<th class="px-2 py-2 text-center border border-navy-600 w-14">รับเข้า</th>';
  for (var d = 1; d <= daysInMonth; d++) {
    html += '<th class="px-1 py-2 text-center border border-navy-600 w-8">' + d + '</th>';
  }
  html += '<th class="px-2 py-2 text-center border border-navy-600 w-14">รวมเบิก</th>';
  if (_monthlyDeptView) {
    depts.forEach(function(dp) {
      html += '<th class="px-2 py-2 text-center border border-navy-600 bg-navy-800 min-w-[70px]" title="แผนก ' + escHtml(dp) + '">' + escHtml(dp) + '</th>';
    });
  }
  html += '<th class="px-2 py-2 text-center border border-navy-600 w-14">คงเหลือ</th></tr></thead>';
  html += '<tbody>';
  var colCount = daysInMonth + 5 + (_monthlyDeptView ? depts.length : 0);
  if (!data.length) {
    html += '<tr><td colspan="' + colCount + '" class="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>';
  }
  data.forEach(function(row, idx) {
    html += '<tr class="' + (idx%2===0?'bg-white':'bg-gray-50') + ' hover:bg-blue-50">';
    html += '<td class="px-2 py-1.5 border border-gray-200 font-medium text-gray-700">' + escHtml(row.name) + (row.size ? ' <span class="text-gray-400">(' + escHtml(row.size) + ')</span>' : '') + '</td>';
    html += '<td class="px-2 py-1.5 border border-gray-200 text-center text-gray-500">' + escHtml(row.unit) + '</td>';
    html += '<td class="px-2 py-1.5 border border-gray-200 text-center font-bold text-blue-700">' + (row.received||0) + '</td>';
    for (var d = 1; d <= daysInMonth; d++) {
      var dayVal = row.daily[d] || 0;
      html += '<td class="px-1 py-1.5 border border-gray-200 text-center ' + (dayVal > 0 ? 'bg-purple-50 font-bold text-purple-700' : 'text-gray-300') + '">' + (dayVal > 0 ? dayVal : '') + '</td>';
    }
    html += '<td class="px-2 py-1.5 border border-gray-200 text-center font-bold text-purple-700">' + (row.total_withdraw||0) + '</td>';
    if (_monthlyDeptView) {
      depts.forEach(function(dp) {
        var v = (row.by_dept && row.by_dept[dp]) || 0;
        html += '<td class="px-2 py-1.5 border border-gray-200 text-center ' + (v > 0 ? 'bg-navy-50 font-bold text-navy-700' : 'text-gray-300') + '">' + (v > 0 ? v : '') + '</td>';
      });
    }
    html += '<td class="px-2 py-1.5 border border-gray-200 text-center font-bold ' + (row.current_stock <= row.min_stock ? 'text-red-600' : 'text-green-700') + '">' + row.current_stock + '</td>';
    html += '</tr>';
  });
  // แถวรวมท้ายตาราง
  if (data.length && _monthlyDeptView && depts.length) {
    html += '<tr class="bg-navy-50 font-bold">';
    html += '<td class="px-2 py-1.5 border border-gray-200 text-navy-800">รวมทุกรายการ</td>';
    html += '<td class="px-2 py-1.5 border border-gray-200"></td>';
    html += '<td class="px-2 py-1.5 border border-gray-200"></td>';
    for (var d2 = 1; d2 <= daysInMonth; d2++) html += '<td class="px-1 py-1.5 border border-gray-200"></td>';
    html += '<td class="px-2 py-1.5 border border-gray-200 text-center text-purple-700">' + grandTotal + '</td>';
    depts.forEach(function(dp) {
      html += '<td class="px-2 py-1.5 border border-gray-200 text-center text-navy-700">' + (totals[dp]||0) + '</td>';
    });
    html += '<td class="px-2 py-1.5 border border-gray-200"></td></tr>';
  }
  html += '</tbody></table></div>';
  html += '<p class="text-xs text-gray-400 px-4 py-2">* ตัวเลขในช่องวันที่ = จำนวนที่เบิกออกในวันนั้น • คอลัมน์ชื่อแผนก = จำนวนที่แผนกนั้นเบิกไปทั้งเดือน</p></div>';

  document.getElementById('reportDataSection').innerHTML = html;
  document.getElementById('reportDataSection').scrollIntoView({ behavior:'smooth' });
}

function downloadXlsx(rows, headers, filename) {
  if (!window.XLSX) { showError('ไม่พบ library XLSX'); return; }
  var data = rows.map(function(r) {
    var obj = {};
    headers.forEach(function(h) { obj[h.title] = r[h.key] !== undefined ? r[h.key] : ''; });
    return obj;
  });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename + '.xlsx');
}

function exportReport(type) {
  showLoading('กำลัง Export...');
  var apiFn = type === 'receives' ? 'getReceives' : type === 'withdrawals' ? 'getWithdrawals' : 'getTransactions';
  callAPI(apiFn, AUTH.token, {}).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    var data = res.data || [];
    var rows, headers;
    if (type === 'receives') {
      headers = [{key:'receive_no',title:'เลขที่'},{key:'date',title:'วันที่'},{key:'item_name',title:'รายการ'},{key:'quantity',title:'จำนวน'},{key:'unit',title:'หน่วย'},{key:'supplier',title:'ร้าน/ผู้จำหน่าย'},{key:'unit_price',title:'ราคาต่อหน่วย'},{key:'total_price',title:'รวมเงิน'},{key:'received_by_name',title:'ผู้รับ'},{key:'note',title:'หมายเหตุ'}];
      rows = data.map(function(r){ var item=_itemsData.find(function(i){return i.id===r.item_id})||{}; return {receive_no:r.receive_no||'', date:(r.date||'').split('T')[0], item_name:r.item_name||item.name||r.item_id, quantity:r.quantity||0, unit:r.unit||'', supplier:r.supplier||'', unit_price:r.unit_price||0, total_price:r.total_price||0, received_by_name:r.received_by_name||'', note:r.note||''}; });
    } else if (type === 'withdrawals') {
      headers = [{key:'withdraw_no',title:'เลขที่'},{key:'date',title:'วันที่'},{key:'item_name',title:'รายการ'},{key:'quantity',title:'จำนวนที่ขอ'},{key:'quantity_approved',title:'จำนวนที่อนุมัติ'},{key:'unit',title:'หน่วย'},{key:'requester_name',title:'ผู้เบิก'},{key:'department',title:'แผนกที่เบิก'},{key:'status',title:'สถานะ'},{key:'purpose',title:'วัตถุประสงค์'}];
      rows = data.map(function(w){ return {withdraw_no:w.withdraw_no||'', date:(w.requested_at||'').split('T')[0], item_name:w.item_name||'', quantity:w.quantity_requested||0, quantity_approved:w.quantity_approved||0, unit:w.unit||'', requester_name:w.requested_by_name||'', department:w.department||NO_DEPT, status:w.status==='approved'?'อนุมัติ':w.status==='rejected'?'ปฏิเสธ':'รออนุมัติ', purpose:w.purpose||''}; });
    } else {
      headers = [{key:'type',title:'ประเภท'},{key:'date',title:'วันที่'},{key:'item_name',title:'รายการ'},{key:'quantity',title:'จำนวน'},{key:'user_name',title:'ผู้ทำรายการ'},{key:'note',title:'หมายเหตุ'}];
      rows = data.map(function(t){ var item=_itemsData.find(function(i){return i.id===t.item_id})||{}; return {type:txTypeMeta(t).label, date:(t.date||'').split('T')[0], item_name:item.name||t.item_id, quantity:t.quantity||0, user_name:t.user_name||'', note:t.note||''}; });
    }
    downloadXlsx(rows, headers, 'รายงาน_' + type);
  }).catch(function() { hideLoading(); showError('Export ไม่สำเร็จ'); });
}

function exportMonthlyExcel(year, month) {
  function _build(res) {
    var data   = res.data || [];
    var depts  = res.departments || [];
    var totals = res.dept_totals || {};
    var daysInMonth = new Date(year, month, 0).getDate();
    var headers = [{key:'name',title:'ชื่อวัสดุ'},{key:'size',title:'ขนาด'},{key:'unit',title:'หน่วย'},{key:'received',title:'รับเข้า'}];
    for (var d = 1; d <= daysInMonth; d++) headers.push({key:'d' + d, title:String(d)});
    headers.push({key:'total_withdraw',title:'รวมเบิก'});
    depts.forEach(function(dp, i) { headers.push({key:'dept' + i, title:'แผนก: ' + dp}); });
    headers.push({key:'current_stock',title:'คงเหลือ'});

    var rows = data.map(function(row) {
      var obj = { name:row.name || '', size:row.size || '', unit:row.unit || '', received:row.received || 0,
                  total_withdraw:row.total_withdraw || 0, current_stock:row.current_stock || 0 };
      for (var d = 1; d <= daysInMonth; d++) obj['d' + d] = row.daily[d] || 0;
      depts.forEach(function(dp, i) { obj['dept' + i] = (row.by_dept && row.by_dept[dp]) || 0; });
      return obj;
    });

    // แถวรวมยอดแต่ละแผนก
    if (rows.length && depts.length) {
      var sumRow = { name:'รวมทุกรายการ', size:'', unit:'', received:'', total_withdraw:0, current_stock:'' };
      for (var d3 = 1; d3 <= daysInMonth; d3++) sumRow['d' + d3] = '';
      depts.forEach(function(dp, i) {
        sumRow['dept' + i] = totals[dp] || 0;
        sumRow.total_withdraw += totals[dp] || 0;
      });
      rows.push(sumRow);
    }
    downloadXlsx(rows, headers, 'รายงานเบิก_' + month + '_' + (year+543));
  }

  // ใช้ข้อมูลที่โหลดไว้แล้วถ้าเป็นเดือนเดียวกัน
  if (_monthlyReport && _monthlyReport.year === year && _monthlyReport.month === month) {
    _build(_monthlyReport);
    return;
  }
  showLoading('กำลัง Export...');
  callAPI('getMonthlyReport', AUTH.token, year, month).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    _build(res);
  }).catch(function() { hideLoading(); showError('Export ไม่สำเร็จ'); });
}

function exportLowStock() {
  showLoading('กำลัง Export...');
  callAPI('getItems', AUTH.token).then(function(res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    var items = (res.data || []).filter(function(i){ return i.active !== false && i.current_stock <= i.min_stock; });
    var headers = [{key:'item_code',title:'รหัส'},{key:'name',title:'ชื่อวัสดุ'},{key:'category',title:'หมวดหมู่'},{key:'current_stock',title:'คงเหลือ'},{key:'min_stock',title:'ขั้นต่ำ'},{key:'unit',title:'หน่วย'}];
    var rows = items.map(function(i){ return {item_code:i.item_code||'', name:i.name||'', category:i.category||'', current_stock:i.current_stock||0, min_stock:i.min_stock||0, unit:i.unit||''}; });
    downloadXlsx(rows, headers, 'รายงานสต็อกต่ำ');
  }).catch(function() { hideLoading(); showError('Export ไม่สำเร็จ'); });
}

// ===== PROFILE =====
function renderProfile() {
  showLoading('โหลดโปรไฟล์...');
  callAPI('getMyProfile', AUTH.token).then(function(res) {
    hideLoading();
    var user = (res && res.success && res.data) ? res.data : AUTH.user;
    if (res && res.success && res.data) {
      AUTH.user.department = res.data.department || '';
      AUTH.user.name       = res.data.name || AUTH.user.name;
      localStorage.setItem('sup_user', JSON.stringify(AUTH.user));
      applyUserToShell();
    }
    buildProfilePage(user);
  }).catch(function() {
    hideLoading();
    buildProfilePage(AUTH.user);
  });
}

function buildProfilePage(user) {
  var html = '<div class="fade-in w-full space-y-4">';

  html += '<div class="card p-6">';
  html += '<div class="flex items-center gap-5 mb-6">';
  html += '<div class="relative">';
  html += '<div class="w-20 h-20 rounded-2xl bg-navy-100 flex items-center justify-center overflow-hidden shadow">';
  html += '<i class="fi fi-rr-user text-navy-600 text-3xl"></i>';
  html += '</div>';
  html += '<label class="absolute -bottom-1 -right-1 w-6 h-6 bg-navy-700 rounded-lg flex items-center justify-center cursor-pointer hover:bg-navy-800 transition">';
  html += '<i class="fi fi-rr-camera text-white text-xs"></i>';
  html += '<input type="file" accept="image/*" class="hidden" onchange="uploadAvatar(event)"></label></div>';
  html += '<div>';
  html += '<h2 class="text-xl font-bold text-gray-800">' + escHtml(user.name||user.username) + '</h2>';
  html += '<p class="text-sm text-gray-500">@' + escHtml(user.username||'-') + '</p>';
  html += '<span class="mt-1 inline-block px-3 py-0.5 bg-navy-100 text-navy-700 rounded-full text-xs font-semibold">' + (ROLE_LABELS[user.role]||user.role) + '</span>';
  if (user.department) html += ' <span class="mt-1 inline-block px-3 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold"><i class="fi fi-rr-briefcase mr-1"></i>' + escHtml(user.department) + '</span>';
  html += '</div></div>';
  html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
  html += '<div><label class="form-label">ชื่อ-นามสกุล</label><input type="text" id="profName" value="' + escHtml(user.name||'') + '" class="form-input"></div>';
  html += '<div><label class="form-label">อีเมล</label><input type="email" id="profEmail" value="' + escHtml(user.email||'') + '" class="form-input"></div>';
  html += '<div><label class="form-label">เบอร์โทรศัพท์</label><input type="text" id="profPhone" value="' + escHtml(user.phone||'') + '" class="form-input"></div>';
  html += '<div><label class="form-label">แผนก/ฝ่าย</label>';
  html += '<input type="text" value="' + escHtml(user.department||NO_DEPT) + '" class="form-input bg-gray-50" disabled>';
  html += '<p class="text-xs text-gray-400 mt-1">แผนกนี้จะถูกบันทึกกับทุกคำขอเบิกของคุณ • หากไม่ถูกต้องกรุณาแจ้งผู้ดูแลระบบ</p></div>';
  html += '<div><label class="form-label">Telegram Chat ID <span class="text-gray-400 text-xs">(สำหรับรับแจ้งเตือนส่วนตัว)</span></label>';
  html += '<input type="text" id="profTgId" value="' + escHtml(user.telegram_chat_id||'') + '" placeholder="เช่น 123456789" class="form-input"></div>';
  html += '</div>';
  html += '<div class="flex justify-end mt-4">';
  html += '<button onclick="saveProfile(\'' + user.id + '\')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึกข้อมูล</button></div>';
  html += '</div>';

  html += '<div class="card p-6"><h3 class="font-semibold text-gray-700 mb-4 flex items-center gap-2"><i class="fi fi-rr-lock text-navy-600"></i> เปลี่ยนรหัสผ่าน</h3>';
  html += '<div class="space-y-3">';
  html += passFieldHTML('รหัสผ่านเดิม *', 'profOldPass');
  html += passFieldHTML('รหัสผ่านใหม่ *', 'profNewPass');
  html += passFieldHTML('ยืนยันรหัสผ่านใหม่ *', 'profConfPass');
  html += '</div>';
  html += '<div class="flex justify-end mt-4"><button onclick="doChangePassword()" class="btn-primary"><i class="fi fi-rr-lock mr-1"></i>เปลี่ยนรหัสผ่าน</button></div></div>';

  html += '<div class="card p-4 flex items-center gap-4">';
  html += '<div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><i class="fi fi-rr-shield-check text-green-600 text-lg"></i></div>';
  html += '<div><p class="font-semibold text-gray-700 text-sm">สถานะบัญชี</p>';
  html += '<p class="text-xs text-gray-400">บทบาท: ' + (ROLE_LABELS[user.role]||user.role) + ' | เข้าสู่ระบบล่าสุด: ' + formatDateTime(user.last_login||'-') + '</p></div></div>';

  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;
}

function passFieldHTML(label, id) {
  return '<div><label class="form-label">' + escHtml(label) + '</label>'
    + '<div class="relative"><input type="password" id="' + id + '" class="form-input pr-10" placeholder="••••••••">'
    + '<button type="button" onclick="togglePass(\'' + id + '\',this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">'
    + '<i class="fi fi-rr-eye text-sm"></i></button></div></div>';
}

function saveProfile(userId) {
  var data = {
    name:  (document.getElementById('profName')||{}).value||'',
    email: (document.getElementById('profEmail')||{}).value||'',
    phone: (document.getElementById('profPhone')||{}).value||'',
    telegram_chat_id: (document.getElementById('profTgId')||{}).value||''
  };
  if (!data.name.trim()) { showError('กรุณากรอกชื่อ'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('updateUser', AUTH.token, userId, data).then(function(res) {
    hideLoading();
    if (res.success) {
      AUTH.user.name = data.name;
      localStorage.setItem('sup_user', JSON.stringify(AUTH.user));
      applyUserToShell();
      refreshMyProfile();
      showSuccess(res.message);
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function doChangePassword() {
  var oldPass  = (document.getElementById('profOldPass')||{}).value||'';
  var newPass  = (document.getElementById('profNewPass')||{}).value||'';
  var confPass = (document.getElementById('profConfPass')||{}).value||'';
  if (!oldPass || !newPass || !confPass) { showError('กรุณากรอกข้อมูลให้ครบ'); return; }
  if (newPass !== confPass) { showError('รหัสผ่านใหม่ไม่ตรงกัน'); return; }
  if (newPass.length < 6) { showError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  showLoading('กำลังเปลี่ยนรหัสผ่าน...');
  callAPI('changePassword', AUTH.token, oldPass, newPass).then(function(res) {
    hideLoading();
    if (res.success) {
      showSuccess(res.message);
      ['profOldPass','profNewPass','profConfPass'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function uploadAvatar(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showError('ไฟล์ต้องไม่เกิน 2 MB'); return; }
  showLoading('กำลังอัปโหลดรูป...');
  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    callAPI('uploadFile', AUTH.token, base64, file.type, file.name).then(function(res) {
      hideLoading();
      if (res.success) {
        callAPI('updateUser', AUTH.token, AUTH.user.id, { avatar: res.file_id }).then(function() {
          showSuccess('อัปโหลดรูปโปรไฟล์สำเร็จ');
          renderProfile();
        });
      } else showError(res.message);
    }).catch(function() { hideLoading(); showError('อัปโหลดไม่สำเร็จ'); });
  };
  reader.readAsDataURL(file);
}

// ===== USERS =====
var _usersData = [];
var _usersPage = 1;

function renderUsers() {
  if (AUTH.user.role !== 'admin') { loadPage('dashboard'); return; }
  showLoading('โหลดรายชื่อผู้ใช้...');
  callAPI('getUsers', AUTH.token).then(function(res) {
    hideLoading();
    _usersData = res.data || [];
    _usersPage = 1;
    buildUsersPage();
  }).catch(function() { hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildUsersPage() {
  var paged = paginate(_usersData, _usersPage);
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between">';
  html += '<h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-users text-navy-600"></i> ผู้ใช้งานทั้งหมด (' + _usersData.length + ')</h3>';
  html += '<button onclick="openAddUserModal()" class="btn-primary flex items-center gap-2"><i class="fi fi-rr-user-add"></i> เพิ่มผู้ใช้</button></div>';

  html += '<div class="card overflow-hidden"><div class="hidden md:block overflow-x-auto">';
  html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600">';
  html += '<tr><th class="px-4 py-3 text-left">ชื่อ-นามสกุล</th><th class="px-4 py-3 text-left">Username</th>';
  html += '<th class="px-4 py-3 text-left">บทบาท</th><th class="px-4 py-3 text-left">แผนก/ฝ่าย</th><th class="px-4 py-3 text-left">อีเมล</th>';
  html += '<th class="px-4 py-3 text-left">เข้าสู่ระบบล่าสุด</th><th class="px-4 py-3 text-center">สถานะ</th>';
  html += '<th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody class="divide-y divide-gray-100">';
  if (!paged.length) html += '<tr><td colspan="8" class="text-center py-10 text-gray-400">ไม่มีผู้ใช้งาน</td></tr>';
  paged.forEach(function(u) {
    var roleColor = ROLE_COLORS[u.role] || ROLE_COLORS.employee;
    html += '<tr>';
    html += '<td class="px-4 py-2.5"><div class="flex items-center gap-2">';
    html += '<div class="w-8 h-8 rounded-xl bg-navy-100 flex items-center justify-center flex-shrink-0"><i class="fi fi-rr-user text-navy-600 text-sm"></i></div>';
    html += '<span class="font-medium text-gray-700">' + escHtml(u.name||'-') + '</span></div></td>';
    html += '<td class="px-4 py-2.5 font-mono text-xs text-gray-500">' + escHtml(u.username) + '</td>';
    html += '<td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + roleColor + '">' + (ROLE_LABELS[u.role]||u.role) + '</span></td>';
    html += '<td class="px-4 py-2.5 text-xs">' + (u.department ? '<span class="px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 font-medium">' + escHtml(u.department) + '</span>' : '<span class="text-amber-600"><i class="fi fi-rr-triangle-warning mr-1"></i>ยังไม่กำหนด</span>') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-500">' + escHtml(u.email||'-') + '</td>';
    html += '<td class="px-4 py-2.5 text-xs text-gray-400">' + formatDateTime(u.last_login) + '</td>';
    html += '<td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (u.active!==false?'bg-green-100 text-green-700':'bg-red-100 text-red-700') + '">' + (u.active!==false?'ใช้งาน':'ระงับ') + '</span></td>';
    html += '<td class="px-4 py-2.5 text-center"><div class="flex gap-1 justify-center">';
    html += '<button onclick="openEditUserModal(\'' + u.id + '\')" title="แก้ไข" class="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200"><i class="fi fi-rr-edit text-xs"></i></button>';
    html += '<button onclick="doResetPassword(\'' + u.id + '\')" title="Reset Password" class="w-7 h-7 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center hover:bg-amber-200"><i class="fi fi-rr-lock text-xs"></i></button>';
    if (u.id !== AUTH.user.id) {
      html += '<button onclick="doToggleUser(\'' + u.id + '\',\'' + escHtml(u.name||u.username) + '\')" title="' + (u.active!==false?'ระงับ':'เปิด') + 'บัญชี" class="w-7 h-7 ' + (u.active!==false?'bg-red-100 text-red-700 hover:bg-red-200':'bg-green-100 text-green-700 hover:bg-green-200') + ' rounded-lg flex items-center justify-center"><i class="fi fi-rr-' + (u.active!==false?'ban':'check-circle') + ' text-xs"></i></button>';
    }
    html += '</div></td></tr>';
  });
  html += '</tbody></table></div>';

  html += '<div class="md:hidden divide-y">';
  paged.forEach(function(u) {
    var roleColor = ROLE_COLORS[u.role] || ROLE_COLORS.employee;
    html += '<div class="p-4 flex items-center gap-3">';
    html += '<div class="w-10 h-10 rounded-xl bg-navy-100 flex items-center justify-center flex-shrink-0"><i class="fi fi-rr-user text-navy-600"></i></div>';
    html += '<div class="flex-1 min-w-0"><p class="font-semibold text-gray-800 text-sm">' + escHtml(u.name||'-') + '</p>';
    html += '<p class="text-xs text-gray-400">@' + escHtml(u.username) + '</p>';
    html += '<div class="flex gap-1.5 mt-1 flex-wrap"><span class="px-2 py-0.5 rounded-full text-xs ' + roleColor + '">' + (ROLE_LABELS[u.role]||u.role) + '</span>';
    if (u.department) html += '<span class="px-2 py-0.5 rounded-full text-xs bg-navy-50 text-navy-700">' + escHtml(u.department) + '</span>';
    html += '<span class="px-2 py-0.5 rounded-full text-xs ' + (u.active!==false?'bg-green-100 text-green-700':'bg-red-100 text-red-700') + '">' + (u.active!==false?'ใช้งาน':'ระงับ') + '</span></div></div>';
    html += '<div class="flex gap-1">';
    html += '<button onclick="openEditUserModal(\'' + u.id + '\')" class="w-8 h-8 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center"><i class="fi fi-rr-edit text-sm"></i></button>';
    html += '<button onclick="doResetPassword(\'' + u.id + '\')" class="w-8 h-8 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center"><i class="fi fi-rr-lock text-sm"></i></button>';
    html += '</div></div>';
  });
  html += '</div></div>';
  html += '<div id="usersPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  renderPagination('usersPagination', _usersData.length, _usersPage, function(p){ _usersPage=p; buildUsersPage(); });
}

function userFormHTML(user) {
  user = user || {};
  var roleOpts = ['admin','accountant','staff','employee'].map(function(r){ return '<option value="' + r + '"' + (user.role===r?' selected':'') + '>' + (ROLE_LABELS[r]||r) + '</option>'; }).join('');
  return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
    + fieldHTML('ชื่อ-นามสกุล *', 'uName', 'text', user.name||'', 'sm:col-span-2')
    + fieldHTML('Username *', 'uUsername', 'text', user.username||'')
    + (!user.id ? '<div><label class="form-label">Password *</label><div class="relative"><input type="password" id="uPassword" class="form-input pr-10" placeholder="รหัสผ่าน"><button type="button" onclick="togglePass(\'uPassword\',this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><i class="fi fi-rr-eye text-sm"></i></button></div></div>' : '')
    + fieldHTML('อีเมล', 'uEmail', 'email', user.email||'')
    + fieldHTML('เบอร์โทร', 'uPhone', 'text', user.phone||'')
    + '<div><label class="form-label">บทบาท *</label><select id="uRole" class="form-input">' + roleOpts + '</select></div>'
    + '<div><label class="form-label">แผนก/ฝ่าย</label><select id="uDepartment" class="form-input">' + deptOptionsHTML(user.department||'') + '</select>'
    + '<p class="text-xs text-gray-400 mt-1">ใช้อ้างอิงว่าคำขอเบิกมาจากแผนกไหน (แก้ไขรายชื่อแผนกได้ที่ ตั้งค่าระบบ)</p></div>'
    + '</div>';
}

function openAddUserModal() {
  var body   = userFormHTML({});
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitAddUser()" class="btn-primary"><i class="fi fi-rr-user-add mr-1"></i>เพิ่มผู้ใช้</button>';
  openModal('เพิ่มผู้ใช้งานใหม่', body, footer);
}

function openEditUserModal(id) {
  var u = _usersData.find(function(x){ return x.id === id; });
  if (!u) return;
  var body   = userFormHTML(u);
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button>'
    + '<button onclick="submitEditUser(\'' + id + '\')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button>';
  openModal('แก้ไขผู้ใช้งาน: ' + u.name, body, footer);
}

function submitAddUser() {
  var data = { name:(document.getElementById('uName')||{}).value||'', username:(document.getElementById('uUsername')||{}).value||'', password:(document.getElementById('uPassword')||{}).value||'', email:(document.getElementById('uEmail')||{}).value||'', phone:(document.getElementById('uPhone')||{}).value||'', role:(document.getElementById('uRole')||{}).value||'employee', department:(document.getElementById('uDepartment')||{}).value||'' };
  if (!data.name.trim() || !data.username.trim() || !data.password) { showError('กรุณากรอกข้อมูลที่จำเป็น'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('addUser', AUTH.token, data).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) { showSuccess(res.message); renderUsers(); }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function submitEditUser(id) {
  var data = { name:(document.getElementById('uName')||{}).value||'', email:(document.getElementById('uEmail')||{}).value||'', phone:(document.getElementById('uPhone')||{}).value||'', role:(document.getElementById('uRole')||{}).value||'employee', department:(document.getElementById('uDepartment')||{}).value||'', active:true };
  if (!data.name.trim()) { showError('กรุณากรอกชื่อ'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('updateUser', AUTH.token, id, data).then(function(res) {
    hideLoading(); closeModal();
    if (res.success) {
      showSuccess(res.message);
      if (id === AUTH.user.id) refreshMyProfile();   // แก้บัญชีตัวเอง -> อัปเดตแผนกทันที
      renderUsers();
    }
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function doResetPassword(userId) {
  showConfirm('Reset รหัสผ่าน','ระบบจะสร้างรหัสผ่านชั่วคราวใหม่', function() {
    showLoading('กำลัง Reset...');
    callAPI('resetUserPassword', AUTH.token, userId).then(function(res) {
      hideLoading();
      if (res.success) showSuccess(res.message);
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  }, 'Reset Password');
}

function doToggleUser(userId, name) {
  var user = _usersData.find(function(u){ return u.id===userId; });
  var action = user && user.active!==false ? 'ระงับ' : 'เปิด';
  showConfirm(action + 'บัญชีผู้ใช้', action + 'บัญชีของ "' + name + '" ใช่หรือไม่?', function() {
    showLoading('กำลังดำเนินการ...');
    callAPI('toggleUserActive', AUTH.token, userId).then(function(res) {
      hideLoading();
      if (res.success) { showSuccess(res.message); renderUsers(); }
      else showError(res.message);
    }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
  }, action + 'บัญชี');
}

// ===== SETTINGS =====
function renderSettings() {
  if (AUTH.user.role !== 'admin') { loadPage('dashboard'); return; }
  showLoading('โหลดการตั้งค่า...');
  Promise.all([
    callAPI('getConfig', AUTH.token),
    callAPI('getItems', AUTH.token)
  ]).then(function(results) {
    hideLoading();
    var res = results[0];
    if (!res.success) { showError(res.message); return; }
    _itemsData = (results[1] && results[1].data) || _itemsData;
    _APP_CONFIG  = res.data || {};
    _DEPARTMENTS = parseListString(_APP_CONFIG.departments);
    buildSettingsPage(res.data);
  }).catch(function(){ hideLoading(); showError('โหลดข้อมูลไม่สำเร็จ'); });
}

function buildSettingsPage(cfg) {
  cfg = cfg || {};
  var html = '<div class="fade-in w-full space-y-4">';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-building text-navy-600"></i> ข้อมูลหน่วยงาน</h3></div>';
  html += '<div class="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">';
  html += fieldHTML('ชื่อระบบ', 'cfgAppName', 'text', cfg.app_name||'', 'sm:col-span-2');
  html += fieldHTML('ชื่อหน่วยงาน', 'cfgOrgName', 'text', cfg.organization_name||'', 'sm:col-span-2');
  html += fieldHTML('ที่อยู่', 'cfgOrgAddr', 'text', cfg.organization_address||'', 'sm:col-span-2');
  html += fieldHTML('เบอร์โทรศัพท์', 'cfgOrgPhone', 'text', cfg.organization_phone||'');
  html += fieldHTML('อีเมลหน่วยงาน', 'cfgOrgEmail', 'email', cfg.organization_email||'');
  // Logo upload
  _configLogoFileId = cfg.app_logo || null;
  var logoImgSrc = _configLogoFileId ? imgUrl(_configLogoFileId) : '';
  if (logoImgSrc) {
    html += '<div class="sm:col-span-2"><label class="form-label">โลโก้หน่วยงาน</label><div class="flex items-center gap-3"><img id="cfgLogoPreview" src="' + logoImgSrc + '" class="w-20 h-20 object-contain rounded-xl border border-gray-200 bg-white p-1"><button onclick="removeLogo()" type="button" class="text-red-500 text-sm hover:underline">ลบโลโก้</button></div><input type="hidden" id="cfgLogoFileId" value="' + (_configLogoFileId||'') + '"></div>';
  } else {
    html += '<div class="sm:col-span-2"><label class="form-label">โลโก้หน่วยงาน</label><input type="file" id="cfgLogoFile" accept="image/*" onchange="handleLogoUpload(this)" class="form-input py-1.5"><p class="text-xs text-gray-400 mt-1">รองรับ JPG, PNG (สูงสุด 2MB)</p><div id="cfgLogoPreviewWrap"></div></div>';
  }
  html += '</div></div>';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-bell text-navy-600"></i> การแจ้งเตือน Telegram</h3></div>';
  html += '<div class="card-body space-y-4">';
  html += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">';
  html += '<p class="font-semibold mb-1">วิธีตั้งค่า Telegram Bot (ฟรี)</p>';
  html += '<ol class="list-decimal list-inside space-y-0.5">';
  html += '<li>ทักหา @BotFather บน Telegram แล้วพิมพ์ /newbot</li>';
  html += '<li>ตั้งชื่อ Bot แล้วคัดลอก Token ที่ได้</li>';
  html += '<li>สร้าง Group/Channel แล้วเพิ่ม Bot เข้าไป</li>';
  html += '<li>ส่งข้อความใดก็ได้ใน Group แล้วเปิด URL: api.telegram.org/bot[TOKEN]/getUpdates เพื่อดู chat_id</li>';
  html += '</ol></div>';
  html += '<div class="flex items-center gap-3"><input type="checkbox" id="cfgTgEnabled" ' + (cfg.telegram_enabled?'checked':'') + ' class="w-4 h-4 rounded accent-navy-700">';
  html += '<label for="cfgTgEnabled" class="text-sm font-medium text-gray-700">เปิดใช้งานการแจ้งเตือน Telegram</label></div>';
  html += fieldHTML('Bot Token', 'cfgTgToken', 'text', cfg.telegram_bot_token||'', '');
  html += fieldHTML('Chat ID (Group/Channel)', 'cfgTgChatId', 'text', cfg.telegram_chat_id||'', '');
  html += '<button onclick="doTestTelegram()" class="btn-secondary btn-sm flex items-center gap-1.5 w-fit"><i class="fi fi-rr-paper-plane"></i> ส่ง Test Message</button>';
  html += '</div></div>';

  // ---------- แผนก/ฝ่าย ----------
  var deptText = parseListString(cfg.departments).join('\n');
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-briefcase text-navy-600"></i> แผนก/ฝ่าย</h3></div>';
  html += '<div class="card-body space-y-3">';
  html += '<p class="text-xs text-gray-500">รายชื่อแผนกที่ใช้ผูกกับผู้ใช้แต่ละคน เพื่อให้รู้ว่าคำขอเบิกมาจากแผนกไหน — พิมพ์ <b>1 แผนกต่อ 1 บรรทัด</b></p>';
  html += '<textarea id="cfgDepartments" rows="7" class="form-input text-sm" placeholder="บัญชี&#10;จัดซื้อ&#10;แพ็คกิ้ง">' + escHtml(deptText) + '</textarea>';
  html += '<p class="text-xs text-amber-600"><i class="fi fi-rr-triangle-warning mr-1"></i>การเปลี่ยนชื่อแผนกมีผลกับผู้ใช้ที่จะเลือกใหม่เท่านั้น คำขอเบิกที่บันทึกไปแล้วจะยังคงชื่อแผนกเดิม</p>';
  html += '</div></div>';

  // ---------- LINE ----------
  var lineCats = parseListString(cfg.line_categories);
  var allCats  = getCategoryList(_itemsData);
  lineCats.forEach(function(c){ if (allCats.indexOf(c) === -1) allCats.push(c); });
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-comment-alt text-green-600"></i> การแจ้งเตือนเข้า LINE (เฉพาะหมวดหมู่)</h3></div>';
  html += '<div class="card-body space-y-4">';
  html += '<div class="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">';
  html += '<p class="font-semibold mb-1">วิธีตั้งค่า LINE (Messaging API)</p>';
  html += '<ol class="list-decimal list-inside space-y-0.5">';
  html += '<li>สร้าง Provider + Messaging API channel ที่ developers.line.biz</li>';
  html += '<li>คัดลอก <b>Channel access token (long-lived)</b> มาใส่ช่องด้านล่าง</li>';
  html += '<li>เชิญ Official Account (บอท) เข้ากลุ่มไลน์ของหัวหน้า แล้วนำ <b>groupId</b> (หรือ userId) มาใส่ช่อง ปลายทาง</li>';
  html += '<li>เลือกหมวดหมู่ที่ต้องการให้เด้งเข้า LINE — หมวดหมู่อื่นจะแจ้งเตือนในระบบ/Telegram ตามปกติ</li>';
  html += '</ol></div>';
  html += '<div class="flex items-center gap-3"><input type="checkbox" id="cfgLineEnabled" ' + (cfg.line_enabled?'checked':'') + ' class="w-4 h-4 rounded accent-green-600">';
  html += '<label for="cfgLineEnabled" class="text-sm font-medium text-gray-700">เปิดใช้งานการแจ้งเตือนเข้า LINE</label></div>';
  html += fieldHTML('Channel Access Token', 'cfgLineToken', 'text', cfg.line_channel_token||'', '');
  html += fieldHTML('ปลายทาง (groupId / userId)', 'cfgLineTarget', 'text', cfg.line_target_id||'', '');
  html += '<div><label class="form-label">หมวดหมู่ที่ให้เด้งเข้า LINE</label>';
  if (!allCats.length) {
    html += '<p class="text-xs text-gray-400">ยังไม่มีหมวดหมู่วัสดุในระบบ</p>';
  } else {
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto border border-gray-200 rounded-xl p-3">';
    allCats.forEach(function(c, i) {
      html += '<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">';
      html += '<input type="checkbox" class="cfg-line-cat w-4 h-4 rounded accent-green-600" value="' + escHtml(c) + '" ' + (lineCats.indexOf(c) !== -1 ? 'checked' : '') + '>';
      html += '<span class="truncate">' + escHtml(c) + '</span></label>';
    });
    html += '</div>';
  }
  html += '<p class="text-xs text-gray-400 mt-1">ไม่เลือกเลย = ส่งเข้า LINE ทุกหมวดหมู่</p></div>';
  html += fieldHTML('จำกัดจำนวนข้อความต่อเดือน', 'cfgLineLimit', 'number', cfg.line_monthly_limit||300, '');
  html += '<div id="cfgLineQuota" class="text-xs text-gray-500"></div>';
  html += '<button onclick="doTestLine()" class="btn-secondary btn-sm flex items-center gap-1.5 w-fit"><i class="fi fi-rr-paper-plane"></i> ส่ง Test เข้า LINE</button>';
  html += '<div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">';
  html += '<p class="font-semibold text-gray-700 mb-1">หมายเหตุเรื่องการอนุมัติ</p>';
  html += 'ข้อความที่เด้งเข้า LINE เป็น "การแจ้งเตือน" เท่านั้น ทุกคนในกลุ่มจะเห็นข้อความ แต่การกดอนุมัติยังต้องเข้ามาทำในระบบด้วยบัญชีที่มีสิทธิ์ผู้ดูแลระบบเท่านั้น';
  html += '</div>';
  html += '</div></div>';

  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-layers text-navy-600"></i> การตั้งค่าสต็อก</h3></div>';
  html += '<div class="card-body">';
  html += fieldHTML('ระดับสต็อกขั้นต่ำเริ่มต้น', 'cfgLowStock', 'number', cfg.low_stock_threshold||5);
  html += '</div></div>';

  // ---------- ซ่อมข้อมูลวัสดุ ----------
  html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-wrench-simple text-amber-600"></i> ซ่อมข้อมูลวัสดุที่หาย</h3></div>';
  html += '<div class="card-body space-y-3">';
  html += '<p class="text-xs text-gray-500">ใช้กรณีรายการวัสดุแสดงเป็นช่องว่าง (เหลือแต่รหัส SUP-xxx) ระบบจะกู้ชื่อ/ขนาด/หน่วย/หมวดหมู่ คืนจากข้อมูลตั้งต้นและประวัติการเคลื่อนไหว โดยไม่แตะยอดสต็อก</p>';
  html += '<div class="flex gap-2 flex-wrap"><button onclick="doRepairItems(true)" class="btn-secondary btn-sm"><i class="fi fi-rr-search mr-1"></i>ตรวจสอบก่อน (ไม่แก้ไข)</button>';
  html += '<button onclick="doRepairItems(false)" class="btn-primary btn-sm"><i class="fi fi-rr-wrench-simple mr-1"></i>ซ่อมข้อมูล</button></div>';
  html += '<div id="repairResult" class="text-xs text-gray-600"></div>';
  html += '</div></div>';

  html += '<div class="flex justify-end gap-3">';
  html += '<button onclick="renderSettings()" class="btn-secondary"><i class="fi fi-rr-refresh mr-1"></i>รีเซ็ต</button>';
  html += '<button onclick="saveSettings()" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึกการตั้งค่า</button></div>';

  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;

  // โควตา LINE ของเดือนนี้
  if (cfg.line_enabled) {
    callAPI('getLineQuota', AUTH.token).then(function(q) {
      var el = document.getElementById('cfgLineQuota');
      if (el && q && q.success) {
        el.innerHTML = '<i class="fi fi-rr-chart-pie-alt mr-1"></i>เดือน ' + q.month + ' ส่งไปแล้ว <b>' + q.used + '</b> / ' + q.limit + ' ข้อความ (เหลือ ' + q.remaining + ')';
      }
    }).catch(function(){});
  }
}

/** doRepairItems — กู้ข้อมูลวัสดุที่หายจากบั๊กนับสต็อกเวอร์ชันเก่า */
function doRepairItems(dryRun) {
  showLoading(dryRun ? 'กำลังตรวจสอบ...' : 'กำลังซ่อมข้อมูล...');
  callAPI('repairItems', AUTH.token, !!dryRun).then(function(res) {
    hideLoading();
    var el = document.getElementById('repairResult');
    if (!res || !res.success) { showError((res && res.message) || 'ไม่สำเร็จ'); return; }
    if (el) {
      var lines = (res.data||[]).slice(0, 30).map(function(r) {
        return '<li>' + escHtml(r.item_code||'-') + ' — ' + escHtml(r.name||'-') + ' <span class="text-gray-400">(' + (r.fields||[]).join(', ') + ')</span></li>';
      }).join('');
      el.innerHTML = '<p class="font-medium text-gray-700 mb-1">' + escHtml(res.message) + '</p>'
        + (lines ? '<ul class="list-disc list-inside space-y-0.5">' + lines + '</ul>' : '');
    }
    if (dryRun) showSuccess(res.message);
    else { _itemsData = []; _itemsCacheTime = 0; showSuccess(res.message); }
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function saveSettings() {
  var data = {
    app_name:              (document.getElementById('cfgAppName')||{}).value||'',
    organization_name:     (document.getElementById('cfgOrgName')||{}).value||'',
    organization_address:  (document.getElementById('cfgOrgAddr')||{}).value||'',
    organization_phone:    (document.getElementById('cfgOrgPhone')||{}).value||'',
    organization_email:    (document.getElementById('cfgOrgEmail')||{}).value||'',
    telegram_enabled:      (document.getElementById('cfgTgEnabled')||{}).checked||false,
    telegram_bot_token:    (document.getElementById('cfgTgToken')||{}).value||'',
    telegram_chat_id:      (document.getElementById('cfgTgChatId')||{}).value||'',
    departments:           parseListString((document.getElementById('cfgDepartments')||{}).value||'').join(','),
    line_enabled:          (document.getElementById('cfgLineEnabled')||{}).checked||false,
    line_channel_token:    (document.getElementById('cfgLineToken')||{}).value||'',
    line_target_id:        (document.getElementById('cfgLineTarget')||{}).value||'',
    line_categories:       Array.prototype.slice.call(document.querySelectorAll('.cfg-line-cat:checked')).map(function(el){ return el.value; }).join(','),
    line_monthly_limit:    parseInt((document.getElementById('cfgLineLimit')||{}).value||300),
    low_stock_threshold:   parseInt((document.getElementById('cfgLowStock')||{}).value||5),
    app_logo:              (document.getElementById('cfgLogoFileId')||{}).value||_configLogoFileId||''
  };
  showLoading('กำลังบันทึก...');
  callAPI('saveConfig', AUTH.token, data).then(function(res) {
    hideLoading();
    if (res.success) {
      document.getElementById('sidebarAppName').textContent = data.app_name || 'ระบบวัสดุสิ้นเปลือง';
      updateLogoDisplay(data.app_logo);
      _APP_CONFIG  = data;
      _DEPARTMENTS = parseListString(data.departments);
      showSuccess(res.message);
    } else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}
function updateLogoDisplay(fileId) {
  var sidebarImg = document.getElementById('sidebarLogoImg');
  var sidebarIcon = document.getElementById('sidebarLogoIcon');
  var loginImg = document.getElementById('loginLogoImg');
  var loginIcon = document.getElementById('loginLogoIcon');
  var url = fileId ? imgUrl(fileId) : '';
  if (url) {
    if (sidebarImg) { sidebarImg.src = url; sidebarImg.classList.remove('hidden'); }
    if (sidebarIcon) sidebarIcon.classList.add('hidden');
    if (loginImg) { loginImg.src = url; loginImg.classList.remove('hidden'); }
    if (loginIcon) loginIcon.classList.add('hidden');
  } else {
    if (sidebarImg) sidebarImg.classList.add('hidden');
    if (sidebarIcon) sidebarIcon.classList.remove('hidden');
    if (loginImg) loginImg.classList.add('hidden');
    if (loginIcon) loginIcon.classList.remove('hidden');
  }
}
function handleLogoUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (!file.type.match('image.*')) { showError('กรุณาเลือกไฟล์รูปภาพ'); input.value=''; return; }
  if (file.size > 2 * 1024 * 1024) { showError('ไฟล์ต้องไม่เกิน 2MB'); input.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    showLoading('กำลังอัปโหลดโลโก้...');
    callAPI('uploadFile', AUTH.token, base64, file.type, file.name).then(function(res) {
      hideLoading();
      if (res.success) {
        _configLogoFileId = res.file_id;
        var wrap = document.getElementById('cfgLogoPreviewWrap');
        var url = imgUrl(res.file_id);
        if (wrap) wrap.innerHTML = '<div class="flex items-center gap-3 mt-2"><img src="' + url + '" class="w-20 h-20 object-contain rounded-xl border border-gray-200 bg-white p-1"><button onclick="removeLogo()" type="button" class="text-red-500 text-sm hover:underline">ลบโลโก้</button></div><input type="hidden" id="cfgLogoFileId" value="' + res.file_id + '">';
      } else showError(res.message);
    }).catch(function() { hideLoading(); showError('อัปโหลดไม่สำเร็จ'); });
  };
  reader.readAsDataURL(file);
}
function removeLogo() {
  _configLogoFileId = null;
  renderSettings();
}

function doTestLine() {
  showLoading('กำลังส่งข้อความทดสอบเข้า LINE...');
  callAPI('testLine', AUTH.token).then(function(res) {
    hideLoading();
    if (res.success) showSuccess(res.message);
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

function doTestTelegram() {
  showLoading('กำลังส่ง Test Message...');
  callAPI('testTelegram', AUTH.token).then(function(res) {
    hideLoading();
    if (res.success) showSuccess(res.message);
    else showError(res.message);
  }).catch(function() { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

// ===== QR SCANNER =====
var _qrScanner = null;
function renderQRScanner() {
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="card p-6 text-center">';
  html += '<h3 class="font-semibold text-gray-700 mb-4"><i class="fi fi-rr-qr-scan text-navy-600 mr-2"></i>สแกน QR Code เพื่อเบิกวัสดุ</h3>';
  html += '<div id="qr-reader"></div>';
  html += '<p class="text-xs text-gray-400 mt-3">อนุญาตให้ใช้กล้องเพื่อสแกน QR Code ได้เลย</p>';
  html += '<button onclick="stopQRScanner()" class="btn-secondary btn-sm mt-4"><i class="fi fi-rr-cross mr-1"></i>ปิดกล้อง</button>';
  html += '</div></div>';
  document.getElementById('mainContent').innerHTML = html;

  setTimeout(function() {
    try {
      _qrScanner = new Html5Qrcode('qr-reader');
      _qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        function(decodedText) {
          stopQRScanner();
          try {
            var url = new URL(decodedText);
            var action = url.searchParams.get('action');
            var itemId = url.searchParams.get('item_id');
            if (action === 'withdraw' && itemId) {
              openWithdrawFromQR(itemId);
            } else {
              showError('QR Code ไม่ถูกต้อง');
            }
          } catch(e) {
            showError('QR Code ไม่ถูกต้อง');
          }
        },
        function(errorMessage) {}
      ).catch(function(err) {
        console.error(err);
        showError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์');
      });
    } catch(e) {
      console.error(e);
      showError('เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง');
    }
  }, 300);
}

function stopQRScanner() {
  if (_qrScanner) {
    _qrScanner.stop().then(function() { _qrScanner = null; }).catch(function() { _qrScanner = null; });
  }
}

// ===== MANUAL / คู่มือการใช้งาน =====
function renderManual() {
  var isAdmin = AUTH.user.role === 'admin';
  var toc = [
    ['m-overview','fi-rr-info','ภาพรวมระบบ'],
    ['m-login','fi-rr-sign-in','การเข้าสู่ระบบ'],
    ['m-roles','fi-rr-users','บทบาทผู้ใช้'],
    ['m-stock','fi-rr-layers','สต็อก & รายการวัสดุ'],
    ['m-receive','fi-rr-inbox-in','รับวัสดุเข้าคลัง'],
    ['m-stocktake','fi-rr-clipboard-list','นับสต็อก'],
    ['m-printqr','fi-rr-print','พิมพ์ QR สติ๊กเกอร์'],
    ['m-withdraw','fi-rr-inbox-out','เบิกวัสดุ & อนุมัติ'],
    ['m-transactions','fi-rr-time-past','ประวัติเคลื่อนไหว'],
    ['m-reports','fi-rr-chart-histogram','รายงาน'],
    ['m-admin','fi-rr-settings','ผู้ใช้งาน & ตั้งค่าระบบ'],
    ['m-profile','fi-rr-user','โปรไฟล์ของฉัน'],
    ['m-faq','fi-rr-interrogation','คำถามที่พบบ่อย']
  ];
  var tocLinks = toc.map(function(t) {
    return '<a href="#' + t[0] + '" class="nav-link"><i class="fi ' + t[1] + '"></i>' + t[2] + '</a>';
  }).join('');

  var html = '<div class="fade-in flex flex-col lg:flex-row gap-6 items-start">';

  html += '<div class="hidden lg:block w-64 flex-shrink-0"><div class="toc-sticky card p-3">';
  html += '<p class="font-bold text-gray-700 text-sm mb-2 px-1 flex items-center gap-2"><i class="fi fi-rr-list text-navy-600"></i>สารบัญ</p>';
  html += '<nav class="manual-nav flex flex-col gap-0.5">' + tocLinks + '</nav>';
  html += '</div></div>';

  html += '<div class="lg:hidden w-full">';
  html += '<details class="card p-3"><summary class="font-bold text-gray-700 text-sm cursor-pointer flex items-center gap-2"><i class="fi fi-rr-list text-navy-600"></i>สารบัญ</summary>';
  html += '<nav class="manual-nav flex flex-col gap-0.5 mt-2">' + tocLinks + '</nav></details></div>';

  html += '<div class="flex-1 min-w-0 w-full space-y-4">';

  // 1. ภาพรวมระบบ
  html += manualSection('m-overview', 'fi-rr-info', '1. ภาพรวมระบบ',
    '<p class="mb-3">ระบบวัสดุสิ้นเปลือง ใช้บริหารจัดการคลังวัสดุตั้งแต่การรับเข้า เบิกจ่าย นับสต็อก ไปจนถึงการอนุมัติและออกรายงาน รองรับการใช้งานผ่านมือถือและคอมพิวเตอร์</p>'
    + '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">'
    + manualFeatureCard('fi-rr-box-alt', 'บริหารคลังวัสดุ', 'รับเข้า นับสต็อก พิมพ์ QR ติดฉลาก')
    + manualFeatureCard('fi-rr-inbox-out', 'เบิก-อนุมัติ', 'พนักงานยื่นคำขอ เจ้าหน้าที่บัญชี/ผู้ดูแลอนุมัติ')
    + manualFeatureCard('fi-rr-chart-histogram', 'ติดตาม & รายงาน', 'ดูภาพรวม แจ้งเตือนสต็อกต่ำ ออกรายงาน')
    + '</div>'
    + '<div class="tip-box mt-3 text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>ทุกหน้าจอเข้าถึงได้จากเมนูด้านซ้าย และมีช่อง <strong>ค้นหาวัสดุเร็ว</strong> ที่แถบด้านบนของทุกหน้า</div>');

  // 2. การเข้าสู่ระบบ
  html += manualSection('m-login', 'fi-rr-sign-in', '2. การเข้าสู่ระบบ',
    manualStep(1, 'เลือกประเภทผู้ใช้', 'เลือกแท็บ ผู้ดูแลระบบ / เจ้าหน้าที่ / พนักงาน ให้ตรงกับบัญชีของท่าน (เจ้าหน้าที่คลังและเจ้าหน้าที่บัญชีใช้แท็บ "เจ้าหน้าที่" เหมือนกัน)')
    + manualStep(2, 'กรอกชื่อผู้ใช้และรหัสผ่าน', 'กรอกข้อมูลแล้วกด "เข้าสู่ระบบ" หรือกด Enter ที่ช่องรหัสผ่าน')
    + manualStep(3, 'ลืมรหัสผ่าน', 'กด "ลืมรหัสผ่าน?" ใต้ปุ่มเข้าสู่ระบบ แล้วกรอกอีเมลที่ลงทะเบียนไว้เพื่อรับรหัสผ่านชั่วคราว')
    + '<div class="tip-box mt-3 text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>หลังเข้าสู่ระบบสามารถกดชื่อ/ไอคอนโปรไฟล์มุมขวาบน หรือด้านล่างเมนู เพื่อ<strong>ออกจากระบบ</strong>ได้ทุกเมื่อ</div>');

  // 3. บทบาทผู้ใช้
  html += manualSection('m-roles', 'fi-rr-users', '3. บทบาทผู้ใช้',
    '<p class="text-sm text-gray-500 mb-3">ระบบมี 4 บทบาท แต่ละบทบาทเห็นเมนูและทำได้ต่างกัน</p>'
    + '<div class="overflow-x-auto"><table class="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">'
    + '<thead class="bg-navy-700 text-white text-xs"><tr><th class="px-3 py-2 text-left">บทบาท</th><th class="px-3 py-2 text-left">เมนูที่เห็น</th><th class="px-3 py-2 text-left">สิทธิ์เด่น</th></tr></thead>'
    + '<tbody class="divide-y divide-gray-100">'
    + '<tr><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium bg-navy-100 text-navy-700">ผู้ดูแลระบบ</span></td>'
    + '<td class="px-3 py-2">ทุกเมนู</td><td class="px-3 py-2">จัดการรายการวัสดุ, <strong>ยืนยันฉบับร่างตรวจนับเพื่อปรับสต็อก</strong>, อนุมัติ/ปฏิเสธการเบิก, จัดการผู้ใช้งาน, ตั้งค่าระบบ</td></tr>'
    + '<tr><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">เจ้าหน้าที่บัญชี</span></td>'
    + '<td class="px-3 py-2">คลังวัสดุ (ยกเว้นรายการวัสดุ), การเบิก, อนุมัติการเบิก, รายงาน</td><td class="px-3 py-2">อนุมัติ/ปฏิเสธการเบิก, ตรวจนับสต็อกสิ้นเดือนและบันทึกฉบับร่าง, ดูรายงาน</td></tr>'
    + '<tr><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">เจ้าหน้าที่คลัง</span></td>'
    + '<td class="px-3 py-2">คลังวัสดุ (ยกเว้นรายการวัสดุและนับสต็อก), การเบิก, รายงาน</td><td class="px-3 py-2">รับวัสดุเข้าคลัง, พิมพ์ QR, ยื่นคำขอเบิก, ดูรายงาน</td></tr>'
    + '<tr><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">พนักงาน</span></td>'
    + '<td class="px-3 py-2">ภาพรวมระบบ, สต็อกคงเหลือ, เบิกวัสดุ, ประวัติเคลื่อนไหว</td><td class="px-3 py-2">ดูสต็อก, ยื่นคำขอเบิกวัสดุ, ดูประวัติของตนเอง</td></tr>'
    + '</tbody></table></div>'
    + '<div class="tip-box mt-3 text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>ขั้นตอนการทำงาน: <strong>เจ้าหน้าที่คลัง</strong> รับเข้า-เบิก → <strong>เจ้าหน้าที่บัญชี</strong> อนุมัติการเบิก และตรวจนับจริงสิ้นเดือนพร้อมบันทึกฉบับร่าง → <strong>ผู้ดูแลระบบ</strong> ยืนยันฉบับร่าง จึงจะปรับสต็อกให้ตรงจริง</div>');

  // 4. สต็อก & รายการวัสดุ
  html += manualSection('m-stock', 'fi-rr-layers', '4. สต็อกคงเหลือ & รายการวัสดุ',
    '<p class="text-sm text-gray-500 mb-2">เมนู <strong>สต็อกคงเหลือ</strong> แสดงจำนวนวัสดุปัจจุบันทุกรายการ พร้อมสถานะสี:</p>'
    + '<div class="flex flex-wrap gap-2 mb-3">'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium stock-ok">ปกติ</span>'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium stock-low">ใกล้หมด</span>'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium stock-critical">วิกฤต/หมด</span>'
    + '</div>'
    + '<p class="text-sm text-gray-500 mb-1">เมื่อมีวัสดุใกล้หมด ระบบจะแสดง<strong>ตัวเลขแจ้งเตือนสีเหลือง</strong>กำกับที่เมนู "สต็อกคงเหลือ" ในแถบด้านซ้ายโดยอัตโนมัติ</p>'
    + '<h4 class="font-semibold text-gray-700 text-sm mt-4 mb-2">รายการวัสดุ <span class="text-xs text-gray-400 font-normal">(เฉพาะผู้ดูแลระบบ)</span></h4>'
    + '<p class="text-sm text-gray-500 mb-3">เมนู <strong>รายการวัสดุ</strong> ใช้เพิ่ม/แก้ไข/ปิดใช้งานวัสดุ กำหนดรหัสวัสดุ ชื่อ หน่วยนับ หมวดหมู่ รูปภาพ และจุดสั่งซื้อ (จุดที่ถือว่าใกล้หมด) — ช่อง <strong>หมวดหมู่</strong> เป็นรายการให้เลือก หากยังไม่มีหมวดหมู่ที่ต้องการให้เลือก "+ เพิ่มหมวดหมู่ใหม่..." แล้วพิมพ์ชื่อ</p>'
    + '<p class="text-sm text-gray-500 mb-3">กดปุ่ม <i class="fi fi-rr-eye"></i> ดูรายละเอียดวัสดุ แล้วกด <strong>ประวัติการรับเข้า</strong> เพื่อดูวันที่รับเข้า จำนวน ชื่อร้าน และราคาของแต่ละครั้ง</p>'
    + '<h4 class="font-semibold text-gray-700 text-sm mt-4 mb-2">เพิ่มวัสดุครั้งละหลายรายการ</h4>'
    + manualStep(1, 'กดปุ่ม "เพิ่มหลายรายการ"', 'อยู่ข้างปุ่ม "เพิ่มวัสดุใหม่" ในหน้ารายการวัสดุ')
    + manualStep(2, 'กรอกข้อมูลในตาราง', 'เริ่มต้นให้ 5 แถว กด "เพิ่มแถว" หรือ "เพิ่ม 5 แถว" ได้ตามต้องการ • ตั้ง "หมวดหมู่เริ่มต้น" และ "หน่วยเริ่มต้น" ไว้ก่อน แถวใหม่จะกรอกให้อัตโนมัติ')
    + manualStep(3, 'หรือวางข้อมูลจาก Excel', 'กด "วางจาก Excel" แล้ววางข้อมูลที่คัดลอกมา (1 บรรทัด = 1 รายการ ตามลำดับ ชื่อ | ขนาด | หน่วย | หมวดหมู่ | สต็อกเริ่มต้น | ขั้นต่ำ | ราคา) แล้วกด "แปลงเป็นรายการ"')
    + manualStep(4, 'กด "บันทึกทั้งหมด"', 'ระบบบันทึกทุกแถวในครั้งเดียว แถวที่ไม่ได้กรอกชื่อจะถูกข้าม และรายการที่ซ้ำกับของเดิมจะถูกข้ามพร้อมแจ้งให้ทราบ'));

  // 5. รับวัสดุเข้าคลัง
  html += manualSection('m-receive', 'fi-rr-inbox-in', '5. รับวัสดุเข้าคลัง',
    '<p class="text-sm text-gray-500 mb-2">ใช้เมื่อมีวัสดุใหม่ส่งเข้าคลัง (เจ้าหน้าที่ขึ้นไป)</p>'
    + manualStep(1, 'เปิดเมนู "รับวัสดุเข้าคลัง"', 'เลือกวัสดุจากรายการที่มีอยู่')
    + manualStep(2, 'กรอกจำนวนที่รับเข้า', 'ระบุจำนวน วันที่รับเข้า <strong>ชื่อร้าน/ผู้จำหน่าย</strong> และ <strong>ราคาต่อหน่วย</strong> (ระบบเก็บเป็นประวัติการรับเข้าของวัสดุชิ้นนั้น)')
    + manualStep(3, 'บันทึก', 'ระบบจะบวกยอดเข้าสต็อกทันที และบันทึกลงประวัติเคลื่อนไหวประเภท "รับเข้า"'));

  // 6. นับสต็อก
  html += manualSection('m-stocktake', 'fi-rr-clipboard-list', '6. นับสต็อก',
    '<p class="text-sm text-gray-500 mb-2">ใช้ตรวจนับวัสดุจริงเทียบกับยอดในระบบ <span class="text-xs text-gray-400">(เจ้าหน้าที่บัญชี / ผู้ดูแลระบบ)</span> — การปรับสต็อกต้องผ่าน 2 ขั้น: บันทึกฉบับร่าง แล้วให้ผู้ดูแลระบบยืนยัน</p>'
    + manualStep(1, 'เปิดเมนู "นับสต็อก"', 'ตารางวัสดุจัดกลุ่มตาม<strong>หมวดหมู่</strong> พร้อมยอด "ระบบ" ปัจจุบัน — เลือกดูเฉพาะหมวดหมู่ ค้นหา หรือเปลี่ยนเป็นเรียงตามรหัส/ชื่อได้ที่แถบด้านบนตาราง')
    + manualStep(2, 'กรอกจำนวนที่นับได้จริง', 'ในช่อง "นับจริง" ของแต่ละแถว ระบบจะคำนวณ "ผลต่าง" ให้ทันที (สีเขียว = เกิน, สีแดง = ขาด)')
    + manualStep(3, 'กด "บันทึกฉบับร่าง"', 'ระบบบันทึกรายการที่มีผลต่างพร้อม<strong>ชื่อผู้บันทึกและวัน/เวลา</strong> โดย<strong>ยังไม่ปรับสต็อก</strong> — กลับมาแก้ไขแล้วบันทึกทับฉบับร่างเดิมได้จนกว่าจะถูกยืนยัน')
    + manualStep(4, 'ผู้ดูแลระบบกด "ยืนยันปรับยอด"', 'ตรวจผลต่างของฉบับร่าง แล้วกด "ยืนยันปรับสต็อก" ระบบจึงปรับยอดและบันทึกลงประวัติเคลื่อนไหวประเภท "ปรับยอด" — หรือกด "ไม่อนุมัติ" เพื่อให้ตรวจนับใหม่ (สต็อกไม่ถูกปรับ)')
    + '<div class="tip-box mt-3 text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>เมื่อมีฉบับร่างรอยืนยัน จะมี<strong>ตัวเลขสีเหลือง</strong>กำกับที่เมนู "นับสต็อก" และดูผลการตรวจนับย้อนหลังได้ที่ "ประวัติการตรวจนับ" ด้านล่างของหน้า</div>'
    + '<div class="warn-box mt-3 text-sm"><i class="fi fi-rr-triangle-warning text-amber-600 mr-1"></i>หากมีการรับเข้า/เบิกวัสดุหลังวันที่นับ ระบบจะปรับด้วย "ผลต่าง" ที่นับได้ (ไม่เขียนทับความเคลื่อนไหวที่เกิดภายหลัง) และแสดงคำเตือนสีเหลืองที่รายการนั้นให้ตรวจสอบก่อนยืนยัน</div>');

  // 7. พิมพ์ QR สติ๊กเกอร์
  html += manualSection('m-printqr', 'fi-rr-print', '7. พิมพ์ QR สติ๊กเกอร์',
    '<p class="text-sm text-gray-500 mb-2">สร้างและพิมพ์สติ๊กเกอร์ QR สำหรับติดที่ตัววัสดุ/ชั้นวาง เพื่อให้พนักงานสแกนยื่นคำขอเบิกได้รวดเร็ว</p>'
    + manualStep(1, 'ค้นหา/กรองวัสดุ', 'ใช้ช่องค้นหาหรือกรองตามหมวดหมู่เพื่อเลือกวัสดุที่ต้องการ')
    + manualStep(2, 'เลือกวัสดุที่ต้องการพิมพ์', 'เลือกได้ทีละหลายรายการ')
    + manualStep(3, 'พิมพ์', 'ระบบจะสร้าง QR Code ต่อรายการสำหรับสั่งพิมพ์')
    + '<div class="tip-box mt-3 text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>การสแกน QR ที่ติดไว้จะเปิดหน้าเบิกวัสดุพร้อมเลือกวัสดุนั้นให้อัตโนมัติ (รายการที่เบิกผ่าน QR จะมีไอคอน <i class="fi fi-rr-qr-scan"></i> กำกับในประวัติ)</div>');

  // 8. เบิกวัสดุ & อนุมัติ
  html += manualSection('m-withdraw', 'fi-rr-inbox-out', '8. เบิกวัสดุ & อนุมัติการเบิก',
    '<h4 class="font-semibold text-gray-700 text-sm mb-2">8.1 ยื่นคำขอเบิก (ทุกบทบาท)</h4>'
    + manualStep(1, 'เปิดฟอร์มเบิก', 'เมนู "เบิกวัสดุ" แล้วกด "ยื่นคำขอเบิก" • หรือที่หน้า "สต็อกคงเหลือ" กดปุ่ม "เบิกหลายรายการ" ด้านบน หรือกดปุ่ม "เบิก" ที่วัสดุใดก็ได้ (ระบบจะใส่วัสดุชิ้นนั้นเป็นรายการแรกให้ แล้วเพิ่มรายการอื่นต่อได้) • หรือสแกน QR สติ๊กเกอร์ที่ติดบนวัสดุ')
    + manualStep(2, 'เลือกวัสดุได้หลายรายการในคำขอเดียว', 'กดที่ชื่อวัสดุเพื่อเพิ่มลงรายการด้านล่าง (กดซ้ำ = เพิ่มจำนวน) แก้จำนวนในช่องข้างรายการ หรือกดถังขยะเพื่อเอาออก • ระบบจะแสดง <strong>แผนกที่เบิก</strong> อัตโนมัติจากบัญชีผู้ใช้')
    + manualStep(3, 'ระบุวัตถุประสงค์แล้วกด "ยื่นคำขอเบิก"', 'วัตถุประสงค์/หมายเหตุใช้ร่วมกันทั้งคำขอ • ระบบจะออกเลขที่เบิกแยกรายบรรทัด แต่ผูกด้วย "เลขชุด" เดียวกัน ฝั่งอนุมัติจะเห็นเป็นการ์ดเดียวและกดอนุมัติ/ปฏิเสธได้ทีเดียวทั้งชุด และแจ้งเตือนออกไปเพียงข้อความเดียวต่อ 1 ชุด')
    + manualStep(4, 'ติดตามสถานะ', 'ดูสถานะได้ที่แท็บ ทั้งหมด/รออนุมัติ/อนุมัติแล้ว/ปฏิเสธ ในหน้าเดียวกัน — คำขอที่ยังรออนุมัติและเป็นของตนเองสามารถกด "ยกเลิก" ได้')
    + '<h4 class="font-semibold text-gray-700 text-sm mt-4 mb-2">8.2 อนุมัติการเบิก <span class="text-xs text-gray-400 font-normal">(เจ้าหน้าที่บัญชี / ผู้ดูแลระบบ)</span></h4>'
    + '<p class="text-sm text-gray-500 mb-2">เมนู <strong>อนุมัติการเบิก</strong> จะมีตัวเลขสีแดงกำกับจำนวนคำขอที่รออนุมัติ</p>'
    + manualStep(1, 'เปิดคำขอที่สถานะ "รออนุมัติ"', 'ตรวจสอบจำนวนที่ขอและวัตถุประสงค์ — คำขอที่เบิกหลายรายการพร้อมกัน (มีป้าย "ชุด #WB-...") จะรวมแสดงเป็นการ์ดเดียว ไม่แยกทีละรายการ')
    + manualStep(2, 'กด "อนุมัติทั้งชุด"', 'ปรับจำนวนที่อนุมัติจริงของแต่ละรายการในชุดได้ (อาจน้อยกว่าที่ขอได้) แล้วกดยืนยันครั้งเดียว ระบบจะตัดสต็อกทุกรายการพร้อมกันทันที')
    + manualStep(3, 'หรือกด "ปฏิเสธทั้งชุด"', 'ระบุเหตุผลการปฏิเสธ (ใช้ร่วมกันทุกรายการในชุด) — สต็อกจะไม่ถูกตัด')
    + '<div class="warn-box mt-3 text-sm"><i class="fi fi-rr-triangle-warning text-amber-600 mr-1"></i>การอนุมัติจะตัดยอดสต็อกทันทีและไม่สามารถยกเลิกย้อนหลังได้ ควรตรวจสอบยอดคงเหลือก่อนกดอนุมัติ</div>');

  // 9. ประวัติเคลื่อนไหว
  html += manualSection('m-transactions', 'fi-rr-time-past', '9. ประวัติเคลื่อนไหว',
    '<p class="text-sm text-gray-500 mb-2">เมนู <strong>ประวัติเคลื่อนไหว</strong> รวมทุกความเคลื่อนไหวของสต็อกไว้ในที่เดียว แบ่งเป็น 3 ประเภท:</p>'
    + '<div class="flex flex-wrap gap-2">'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium badge-receive">รับเข้า</span>'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium badge-withdraw">เบิกออก</span>'
    + '<span class="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">ปรับยอด (จากการตรวจนับ)</span>'
    + '</div>'
    + '<p class="text-sm text-gray-500 mt-2">ใช้สำหรับตรวจสอบย้อนหลังว่าใครรับ/เบิกวัสดุใด จำนวนเท่าไร และเมื่อใด</p>');

  // 10. รายงาน
  html += manualSection('m-reports', 'fi-rr-chart-histogram', '10. รายงาน',
    '<p class="text-sm text-gray-500 mb-2">เมนู <strong>รายงาน</strong> (เจ้าหน้าที่ขึ้นไป) สรุปข้อมูลการรับ-เบิกวัสดุในรูปแบบกราฟและตาราง เพื่อใช้วางแผนสั่งซื้อและติดตามการใช้วัสดุ</p>'
    + '<h4 class="font-semibold text-gray-700 text-sm mt-3 mb-2">สรุปรายเดือน แยกตามแผนก</h4>'
    + '<p class="text-sm text-gray-500 mb-2">เลือกปี/เดือนแล้วกด "ดูรายงาน" จะได้ตารางเบิกรายวัน พร้อม<strong>คอลัมน์ของแต่ละแผนก</strong>ว่าเดือนนั้นแผนกไหนเบิกวัสดุแต่ละรายการไปกี่ชิ้น และการ์ดสรุปสัดส่วนการเบิกของทุกแผนกด้านบนตาราง (กด "ซ่อนคอลัมน์แผนก" เพื่อดูเฉพาะตารางรายวันได้)</p>'
    + '<div class="tip-box text-sm"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>สามารถส่งออกข้อมูลเป็นไฟล์ Excel (รวมคอลัมน์แผนก) เพื่อนำไปวิเคราะห์หรือจัดเก็บเพิ่มเติมได้</div>');

  // 11. ผู้ใช้งาน & ตั้งค่าระบบ
  html += manualSection('m-admin', 'fi-rr-settings', '11. ผู้ใช้งาน & ตั้งค่าระบบ',
    '<p class="text-xs text-gray-400 mb-3">เมนูในกลุ่มนี้แสดงเฉพาะบทบาท "ผู้ดูแลระบบ"</p>'
    + '<h4 class="font-semibold text-gray-700 text-sm mb-2">11.1 ผู้ใช้งาน</h4>'
    + '<p class="text-sm text-gray-500 mb-2">เพิ่ม/แก้ไขบัญชีผู้ใช้ กำหนดชื่อผู้ใช้ รหัสผ่านเริ่มต้น บทบาท (ผู้ดูแลระบบ / เจ้าหน้าที่บัญชี / เจ้าหน้าที่คลัง / พนักงาน) และ <strong>แผนก/ฝ่าย</strong></p>'
    + '<div class="tip-box text-sm mb-3"><i class="fi fi-rr-bulb text-navy-700 mr-1"></i>แผนกที่กำหนดให้ผู้ใช้จะถูกบันทึกกับคำขอเบิกทุกใบของคนนั้นโดยอัตโนมัติ และนำไปสรุปในรายงานรายเดือน — ผู้ใช้ที่ยังไม่ได้กำหนดแผนกจะต้องเลือกแผนกเองตอนยื่นคำขอ</div>'
    + '<h4 class="font-semibold text-gray-700 text-sm mb-2">11.2 ตั้งค่าระบบ</h4>'
    + '<p class="text-sm text-gray-500 mb-2">ปรับชื่อระบบ โลโก้ และค่าตั้งต้นอื่น ๆ ของระบบ รวมถึง:</p>'
    + '<ul class="list-disc pl-5 text-sm text-gray-500 space-y-1">'
    + '<li><strong>แผนก/ฝ่าย</strong> — กำหนดรายชื่อแผนกที่ใช้เลือกให้ผู้ใช้ (พิมพ์ 1 แผนกต่อ 1 บรรทัด)</li>'
    + '<li><strong>แจ้งเตือน Telegram</strong> — แจ้งเตือนคำขอเบิก/อนุมัติ ทุกหมวดหมู่</li>'
    + '<li><strong>แจ้งเตือนเข้า LINE</strong> — เลือกได้ว่าให้เฉพาะบางหมวดหมู่ (เช่น วัสดุแพ็คกิ้ง) เด้งเข้ากลุ่มไลน์ พร้อมจำกัดจำนวนข้อความต่อเดือน หมวดหมู่ที่เหลือจะแจ้งเตือนในระบบตามปกติ</li>'
    + '</ul>');

  // 12. โปรไฟล์
  html += manualSection('m-profile', 'fi-rr-user', '12. โปรไฟล์ของฉัน',
    '<p class="text-sm text-gray-500 mb-2">คลิกชื่อ/ไอคอนผู้ใช้ที่มุมล่างซ้ายของแถบเมนู (หรือไอคอนโปรไฟล์มุมขวาบน) เพื่อเข้าหน้าโปรไฟล์</p>'
    + '<ul class="list-disc pl-5 text-sm text-gray-500 space-y-1">'
    + '<li>แก้ไขชื่อ-นามสกุล อีเมล เบอร์โทรศัพท์</li>'
    + '<li>ตั้งค่า Telegram Chat ID เพื่อรับการแจ้งเตือนส่วนตัว</li>'
    + '<li>เปลี่ยนรหัสผ่านด้วยตนเอง</li>'
    + '</ul>');

  // 13. FAQ
  html += manualSection('m-faq', 'fi-rr-interrogation', '13. คำถามที่พบบ่อย',
    manualFaq('ลืมรหัสผ่านต้องทำอย่างไร?', 'กด "ลืมรหัสผ่าน?" ที่หน้าเข้าสู่ระบบ แล้วกรอกอีเมลที่ลงทะเบียนไว้เพื่อรับรหัสผ่านชั่วคราว')
    + manualFaq('เบิกวัสดุแล้วสถานะ "รออนุมัติ" ค้างนานทำอย่างไร?', 'ติดต่อเจ้าหน้าที่บัญชีหรือผู้ดูแลระบบให้ตรวจสอบที่เมนู "อนุมัติการเบิก" หรือหากคำขอเป็นของตนเองและยังรออนุมัติ สามารถกด "ยกเลิก" แล้วยื่นใหม่ได้')
    + manualFaq('ทำไมไม่เห็นเมนู "รายการวัสดุ" หรือ "จัดการระบบ"?', 'เมนูเหล่านี้จำกัดสิทธิ์เฉพาะบทบาท "ผู้ดูแลระบบ" เท่านั้น หากจำเป็นต้องใช้งานให้ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์')
    + manualFaq('ตัวเลขสีแดง/เหลืองที่เมนูคืออะไร?', 'สีแดงที่เมนู "อนุมัติการเบิก" คือจำนวนคำขอที่รออนุมัติ สีเหลืองที่เมนู "สต็อกคงเหลือ" คือจำนวนวัสดุที่ใกล้หมด/หมดสต็อก และสีเหลืองที่เมนู "นับสต็อก" คือฉบับร่างตรวจนับที่รอผู้ดูแลระบบยืนยัน')
    + manualFaq('บันทึกฉบับร่างนับสต็อกแล้ว ทำไมยอดในระบบยังไม่เปลี่ยน?', 'ฉบับร่างเป็นเพียงบันทึกผลการตรวจนับ สต็อกจะถูกปรับก็ต่อเมื่อผู้ดูแลระบบเปิดเมนู "นับสต็อก" แล้วกด "ยืนยันปรับยอด" เท่านั้น')
    + manualFaq('พิมพ์ QR แล้วใช้งานอย่างไร?', 'นำสติ๊กเกอร์ไปติดที่ตัววัสดุหรือชั้นวาง เมื่อต้องการเบิกให้ใช้กล้องสแกน QR ในหน้าเบิกวัสดุ ระบบจะเลือกวัสดุนั้นให้อัตโนมัติ'));

  html += '</div></div>';
  document.getElementById('mainContent').innerHTML = html;
}

function manualSection(id, icon, title, bodyHtml) {
  return '<div class="card overflow-hidden" id="' + id + '">'
    + '<div class="bg-navy-700 text-white px-5 py-3 flex items-center gap-2">'
    + '<i class="fi ' + icon + '"></i><h3 class="font-bold text-sm">' + title + '</h3></div>'
    + '<div class="card-body text-sm text-gray-700">' + bodyHtml + '</div></div>';
}

function manualFeatureCard(icon, title, desc) {
  return '<div class="border border-gray-200 rounded-xl p-4 text-center">'
    + '<i class="fi ' + icon + ' text-navy-600 text-2xl"></i>'
    + '<p class="font-semibold text-gray-800 text-sm mt-2">' + title + '</p>'
    + '<p class="text-xs text-gray-500 mt-1">' + desc + '</p></div>';
}

function manualStep(n, title, desc) {
  return '<div class="step-row"><span class="step-badge">' + n + '</span>'
    + '<div><div class="font-semibold text-gray-800 text-sm">' + title + '</div>'
    + '<div class="text-xs text-gray-500 mt-0.5">' + desc + '</div></div></div>';
}

function manualFaq(q, a) {
  return '<details class="border-b border-gray-100 py-2 last:border-b-0">'
    + '<summary class="font-semibold text-gray-800 text-sm cursor-pointer flex items-center gap-2">'
    + '<i class="fi fi-rr-question-square text-navy-600"></i>' + q + '</summary>'
    + '<p class="text-xs text-gray-500 mt-2 pl-6">' + a + '</p></details>';
}

// ===== ON LOAD =====
window.onload = function() {
  // Parse URL params for QR
  var urlParams = new URLSearchParams(window.location.search);
  _QR_ACTION = urlParams.get('action') || '';
  _QR_ITEM_ID = urlParams.get('item_id') || '';

  if (AUTH.token) {
    // bootstrap คืน config มาให้อยู่แล้ว จึงไม่ต้องรอ getPublicConfig ก่อน (เดิมรอแบบ sequential)
    initApp();
  } else {
    showLoginPage();
    loadAppConfig();   // โหลดชื่อ/โลโก้ขึ้นหน้า login แบบไม่บล็อก
  }
};

