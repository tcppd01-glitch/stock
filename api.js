// ============================================================
// API Client — Google Apps Script Backend
// ============================================================

var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxRwxGGW3fxIB0rKRIU2zh9lEo_yUTVEcW6cWAqMF4YYJBvu0YxCXfy6mUbj8ihTyaRXQ/exec';

// Google Apps Script ตอบไม่สม่ำเสมอ: ส่วนใหญ่ 3-6 วินาที แต่บางรอบใช้ 30-40 วินาที หรือตอบเป็นหน้า error
// โดยไม่เกี่ยวกับคำสั่งที่เรียก (วัดจากคำสั่งเปล่าที่ไม่อ่านชีตก็เป็น) จึงต้องรับมือที่ฝั่งหน้าเว็บ
var API_HEDGE_MS       = 7000;    // คำสั่งอ่าน: ยังไม่ตอบภายในเวลานี้ -> ส่งซ้ำอีกชุดแล้วใช้คำตอบที่มาถึงก่อน
var API_READ_TIMEOUT   = 70000;   // คำสั่งอ่าน: รอแต่ละรอบไม่เกินเวลานี้
var API_MAX_ATTEMPTS   = 3;       // จำนวนรอบสูงสุดต่อ 1 คำสั่ง
var API_RETRY_DELAY_MS = 1200;

// คำสั่งที่อ่านอย่างเดียว — ส่งซ้ำกี่รอบก็ไม่มีผลกับข้อมูล
var API_READ_FUNCTIONS = {
  bootstrap:1, validateSession:1, getPublicConfig:1, getConfig:1, getMyProfile:1, getUsers:1,
  getItems:1, getItemById:1, getReceives:1, getWithdrawals:1, getTransactions:1, getStocktakes:1,
  getDashboardStats:1, getMonthlyReport:1, getLineQuota:1
};
// ใช้ POST เมื่อ payload ใหญ่เกิน URL length limit (base64 รูป / เพิ่มวัสดุหลายรายการ)
var API_POST_FUNCTIONS = { uploadFile:1, addItemsBulk:1, addWithdrawalBulk:1, adjustStock:1, saveStocktakeDraft:1 };

// backend รองรับ rid (กันทำรายการซ้ำ) หรือยัง — รู้จาก config ที่ backend ส่งมา (ดู setApiCapabilities)
var _apiIdempotent = false;
try { _apiIdempotent = localStorage.getItem('sup_api_idem') === '1'; } catch (e) {}

/** setApiCapabilities — เรียกทุกครั้งที่ได้ config จาก backend เพื่อรู้ว่าลองส่งคำสั่งเขียนซ้ำได้หรือไม่ */
function setApiCapabilities(cfg) {
  if (!cfg) return;
  _apiIdempotent = cfg.api_idempotent === true;
  try { localStorage.setItem('sup_api_idem', _apiIdempotent ? '1' : '0'); } catch (e) {}
}

/**
 * parseApiResponse — อ่านคำตอบจาก Apps Script
 * ปกติจะได้ JSON แต่ถ้า Apps Script พังหรือยังไม่ได้ตั้งสิทธิ์ให้เข้าถึง
 * มันจะตอบกลับเป็นหน้า HTML แทน — กรณีนั้นให้ดึงข้อความ error จริงออกมาบอกผู้ใช้
 * แทนที่จะขึ้นแค่ "ไม่สามารถเชื่อมต่อระบบได้" ซึ่งหาสาเหตุไม่ได้
 */
function parseApiResponse(res, fnName) {
  return res.text().then(function(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      var detail = extractAppsScriptError(text);
      console.error('[API] Backend ไม่ได้ตอบเป็น JSON [' + fnName + ']:', detail || text.substring(0, 500));
      var err = new Error(detail || 'Google Apps Script ไม่ได้ตอบกลับเป็นข้อมูล JSON');
      err.isBackendError = true;
      throw err;
    }
  });
}

/** extractAppsScriptError — ดึงข้อความ error ออกจากหน้า HTML ที่ Apps Script ส่งกลับมา */
function extractAppsScriptError(html) {
  if (!html) return '';
  var text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  // โค้ดฝั่งหน้าเว็บถูกนำไปวางใน Apps Script (อาการที่เจอบ่อยที่สุด)
  if (/localStorage|document|window is not defined/i.test(text)) {
    return 'ดูเหมือนโค้ดที่วางไว้ใน Google Apps Script เป็นไฟล์ฝั่งหน้าเว็บ (app.js) '
         + 'กรุณานำเนื้อหาไฟล์ code.gs ไปวางแทน แล้ว Deploy ใหม่ — รายละเอียด: ' + text.substring(0, 200);
  }
  if (/ต้องได้รับสิทธิ|need(s)? permission|authoriz|ServiceLogin|Sign in/i.test(text)) {
    return 'Google Apps Script ยังไม่เปิดสิทธิ์ให้เข้าถึงแบบสาธารณะ '
         + 'กรุณา Deploy ใหม่โดยตั้ง Who has access = Anyone';
  }
  return text.substring(0, 250);
}

function newRequestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** apiRequest — ส่งคำขอ 1 รอบ (ไม่ลองซ้ำ) คืนข้อมูล JSON หรือ reject เมื่อเชื่อมต่อ/อ่านคำตอบไม่ได้ */
function apiRequest(fnName, args, rid, timeoutMs) {
  var ctrl  = (timeoutMs && window.AbortController) ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, timeoutMs) : null;
  var query = 'fn=' + encodeURIComponent(fnName) + '&args=' + encodeURIComponent(JSON.stringify(args))
            + (rid ? '&rid=' + encodeURIComponent(rid) : '');
  var req = API_POST_FUNCTIONS[fnName]
    ? fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: query,
        signal: ctrl ? ctrl.signal : undefined
      })
    : fetch(APPS_SCRIPT_URL + '?' + query, { method: 'GET', mode: 'cors', signal: ctrl ? ctrl.signal : undefined });

  return req.then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseApiResponse(res, fnName);
  }).then(function(data) {
    if (timer) clearTimeout(timer);
    return data;
  }, function(err) {
    if (timer) clearTimeout(timer);
    throw err;
  });
}

/**
 * callReadAPI — คำสั่งอ่าน: ถ้ารอบแรกยังไม่ตอบใน API_HEDGE_MS จะส่งซ้ำอีกชุดแล้วใช้คำตอบที่มาถึงก่อน
 * และถ้ารอบไหนล้มเหลวจะลองใหม่ให้เอง รวมไม่เกิน API_MAX_ATTEMPTS รอบ
 */
function callReadAPI(fnName, args) {
  return new Promise(function(resolve, reject) {
    var started = 0, failed = 0, done = false, lastErr = null, hedgeTimer = null;

    function launch() {
      if (done || started >= API_MAX_ATTEMPTS) return;
      started++;
      apiRequest(fnName, args, '', API_READ_TIMEOUT).then(function(data) {
        if (done) return;
        done = true;
        clearTimeout(hedgeTimer);
        resolve(data);
      }, function(err) {
        if (done) return;
        failed++;
        lastErr = err;
        console.warn('[API] ' + fnName + ' รอบที่ ' + failed + ' ไม่สำเร็จ:', err && err.message);
        if (started < API_MAX_ATTEMPTS) { setTimeout(launch, API_RETRY_DELAY_MS); return; }
        if (failed >= started) {
          done = true;
          clearTimeout(hedgeTimer);
          reject(lastErr);
        }
      });
    }

    launch();
    hedgeTimer = setTimeout(launch, API_HEDGE_MS);
  });
}

/**
 * callWriteAPI — คำสั่งเขียน: ส่งทีละรอบ ถ้าเชื่อมต่อ/อ่านคำตอบไม่ได้จะลองใหม่ด้วย rid เดิม
 * backend (runOnce) ใช้ rid ตัดสินว่าเป็นคำขอเดิม จึงไม่ทำรายการซ้ำแม้รอบแรกจะทำงานไปแล้ว
 * ถ้า backend ยังไม่รองรับ rid จะไม่ลองใหม่เอง เพราะเสี่ยงบันทึกซ้ำ
 */
function callWriteAPI(fnName, args) {
  var rid = newRequestId();
  var attempt = 0;
  function run() {
    attempt++;
    return apiRequest(fnName, args, rid).catch(function(err) {
      console.warn('[API] ' + fnName + ' รอบที่ ' + attempt + ' ไม่สำเร็จ:', err && err.message);
      if (!_apiIdempotent || attempt >= API_MAX_ATTEMPTS) throw err;
      return new Promise(function(r){ setTimeout(r, API_RETRY_DELAY_MS * attempt); }).then(run);
    });
  }
  return run().then(function(data) {
    // แจ้งหน้าเว็บว่ามีการเขียนข้อมูล (ใช้ล้างข้อมูลที่แคชไว้ฝั่งหน้าเว็บ)
    if (typeof window.onApiWrite === 'function') { try { window.onApiWrite(fnName, data); } catch (e) {} }
    return data;
  });
}

function callAPI(fnName) {
  var args = Array.prototype.slice.call(arguments, 1);
  var call = API_READ_FUNCTIONS[fnName] ? callReadAPI(fnName, args) : callWriteAPI(fnName, args);
  return call.catch(function(err) {
    console.error('API Error [' + fnName + ']:', err);
    if (window._mockAPI && window._mockAPI[fnName]) {
      return Promise.resolve(window._mockAPI[fnName].apply(null, args));
    }
    throw err;
  });
}

// Helper: แปลง file_id เป็น URL สำหรับแสดงรูป
function getFileDataUrl(fileId) {
  if (!fileId) return '';
  if (String(fileId).indexOf('http') === 0) return fileId;
  return 'https://lh5.googleusercontent.com/d/' + fileId;
}
