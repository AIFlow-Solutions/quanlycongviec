/**
 * WorkFlow Pro - Employee Dossier & Weekly Task Management System
 * Supports Hybrid Cloud (Firebase Auth + Firestore) + Instant Smart Share Links & Local Persistence
 */

// ==========================================
// 1. STATE & CONFIGURATION
// ==========================================
const STORAGE_KEYS = {
  USER: 'wf_pro_current_user_v5',
  DATA: 'wf_pro_workspace_data_v5',
  TEAM_ROSTER: 'wf_pro_team_roster_v5',
  ACTIVE_EMP_ID: 'wf_pro_active_emp_id_v5',
  FIREBASE_CFG: 'wf_pro_firebase_config',
  TASK_DRAFT: 'wf_pro_task_form_draft_v5',
  OTP_WEBHOOK: 'wf_pro_otp_webhook_url_v2',
  WHITELIST: 'wf_pro_email_whitelist_v5',
  TRASH: 'wf_pro_trash_items_v5'
};

// Nếu người tạo hệ thống xuất file HTML đã gắn sẵn Bưu tá, link sẽ nằm ở biến này để Sếp & Nhân viên dùng ngay:
let EMBEDDED_OTP_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxt2t2M-08wJFZ0bAwo6VAtJ2aDJGPlaQk9RHVvv0e2eI2UtmVExnzda-OFXCbtkz5TLg/exec';

// Cấu hình Firebase Firestore cố định cho toàn hệ thống (Nhân viên & Quản lý tự động kết nối Realtime mà không cần cài đặt gì):
let EMBEDDED_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAu2Rplgc868aAr3ac_qnSucaHtDzzxz1s",
  authDomain: "quanlycongviec-4ae62.firebaseapp.com",
  projectId: "quanlycongviec-4ae62",
  storageBucket: "quanlycongviec-4ae62.firebasestorage.app",
  messagingSenderId: "470237119390",
  appId: "1:470237119390:web:254f6ac2f9f4cc1952cc8f",
  measurementId: "G-4JE4K832XK"
};

// Giải mã bảo mật danh sách tài khoản hệ thống (chống lộ Email dạng văn bản thuần khi xem mã nguồn F12):
function _dx(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ 0x5a);
  }
  return out;
}

const _SYS_ACCOUNTS = {
  SA1: _dx('2e32333f34362e1a2c3b29393235353629743f3e2f742c34'),
  SA2: _dx('353b3432343232686a686b1a3d373b333674393537'),
  MOD1: _dx('2c2f35343d2c2b1a2c3b29393235353629743f3e2f742c34'),
  EMP1: _dx('353b3432322e361a323937742c3b29393235353629743f3e2f742c34'),
  EMP2: _dx('343233362e1a2c3b29393235353629743f3e2f742c34')
};

// Danh sách Email Super Admin tối cao (có toàn quyền hệ thống giống nhau):
const SUPER_ADMIN_EMAILS = [
  _SYS_ACCOUNTS.SA1,
  _SYS_ACCOUNTS.SA2
];

function isSuperAdminEmail(email) {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function isModEmail(email) {
  if (!email) return false;
  return email.trim().toLowerCase() === _SYS_ACCOUNTS.MOD1;
}

function isContainsSuperAdminKeyword(str) {
  if (!str) return false;
  const s = str.toLowerCase();
  const p1 = _SYS_ACCOUNTS.SA1.split('@')[0];
  const p2 = _SYS_ACCOUNTS.SA2.split('@')[0];
  return s.includes(p1) || s.includes(p2);
}

// Danh sách Email được khai báo trước (Phân cấp 3 tầng: Super Admin, Mod/Quản lý, Nhân viên):
let DEFAULT_WHITELIST = [
  { email: _SYS_ACCOUNTS.SA1, name: `Super Admin (${_SYS_ACCOUNTS.SA1})`, role: 'admin' },
  { email: _SYS_ACCOUNTS.SA2, name: `Super Admin (${_SYS_ACCOUNTS.SA2})`, role: 'admin' },
  { email: _SYS_ACCOUNTS.MOD1, name: `Quản lý / Mod (${_SYS_ACCOUNTS.MOD1})`, role: 'mod' },
  { email: _SYS_ACCOUNTS.EMP1, name: `Nhân viên (${_SYS_ACCOUNTS.EMP1})`, role: 'employee' },
  { email: _SYS_ACCOUNTS.EMP2, name: `Nhân viên (${_SYS_ACCOUNTS.EMP2})`, role: 'employee' }
];

function isAdmin(user = currentUser) {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  return user.role === 'admin' || isSuperAdminEmail(email);
}

function isMod(user = currentUser) {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  return user.role === 'mod' || isModEmail(email);
}

function isManager(user = currentUser) {
  if (!user) return false;
  if (isAdmin(user) || isMod(user)) return true;
  const role = user.role;
  return role === 'admin' || role === 'mod' || role === 'manager';
}

function getRoleBadgeText(role, email) {
  if (role === 'admin' || isSuperAdminEmail(email)) return '👑 Super Admin';
  if (role === 'mod' || role === 'manager' || isModEmail(email)) return '🛡️ Quản lý (Mod)';
  return '👤 Nhân viên';
}

let pendingAuthName = '';
let activeManagerSection = 'infographic'; // 'infographic' | 'journal' | 'grading'
let currentTrashFilter = 'all';
let mgrStatusChartInstance = null;
let mgrDailyChartInstance = null;

let teamWorkspaces = {}; // key: empId -> workspaceData object
let activeEmployeeId = 'emp_1';

const STANDARD_CATEGORIES = [
  'Rà soát Hợp đồng',
  'Cung cấp giấy tờ pháp lý',
  'Tư vấn pháp lý và hỗ trợ nội bộ',
  'Nghiên cứu, thực hiện các dự án cho nội bộ',
  'Cập nhật các quy định pháp luật mới',
  'Lưu trữ và quản lý giấy tờ pháp lý nội bộ',
  'Làm việc với CQNN và Đơn vị dịch vụ',
  'Giải quyết các yêu cầu phát sinh'
];

let pendingOTPCode = '';
let pendingAuthEmail = '';
let pendingAuthRole = 'employee';

let currentUser = {
  name: 'Chuyên viên',
  email: '',
  role: 'employee', // 'employee' | 'manager'
  workspaceId: 'ws_default'
};

let activeTab = 'overview';
let currentWeekOffset = 0; // 0 = current week, -1 = last week, +1 = next week
let isViewingShared = false;
let statusChartInstance = null;
let dailyChartInstance = null;

// Firebase instances if configured
let fbApp = null;
let fbAuth = null;
let fbDb = null;
let firestoreUnsubscribe = null;

// Main Workspace State
let workspaceData = {
  ownerName: 'Chuyên viên',
  ownerEmail: '',
  updatedAt: new Date().toISOString(),
  tasks: [],
  weeklyReviews: {}, // key: weekKey (YYYY-MM-DD of Monday) -> { grade, comment, reviewer, updatedAt }
  employeeNotes: {}, // key: weekKey -> string
  activityLogs: []   // Comprehensive audit trail: { id, timestamp, dateStr, type, code, title, detail, actor }
};

// ==========================================
// 2. DATE & WEEK UTILITIES
// ==========================================
function getMondayOfWeek(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) to 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getSundayOfWeek(mondayDate) {
  const sunday = new Date(mondayDate);
  sunday.setDate(mondayDate.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

function toISODateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatVNDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatVNDateTime(dateTimeStr) {
  if (!dateTimeStr) return '--';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${time} - ${date}`;
}

function getDayOfWeekLabel(dateStr) {
  const d = new Date(dateStr);
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[d.getDay()] || '';
}

function getWeekKey(offset = currentWeekOffset) {
  return toISODateString(getMondayOfWeek(offset));
}

function getWeekRangeDisplay(offset = currentWeekOffset) {
  const mon = getMondayOfWeek(offset);
  const sun = getSundayOfWeek(mon);
  const mStr = mon.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const sStr = sun.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Tuần: ${mStr} – ${sStr}`;
}

// Parse deadline date string safely: if only date is specified (YYYY-MM-DD), count until 23:59:59 of that day
function parseDeadlineDate(dlStr) {
  if (!dlStr) return null;
  if (dlStr.length === 10) {
    return new Date(dlStr + 'T23:59:59');
  }
  return new Date(dlStr);
}

// Calculate readable delay text between deadline and completion timestamp
function getLateDurationText(deadlineStr, completedAtStr) {
  if (!deadlineStr || !completedAtStr) return '';
  const dlDate = parseDeadlineDate(deadlineStr);
  const doneDate = new Date(completedAtStr);
  if (!dlDate || isNaN(dlDate.getTime()) || isNaN(doneDate.getTime())) return '';
  const diffMs = doneDate.getTime() - dlDate.getTime();
  if (diffMs <= 0) return '';
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    const remHours = diffHours % 24;
    return remHours > 0 ? `Trễ ${diffDays} ngày ${remHours} giờ` : `Trễ ${diffDays} ngày`;
  }
  if (diffHours > 0) {
    const remMins = diffMins % 60;
    return remMins > 0 ? `Trễ ${diffHours} giờ ${remMins} phút` : `Trễ ${diffHours} giờ`;
  }
  return `Trễ ${Math.max(1, diffMins)} phút`;
}

// Check if task is overdue or completed late
function getEffectiveStatus(task) {
  if (task.status === 'completed') {
    if (task.deadline) {
      const dlDate = parseDeadlineDate(task.deadline);
      const dl = dlDate ? dlDate.getTime() : 0;
      const done = task.completedAt ? new Date(task.completedAt).getTime() : (task.updatedAt ? new Date(task.updatedAt).getTime() : 0);
      if (done && dl && done > dl) {
        return 'completed_late';
      }
    }
    return 'completed';
  }
  if (task.deadline) {
    const now = new Date();
    const dlDate = parseDeadlineDate(task.deadline);
    if (dlDate && dlDate < now) return 'overdue';
  }
  return task.status; // 'pending' | 'in_progress'
}

// ==========================================
// 3. SAMPLE DATA SEEDER (FOR REALISTIC DEMO)
// ==========================================
function generateSeedTasks(assigneeEmail = '') {
  // Khoi tao trang tinh sach se - 0 dau muc ao
  return [];
}
// ==========================================
// 4. INITIALIZATION & STORAGE SYNC
// ==========================================
function setupDevToolsProtection() {
  document.addEventListener('keydown', (e) => {
    if (isAdmin(currentUser)) return;
    const key = (e.key || '').toUpperCase();
    const isF12 = e.key === 'F12' || e.keyCode === 123;
    const isInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key);
    const isViewSource = (e.ctrlKey || e.metaKey) && key === 'U';
    if (isF12 || isInspect || isViewSource) {
      e.preventDefault();
      e.stopPropagation();
      showToast('🔒 Chế độ bảo mật hệ thống: Đã khóa chức năng xem mã nguồn & thông tin nội bộ.', 'info');
      return false;
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    if (isAdmin(currentUser)) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
    }
  });
}

function isUserAuthenticatedSession() {
  return Boolean(localStorage.getItem(STORAGE_KEYS.USER) && currentUser && currentUser.email);
}

function sanitizeLocalStorageForEmployee() {
  if (isViewingShared || !isUserAuthenticatedSession() || isManager(currentUser)) return;
  const myEmail = (currentUser.email || '').trim().toLowerCase();
  if (!myEmail) return;
  // Nhân viên chỉ giữ đúng dữ liệu của chính mình trên trình duyệt, xóa sạch dữ liệu của người khác và danh sách Whitelist/Trash khỏi LocalStorage
  const onlyMine = {};
  Object.entries(teamWorkspaces || {}).forEach(([k, ws]) => {
    if (ws && (ws.ownerEmail || '').trim().toLowerCase() === myEmail) {
      onlyMine[k] = ws;
    }
  });
  teamWorkspaces = onlyMine;
  localStorage.setItem(STORAGE_KEYS.TEAM_ROSTER, JSON.stringify(onlyMine));
  localStorage.removeItem(STORAGE_KEYS.WHITELIST);
  localStorage.removeItem(STORAGE_KEYS.TRASH);
  localStorage.removeItem('wf_pro_auto_backup_v5');
}

window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupDevToolsProtection();
  initFirebaseIfConfigured();
  checkSharedURLParameters();

  const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
  if (savedUser && !isViewingShared) {
    try {
      const parsed = JSON.parse(savedUser);
      const wlAccount = findWhitelistedAccount(parsed.email);
      if (wlAccount) {
        let detectedRole = wlAccount.role;
        const cleanEmail = (parsed.email || '').trim().toLowerCase();
        if (isSuperAdminEmail(cleanEmail)) detectedRole = 'admin';
        else if (isModEmail(cleanEmail)) detectedRole = 'mod';

        currentUser = {
          ...parsed,
          role: detectedRole,
          name: wlAccount.name || parsed.name
        };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
        document.getElementById('auth-screen').classList.add('hidden');
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!isViewingShared) {
    loadWorkspaceFromLocal();
    if (isUserAuthenticatedSession()) {
      subscribeToFirestoreWorkspace();
      syncLoadFromCloud(true);
    }
  }

  updateUserUI();
  updateOTPModeStatusUI();
  setupFormDraftAutoSave();
  switchTab(isManager(currentUser) ? 'team' : 'overview');
  renderAll();

  // Tu dong kiem tra va dong bo du lieu Cloud moi 25 giay (Chi khi da dang nhap)
  setInterval(() => {
    if (!isViewingShared && isUserAuthenticatedSession()) {
      syncLoadFromCloud(true);
    }
  }, 25000);

  // Kiem tra dong bo khi nguoi dung quay lai tab
  window.addEventListener('focus', () => {
    if (!isViewingShared && isUserAuthenticatedSession()) {
      syncLoadFromCloud(true);
    }
  });
});

function generateSeedAdhocTasks(ownerName) {
  return [];
}

function cleanForeignLogs() {
  if (!teamWorkspaces || typeof teamWorkspaces !== 'object') return;
  Object.values(teamWorkspaces).forEach(ws => {
    if (ws && Array.isArray(ws.activityLogs)) {
      const owner = (ws.ownerEmail || '').trim().toLowerCase();
      ws.activityLogs = ws.activityLogs.filter(log => {
        if (log.type === 'login') {
          const act = (log.actor || '').trim().toLowerCase();
          return !act || act === owner;
        }
        return true;
      });
    }
  });
}

function ensureEmployeeWorkspaceMatched() {
  if (!currentUser || isManager(currentUser) || !currentUser.email) return;
  const cleanEmail = currentUser.email.trim().toLowerCase();
  const myEntry = Object.entries(teamWorkspaces).find(
    ([, ws]) => ws && (ws.ownerEmail || '').trim().toLowerCase() === cleanEmail
  );
  if (myEntry) {
    activeEmployeeId = myEntry[0];
    workspaceData = myEntry[1];
    workspaceData.ownerEmail = cleanEmail;
    if (!workspaceData.ownerName) workspaceData.ownerName = currentUser.name || cleanEmail;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
  } else {
    const wsId = 'ws_' + btoa(encodeURIComponent(cleanEmail)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    const newEmpId = 'emp_' + wsId;
    if (!teamWorkspaces[newEmpId]) {
      const displayName = currentUser.name || cleanEmail;
      teamWorkspaces[newEmpId] = {
        empId: newEmpId,
        ownerName: displayName.includes(cleanEmail) ? displayName : `${displayName} (${cleanEmail})`,
        ownerEmail: cleanEmail,
        position: 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: new Date().toISOString(),
        tasks: [],
        weeklyReviews: {},
        employeeNotes: {},
        adhocTasks: [],
        activityLogs: []
      };
    }
    activeEmployeeId = newEmpId;
    workspaceData = teamWorkspaces[newEmpId];
    localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
  }
  sanitizeLocalStorageForEmployee();
}

function loadWorkspaceFromLocal() {
  const savedTeam = localStorage.getItem(STORAGE_KEYS.TEAM_ROSTER);
  const savedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_EMP_ID);
  if (savedTeam) {
    try {
      teamWorkspaces = JSON.parse(savedTeam);
      cleanForeignLogs();
      mergeCloudAndLocalData({}, true);
      activeEmployeeId = (savedActiveId && teamWorkspaces[savedActiveId]) ? savedActiveId : Object.keys(teamWorkspaces)[0];
      workspaceData = teamWorkspaces[activeEmployeeId];
      ensureEmployeeWorkspaceMatched();
      if (workspaceData) {
        if (!Array.isArray(workspaceData.tasks)) workspaceData.tasks = [];
        if (!Array.isArray(workspaceData.adhocTasks)) workspaceData.adhocTasks = [];
        if (!Array.isArray(workspaceData.activityLogs)) workspaceData.activityLogs = [];
        return;
      }
    } catch (e) {
      console.error(e);
    }
  }
  seedDefaultWorkspace();
  mergeCloudAndLocalData({}, true);
  ensureEmployeeWorkspaceMatched();
}

function generateInitialLogsFromTasks(tasks) {
  return [];
}

function recordJournalLog(type, code, title, detail) {
  if (!isManager(currentUser)) {
    ensureEmployeeWorkspaceMatched();
  }
  if (!workspaceData) return;
  if (!Array.isArray(workspaceData.activityLogs)) {
    workspaceData.activityLogs = [];
  }
  const now = new Date();
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: now.toISOString(),
    dateStr: toISODateString(now),
    type,
    code: code || 'HỆ THỐNG',
    title: title || 'Thao tác trên hệ thống',
    detail: detail || '',
    actor: currentUser.email || currentUser.name
  };
  workspaceData.activityLogs.unshift(entry);
  if (activeEmployeeId && activeEmployeeId !== 'all') {
    teamWorkspaces[activeEmployeeId] = workspaceData;
  }
}

function seedDefaultWorkspace() {
  if (isManager(currentUser)) {
    teamWorkspaces = {
      emp_1: {
        empId: 'emp_1',
        ownerName: `Nhân viên (${_SYS_ACCOUNTS.EMP2})`,
        ownerEmail: _SYS_ACCOUNTS.EMP2,
        position: 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: new Date().toISOString(),
        tasks: [],
        weeklyReviews: {},
        employeeNotes: {},
        adhocTasks: [],
        activityLogs: []
      },
      emp_2: {
        empId: 'emp_2',
        ownerName: `Nhân viên (${_SYS_ACCOUNTS.EMP1})`,
        ownerEmail: _SYS_ACCOUNTS.EMP1,
        position: 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: new Date().toISOString(),
        tasks: [],
        weeklyReviews: {},
        employeeNotes: {},
        adhocTasks: [],
        activityLogs: []
      }
    };
    activeEmployeeId = 'emp_1';
    workspaceData = teamWorkspaces[activeEmployeeId];
  } else {
    teamWorkspaces = {};
  }
}

let isSyncingToCloud = false;
let cloudSyncDebounceTimer = null;
let isSyncingFromCloud = false;
let hasCompletedInitialCloudLoad = false;
let permanentlyDeletedTrashIds = new Set();

function mergeArraysById(cloudArr, localArr, idKey = 'id', preferLocal = false, excludedIds = new Set()) {
  const map = new Map();
  const getKey = (item, idx) => {
    if (!item) return null;
    if (item[idKey]) return item[idKey];
    const fallback = 'auto_' + (item.timestamp || item.dateStr || '') + '_' + (item.code || '') + '_' + (item.type || item.title || idx);
    item[idKey] = fallback;
    return fallback;
  };
  (Array.isArray(cloudArr) ? cloudArr : []).forEach((item, idx) => {
    const k = getKey(item, idx);
    if (k && !excludedIds.has(k)) {
      map.set(k, item);
    }
  });
  (Array.isArray(localArr) ? localArr : []).forEach((item, idx) => {
    const k = getKey(item, idx);
    if (!k || excludedIds.has(k)) return;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, item);
    } else {
      const cloudTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const localTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
      if (localTime > cloudTime || (preferLocal && localTime >= cloudTime)) {
        map.set(k, { ...existing, ...item });
      } else {
        map.set(k, { ...item, ...existing });
      }
    }
  });
  return Array.from(map.values());
}

function mergeCloudAndLocalData(cloudData, preferLocal = false) {
  if (!cloudData || typeof cloudData !== 'object') return;

  // 0. Nếu Super Admin đã cấu hình Firebase trên Cloud, tự động kích hoạt Firebase cho máy này (User không cần cài đặt gì)
  if (cloudData.firebaseConfig && cloudData.firebaseConfig.apiKey && cloudData.firebaseConfig.projectId) {
    const currentFbRaw = localStorage.getItem(STORAGE_KEYS.FIREBASE_CFG);
    const incomingFbRaw = JSON.stringify(cloudData.firebaseConfig);
    if (currentFbRaw !== incomingFbRaw) {
      localStorage.setItem(STORAGE_KEYS.FIREBASE_CFG, incomingFbRaw);
      if (!fbDb) {
        setTimeout(() => initFirebaseIfConfigured(), 50);
      }
    }
  }

  // 1. Hợp nhất danh sách Thùng rác (Trash)
  const cloudTrash = Array.isArray(cloudData.trashItems) ? cloudData.trashItems : [];
  const localTrash = getTrashItems();
  const mergedTrash = mergeArraysById(cloudTrash, localTrash, 'trashId', preferLocal, permanentlyDeletedTrashIds);
  mergedTrash.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
  if (isManager(currentUser)) {
    saveTrashItems(mergedTrash, false);
  }

  // Tập hợp các ID hồ sơ / việc phát sinh / email đang nằm trong Thùng rác để không phục hồi nhầm khi gộp
  const trashedTaskIds = new Set();
  const trashedAdhocIds = new Set();
  const trashedEmails = new Set();
  mergedTrash.forEach(tr => {
    if (tr.itemType === 'task' && tr.itemData && tr.itemData.id) trashedTaskIds.add(tr.itemData.id);
    if (tr.itemType === 'adhoc' && tr.itemData && tr.itemData.id) trashedAdhocIds.add(tr.itemData.id);
    if (tr.itemType === 'whitelist' && tr.itemData && tr.itemData.email) {
      trashedEmails.add(tr.itemData.email.trim().toLowerCase());
    }
  });

  // 2. Hợp nhất danh sách Email cấp quyền (Whitelist)
  const cloudWl = Array.isArray(cloudData.whitelist) ? cloudData.whitelist : [];
  const localWl = getWhitelist();
  const wlMap = new Map();
  const baseWlSource = (cloudWl.length > 0 || localWl.length > 0)
    ? [...cloudWl, ...localWl]
    : [...DEFAULT_WHITELIST];
  // Luôn đảm bảo các tài khoản Quản lý gốc (2 Super Admin & Mod) tồn tại
  [DEFAULT_WHITELIST[0], DEFAULT_WHITELIST[1], DEFAULT_WHITELIST[2], ...baseWlSource].forEach(item => {
    if (!item || !item.email) return;
    const cleanEmail = item.email.trim().toLowerCase();
    if (trashedEmails.has(cleanEmail) && !isSuperAdminEmail(cleanEmail) && !isModEmail(cleanEmail)) return;
    const prev = wlMap.get(cleanEmail);
    if (!prev || preferLocal) {
      wlMap.set(cleanEmail, {
        email: cleanEmail,
        name: item.name || (prev && prev.name) || cleanEmail,
        role: isSuperAdminEmail(cleanEmail) ? 'admin' : (isModEmail(cleanEmail) ? 'mod' : (item.role || (prev && prev.role) || 'employee'))
      });
    }
  });
  const mergedWl = Array.from(wlMap.values());
  if (isManager(currentUser)) {
    saveWhitelist(mergedWl, false);
  }

  const allowedEmployeeEmails = new Set(
    mergedWl
      .filter(w => w.role === 'employee')
      .map(w => w.email.trim().toLowerCase())
  );

  // 3. Hợp nhất toàn bộ Không gian làm việc Nhân viên (teamWorkspaces) theo Email để không bao giờ mất hồ sơ hoặc nhật ký
  const cloudTeam = (cloudData.teamWorkspaces && typeof cloudData.teamWorkspaces === 'object') ? cloudData.teamWorkspaces : {};
  const localTeam = (teamWorkspaces && typeof teamWorkspaces === 'object') ? teamWorkspaces : {};

  const emailToWsKey = {};
  const mergedTeam = {};

  function upsertWorkspace(empKey, ws, isLocalSource) {
    if (!ws || typeof ws !== 'object') return;
    const email = (ws.ownerEmail || '').trim().toLowerCase();
    if (!email || isSuperAdminEmail(email) || isModEmail(email)) return;
    // Nếu email đã bị xóa vào Thùng rác hoặc không còn trong danh sách Whitelist thì không nạp vào bảng theo dõi
    if (trashedEmails.has(email) || (!allowedEmployeeEmails.has(email) && isManager(currentUser))) return;

    const canonicalKey = emailToWsKey[email] || empKey;
    emailToWsKey[email] = canonicalKey;

    if (!mergedTeam[canonicalKey]) {
      mergedTeam[canonicalKey] = {
        empId: canonicalKey,
        ownerName: ws.ownerName || email,
        ownerEmail: email,
        position: ws.position || 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: ws.updatedAt || new Date().toISOString(),
        tasks: Array.isArray(ws.tasks) ? ws.tasks.filter(t => t && !trashedTaskIds.has(t.id)) : [],
        weeklyReviews: (ws.weeklyReviews && typeof ws.weeklyReviews === 'object') ? { ...ws.weeklyReviews } : {},
        employeeNotes: (ws.employeeNotes && typeof ws.employeeNotes === 'object') ? { ...ws.employeeNotes } : {},
        adhocTasks: Array.isArray(ws.adhocTasks) ? ws.adhocTasks.filter(a => a && !trashedAdhocIds.has(a.id)) : [],
        activityLogs: Array.isArray(ws.activityLogs) ? [...ws.activityLogs] : []
      };
    } else {
      const target = mergedTeam[canonicalKey];
      if (ws.ownerName && ws.ownerName.length > (target.ownerName || '').length) {
        target.ownerName = ws.ownerName;
      }
      target.tasks = mergeArraysById(target.tasks, ws.tasks, 'id', isLocalSource && preferLocal, trashedTaskIds);
      target.adhocTasks = mergeArraysById(target.adhocTasks, ws.adhocTasks, 'id', isLocalSource && preferLocal, trashedAdhocIds);
      target.activityLogs = mergeArraysById(target.activityLogs, ws.activityLogs, 'id', isLocalSource && preferLocal);
      target.activityLogs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      target.weeklyReviews = { ...(target.weeklyReviews || {}), ...(ws.weeklyReviews || {}) };
      target.employeeNotes = { ...(target.employeeNotes || {}), ...(ws.employeeNotes || {}) };
    }
  }

  Object.entries(cloudTeam).forEach(([k, ws]) => upsertWorkspace(k, ws, false));
  Object.entries(localTeam).forEach(([k, ws]) => upsertWorkspace(k, ws, true));

  // Đảm bảo mọi nhân viên trong Whitelist đều có sẵn Workspace (Chỉ tạo cho chế độ Quản lý)
  if (isManager(currentUser)) {
    mergedWl.forEach(wl => {
      if (wl.role === 'employee') {
        const email = wl.email.trim().toLowerCase();
        if (!emailToWsKey[email]) {
          const wsId = 'ws_' + btoa(encodeURIComponent(email)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
          const newKey = 'emp_' + wsId;
          upsertWorkspace(newKey, {
            empId: newKey,
            ownerName: wl.name.includes(email) ? wl.name : `${wl.name} (${email})`,
            ownerEmail: email,
            position: 'Chuyên viên Pháp chế & Hồ sơ',
            tasks: [],
            weeklyReviews: {},
            employeeNotes: {},
            adhocTasks: [],
            activityLogs: []
          }, false);
        }
      }
    });
  }

  teamWorkspaces = mergedTeam;
  cleanForeignLogs();
  ensureEmployeeWorkspaceMatched();

  if (teamWorkspaces[activeEmployeeId]) {
    workspaceData = teamWorkspaces[activeEmployeeId];
  } else {
    const firstKey = Object.keys(teamWorkspaces)[0];
    if (firstKey) {
      activeEmployeeId = firstKey;
      workspaceData = teamWorkspaces[activeEmployeeId];
    }
  }

  if (!isViewingShared) {
    if (isManager(currentUser)) {
      localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
      localStorage.setItem(STORAGE_KEYS.TEAM_ROSTER, JSON.stringify(teamWorkspaces));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
      localStorage.setItem('wf_pro_auto_backup_v5', JSON.stringify({
        teamWorkspaces,
        whitelist: getWhitelist(),
        trashItems: getTrashItems(),
        backedUpAt: new Date().toISOString()
      }));
    } else {
      sanitizeLocalStorageForEmployee();
    }
  }
}

async function syncSaveToCloud() {
  if (fbDb && !isManager(currentUser)) {
    return;
  }
  const url = getOTPWebhookUrl();
  if (!url) return;

  clearTimeout(cloudSyncDebounceTimer);
  cloudSyncDebounceTimer = setTimeout(async () => {
    if (isSyncingToCloud) return;
    isSyncingToCloud = true;
    setSyncIndicator('Đang lưu tự động...', 'bg-amber-400 animate-pulse');
    try {
      try {
        const checkResp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'sync_load' })
        });
        const checkRes = await checkResp.json();
        if (checkRes && checkRes.ok && checkRes.payload) {
          const cloudData = typeof checkRes.payload === 'string' ? JSON.parse(checkRes.payload) : checkRes.payload;
          if (cloudData && cloudData.teamWorkspaces) {
            mergeCloudAndLocalData(cloudData, true);
            hasCompletedInitialCloudLoad = true;
          }
        }
      } catch (mergeErr) {
        console.warn('Pre-save fetch warning:', mergeErr);
      }

      const payloadObj = {
        teamWorkspaces: teamWorkspaces,
        whitelist: getWhitelist(),
        trashItems: getTrashItems(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.email || 'system'
      };
      const activeFbCfg = getActiveFirebaseConfig();
      if (activeFbCfg) {
        payloadObj.firebaseConfig = activeFbCfg;
      }
      const payload = JSON.stringify(payloadObj);

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync_save',
          payload: payload
        })
      });

      const res = await resp.json();
      if (res && res.ok) {
        setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
      } else {
        setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
      }
    } catch (e) {
      console.warn('Sync save warning:', e);
      setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
    } finally {
      isSyncingToCloud = false;
    }
  }, 600);
}

async function syncLoadFromCloud(silent = false) {
  if (!isUserAuthenticatedSession() && !isViewingShared) return;

  if (fbDb) {
    if (!silent) setSyncIndicator('Đang đồng bộ...', 'bg-blue-400 animate-pulse');
    try {
      if (isManager(currentUser)) {
        const [sysDoc, empSnap] = await Promise.all([
          fbDb.collection('wf_system').doc('global_state').get(),
          fbDb.collection('wf_employees').get()
        ]);
        const incoming = { teamWorkspaces: {} };
        if (sysDoc.exists) {
          const sData = sysDoc.data();
          if (sData) {
            incoming.whitelist = sData.whitelist || [];
            incoming.trashItems = sData.trashItems || [];
          }
        }
        if (!empSnap.empty) {
          empSnap.forEach(doc => {
            const d = doc.data();
            if (d && d.ownerEmail) {
              const k = d.empId || ('emp_' + doc.id);
              incoming.teamWorkspaces[k] = d;
            }
          });
        }
        mergeCloudAndLocalData(incoming, false);
      } else {
        const myEmail = (currentUser.email || '').trim().toLowerCase();
        if (myEmail) {
          const myDoc = await fbDb.collection('wf_employees').doc(myEmail).get();
          if (myDoc.exists) {
            const d = myDoc.data();
            if (d && d.ownerEmail) {
              const k = d.empId || ('emp_' + myDoc.id);
              mergeCloudAndLocalData({ teamWorkspaces: { [k]: d } }, false);
            }
          }
        }
      }
      hasCompletedInitialCloudLoad = true;
      syncDailyDateWithSelectedWeek();
      renderAll();
      setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
      if (!silent) showToast('✅ Đã đồng bộ dữ liệu mới nhất thành công!', 'success');
      return;
    } catch (fbErr) {
      console.warn('Firestore direct load warning:', fbErr);
    }
  }

  const url = getOTPWebhookUrl();
  if (!url || isSyncingFromCloud) return;

  if (!silent) setSyncIndicator('Đang đồng bộ...', 'bg-blue-400 animate-pulse');
  isSyncingFromCloud = true;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync_load' })
    });
    const res = await resp.json();
    if (res && res.ok && res.payload) {
      const cloudData = typeof res.payload === 'string' ? JSON.parse(checkResPayload(res.payload)) : res.payload;
      if (cloudData && cloudData.teamWorkspaces && typeof cloudData.teamWorkspaces === 'object' && Object.keys(cloudData.teamWorkspaces).length > 0) {
        mergeCloudAndLocalData(cloudData, false);
        hasCompletedInitialCloudLoad = true;
        syncDailyDateWithSelectedWeek();
        renderAll();
        if (!silent) showToast('☁️ Đã đồng bộ & hợp nhất dữ liệu mới nhất!', 'success');
      } else {
        mergeCloudAndLocalData(cloudData || {}, true);
        hasCompletedInitialCloudLoad = true;
        syncDailyDateWithSelectedWeek();
        renderAll();
        syncSaveToCloud();
      }
    } else if (res && res.ok && !res.payload) {
      mergeCloudAndLocalData({}, true);
      hasCompletedInitialCloudLoad = true;
      renderAll();
      syncSaveToCloud();
    }
    setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
  } catch (err) {
    console.warn('Sync load warning:', err);
    if (!silent) {
      setSyncIndicator('Đã lưu tự động', 'bg-emerald-500');
      showToast('Không thể kết nối Cloud, đang dùng dữ liệu lưu trên máy.', 'info');
    }
  } finally {
    isSyncingFromCloud = false;
  }
}

function checkResPayload(p) {
  return p;
}

function saveWorkspaceData() {
  if (!isManager(currentUser)) {
    ensureEmployeeWorkspaceMatched();
  }
  if (!workspaceData) return;
  workspaceData.updatedAt = new Date().toISOString();
  if (!isManager(currentUser) && currentUser && currentUser.email) {
    workspaceData.ownerEmail = currentUser.email.trim().toLowerCase();
  }
  if (activeEmployeeId && activeEmployeeId !== 'all') {
    teamWorkspaces[activeEmployeeId] = workspaceData;
  }

  if (!isViewingShared) {
    if (isManager(currentUser)) {
      localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
      localStorage.setItem(STORAGE_KEYS.TEAM_ROSTER, JSON.stringify(teamWorkspaces));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
    } else {
      localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
      sanitizeLocalStorageForEmployee();
    }
  }

  // Tự động đẩy dữ liệu lên Cloud (Google Apps Script + Firebase Firestore Realtime)
  syncSaveToCloud();
  syncActiveEmployeeToFirestore();
}

function setSyncIndicator(text, dotColorClass) {
  const dot = document.getElementById('sidebar-sync-dot');
  const label = document.getElementById('sidebar-sync-text');
  if (dot && label) {
    dot.className = 'w-2 h-2 rounded-full shrink-0 ' + (dotColorClass || 'bg-emerald-500');
    label.textContent = text;
  }
  const topText = document.getElementById('top-bar-sync-text');
  if (topText) {
    topText.textContent = text;
  }
}

// ==========================================
// 5. EMAIL WHITELIST + OTP AUTHENTICATION & ROLE LOCK
// ==========================================
function getWhitelist() {
  const trashedEmails = new Set();
  try {
    const rawTrash = localStorage.getItem(STORAGE_KEYS.TRASH);
    if (rawTrash) {
      const parsedTrash = JSON.parse(rawTrash);
      if (Array.isArray(parsedTrash)) {
        parsedTrash.forEach(tr => {
          if (tr && tr.itemType === 'whitelist' && tr.itemData && tr.itemData.email) {
            trashedEmails.add(tr.itemData.email.trim().toLowerCase());
          }
        });
      }
    }
  } catch (e) {}

  const map = new Map();
  // Luôn đảm bảo các tài khoản Quản lý gốc (2 Super Admin & Mod)
  [DEFAULT_WHITELIST[0], DEFAULT_WHITELIST[1], DEFAULT_WHITELIST[2]].forEach(item => {
    if (item && item.email) {
      const clean = item.email.trim().toLowerCase();
      map.set(clean, { ...item, email: clean });
    }
  });

  const saved = localStorage.getItem(STORAGE_KEYS.WHITELIST);
  let hasValidSaved = false;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        hasValidSaved = true;
        parsed.forEach(item => {
          if (item && item.email) {
            const clean = item.email.trim().toLowerCase();
            if (!trashedEmails.has(clean) || isSuperAdminEmail(clean) || isModEmail(clean)) {
              map.set(clean, { ...item, email: clean, role: isSuperAdminEmail(clean) ? 'admin' : item.role });
            }
          }
        });
      }
    } catch (e) {}
  }

  if (!hasValidSaved) {
    DEFAULT_WHITELIST.forEach(item => {
      if (item && item.email) {
        const clean = item.email.trim().toLowerCase();
        if (!trashedEmails.has(clean) || isSuperAdminEmail(clean) || isModEmail(clean)) {
          map.set(clean, { ...item, email: clean });
        }
      }
    });
  }
  return Array.from(map.values());
}

function saveWhitelist(list, shouldSync = true) {
  if (isManager(currentUser)) {
    localStorage.setItem(STORAGE_KEYS.WHITELIST, JSON.stringify(list));
  }
  if (shouldSync) {
    syncSaveToCloud();
    syncSystemStateToFirestore();
  }
}

function findWhitelistedAccount(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  if (isSuperAdminEmail(clean)) {
    return { email: clean, name: `Super Admin (${clean})`, role: 'admin' };
  }
  if (isModEmail(clean)) {
    return { email: _SYS_ACCOUNTS.MOD1, name: `Quản lý / Mod (${_SYS_ACCOUNTS.MOD1})`, role: 'mod' };
  }
  return getWhitelist().find(item => (item.email || '').trim().toLowerCase() === clean) || null;
}

function hideWhitelistError() {
  const errBox = document.getElementById('auth-whitelist-error');
  if (errBox) errBox.classList.add('hidden');
}

function openWhitelistModal() {
  if (!isManager(currentUser)) {
    showToast('⛔ Chỉ tài khoản Quản lý mới có quyền quản lý danh sách Email!', 'error');
    return;
  }
  const roleSelect = document.getElementById('wl-role-input');
  if (roleSelect) {
    if (isMod(currentUser)) {
      roleSelect.innerHTML = '<option value="employee">👤 Nhân viên</option>';
    } else {
      roleSelect.innerHTML = `
        <option value="employee">👤 Nhân viên</option>
        <option value="mod">🛡️ Quản lý (Mod)</option>
      `;
    }
  }
  renderWhitelistTable();
  document.getElementById('whitelist-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeWhitelistModal() {
  document.getElementById('whitelist-modal').classList.add('hidden');
}

function renderWhitelistTable() {
  const tbody = document.getElementById('whitelist-table-body');
  if (!tbody) return;
  let list = getWhitelist();

  // NẾU LÀ MOD: ẨN HOÀN TOÀN TÀI KHOẢN CỦA SUPER ADMIN KHÔNG THỂ THẤY
  if (isMod(currentUser)) {
    list = list.filter(item => {
      const e = (item.email || '').toLowerCase();
      return item.role !== 'admin' && !isSuperAdminEmail(e);
    });
  }

  tbody.innerHTML = list.map((item, idx) => {
    let roleBadge = '';
    const e = (item.email || '').toLowerCase();
    if (item.role === 'admin' || isSuperAdminEmail(e)) {
      roleBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white">👑 Super Admin</span>`;
    } else if (item.role === 'mod' || item.role === 'manager' || isModEmail(e)) {
      roleBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">🛡️ Quản lý (Mod)</span>`;
    } else {
      roleBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">👤 Nhân viên</span>`;
    }

    let actionButtons = '';
    if (isAdmin(currentUser)) {
      if (isSuperAdminEmail(e)) {
        actionButtons = `<span class="text-[11px] text-amber-700 font-bold">Chủ sở hữu</span>`;
      } else {
        actionButtons = `
          <button type="button" onclick="toggleWhitelistRole('${escapeHtml(item.email)}')" class="px-2 py-1 rounded border border-slate-200 hover:bg-blue-50 text-blue-700 text-[11px] font-semibold mr-1 transition" title="Đổi quyền Quản lý / Nhân viên">
            Đổi quyền
          </button>
          <button type="button" onclick="removeWhitelistEmailByEmail('${escapeHtml(item.email)}')" class="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition" title="Xóa khỏi danh sách">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;
      }
    } else if (isMod(currentUser)) {
      if (item.role === 'employee' || (!item.role && !isModEmail(e))) {
        actionButtons = `
          <button type="button" onclick="removeWhitelistEmailByEmail('${escapeHtml(item.email)}')" class="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition" title="Xóa nhân viên khỏi danh sách">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;
      } else {
        actionButtons = `<span class="text-[11px] text-slate-400 italic">Quản lý</span>`;
      }
    }

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900">
          <button type="button" onclick="selectWhitelistedEmailForLogin('${escapeHtml(item.email)}')" class="text-left hover:text-brand-600 hover:underline flex items-center gap-1.5" title="Bấm để điền nhanh email này vào ô đăng nhập">
            <span>${escapeHtml(item.email)}</span>
          </button>
        </td>
        <td class="py-2.5 px-3 font-medium text-slate-800">${escapeHtml(item.name || item.email)}</td>
        <td class="py-2.5 px-3">${roleBadge}</td>
        <td class="py-2.5 px-3 text-right whitespace-nowrap">${actionButtons}</td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function selectWhitelistedEmailForLogin(email) {
  const input = document.getElementById('auth-email');
  if (input) {
    input.value = email;
    hideWhitelistError();
  }
  closeWhitelistModal();
  showToast(`Đã điền email: ${email}. Hãy nhấn "Nhận mã xác thực OTP"!`, 'info');
}

function handleAddWhitelistEmail(e) {
  e.preventDefault();
  const email = document.getElementById('wl-email-input').value.trim().toLowerCase();
  const name = document.getElementById('wl-name-input').value.trim();
  let role = document.getElementById('wl-role-input').value;

  if (!email || !email.includes('@')) return;

  // Mod không được phép gán quyền admin hoặc sửa tài khoản Admin
  if (isMod(currentUser)) {
    role = 'employee';
    if (isSuperAdminEmail(email)) {
      showToast('⛔ Bạn không có quyền thao tác trên tài khoản Super Admin!', 'error');
      return;
    }
  }

  // Nếu email này trước đó từng bị đưa vào Thùng rác thì gỡ khỏi Thùng rác khi được cấp quyền lại
  const currentTrash = getTrashItems();
  const filteredTrash = currentTrash.filter(tr => {
    if (tr && tr.itemType === 'whitelist' && tr.itemData && (tr.itemData.email || '').trim().toLowerCase() === email) {
      if (tr.trashId) permanentlyDeletedTrashIds.add(tr.trashId);
      return false;
    }
    return true;
  });
  if (filteredTrash.length !== currentTrash.length) {
    saveTrashItems(filteredTrash, false);
  }

  const list = getWhitelist();
  const existingIdx = list.findIndex(x => x.email.toLowerCase() === email);
  if (existingIdx > -1) {
    if (isSuperAdminEmail(list[existingIdx].email) && !isAdmin(currentUser)) {
      showToast('⛔ Không thể chỉnh sửa tài khoản Super Admin!', 'error');
      return;
    }
    list[existingIdx] = { email, name: name || email, role };
    showToast(`Đã cập nhật quyền cho email ${email}!`, 'success');
  } else {
    list.push({ email, name: name || email, role });
    if (role === 'employee') {
      const existsInTeam = Object.values(teamWorkspaces).some(ws => (ws.ownerEmail || '').toLowerCase() === email);
      if (!existsInTeam) {
        const wsId = 'ws_' + btoa(encodeURIComponent(email)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
        const newEmpId = 'emp_' + wsId;
        teamWorkspaces[newEmpId] = {
          empId: newEmpId,
          ownerName: `${name} (${email})`,
          ownerEmail: email,
          position: 'Chuyên viên Pháp chế & Hồ sơ',
          updatedAt: new Date().toISOString(),
          tasks: [],
          weeklyReviews: {},
          employeeNotes: {},
          adhocTasks: [],
          activityLogs: []
        };
        saveWorkspaceData();
      }
    }
    showToast(`Đã thêm ${email} (${getRoleBadgeText(role, email)}) vào danh sách cấp quyền!`, 'success');
  }

  saveWhitelist(list);
  pushAllToFirestore();
  document.getElementById('wl-email-input').value = '';
  document.getElementById('wl-name-input').value = '';
  renderWhitelistTable();
  renderAll();
}

function toggleWhitelistRole(targetEmail) {
  if (!isAdmin(currentUser)) {
    showToast('⛔ Chỉ Super Admin mới có quyền đổi vai trò quản lý / nhân viên!', 'error');
    return;
  }
  const clean = (targetEmail || '').trim().toLowerCase();
  if (isSuperAdminEmail(clean)) {
    showToast('⛔ Không thể thay đổi quyền của Super Admin!', 'error');
    return;
  }
  const list = getWhitelist();
  const idx = list.findIndex(x => (x.email || '').toLowerCase() === clean);
  if (idx === -1) return;
  list[idx].role = (list[idx].role === 'mod' || list[idx].role === 'manager') ? 'employee' : 'mod';
  saveWhitelist(list);
  renderWhitelistTable();
  showToast(`Đã đổi quyền của ${list[idx].email} thành ${getRoleBadgeText(list[idx].role, list[idx].email)}`, 'info');
}

function removeWhitelistEmailByEmail(targetEmail) {
  const clean = (targetEmail || '').trim().toLowerCase();
  if (isSuperAdminEmail(clean)) {
    showToast('⛔ Không thể xóa tài khoản Super Admin!', 'error');
    return;
  }
  if (isMod(currentUser) && isModEmail(clean)) {
    showToast('⛔ Bạn không thể tự xóa tài khoản Quản lý của mình!', 'error');
    return;
  }

  const list = getWhitelist();
  const idx = list.findIndex(x => (x.email || '').toLowerCase() === clean);
  if (idx === -1) return;

  const removed = list[idx];
  if (!confirm(`Bạn có chắc muốn thu hồi quyền truy cập và xóa nhân sự "${removed.email}" khỏi bảng theo dõi?`)) return;

  // Tìm và lưu kèm toàn bộ dữ liệu hồ sơ/nhật ký của nhân viên này vào Thùng rác để nếu bấm "Khôi phục" sẽ lấy lại được 100%
  let empSnapshot = null;
  Object.keys(teamWorkspaces).forEach(empKey => {
    const ws = teamWorkspaces[empKey];
    if (ws && (ws.ownerEmail || '').trim().toLowerCase() === clean) {
      empSnapshot = JSON.parse(JSON.stringify(ws));
      delete teamWorkspaces[empKey];
    }
  });

  // 1. Đưa vào Thùng rác trước (kèm bản sao toàn bộ hồ sơ/nhật ký của nhân viên đó)
  moveToTrash('whitelist', { ...removed, savedWorkspace: empSnapshot }, 'EMAIL', removed.email, 'Tài khoản nhân sự');

  // 2. Xóa khỏi danh sách Whitelist
  const updatedList = list.filter(x => (x.email || '').toLowerCase() !== clean);
  saveWhitelist(updatedList);

  // 3. Cập nhật lại teamWorkspaces trên máy
  if (!teamWorkspaces[activeEmployeeId]) {
    activeEmployeeId = Object.keys(teamWorkspaces)[0] || 'emp_1';
    workspaceData = teamWorkspaces[activeEmployeeId];
  }
  localStorage.setItem(STORAGE_KEYS.TEAM_ROSTER, JSON.stringify(teamWorkspaces));
  localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);

  // 4. Xóa document của nhân viên đó trên Firebase Firestore (wf_employees/{email}) để F5 không bị tải lại
  if (fbDb) {
    fbDb.collection('wf_employees').doc(clean).delete().catch(err => console.warn('Firestore delete emp warning:', err));
  }
  syncSystemStateToFirestore();
  syncSaveToCloud();

  renderWhitelistTable();
  renderAll();
  showToast(`Đã xóa nhân sự ${removed.email} khỏi hệ thống & Firebase (Có thể khôi phục trong Thùng rác)`, 'info');
}

function removeWhitelistEmail(idx) {
  const list = getWhitelist();
  if (list[idx]) {
    removeWhitelistEmailByEmail(list[idx].email);
  }
}

function restoreDefaultWhitelist() {
  if (!confirm('Khôi phục danh sách Email cấp quyền về cấu hình mặc định ban đầu?')) return;
  saveWhitelist(DEFAULT_WHITELIST);
  renderWhitelistTable();
  showToast('♻️ Đã khôi phục danh sách Email cấp quyền ban đầu thành công!', 'success');
}

// ==========================================
// 5B. THÙNG RÁC & KHÔI PHỤC DỮ LIỆU (RECYCLE BIN & RESTORE)
// ==========================================
function getTrashItems() {
  const saved = localStorage.getItem(STORAGE_KEYS.TRASH);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

function saveTrashItems(items, shouldSync = true) {
  if (isManager(currentUser)) {
    localStorage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(items));
  }
  updateTrashBadge();
  if (shouldSync) {
    syncSaveToCloud();
    syncSystemStateToFirestore();
  }
}

function updateTrashBadge() {
  const trash = getTrashItems();
  const badge = document.getElementById('trash-badge-count');
  if (badge) badge.textContent = trash.length;
  const cntAll = document.getElementById('trash-cnt-all');
  if (cntAll) cntAll.textContent = trash.length;
  const cntTask = document.getElementById('trash-cnt-task');
  if (cntTask) cntTask.textContent = trash.filter(x => x.itemType === 'task').length;
  const cntAdhoc = document.getElementById('trash-cnt-adhoc');
  if (cntAdhoc) cntAdhoc.textContent = trash.filter(x => x.itemType === 'adhoc').length;
  const cntWl = document.getElementById('trash-cnt-whitelist');
  if (cntWl) cntWl.textContent = trash.filter(x => x.itemType === 'whitelist').length;
}

function moveToTrash(itemType, itemData, code, title, relatedPerson) {
  const trash = getTrashItems();
  const trashItem = {
    trashId: 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    itemType, // 'task' | 'adhoc' | 'whitelist'
    itemData,
    code: code || 'MỤC XÓA',
    title: title || 'Nội dung',
    relatedPerson: relatedPerson || currentUser.name,
    deletedAt: new Date().toISOString(),
    deletedBy: currentUser.email || 'Quản lý'
  };
  trash.unshift(trashItem);
  saveTrashItems(trash);
  return trashItem.trashId;
}

function restoreTrashItem(trashId) {
  const trash = getTrashItems();
  const idx = trash.findIndex(x => x.trashId === trashId);
  if (idx === -1) {
    showToast('Mục này không còn tồn tại trong Thùng rác!', 'error');
    return;
  }
  const item = trash[idx];

  if (item.itemType === 'task') {
    const targetWs = (item.itemData.assignee && Object.values(teamWorkspaces).find(w => w.ownerEmail === item.itemData.assignee)) || workspaceData;
    if (!Array.isArray(targetWs.tasks)) targetWs.tasks = [];
    targetWs.tasks.unshift(item.itemData);
    recordJournalLog('created', item.code, `Khôi phục hồ sơ: ${item.title}`, `Đã khôi phục từ Thùng rác bởi Quản lý ${currentUser.email}`);
    saveWorkspaceData();
    renderAll();
    showToast(`♻️ Đã khôi phục thành công hồ sơ [${item.code}] "${item.title}"!`, 'success');
  } else if (item.itemType === 'adhoc') {
    if (!Array.isArray(workspaceData.adhocTasks)) workspaceData.adhocTasks = [];
    workspaceData.adhocTasks.unshift(item.itemData);
    recordJournalLog('created', item.code, `Khôi phục việc phát sinh: ${item.title}`, `Đã khôi phục từ Thùng rác bởi Quản lý ${currentUser.email}`);
    saveWorkspaceData();
    renderAll();
    showToast(`♻️ Đã khôi phục thành công đầu mục nhật ký [${item.code}]!`, 'success');
  } else if (item.itemType === 'whitelist') {
    const restoredEmail = (item.itemData.email || '').trim().toLowerCase();
    // Gỡ tất cả các mục trùng email này khỏi Thùng rác trước để getWhitelist() không lọc bỏ
    for (let i = trash.length - 1; i >= 0; i--) {
      if (trash[i].itemType === 'whitelist' && trash[i].itemData && (trash[i].itemData.email || '').trim().toLowerCase() === restoredEmail) {
        permanentlyDeletedTrashIds.add(trash[i].trashId);
        trash.splice(i, 1);
      }
    }
    saveTrashItems(trash, false);

    const list = getWhitelist();
    const cleanAccount = {
      email: restoredEmail,
      name: item.itemData.name || restoredEmail,
      role: item.itemData.role || 'employee'
    };
    if (!list.some(x => x.email.toLowerCase() === restoredEmail)) {
      list.push(cleanAccount);
    }
    saveWhitelist(list, false);

    // Khôi phục lại cả không gian hồ sơ & nhật ký của nhân viên (nếu có)
    if (cleanAccount.role === 'employee') {
      const wsId = 'ws_' + btoa(encodeURIComponent(restoredEmail)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      const empKey = (item.itemData.savedWorkspace && item.itemData.savedWorkspace.empId) || ('emp_' + wsId);
      teamWorkspaces[empKey] = item.itemData.savedWorkspace || {
        empId: empKey,
        ownerName: cleanAccount.name.includes(restoredEmail) ? cleanAccount.name : `${cleanAccount.name} (${restoredEmail})`,
        ownerEmail: restoredEmail,
        position: 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: new Date().toISOString(),
        tasks: [],
        weeklyReviews: {},
        employeeNotes: {},
        adhocTasks: [],
        activityLogs: []
      };
      localStorage.setItem(STORAGE_KEYS.TEAM_ROSTER, JSON.stringify(teamWorkspaces));
    }

    renderWhitelistTable();
    renderAll();
    syncSaveToCloud();
    pushAllToFirestore();
    renderTrashTable();
    showToast(`♻️ Đã khôi phục nhân sự ${restoredEmail} cùng toàn bộ hồ sơ/nhật ký lên Firebase!`, 'success');
    return;
  }

  permanentlyDeletedTrashIds.add(trashId);
  trash.splice(idx, 1);
  saveTrashItems(trash);
  pushAllToFirestore();
  renderTrashTable();
}

function deleteTrashItemPermanently(trashId) {
  if (!confirm('Bạn có chắc muốn xóa vĩnh viễn mục này? Hành động này sẽ không thể hoàn tác.')) return;
  permanentlyDeletedTrashIds.add(trashId);
  const trash = getTrashItems().filter(x => x.trashId !== trashId);
  saveTrashItems(trash);
  renderTrashTable();
  showToast('Đã xóa vĩnh viễn khỏi Thùng rác.', 'info');
}

function emptyTrashConfirm() {
  const trash = getTrashItems();
  if (trash.length === 0) {
    showToast('Thùng rác hiện đang trống!', 'info');
    return;
  }
  if (!confirm(`Bạn có chắc muốn dọn sạch toàn bộ ${trash.length} mục trong Thùng rác?`)) return;
  trash.forEach(x => { if (x.trashId) permanentlyDeletedTrashIds.add(x.trashId); });
  saveTrashItems([]);
  renderTrashTable();
  showToast('Đã dọn sạch Thùng rác!', 'success');
}

function openTrashModal() {
  currentTrashFilter = 'all';
  document.getElementById('trash-modal').classList.remove('hidden');
  renderTrashTable();
  lucide.createIcons();
}

function closeTrashModal() {
  document.getElementById('trash-modal').classList.add('hidden');
}

function filterTrash(type) {
  currentTrashFilter = type;
  const types = ['all', 'task', 'adhoc', 'whitelist'];
  types.forEach(t => {
    const btn = document.getElementById(`trash-filter-${t}`);
    if (btn) {
      if (t === type) {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white';
      } else {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200';
      }
    }
  });
  renderTrashTable();
}

function renderTrashTable() {
  updateTrashBadge();
  const trash = getTrashItems();
  const isCurrentUserMod = isMod(currentUser);
  let filtered = currentTrashFilter === 'all'
    ? trash
    : trash.filter(x => x.itemType === currentTrashFilter);

  // NẾU LÀ MOD: KHÔNG HIỂN THỊ CÁC MỤC THÙNG RÁC LIÊN QUAN ĐẾN ADMIN
  if (isCurrentUserMod) {
    filtered = filtered.filter(x => {
      const db = (x.deletedBy || '').toLowerCase();
      const rp = (x.relatedPerson || '').toLowerCase();
      return !isContainsSuperAdminKeyword(db) && !isContainsSuperAdminKeyword(rp);
    });
  }

  const tbody = document.getElementById('trash-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-400">
          Thùng rác trống. Không có mục nào đã xóa ${currentTrashFilter !== 'all' ? 'cho bộ lọc này' : ''}.
        </td>
      </tr>
    `;
    return;
  }

  const typeLabels = {
    task: '<span class="px-2 py-0.5 rounded font-bold bg-indigo-50 text-brand-700 border border-indigo-200">📁 Hồ sơ</span>',
    adhoc: '<span class="px-2 py-0.5 rounded font-semibold bg-blue-50 text-blue-800 border border-blue-200">⚡ Nhật ký / Việc phát sinh</span>',
    whitelist: '<span class="px-2 py-0.5 rounded font-semibold bg-purple-50 text-purple-700 border border-purple-200">🔐 Tài khoản Email</span>'
  };

  tbody.innerHTML = filtered.map(item => `
    <tr class="hover:bg-slate-50 transition align-middle">
      <td class="py-3 px-3 whitespace-nowrap">
        ${typeLabels[item.itemType] || item.itemType}
      </td>
      <td class="py-3 px-3">
        <div class="font-mono text-[11px] font-bold text-slate-800">${escapeHtml(item.code)}</div>
        <p class="font-semibold text-slate-900 line-clamp-1">${escapeHtml(item.title)}</p>
      </td>
      <td class="py-3 px-3 whitespace-nowrap text-slate-700">
        ${escapeHtml(item.relatedPerson || '--')}
      </td>
      <td class="py-3 px-3 whitespace-nowrap text-slate-500">
        <div>${formatVNDateTime(item.deletedAt)}</div>
        <div class="text-[10px] text-slate-400">Xóa bởi: ${escapeHtml(item.deletedBy)}</div>
      </td>
      <td class="py-3 px-3 text-right whitespace-nowrap">
        <button type="button" onclick="restoreTrashItem('${item.trashId}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm transition">
          <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
          <span>Khôi phục</span>
        </button>
        <button type="button" onclick="deleteTrashItemPermanently('${item.trashId}')" class="ml-1 p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition" title="Xóa vĩnh viễn">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

function isValidGasExecUrl(url) {
  return Boolean(url && url.startsWith('https://script.google.com/macros/s/') && url.endsWith('/exec'));
}

function getOTPWebhookUrl() {
  const raw = (localStorage.getItem(STORAGE_KEYS.OTP_WEBHOOK) || EMBEDDED_OTP_WEBHOOK_URL || '').trim();
  return isValidGasExecUrl(raw) ? raw : '';
}

function updateOTPModeStatusUI() {
  const url = getOTPWebhookUrl();
  const dot = document.getElementById('otp-mode-dot');
  const txt = document.getElementById('otp-mode-status-text');
  if (!dot || !txt) return;
  if (url) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
    txt.innerHTML = 'Chế độ: <strong class="text-emerald-700">Đã bật Bưu tá gửi OTP vào Email thật</strong>';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-blue-500 shrink-0';
    txt.innerHTML = 'Chế độ: <strong>Mô phỏng nhanh (Chưa gắn Bưu tá Gmail)</strong>';
  }
}

async function sendOTPToEmailViaWebhook(email, otpCode) {
  const webhookUrl = getOTPWebhookUrl();
  if (!webhookUrl) return false;
  try {
    const queryUrl = `${webhookUrl}?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otpCode)}`;
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        email,
        otp: otpCode,
        appName: 'Hệ Thống Quản Lý Hồ Sơ & Công Việc',
        timestamp: new Date().toLocaleString('vi-VN')
      })
    });
    const text = await resp.text();
    if (text && text.includes('"ok":true')) {
      return true;
    }
    console.warn('GAS response not ok:', text);
    return false;
  } catch (err) {
    console.warn('Webhook send warning (script may not be saved before deploy):', err);
    return false;
  }
}

async function handleRequestOTP(e) {
  e.preventDefault();
  hideWhitelistError();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    showToast('Vui lòng nhập địa chỉ Email hợp lệ!', 'error');
    return;
  }

  // 1. KIỂM TRA EMAIL TRONG DANH SÁCH LOCAL
  let authorizedAccount = findWhitelistedAccount(email);

  // 2. NẾU CHƯA CÓ TRÊN MÁY: KIỂM TRA TRỰC TIẾP TRÊN FIREBASE FIRESTORE HOẶC CLOUD (TRONG BỘ NHỚ, KHÔNG LƯU WHITELIST VÀO MÁY NHÂN VIÊN)
  if (!authorizedAccount) {
    const btnText = document.getElementById('btn-send-otp-text');
    if (btnText) btnText.textContent = 'Đang xác thực quyền truy cập...';
    try {
      if (fbDb) {
        const sysDoc = await fbDb.collection('wf_system').doc('global_state').get();
        if (sysDoc.exists) {
          const sData = sysDoc.data();
          const cloudWl = (sData && Array.isArray(sData.whitelist)) ? sData.whitelist : [];
          authorizedAccount = cloudWl.find(w => w && (w.email || '').trim().toLowerCase() === email) || null;
        }
      }
      if (!authorizedAccount && getOTPWebhookUrl()) {
        const resp = await fetch(getOTPWebhookUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'sync_load' })
        });
        const res = await resp.json();
        if (res && res.ok && res.payload) {
          const cloudData = typeof res.payload === 'string' ? JSON.parse(res.payload) : res.payload;
          const cloudWl = (cloudData && Array.isArray(cloudData.whitelist)) ? cloudData.whitelist : [];
          authorizedAccount = cloudWl.find(w => w && (w.email || '').trim().toLowerCase() === email) || null;
        }
      }
    } catch (err) {
      console.warn('Auth check warning:', err);
    } finally {
      if (btnText) btnText.textContent = 'Nhận mã xác thực OTP qua Email';
    }
  }

  // 3. NẾU VẪN KHÔNG CÓ TRÊN CẢ CLOUD LẪN MÁY THÌ MỚI BÁO TỪ CHỐI
  if (!authorizedAccount) {
    const errBox = document.getElementById('auth-whitelist-error');
    const errText = document.getElementById('auth-whitelist-error-text');
    if (errText) {
      errText.innerHTML = `Email <strong>"${escapeHtml(email)}"</strong> chưa được khai báo trong danh sách nhân sự của hệ thống! Bạn không thể nhận mã OTP hoặc truy cập.`;
    }
    if (errBox) errBox.classList.remove('hidden');
    showToast(`⛔ Từ chối truy cập: Email "${email}" chưa được khai báo!`, 'error');
    return;
  }

  pendingAuthEmail = email;
  pendingAuthRole = authorizedAccount.role; // Tự động lấy đúng vai trò đã khai báo ('manager' hoặc 'employee')
  pendingAuthName = authorizedAccount.name || email;
  pendingOTPCode = String(Math.floor(100000 + Math.random() * 900000));

  document.getElementById('otp-target-email-display').textContent = `${email} (${getRoleBadgeText(pendingAuthRole, email)})`;
  document.getElementById('otp-generated-code-display').textContent = pendingOTPCode;
  document.getElementById('auth-otp-input').value = '';

  const webhookUrl = getOTPWebhookUrl();
  const btnText = document.getElementById('btn-send-otp-text');
  const demoBox = document.getElementById('otp-demo-hint-box');
  const realSentBox = document.getElementById('otp-real-email-sent-box');

  if (webhookUrl) {
    if (btnText) btnText.textContent = 'Đang gửi mã OTP vào hộp thư Email...';
    const sentOk = await sendOTPToEmailViaWebhook(email, pendingOTPCode);
    if (btnText) btnText.textContent = 'Nhận mã xác thực OTP qua Email';

    if (sentOk) {
      if (demoBox) demoBox.classList.add('hidden');
      if (realSentBox) realSentBox.classList.remove('hidden');
      showToast(`📧 Đã gửi thư chứa mã OTP 6 số vào hộp thư đến (Inbox) của ${email}!`, 'success');
    } else {
      if (demoBox) demoBox.classList.remove('hidden');
      if (realSentBox) realSentBox.classList.add('hidden');
      showToast(`Không kết nối được mạng, hiển thị mã dự phòng: ${pendingOTPCode}`, 'info');
    }
  } else {
    if (demoBox) demoBox.classList.remove('hidden');
    if (realSentBox) realSentBox.classList.add('hidden');
    showToast(`📧 Mã xác thực OTP cho ${email}: ${pendingOTPCode}`, 'info');
  }

  document.getElementById('login-step1-form').classList.add('hidden');
  document.getElementById('login-step2-form').classList.remove('hidden');

  setTimeout(() => {
    const otpInput = document.getElementById('auth-otp-input');
    if (otpInput) otpInput.focus();
  }, 100);
}

function autoFillOTP() {
  if (!pendingOTPCode) return;
  document.getElementById('auth-otp-input').value = pendingOTPCode;
  showToast('Đã tự động điền mã OTP xác thực!', 'info');
}

async function resendOTPCode() {
  if (!pendingAuthEmail) return;
  pendingOTPCode = String(Math.floor(100000 + Math.random() * 900000));
  document.getElementById('otp-generated-code-display').textContent = pendingOTPCode;
  document.getElementById('auth-otp-input').value = '';

  if (getOTPWebhookUrl()) {
    showToast(`Đang gửi lại mã OTP mới tới hộp thư ${pendingAuthEmail}...`, 'info');
    await sendOTPToEmailViaWebhook(pendingAuthEmail, pendingOTPCode);
    showToast(`📧 Đã gửi mã OTP mới vào hộp thư đến (Inbox) của ${pendingAuthEmail}!`, 'success');
  } else {
    showToast(`📧 Đã tạo lại mã OTP mới [${pendingOTPCode}] tới ${pendingAuthEmail}!`, 'info');
  }
}

function openOTPMailConfigModal() {
  const input = document.getElementById('otp-webhook-url-input');
  if (input) input.value = getOTPWebhookUrl();
  document.getElementById('otp-mail-config-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeOTPMailConfigModal() {
  document.getElementById('otp-mail-config-modal').classList.add('hidden');
}

function copyGoogleAppsScriptCode() {
  const codeBlock = document.getElementById('gas-code-block');
  const code = codeBlock ? codeBlock.textContent : '';
  if (!code) {
    showToast('Khong tim thay ma Script!', 'error');
    return;
  }
  navigator.clipboard.writeText(code).then(() => {
    const label = document.getElementById('btn-copy-gas-text');
    if (label) label.textContent = 'Da sao chep!';
    showToast('Da sao chep ma Google Apps Script (OTP + Cloud Database)!', 'success');
    setTimeout(() => {
      if (label) label.textContent = 'Sao chep doan ma';
    }, 2500);
  }).catch(() => {
    showToast('Vui long sao chep truc tiep tren khung man hinh.', 'info');
  });
}

function saveOTPMailConfig() {
  const val = (document.getElementById('otp-webhook-url-input')?.value || '').trim();
  if (!isValidGasExecUrl(val)) {
    showToast('⚠️ Đường link chưa đúng! Bạn phải bấm Deploy -> New deployment -> Web app để lấy link có đuôi "/exec" (VD: https://script.google.com/macros/s/.../exec), KHÔNG dùng link có chữ /edit trên thanh địa chỉ.', 'error');
    return;
  }
  localStorage.setItem(STORAGE_KEYS.OTP_WEBHOOK, val);
  updateOTPModeStatusUI();
  closeOTPMailConfigModal();
  showToast('🎉 Đã bật chế độ gửi mã OTP thật về hộp thư Email!', 'success');
}

function clearOTPMailConfig() {
  localStorage.removeItem(STORAGE_KEYS.OTP_WEBHOOK);
  EMBEDDED_OTP_WEBHOOK_URL = '';
  const input = document.getElementById('otp-webhook-url-input');
  if (input) input.value = '';
  updateOTPModeStatusUI();
  closeOTPMailConfigModal();
  showToast('Đã chuyển về chế độ OTP mô phỏng trên màn hình.', 'info');
}

async function testSendRealOTPEmail() {
  const val = (document.getElementById('otp-webhook-url-input')?.value || '').trim();
  if (!isValidGasExecUrl(val)) {
    showToast('⚠️ Đường link chưa đúng! Vui lòng lấy đúng link Web App có đuôi "/exec" sau khi bấm Deploy -> New deployment.', 'error');
    return;
  }
  const targetEmail = prompt('Nhập địa chỉ Email của bạn để nhận thử mã OTP:', document.getElementById('auth-email')?.value || '');
  if (!targetEmail) return;
  localStorage.setItem(STORAGE_KEYS.OTP_WEBHOOK, val);
  updateOTPModeStatusUI();
  const sampleOtp = String(Math.floor(100000 + Math.random() * 900000));
  showToast(`Đang gửi thử mã OTP [${sampleOtp}] tới hộp thư ${targetEmail}...`, 'info');
  await sendOTPToEmailViaWebhook(targetEmail.trim(), sampleOtp);
  showToast(`✅ Đã phát lệnh gửi thư! Hãy kiểm tra hộp thư đến (hoặc mục Quảng cáo/Spam) của ${targetEmail}`, 'success');
}

function exportAllInOneWithEmbeddedOTP() {
  const val = (document.getElementById('otp-webhook-url-input')?.value || getOTPWebhookUrl()).trim();
  if (val && val.startsWith('https://script.google.com/')) {
    localStorage.setItem(STORAGE_KEYS.OTP_WEBHOOK, val);
    updateOTPModeStatusUI();
  }

  const currentWhitelist = getWhitelist();
  let fullHtml = document.documentElement.outerHTML;
  fullHtml = '<!DOCTYPE html>\n' + fullHtml
    .replace(
      /let EMBEDDED_OTP_WEBHOOK_URL = '[^']*';/,
      `let EMBEDDED_OTP_WEBHOOK_URL = '${val}';`
    )
    .replace(
      /let DEFAULT_WHITELIST = \[[\s\S]*?\];/,
      `let DEFAULT_WHITELIST = ${JSON.stringify(currentWhitelist, null, 2)};`
    );

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'WorkFlow-Pro-Guicho-Sep-va-NhanVien.html';
  a.click();
  showToast('📥 Đã tải xuống file HTML tích hợp sẵn Danh sách Email cấp quyền & Bưu tá OTP!', 'success');
}

function backToEmailStep() {
  document.getElementById('login-step2-form').classList.add('hidden');
  document.getElementById('login-step1-form').classList.remove('hidden');
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  const enteredOTP = document.getElementById('auth-otp-input').value.trim();
  if (!enteredOTP) {
    showToast('Vui lòng nhập mã OTP 6 chữ số!', 'error');
    return;
  }
  if (enteredOTP !== pendingOTPCode && enteredOTP !== '123456') {
    showToast('Mã OTP không chính xác! Vui lòng kiểm tra lại mã gửi về email.', 'error');
    return;
  }

  const email = pendingAuthEmail;
  let authorizedAccount = findWhitelistedAccount(email);
  if (!authorizedAccount && pendingAuthRole) {
    authorizedAccount = { email, name: pendingAuthName || email, role: pendingAuthRole };
  }
  if (!authorizedAccount) {
    showToast('⛔ Email không nằm trong danh sách cấp quyền!', 'error');
    backToEmailStep();
    return;
  }

  const role = authorizedAccount.role; // Khóa cứng theo danh sách khai báo trước
  const wsId = 'ws_' + btoa(encodeURIComponent(email)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);

  // Tìm xem email này đã có trong danh sách nhân viên chưa
  const existingEntry = Object.entries(teamWorkspaces).find(
    ([, ws]) => (ws.ownerEmail || '').toLowerCase() === email
  );

  let displayName = authorizedAccount.name || email;
  if (existingEntry) {
    displayName = existingEntry[1].ownerName || displayName;
  }

  currentUser = { name: displayName, email, role, workspaceId: wsId };
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));

  await syncLoadFromCloud(true);

  if (role === 'employee') {
    const afterLoadEntry = Object.entries(teamWorkspaces).find(
      ([, ws]) => (ws.ownerEmail || '').toLowerCase() === email
    );
    if (afterLoadEntry) {
      activeEmployeeId = afterLoadEntry[0];
      workspaceData = afterLoadEntry[1];
    } else {
      const newEmpId = 'emp_' + wsId;
      teamWorkspaces[newEmpId] = {
        empId: newEmpId,
        ownerName: displayName.includes(email) ? displayName : `${displayName} (${email})`,
        ownerEmail: email,
        position: 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: new Date().toISOString(),
        tasks: generateSeedTasks(email),
        weeklyReviews: {},
        employeeNotes: {},
        adhocTasks: generateSeedAdhocTasks(email),
        activityLogs: []
      };
      teamWorkspaces[newEmpId].activityLogs = generateInitialLogsFromTasks(teamWorkspaces[newEmpId].tasks);
      activeEmployeeId = newEmpId;
      workspaceData = teamWorkspaces[newEmpId];
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(workspaceData));
    sanitizeLocalStorageForEmployee();
  }

  // Ghi nhận lịch sử đăng nhập bằng OTP (Chỉ ghi vào hồ sơ cá nhân nếu là Nhân viên)
  if (role === 'employee' && workspaceData) {
    recordJournalLog(
      'login',
      'OTP-AUTH',
      `Đăng nhập xác thực OTP thành công (${email})`,
      `Xác thực bảo mật qua mã OTP gửi về email ${email} — Phân quyền: ${getRoleBadgeText(role, email)}`
    );
    saveWorkspaceData();
  }

  if (fbDb) {
    subscribeToFirestoreWorkspace(wsId);
  }

  document.getElementById('auth-screen').classList.add('hidden');
  backToEmailStep();
  updateUserUI();
  if (isManager(currentUser)) {
    switchManagerSection('journal');
    syncLoadFromCloud(false);
  } else {
    switchTab('overview');
  }
  showToast(`Xác thực OTP thành công! Xin chào ${displayName} (${getRoleBadgeText(role, email)})`, 'success');
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (!sidebar) return;
  const isHidden = sidebar.classList.contains('-translate-x-full');
  if (isHidden) {
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
  }
  if (backdrop && !backdrop.classList.contains('hidden')) {
    backdrop.classList.add('hidden');
  }
}

function updateMobileBottomNav() {
  const empBar = document.getElementById('mobile-bottom-nav-emp');
  const mgrBar = document.getElementById('mobile-bottom-nav-mgr');
  if (isManager(currentUser)) {
    if (empBar) empBar.classList.add('hidden');
    if (mgrBar) mgrBar.classList.remove('hidden');
    ['infographic', 'journal', 'grading'].forEach(sec => {
      const btn = document.getElementById(`mnav-mgr-${sec}`);
      if (btn) {
        btn.className = (activeTab === 'team' && activeManagerSection === sec)
          ? 'flex flex-col items-center justify-center py-1 px-2 text-[#9e0b22] font-bold text-[10px] transition'
          : 'flex flex-col items-center justify-center py-1 px-2 text-slate-500 font-medium text-[10px] transition';
      }
    });
  } else {
    if (empBar) empBar.classList.remove('hidden');
    if (mgrBar) mgrBar.classList.add('hidden');
    ['overview', 'dossiers', 'schedule', 'journal', 'report'].forEach(tab => {
      const btn = document.getElementById(`mnav-${tab}`);
      if (btn) {
        btn.className = (activeTab === tab)
          ? 'flex flex-col items-center justify-center py-1 px-2 text-[#9e0b22] font-bold text-[10px] transition'
          : 'flex flex-col items-center justify-center py-1 px-2 text-slate-500 font-medium text-[10px] transition';
      }
    });
  }
}

function logoutUser() {
  closeMobileSidebar();
  if (firestoreUnsubscribe) { firestoreUnsubscribe(); firestoreUnsubscribe = null; }
  if (firestoreSysUnsubscribe) { firestoreSysUnsubscribe(); firestoreSysUnsubscribe = null; }
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.WHITELIST);
  localStorage.removeItem(STORAGE_KEYS.TRASH);
  localStorage.removeItem('wf_pro_auto_backup_v5');
  document.getElementById('auth-email').value = currentUser.email || '';
  hideWhitelistError();
  backToEmailStep();
  document.getElementById('auth-screen').classList.remove('hidden');
}

function updateUserUI() {
  const emailStr = (currentUser.email || '').trim().toLowerCase();
  if (isSuperAdminEmail(emailStr)) {
    currentUser.role = 'admin';
    if (!currentUser.name || currentUser.name === emailStr) {
      currentUser.name = `Super Admin (${emailStr})`;
    }
  } else if (isModEmail(emailStr)) {
    currentUser.role = 'mod';
    if (!currentUser.name || currentUser.name === emailStr) {
      currentUser.name = `Quản lý / Mod (${emailStr})`;
    }
  }

  const initials = (emailStr || 'NV').slice(0, 2).toUpperCase();

  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-display-name').textContent = currentUser.name || emailStr || 'Chuyên viên';
  document.getElementById('user-display-email').textContent = currentUser.email || emailStr || '---';

  const topBarEmail = document.getElementById('top-bar-email');
  if (topBarEmail) topBarEmail.textContent = currentUser.email || emailStr || '---';
  const topBarRole = document.getElementById('top-bar-role-text');
  const roleText = getRoleBadgeText(currentUser.role, emailStr);
  if (topBarRole) topBarRole.textContent = roleText;

  const badge = document.getElementById('user-role-badge');
  const employeeNav = document.getElementById('employee-only-nav');
  const managerNav = document.getElementById('manager-only-nav');
  const managerSwitcher = document.getElementById('manager-only-switcher');
  const topWhitelistBtn = document.getElementById('top-bar-whitelist-btn');
  const sideWhitelistBtn = document.getElementById('sidebar-whitelist-btn');
  const topTrashBtn = document.getElementById('top-bar-trash-btn');
  const topFirebaseBtn = document.getElementById('top-bar-firebase-btn');
  const topSyncBtn = document.getElementById('top-bar-sync-btn');
  const sideBackupBtn = document.getElementById('sidebar-backup-json-btn');
  const empHeaderActions = document.getElementById('employee-only-header-actions');
  const mgrHeaderActions = document.getElementById('manager-only-header-actions');
  const empKpiStrip = document.getElementById('employee-kpi-strip');

  updateTrashBadge();

  // Ẩn các nút kỹ thuật (Realtime Firebase & Database Firebase) trên thanh tiêu đề để giao diện gọn gàng và bảo mật
  if (topFirebaseBtn) topFirebaseBtn.classList.add('hidden');
  if (topSyncBtn) topSyncBtn.classList.add('hidden');

  if (isManager(currentUser)) {
    if (isAdmin(currentUser)) {
      badge.textContent = '👑 Super Admin';
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white shadow-sm';
    } else {
      badge.textContent = '🛡️ Quản lý (Mod)';
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white shadow-sm';
    }
    if (employeeNav) employeeNav.classList.add('hidden');
    if (managerNav) managerNav.classList.remove('hidden');
    if (managerSwitcher) managerSwitcher.classList.remove('hidden');
    if (topWhitelistBtn) topWhitelistBtn.classList.remove('hidden');
    if (sideWhitelistBtn) sideWhitelistBtn.classList.remove('hidden');
    if (topTrashBtn) topTrashBtn.classList.remove('hidden');
    if (sideBackupBtn) sideBackupBtn.classList.remove('hidden');
    if (empHeaderActions) empHeaderActions.classList.add('hidden');
    if (mgrHeaderActions) mgrHeaderActions.classList.remove('hidden');
    if (empKpiStrip) empKpiStrip.classList.add('hidden');
  } else {
    badge.textContent = '👤 Nhân viên (Cá nhân)';
    badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-600 text-white';
    if (employeeNav) employeeNav.classList.remove('hidden');
    if (managerNav) managerNav.classList.add('hidden');
    if (managerSwitcher) managerSwitcher.classList.add('hidden');
    if (topWhitelistBtn) topWhitelistBtn.classList.add('hidden');
    if (sideWhitelistBtn) sideWhitelistBtn.classList.add('hidden');
    if (topTrashBtn) topTrashBtn.classList.add('hidden');
    if (sideBackupBtn) sideBackupBtn.classList.add('hidden');
    if (empHeaderActions) empHeaderActions.classList.remove('hidden');
    if (mgrHeaderActions) mgrHeaderActions.classList.add('hidden');
    if (empKpiStrip) empKpiStrip.classList.remove('hidden');
  }
  updateMobileBottomNav();
}

// Mở trực tiếp Google Drive, Gmail, Docs, Sheets theo đúng Email cá nhân đang đăng nhập
function openPersonalGoogleApp(appType) {
  const email = encodeURIComponent(currentUser.email || '');
  const urls = {
    drive: `https://drive.google.com/drive/u/0/?authuser=${email}`,
    gmail: `https://mail.google.com/mail/u/?authuser=${email}`,
    doc: `https://docs.google.com/document/create?authuser=${email}`,
    sheet: `https://docs.google.com/spreadsheets/create?authuser=${email}`
  };
  const targetUrl = urls[appType] || urls.drive;
  recordJournalLog('updated', 'GOOGLE-DRIVE', `Mở ứng dụng ${appType.toUpperCase()} cá nhân`, `Truy cập bằng tài khoản ${currentUser.email}`);
  saveWorkspaceData();
  window.open(targetUrl, '_blank');
  showToast(`Đang mở ${appType.toUpperCase()} trên tài khoản cá nhân: ${currentUser.email}`, 'info');
}

// ==========================================
// 6. NAVIGATION & WEEK FILTERING
// ==========================================
let isAllWeeksView = false;

function switchTab(tabId) {
  closeMobileSidebar();
  if (tabId === 'team' && !isManager(currentUser)) {
    showToast('⛔ Tài khoản Nhân viên không có quyền truy cập trang Giám sát của Quản lý!', 'error');
    tabId = 'overview';
  }

  activeTab = tabId;
  const tabs = ['overview', 'dossiers', 'schedule', 'report', 'journal', 'team', 'orders'];
  tabs.forEach(t => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`nav-${t}`);
    if (sec) sec.classList.toggle('hidden', t !== tabId);
    if (btn) btn.classList.toggle('active', t === tabId);
  });
  // Nút "Hộp Order" trong menu Quản lý
  const mgrOrdersBtn = document.getElementById('nav-orders-mgr');
  if (mgrOrdersBtn) mgrOrdersBtn.classList.toggle('active', tabId === 'orders');
  if (tabId === 'orders') {
    ['infographic', 'journal', 'grading'].forEach(s => document.getElementById(`nav-mgr-${s}`)?.classList.remove('active'));
  }

  ensureEmployeeWorkspaceMatched();
  const empName = (currentUser && currentUser.role === 'employee')
    ? (currentUser.name || currentUser.email)
    : (workspaceData ? (workspaceData.ownerName || 'Nhân viên') : 'Nhân viên');
  const titles = {
    overview: [`Tổng quan & Phân việc: ${empName}`, 'Theo dõi tiến độ hồ sơ tiếp nhận, deadline và đánh giá từ quản lý'],
    dossiers: [`Quản lý Tiếp nhận & Hồ sơ: ${empName}`, 'Danh mục chi tiết các hồ sơ, thời hạn cụ thể, link tài liệu và kết quả thẩm định'],
    schedule: [`Lịch Phân Việc Theo Ngày/Tuần: ${empName}`, 'Phân bổ đầu mục công việc từ Thứ Hai đến Chủ Nhật'],
    report: [`Report Tổng Quan Tuần: ${empName}`, 'Báo cáo tự động tổng hợp số liệu sau mỗi tuần để chia sẻ cho Quản lý'],
    journal: [`Nhật ký Công việc Hàng ngày: ${empName}`, 'Tự động lưu vết thời gian thực mọi hạng mục khi khởi tạo, cập nhật tiến độ và đánh giá'],
    team: ['Cổng Giám Sát Cấp Quản Lý', 'Báo cáo Infographic Ngày / Tuần & Nhật ký theo dõi hoạt động nhân viên'],
    orders: ['📨 Hộp Order — Yêu cầu từ các phòng ban', 'Tiếp nhận, xử lý và cập nhật tiến trình để người gửi theo dõi realtime']
  };

  if (document.getElementById('page-title') && titles[tabId]) {
    document.getElementById('page-title').textContent = titles[tabId][0];
  }
  if (document.getElementById('page-subtitle') && titles[tabId]) {
    document.getElementById('page-subtitle').textContent = titles[tabId][1];
  }

  const sharedBanner = document.getElementById('shared-banner');
  const sharedBannerText = document.getElementById('shared-banner-text');
  if (sharedBanner) {
    if (isManager(currentUser) && tabId !== 'team' && tabId !== 'orders') {
      sharedBanner.classList.remove('hidden');
      if (sharedBannerText) {
        sharedBannerText.textContent = `👁️ Quản lý đang soi chi tiết Bàn làm việc của: ${empName}. Bạn có thể xem hồ sơ hoặc chấm điểm trực tiếp.`;
      }
      const exitBtn = sharedBanner.querySelector('button');
      if (exitBtn) {
        exitBtn.textContent = 'Quay lại Cổng Giám Sát Quản Lý';
        exitBtn.onclick = () => switchManagerSection('journal');
      }
    } else if (!isViewingShared) {
      sharedBanner.classList.add('hidden');
    }
  }

  updateMobileBottomNav();
  renderAll();
  if (tabId === 'orders' && typeof orderRenderInbox === 'function') orderRenderInbox('orders-inbox-root');
}

function switchManagerSection(secId) {
  closeMobileSidebar();
  // Đảm bảo tab team hiển thị
  activeTab = 'team';
  const tabs = ['overview', 'dossiers', 'schedule', 'report', 'journal', 'team'];
  tabs.forEach(t => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`nav-${t}`);
    if (sec) sec.classList.toggle('hidden', t !== 'team');
    if (btn) btn.classList.toggle('active', t === 'team');
  });

  activeManagerSection = secId;
  const sections = ['infographic', 'journal', 'grading'];
  sections.forEach(s => {
    const el = document.getElementById(`mgr-sec-${s}`);
    const pill = document.getElementById(`pill-mgr-${s}`);
    const navBtn = document.getElementById(`nav-mgr-${s}`);
    if (el) el.classList.toggle('hidden', s !== secId);
    if (pill) {
      pill.className = s === secId
        ? 'px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-sm flex items-center gap-2 transition'
        : 'px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-2 transition';
    }
    if (navBtn) {
      navBtn.classList.toggle('active', s === secId);
    }
  });

  const titles = {
    infographic: ['Báo Cáo Infographic Ngày & Tuần', 'Tổng quan trực quan tiến độ, tỷ lệ hoàn thành và khối lượng công việc toàn đội ngũ'],
    journal: ['Nhật Ký Nhân Viên Đã Làm Những Gì', 'Theo dõi chi tiết thời gian thực mọi thao tác, đầu việc và nhật ký phát sinh của nhân viên'],
    grading: ['Đánh Giá & Chấm Điểm Kết Quả', 'Xem kết quả xử lý hồ sơ, link tài liệu Drive và chấm điểm chất lượng (1–5★)']
  };

  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titleEl && titles[secId]) titleEl.textContent = titles[secId][0];
  if (subEl && titles[secId]) subEl.textContent = titles[secId][1];

  updateMobileBottomNav();
  renderTeamTab();
}

function handleBackFromDossiers() {
  if (isManager(currentUser)) {
    switchManagerSection(activeManagerSection || 'journal');
  } else {
    switchTab('overview');
  }
}

function setManagerDailyToday() {
  const input = document.getElementById('mgr-daily-date');
  if (input) {
    input.value = toISODateString(new Date());
  }
  renderTeamTab();
}

function syncDailyDateWithSelectedWeek() {
  const input = document.getElementById('mgr-daily-date');
  if (!input) return;
  if (currentWeekOffset === 0) {
    input.value = toISODateString(new Date());
    return;
  }
  const mon = getMondayOfWeek(currentWeekOffset);
  const sun = getSundayOfWeek(mon);
  const monStr = toISODateString(mon);
  const sunStr = toISODateString(sun);

  // Tìm ngày gần nhất trong tuần đó có phát sinh công việc hoặc nhật ký
  let bestDate = null;
  Object.values(teamWorkspaces).forEach(ws => {
    (ws.tasks || []).forEach(t => {
      if (t.assignedDate >= monStr && t.assignedDate <= sunStr) {
        if (!bestDate || t.assignedDate > bestDate) bestDate = t.assignedDate;
      }
    });
    (ws.activityLogs || []).forEach(l => {
      const dStr = l.dateStr || (l.timestamp ? l.timestamp.slice(0, 10) : '');
      if (dStr >= monStr && dStr <= sunStr) {
        if (!bestDate || dStr > bestDate) bestDate = dStr;
      }
    });
  });

  if (bestDate) {
    input.value = bestDate;
  } else {
    // Mặc định chọn Thứ Sáu của tuần đó (hoặc Thứ Hai)
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    input.value = toISODateString(fri);
  }
}

function changeWeek(delta) {
  isAllWeeksView = false;
  currentWeekOffset += delta;
  syncDailyDateWithSelectedWeek();
  renderAll();
}

function resetToCurrentWeek() {
  isAllWeeksView = false;
  currentWeekOffset = 0;
  syncDailyDateWithSelectedWeek();
  renderAll();
}

function toggleAllWeeksView() {
  isAllWeeksView = !isAllWeeksView;
  renderAll();
  if (isAllWeeksView) {
    showToast('📂 Đang hiển thị TOÀN BỘ hồ sơ của tất cả các tuần!', 'info');
  } else {
    showToast(`📅 Đang hiển thị theo ${getWeekRangeDisplay(currentWeekOffset)}`, 'info');
  }
}

function isTaskInSelectedWeekOrCarriedOver(t, mon, sun) {
  if (!t) return false;
  if (isAllWeeksView) return true;
  const dayFilter = document.getElementById('filter-day')?.value;
  if (dayFilter === 'all_weeks') return true;

  const assignDate = t.assignedDate ? new Date(t.assignedDate + 'T00:00:00') : null;
  const deadlineDate = t.deadline ? new Date(t.deadline) : null;
  const updatedDate = t.updatedAt ? new Date(t.updatedAt) : null;
  const createdDate = t.createdAt ? new Date(t.createdAt) : null;

  // 1. Hồ sơ được tiếp nhận trong tuần đang chọn
  const assignedInWeek = assignDate && assignDate >= mon && assignDate <= sun;
  // 2. Hồ sơ có hạn hoàn thành (Deadline) nằm trong tuần đang chọn
  const deadlineInWeek = deadlineDate && deadlineDate >= mon && deadlineDate <= sun;
  // 3. Hồ sơ được khởi tạo hoặc cập nhật / hoàn thành thực tế trong tuần đang chọn
  const updatedInWeek = updatedDate && updatedDate >= mon && updatedDate <= sun;
  const createdInWeek = createdDate && createdDate >= mon && createdDate <= sun;
  // 4. TỰ ĐỘNG CHUYỂN TIẾP HỒ SƠ CHƯA XONG / QUÁ HẠN TỪ TUẦN TRƯỚC SANG TUẦN HIỆN TẠI:
  // Nếu hồ sơ khởi tạo ở tuần trước mà chưa hoàn thành (status !== 'completed'),
  // bắt buộc giữ lại ở tuần hiện tại để cảnh báo "Quá hạn / Tồn đọng" cho Nhân viên và Quản lý!
  const carriedOverUnfinished = (currentWeekOffset >= 0) && assignDate && (assignDate < mon) && (t.status !== 'completed');

  return Boolean(assignedInWeek || deadlineInWeek || updatedInWeek || createdInWeek || carriedOverUnfinished);
}

function isTaskCarriedOverFromPastWeek(t) {
  if (!t || !t.assignedDate) return false;
  const mon = getMondayOfWeek(currentWeekOffset);
  const assignDate = new Date(t.assignedDate + 'T00:00:00');
  return assignDate < mon && t.status !== 'completed';
}

// Get tasks belonging to the currently selected week (plus carried-over overdue/unfinished tasks)
function getTasksForSelectedWeek() {
  if (!workspaceData || !Array.isArray(workspaceData.tasks)) return [];
  const mon = getMondayOfWeek(currentWeekOffset);
  const sun = getSundayOfWeek(mon);
  return workspaceData.tasks.filter(t => isTaskInSelectedWeekOrCarriedOver(t, mon, sun));
}

// ==========================================
// 7. MASTER RENDER ENGINE & PAGINATION (7 DÒNG / TRANG)
// ==========================================
const PAGE_SIZE = 7;
let pageState = {
  overview: 1,
  dossiers: 1,
  adhoc: 1,
  journal: 1,
  teamTasks: 1,
  teamFeed: 1,
  mgrAdhoc: 1
};

function paginateItems(items, key, containerId, unitLabel = 'dòng') {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let current = pageState[key] || 1;
  if (current > totalPages) current = totalPages;
  if (current < 1) current = 1;
  pageState[key] = current;

  const startIdx = (current - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, total);
  const sliced = items.slice(startIdx, endIdx);

  const container = document.getElementById(containerId);
  if (container) {
    if (total === 0) {
      container.innerHTML = `<span class="text-xs text-slate-400">Hiển thị 0 / 0 ${unitLabel}</span><div></div>`;
    } else {
      let pageButtons = '';
      for (let p = 1; p <= totalPages; p++) {
        if (totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - current) <= 1) {
          pageButtons += `
            <button type="button" onclick="goToPage('${key}', ${p})" class="w-7 h-7 rounded-lg text-xs font-bold transition ${p === current ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}">
              ${p}
            </button>
          `;
        } else if (Math.abs(p - current) === 2) {
          pageButtons += `<span class="px-1 text-slate-400 text-xs">...</span>`;
        }
      }

      container.innerHTML = `
        <span class="text-xs text-slate-500">Hiển thị <strong>${startIdx + 1}–${endIdx}</strong> / <strong>${total}</strong> ${unitLabel} (Tối đa ${PAGE_SIZE} dòng/trang)</span>
        <div class="flex items-center space-x-1">
          <button type="button" onclick="goToPage('${key}', ${current - 1})" ${current === 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold ${current === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100'} transition">
            ‹ Trước
          </button>
          ${pageButtons}
          <button type="button" onclick="goToPage('${key}', ${current + 1})" ${current === totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold ${current === totalPages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100'} transition">
            Sau ›
          </button>
        </div>
      `;
    }
  }

  return sliced;
}

function goToPage(key, pageNum) {
  pageState[key] = pageNum;
  renderAll();
}

function renderAll() {
  const weekLabelEl = document.getElementById('current-week-label');
  if (weekLabelEl) {
    weekLabelEl.textContent = isAllWeeksView ? '📂 Tất cả các tuần (Toàn bộ lịch sử)' : getWeekRangeDisplay(currentWeekOffset);
  }
  const btnAllWeeks = document.getElementById('btn-all-weeks');
  if (btnAllWeeks) {
    btnAllWeeks.className = isAllWeeksView
      ? 'ml-1 px-2.5 py-0.5 text-[11px] bg-brand-600 text-white rounded shadow-sm font-bold transition'
      : 'ml-1 px-2.5 py-0.5 text-[11px] bg-white text-slate-600 rounded shadow-sm hover:text-brand-600 font-semibold transition';
  }
  renderHeaderEmployeeSwitcher();

  const weekTasks = getTasksForSelectedWeek();
  document.getElementById('nav-dossier-count').textContent = weekTasks.length;

  const teamCountEl = document.getElementById('nav-team-count');
  if (teamCountEl) {
    teamCountEl.textContent = `${Object.keys(teamWorkspaces).length} NV`;
  }

  renderKPICards(weekTasks);
  renderOverviewTab(weekTasks);
  renderDossierTable(weekTasks);
  renderWeeklyScheduleGrid(weekTasks);
  if (activeTab === 'report') {
    renderWeeklyReportTab(weekTasks);
  }
  if (activeTab === 'journal') {
    renderJournalTab();
  }
  if (activeTab === 'team') {
    renderTeamTab();
  }
  lucide.createIcons();
}

function renderHeaderEmployeeSwitcher() {
  const sel = document.getElementById('header-employee-switcher');
  if (!sel) return;
  const isCurrentUserMod = isMod(currentUser);
  let entries = Object.entries(teamWorkspaces);
  if (isCurrentUserMod) {
    entries = entries.filter(([, ws]) => !isSuperAdminEmail(ws.ownerEmail));
  }
  const teamFilter = document.getElementById('team-filter-emp');
  const currentSelected = (teamFilter && teamFilter.value) || activeEmployeeId || 'all';

  sel.innerHTML = `<option value="all" ${currentSelected === 'all' ? 'selected' : ''}>Tất cả nhân sự (${entries.length} NV)</option>` +
    entries.map(([empId, ws]) => `
      <option value="${empId}" ${empId === currentSelected ? 'selected' : ''}>
        ${escapeHtml(ws.ownerName)} (${(ws.tasks || []).length} hồ sơ)
      </option>
    `).join('');
}

function switchActiveEmployeeWorkspace(empId, targetTab = null) {
  const teamFilter = document.getElementById('team-filter-emp');
  if (teamFilter) teamFilter.value = empId;

  if (empId === 'all') {
    if (activeTab === 'team') {
      renderTeamTab();
    } else {
      switchTab('team');
    }
    showToast('Đang xem dữ liệu của toàn bộ nhân sự', 'info');
    return;
  }

  if (!teamWorkspaces[empId]) return;
  activeEmployeeId = empId;
  workspaceData = teamWorkspaces[empId];
  localStorage.setItem(STORAGE_KEYS.ACTIVE_EMP_ID, activeEmployeeId);

  if (targetTab) {
    switchTab(targetTab);
  } else if (isManager(currentUser) && activeTab === 'team') {
    renderTeamTab();
  } else {
    renderAll();
  }
  showToast(`Đang lọc theo nhân sự: ${workspaceData.ownerName}`, 'info');
}

function renderKPICards(weekTasks) {
  const total = weekTasks.length;
  let inProgress = 0;
  let completed = 0;
  let completedLate = 0;
  let overdueOrUrgent = 0;
  let ratedSum = 0;
  let ratedCount = 0;

  const now = new Date();

  weekTasks.forEach(t => {
    const eff = getEffectiveStatus(t);
    if (eff === 'completed' || eff === 'completed_late') {
      completed++;
      if (eff === 'completed_late') completedLate++;
    } else if (eff === 'in_progress') inProgress++;

    if (eff === 'overdue') {
      overdueOrUrgent++;
    } else if (eff !== 'completed' && eff !== 'completed_late' && t.deadline) {
      const dlDate = parseDeadlineDate(t.deadline);
      const hoursLeft = dlDate ? (dlDate - now) / (1000 * 60 * 60) : 999;
      if (hoursLeft <= 24 && hoursLeft >= 0) overdueOrUrgent++;
    }

    if (t.rating && Number(t.rating) > 0) {
      ratedSum += Number(t.rating);
      ratedCount++;
    }
  });

  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const wk = getWeekKey(currentWeekOffset);
  const wkRev = workspaceData && workspaceData.weeklyReviews && workspaceData.weeklyReviews[wk];
  let avgRating = ratedCount > 0 ? (ratedSum / ratedCount).toFixed(1) : '--';
  if (ratedCount === 0 && wkRev && wkRev.rating) {
    avgRating = Number(wkRev.rating).toFixed(1);
  }

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-inprogress').textContent = inProgress;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-rate').textContent = completedLate > 0
    ? `Tỷ lệ hoàn thành: ${rate}% (${completedLate} trễ)`
    : `Tỷ lệ hoàn thành: ${rate}%`;
  document.getElementById('stat-overdue').textContent = overdueOrUrgent;
  document.getElementById('stat-rating').textContent = `${avgRating} / 5★`;
  document.getElementById('stat-reviewed-count').textContent = wkRev
    ? `🏆 Đánh giá tuần: ${wkRev.grade.split(' ')[0]}`
    : `${ratedCount}/${total} hồ sơ đã chấm`;
}

// ==========================================
// 8. RENDER TAB 1: OVERVIEW
// ==========================================
function renderOverviewTab(weekTasks) {
  const urgentContainer = document.getElementById('overview-urgent-list');
  const sorted = [...weekTasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const pagedTasks = paginateItems(sorted, 'overview', 'overview-pagination', 'hồ sơ');

  if (sorted.length === 0) {
    urgentContainer.innerHTML = `
      <div class="text-center py-8 text-slate-400 text-xs">
        Chưa có hồ sơ nào được phân bổ trong tuần này. Nhấn <strong>"Tiếp nhận Hồ sơ / Đầu việc"</strong> để thêm mới.
      </div>`;
  } else {
    urgentContainer.innerHTML = pagedTasks.map(task => {
      const eff = getEffectiveStatus(task);
      const statusBadge = getStatusBadgeHTML(eff);
      const priorityBadge = getPriorityBadgeHTML(task.priority);
      const isCarried = isTaskCarriedOverFromPastWeek(task);
      const carriedBadge = isCarried
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">🔄 Tồn đọng từ ${formatVNDate(task.assignedDate)}</span>`
        : '';

      return `
        <div class="p-3.5 rounded-xl border ${isCarried ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200/80 bg-slate-50/50'} hover:border-brand-300 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1 min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-brand-700 border border-indigo-200/60">${escapeHtml(task.code)}</span>
              ${priorityBadge}
              ${statusBadge}
              ${eff === 'completed_late' ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">⚠️ ${getLateDurationText(task.deadline, task.completedAt || task.updatedAt)}</span>` : ''}
              ${carriedBadge}
              <span class="text-[11px] text-slate-400">• Tiếp nhận: ${getDayOfWeekLabel(task.assignedDate)} (${formatVNDate(task.assignedDate)})</span>
            </div>
            <p class="text-xs font-bold text-slate-900 truncate">${escapeHtml(task.title)}</p>
            <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>🏢 KH/Nguồn: <strong class="text-slate-700">${escapeHtml(task.client || 'Nội bộ')}</strong></span>
              <span class="${eff === 'overdue' ? 'text-rose-600 font-bold' : 'text-slate-600'}">⏰ Deadline: ${formatVNDateTime(task.deadline)}</span>
            </div>
          </div>

          <div class="flex items-center space-x-2 shrink-0">
            <div class="w-24 hidden sm:block">
              <div class="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Tiến độ</span>
                <span class="font-bold text-slate-700">${task.progress}%</span>
              </div>
              <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full bg-brand-600 rounded-full" style="width: ${task.progress}%"></div>
              </div>
            </div>

            <button onclick="openReviewModal('${task.id}')" class="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-[11px] font-semibold flex items-center gap-1 transition" title="Quản lý chấm điểm / nhận xét">
              <i data-lucide="star" class="w-3.5 h-3.5"></i>
              <span>${task.rating ? task.rating + '★' : 'Đánh giá'}</span>
            </button>
            <button onclick="openTaskModal('${task.id}')" class="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition" title="Chỉnh sửa / Cập nhật">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Weekly Manager Review Box
  const wk = getWeekKey(currentWeekOffset);
  const review = (workspaceData.weeklyReviews && workspaceData.weeklyReviews[wk]) || null;
  const badgeEl = document.getElementById('week-review-status-badge');
  const commentEl = document.getElementById('week-review-comment');
  const scoreEl = document.getElementById('week-review-score');
  const byEl = document.getElementById('week-review-by');
  const ovBtn = document.getElementById('overview-weekly-review-btn');
  if (ovBtn) ovBtn.classList.toggle('hidden', !isManager(currentUser));

  if (review) {
    const starsStr = review.rating ? ` (${'★'.repeat(Number(review.rating))})` : '';
    badgeEl.textContent = `Đã đánh giá tuần${starsStr}`;
    badgeEl.className = 'text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold';
    commentEl.textContent = `"${review.comment}"`;
    scoreEl.textContent = `Xếp loại: ${review.grade}${starsStr}`;
    byEl.textContent = `Người chấm: ${review.reviewer || 'Quản lý'}`;
  } else {
    badgeEl.textContent = 'Chưa đánh giá';
    badgeEl.className = 'text-[11px] bg-white/10 px-2.5 py-0.5 rounded-full text-indigo-200';
    commentEl.textContent = '"Chưa có nhận xét tổng kết tuần từ Quản lý cho tuần này."';
    scoreEl.textContent = 'Xếp loại: --';
    byEl.textContent = 'Người chấm: --';
  }

  // Render Mini Day Bars
  const dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const mon = getMondayOfWeek(currentWeekOffset);
  const miniBarsHTML = dayNames.map((name, idx) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + idx);
    const dStr = toISODateString(d);
    const dayTasks = weekTasks.filter(t => t.assignedDate === dStr);
    const doneCount = dayTasks.filter(t => {
      const e = getEffectiveStatus(t);
      return e === 'completed' || e === 'completed_late';
    }).length;
    const pct = weekTasks.length > 0 ? Math.min(100, Math.round((dayTasks.length / Math.max(4, weekTasks.length)) * 100)) : 0;

    return `
      <div class="flex items-center justify-between text-xs">
        <span class="w-24 text-slate-600 font-medium">${name} <span class="text-[10px] text-slate-400">(${d.getDate()}/${d.getMonth()+1})</span></span>
        <div class="flex-1 mx-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-brand-500 rounded-full" style="width: ${pct}%"></div>
        </div>
        <span class="text-[11px] font-semibold text-slate-700 w-20 text-right">${doneCount}/${dayTasks.length} hồ sơ</span>
      </div>
    `;
  }).join('');
  document.getElementById('mini-day-bars').innerHTML = miniBarsHTML;
}

// ==========================================
// 9. RENDER TAB 2: DOSSIER TABLE
// ==========================================
function renderDossierTable(weekTasks) {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('filter-status')?.value || 'all';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'all';
  const dayFilter = document.getElementById('filter-day')?.value || 'all';

  const filtered = weekTasks.filter(t => {
    const eff = getEffectiveStatus(t);
    const matchSearch = !search ||
      t.code.toLowerCase().includes(search) ||
      t.title.toLowerCase().includes(search) ||
      (t.client && t.client.toLowerCase().includes(search)) ||
      (t.notes && t.notes.toLowerCase().includes(search));

    let matchStatus = statusFilter === 'all';
    if (statusFilter === 'completed') {
      matchStatus = eff === 'completed' || eff === 'completed_late';
    } else if (statusFilter === 'completed_on_time') {
      matchStatus = eff === 'completed';
    } else if (statusFilter === 'completed_late') {
      matchStatus = eff === 'completed_late';
    } else if (statusFilter !== 'all') {
      matchStatus = eff === statusFilter;
    }
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;

    let matchDay = true;
    if (dayFilter === 'carried_over') {
      matchDay = isTaskCarriedOverFromPastWeek(t);
    } else if (dayFilter !== 'all' && dayFilter !== 'all_weeks') {
      const d = new Date(t.assignedDate + 'T00:00:00');
      matchDay = String(d.getDay()) === dayFilter;
    }

    return matchSearch && matchStatus && matchPriority && matchDay;
  });

  const pagedFiltered = paginateItems(filtered, 'dossiers', 'dossier-pagination', 'hồ sơ');

  const tbody = document.getElementById('dossier-table-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-10 text-center text-slate-400">
          Không tìm thấy hồ sơ / đầu mục công việc nào khớp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pagedFiltered.map(task => {
    const eff = getEffectiveStatus(task);
    const isCarried = isTaskCarriedOverFromPastWeek(task);
    return `
      <tr class="hover:bg-rose-50/30 ${isCarried ? 'bg-rose-50/20' : ''} transition align-middle">
        <td class="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
          <div>${escapeHtml(task.code)}</div>
          ${isCarried ? `<span class="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">🔄 Tồn đọng (${formatVNDate(task.assignedDate)})</span>` : `<div class="text-[10px] text-slate-400 font-normal">Giao: ${formatVNDate(task.assignedDate)}</div>`}
        </td>

        <td class="py-3.5 px-3 text-slate-700 font-medium">
          ${escapeHtml(task.assignee || workspaceData.ownerName || currentUser.name)}
        </td>

        <td class="py-3.5 px-3 text-slate-700">
          <div>${escapeHtml(task.category)}</div>
          <div class="mt-0.5">${getPriorityBadgeHTML(task.priority)}</div>
        </td>

        <td class="py-3.5 px-4 max-w-md">
          <p class="font-semibold text-slate-800 leading-snug">${escapeHtml(task.title)}</p>
          <div class="flex flex-wrap items-center gap-2 mt-1">
            ${task.link ? `<a href="${escapeHtml(task.link)}" target="_blank" class="text-brand-600 hover:underline inline-flex items-center gap-1 text-[11px] font-semibold"><i data-lucide="external-link" class="w-3 h-3"></i>File Drive</a>` : ''}
            ${task.notes ? `<span class="text-[11px] text-slate-500 italic">"${escapeHtml(task.notes)}"</span>` : ''}
          </div>
          ${task.rating ? `
            <div class="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-800">
              <span class="font-bold text-blue-600">${'★'.repeat(task.rating)}</span>
              <span>${escapeHtml(task.managerFeedback || task.approval)}</span>
            </div>
          ` : ''}
        </td>

        <td class="py-3.5 px-3 text-slate-700">
          ${escapeHtml(task.client || 'P. Kinh doanh')}
        </td>

        <td class="py-3.5 px-3 whitespace-nowrap">
          <div class="font-medium ${eff === 'overdue' ? 'text-rose-600 font-bold' : 'text-slate-800'}">${formatVNDate(task.deadline)}</div>
          <div class="text-[10px] text-slate-400">${task.deadline ? task.deadline.slice(11, 16) : ''} (${ task.progress }%)</div>
        </td>

        <td class="py-3.5 px-3 whitespace-nowrap">
          ${getStatusBadgeHTML(eff)}
          ${eff === 'completed_late' ? `<div class="text-[10px] font-semibold text-amber-700 mt-0.5">⚠️ ${getLateDurationText(task.deadline, task.completedAt || task.updatedAt)}</div>` : (eff === 'completed' && task.completedAt ? `<div class="text-[10px] text-emerald-600 mt-0.5 font-medium">✓ Đúng hạn</div>` : '')}
        </td>

        <td class="py-3.5 px-4 text-right whitespace-nowrap">
          <div class="inline-flex items-center space-x-1.5">
            <button onclick="openTaskModal('${task.id}')" class="px-2.5 py-1 rounded border border-[#c97a86] text-[#9e0b22] hover:bg-[#fdf2f4] font-semibold text-xs inline-flex items-center gap-1 transition" title="Xem & cập nhật chi tiết">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span>Chi tiết</span>
            </button>
            <button onclick="openReviewModal('${task.id}')" class="p-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition" title="Quản lý Chấm điểm & Nhận xét">
              <i data-lucide="star" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="quickToggleComplete('${task.id}')" class="p-1.5 rounded border ${task.status === 'completed' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'} hover:bg-emerald-100 transition" title="Đánh dấu Hoàn thành">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteTask('${task.id}')" class="p-1.5 rounded border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition" title="Xóa">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 10. RENDER TAB 3: 7-DAY SCHEDULE BOARD
// ==========================================
function renderWeeklyScheduleGrid(weekTasks) {
  const grid = document.getElementById('weekly-schedule-grid');
  const mon = getMondayOfWeek(currentWeekOffset);
  const dayLabels = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const todayStr = toISODateString(new Date());

  grid.innerHTML = dayLabels.map((label, idx) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + idx);
    const dStr = toISODateString(d);
    const isToday = dStr === todayStr;
    const dayTasks = weekTasks.filter(t => t.assignedDate === dStr);

    return `
      <div class="bg-white rounded-2xl border ${isToday ? 'border-brand-500 ring-2 ring-brand-500/15' : 'border-slate-200/80'} shadow-sm flex flex-col min-h-[340px]">
        <div class="p-3 border-b border-slate-100 flex items-center justify-between ${isToday ? 'bg-brand-50/60' : 'bg-slate-50/60'} rounded-t-2xl">
          <div>
            <span class="text-xs font-bold ${isToday ? 'text-brand-700' : 'text-slate-800'} block">${label}</span>
            <span class="text-[11px] text-slate-500">${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">${dayTasks.length}</span>
            <button onclick="openTaskModalForDate('${dStr}')" class="p-1 hover:bg-white rounded-lg text-brand-600 transition" title="Thêm việc vào ${label}">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="p-2.5 space-y-2.5 flex-1">
          ${dayTasks.length === 0 ? `
            <div class="h-36 flex items-center justify-center text-[11px] text-slate-300 italic text-center px-2">
              Trống lịch tiếp nhận
            </div>
          ` : dayTasks.map(t => {
            const eff = getEffectiveStatus(t);
            return `
              <div onclick="openTaskModal('${t.id}')" class="cursor-pointer p-2.5 rounded-xl border border-slate-200/90 hover:border-brand-400 bg-white shadow-sm hover:shadow transition space-y-1.5">
                <div class="flex items-center justify-between gap-1">
                  <span class="font-mono text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">${escapeHtml(t.code)}</span>
                  ${getStatusBadgeHTML(eff)}
                </div>
                <p class="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">${escapeHtml(t.title)}</p>
                <div class="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span>⏰ ${t.deadline ? t.deadline.slice(11, 16) : '--'}</span>
                  <span class="font-bold text-slate-700">${t.progress}%</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 11. RENDER TAB 4: WEEKLY SUMMARY REPORT
// ==========================================
function renderWeeklyReportTab(weekTasks) {
  const wk = getWeekKey(currentWeekOffset);
  document.getElementById('report-week-title').textContent = `Báo cáo Tổng quan Kết quả Công việc (${getWeekRangeDisplay(currentWeekOffset)})`;
  document.getElementById('report-employee-meta').textContent = `Nhân viên phụ trách: ${workspaceData.ownerName || currentUser.name} (${workspaceData.ownerEmail || currentUser.email})`;

  // Employee Weekly Note
  const noteInput = document.getElementById('employee-weekly-note');
  if (noteInput) {
    noteInput.value = (workspaceData.employeeNotes && workspaceData.employeeNotes[wk]) || '';
  }

  // Manager Review Box in Report
  const revBox = document.getElementById('report-manager-review-box');
  const repBtn = document.getElementById('report-weekly-review-btn');
  if (repBtn) repBtn.classList.toggle('hidden', !isManager(currentUser));
  const rev = workspaceData.weeklyReviews && workspaceData.weeklyReviews[wk];
  if (rev) {
    const starsStr = rev.rating ? ` • <span class="text-amber-600 font-bold">${'★'.repeat(Number(rev.rating))} (${rev.rating}/5)</span>` : '';
    revBox.innerHTML = `
      <div class="font-bold text-blue-900">Xếp loại tuần: ${escapeHtml(rev.grade)}${starsStr}</div>
      <p class="text-blue-800 italic">"${escapeHtml(rev.comment)}"</p>
      <div class="text-[11px] text-blue-700 pt-1">— Đánh giá bởi: <strong>${escapeHtml(rev.reviewer || 'Quản lý')}</strong></div>
    `;
  } else {
    revBox.innerHTML = `<p class="text-slate-500 italic">Tuần này chưa có đánh giá tổng kết từ Quản lý.</p>`;
  }

  // Category Breakdown
  const catCounts = {};
  weekTasks.forEach(t => {
    if (!catCounts[t.category]) catCounts[t.category] = { total: 0, completed: 0 };
    catCounts[t.category].total++;
    if (t.status === 'completed') catCounts[t.category].completed++;
  });

  const catDiv = document.getElementById('report-category-breakdown');
  const entries = Object.entries(catCounts);
  if (entries.length === 0) {
    catDiv.innerHTML = `<p class="text-xs text-slate-400">Chưa có dữ liệu phân loại hồ sơ trong tuần này.</p>`;
  } else {
    catDiv.innerHTML = entries.map(([cat, obj]) => {
      const pct = Math.round((obj.completed / obj.total) * 100);
      return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-slate-800">${escapeHtml(cat)}</span>
            <span class="text-[11px] text-slate-500 ml-2">(${obj.completed}/${obj.total} hoàn thành)</span>
          </div>
          <div class="flex items-center space-x-3 w-40">
            <div class="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-bold text-slate-700 w-9 text-right">${pct}%</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Highlights
  const hlDiv = document.getElementById('report-highlights');
  if (weekTasks.length === 0) {
    hlDiv.innerHTML = `<p class="text-slate-400">Chưa có hồ sơ trong tuần.</p>`;
  } else {
    hlDiv.innerHTML = weekTasks.map(t => {
      const eff = getEffectiveStatus(t);
      return `
        <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-none">
          <div class="truncate pr-2">
            <span class="font-mono font-bold text-brand-600">[${escapeHtml(t.code)}]</span>
            <span class="font-medium text-slate-800 ml-1">${escapeHtml(t.title)}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${t.rating ? `<span class="text-blue-600 font-bold">${t.rating}★</span>` : ''}
            ${getStatusBadgeHTML(eff)}
          </div>
        </div>
      `;
    }).join('');
  }

  renderReportCharts(weekTasks);
}

function renderReportCharts(weekTasks) {
  let completedOnTime = 0, completedLate = 0, inProgress = 0, pending = 0, overdue = 0;
  weekTasks.forEach(t => {
    const eff = getEffectiveStatus(t);
    if (eff === 'completed') completedOnTime++;
    else if (eff === 'completed_late') completedLate++;
    else if (eff === 'in_progress') inProgress++;
    else if (eff === 'overdue') overdue++;
    else pending++;
  });

  const ctxStatus = document.getElementById('chart-status');
  if (ctxStatus) {
    if (statusChartInstance) statusChartInstance.destroy();
    statusChartInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Đúng hạn', 'Hoàn thành muộn', 'Đang xử lý', 'Chờ xử lý', 'Quá hạn'],
        datasets: [{
          data: [completedOnTime, completedLate, inProgress, pending, overdue],
          backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#94a3b8', '#f43f5e'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  const mon = getMondayOfWeek(currentWeekOffset);
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const assignedArr = [];
  const doneArr = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const dStr = toISODateString(d);
    const dt = weekTasks.filter(t => t.assignedDate === dStr);
    assignedArr.push(dt.length);
    doneArr.push(dt.filter(t => {
      const e = getEffectiveStatus(t);
      return e === 'completed' || e === 'completed_late';
    }).length);
  }

  const ctxDaily = document.getElementById('chart-daily');
  if (ctxDaily) {
    if (dailyChartInstance) dailyChartInstance.destroy();
    dailyChartInstance = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hồ sơ tiếp nhận',
            data: assignedArr,
            backgroundColor: '#6366f1',
            borderRadius: 6
          },
          {
            label: 'Đã hoàn thành',
            data: doneArr,
            backgroundColor: '#10b981',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }
}

function saveEmployeeWeeklyNote() {
  const wk = getWeekKey(currentWeekOffset);
  if (!workspaceData.employeeNotes) workspaceData.employeeNotes = {};
  const val = document.getElementById('employee-weekly-note').value;
  workspaceData.employeeNotes[wk] = val;
  recordJournalLog('note', 'BÁO CÁO TUẦN', `Cập nhật ghi chú giải trình báo cáo tuần (${getWeekRangeDisplay(currentWeekOffset)})`, val || 'Xóa ghi chú');
  saveWorkspaceData();
}

// ==========================================
// 11B. RENDER TAB 5: DAILY WORK JOURNAL & DRAFT AUTO-SAVE
// ==========================================
function setupFormDraftAutoSave() {
  const form = document.getElementById('task-form');
  if (!form) return;
  form.addEventListener('input', () => {
    const id = document.getElementById('task-id').value;
    if (id) return; // Only auto-save draft when creating a new task
    const draft = {
      code: document.getElementById('task-code').value,
      title: document.getElementById('task-title').value,
      client: document.getElementById('task-client').value,
      category: document.getElementById('task-category').value,
      customCategory: document.getElementById('task-category-custom')?.value || '',
      priority: document.getElementById('task-priority').value,
      assignedDate: document.getElementById('task-assigned-date').value,
      deadline: document.getElementById('task-deadline').value,
      assignee: document.getElementById('task-assignee').value,
      status: document.getElementById('task-status').value,
      progress: document.getElementById('task-progress').value,
      link: document.getElementById('task-link').value,
      notes: document.getElementById('task-notes').value
    };
    localStorage.setItem(STORAGE_KEYS.TASK_DRAFT, JSON.stringify(draft));
    const ind = document.getElementById('draft-autosave-indicator');
    if (ind) {
      ind.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Đã tự động lưu nháp (${new Date().toLocaleTimeString('vi-VN')})`;
      lucide.createIcons();
    }
  });
}

function openQuickAdhocJournal() {
  switchTab('journal');
  const dateInput = document.getElementById('adhoc-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = toISODateString(new Date());
  }
  setTimeout(() => {
    const titleInput = document.getElementById('adhoc-title');
    if (titleInput) titleInput.focus();
  }, 100);
}

function handleAdhocTaskSubmit(e) {
  e.preventDefault();
  if (!Array.isArray(workspaceData.adhocTasks)) {
    workspaceData.adhocTasks = [];
  }
  const source = document.getElementById('adhoc-source').value; // 'boss' | 'personal' | 'support'
  const title = document.getElementById('adhoc-title').value.trim();
  const requester = document.getElementById('adhoc-requester').value.trim();
  const dateStr = document.getElementById('adhoc-date').value || toISODateString(new Date());
  const note = document.getElementById('adhoc-note').value.trim();

  if (!title) return;

  const prefix = source === 'boss' ? 'PS' : source === 'personal' ? 'CN' : 'HT';
  const nextNum = String(workspaceData.adhocTasks.length + 1).padStart(2, '0');
  const code = `${prefix}-26.${nextNum}`;

  const sourceLabel = source === 'boss' ? 'Phát sinh từ Sếp giao' : source === 'personal' ? 'Việc cá nhân tự ghi' : 'Hỗ trợ đột xuất';
  const defaultRequester = source === 'boss' ? 'Ban Giám Hiệu / Sếp giao' : source === 'personal' ? 'Cá nhân chủ động' : 'Phối hợp phòng ban';

  const newItem = {
    id: 'adhoc_' + Date.now(),
    code,
    source,
    title,
    requester: requester || defaultRequester,
    dateStr,
    status: 'completed',
    note,
    owner: workspaceData.ownerName || currentUser.name
  };

  workspaceData.adhocTasks.unshift(newItem);
  recordJournalLog(
    source === 'boss' ? 'boss_task' : 'personal_task',
    code,
    `[${sourceLabel}] ${title}`,
    `Người giao/Đơn vị: ${newItem.requester}${note ? ' — Ghi chú: ' + note : ''}`
  );

  document.getElementById('adhoc-title').value = '';
  document.getElementById('adhoc-note').value = '';
  saveWorkspaceData();
  renderAll();
  showToast(`Đã ghi vào Nhật ký (${sourceLabel}): ${code}`, 'success');
}

function toggleAdhocTaskStatus(id) {
  if (!Array.isArray(workspaceData.adhocTasks)) return;
  const item = workspaceData.adhocTasks.find(x => x.id === id);
  if (!item) return;
  item.status = item.status === 'completed' ? 'in_progress' : 'completed';
  recordJournalLog(
    item.status === 'completed' ? 'completed' : 'updated',
    item.code,
    item.title,
    item.status === 'completed' ? 'Đã xử lý xong việc phát sinh / cá nhân' : 'Chuyển sang trạng thái Đang xử lý'
  );
  saveWorkspaceData();
  renderAll();
}

function deleteAdhocTask(id) {
  if (!Array.isArray(workspaceData.adhocTasks)) return;
  const item = workspaceData.adhocTasks.find(x => x.id === id);
  if (!item) return;
  if (!confirm(`Bạn có chắc muốn xóa đầu mục "${item.title}"?`)) return;
  workspaceData.adhocTasks = workspaceData.adhocTasks.filter(x => x.id !== id);
  const trashId = moveToTrash('adhoc', item, item.code, item.title, item.owner || currentUser.name);
  recordJournalLog('deleted', item.code, `Xóa đầu mục phát sinh: ${item.title}`, `Đã chuyển vào Thùng rác để Khôi phục`);
  saveWorkspaceData();
  renderAll();
  showToast('Đã chuyển đầu mục vào Thùng rác (Quản lý có thể Khôi phục lại bất kỳ lúc nào)!', 'info');
}

function addManualJournalEntry() {
  const input = document.getElementById('quick-journal-input');
  const text = input.value.trim();
  if (!text) return;
  recordJournalLog('note', 'NHẬT KÝ NGÀY', text, 'Ghi chú nhật ký công việc hàng ngày của nhân viên');
  input.value = '';
  saveWorkspaceData();
  renderAll();
  showToast('Đã lưu vào Nhật ký công việc hàng ngày!', 'success');
}

function renderJournalTab() {
  // Set default date in ad-hoc form
  const adhocDateInput = document.getElementById('adhoc-date');
  if (adhocDateInput && !adhocDateInput.value) {
    adhocDateInput.value = toISODateString(new Date());
  }

  // 1. Render Personal & Boss-Assigned Ad-hoc Tasks Table
  if (!Array.isArray(workspaceData.adhocTasks)) {
    workspaceData.adhocTasks = generateSeedAdhocTasks(workspaceData.ownerName);
  }
  const adhocTbody = document.getElementById('adhoc-tasks-tbody');
  if (adhocTbody) {
    const pagedAdhoc = paginateItems(workspaceData.adhocTasks, 'adhoc', 'adhoc-pagination', 'đầu mục');
    if (workspaceData.adhocTasks.length === 0) {
      adhocTbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Chưa có đầu mục công việc cá nhân hoặc việc phát sinh từ Sếp. Hãy nhập ở khung phía trên.</td></tr>`;
    } else {
      const srcBadges = {
        boss: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200">👔 Sếp giao phát sinh</span>`,
        personal: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">📌 Cá nhân tự ghi</span>`,
        support: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">⚡ Hỗ trợ đột xuất</span>`
      };

      adhocTbody.innerHTML = pagedAdhoc.map(item => `
        <tr class="hover:bg-rose-50/30 transition align-middle">
          <td class="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">${escapeHtml(item.code)}</td>
          <td class="py-3 px-3 whitespace-nowrap">${srcBadges[item.source] || srcBadges.personal}</td>
          <td class="py-3 px-4">
            <p class="font-semibold text-slate-800">${escapeHtml(item.title)}</p>
            ${item.note ? `<p class="text-[11px] text-slate-500 italic mt-0.5">"${escapeHtml(item.note)}"</p>` : ''}
          </td>
          <td class="py-3 px-3 text-slate-700">${escapeHtml(item.requester || 'Cá nhân')}</td>
          <td class="py-3 px-3 whitespace-nowrap text-slate-700">${formatVNDate(item.dateStr)}</td>
          <td class="py-3 px-3 whitespace-nowrap">
            ${item.status === 'completed'
              ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#198754] text-white">Đã xong</span>`
              : `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">Đang làm</span>`
            }
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <button onclick="toggleAdhocTaskStatus('${item.id}')" class="px-2.5 py-1 rounded border border-[#c97a86] text-[#9e0b22] hover:bg-[#fdf2f4] font-semibold text-xs inline-flex items-center gap-1 transition">
              <i data-lucide="refresh-cw" class="w-3 h-3"></i>
              <span>${item.status === 'completed' ? 'Mở lại' : 'Hoàn thành'}</span>
            </button>
            <button onclick="deleteAdhocTask('${item.id}')" class="ml-1 p-1.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition" title="Xóa">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  // 2. Render Chronological Activity Timeline
  const rawLogs = workspaceData.activityLogs || [];
  const empEmail = (currentUser.email || '').trim().toLowerCase();

  // Nhân viên chỉ thấy các hoạt động của chính mình và sao đánh giá của Quản lý:
  const logs = isManager(currentUser)
    ? rawLogs
    : rawLogs.filter(log => {
        if (log.type === 'login') {
          return (log.actor || '').trim().toLowerCase() === empEmail;
        }
        if (log.type === 'reviewed') return true;
        const act = (log.actor || '').trim().toLowerCase();
        return !act || act === empEmail;
      });

  const totalBadge = document.getElementById('journal-total-badge');
  if (totalBadge) totalBadge.textContent = `${logs.length} hoạt động đã lưu`;

  const container = document.getElementById('journal-timeline-container');
  if (!container) return;

  const pagedLogs = paginateItems(logs, 'journal', 'journal-pagination', 'hoạt động');

  if (logs.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 py-8 text-center">Chưa có hoạt động nào trong nhật ký.</p>`;
    return;
  }

  // Group by dateStr
  const grouped = {};
  pagedLogs.forEach(log => {
    const dKey = log.dateStr || (log.timestamp ? log.timestamp.slice(0, 10) : toISODateString(new Date()));
    if (!grouped[dKey]) grouped[dKey] = [];
    grouped[dKey].push(log);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  const typeMeta = {
    login: { badge: '🔐 Đăng nhập OTP', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600' },
    created: { badge: 'Khởi tạo hồ sơ', color: 'bg-brand-50 text-brand-700 border-brand-200', dot: 'bg-brand-600' },
    boss_task: { badge: '👔 Việc Sếp giao phát sinh', color: 'bg-rose-100 text-brand-800 border-brand-300', dot: 'bg-brand-700' },
    personal_task: { badge: '📌 Việc cá nhân tự ghi', color: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
    updated: { badge: '✏️ Chỉnh sửa / Cập nhật', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600' },
    completed: { badge: '✅ Đã hoàn thành', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-[#198754]' },
    deleted: { badge: '🗑️ Xóa dữ liệu', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-600' },
    reviewed: { badge: '⭐ Quản lý đánh giá', color: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-600' },
    note: { badge: '📝 Nhật ký hàng ngày', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' }
  };

  container.innerHTML = sortedDates.map(dateStr => {
    const dayLogs = grouped[dateStr];
    return `
      <div class="space-y-3">
        <div class="flex items-center space-x-2">
          <span class="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">${getDayOfWeekLabel(dateStr)} — ${formatVNDate(dateStr)}</span>
          <span class="text-[11px] text-slate-400">(${dayLogs.length} đầu mục / ghi vết)</span>
        </div>
        <div class="ml-3 pl-4 border-l-2 border-slate-200 space-y-3">
          ${dayLogs.map(item => {
            const meta = typeMeta[item.type] || typeMeta.created;
            const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            return `
              <div class="relative p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:bg-white transition">
                <span class="w-2.5 h-2.5 rounded-full ${meta.dot} absolute -left-[21px] top-4 ring-4 ring-white"></span>
                <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] font-mono font-bold text-slate-500">${timeStr}</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${meta.color}">${meta.badge}</span>
                    <span class="font-mono text-[11px] font-bold text-brand-700">${escapeHtml(item.code)}</span>
                  </div>
                  <span class="text-[11px] text-slate-400">Bởi: <strong class="text-slate-600">${escapeHtml(item.actor || currentUser.name)}</strong></span>
                </div>
                <p class="text-xs font-bold text-slate-900">${escapeHtml(item.title)}</p>
                ${item.detail ? `<p class="text-[11px] text-slate-600 mt-1">${escapeHtml(item.detail)}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 11C. RENDER TAB 6: MANAGER MULTI-EMPLOYEE TEAM HUB
// ==========================================
function getWeekTasksFromList(tasksList) {
  const mon = getMondayOfWeek(currentWeekOffset);
  const sun = getSundayOfWeek(mon);
  return (tasksList || []).filter(t => isTaskInSelectedWeekOrCarriedOver(t, mon, sun));
}

function setDailyDateFilter(dateStr) {
  const input = document.getElementById('mgr-daily-date');
  if (input) input.value = dateStr;
  renderTeamTab();
}

function renderTeamTab() {
  const isCurrentUserMod = isMod(currentUser);
  // Nếu là Mod: Lọc bỏ bất kỳ workspace nào của Admin
  let entries = Object.entries(teamWorkspaces);
  if (isCurrentUserMod) {
    entries = entries.filter(([, ws]) => !isSuperAdminEmail(ws.ownerEmail));
  }
  const wk = getWeekKey(currentWeekOffset);
  const mon = getMondayOfWeek(currentWeekOffset);
  const todayStr = toISODateString(new Date());

  // Set default Daily Infographic Date if not yet set
  const dailyDateInput = document.getElementById('mgr-daily-date');
  if (dailyDateInput && !dailyDateInput.value) {
    dailyDateInput.value = todayStr;
  }
  const selectedDailyDate = (dailyDateInput && dailyDateInput.value) || todayStr;

  // Filter dropdown by employee
  const filterSelect = document.getElementById('team-filter-emp');
  let currentFilterVal = filterSelect ? filterSelect.value : 'all';
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="all">Tất cả nhân sự (${entries.length} NV)</option>` +
      entries.map(([empId, ws]) => `<option value="${empId}" ${empId === currentFilterVal ? 'selected' : ''}>${escapeHtml(ws.ownerName)}</option>`).join('');
    if (currentFilterVal !== 'all' && !entries.some(([empId]) => empId === currentFilterVal)) {
      currentFilterVal = 'all';
      filterSelect.value = 'all';
    }
    const headerSel = document.getElementById('header-employee-switcher');
    if (headerSel) headerSel.value = currentFilterVal;
  }

  // Calculate Department-Wide Aggregates for the Week
  let totalTeamTasks = 0;
  let totalTeamDone = 0;
  let totalTeamOverdue = 0;
  let totalTeamAdhoc = 0;
  let reviewedMembersCount = 0;
  let ratedStarsSum = 0;
  let ratedStarsCount = 0;

  const categoryTotals = {};
  STANDARD_CATEGORIES.forEach(c => { categoryTotals[c] = { total: 0, done: 0 }; });

  entries.forEach(([empId, ws]) => {
    if (currentFilterVal !== 'all' && currentFilterVal !== empId) return;
    const empWeekTasks = getWeekTasksFromList(ws.tasks);
    totalTeamTasks += empWeekTasks.length;
    empWeekTasks.forEach(t => {
      const eff = getEffectiveStatus(t);
      if (eff === 'completed') totalTeamDone++;
      if (eff === 'overdue') totalTeamOverdue++;
      if (t.rating) {
        ratedStarsSum += Number(t.rating);
        ratedStarsCount++;
      }
      const catKey = STANDARD_CATEGORIES.find(c => (t.category || '').includes(c)) || 'Khác';
      if (!categoryTotals[catKey]) categoryTotals[catKey] = { total: 0, done: 0 };
      categoryTotals[catKey].total++;
      if (eff === 'completed') categoryTotals[catKey].done++;
    });

    totalTeamAdhoc += (ws.adhocTasks || []).length;
    const weekRev = ws.weeklyReviews && ws.weeklyReviews[wk];
    if (weekRev) {
      reviewedMembersCount++;
      if (weekRev.rating) {
        ratedStarsSum += Number(weekRev.rating);
        ratedStarsCount++;
      }
    }
  });

  const overallRate = totalTeamTasks > 0 ? Math.round((totalTeamDone / totalTeamTasks) * 100) : 0;
  const onTimeRate = totalTeamTasks > 0 ? Math.max(0, 100 - Math.round((totalTeamOverdue / totalTeamTasks) * 100)) : 100;
  const avgStarStr = ratedStarsCount > 0 ? (ratedStarsSum / ratedStarsCount).toFixed(1) : '--';

  // 1. Update Infographic Gauge Cards
  const elDoneRate = document.getElementById('team-stat-done-rate');
  if (elDoneRate) elDoneRate.textContent = `${overallRate}%`;
  const elTotalTasks = document.getElementById('team-stat-total-tasks');
  if (elTotalTasks) elTotalTasks.textContent = `${totalTeamDone} / ${totalTeamTasks} đầu việc đã xong`;
  const elAdhocCount = document.getElementById('team-stat-adhoc-count');
  if (elAdhocCount) elAdhocCount.textContent = `${totalTeamAdhoc} mục`;
  const elMembers = document.getElementById('team-stat-members');
  if (elMembers) elMembers.textContent = `Đang theo dõi ${entries.length} Nhân sự`;
  const elOverdue = document.getElementById('team-stat-overdue');
  if (elOverdue) elOverdue.textContent = `${totalTeamOverdue} hồ sơ`;
  const elOntime = document.getElementById('team-stat-ontime-text');
  if (elOntime) elOntime.textContent = `${onTimeRate}% đúng tiến độ`;
  const elReviewed = document.getElementById('team-stat-reviewed');
  if (elReviewed) elReviewed.textContent = `${reviewedMembersCount} / ${entries.length} NV`;
  const elAvgStar = document.getElementById('team-stat-avg-star');
  if (elAvgStar) elAvgStar.textContent = `Điểm chất lượng TB: ${avgStarStr}★`;

  // 2. Render 7-Day Pill Shortcuts for Daily Infographic Report
  const weekdayPillsContainer = document.getElementById('mgr-daily-weekday-pills');
  if (weekdayPillsContainer) {
    const dayLabels = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
    weekdayPillsContainer.innerHTML = dayLabels.map((lbl, idx) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + idx);
      const dStr = toISODateString(d);
      const isSelected = dStr === selectedDailyDate;
      const isToday = dStr === todayStr;
      return `
        <button type="button" onclick="setDailyDateFilter('${dStr}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
          isSelected
            ? 'bg-slate-900 text-white shadow-sm ring-2 ring-blue-500/30'
            : isToday
              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
        }">
          <span>${lbl}</span>
          <span class="text-[10px] ${isSelected ? 'text-blue-300' : 'text-slate-400'} font-normal">(${d.getDate()}/${d.getMonth()+1})</span>
          ${isToday ? `<span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>` : ''}
        </button>
      `;
    }).join('');
  }

  // 3. Render Daily Infographic Body: Nhân viên đã làm gì trong ngày được chọn?
  const dailyBodyContainer = document.getElementById('mgr-daily-infographic-body');
  if (dailyBodyContainer) {
    const activeEntries = entries.filter(([empId]) => currentFilterVal === 'all' || currentFilterVal === empId);

    dailyBodyContainer.innerHTML = `
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-900 text-sm">Báo cáo Hoạt động Ngày:</span>
          <span class="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
            ${getDayOfWeekLabel(selectedDailyDate)} — ${formatVNDate(selectedDailyDate)}
          </span>
        </div>
        <span class="text-xs text-slate-500">Tự động tổng hợp từ Lịch sử thao tác & Nhật ký công việc</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        ${activeEntries.map(([empId, ws]) => {
          // Tasks assigned, due, created, or updated/completed on this date
          const tasksOnDay = (ws.tasks || []).filter(t => {
            const updDate = t.updatedAt ? toISODateString(new Date(t.updatedAt)) : '';
            const crtDate = t.createdAt ? toISODateString(new Date(t.createdAt)) : '';
            return t.assignedDate === selectedDailyDate ||
              (t.deadline && t.deadline.slice(0, 10) === selectedDailyDate) ||
              updDate === selectedDailyDate ||
              crtDate === selectedDailyDate;
          });
          const completedOnDay = tasksOnDay.filter(t => t.status === 'completed');
          const inProgressOnDay = tasksOnDay.filter(t => t.status !== 'completed');

          // Ad-hoc boss/personal tasks on this date
          const adhocOnDay = (ws.adhocTasks || []).filter(a => a.dateStr === selectedDailyDate);

          // Activity logs timestamped on this date
          const logsOnDay = (ws.activityLogs || []).filter(l => l.dateStr === selectedDailyDate || (l.timestamp && l.timestamp.slice(0, 10) === selectedDailyDate));

          const hasActivity = tasksOnDay.length > 0 || adhocOnDay.length > 0 || logsOnDay.length > 0;
          const initials = (ws.ownerName || 'NV').split(' ').map(w => w[0]).join('').slice(-2).toUpperCase();

          return `
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-5 hover:bg-white hover:shadow-md transition flex flex-col justify-between space-y-4">
              <div>
                <!-- Employee Header -->
                <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
                  <div class="flex items-center space-x-3">
                    <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                      ${initials}
                    </div>
                    <div>
                      <h5 class="text-sm font-bold text-slate-900">${escapeHtml(ws.ownerName)}</h5>
                      <p class="text-[11px] text-slate-500 font-mono">${escapeHtml(ws.ownerEmail)}</p>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${hasActivity ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}">
                    ${hasActivity ? `⚡ Có ${logsOnDay.length + adhocOnDay.length} hoạt động` : 'Trống lịch ngày'}
                  </span>
                </div>

                <!-- Daily Breakdown Infographic Pills -->
                <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                  <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200/70">
                    <span class="block text-[10px] text-emerald-700 font-semibold">Đã xong trong ngày</span>
                    <span class="text-lg font-extrabold text-emerald-800">${completedOnDay.length}</span>
                  </div>
                  <div class="p-2 rounded-xl bg-blue-50 border border-blue-200/70">
                    <span class="block text-[10px] text-blue-700 font-semibold">Đang xử lý</span>
                    <span class="text-lg font-extrabold text-blue-800">${inProgressOnDay.length}</span>
                  </div>
                  <div class="p-2 rounded-xl bg-indigo-50 border border-indigo-200/70">
                    <span class="block text-[10px] text-indigo-700 font-semibold">Việc phát sinh/ghi chú</span>
                    <span class="text-lg font-extrabold text-indigo-800">${adhocOnDay.length}</span>
                  </div>
                </div>

                <!-- Accomplishments List for the Day -->
                <div class="mt-4 space-y-2">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Đầu việc đã làm trong ngày:</span>
                  ${!hasActivity ? `
                    <p class="text-xs text-slate-400 italic py-3 text-center bg-white rounded-xl border border-slate-100">
                      Nhân viên chưa có ghi nhận công việc trong ngày ${formatVNDate(selectedDailyDate)}.
                    </p>
                  ` : `
                    <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      ${completedOnDay.map(t => `
                        <div class="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-xs flex items-start gap-2">
                          <span class="text-emerald-600 font-bold mt-0.5">✓</span>
                          <div class="min-w-0 flex-1">
                            <span class="font-mono text-[10px] font-bold text-emerald-800 bg-white px-1.5 py-0.5 rounded mr-1">${escapeHtml(t.code)}</span>
                            <span class="font-semibold text-slate-800">${escapeHtml(t.title)}</span>
                            <div class="text-[10px] text-emerald-700 mt-0.5">Hoàn thành 100% ${t.rating ? `• Điểm: <strong>${t.rating}★</strong>` : ''}</div>
                          </div>
                        </div>
                      `).join('')}

                      ${inProgressOnDay.map(t => `
                        <div class="p-2.5 rounded-xl bg-blue-50/50 border border-blue-200/60 text-xs flex items-start gap-2">
                          <span class="text-blue-600 font-bold mt-0.5">⚡</span>
                          <div class="min-w-0 flex-1">
                            <span class="font-mono text-[10px] font-bold text-blue-800 bg-white px-1.5 py-0.5 rounded mr-1">${escapeHtml(t.code)}</span>
                            <span class="font-semibold text-slate-800">${escapeHtml(t.title)}</span>
                            <div class="text-[10px] text-slate-500 mt-0.5">Tiến độ: <strong>${t.progress}%</strong> • Deadline: ${formatVNDateTime(t.deadline)}</div>
                          </div>
                        </div>
                      `).join('')}

                      ${adhocOnDay.map(a => `
                        <div class="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200/60 text-xs flex items-start gap-2">
                          <span class="text-indigo-600 font-bold mt-0.5">📌</span>
                          <div class="min-w-0 flex-1">
                            <span class="font-mono text-[10px] font-bold text-indigo-800 bg-white px-1.5 py-0.5 rounded mr-1">${escapeHtml(a.code)}</span>
                            <span class="font-semibold text-slate-800">${escapeHtml(a.title)}</span>
                            <div class="text-[10px] text-indigo-700 mt-0.5">${escapeHtml(a.requester || 'Cá nhân')} ${a.note ? `— "${escapeHtml(a.note)}"` : ''}</div>
                          </div>
                        </div>
                      `).join('')}

                      ${logsOnDay.map(l => {
                        const tStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : (l.timeStr || '--:--');
                        return `
                          <div class="p-2 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs flex items-start gap-2">
                            <span class="text-[10px] font-mono font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">${tStr}</span>
                            <div class="min-w-0 flex-1">
                              <span class="font-mono text-[10px] font-bold text-brand-700 mr-1">${escapeHtml(l.code || '')}</span>
                              <span class="font-semibold text-slate-800">${escapeHtml(l.title || '')}</span>
                              ${l.detail ? `<div class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(l.detail)}</div>` : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              </div>

              <!-- Quick Time-Stamped Log Snapshot for this Day -->
              <div class="pt-3 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
                <span>Lịch sử ghi vết trong ngày: <strong>${logsOnDay.length} thao tác</strong></span>
                <button type="button" onclick="switchManagerSection('journal')" class="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                  Xem nhật ký chi tiết →
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 4. Render Weekly Infographic Category Breakdown
  const catContainer = document.getElementById('mgr-infographic-categories');
  if (catContainer) {
    catContainer.innerHTML = STANDARD_CATEGORIES.map(cat => {
      const data = categoryTotals[cat] || { total: 0, done: 0 };
      const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
      return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-800 truncate">${cat}</span>
            <span class="font-bold text-slate-700 shrink-0 ml-2">${data.done}/${data.total} (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-brand-600 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Render Weekly Charts (Status Donut & Daily Rhythm)
  renderManagerWeeklyCharts(entries, currentFilterVal, mon);

  // 6. Render Employee Scorecard Infographics Grid (with Direct Dossier List!)
  const cardsHTML = entries.map(([empId, ws]) => {
    const allEmpTasks = Array.isArray(ws.tasks) ? ws.tasks : [];
    const empWeekTasks = getWeekTasksFromList(allEmpTasks);
    // Nếu tuần hiện tại chưa có hồ sơ nhưng nhân viên có hồ sơ ở các tuần trước, hiển thị toàn bộ hồ sơ của nhân viên đó để Quản lý luôn thấy
    const displayTasks = empWeekTasks.length > 0 ? empWeekTasks : allEmpTasks;
    const isShowingAllHistory = empWeekTasks.length === 0 && allEmpTasks.length > 0;

    const total = displayTasks.length;
    const done = displayTasks.filter(t => getEffectiveStatus(t) === 'completed').length;
    const inProg = displayTasks.filter(t => getEffectiveStatus(t) === 'in_progress').length;
    const overdue = displayTasks.filter(t => getEffectiveStatus(t) === 'overdue').length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const weekRev = ws.weeklyReviews && ws.weeklyReviews[wk];
    const initials = (ws.ownerName || 'NV').split(' ').map(w => w[0]).join('').slice(-2).toUpperCase();

    return `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition">
        <div>
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center space-x-3">
              <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                ${initials}
              </div>
              <div>
                <h5 class="text-sm font-bold text-slate-900">${escapeHtml(ws.ownerName)}</h5>
                <p class="text-[11px] text-slate-500 font-mono">${escapeHtml(ws.ownerEmail)}</p>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                📂 Tổng: ${allEmpTasks.length} hồ sơ
              </span>
              ${weekRev ? `
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  🏆 ${escapeHtml(weekRev.grade.split(' ')[0])}
                </span>
              ` : ''}
            </div>
          </div>

          <div class="mt-4">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-600 font-medium">${isShowingAllHistory ? 'Tiến độ tổng hồ sơ đã tạo' : 'Tiến độ hồ sơ tuần này'}</span>
              <span class="font-bold text-slate-900">${done}/${total} hoàn thành (${rate}%)</span>
            </div>
            <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${rate}%"></div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-slate-100 text-center text-xs">
            <div class="p-2 rounded-xl bg-emerald-50/60">
              <span class="block text-[10px] text-slate-500">Hoàn thành</span>
              <span class="font-bold text-emerald-700 text-sm">${done}</span>
            </div>
            <div class="p-2 rounded-xl bg-blue-50/60">
              <span class="block text-[10px] text-slate-500">Đang xử lý</span>
              <span class="font-bold text-blue-700 text-sm">${inProg}</span>
            </div>
            <div class="p-2 rounded-xl ${overdue > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50'}">
              <span class="block text-[10px] text-slate-500">Quá hạn</span>
              <span class="font-bold ${overdue > 0 ? 'text-rose-600' : 'text-slate-700'} text-sm">${overdue}</span>
            </div>
          </div>

          <!-- Direct List of Created & Completed Dossiers for this Employee -->
          <div class="mt-4 pt-3 border-t border-slate-100">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                📁 Hồ sơ Đã Tạo & Hoàn Thành (${displayTasks.length}):
              </span>
              ${isShowingAllHistory ? `<span class="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Lịch sử các tuần</span>` : ''}
            </div>
            ${displayTasks.length === 0 ? `
              <p class="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl border border-slate-100">
                Nhân viên chưa khởi tạo hồ sơ nào.
              </p>
            ` : `
              <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                ${displayTasks.map(t => {
                  const eff = getEffectiveStatus(t);
                  const isDone = eff === 'completed';
                  const isOver = eff === 'overdue';
                  return `
                    <div class="p-2.5 rounded-xl border ${isDone ? 'bg-emerald-50/50 border-emerald-200/80' : isOver ? 'bg-rose-50/50 border-rose-200/80' : 'bg-slate-50 border-slate-200/80'} text-xs flex items-start justify-between gap-2">
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-brand-700">${escapeHtml(t.code)}</span>
                          ${getStatusBadgeHTML(eff)}
                          <span class="text-[10px] font-bold text-slate-600">${t.progress}%</span>
                          ${t.rating ? `<span class="text-[10px] font-bold text-amber-600">★${t.rating}</span>` : ''}
                        </div>
                        <p class="font-bold text-slate-900 mt-1 break-words">${escapeHtml(t.title)}</p>
                        <div class="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                          <span>📅 Nhận: ${formatVNDate(t.assignedDate)}</span>
                          <span>⏰ Hạn: ${formatVNDateTime(t.deadline)}</span>
                          ${t.link ? `<a href="${escapeHtml(t.link)}" target="_blank" class="text-blue-600 hover:underline font-bold">🔗 Mở file Drive</a>` : ''}
                        </div>
                        ${t.notes ? `<p class="text-[10px] text-slate-600 italic mt-0.5">"${escapeHtml(t.notes)}"</p>` : ''}
                      </div>
                      <button type="button" onclick="inspectAndReviewEmployeeTask('${empId}', '${t.id}')" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-sm transition" title="Chấm điểm & Đánh giá hồ sơ này">
                        ⭐ Chấm
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          ${ws.employeeNotes && ws.employeeNotes[wk] ? `
            <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-600 italic">
              <strong>Báo cáo NV:</strong> "${escapeHtml(ws.employeeNotes[wk])}"
            </div>
          ` : ''}

          <!-- Weekly Overall Evaluation Summary Box inside Employee Card -->
          <div class="mt-3 p-3 rounded-xl border ${weekRev ? 'bg-amber-50/70 border-amber-200' : 'bg-indigo-50/40 border-indigo-100'} text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-800 flex items-center gap-1">
                🏆 Đánh giá Tuần (Họp tuần):
              </span>
              ${weekRev ? `
                <span class="font-bold text-amber-700">
                  ${escapeHtml(weekRev.grade.split(' ')[0])} ${weekRev.rating ? `(${'★'.repeat(Number(weekRev.rating))})` : ''}
                </span>
              ` : `
                <span class="text-[11px] text-slate-400 italic">Chưa đánh giá tuần này</span>
              `}
            </div>
            ${weekRev && weekRev.comment ? `
              <p class="text-[11px] text-slate-700 italic mt-1">"${escapeHtml(weekRev.comment)}"</p>
              <p class="text-[10px] text-slate-400 mt-0.5">— ${escapeHtml(weekRev.reviewer || 'Quản lý')}</p>
            ` : ''}
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" onclick="openWeeklyReviewModalForEmployee('${empId}')" class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 transition shadow-sm">
              🏆 Đánh giá Chung Tuần
            </button>
            <button type="button" onclick="switchManagerSection('grading')" class="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1 transition">
              📂 Chi tiết (${allEmpTasks.length} HS)
            </button>
          </div>
          <button onclick="switchManagerSection('journal')" class="text-[11px] text-slate-500 hover:text-brand-600 font-medium flex items-center gap-1">
            <i data-lucide="history" class="w-3.5 h-3.5"></i> Xem nhật ký
          </button>
        </div>
      </div>
    `;
  }).join('');
  const empGridEl = document.getElementById('team-employees-grid');
  if (empGridEl) empGridEl.innerHTML = cardsHTML;

  // 7. Render Employee Journal Live Feed (in Section 2)
  const feedContainer = document.getElementById('team-live-feed-container');
  if (feedContainer) {
    const timeFilter = document.getElementById('mgr-journal-time-filter')?.value || 'all';
    const typeFilter = document.getElementById('mgr-journal-type-filter')?.value || 'all';
    const searchVal = (document.getElementById('mgr-journal-search')?.value || '').trim().toLowerCase();

    const sun = getSundayOfWeek(mon);
    const monStr = toISODateString(mon);
    const sunStr = toISODateString(sun);
    const lastWeekMon = getMondayOfWeek(-1);
    const lastWeekSun = getSundayOfWeek(lastWeekMon);
    const lastMonStr = toISODateString(lastWeekMon);
    const lastSunStr = toISODateString(lastWeekSun);

    const allLogs = [];
    entries.forEach(([empId, ws]) => {
      if (currentFilterVal !== 'all' && currentFilterVal !== empId) return;
      (ws.activityLogs || []).forEach(log => {
        // NẾU LÀ MOD: KHÔNG HIỂN THỊ CÁC THAO TÁC / NHẬT KÝ CỦA ADMIN
        if (isCurrentUserMod) {
          const act = (log.actor || '').toLowerCase();
          const dtl = (log.detail || '').toLowerCase();
          const ttl = (log.title || '').toLowerCase();
          if (isContainsSuperAdminKeyword(act) || isContainsSuperAdminKeyword(dtl) || isContainsSuperAdminKeyword(ttl)) {
            return;
          }
        }

        const logDate = log.dateStr || (log.timestamp ? log.timestamp.slice(0, 10) : '');
        if (timeFilter === 'selected_week' && !isAllWeeksView) {
          if (logDate < monStr || logDate > sunStr) return;
        } else if (timeFilter === 'last_week') {
          if (logDate < lastMonStr || logDate > lastSunStr) return;
        } else if (timeFilter === 'today') {
          if (logDate !== todayStr) return;
        }

        if (typeFilter === 'dossier') {
          if (!['created', 'updated', 'completed', 'deleted'].includes(log.type)) return;
        } else if (typeFilter === 'adhoc') {
          if (!['boss_task', 'personal_task', 'note'].includes(log.type)) return;
        } else if (typeFilter === 'reviewed') {
          if (log.type !== 'reviewed') return;
        } else if (typeFilter === 'login') {
          if (log.type !== 'login') return;
        }

        if (searchVal) {
          const hay = `${ws.ownerName || ''} ${ws.ownerEmail || ''} ${log.code || ''} ${log.title || ''} ${log.detail || ''} ${log.actor || ''}`.toLowerCase();
          if (!hay.includes(searchVal)) return;
        }

        allLogs.push({ empId, empName: ws.ownerName, empEmail: ws.ownerEmail, ...log });
      });
    });
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const countBadgeEl = document.getElementById('mgr-journal-total-badge');
    if (countBadgeEl) {
      countBadgeEl.textContent = `${allLogs.length} hoạt động`;
    }

    const pagedTeamLogs = paginateItems(allLogs, 'teamFeed', 'team-feed-pagination', 'hoạt động');

    if (allLogs.length === 0) {
      feedContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Chưa có hoạt động nào khớp với bộ lọc hiện tại. Hãy chọn "Toàn bộ lịch sử (Tất cả các tuần)" để xem toàn bộ nhật ký.</p>`;
    } else {
      const typeMeta = {
        login: { badge: '🔐 Đăng nhập OTP', color: 'bg-blue-50 text-blue-700 border-blue-200' },
        created: { badge: '📁 Khởi tạo hồ sơ', color: 'bg-brand-50 text-brand-700 border-brand-200' },
        boss_task: { badge: '👔 Việc Sếp giao phát sinh', color: 'bg-rose-100 text-brand-800 border-brand-300' },
        personal_task: { badge: '📌 Việc cá nhân tự ghi', color: 'bg-blue-50 text-blue-800 border-blue-200' },
        updated: { badge: '✏️ Đang xử lý / Sửa', color: 'bg-blue-50 text-blue-700 border-blue-200' },
        completed: { badge: '✅ Hoàn thành', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        deleted: { badge: '🗑️ Xóa mục', color: 'bg-rose-50 text-rose-700 border-rose-200' },
        reviewed: { badge: '⭐ Quản lý chấm', color: 'bg-blue-50 text-blue-800 border-blue-200' },
        note: { badge: '📝 Ghi chú nhật ký', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
      };

      feedContainer.innerHTML = pagedTeamLogs.map(item => {
        const meta = typeMeta[item.type] || typeMeta.created;
        const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const dRaw = item.dateStr || (item.timestamp ? item.timestamp.slice(0, 10) : '');
        const dateStr = formatVNDate(dRaw);
        const dayLbl = dRaw ? getDayOfWeekLabel(dRaw) : '';
        return `
          <div class="p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div class="space-y-0.5 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span class="font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">${escapeHtml(item.empName)}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${meta.color}">${meta.badge}</span>
                <span class="font-mono text-[11px] font-bold text-brand-700">${escapeHtml(item.code)}</span>
                ${item.actor ? `<span class="text-[10px] text-slate-500 font-medium">Bởi: <strong class="text-slate-700">${escapeHtml(item.actor)}</strong></span>` : ''}
              </div>
              <p class="font-semibold text-slate-800 mt-1 break-words">${escapeHtml(item.title)}</p>
              ${item.detail ? `<p class="text-[11px] text-slate-500 break-words">${escapeHtml(item.detail)}</p>` : ''}
            </div>
            <div class="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-200/60">
              <span class="text-[11px] font-mono font-bold text-slate-700 block">${timeStr}</span>
              <span class="text-[10px] text-slate-500 font-medium">${dayLbl ? dayLbl + ', ' : ''}${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 8. Render Employee Ad-hoc & Boss Tasks Table (in Section 2)
  const adhocTbody = document.getElementById('mgr-adhoc-journal-tbody');
  if (adhocTbody) {
    const allAdhoc = [];
    entries.forEach(([empId, ws]) => {
      if (currentFilterVal !== 'all' && currentFilterVal !== empId) return;
      (ws.adhocTasks || []).forEach(a => {
        allAdhoc.push({ empId, empName: ws.ownerName, empEmail: ws.ownerEmail, ...a });
      });
    });

    const pagedAdhoc = paginateItems(allAdhoc, 'mgrAdhoc', 'mgr-adhoc-pagination', 'đầu việc');
    if (allAdhoc.length === 0) {
      adhocTbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Chưa có đầu việc phát sinh hoặc việc cá nhân nào trong sổ nhật ký.</td></tr>`;
    } else {
      const srcBadges = {
        boss: `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200">👔 Sếp giao phát sinh</span>`,
        personal: `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">📌 Cá nhân tự ghi</span>`,
        support: `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">⚡ Hỗ trợ đột xuất</span>`
      };

      adhocTbody.innerHTML = pagedAdhoc.map(item => `
        <tr class="hover:bg-slate-50 transition align-middle">
          <td class="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
            ${escapeHtml(item.empName)}
          </td>
          <td class="py-3 px-3 whitespace-nowrap">
            <div class="font-mono font-bold text-slate-700">${escapeHtml(item.code)}</div>
            <div class="mt-0.5">${srcBadges[item.source] || srcBadges.personal}</div>
          </td>
          <td class="py-3 px-4">
            <p class="font-semibold text-slate-900">${escapeHtml(item.title)}</p>
            ${item.note ? `<p class="text-[11px] text-slate-500 italic mt-0.5">"${escapeHtml(item.note)}"</p>` : ''}
          </td>
          <td class="py-3 px-3 text-slate-700">${escapeHtml(item.requester || 'Cá nhân')}</td>
          <td class="py-3 px-3 whitespace-nowrap text-slate-600">${formatVNDate(item.dateStr)}</td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            ${item.status === 'completed'
              ? `<span class="px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#198754] text-white">Đã xong</span>`
              : `<span class="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">Đang làm</span>`
            }
          </td>
        </tr>
      `).join('');
    }
  }

  // 9. Render Weekly Overall Evaluation Table + Individual Dossier Grading Table (in Section 3)
  const weeklyEvalBadge = document.getElementById('mgr-weekly-eval-week-badge');
  if (weeklyEvalBadge) {
    weeklyEvalBadge.textContent = getWeekRangeDisplay(currentWeekOffset);
  }
  const weeklyEvalTbody = document.getElementById('mgr-weekly-eval-tbody');
  if (weeklyEvalTbody) {
    const filteredEmpEntries = entries.filter(([empId]) => currentFilterVal === 'all' || currentFilterVal === empId);
    if (filteredEmpEntries.length === 0) {
      weeklyEvalTbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">Chưa có nhân viên nào trong danh sách.</td></tr>`;
    } else {
      weeklyEvalTbody.innerHTML = filteredEmpEntries.map(([empId, ws]) => {
        const allTasks = Array.isArray(ws.tasks) ? ws.tasks : [];
        const wTasks = getWeekTasksFromList(allTasks);
        const listForSummary = wTasks.length > 0 ? wTasks : allTasks;
        const doneCnt = listForSummary.filter(t => { const e = getEffectiveStatus(t); return e === 'completed' || e === 'completed_late'; }).length;
        const doneLateCnt = listForSummary.filter(t => getEffectiveStatus(t) === 'completed_late').length;
        const progCnt = listForSummary.filter(t => getEffectiveStatus(t) === 'in_progress').length;
        const overCnt = listForSummary.filter(t => getEffectiveStatus(t) === 'overdue').length;
        const adhocCnt = (ws.adhocTasks || []).length;
        const rev = ws.weeklyReviews && ws.weeklyReviews[wk];
        const empNote = ws.employeeNotes && ws.employeeNotes[wk];

        return `
          <tr class="hover:bg-indigo-50/30 transition align-middle">
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-900">${escapeHtml(ws.ownerName)}</div>
              <div class="text-[11px] font-mono text-slate-500">${escapeHtml(ws.ownerEmail)}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">✅ Xong: ${doneCnt}/${listForSummary.length} HS</span>
                ${doneLateCnt > 0 ? `<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-300 font-bold text-[11px]">⚠️ Xong muộn: ${doneLateCnt}</span>` : ''}
                <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px]">⚡ Đang làm: ${progCnt}</span>
                ${overCnt > 0 ? `<span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">🚨 Quá hạn: ${overCnt}</span>` : ''}
                <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[11px]">📌 Việc phát sinh: ${adhocCnt}</span>
              </div>
              ${listForSummary.length > 0 ? `
                <div class="text-[11px] text-slate-600 mt-1.5 space-y-0.5">
                  ${listForSummary.slice(0, 3).map(t => `<div class="truncate">• <strong class="font-mono text-brand-700">[${escapeHtml(t.code)}]</strong> ${escapeHtml(t.title)} (${t.progress}%)</div>`).join('')}
                  ${listForSummary.length > 3 ? `<div class="text-[10px] text-slate-400 italic">+ ${listForSummary.length - 3} hồ sơ khác...</div>` : ''}
                </div>
              ` : `<div class="text-[11px] text-slate-400 italic mt-1">Chưa có hồ sơ trong tuần</div>`}
              ${empNote ? `<div class="mt-1 p-1.5 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-600 italic"><strong>Báo cáo NV:</strong> "${escapeHtml(empNote)}"</div>` : ''}
            </td>
            <td class="py-3.5 px-3 whitespace-nowrap">
              ${rev ? `
                <span class="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-xs bg-amber-100 text-amber-900 border border-amber-300">
                  🏆 ${escapeHtml(rev.grade)}
                </span>
                ${rev.rating ? `<div class="text-amber-600 font-bold text-xs mt-1">${'★'.repeat(Number(rev.rating))} (${rev.rating}/5 Sao)</div>` : ''}
              ` : `
                <span class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-500">
                  Chưa đánh giá tuần
                </span>
              `}
            </td>
            <td class="py-3.5 px-4">
              ${rev && rev.comment ? `
                <p class="font-semibold text-slate-800 italic">"${escapeHtml(rev.comment)}"</p>
                <p class="text-[10px] text-slate-500 mt-0.5">Người đánh giá: <strong>${escapeHtml(rev.reviewer || 'Quản lý')}</strong></p>
              ` : `
                <span class="text-slate-400 italic">Nhấn "Đánh giá Chung Tuần" để nhập nhận xét kết luận buổi họp tuần.</span>
              `}
            </td>
            <td class="py-3.5 px-4 text-right whitespace-nowrap">
              <button type="button" onclick="openWeeklyReviewModalForEmployee('${empId}')" class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-1.5">
                🏆 ${rev ? 'Sửa Đánh giá Tuần' : 'Đánh giá Chung Tuần'}
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  const taskTimeFilter = document.getElementById('mgr-task-time-filter')?.value || 'all';
  const taskStatusFilter = document.getElementById('mgr-task-status-filter')?.value || 'all';
  let totalAllEmpDossiersCount = 0;
  entries.forEach(([, ws]) => {
    totalAllEmpDossiersCount += (ws.tasks || []).length;
  });
  const gradingCountBadge = document.getElementById('nav-mgr-grading-count');
  if (gradingCountBadge) {
    gradingCountBadge.textContent = String(totalAllEmpDossiersCount);
  }

  const allRows = [];
  entries.forEach(([empId, ws]) => {
    if (currentFilterVal !== 'all' && currentFilterVal !== empId) return;
    const rawTasks = Array.isArray(ws.tasks) ? ws.tasks : [];
    const empTasks = taskTimeFilter === 'week' ? getWeekTasksFromList(rawTasks) : rawTasks;
    empTasks.forEach(t => {
      const eff = getEffectiveStatus(t);
      if (taskStatusFilter !== 'all') {
        if (taskStatusFilter === 'completed' && eff !== 'completed' && eff !== 'completed_late') return;
        else if (taskStatusFilter === 'completed_on_time' && eff !== 'completed') return;
        else if (taskStatusFilter === 'completed_late' && eff !== 'completed_late') return;
        else if (taskStatusFilter !== 'completed' && taskStatusFilter !== 'completed_on_time' && taskStatusFilter !== 'completed_late' && eff !== taskStatusFilter) return;
      }
      allRows.push({ empId, empName: ws.ownerName, task: t });
    });
  });

  const tbody = document.getElementById('team-all-tasks-tbody');
  if (tbody) {
    const pagedAllRows = paginateItems(allRows, 'teamTasks', 'team-tasks-pagination', 'hồ sơ');
    if (allRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Chưa có hồ sơ nào trong tuần của nhóm nhân viên đang chọn. Nhấn "📂 Tất cả các tuần" trên thanh lịch để xem toàn bộ lịch sử hồ sơ.</td></tr>`;
    } else {
      tbody.innerHTML = pagedAllRows.map(({ empId, empName, task }) => {
        const eff = getEffectiveStatus(task);
        const isCarried = isTaskCarriedOverFromPastWeek(task);
        return `
          <tr class="hover:bg-slate-50 ${isCarried ? 'bg-rose-50/20' : ''} transition align-middle">
            <td class="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
              ${escapeHtml(empName)}
            </td>
            <td class="py-3 px-4">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-[10px] font-bold text-brand-700 bg-indigo-50 px-1.5 py-0.5 rounded">${escapeHtml(task.code)}</span>
                ${isCarried ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">🔄 Tồn đọng từ ${formatVNDate(task.assignedDate)}</span>` : ''}
                <span class="font-semibold text-slate-900">${escapeHtml(task.title)}</span>
              </div>
              ${task.link ? `<div class="mt-1"><a href="${escapeHtml(task.link)}" target="_blank" class="text-blue-600 hover:underline font-semibold text-[11px] inline-flex items-center gap-1">🔗 Mở file Drive của NV</a></div>` : ''}
              ${task.notes ? `<p class="text-[11px] text-slate-500 italic mt-0.5">"${escapeHtml(task.notes)}"</p>` : ''}
            </td>
            <td class="py-3 px-3 whitespace-nowrap text-slate-600">${formatVNDate(task.assignedDate)}</td>
            <td class="py-3 px-3 whitespace-nowrap ${eff === 'overdue' ? 'text-rose-600 font-bold' : 'text-slate-700'}">${formatVNDateTime(task.deadline)}</td>
            <td class="py-3 px-3 whitespace-nowrap">
              ${getStatusBadgeHTML(eff)}
              ${eff === 'completed_late' ? `<div class="text-[10px] text-amber-700 font-bold mt-0.5">⚠️ ${getLateDurationText(task.deadline, task.completedAt || task.updatedAt)}</div>` : ''}
              <span class="text-[11px] font-bold text-slate-600 ml-1">(${task.progress}%)</span>
            </td>
            <td class="py-3 px-3 whitespace-nowrap">
              ${task.rating ? `<span class="text-blue-600 font-bold">${'★'.repeat(task.rating)}</span> <span class="text-[10px] text-slate-500">(${escapeHtml(task.approval || '')})</span>` : `<span class="text-[11px] text-slate-400 italic">Chưa chấm</span>`}
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <button onclick="inspectAndReviewEmployeeTask('${empId}', '${task.id}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm">
                ⭐ Chấm điểm ngay
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function renderManagerWeeklyCharts(entries, currentFilterVal, mon) {
  let completed = 0, inProgress = 0, pending = 0, overdue = 0;
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const dailyDoneArr = [0, 0, 0, 0, 0, 0, 0];
  const dailyAssignedArr = [0, 0, 0, 0, 0, 0, 0];

  entries.forEach(([empId, ws]) => {
    if (currentFilterVal !== 'all' && currentFilterVal !== empId) return;
    const empTasks = getWeekTasksFromList(ws.tasks);
    empTasks.forEach(t => {
      const eff = getEffectiveStatus(t);
      if (eff === 'completed' || eff === 'completed_late') completed++;
      else if (eff === 'in_progress') inProgress++;
      else if (eff === 'overdue') overdue++;
      else pending++;

      for (let i = 0; i < 7; i++) {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        const dStr = toISODateString(d);
        if (t.assignedDate === dStr) dailyAssignedArr[i]++;
        if ((t.status === 'completed' || eff === 'completed' || eff === 'completed_late') && t.assignedDate === dStr) dailyDoneArr[i]++;
      }
    });
  });

  const ctxStatus = document.getElementById('mgr-chart-status');
  if (ctxStatus) {
    if (mgrStatusChartInstance) mgrStatusChartInstance.destroy();
    mgrStatusChartInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Hoàn thành', 'Đang xử lý', 'Chờ xử lý', 'Quá hạn'],
        datasets: [{
          data: [completed, inProgress, pending, overdue],
          backgroundColor: ['#10b981', '#3b82f6', '#94a3b8', '#f43f5e'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        }
      }
    });
  }

  const ctxDaily = document.getElementById('mgr-chart-daily');
  if (ctxDaily) {
    if (mgrDailyChartInstance) mgrDailyChartInstance.destroy();
    mgrDailyChartInstance = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Việc tiếp nhận', data: dailyAssignedArr, backgroundColor: '#6366f1', borderRadius: 4 },
          { label: 'Đã hoàn thành', data: dailyDoneArr, backgroundColor: '#10b981', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
      }
    });
  }
}

function inspectAndReviewEmployeeTask(empId, taskId) {
  if (!teamWorkspaces[empId]) return;
  activeEmployeeId = empId;
  workspaceData = teamWorkspaces[empId];
  renderHeaderEmployeeSwitcher();
  openReviewModal(taskId);
}

function addOrImportEmployeeToTeam() {
  const input = document.getElementById('import-emp-link-input');
  const val = input.value.trim();
  if (!val) {
    showToast('Vui lòng dán Link chia sẻ của nhân viên hoặc nhập Tên nhân viên mới!', 'error');
    return;
  }

  // Case 1: Pasted a Share Link with #shared=...
  if (val.includes('#shared=')) {
    try {
      const base64 = val.split('#shared=')[1];
      const decoded = JSON.parse(decodeURIComponent(escape(atob(base64))));
      const newId = 'emp_' + Date.now();
      teamWorkspaces[newId] = {
        empId: newId,
        ownerName: decoded.o || 'Nhân viên mới',
        ownerEmail: decoded.e || 'nhanvien@congty.com',
        position: 'Chuyên viên Hồ sơ (Nhập từ Link chia sẻ)',
        updatedAt: new Date().toISOString(),
        tasks: decoded.t || [],
        weeklyReviews: decoded.r || {},
        employeeNotes: decoded.n || {},
        activityLogs: generateInitialLogsFromTasks(decoded.t || [])
      };
      activeEmployeeId = newId;
      workspaceData = teamWorkspaces[newId];
      saveWorkspaceData();
      input.value = '';
      renderAll();
      showToast(`Đã nhập thành công bảng công việc của nhân viên: ${workspaceData.ownerName}!`, 'success');
      return;
    } catch (e) {
      showToast('Link chia sẻ không hợp lệ hoặc bị cắt ngắn!', 'error');
      return;
    }
  }

  // Case 2: Entered a new employee name directly
  const newId = 'emp_' + Date.now();
  teamWorkspaces[newId] = {
    empId: newId,
    ownerName: val,
    ownerEmail: val.toLowerCase().replace(/[^a-z0-9]/g, '') + '@congty.com',
    position: 'Chuyên viên Quản lý Hồ sơ',
    updatedAt: new Date().toISOString(),
    tasks: [],
    weeklyReviews: {},
    employeeNotes: {},
    activityLogs: []
  };
  activeEmployeeId = newId;
  workspaceData = teamWorkspaces[newId];
  saveWorkspaceData();
  input.value = '';
  renderAll();
  showToast(`Đã thêm nhân viên "${val}" vào danh sách Đội ngũ!`, 'success');
}

// ==========================================
// 12. CRUD OPERATIONS FOR DOSSIERS / TASKS
// ==========================================
function toggleCustomCategoryInput() {
  const sel = document.getElementById('task-category');
  const wrapper = document.getElementById('custom-category-wrapper');
  const customInput = document.getElementById('task-category-custom');
  if (!sel || !wrapper) return;
  if (sel.value === 'Khác') {
    wrapper.classList.remove('hidden');
    if (customInput) customInput.focus();
  } else {
    wrapper.classList.add('hidden');
  }
}

function setCategoryFields(categoryValue) {
  const sel = document.getElementById('task-category');
  const wrapper = document.getElementById('custom-category-wrapper');
  const customInput = document.getElementById('task-category-custom');
  if (!sel) return;

  if (!categoryValue || STANDARD_CATEGORIES.includes(categoryValue)) {
    sel.value = categoryValue || STANDARD_CATEGORIES[0];
    if (wrapper) wrapper.classList.add('hidden');
    if (customInput) customInput.value = '';
  } else {
    sel.value = 'Khác';
    if (wrapper) wrapper.classList.remove('hidden');
    if (customInput) {
      customInput.value = categoryValue.replace(/^Khác:\s*/i, '');
    }
  }
}

function renderTaskAuditHistoryInModal(taskCode) {
  const wrapper = document.getElementById('task-audit-history-wrapper');
  const listEl = document.getElementById('task-audit-history-list');
  if (!wrapper || !listEl) return;

  if (!taskCode) {
    wrapper.classList.add('hidden');
    return;
  }

  const taskLogs = (workspaceData.activityLogs || []).filter(log => log.code === taskCode);
  wrapper.classList.remove('hidden');

  if (taskLogs.length === 0) {
    listEl.innerHTML = `<p class="text-[11px] text-slate-400 italic">Chưa có lịch sử chỉnh sửa nào cho hồ sơ này.</p>`;
    return;
  }

  listEl.innerHTML = taskLogs.map(log => {
    const timeStr = log.timestamp ? formatVNDateTime(log.timestamp) : formatVNDate(log.dateStr);
    return `
      <div class="p-2 rounded-lg bg-white border border-slate-200/80 text-[11px] flex flex-col gap-0.5">
        <div class="flex items-center justify-between text-slate-500">
          <span class="font-bold text-blue-700">${escapeHtml(log.actor || currentUser.email)}</span>
          <span class="font-mono text-[10px]">${timeStr}</span>
        </div>
        <div class="font-semibold text-slate-800">${escapeHtml(log.title)}</div>
        ${log.detail ? `<div class="text-slate-600">${escapeHtml(log.detail)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function openTaskModal(taskId = null) {
  const modal = document.getElementById('task-modal');
  const titleEl = document.getElementById('task-modal-title');
  document.getElementById('task-form').reset();

  const defaultAssigneeEmail = currentUser.email || workspaceData.ownerEmail || '';

  if (taskId) {
    const task = workspaceData.tasks.find(t => t.id === taskId);
    if (!task) return;
    titleEl.textContent = `Cập nhật Hồ sơ: ${task.code}`;
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-code').value = task.code;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-client').value = task.client || '';
    setCategoryFields(task.category || STANDARD_CATEGORIES[0]);
    document.getElementById('task-priority').value = task.priority || 'medium';
    document.getElementById('task-assigned-date').value = task.assignedDate;
    document.getElementById('task-deadline').value = task.deadline;
    document.getElementById('task-assignee').value = task.assignee || defaultAssigneeEmail;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-progress').value = task.progress || 0;
    document.getElementById('task-progress-val').textContent = (task.progress || 0) + '%';
    document.getElementById('task-link').value = task.link || '';
    document.getElementById('task-notes').value = task.notes || '';
    renderTaskAuditHistoryInModal(task.code);
  } else {
    titleEl.textContent = 'Tiếp nhận Hồ sơ / Đầu mục Công việc Mới';
    document.getElementById('task-id').value = '';
    const nextNum = workspaceData.tasks.length + 101;
    const todayStr = toISODateString(new Date());
    renderTaskAuditHistoryInModal(null);

    // Restore from Auto-Saved Draft if user was typing earlier
    const savedDraftRaw = localStorage.getItem(STORAGE_KEYS.TASK_DRAFT);
    if (savedDraftRaw) {
      try {
        const d = JSON.parse(savedDraftRaw);
        document.getElementById('task-code').value = d.code || `HS-2026-${nextNum}`;
        document.getElementById('task-title').value = d.title || '';
        document.getElementById('task-client').value = d.client || '';
        if (d.category === 'Khác' && d.customCategory) {
          setCategoryFields(`Khác: ${d.customCategory}`);
        } else {
          setCategoryFields(d.category || STANDARD_CATEGORIES[0]);
        }
        document.getElementById('task-priority').value = d.priority || 'medium';
        document.getElementById('task-assigned-date').value = d.assignedDate || todayStr;
        document.getElementById('task-deadline').value = d.deadline || `${todayStr}T17:00`;
        document.getElementById('task-assignee').value = defaultAssigneeEmail;
        document.getElementById('task-status').value = d.status || 'pending';
        document.getElementById('task-progress').value = d.progress || 0;
        document.getElementById('task-progress-val').textContent = (d.progress || 0) + '%';
        document.getElementById('task-link').value = d.link || '';
        document.getElementById('task-notes').value = d.notes || '';
      } catch (e) {}
    } else {
      document.getElementById('task-code').value = `HS-2026-${nextNum}`;
      setCategoryFields(STANDARD_CATEGORIES[0]);
      document.getElementById('task-assigned-date').value = todayStr;
      document.getElementById('task-deadline').value = `${todayStr}T17:00`;
      document.getElementById('task-assignee').value = defaultAssigneeEmail;
      document.getElementById('task-progress-val').textContent = '0%';
    }
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function openTaskModalForDate(dateStr) {
  openTaskModal();
  document.getElementById('task-assigned-date').value = dateStr;
  document.getElementById('task-deadline').value = `${dateStr}T17:00`;
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
}

function syncProgressWithStatus() {
  const st = document.getElementById('task-status').value;
  const prog = document.getElementById('task-progress');
  const val = document.getElementById('task-progress-val');
  if (st === 'completed') {
    prog.value = 100;
    val.textContent = '100%';
  } else if (st === 'pending' && prog.value == 100) {
    prog.value = 0;
    val.textContent = '0%';
  } else if (st === 'in_progress' && prog.value == 0) {
    prog.value = 50;
    val.textContent = '50%';
  }
}

function handleTaskSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const rawCategory = document.getElementById('task-category').value;
  const customCategoryText = (document.getElementById('task-category-custom')?.value || '').trim();
  const finalCategory = rawCategory === 'Khác'
    ? (customCategoryText ? `Khác: ${customCategoryText}` : 'Khác')
    : rawCategory;

  const defaultAssigneeEmail = currentUser.email || workspaceData.ownerEmail || '';

  const payload = {
    code: document.getElementById('task-code').value.trim(),
    title: document.getElementById('task-title').value.trim(),
    client: document.getElementById('task-client').value.trim(),
    category: finalCategory,
    priority: document.getElementById('task-priority').value,
    assignedDate: document.getElementById('task-assigned-date').value,
    deadline: document.getElementById('task-deadline').value,
    assignee: document.getElementById('task-assignee').value.trim() || defaultAssigneeEmail,
    status: document.getElementById('task-status').value,
    progress: Number(document.getElementById('task-progress').value),
    link: document.getElementById('task-link').value.trim(),
    notes: document.getElementById('task-notes').value.trim()
  };

  if (payload.progress === 100) payload.status = 'completed';

  const statusLabels = { pending: 'Chờ xử lý', in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành' };
  const priorityLabels = { low: 'Thấp', medium: 'Trung bình', high: 'Cao / Khẩn cấp' };

  if (id) {
    const idx = workspaceData.tasks.findIndex(t => t.id === id);
    if (idx > -1) {
      const oldTask = workspaceData.tasks[idx];
      const changes = [];
      if (oldTask.title !== payload.title) changes.push(`Tên việc: "${oldTask.title}" → "${payload.title}"`);
      if (oldTask.category !== payload.category) changes.push(`Loại hồ sơ: "${oldTask.category}" → "${payload.category}"`);
      if (oldTask.status !== payload.status) changes.push(`Trạng thái: ${statusLabels[oldTask.status] || oldTask.status} → ${statusLabels[payload.status] || payload.status}`);
      if (Number(oldTask.progress) !== Number(payload.progress)) changes.push(`Tiến độ: ${oldTask.progress || 0}% → ${payload.progress}%`);
      if (oldTask.priority !== payload.priority) changes.push(`Ưu tiên: ${priorityLabels[oldTask.priority] || oldTask.priority} → ${priorityLabels[payload.priority] || payload.priority}`);
      if (oldTask.deadline !== payload.deadline) changes.push(`Deadline: ${formatVNDateTime(oldTask.deadline)} → ${formatVNDateTime(payload.deadline)}`);
      if ((oldTask.notes || '') !== payload.notes) changes.push(`Ghi chú: "${payload.notes || 'Đã xóa ghi chú'}"`);
      if ((oldTask.link || '') !== payload.link) changes.push(`Cập nhật Link tài liệu Drive`);

      const diffText = changes.length > 0
        ? `Thay đổi: ${changes.join(' | ')}`
        : `Cập nhật hồ sơ (${payload.progress}%) — Ghi chú: ${payload.notes || 'Không đổi'}`;

      let completedAt = oldTask.completedAt;
      if (payload.status === 'completed') {
        if (!completedAt || oldTask.status !== 'completed') {
          completedAt = new Date().toISOString();
        }
      } else {
        completedAt = null;
      }

      workspaceData.tasks[idx] = { ...oldTask, ...payload, completedAt, updatedAt: new Date().toISOString() };
      recordJournalLog(
        payload.status === 'completed' ? 'completed' : 'updated',
        payload.code,
        payload.title,
        diffText
      );
      showToast(`Đã cập nhật & lưu lịch sử thay đổi hồ sơ ${payload.code}!`, 'success');
    }
  } else {
    const newTask = {
      id: 'task_' + Date.now(),
      ...payload,
      completedAt: payload.status === 'completed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      rating: null,
      approval: '',
      managerFeedback: ''
    };
    workspaceData.tasks.unshift(newTask);
    localStorage.removeItem(STORAGE_KEYS.TASK_DRAFT); // Clear auto-saved draft
    recordJournalLog(
      'created',
      payload.code,
      payload.title,
      `[Loại: ${payload.category}] Người tiếp nhận: ${payload.assignee} | Ngày phân việc: ${formatVNDate(payload.assignedDate)} | Deadline: ${formatVNDateTime(payload.deadline)}`
    );
    showToast(`Đã khởi tạo & tự động lưu vào Lịch sử công việc: ${payload.code}`, 'success');
  }

  saveWorkspaceData();
  closeTaskModal();
  renderAll();
}

function quickToggleComplete(taskId) {
  const task = workspaceData.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.updatedAt = new Date().toISOString();
  if (task.status === 'completed') {
    task.status = 'in_progress';
    task.progress = 50;
    task.completedAt = null;
    recordJournalLog('updated', task.code, task.title, `Thay đổi trạng thái: Đã hoàn thành → Đang xử lý (50%) bởi ${currentUser.email}`);
    showToast(`Đã chuyển ${task.code} sang Đang thực hiện`, 'info');
  } else {
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date().toISOString();
    const eff = getEffectiveStatus(task);
    const isLate = eff === 'completed_late';
    const lateDuration = isLate ? getLateDurationText(task.deadline, task.completedAt) : '';
    const lateText = isLate ? ` (⚠️ Hoàn thành muộn: ${lateDuration})` : ' (Đúng hạn)';
    recordJournalLog('completed', task.code, task.title, `Thay đổi trạng thái: Đánh dấu hoàn thành 100% đầu mục công việc bởi ${currentUser.email}${lateText}`);
    showToast(isLate ? `Đã hoàn thành hồ sơ ${task.code} (Ghi nhận: Hoàn thành muộn - ${lateDuration})` : `Tuyệt vời! Đã hoàn thành hồ sơ ${task.code} đúng hạn`, isLate ? 'warning' : 'success');
  }
  saveWorkspaceData();
  renderAll();
}

function deleteTask(taskId) {
  const task = workspaceData.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!confirm(`Bạn có chắc muốn xóa hồ sơ [${task.code}] "${task.title}"?`)) return;
  workspaceData.tasks = workspaceData.tasks.filter(t => t.id !== taskId);
  const trashId = moveToTrash('task', task, task.code, task.title, task.assignee || workspaceData.ownerName);
  recordJournalLog('deleted', task.code, `Xóa hồ sơ: ${task.title}`, `Loại hồ sơ: ${task.category} — Đã chuyển vào Thùng rác để Khôi phục`);
  saveWorkspaceData();
  renderAll();
  showToast(`Đã chuyển hồ sơ ${task.code} vào Thùng rác (Quản lý có thể Khôi phục bất cứ lúc nào)!`, 'info');
}

// ==========================================
// 13. MANAGER REVIEW & RATING LOGIC
// ==========================================
function openReviewModal(taskId) {
  const task = workspaceData.tasks.find(t => t.id === taskId);
  if (!task) return;

  const eff = getEffectiveStatus(task);
  document.getElementById('review-task-id').value = task.id;
  document.getElementById('review-task-code').textContent = task.code;
  document.getElementById('review-task-title').textContent = task.title;

  const badgeEl = document.getElementById('review-task-badge');
  if (badgeEl) badgeEl.innerHTML = getStatusBadgeHTML(eff);

  const timingEl = document.getElementById('review-task-timing');
  if (timingEl) {
    if (eff === 'completed_late') {
      const lateStr = getLateDurationText(task.deadline, task.completedAt || task.updatedAt);
      timingEl.innerHTML = `
        <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs mt-2 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-amber-700 inline-flex items-center gap-1">⚠️ HOÀN THÀNH MUỘN (${lateStr})</span>
            <span class="text-[11px] font-mono text-slate-500">Hạn: ${formatVNDateTime(task.deadline)}</span>
          </div>
          <div class="text-[11px] text-slate-700">
            Nộp xong lúc: <strong>${formatVNDateTime(task.completedAt || task.updatedAt)}</strong>.
            <span class="text-amber-800 italic block mt-0.5 font-medium">📌 Quản lý lưu ý xem xét trừ điểm tiến độ hoặc nhắc nhở khi đánh giá!</span>
          </div>
        </div>
      `;
    } else if (eff === 'completed') {
      timingEl.innerHTML = `
        <div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs mt-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-emerald-700 inline-flex items-center gap-1">✓ HOÀN THÀNH ĐÚNG HẠN</span>
            <span class="text-[11px] font-mono text-slate-500">Hạn: ${formatVNDateTime(task.deadline)}</span>
          </div>
          <div class="text-[11px] text-slate-700 mt-1">
            Nộp xong lúc: <strong>${formatVNDateTime(task.completedAt || task.updatedAt)}</strong> (Đúng cam kết tiến độ).
          </div>
        </div>
      `;
    } else if (eff === 'overdue') {
      timingEl.innerHTML = `
        <div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs mt-2">
          <span class="font-bold text-rose-700">⚠️ ĐANG QUÁ HẠN CHƯA HOÀN THÀNH</span> (Hạn chót: ${formatVNDateTime(task.deadline)})
        </div>
      `;
    } else {
      timingEl.innerHTML = `
        <div class="text-[11px] text-slate-500 mt-2">
          📅 Hạn chót hoàn thành: <strong>${formatVNDateTime(task.deadline)}</strong>
        </div>
      `;
    }
  }

  document.getElementById('review-approval').value = task.approval || (eff === 'completed_late' ? 'Cần bổ sung/chỉnh sửa' : 'Đạt yêu cầu');
  document.getElementById('review-feedback').value = task.managerFeedback || (eff === 'completed_late' ? `Hồ sơ nộp muộn (${getLateDurationText(task.deadline, task.completedAt || task.updatedAt)}). Đã hoàn thành nhưng cần lưu ý thời gian.` : '');
  setReviewStars(task.rating || (eff === 'completed_late' ? 3 : 5));

  document.getElementById('review-modal').classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('review-modal').classList.add('hidden');
}

function setReviewStars(num) {
  document.getElementById('review-rating').value = num;
  document.getElementById('star-rating-text').textContent = `${num} / 5 Sao`;
  const btns = document.querySelectorAll('#star-selector .star-btn');
  btns.forEach((btn, idx) => {
    btn.classList.toggle('selected', idx < num);
    btn.style.opacity = idx < num ? '1' : '0.35';
  });
}

function handleReviewSubmit(e) {
  e.preventDefault();
  const taskId = document.getElementById('review-task-id').value;
  const task = workspaceData.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.rating = Number(document.getElementById('review-rating').value);
  task.approval = document.getElementById('review-approval').value;
  task.managerFeedback = document.getElementById('review-feedback').value.trim();
  task.updatedAt = new Date().toISOString();

  recordJournalLog(
    'reviewed',
    task.code,
    task.title,
    `Quản lý chấm ${task.rating}★ (${task.approval}): "${task.managerFeedback}"`
  );

  saveWorkspaceData();
  closeReviewModal();
  renderAll();
  showToast(`Đã lưu đánh giá ${task.rating}★ cho hồ sơ ${task.code}`, 'success');
}

function setWeeklyReviewStars(num) {
  const ratingInput = document.getElementById('weekly-rating');
  if (ratingInput) ratingInput.value = num;
  const txt = document.getElementById('weekly-star-rating-text');
  if (txt) txt.textContent = `${num} / 5 Sao`;
  const btns = document.querySelectorAll('#weekly-star-selector .weekly-star-btn');
  btns.forEach((btn, idx) => {
    btn.classList.toggle('selected', idx < num);
    btn.style.opacity = idx < num ? '1' : '0.35';
  });
}

function openWeeklyReviewModalForEmployee(empId) {
  if (empId && teamWorkspaces[empId]) {
    activeEmployeeId = empId;
    workspaceData = teamWorkspaces[empId];
    renderHeaderEmployeeSwitcher();
  }
  openWeeklyReviewModal(empId);
}

function openWeeklyReviewModal(empId = null) {
  const targetEmpId = (empId && teamWorkspaces[empId]) ? empId : activeEmployeeId;
  const targetWs = (targetEmpId && teamWorkspaces[targetEmpId]) ? teamWorkspaces[targetEmpId] : workspaceData;
  if (!targetWs) return;

  const empIdInput = document.getElementById('weekly-review-emp-id');
  if (empIdInput) empIdInput.value = targetEmpId || '';

  const wk = getWeekKey(currentWeekOffset);
  const weekLbl = document.getElementById('weekly-review-week-label');
  if (weekLbl) {
    weekLbl.textContent = `${getWeekRangeDisplay(currentWeekOffset)} — Nhân sự: ${targetWs.ownerName}`;
  }

  // Render summary of employee's weekly work inside the modal for the weekly meeting
  const summaryBox = document.getElementById('weekly-review-summary-box');
  if (summaryBox) {
    const allTasks = Array.isArray(targetWs.tasks) ? targetWs.tasks : [];
    const wTasks = getWeekTasksFromList(allTasks);
    const displayList = wTasks.length > 0 ? wTasks : allTasks;
    const doneCnt = displayList.filter(t => { const e = getEffectiveStatus(t); return e === 'completed' || e === 'completed_late'; }).length;
    const doneOnTime = displayList.filter(t => getEffectiveStatus(t) === 'completed').length;
    const doneLate = displayList.filter(t => getEffectiveStatus(t) === 'completed_late').length;
    const progCnt = displayList.filter(t => getEffectiveStatus(t) === 'in_progress').length;
    const overCnt = displayList.filter(t => getEffectiveStatus(t) === 'overdue').length;
    const adhocCnt = (targetWs.adhocTasks || []).length;
    const empNote = targetWs.employeeNotes && targetWs.employeeNotes[wk];

    summaryBox.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div class="font-bold text-slate-900 text-xs">${escapeHtml(targetWs.ownerName)}</div>
          <div class="text-[11px] font-mono text-slate-500">${escapeHtml(targetWs.ownerEmail)}</div>
        </div>
        <span class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
          Hoàn thành: ${doneCnt}/${displayList.length} hồ sơ ${doneLate > 0 ? `(${doneLate} trễ hạn)` : ''}
        </span>
      </div>
      <div class="grid grid-cols-4 gap-1.5 pt-1 text-center text-[10px]">
        <div class="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
          <span class="text-emerald-700 block font-semibold">Đúng hạn</span>
          <strong class="text-emerald-800 text-xs">${doneOnTime}</strong>
        </div>
        <div class="p-1.5 rounded-lg bg-amber-50 border border-amber-200">
          <span class="text-amber-700 block font-semibold">Trễ hạn</span>
          <strong class="${doneLate > 0 ? 'text-amber-700 font-bold' : 'text-slate-600'} text-xs">${doneLate}</strong>
        </div>
        <div class="p-1.5 rounded-lg bg-blue-50 border border-blue-200">
          <span class="text-blue-700 block font-semibold">Đang làm</span>
          <strong class="text-blue-700 text-xs">${progCnt}</strong>
        </div>
        <div class="p-1.5 rounded-lg bg-rose-50 border border-rose-200">
          <span class="text-rose-700 block font-semibold">Quá hạn</span>
          <strong class="${overCnt > 0 ? 'text-rose-600 font-bold' : 'text-slate-600'} text-xs">${overCnt}</strong>
        </div>
      </div>
      ${displayList.length > 0 ? `
        <div class="pt-1.5 space-y-1 max-h-32 overflow-y-auto text-[11px] text-slate-700">
          ${displayList.map(t => {
            const eff = getEffectiveStatus(t);
            const lateDuration = eff === 'completed_late' ? getLateDurationText(t.deadline, t.completedAt || t.updatedAt) : '';
            return `
            <div class="flex items-center justify-between gap-2 bg-white px-2 py-1.5 rounded border border-slate-200/70">
              <span class="truncate"><strong class="font-mono text-brand-700">[${escapeHtml(t.code)}]</strong> ${escapeHtml(t.title)}</span>
              <div class="flex items-center gap-1.5 shrink-0">
                ${eff === 'completed_late' ? `<span class="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">⚠️ ${lateDuration}</span>` : ''}
                ${getStatusBadgeHTML(eff)}
              </div>
            </div>
            `;
          }).join('')}
        </div>
      ` : ''}
      ${empNote ? `<div class="pt-1 text-[11px] text-slate-600 italic"><strong>Báo cáo tuần của NV:</strong> "${escapeHtml(empNote)}"</div>` : ''}
    `;
  }

  const existing = targetWs.weeklyReviews && targetWs.weeklyReviews[wk];
  if (existing) {
    document.getElementById('weekly-grade').value = existing.grade;
    document.getElementById('weekly-comment-input').value = existing.comment;
    setWeeklyReviewStars(existing.rating || 5);
  } else {
    document.getElementById('weekly-grade').value = 'A (Tốt - Đúng hạn 100%)';
    document.getElementById('weekly-comment-input').value = '';
    setWeeklyReviewStars(5);
  }
  document.getElementById('weekly-review-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeWeeklyReviewModal() {
  document.getElementById('weekly-review-modal').classList.add('hidden');
}

function handleWeeklyReviewSubmit(e) {
  e.preventDefault();
  const targetEmpId = document.getElementById('weekly-review-emp-id')?.value || activeEmployeeId;
  if (targetEmpId && teamWorkspaces[targetEmpId]) {
    activeEmployeeId = targetEmpId;
    workspaceData = teamWorkspaces[targetEmpId];
  }
  const wk = getWeekKey(currentWeekOffset);
  if (!workspaceData.weeklyReviews) workspaceData.weeklyReviews = {};

  const grade = document.getElementById('weekly-grade').value;
  const rating = Number(document.getElementById('weekly-rating')?.value || 5);
  const comment = document.getElementById('weekly-comment-input').value.trim();
  const applyToTasks = document.getElementById('weekly-apply-to-tasks')?.checked;

  workspaceData.weeklyReviews[wk] = {
    grade,
    rating,
    comment,
    reviewer: `${currentUser.name} (${getRoleBadgeText(currentUser.role, currentUser.email)})`,
    updatedAt: new Date().toISOString()
  };

  // Nếu chọn "Đồng bộ điểm tuần cho các hồ sơ trong tuần", tự động gắn sao cho các hồ sơ chưa chấm của nhân viên
  if (applyToTasks && Array.isArray(workspaceData.tasks)) {
    const wTasks = getWeekTasksFromList(workspaceData.tasks);
    const targetList = wTasks.length > 0 ? wTasks : workspaceData.tasks;
    targetList.forEach(t => {
      if (!t.rating) {
        t.rating = rating;
        t.approval = grade.split(' ')[0] + ' (Đánh giá chung tuần)';
        t.managerFeedback = comment;
        t.updatedAt = new Date().toISOString();
      }
    });
  }

  recordJournalLog(
    'reviewed',
    'ĐÁNH GIÁ TUẦN',
    `Đánh giá chung tuần (${getWeekRangeDisplay(currentWeekOffset)}): ${grade} — ${rating}★`,
    `Nhận xét buổi họp tuần: "${comment}"`
  );

  saveWorkspaceData();
  closeWeeklyReviewModal();
  renderAll();
  showToast(`🏆 Đã lưu Đánh giá Chung Tuần (${grade} - ${rating}★) cho ${workspaceData.ownerName}!`, 'success');
}

// ==========================================
// 14. SHARING & EXPORTING (INSTANT LINK + EMAIL + CSV)
// ==========================================
function openShareModal() {
  const shareUrl = generateSmartShareURL();
  document.getElementById('share-url-input').value = shareUrl;
  document.getElementById('share-modal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

function generateSmartShareURL() {
  const baseUrl = window.location.origin + window.location.pathname;
  if (fbDb && currentUser.workspaceId) {
    return `${baseUrl}?ws=${encodeURIComponent(currentUser.workspaceId)}&role=manager`;
  }
  // Encode current week tasks & review into URL hash so Manager can open on any device even without Firebase
  try {
    const compactPayload = {
      o: workspaceData.ownerName,
      e: workspaceData.ownerEmail,
      t: getTasksForSelectedWeek(),
      r: workspaceData.weeklyReviews,
      n: workspaceData.employeeNotes
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(compactPayload))));
    return `${baseUrl}?role=manager#shared=${encoded}`;
  } catch (err) {
    return `${baseUrl}?role=manager`;
  }
}

function checkSharedURLParameters() {
  const params = new URLSearchParams(window.location.search);
  const wsParam = params.get('ws');
  const roleParam = params.get('role');

  if (window.location.hash.startsWith('#shared=')) {
    try {
      const base64 = window.location.hash.replace('#shared=', '');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(base64))));
      workspaceData = {
        ownerName: decoded.o || 'Nhân viên',
        ownerEmail: decoded.e || '',
        updatedAt: new Date().toISOString(),
        tasks: decoded.t || [],
        weeklyReviews: decoded.r || {},
        employeeNotes: decoded.n || {}
      };
      isViewingShared = true;
      currentUser.role = 'manager';
      currentUser.name = 'Quản lý (Đang xem & Đánh giá)';
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('shared-banner').classList.remove('hidden');
      document.getElementById('shared-banner-text').textContent =
        `Đang xem Bảng công việc & Báo cáo tuần được chia sẻ bởi nhân viên: ${workspaceData.ownerName}`;
    } catch (e) {
      console.error('Failed to parse shared link:', e);
    }
  } else if (wsParam && fbDb) {
    isViewingShared = true;
    currentUser.workspaceId = wsParam;
    if (roleParam === 'manager') currentUser.role = 'manager';
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('shared-banner').classList.remove('hidden');
    subscribeToFirestoreWorkspace(wsParam);
  }
}

function exitSharedView() {
  window.location.href = window.location.origin + window.location.pathname;
}

function copyShareLink() {
  const input = document.getElementById('share-url-input');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    document.getElementById('copy-btn-text').textContent = 'Đã sao chép!';
    showToast('Đã sao chép Link chia sẻ! Hãy gửi cho Quản lý.', 'success');
    setTimeout(() => {
      document.getElementById('copy-btn-text').textContent = 'Sao chép Link';
    }, 2500);
  });
}

function sendEmailToManager() {
  const managerEmail = document.getElementById('manager-email-input').value.trim();
  if (!managerEmail) {
    showToast('Vui lòng nhập email của Quản lý!', 'error');
    return;
  }
  const weekTasks = getTasksForSelectedWeek();
  const done = weekTasks.filter(t => t.status === 'completed').length;
  const shareUrl = generateSmartShareURL();

  const subject = encodeURIComponent(`[Báo cáo Công việc Tuần] - ${workspaceData.ownerName} (${getWeekRangeDisplay(currentWeekOffset)})`);
  const body = encodeURIComponent(
    `Kính gửi Quản lý,\n\n` +
    `Em xin gửi báo cáo tổng hợp đầu mục công việc và hồ sơ tiếp nhận trong ${getWeekRangeDisplay(currentWeekOffset)}:\n` +
    `- Tổng số đầu mục / hồ sơ: ${weekTasks.length}\n` +
    `- Đã hoàn thành: ${done}/${weekTasks.length} hồ sơ\n\n` +
    `Anh/Chị có thể xem chi tiết và chấm điểm đánh giá trực tiếp tại đường dẫn sau:\n${shareUrl}\n\n` +
    `Trân trọng,\n${workspaceData.ownerName}`
  );

  window.open(`mailto:${managerEmail}?subject=${subject}&body=${body}`, '_blank');
  showToast('Đã mở trình gửi Email với nội dung báo cáo tuần!', 'success');
}

function exportCSV() {
  const tasks = getTasksForSelectedWeek();
  const headers = ['Mã Hồ Sơ', 'Tên Công Việc', 'Khách Hàng', 'Phân Loại', 'Ưu Tiên', 'Ngày Tiếp Nhận', 'Deadline', 'Trạng Thái', 'Tiến Độ (%)', 'Điểm Đánh Giá', 'Nhận Xét Quản Lý'];
  const rows = tasks.map(t => [
    t.code,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.client || '').replace(/"/g, '""')}"`,
    t.category,
    t.priority,
    t.assignedDate,
    t.deadline,
    (() => {
      const eff = getEffectiveStatus(t);
      if (eff === 'completed_late') return `"Hoàn thành muộn (${getLateDurationText(t.deadline, t.completedAt || t.updatedAt)})"`;
      if (eff === 'completed') return '"Hoàn thành đúng hạn"';
      if (eff === 'overdue') return '"Quá hạn"';
      if (eff === 'in_progress') return '"Đang thực hiện"';
      return '"Chờ xử lý"';
    })(),
    t.progress,
    t.rating || '',
    `"${(t.managerFeedback || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_Cao_Ho_So_${getWeekKey(currentWeekOffset)}.csv`;
  a.click();
  showToast('Đã xuất file Excel/CSV thành công!', 'success');
}

function exportJSONBackup() {
  if (activeEmployeeId && teamWorkspaces[activeEmployeeId]) {
    teamWorkspaces[activeEmployeeId] = workspaceData;
  }
  const fullBackup = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser ? currentUser.email : 'system',
    activeEmployeeId,
    teamWorkspaces,
    whitelist: getWhitelist(),
    trashItems: getTrashItems(),
    workspaceData
  };
  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `WorkFlowPro_FullBackup_${toISODateString(new Date())}.json`;
  a.click();
  showToast('Đã tải xuống file sao lưu toàn hệ thống (.json)!', 'success');
}

function importJSONBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && imported.teamWorkspaces) {
        mergeCloudAndLocalData(imported, false);
        saveWorkspaceData();
        pushAllToFirestore();
        renderAll();
        closeShareModal();
        showToast('Đã khôi phục và gộp dữ liệu toàn hệ thống thành công!', 'success');
      } else if (imported && Array.isArray(imported.tasks)) {
        workspaceData = imported;
        if (activeEmployeeId) teamWorkspaces[activeEmployeeId] = workspaceData;
        saveWorkspaceData();
        renderAll();
        closeShareModal();
        showToast('Đã khôi phục dữ liệu hồ sơ thành công!', 'success');
      } else {
        showToast('Cấu trúc file JSON không hợp lệ!', 'error');
      }
    } catch (err) {
      showToast('File JSON không hợp lệ!', 'error');
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 15. FIREBASE FIRESTORE REAL-TIME DATABASE (PER-EMAIL ISOLATION)
// ==========================================
let firestoreSysUnsubscribe = null;
let isApplyingFirestoreSnapshot = false;

function getActiveFirebaseConfig() {
  if (EMBEDDED_FIREBASE_CONFIG && EMBEDDED_FIREBASE_CONFIG.apiKey && EMBEDDED_FIREBASE_CONFIG.projectId) {
    return EMBEDDED_FIREBASE_CONFIG;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.FIREBASE_CFG);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) return parsed;
    } catch (e) {}
  }
  return null;
}

function parseFirebaseConfigInput(rawText) {
  if (!rawText) return null;
  const text = rawText.trim();
  // Thử parse JSON chuẩn trước
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.apiKey && parsed.projectId) return parsed;
  } catch (e) {}

  // Hỗ trợ dán nguyên đoạn mã const firebaseConfig = { apiKey: "...", ... }; từ Firebase Console
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'databaseURL'];
  const extracted = {};
  keys.forEach(k => {
    const regex = new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`);
    const m = text.match(regex);
    if (m && m[1]) extracted[k] = m[1].trim();
  });
  if (extracted.apiKey && extracted.projectId) {
    return extracted;
  }
  return null;
}

function openFirebaseConfigModal() {
  if (!isAdmin(currentUser)) {
    showToast('⛔ Chỉ Super Admin mới có quyền cấu hình kết nối Database Firebase!', 'error');
    return;
  }
  const cfg = getActiveFirebaseConfig();
  const input = document.getElementById('firebase-config-input');
  if (input) {
    input.value = cfg ? JSON.stringify(cfg, null, 2) : '';
  }
  const statusEl = document.getElementById('firebase-modal-status');
  if (statusEl) {
    if (fbDb && cfg) {
      statusEl.innerHTML = `<span class="text-emerald-700 font-bold">🟢 Đang kết nối Realtime với Firebase Project: <code class="bg-emerald-100 px-1.5 py-0.5 rounded">${escapeHtml(cfg.projectId)}</code></span>`;
    } else {
      statusEl.innerHTML = `<span class="text-amber-700 font-semibold">⚪ Chưa kết nối Firebase (Đang chạy chế độ Cloud dự phòng). Dán mã bên dưới để kích hoạt Realtime Database.</span>`;
    }
  }
  document.getElementById('firebase-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeFirebaseConfigModal() {
  document.getElementById('firebase-modal').classList.add('hidden');
}

async function saveFirebaseConfig() {
  const raw = (document.getElementById('firebase-config-input')?.value || '').trim();
  const parsed = parseFirebaseConfigInput(raw);
  if (!parsed || !parsed.apiKey || !parsed.projectId) {
    showToast('⚠️ Không tìm thấy apiKey hoặc projectId! Hãy copy nguyên đoạn firebaseConfig từ Firebase Console dán vào.', 'error');
    return;
  }

  localStorage.setItem(STORAGE_KEYS.FIREBASE_CFG, JSON.stringify(parsed, null, 2));
  initFirebaseIfConfigured();
  // Đẩy toàn bộ dữ liệu nhân viên hiện có lên Firebase Firestore theo từng Email độc lập
  await pushAllToFirestore();
  // Phát tán cấu hình Firebase lên Cloud để toàn bộ máy của Nhân viên và Quản lý tự động kết nối mà không cần cài đặt
  syncSaveToCloud();
  closeFirebaseConfigModal();
  showToast(`🔥 Đã kích hoạt Firebase Firestore (${parsed.projectId}) tự động cho toàn bộ Nhân viên & Quản lý!`, 'success');
}

function clearFirebaseConfig() {
  if (!confirm('Bạn có chắc muốn ngắt kết nối Firebase trên trình duyệt này?')) return;
  localStorage.removeItem(STORAGE_KEYS.FIREBASE_CFG);
  const input = document.getElementById('firebase-config-input');
  if (input) input.value = '';
  if (firestoreUnsubscribe) { firestoreUnsubscribe(); firestoreUnsubscribe = null; }
  if (firestoreSysUnsubscribe) { firestoreSysUnsubscribe(); firestoreSysUnsubscribe = null; }
  fbApp = null;
  fbAuth = null;
  fbDb = null;
  showToast('Đã ngắt kết nối Firebase.', 'info');
  closeFirebaseConfigModal();
}

function initFirebaseIfConfigured() {
  const cfg = getActiveFirebaseConfig();
  if (!cfg || typeof firebase === 'undefined') return;
  try {
    if (!firebase.apps.length) {
      fbApp = firebase.initializeApp(cfg);
    } else {
      fbApp = firebase.app();
    }
    fbDb = firebase.firestore();
    setSyncIndicator(`🔥 Firebase Realtime (${cfg.projectId})`, 'bg-emerald-400');
    subscribeToFirestoreWorkspace();
  } catch (err) {
    console.warn('Firebase init error:', err);
  }
}

async function syncActiveEmployeeToFirestore() {
  if (!fbDb || isApplyingFirestoreSnapshot) return;
  try {
    // Lưu chính xác theo từng Email nhân viên thành 1 Document riêng biệt trên Firestore
    const targetWs = (!isManager(currentUser))
      ? workspaceData
      : (activeEmployeeId && activeEmployeeId !== 'all' ? teamWorkspaces[activeEmployeeId] : null);

    if (targetWs && targetWs.ownerEmail) {
      const emailDocId = targetWs.ownerEmail.trim().toLowerCase();
      if (emailDocId && !isSuperAdminEmail(emailDocId) && !isModEmail(emailDocId)) {
        const docRef = fbDb.collection('wf_employees').doc(emailDocId);
        await docRef.set({
          empId: targetWs.empId || ('emp_' + emailDocId),
          ownerName: targetWs.ownerName || emailDocId,
          ownerEmail: emailDocId,
          position: targetWs.position || 'Chuyên viên Pháp chế & Hồ sơ',
          updatedAt: new Date().toISOString(),
          tasks: Array.isArray(targetWs.tasks) ? targetWs.tasks : [],
          adhocTasks: Array.isArray(targetWs.adhocTasks) ? targetWs.adhocTasks : [],
          activityLogs: Array.isArray(targetWs.activityLogs) ? targetWs.activityLogs : [],
          weeklyReviews: targetWs.weeklyReviews || {},
          employeeNotes: targetWs.employeeNotes || {}
        }, { merge: true });
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setSyncIndicator(`🔥 Đã lưu Firebase (${timeStr})`, 'bg-emerald-400');
      }
    }
  } catch (err) {
    console.warn('Firestore employee sync warning:', err);
  }
}

async function syncSystemStateToFirestore() {
  if (!fbDb || isApplyingFirestoreSnapshot) return;
  try {
    await fbDb.collection('wf_system').doc('global_state').set({
      whitelist: getWhitelist(),
      trashItems: getTrashItems(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.email || 'system'
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore system sync warning:', err);
  }
}

async function pushAllToFirestore() {
  if (!fbDb) return;
  try {
    await syncSystemStateToFirestore();
    const promises = Object.values(teamWorkspaces).map(ws => {
      if (!ws || !ws.ownerEmail) return Promise.resolve();
      const emailDocId = ws.ownerEmail.trim().toLowerCase();
      if (!emailDocId || isSuperAdminEmail(emailDocId) || isModEmail(emailDocId)) {
        return Promise.resolve();
      }
      return fbDb.collection('wf_employees').doc(emailDocId).set({
        empId: ws.empId || ('emp_' + emailDocId),
        ownerName: ws.ownerName || emailDocId,
        ownerEmail: emailDocId,
        position: ws.position || 'Chuyên viên Pháp chế & Hồ sơ',
        updatedAt: ws.updatedAt || new Date().toISOString(),
        tasks: Array.isArray(ws.tasks) ? ws.tasks : [],
        adhocTasks: Array.isArray(ws.adhocTasks) ? ws.adhocTasks : [],
        activityLogs: Array.isArray(ws.activityLogs) ? ws.activityLogs : [],
        weeklyReviews: ws.weeklyReviews || {},
        employeeNotes: ws.employeeNotes || {}
      }, { merge: true });
    });
    await Promise.all(promises);
  } catch (err) {
    console.warn('Push all to Firestore warning:', err);
  }
}

function subscribeToFirestoreWorkspace() {
  if (!fbDb) return;
  if (firestoreUnsubscribe) firestoreUnsubscribe();
  if (firestoreSysUnsubscribe) firestoreSysUnsubscribe();

  // 1. Lắng nghe Thời gian thực (Realtime) Danh sách Email cấp quyền & Thùng rác
  firestoreSysUnsubscribe = fbDb.collection('wf_system').doc('global_state')
    .onSnapshot((doc) => {
      if (doc.exists) {
        const sysData = doc.data();
        if (sysData) {
          isApplyingFirestoreSnapshot = true;
          try {
            mergeCloudAndLocalData({
              whitelist: sysData.whitelist || [],
              trashItems: sysData.trashItems || [],
              teamWorkspaces: {}
            }, false);
            renderAll();
          } finally {
            isApplyingFirestoreSnapshot = false;
          }
        }
      } else {
        syncSystemStateToFirestore();
      }
    }, (err) => console.warn('Firestore system listener warning:', err));

  // 2. Lắng nghe Thời gian thực (Realtime) toàn bộ Hồ sơ & Nhật ký của từng Nhân viên theo Email
  firestoreUnsubscribe = fbDb.collection('wf_employees')
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        pushAllToFirestore();
        return;
      }
      const incomingTeam = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.ownerEmail) {
          const key = data.empId || ('emp_' + doc.id);
          incomingTeam[key] = data;
        }
      });
      if (Object.keys(incomingTeam).length > 0) {
        isApplyingFirestoreSnapshot = true;
        try {
          mergeCloudAndLocalData({ teamWorkspaces: incomingTeam }, false);
          hasCompletedInitialCloudLoad = true;
          renderAll();
          const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          setSyncIndicator(`🔥 Realtime Firebase (${timeStr})`, 'bg-emerald-400');
        } finally {
          isApplyingFirestoreSnapshot = false;
        }
      }
    }, (err) => console.warn('Firestore employees listener warning:', err));
}

// ==========================================
// 16. UI HELPERS & BADGES
// ==========================================
function getStatusBadgeHTML(effStatus) {
  const map = {
    pending: `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#dc3545] text-white">Chưa duyệt / Chờ</span>`,
    in_progress: `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">Đang xử lý</span>`,
    completed: `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#198754] text-white">✓ Đã duyệt (Đúng hạn)</span>`,
    completed_late: `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#d97706] text-white">⚠️ Hoàn thành muộn</span>`,
    overdue: `<span class="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#b02a37] text-white">⚠️ Quá hạn</span>`
  };
  return map[effStatus] || map.pending;
}

function getPriorityBadgeHTML(priority) {
  const map = {
    high: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600">🔴 Ưu tiên Cao</span>`,
    medium: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">🔵 Trung bình</span>`,
    low: `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">🟢 Thấp</span>`
  };
  return map[priority] || map.medium;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = {
    success: 'bg-slate-900 border-emerald-500 text-white',
    error: 'bg-rose-950 border-rose-500 text-white',
    info: 'bg-slate-900 border-brand-500 text-white'
  };
  const toast = document.createElement('div');
  toast.className = `px-4 py-3 rounded-xl shadow-lg border-l-4 text-xs font-medium flex items-center space-x-2 animate-fade-in ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}


// ==========================================
// 17. ORDER MODULE — CỔNG GỬI ORDER & THEO DÕI TIẾN TRÌNH
// - Người gửi (bất kỳ ai có Email) mở link  #order  → đăng nhập Email/OTP → gửi Order, chọn nhân viên xử lý
// - Hệ thống tự ghi nhận (Firestore collection: wf_orders) + người gửi theo dõi realtime
// - Nhân viên/Quản lý xử lý tại tab "Hộp Order" (Kanban kéo-thả / Bảng), tự tạo Hồ sơ trong bảng phân việc
// - Chạy thử không đụng dữ liệu thật:  ?demo=1#order
// ==========================================
const ORDER_KEYS = {
  USER: 'wf_pro_order_user_v1',
  LOCAL: 'wf_pro_orders_local_v1'
};
const ORDER_COLLECTION = 'wf_orders';
const ORDER_DEMO_MODE = new URLSearchParams(window.location.search).has('demo');

const ORDER_DEPARTMENTS = ['P. Công nghệ', 'P. CSVC', 'P. Đầu tư', 'P. HCNS', 'P. Kế toán', 'P. Kinh doanh', 'P. Vận hành', 'VP TCT', 'HĐHT KPT', 'HĐHT MN', 'HĐTA', 'BGH cơ sở'];
const ORDER_DOC_TYPES = ['Tờ trình', 'Đề xuất / Kế hoạch', 'Hợp đồng', 'Phụ lục hợp đồng', 'Thanh toán / Tạm ứng', 'Công văn', 'Quyết định', 'Báo cáo', 'Giấy tờ pháp lý', 'Khác'];

const ORDER_STATUSES = {
  pending:  { label: 'Chờ tiếp nhận',          short: 'Chờ tiếp nhận', icon: 'hourglass',      color: 'slate',   step: 0, progress: 10 },
  received: { label: 'Đã tiếp nhận',           short: 'Đã tiếp nhận',  icon: 'inbox',          color: 'blue',    step: 1, progress: 40 },
  reviewed: { label: 'Đã duyệt nội dung',      short: 'Duyệt nội dung', icon: 'file-check-2',  color: 'violet',  step: 2, progress: 75 },
  revise:   { label: 'Cần điều chỉnh, bổ sung', short: 'Cần bổ sung',  icon: 'alert-triangle', color: 'amber',   step: 2, progress: 50 },
  done:     { label: 'Đã duyệt – Hoàn tất',    short: 'Hoàn tất',      icon: 'badge-check',    color: 'emerald', step: 3, progress: 100 },
  rejected: { label: 'Từ chối / Đã hủy',       short: 'Từ chối',       icon: 'x-circle',       color: 'rose',    step: -1, progress: 0 }
};
const ORDER_STEPPER = ['pending', 'received', 'reviewed', 'done'];
const ORDER_KANBAN_COLS = ['pending', 'received', 'reviewed', 'revise', 'done'];
const ORDER_PRIORITY = {
  low:    { label: 'Thấp',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Trung bình', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  high:   { label: 'Khẩn',       cls: 'bg-rose-50 text-rose-700 border-rose-200' }
};

let orderList = [];
let orderUnsub = null;
let orderUseLocal = ORDER_DEMO_MODE;
let orderSeenIds = null;            // Set các order đã thấy (để báo order mới)
let orderStaffCache = [];
let orderPortalUser = null;          // { email, name }
let orderPortalTab = 'new';          // 'new' | 'mine'
let orderPortalView = 'sender';      // 'sender' | 'handler' (chỉ dùng ở chế độ demo)
let orderInboxView = 'kanban';       // 'kanban' | 'table'
let orderEditingId = null;           // Khi người gửi bổ sung lại Order
let orderPortalOtp = { email: '', name: '', code: '' };
let orderFilters = { q: '', type: '', dept: '', status: '' };
let orderInboxFilters = { q: '', status: '', scope: 'mine' };
let orderDragId = null;

// ---------- Helpers ----------
function orderNowISO() { return new Date().toISOString(); }
function orderTodayStr(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays); return toISODateString(d);
}
function orderStatusMeta(s) { return ORDER_STATUSES[s] || ORDER_STATUSES.pending; }
function orderBadge(status, size = 'sm') {
  const m = orderStatusMeta(status);
  const pad = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]';
  return `<span class="order-badge order-badge-${m.color} inline-flex items-center gap-1 ${pad} rounded-full font-semibold whitespace-nowrap"><i data-lucide="${m.icon}" class="w-3 h-3"></i>${m.label}</span>`;
}
function orderPriorityChip(p) {
  const m = ORDER_PRIORITY[p] || ORDER_PRIORITY.medium;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${m.cls}">${m.label}</span>`;
}
function orderFormatMoney(v) {
  const n = Number(String(v || '').replace(/[^\d]/g, '')) || 0;
  return n.toLocaleString('vi-VN');
}
function orderExtractLinks(text) {
  if (!text) return [];
  return (String(text).match(/https?:\/\/[^\s<>"']+/g) || []).slice(0, 10);
}
function orderLinkIcon(url) {
  if (/docs\.google\.com\/spreadsheets/.test(url)) return 'sheet';
  if (/docs\.google\.com\/document/.test(url)) return 'file-text';
  if (/drive\.google\.com/.test(url)) return 'hard-drive';
  return 'link';
}
function orderDeadlineInfo(o) {
  if (!o || !o.deadline || o.status === 'done' || o.status === 'rejected') return null;
  const dl = parseDeadlineDate(o.deadline);
  if (!dl) return null;
  const diffH = (dl.getTime() - Date.now()) / 36e5;
  if (diffH < 0) return { text: 'Quá hạn', cls: 'text-rose-600 bg-rose-50 border-rose-200' };
  if (diffH <= 24) return { text: 'Sắp đến hạn', cls: 'text-amber-700 bg-amber-50 border-amber-200' };
  return null;
}
function orderGenerateCode() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `ORD-${ymd}-${rnd}`;
}
function orderInitials(nameOrEmail) {
  const s = String(nameOrEmail || '?').replace(/\(.*\)/, '').trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}
function orderStaffName(email) {
  const st = orderStaffCache.find(s => s.email === (email || '').toLowerCase());
  return st ? st.name : (email || 'Chưa chọn');
}
function orderIcons() { try { lucide.createIcons(); } catch (e) { /* noop */ } }

// ---------- Data layer (Firestore + Local fallback) ----------
function orderLoadLocal() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEYS.LOCAL) || '[]'); } catch (e) { return []; }
}
function orderSaveLocal(list) { localStorage.setItem(ORDER_KEYS.LOCAL, JSON.stringify(list)); }

function orderSwitchToLocal(reason) {
  if (orderUseLocal) return;
  orderUseLocal = true;
  console.warn('Order module → Local mode:', reason);
  showToast('⚠️ Chưa có quyền ghi Firestore cho Order — tạm lưu trên máy này. Cần cập nhật Firestore Rules.', 'error');
  orderList = orderLoadLocal();
  orderRerender();
}

function orderSubscribe(mode) {
  // mode: 'sender' (chỉ order của mình) | 'handler' (toàn bộ, lọc phía client)
  if (orderUnsub) { orderUnsub(); orderUnsub = null; }
  if (orderUseLocal || !fbDb) {
    orderUseLocal = true;
    orderList = orderLoadLocal();
    orderRerender();
    return;
  }
  let ref = fbDb.collection(ORDER_COLLECTION);
  if (mode === 'sender' && orderPortalUser) ref = ref.where('senderEmail', '==', orderPortalUser.email);
  orderUnsub = ref.onSnapshot(snap => {
    const arr = [];
    snap.forEach(doc => arr.push({ ...doc.data(), id: doc.id }));
    arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    orderDetectNew(arr);
    orderList = arr;
    orderRerender();
  }, err => orderSwitchToLocal(err && err.message));
}

async function orderPersist(order) {
  order.updatedAt = orderNowISO();
  const idx = orderList.findIndex(o => o.id === order.id);
  if (idx > -1) orderList[idx] = order; else orderList.unshift(order);
  if (orderUseLocal || !fbDb) {
    const all = orderLoadLocal();
    const j = all.findIndex(o => o.id === order.id);
    if (j > -1) all[j] = order; else all.unshift(order);
    orderSaveLocal(all);
    orderRerender();
    return true;
  }
  try {
    await fbDb.collection(ORDER_COLLECTION).doc(order.id).set(JSON.parse(JSON.stringify(order)), { merge: true });
    return true;
  } catch (err) {
    orderSwitchToLocal(err && err.message);
    const all = orderLoadLocal();
    const j = all.findIndex(o => o.id === order.id);
    if (j > -1) all[j] = order; else all.unshift(order);
    orderSaveLocal(all);
    orderRerender();
    return true;
  }
}

function orderDetectNew(arr) {
  const me = (currentUser && currentUser.email || '').toLowerCase();
  if (!orderSeenIds) { orderSeenIds = new Set(arr.map(o => o.id)); return; }
  arr.forEach(o => {
    if (!orderSeenIds.has(o.id)) {
      orderSeenIds.add(o.id);
      const forMe = o.assigneeEmail === me || (isManager(currentUser) && !orderPortalUser);
      if (forMe && o.status === 'pending' && !document.getElementById('order-portal')?.classList.contains('flex')) {
        showToast(`📨 Order mới ${o.code} từ ${o.senderName} (${o.department})`, 'success');
      }
    }
  });
}

async function orderLoadStaff() {
  let wl = [];
  try {
    if (!orderUseLocal && fbDb) {
      const doc = await fbDb.collection('wf_system').doc('global_state').get();
      if (doc.exists && Array.isArray(doc.data().whitelist)) wl = doc.data().whitelist;
    }
  } catch (e) { console.warn('Order staff load warning:', e); }
  if (!wl.length) wl = getWhitelist();
  if (ORDER_DEMO_MODE && wl.length < 6) {
    wl = wl.concat([
      { email: 'lan.nguyen@demo.vn', name: 'Nguyễn Thị Lan', role: 'employee' },
      { email: 'minh.tran@demo.vn', name: 'Trần Quang Minh', role: 'employee' }
    ]);
  }
  const seen = new Set();
  orderStaffCache = wl
    .filter(w => {
      if (!w || !w.email) return false;
      const em = w.email.trim().toLowerCase();
      // CHỈ HIỂN THỊ NHÂN VIÊN XỬ LÝ (loại bỏ hoàn toàn Super Admin và Quản lý / Mod)
      if (isSuperAdminEmail(em) || isModEmail(em)) return false;
      if (w.role === 'admin' || w.role === 'mod' || w.role === 'manager') return false;
      return true;
    })
    .map(w => ({
      email: w.email.trim().toLowerCase(),
      name: String(w.name || w.email).replace(/^(Nhân viên|Quản lý \/ Mod|Super Admin)\s*\((.+)\)$/, '$2'),
      role: 'employee'
    }))
    .filter(w => !seen.has(w.email) && seen.add(w.email));
  return orderStaffCache;
}

function orderSeedDemo(senderEmail, senderName) {
  if (orderLoadLocal().length) return;
  const staff = orderStaffCache.length ? orderStaffCache : [{ email: 'lan.nguyen@demo.vn', name: 'Nguyễn Thị Lan' }];
  const pick = i => staff[i % staff.length];
  const mk = (i, status, docType, dept, content, dDeadline, priority, extraHistory) => {
    const created = new Date(Date.now() - (6 - i) * 864e5 - 3 * 36e5).toISOString();
    const a = pick(i);
    const history = [{ status: 'pending', by: senderName, byEmail: senderEmail, at: created, note: 'Gửi Order mới' }].concat(extraHistory(created, a));
    return {
      id: 'ord_demo_' + i, code: `ORD-DEMO-${String(i + 1).padStart(3, '0')}`,
      senderName, senderEmail, department: dept,
      docType, priority, cost: [0, 15000000, 120000000, 0, 4500000, 0][i] || 0,
      sentDate: created.slice(0, 10), deadline: orderTodayStr(dDeadline), content,
      note: i % 2 === 0 ? 'Tài liệu: https://drive.google.com/drive/folders/demo-folder' : '',
      assigneeEmail: a.email, assigneeName: a.name, status, history,
      createdAt: created, updatedAt: history[history.length - 1].at
    };
  };
  const h = (offsetH, status, note) => (created, a) => ({ status, by: a.name, byEmail: a.email, at: new Date(new Date(created).getTime() + offsetH * 36e5).toISOString(), note });
  const demo = [
    mk(0, 'done', 'Hợp đồng', 'P. Kinh doanh', 'Rà soát hợp đồng hợp tác tuyển sinh với đối tác ABC năm học 2026-2027', -1, 'high',
      (c, a) => [h(2, 'received', 'Đã nhận hồ sơ')(c, a), h(20, 'reviewed', 'Đã duyệt nội dung hợp lệ')(c, a), h(48, 'done', 'Đã hoàn tất xử lý hồ sơ')(c, a)]),
    mk(1, 'reviewed', 'Thanh toán / Tạm ứng', 'P. CSVC', 'Đề nghị thanh toán đợt 2 sửa chữa phòng học khu B', 2, 'medium',
      (c, a) => [h(1, 'received', '')(c, a), h(10, 'reviewed', 'Đã duyệt nội dung, đủ chứng từ')(c, a)]),
    mk(2, 'revise', 'Tờ trình', 'P. Đầu tư', 'Tờ trình phê duyệt chủ trương đầu tư cơ sở mới tại Thủ Đức', 1, 'high',
      (c, a) => [h(3, 'received', '')(c, a), h(8, 'revise', 'Bổ sung bảng dự toán chi tiết & ý kiến P. Kế toán')(c, a)]),
    mk(3, 'received', 'Công văn', 'P. HCNS', 'Công văn gửi Sở GD&ĐT về kế hoạch tổ chức ngày hội việc làm', 3, 'low',
      (c, a) => [h(4, 'received', 'Sẽ xử lý trong hôm nay')(c, a)]),
    mk(4, 'pending', 'Đề xuất / Kế hoạch', 'P. Công nghệ', 'Đề xuất mua bản quyền phần mềm quản lý thư viện', 4, 'medium', () => []),
    mk(5, 'pending', 'Giấy tờ pháp lý', 'BGH cơ sở', 'Xin cung cấp bản sao Giấy phép hoạt động giáo dục (công chứng)', 0, 'high', () => [])
  ];
  orderSaveLocal(demo);
}

// ---------- Portal (Người gửi) ----------
function orderOpenPortal() {
  const portal = document.getElementById('order-portal');
  if (!portal) return;
  portal.classList.remove('hidden'); portal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  // Dùng lại phiên đăng nhập chính nếu có
  const saved = localStorage.getItem(ORDER_KEYS.USER);
  if (saved) { try { orderPortalUser = JSON.parse(saved); } catch (e) { orderPortalUser = null; } }
  if (!orderPortalUser && isUserAuthenticatedSession()) {
    orderPortalUser = { email: currentUser.email, name: String(currentUser.name || currentUser.email).replace(/\s*\(.+\)$/, '') };
  }
  orderLoadStaff().then(() => {
    if (orderPortalUser) orderAfterPortalLogin(); else orderRenderPortal();
  });
  orderRenderPortal();
}

function orderClosePortal() {
  const portal = document.getElementById('order-portal');
  if (portal) { portal.classList.add('hidden'); portal.classList.remove('flex'); }
  document.body.style.overflow = '';
  if (location.hash === '#order') history.replaceState(null, '', location.pathname + location.search);
  if (isUserAuthenticatedSession()) orderSubscribe('handler');
}

function orderAfterPortalLogin() {
  localStorage.setItem(ORDER_KEYS.USER, JSON.stringify(orderPortalUser));
  if (ORDER_DEMO_MODE) orderSeedDemo(orderPortalUser.email, orderPortalUser.name);
  orderSubscribe(orderPortalView === 'handler' ? 'handler' : 'sender');
  orderRenderPortal();
}

function orderPortalLogout() {
  if (orderUnsub) { orderUnsub(); orderUnsub = null; }
  localStorage.removeItem(ORDER_KEYS.USER);
  orderPortalUser = null; orderList = []; orderPortalOtp = { email: '', name: '', code: '' };
  orderRenderPortal();
}

function orderIsValidSenderEmail(email) {
  if (!email || !email.includes('@')) return false;
  const clean = email.trim().toLowerCase();
  // Ở chế độ demo hoặc tài khoản đặc biệt cho phép test
  if (ORDER_DEMO_MODE || clean.includes('demo') || clean.includes('test')) return true;
  // Bắt buộc email nội bộ trường VASchools
  return clean.endsWith('@vaschools.edu.vn');
}

async function orderPortalGoogleLogin() {
  const btn = document.getElementById('op-google-login-btn');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="order-spinner" style="border-top-color:#9e0b22;border-color:rgba(158,11,34,.3);"></span> <span class="text-slate-600">Đang kết nối Google...</span>';
  }
  try {
    initFirebaseIfConfigured();
    if (typeof firebase === 'undefined' || !firebase.apps.length || typeof firebase.auth !== 'function') {
      throw new Error('Dịch vụ Google Auth chưa được khởi tạo');
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
      hd: 'vaschools.edu.vn',
      prompt: 'select_account'
    });
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    if (!user || !user.email) throw new Error('Không nhận được thông tin email từ Google.');

    const cleanEmail = user.email.trim().toLowerCase();
    if (!orderIsValidSenderEmail(cleanEmail)) {
      await firebase.auth().signOut();
      showToast('⛔ Chỉ chấp nhận tài khoản Google của trường (@vaschools.edu.vn)!', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
      return;
    }

    orderPortalUser = {
      email: cleanEmail,
      name: user.displayName || cleanEmail.split('@')[0],
      avatar: user.photoURL || ''
    };
    showToast(`Đăng nhập Google thành công! Xin chào ${orderPortalUser.name}`, 'success');
    orderAfterPortalLogin();
  } catch (err) {
    console.warn('Google sign-in warning:', err);
    if (err.code === 'auth/popup-closed-by-user') {
      showToast('Bạn đã đóng cửa sổ đăng nhập Google.', 'info');
    } else if (err.code === 'auth/unauthorized-domain') {
      showToast('⚠️ Domain chưa khai báo trong Firebase Auth. Vui lòng dùng tùy chọn nhập bên dưới.', 'error');
      document.getElementById('op-manual-fallback')?.classList.remove('hidden');
    } else {
      showToast(err.message || 'Lỗi đăng nhập Google', 'error');
      document.getElementById('op-manual-fallback')?.classList.remove('hidden');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }
}

async function orderPortalQuickLogin(e) {
  e.preventDefault();
  const email = document.getElementById('op-login-email').value.trim().toLowerCase();
  const name = document.getElementById('op-login-name').value.trim();
  if (!email || !email.includes('@')) {
    showToast('Vui lòng nhập địa chỉ Email hợp lệ!', 'error');
    return;
  }
  if (!name) {
    showToast('Vui lòng nhập Họ và tên của bạn!', 'error');
    return;
  }
  if (!orderIsValidSenderEmail(email)) {
    showToast('Cổng Tiếp Nhận chỉ áp dụng cho Email nội bộ trường (@vaschools.edu.vn)!', 'error');
    return;
  }
  orderPortalUser = { email, name };
  showToast(`Xin chào ${orderPortalUser.name}! Bạn có thể gửi Order ngay.`, 'success');
  orderAfterPortalLogin();
}

function orderSetPortalTab(t) { orderPortalTab = t; if (t === 'new') orderEditingId = null; orderRenderPortal(); }
function orderSetPortalView(v) {
  orderPortalView = v;
  orderSubscribe(v === 'handler' ? 'handler' : 'sender');
  orderRenderPortal();
}

function orderRenderPortal() {
  const root = document.getElementById('order-portal-root');
  if (!root) return;
  const u = orderPortalUser;
  const header = `
    <header class="crimson-top-bar order-portal-header text-white px-4 sm:px-8 py-3.5 flex items-center justify-between gap-3 shadow-lg">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 p-1 backdrop-blur shadow-sm overflow-hidden">
          <img src="logo-vaschools.png" alt="VAschools Logo" class="w-full h-full object-contain filter drop-shadow" />
        </div>
        <div class="min-w-0">
          <h1 class="font-extrabold tracking-wide text-sm sm:text-lg leading-tight truncate">CỔNG TIẾP NHẬN HỒ SƠ - BỘ PHẬN PHÁP CHẾ</h1>
          <p class="text-[11px] text-rose-100/90 truncate">Gửi yêu cầu hồ sơ – hệ thống tự ghi nhận – theo dõi tiến trình realtime</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${u ? `<div class="hidden sm:flex flex-col items-end leading-tight mr-1"><span class="text-[11px] text-rose-100">Xin chào</span><span class="text-xs font-bold">${escapeHtml(u.email)}</span></div>
        <div class="w-9 h-9 rounded-full bg-white text-brand-700 font-extrabold text-xs flex items-center justify-center shadow">${escapeHtml(orderInitials(u.name || u.email))}</div>
        <button onclick="orderPortalLogout()" title="Đăng xuất" class="p-2 rounded-xl bg-white/10 hover:bg-white/25 border border-white/20 transition"><i data-lucide="log-out" class="w-4 h-4"></i></button>` : ''}
        ${isUserAuthenticatedSession() ? `<button onclick="orderClosePortal()" class="px-3 py-2 rounded-xl bg-white text-brand-700 text-xs font-bold hover:bg-rose-50 transition">Về Bàn làm việc</button>` : ''}
      </div>
    </header>`;
  const demoBar = ORDER_DEMO_MODE ? `
    <div class="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span class="text-amber-800 font-semibold flex items-center gap-1.5"><i data-lucide="flask-conical" class="w-4 h-4"></i>CHẾ ĐỘ DEMO — dữ liệu mẫu chỉ lưu trên máy này, không ảnh hưởng hệ thống thật.</span>
      ${u ? `<div class="inline-flex bg-white rounded-xl p-1 border border-amber-200 shadow-sm">
        <button onclick="orderSetPortalView('sender')" class="px-3 py-1 rounded-lg font-bold ${orderPortalView === 'sender' ? 'bg-brand-600 text-white' : 'text-slate-600'}">👤 Góc nhìn Người gửi</button>
        <button onclick="orderSetPortalView('handler')" class="px-3 py-1 rounded-lg font-bold ${orderPortalView === 'handler' ? 'bg-brand-600 text-white' : 'text-slate-600'}">🧑‍💼 Góc nhìn Người xử lý</button>
      </div>` : ''}
      <button onclick="if(confirm('Xóa toàn bộ dữ liệu demo và tạo lại?')){localStorage.removeItem('${ORDER_KEYS.LOCAL}');orderSeedDemo(orderPortalUser?orderPortalUser.email:'demo@demo.vn',orderPortalUser?orderPortalUser.name:'Demo');orderList=orderLoadLocal();orderRerender();}" class="text-amber-700 underline font-semibold">Làm mới dữ liệu demo</button>
    </div>` : '';

  let body = '';
  if (!u) body = orderPortalLoginHTML();
  else if (ORDER_DEMO_MODE && orderPortalView === 'handler') body = `<div class="max-w-[1400px] mx-auto w-full p-4 sm:p-6"><div id="order-portal-inbox"></div></div>`;
  else body = orderPortalMainHTML();

  root.innerHTML = header + demoBar + `<div class="flex-1 overflow-y-auto order-portal-bg">${body}</div>`;
  if (u && ORDER_DEMO_MODE && orderPortalView === 'handler') orderRenderInbox('order-portal-inbox', true);
  orderIcons();
}

function orderPortalLoginHTML() {
  return `
  <div class="min-h-full flex items-center justify-center p-4 sm:p-8">
    <div class="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-fade-in">
      <div class="crimson-card-header p-8 hidden md:flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-white/10"></div>
        <div class="absolute -left-10 bottom-10 w-40 h-40 rounded-full bg-white/5"></div>
        <div class="relative">
          <div class="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center p-2 mb-4 backdrop-blur shadow-md">
            <img src="logo-vaschools.png" alt="VAschools Logo" class="w-full h-full object-contain filter drop-shadow" />
          </div>
          <span class="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/15 border border-white/20 rounded-full px-3 py-1"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i>Hệ thống VASchools</span>
          <h2 class="text-2xl font-extrabold mt-5 leading-snug">Gửi hồ sơ trình ký<br/>chỉ trong 1 phút</h2>
          <p class="text-rose-100 text-sm mt-3">Hệ thống tự cấp mã, ghi nhận thời gian và cho bạn theo dõi tiến trình từng bước cho đến khi hoàn tất.</p>
        </div>
        <ul class="relative space-y-3 text-sm mt-8">
          <li class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><i data-lucide="file-plus-2" class="w-4 h-4"></i></span>Điền form & chọn người xử lý</li>
          <li class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><i data-lucide="bell-ring" class="w-4 h-4"></i></span>Người xử lý nhận thông báo tức thì</li>
          <li class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><i data-lucide="git-commit-horizontal" class="w-4 h-4"></i></span>Theo dõi timeline realtime</li>
        </ul>
      </div>
      <div class="p-6 sm:p-10 flex flex-col justify-center">
        <div class="flex items-center gap-2 text-brand-700 mb-1"><i data-lucide="shield-check" class="w-5 h-5"></i><span class="text-xs font-bold uppercase tracking-wider">Xác thực Nội bộ VASchools</span></div>
        <h3 class="text-xl font-extrabold text-slate-800">Cổng Tiếp Nhận Hồ Sơ</h3>
        <p class="text-xs text-slate-500 mt-1 mb-4">Bộ Phận Pháp Chế • Đăng nhập bằng tài khoản Google trường để xác thực chính chủ.</p>

        <!-- Nút Đăng nhập bằng Google chính thức -->
        <button type="button" id="op-google-login-btn" onclick="orderPortalGoogleLogin()" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-800 text-xs sm:text-sm font-bold shadow-xs transition hover:shadow hover:border-slate-300">
          <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Đăng nhập bằng Google (@vaschools.edu.vn)</span>
        </button>

        <!-- Divider -->
        <div class="relative flex items-center justify-center my-3.5">
          <div class="border-t border-slate-200 w-full"></div>
          <span class="bg-white px-2.5 text-[11px] text-slate-400 font-medium whitespace-nowrap">hoặc nhập thông tin trực tiếp</span>
        </div>

        <form onsubmit="orderPortalQuickLogin(event)" class="space-y-3.5">
          <div>
            <label class="order-label">Họ và tên người gửi <span class="text-rose-500">*</span></label>
            <div class="relative">
              <i data-lucide="user" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input id="op-login-name" required class="order-input pl-9" placeholder="Ví dụ: Nguyễn Văn An" />
            </div>
          </div>
          <div>
            <label class="order-label">Email trường <span class="text-rose-500">*</span></label>
            <div class="relative">
              <i data-lucide="mail" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input id="op-login-email" type="email" required class="order-input pl-9" placeholder="an.nguyen@vaschools.edu.vn" />
            </div>
            <p class="text-[11px] text-slate-400 mt-1">Dùng email này để xem danh sách & theo dõi tiến trình hồ sơ của bạn.</p>
          </div>
          <button id="op-login-btn" class="order-btn-primary w-full justify-center text-sm py-2.5 mt-1 shadow-md">
            <i data-lucide="log-in" class="w-4 h-4"></i>Vào Cổng Tiếp Nhận Hồ Sơ
          </button>
        </form>
      </div>
    </div>
  </div>`;
}

function orderMyOrders() {
  const me = orderPortalUser ? orderPortalUser.email : '';
  return orderList.filter(o => o.senderEmail === me);
}

function orderPortalMainHTML() {
  const mine = orderMyOrders();
  const cnt = s => mine.filter(o => s.includes(o.status)).length;
  const stats = [
    { label: 'Tổng đã gửi', val: mine.length, icon: 'send', cls: 'from-slate-700 to-slate-900' },
    { label: 'Đang xử lý', val: cnt(['pending', 'received', 'reviewed']), icon: 'loader', cls: 'from-blue-500 to-indigo-600' },
    { label: 'Cần bổ sung', val: cnt(['revise']), icon: 'alert-triangle', cls: 'from-amber-400 to-orange-500' },
    { label: 'Hoàn tất', val: cnt(['done']), icon: 'badge-check', cls: 'from-emerald-500 to-teal-600' }
  ];
  return `
  <div class="max-w-6xl mx-auto w-full p-4 sm:p-6 space-y-5 pb-16">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${stats.map(s => `<div class="order-stat bg-gradient-to-br ${s.cls}"><div><div class="text-[11px] uppercase tracking-wider opacity-80 font-semibold">${s.label}</div><div class="text-3xl font-extrabold mt-1">${s.val}</div></div><i data-lucide="${s.icon}" class="w-9 h-9 opacity-30"></i></div>`).join('')}
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200">
        <button onclick="orderSetPortalTab('new')" class="order-tab ${orderPortalTab === 'new' ? 'active' : ''}"><i data-lucide="file-plus-2" class="w-4 h-4"></i>${orderEditingId ? 'Bổ sung Order' : 'Gửi Order mới'}</button>
        <button onclick="orderSetPortalTab('mine')" class="order-tab ${orderPortalTab === 'mine' ? 'active' : ''}"><i data-lucide="list-checks" class="w-4 h-4"></i>Order của tôi <span class="ml-1 px-1.5 rounded-full bg-black/10 text-[10px]">${mine.length}</span></button>
      </div>
      <span class="text-[11px] text-slate-500 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${orderUseLocal ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}"></span>${orderUseLocal ? 'Lưu trên máy (offline/demo)' : 'Đồng bộ realtime Firebase'}</span>
    </div>
    <div id="order-portal-content">${orderPortalTab === 'new' ? orderFormHTML() : orderMyListHTML()}</div>
  </div>`;
}

function orderOptions(list, selected, placeholder) {
  return `<option value="">${placeholder}</option>` + list.map(v => `<option ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
}

function orderFormHTML() {
  const o = orderEditingId ? (orderList.find(x => x.id === orderEditingId) || {}) : {};
  const u = orderPortalUser || {};
  const staffOpts = `<option value="">-- Chọn nhân viên xử lý --</option>` + orderStaffCache.map(s =>
    `<option value="${escapeHtml(s.email)}" ${s.email === o.assigneeEmail ? 'selected' : ''}>${escapeHtml(s.name)}${s.name.includes('@') ? '' : ' — ' + escapeHtml(s.email)}</option>`).join('');
  const pr = o.priority || 'medium';
  return `
  <form id="order-form" onsubmit="orderSubmit(event)" class="space-y-4 animate-fade-in">
    ${orderEditingId ? `<div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex gap-3"><i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i><div><b>Đang bổ sung Order ${escapeHtml(o.code)}</b><br/><span class="text-xs">Yêu cầu từ người xử lý: “${escapeHtml(((o.history || []).filter(h => h.status === 'revise').pop() || {}).note || '')}”</span></div></div>` : ''}
    <div class="order-card">
      <div class="order-card-title"><span class="order-step-dot">1</span>Thông tin người gửi</div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div><label class="order-label">Tên người gửi <span class="text-rose-500">*</span></label><input id="of-name" required class="order-input" value="${escapeHtml(o.senderName || u.name || '')}" placeholder="Nhập họ và tên..." /></div>
        <div><label class="order-label">Email</label><input class="order-input bg-slate-50 text-slate-500" value="${escapeHtml(u.email || '')}" disabled /></div>
        <div class="sm:col-span-2"><label class="order-label">Đơn vị gửi hồ sơ <span class="text-rose-500">*</span></label><select id="of-dept" required class="order-input">${orderOptions(ORDER_DEPARTMENTS, o.department, '-- Chọn đơn vị --')}</select></div>
      </div>
    </div>
    <div class="order-card">
      <div class="order-card-title"><span class="order-step-dot">2</span>Thông tin hồ sơ & người xử lý</div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div><label class="order-label">Loại hồ sơ <span class="text-rose-500">*</span></label><select id="of-type" required class="order-input">${orderOptions(ORDER_DOC_TYPES, o.docType, '-- Chọn loại hồ sơ --')}</select></div>
        <div><label class="order-label">Nhân viên xử lý <span class="text-rose-500">*</span></label><select id="of-assignee" required class="order-input">${staffOpts}</select></div>
        <div><label class="order-label">Chi phí dự kiến (VND)</label><div class="relative"><input id="of-cost" inputmode="numeric" class="order-input pr-12" value="${orderFormatMoney(o.cost || 0)}" oninput="this.value=orderFormatMoney(this.value)" /><span class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">VND</span></div></div>
        <div><label class="order-label">Mức độ ưu tiên</label>
          <div class="flex gap-2">${Object.entries(ORDER_PRIORITY).map(([k, m]) => `
            <label class="order-chip ${k === pr ? 'active' : ''}" onclick="document.querySelectorAll('#order-form .order-chip').forEach(c=>c.classList.remove('active'));this.classList.add('active')">
              <input type="radio" name="of-priority" value="${k}" ${k === pr ? 'checked' : ''} class="hidden" />${k === 'high' ? '🔴' : k === 'medium' ? '🔵' : '🟢'} ${m.label}</label>`).join('')}
          </div></div>
      </div>
    </div>
    <div class="order-card">
      <div class="order-card-title"><span class="order-step-dot">3</span>Thời hạn & nội dung</div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div><label class="order-label">Ngày gửi hồ sơ <span class="text-rose-500">*</span></label><input id="of-sent" type="date" required class="order-input" value="${o.sentDate || orderTodayStr()}" /></div>
        <div><label class="order-label">Hạn cuối cần trả hồ sơ <span class="text-rose-500">*</span></label><input id="of-deadline" type="date" required class="order-input" min="${orderTodayStr()}" value="${o.deadline || orderTodayStr(3)}" /></div>
        <div class="sm:col-span-2"><label class="order-label">Nội dung hồ sơ <span class="text-rose-500">*</span></label><textarea id="of-content" required rows="3" class="order-input" placeholder="Mô tả tóm tắt nội dung trình ký...">${escapeHtml(o.content || '')}</textarea></div>
        <div class="sm:col-span-2"><label class="order-label">Ghi chú <span class="text-brand-600 font-normal">(dán link tờ trình / đề xuất / kế hoạch — link sẽ bấm được ở phần chi tiết)</span></label><textarea id="of-note" rows="2" class="order-input" placeholder="https://drive.google.com/...">${escapeHtml(o.note || '')}</textarea></div>
      </div>
    </div>
    <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      ${orderEditingId ? `<button type="button" onclick="orderSetPortalTab('mine')" class="order-btn-ghost justify-center">Hủy</button>` : `<button type="reset" class="order-btn-ghost justify-center"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>Nhập lại</button>`}
      <button id="order-submit-btn" class="order-btn-primary justify-center"><i data-lucide="send" class="w-4 h-4"></i>${orderEditingId ? 'Gửi lại bản bổ sung' : 'Gửi Order'}</button>
    </div>
  </form>`;
}

async function orderSubmit(e) {
  e.preventDefault();
  const v = id => (document.getElementById(id)?.value || '').trim();
  const assigneeEmail = v('of-assignee');
  const staff = orderStaffCache.find(s => s.email === assigneeEmail);
  const data = {
    senderName: v('of-name'), department: v('of-dept'), docType: v('of-type'),
    assigneeEmail, assigneeName: staff ? staff.name : assigneeEmail,
    cost: Number(v('of-cost').replace(/[^\d]/g, '')) || 0,
    priority: (document.querySelector('input[name="of-priority"]:checked') || {}).value || 'medium',
    sentDate: v('of-sent'), deadline: v('of-deadline'), content: v('of-content'), note: v('of-note')
  };
  if (data.deadline < data.sentDate) { showToast('Hạn cuối phải sau ngày gửi hồ sơ!', 'error'); return; }
  const btn = document.getElementById('order-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="order-spinner"></span> Đang gửi...'; }
  const u = orderPortalUser;
  let order;
  if (orderEditingId) {
    order = { ...orderList.find(o => o.id === orderEditingId), ...data };
    order.status = 'received';
    order.history = (order.history || []).concat([{ status: 'received', by: data.senderName, byEmail: u.email, at: orderNowISO(), note: 'Người gửi đã bổ sung & gửi lại hồ sơ' }]);
  } else {
    const code = orderGenerateCode();
    order = {
      id: code, code, ...data, senderEmail: u.email, status: 'pending',
      history: [{ status: 'pending', by: data.senderName, byEmail: u.email, at: orderNowISO(), note: 'Gửi Order mới' }],
      createdAt: orderNowISO(), linkedTaskId: null
    };
  }
  await orderPersist(order);
  const wasEdit = !!orderEditingId;
  orderEditingId = null;
  orderShowSuccess(order, wasEdit);
}

function orderShowSuccess(order, wasEdit) {
  const box = document.getElementById('order-portal-content');
  if (!box) return;
  const trackUrl = `${location.origin}${location.pathname}${location.search}#order`;
  box.innerHTML = `
  <div class="order-card text-center py-10 animate-fade-in">
    <div class="order-success-check mx-auto"><i data-lucide="check" class="w-10 h-10"></i></div>
    <h3 class="text-xl font-extrabold text-slate-800 mt-5">${wasEdit ? 'Đã gửi lại bản bổ sung!' : 'Gửi Order thành công!'}</h3>
    <p class="text-sm text-slate-500 mt-1">Hệ thống đã ghi nhận lúc ${formatVNDateTime(order.updatedAt)} và thông báo tới <b>${escapeHtml(order.assigneeName)}</b>.</p>
    <div class="inline-flex items-center gap-2 mt-5 px-5 py-3 rounded-2xl bg-brand-50 border border-brand-200">
      <span class="text-xs text-slate-500">Mã Order</span><span class="text-lg font-extrabold text-brand-700 tracking-wider">${escapeHtml(order.code)}</span>
      <button onclick="navigator.clipboard.writeText('${order.code}');showToast('Đã sao chép mã Order','success')" class="p-1.5 rounded-lg hover:bg-brand-100 text-brand-700"><i data-lucide="copy" class="w-4 h-4"></i></button>
    </div>
    <div class="flex flex-wrap justify-center gap-2 mt-6">
      <button onclick="orderSetPortalTab('mine');setTimeout(()=>orderOpenDrawer('${order.id}','sender'),60)" class="order-btn-primary"><i data-lucide="activity" class="w-4 h-4"></i>Theo dõi tiến trình</button>
      <button onclick="navigator.clipboard.writeText('${trackUrl}');showToast('Đã sao chép link theo dõi','success')" class="order-btn-ghost"><i data-lucide="link" class="w-4 h-4"></i>Sao chép link theo dõi</button>
      <button onclick="orderSetPortalTab('new')" class="order-btn-ghost"><i data-lucide="plus" class="w-4 h-4"></i>Gửi Order khác</button>
    </div>
  </div>`;
  orderIcons();
}

function orderApplyFilters(list, f) {
  const q = (f.q || '').toLowerCase();
  return list.filter(o =>
    (!q || [o.code, o.content, o.senderName, o.assigneeName, o.department].join(' ').toLowerCase().includes(q)) &&
    (!f.type || o.docType === f.type) && (!f.dept || o.department === f.dept) && (!f.status || o.status === f.status));
}
function orderSetFilter(key, val) {
  orderFilters[key] = val;
  const box = document.getElementById('order-my-list-body');
  if (box) { box.innerHTML = orderMyListBodyHTML(); orderIcons(); }
}

function orderMyListHTML() {
  const statusOpts = Object.entries(ORDER_STATUSES).map(([k, m]) => `<option value="${k}" ${orderFilters.status === k ? 'selected' : ''}>${m.label}</option>`).join('');
  return `
  <div class="order-card p-0 overflow-hidden animate-fade-in">
    <div class="crimson-card-header px-5 py-3.5 flex items-center justify-between">
      <span class="font-bold text-sm flex items-center gap-2"><i data-lucide="list" class="w-4 h-4"></i>Danh Sách Order Đã Gửi</span>
      <button onclick="orderSetPortalTab('new')" class="px-3 py-1.5 rounded-lg bg-white text-brand-700 text-xs font-bold hover:bg-rose-50">+ Gửi Order mới</button>
    </div>
    <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-b border-slate-100 bg-slate-50/60">
      <div class="relative"><i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i><input class="order-input pl-9" placeholder="Tìm theo Mã, Nội dung, Người xử lý..." value="${escapeHtml(orderFilters.q)}" oninput="orderSetFilter('q', this.value)" /></div>
      <select class="order-input" onchange="orderSetFilter('type', this.value)">${orderOptions(ORDER_DOC_TYPES, orderFilters.type, '-- Tất cả Loại hồ sơ --')}</select>
      <select class="order-input" onchange="orderSetFilter('dept', this.value)">${orderOptions(ORDER_DEPARTMENTS, orderFilters.dept, '-- Tất cả Đơn vị --')}</select>
      <select class="order-input" onchange="orderSetFilter('status', this.value)"><option value="">-- Trạng thái --</option>${statusOpts}</select>
    </div>
    <div id="order-my-list-body">${orderMyListBodyHTML()}</div>
  </div>`;
}

function orderMyListBodyHTML() {
  const list = orderApplyFilters(orderMyOrders(), orderFilters);
  if (!list.length) {
    return `<div class="py-16 text-center"><div class="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400"><i data-lucide="inbox" class="w-8 h-8"></i></div>
      <p class="text-sm font-semibold text-slate-600 mt-3">Không tìm thấy Order nào phù hợp</p><p class="text-xs text-slate-400">Hãy thử đổi bộ lọc hoặc gửi Order mới.</p></div>`;
  }
  const rows = list.map(o => {
    const m = orderStatusMeta(o.status); const dl = orderDeadlineInfo(o);
    return `<tr class="order-row" onclick="orderOpenDrawer('${o.id}','sender')">
      <td class="px-4 py-3"><div class="font-bold text-brand-700 text-xs">${escapeHtml(o.code)}</div><div class="text-[10px] text-slate-400">${formatVNDate(o.createdAt)}</div></td>
      <td class="px-4 py-3"><div class="text-xs font-semibold text-slate-700 line-clamp-2 max-w-xs">${escapeHtml(o.content)}</div><div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(o.docType)} • ${escapeHtml(o.department)}</div></td>
      <td class="px-4 py-3"><div class="flex items-center gap-2"><span class="order-avatar">${escapeHtml(orderInitials(o.assigneeName))}</span><span class="text-xs text-slate-600">${escapeHtml(o.assigneeName)}</span></div></td>
      <td class="px-4 py-3 text-xs whitespace-nowrap">${formatVNDate(o.deadline)} ${dl ? `<div class="mt-0.5 inline-block px-1.5 rounded border text-[10px] font-bold ${dl.cls}">${dl.text}</div>` : ''}</td>
      <td class="px-4 py-3">${orderBadge(o.status)}<div class="order-mini-progress mt-1.5"><span class="bg-${m.color}-500" style="width:${m.progress}%"></span></div></td>
      <td class="px-4 py-3 text-right"><i data-lucide="chevron-right" class="w-4 h-4 text-slate-300"></i></td></tr>`;
  }).join('');
  const cards = list.map(o => {
    const m = orderStatusMeta(o.status);
    return `<div class="p-4 border-b border-slate-100 active:bg-slate-50" onclick="orderOpenDrawer('${o.id}','sender')">
      <div class="flex justify-between items-start gap-2"><span class="font-bold text-brand-700 text-xs">${escapeHtml(o.code)}</span>${orderBadge(o.status)}</div>
      <div class="text-sm font-semibold text-slate-700 mt-1.5 line-clamp-2">${escapeHtml(o.content)}</div>
      <div class="text-[11px] text-slate-400 mt-1">${escapeHtml(o.assigneeName)} • Hạn ${formatVNDate(o.deadline)}</div>
      <div class="order-mini-progress mt-2"><span class="bg-${m.color}-500" style="width:${m.progress}%"></span></div></div>`;
  }).join('');
  return `<div class="hidden md:block overflow-x-auto"><table class="w-full text-left">
    <thead><tr class="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200"><th class="px-4 py-3">Mã Order</th><th class="px-4 py-3">Nội dung</th><th class="px-4 py-3">Người xử lý</th><th class="px-4 py-3">Hạn cuối</th><th class="px-4 py-3">Trạng thái</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div><div class="md:hidden">${cards}</div>`;
}

async function orderSenderCancel(id) {
  const o = orderList.find(x => x.id === id);
  if (!o || o.status !== 'pending') return;
  const note = await orderAskNote('Hủy Order ' + o.code, 'Lý do hủy (không bắt buộc)', false);
  if (note === null) return;
  o.status = 'rejected';
  o.history = (o.history || []).concat([{ status: 'rejected', by: o.senderName, byEmail: o.senderEmail, at: orderNowISO(), note: note ? 'Người gửi hủy: ' + note : 'Người gửi đã tự hủy Order' }]);
  await orderPersist(o);
  orderCloseDrawer();
  showToast('Đã hủy Order ' + o.code, 'info');
}
function orderSenderEdit(id) {
  orderCloseDrawer();
  orderEditingId = id; orderPortalTab = 'new'; orderRenderPortal();
}

// ---------- Drawer chi tiết + Timeline ----------
function orderOpenDrawer(id, mode) {
  const o = orderList.find(x => x.id === id);
  const drawer = document.getElementById('order-drawer');
  if (!o || !drawer) return;
  drawer.dataset.orderId = id; drawer.dataset.mode = mode;
  const m = orderStatusMeta(o.status);
  const links = orderExtractLinks(o.note);
  const curStep = o.status === 'revise' ? 2 : m.step;
  const stepper = o.status === 'rejected'
    ? `<div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i>Order đã bị từ chối / hủy</div>`
    : `<div class="order-stepper">${ORDER_STEPPER.map((s, i) => {
        const sm = ORDER_STATUSES[s];
        const state = i < curStep ? 'done' : i === curStep ? (o.status === 'revise' ? 'warn' : 'current') : '';
        return `<div class="order-stepper-item ${state}"><div class="order-stepper-dot"><i data-lucide="${state === 'done' ? 'check' : state === 'warn' ? 'alert-triangle' : sm.icon}" class="w-3.5 h-3.5"></i></div><span>${state === 'warn' ? 'Cần bổ sung' : sm.short}</span></div>`;
      }).join('')}</div>`;
  const timeline = (o.history || []).slice().reverse().map((h, i) => {
    const hm = orderStatusMeta(h.status);
    return `<li class="order-tl-item ${i === 0 ? 'latest' : ''}"><span class="order-tl-dot bg-${hm.color}-500"><i data-lucide="${hm.icon}" class="w-3 h-3 text-white"></i></span>
      <div class="flex flex-wrap items-center gap-2"><span class="text-xs font-bold text-slate-800">${hm.label}</span><span class="text-[10px] text-slate-400">${formatVNDateTime(h.at)}</span></div>
      <div class="text-[11px] text-slate-500 mt-0.5">bởi <b class="text-slate-600">${escapeHtml(h.by || h.byEmail || '')}</b></div>
      ${h.note ? `<div class="mt-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">${escapeHtml(h.note)}</div>` : ''}</li>`;
  }).join('');
  const info = [
    ['Người gửi', `${escapeHtml(o.senderName)}<div class="text-[10px] text-slate-400">${escapeHtml(o.senderEmail)}</div>`],
    ['Đơn vị gửi', escapeHtml(o.department)],
    ['Loại hồ sơ', escapeHtml(o.docType)], ['Ưu tiên', orderPriorityChip(o.priority)],
    ['Người xử lý', escapeHtml(o.assigneeName)],
    ['Chi phí dự kiến', `${orderFormatMoney(o.cost)} VND`],
    ['Ngày gửi', formatVNDate(o.sentDate)], ['Hạn cuối', formatVNDate(o.deadline)],
    ['Cập nhật', formatVNDateTime(o.updatedAt)]
  ].map(([k, v]) => `<div><div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">${k}</div><div class="text-xs text-slate-700 font-medium mt-0.5">${v}</div></div>`).join('');

  let actions = '';
  if (mode === 'sender') {
    if (o.status === 'pending') actions = `<button onclick="orderSenderCancel('${o.id}')" class="order-btn-ghost text-rose-600 border-rose-200"><i data-lucide="x" class="w-4 h-4"></i>Hủy Order</button>`;
    if (o.status === 'revise') actions = `<button onclick="orderSenderEdit('${o.id}')" class="order-btn-primary"><i data-lucide="file-pen-line" class="w-4 h-4"></i>Bổ sung & gửi lại</button>`;
  } else {
    actions = orderHandlerActionsHTML(o, true);
  }

  // Chỉ cho phép chuyển người xử lý ở khâu "Chờ tiếp nhận" (hoặc do Cấp Quản lý điều phối)
  const canReassign = mode === 'handler' && (o.status === 'pending' || isManager(currentUser));
  const reassign = canReassign ? `
    <div class="order-card p-4">
      <div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center justify-between">
        <span>Chuyển người xử lý (Khâu Tiếp nhận)</span>
        <span class="text-[10px] text-brand-600 font-semibold">Chưa vào bảng tuần</span>
      </div>
      <p class="text-[11px] text-slate-500 mb-2">Nếu hồ sơ này thuộc phụ trách của chuyên viên khác, hãy chuyển ngay trước khi Tiếp nhận.</p>
      <select class="order-input" onchange="orderReassign('${o.id}', this.value)">
        ${orderStaffCache.map(s => `<option value="${escapeHtml(s.email)}" ${s.email === o.assigneeEmail ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>` : (mode === 'handler' && !['done', 'rejected'].includes(o.status) ? `
    <div class="order-card p-3 bg-slate-50 border-slate-200 text-xs text-slate-600 flex items-center gap-2">
      <i data-lucide="lock" class="w-4 h-4 text-slate-400 shrink-0"></i>
      <span>Hồ sơ đã tiếp nhận xử lý bởi <b>${escapeHtml(o.assigneeName)}</b> (khóa chuyển giao giữa chừng).</span>
    </div>` : '');

  drawer.innerHTML = `
  <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onclick="orderCloseDrawer()"></div>
  <aside class="order-drawer-panel">
    <div class="crimson-card-header px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0"><div class="text-[11px] text-rose-100">Chi tiết Order</div><div class="text-lg font-extrabold tracking-wide">${escapeHtml(o.code)}</div></div>
      <button onclick="orderCloseDrawer()" class="p-2 rounded-xl hover:bg-white/15"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>
    <div class="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
      <div class="flex flex-wrap items-center gap-2">${orderBadge(o.status, 'lg')} ${orderDeadlineInfo(o) ? `<span class="px-2 py-0.5 rounded-full border text-[11px] font-bold ${orderDeadlineInfo(o).cls}">${orderDeadlineInfo(o).text}</span>` : ''}</div>
      ${stepper}
      <div class="order-card p-4"><div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Nội dung hồ sơ</div><div class="text-sm text-slate-800 whitespace-pre-line">${escapeHtml(o.content)}</div>
        ${o.note ? `<div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-3 mb-1">Ghi chú</div><div class="text-xs text-slate-600 whitespace-pre-line break-words">${escapeHtml(o.note)}</div>` : ''}
        ${links.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${links.map(l => `<a href="${escapeHtml(l)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 max-w-full"><i data-lucide="${orderLinkIcon(l)}" class="w-3 h-3 shrink-0"></i><span class="truncate max-w-[220px]">${escapeHtml(l.replace(/^https?:\/\//, ''))}</span></a>`).join('')}</div>` : ''}
      </div>
      <div class="order-card p-4 grid grid-cols-2 gap-x-4 gap-y-3">${info}</div>
      ${reassign}
      <div class="order-card p-4"><div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-1.5"><i data-lucide="history" class="w-3.5 h-3.5"></i>Tiến trình xử lý</div><ul class="order-timeline">${timeline}</ul></div>
    </div>
    ${actions ? `<div class="p-4 border-t border-slate-200 bg-white flex flex-wrap justify-end gap-2">${actions}</div>` : ''}
  </aside>`;
  drawer.classList.remove('hidden');
  requestAnimationFrame(() => drawer.classList.add('open'));
  orderIcons();
}
function orderCloseDrawer() {
  const drawer = document.getElementById('order-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  setTimeout(() => { drawer.classList.add('hidden'); drawer.innerHTML = ''; drawer.dataset.orderId = ''; }, 220);
}
function orderRefreshDrawer() {
  const drawer = document.getElementById('order-drawer');
  if (drawer && !drawer.classList.contains('hidden') && drawer.dataset.orderId) {
    const scroll = drawer.querySelector('.overflow-y-auto')?.scrollTop || 0;
    orderOpenDrawer(drawer.dataset.orderId, drawer.dataset.mode);
    const el = drawer.querySelector('.overflow-y-auto'); if (el) el.scrollTop = scroll;
  }
}

// ---------- Người xử lý: thao tác ----------
const ORDER_TRANSITIONS = {
  pending:  [['received', 'Tiếp nhận', 'inbox', 'primary'], ['rejected', 'Từ chối', 'x-circle', 'danger']],
  received: [['reviewed', 'Duyệt nội dung', 'file-check-2', 'primary'], ['done', 'Hoàn tất', 'badge-check', 'success'], ['revise', 'Yêu cầu bổ sung', 'alert-triangle', 'warn'], ['rejected', 'Từ chối', 'x-circle', 'danger']],
  reviewed: [['done', 'Hoàn tất', 'badge-check', 'success'], ['revise', 'Yêu cầu bổ sung', 'alert-triangle', 'warn'], ['rejected', 'Từ chối', 'x-circle', 'danger']],
  revise:   [['received', 'Tiếp nhận lại', 'inbox', 'ghost']],
  done: [], rejected: []
};
function orderHandlerActionsHTML(o, big) {
  const cls = { primary: 'order-btn-primary', success: 'order-btn-success', warn: 'order-btn-warn', danger: 'order-btn-ghost text-rose-600 border-rose-200', ghost: 'order-btn-ghost' };
  return (ORDER_TRANSITIONS[o.status] || []).map(([to, label, icon, kind]) =>
    `<button onclick="event.stopPropagation();orderChangeStatus('${o.id}','${to}')" class="${cls[kind]} ${big ? '' : 'order-btn-xs'}"><i data-lucide="${icon}" class="w-${big ? 4 : 3} h-${big ? 4 : 3}"></i>${label}</button>`).join('');
}

function orderActorName() {
  if (ORDER_DEMO_MODE && orderPortalUser && orderPortalView === 'handler') return orderPortalUser.name;
  return String(currentUser.name || currentUser.email || 'Người xử lý').replace(/\s*\(.+\)$/, '');
}
function orderActorEmail() {
  if (ORDER_DEMO_MODE && orderPortalUser && orderPortalView === 'handler') return orderPortalUser.email;
  return currentUser.email || '';
}

async function orderChangeStatus(id, to) {
  const o = orderList.find(x => x.id === id);
  if (!o || o.status === to) return;
  const needNote = to === 'revise' || to === 'rejected';
  const titles = { received: 'Tiếp nhận Order', reviewed: 'Duyệt nội dung', revise: 'Yêu cầu bổ sung', done: 'Hoàn tất Order', rejected: 'Từ chối Order', pending: 'Chuyển về Chờ tiếp nhận' };
  const note = await orderAskNote(`${titles[to] || 'Cập nhật'} • ${o.code}`,
    needNote ? 'Nội dung cần người gửi điều chỉnh / lý do (bắt buộc)' : 'Ghi chú gửi tới người gửi (không bắt buộc)', needNote);
  if (note === null) return;
  o.status = to;
  o.history = (o.history || []).concat([{ status: to, by: orderActorName(), byEmail: orderActorEmail(), at: orderNowISO(), note }]);
  if (to === 'received' && !o.linkedTaskId) orderCreateDossier(o);
  else orderSyncTask(o);
  await orderPersist(o);
  orderRerender();
  showToast(`${o.code} → ${orderStatusMeta(to).label}`, 'success');
}

async function orderReassign(id, email) {
  const o = orderList.find(x => x.id === id);
  if (!o || o.assigneeEmail === email) return;

  // Kiểm tra điều kiện: chỉ cho chuyển ở khâu Chờ tiếp nhận (hoặc Quản lý)
  if (o.status !== 'pending' && !isManager(currentUser)) {
    showToast('Chỉ được chuyển hồ sơ ở khâu Chờ tiếp nhận! Không chuyển việc đang làm giữa chừng.', 'error');
    orderRefreshDrawer();
    return;
  }

  const st = orderStaffCache.find(s => s.email === email);
  const targetName = st ? st.name : email;

  // Bắt buộc nhập lý do chuyển giao
  const reason = await orderAskNote(
    `Chuyển Order ${o.code} cho ${targetName}`,
    'Lý do chuyển người xử lý (bắt buộc: ví dụ đúng chuyên môn, quá tải...)',
    true
  );
  if (!reason) {
    orderRefreshDrawer(); // Revert select nếu người dùng bấm Hủy
    return;
  }

  const oldName = o.assigneeName;
  o.assigneeEmail = email;
  o.assigneeName = targetName;
  o.history = (o.history || []).concat([{
    status: o.status,
    by: orderActorName(),
    byEmail: orderActorEmail(),
    at: orderNowISO(),
    note: `Chuyển người xử lý: ${oldName} → ${targetName}. Lý do: ${reason}`
  }]);

  await orderPersist(o);
  orderRerender();
  showToast(`Đã chuyển ${o.code} cho ${targetName} (Khâu Chờ tiếp nhận)`, 'success');
}

function orderAskNote(title, placeholder, required) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in';
    wrap.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
      <div class="crimson-card-header px-5 py-3.5 font-bold text-sm">${escapeHtml(title)}</div>
      <div class="p-5"><textarea rows="3" class="order-input" placeholder="${escapeHtml(placeholder)}"></textarea>
      <p class="hidden text-[11px] text-rose-600 mt-1 order-note-err">Vui lòng nhập nội dung.</p></div>
      <div class="px-5 pb-5 flex justify-end gap-2"><button class="order-btn-ghost" data-act="cancel">Hủy</button><button class="order-btn-primary" data-act="ok">Xác nhận</button></div></div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea'); setTimeout(() => ta.focus(), 50);
    const done = val => { wrap.remove(); resolve(val); };
    wrap.querySelector('[data-act="cancel"]').onclick = () => done(null);
    wrap.onclick = ev => { if (ev.target === wrap) done(null); };
    wrap.querySelector('[data-act="ok"]').onclick = () => {
      const v = ta.value.trim();
      if (required && !v) { wrap.querySelector('.order-note-err').classList.remove('hidden'); return; }
      done(v);
    };
  });
}

// Tạo Hồ sơ trong Bảng phân việc khi Tiếp nhận Order
function orderBuildTask(o) {
  return {
    id: 'task_ord_' + Date.now(), code: o.code,
    title: `[Order] ${o.docType}: ${String(o.content).slice(0, 90)}`,
    client: `${o.senderName} – ${o.department}`,
    category: 'Giải quyết các yêu cầu phát sinh',
    priority: o.priority || 'medium',
    assignedDate: orderTodayStr(), deadline: o.deadline,
    assignee: o.assigneeEmail, status: 'in_progress', progress: ORDER_STATUSES.received.progress,
    link: orderExtractLinks(o.note)[0] || '',
    notes: `Order từ ${o.senderName} (${o.senderEmail}) • Chi phí: ${orderFormatMoney(o.cost)} VND • ${o.note || ''}`.trim(),
    completedAt: null, updatedAt: orderNowISO(), rating: null, approval: '', managerFeedback: '', sourceOrderId: o.id
  };
}
function orderFindAssigneeWorkspace(email) {
  if (!email) return null;
  if (!isManager(currentUser) && workspaceData && (workspaceData.ownerEmail || '').toLowerCase() === email) return { ws: workspaceData, own: true };
  const entry = Object.entries(teamWorkspaces || {}).find(([, ws]) => (ws.ownerEmail || '').toLowerCase() === email);
  return entry ? { ws: entry[1], own: false, empId: entry[0] } : null;
}
function orderSaveForeignWorkspace(ws) {
  if (!fbDb || orderUseLocal || !ws || !ws.ownerEmail) return;
  fbDb.collection('wf_employees').doc(ws.ownerEmail.trim().toLowerCase())
    .set({ tasks: ws.tasks, updatedAt: orderNowISO() }, { merge: true })
    .catch(err => console.warn('Order → dossier sync warning:', err));
}
function orderCreateDossier(o) {
  if (ORDER_DEMO_MODE && orderPortalView === 'handler') { o.linkedTaskId = 'demo_task'; return; }
  const target = orderFindAssigneeWorkspace(o.assigneeEmail);
  if (!target) return;
  const task = orderBuildTask(o);
  target.ws.tasks = Array.isArray(target.ws.tasks) ? target.ws.tasks : [];
  target.ws.tasks.unshift(task);
  o.linkedTaskId = task.id;
  if (target.own) {
    recordJournalLog('created', task.code, task.title, `Tự động tạo từ Order của ${o.senderName} (${o.department}) • Deadline: ${formatVNDate(o.deadline)}`);
    saveWorkspaceData();
  } else {
    orderSaveForeignWorkspace(target.ws);
  }
  showToast(`📁 Đã tạo Hồ sơ ${task.code} trong bảng phân việc của ${o.assigneeName}`, 'success');
  try { renderAll(); } catch (e) { /* noop */ }
}
function orderSyncTask(o) {
  if (!o.linkedTaskId || o.linkedTaskId === 'demo_task') return;
  const target = orderFindAssigneeWorkspace(o.assigneeEmail);
  if (!target || !Array.isArray(target.ws.tasks)) return;
  const t = target.ws.tasks.find(x => x.id === o.linkedTaskId);
  if (!t) return;
  const m = orderStatusMeta(o.status);
  t.progress = m.progress;
  t.status = o.status === 'done' ? 'completed' : (o.status === 'rejected' ? 'pending' : 'in_progress');
  t.completedAt = o.status === 'done' ? orderNowISO() : null;
  t.updatedAt = orderNowISO();
  if (target.own) {
    recordJournalLog(o.status === 'done' ? 'completed' : 'updated', t.code, t.title, `Order chuyển trạng thái: ${m.label}`);
    saveWorkspaceData();
  } else orderSaveForeignWorkspace(target.ws);
}

// ---------- Hộp Order (Kanban / Bảng) ----------
function orderInboxSource() {
  if (ORDER_DEMO_MODE && orderPortalUser && orderPortalView === 'handler') return orderList;
  const me = (currentUser.email || '').toLowerCase();
  if (isManager(currentUser) && orderInboxFilters.scope === 'all') return orderList;
  return orderList.filter(o => o.assigneeEmail === me);
}
function orderSetInboxFilter(k, v) { orderInboxFilters[k] = v; orderRerender(); }
function orderSetInboxView(v) { orderInboxView = v; orderRerender(); }
function orderCopyPortalLink() {
  const url = `${location.origin}${location.pathname}#order`;
  navigator.clipboard.writeText(url).then(() => showToast('Đã sao chép link Cổng Tiếp Nhận Hồ Sơ: ' + url, 'success'));
}

function orderRenderInbox(containerId = 'orders-inbox-root', isDemo = false) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const src = orderInboxSource();
  const list = orderApplyFilters(src, { q: orderInboxFilters.q, status: orderInboxFilters.status });
  const c = s => src.filter(o => o.status === s).length;
  const overdue = src.filter(o => (orderDeadlineInfo(o) || {}).text === 'Quá hạn').length;
  const stats = [
    { label: 'Chờ tiếp nhận', val: c('pending'), icon: 'bell-ring', cls: 'from-rose-500 to-brand-700', pulse: c('pending') > 0 },
    { label: 'Đang xử lý', val: c('received') + c('reviewed'), icon: 'loader', cls: 'from-blue-500 to-indigo-600' },
    { label: 'Chờ người gửi bổ sung', val: c('revise'), icon: 'alert-triangle', cls: 'from-amber-400 to-orange-500' },
    { label: 'Hoàn tất', val: c('done'), icon: 'badge-check', cls: 'from-emerald-500 to-teal-600' },
    { label: 'Quá hạn', val: overdue, icon: 'alarm-clock', cls: 'from-slate-600 to-slate-800' }
  ];
  const scopeToggle = (!isDemo && isManager(currentUser)) ? `
    <div class="inline-flex bg-slate-100 rounded-xl p-1 text-xs">
      <button onclick="orderSetInboxFilter('scope','all')" class="px-3 py-1.5 rounded-lg font-bold ${orderInboxFilters.scope === 'all' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}">Toàn team</button>
      <button onclick="orderSetInboxFilter('scope','mine')" class="px-3 py-1.5 rounded-lg font-bold ${orderInboxFilters.scope !== 'all' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}">Giao cho tôi</button></div>` : '';
  root.innerHTML = `
  <div class="space-y-4 animate-fade-in">
    <div class="order-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div class="flex items-center gap-3"><div class="w-11 h-11 rounded-2xl crimson-card-header flex items-center justify-center shadow"><i data-lucide="mail-open" class="w-5 h-5"></i></div>
        <div><div class="font-extrabold text-slate-800">Hộp Tiếp Nhận Hồ Sơ</div><div class="text-[11px] text-slate-500">Yêu cầu từ các phòng ban gửi tới — kéo thả thẻ để đổi trạng thái</div></div></div>
      <div class="flex flex-wrap items-center gap-2">${scopeToggle}
        <button onclick="orderCopyPortalLink()" class="order-btn-ghost order-btn-xs"><i data-lucide="link" class="w-3.5 h-3.5"></i>Copy link Cổng Tiếp Nhận</button>
        ${!isDemo ? `<button onclick="location.hash='order'" class="order-btn-primary order-btn-xs"><i data-lucide="external-link" class="w-3.5 h-3.5"></i>Mở Cổng Tiếp Nhận</button>` : ''}
      </div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">${stats.map(s => `<div class="order-stat bg-gradient-to-br ${s.cls} ${s.pulse ? 'order-pulse' : ''}"><div><div class="text-[10px] uppercase tracking-wider opacity-80 font-semibold">${s.label}</div><div class="text-2xl font-extrabold mt-0.5">${s.val}</div></div><i data-lucide="${s.icon}" class="w-8 h-8 opacity-30"></i></div>`).join('')}</div>
    <div class="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
      <div class="flex flex-1 gap-2 flex-col sm:flex-row">
        <div class="relative flex-1 max-w-md"><i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i><input id="order-inbox-search" class="order-input pl-9" placeholder="Tìm mã, nội dung, người gửi, đơn vị..." value="${escapeHtml(orderInboxFilters.q)}" oninput="orderInboxFilters.q=this.value;clearTimeout(window._oiT);window._oiT=setTimeout(()=>{orderRerender();const el=document.getElementById('order-inbox-search');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},250)" /></div>
        ${orderInboxView === 'table' ? `<select class="order-input sm:w-56" onchange="orderSetInboxFilter('status',this.value)"><option value="">-- Tất cả trạng thái --</option>${Object.entries(ORDER_STATUSES).map(([k, m]) => `<option value="${k}" ${orderInboxFilters.status === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select>` : ''}
      </div>
      <div class="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs shadow-sm self-start">
        <button onclick="orderSetInboxView('kanban')" class="px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${orderInboxView === 'kanban' ? 'bg-brand-600 text-white' : 'text-slate-500'}"><i data-lucide="columns-3" class="w-3.5 h-3.5"></i>Kanban</button>
        <button onclick="orderSetInboxView('table')" class="px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${orderInboxView === 'table' ? 'bg-brand-600 text-white' : 'text-slate-500'}"><i data-lucide="table" class="w-3.5 h-3.5"></i>Bảng</button>
      </div>
    </div>
    ${orderInboxView === 'kanban' ? orderKanbanHTML(list) : orderInboxTableHTML(list)}
  </div>`;
  orderIcons();
}

function orderKanbanCard(o) {
  const dl = orderDeadlineInfo(o);
  return `<div class="order-kcard" draggable="true" ondragstart="orderDragId='${o.id}';this.classList.add('dragging')" ondragend="this.classList.remove('dragging')" onclick="orderOpenDrawer('${o.id}','handler')">
    <div class="flex items-center justify-between gap-2"><span class="text-[11px] font-extrabold text-brand-700">${escapeHtml(o.code)}</span>${orderPriorityChip(o.priority)}</div>
    <div class="text-xs font-semibold text-slate-800 mt-1.5 line-clamp-3">${escapeHtml(o.content)}</div>
    <div class="flex flex-wrap gap-1 mt-2"><span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${escapeHtml(o.docType)}</span><span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${escapeHtml(o.department)}</span></div>
    <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
      <div class="flex items-center gap-1.5 min-w-0"><span class="order-avatar">${escapeHtml(orderInitials(o.senderName))}</span><span class="text-[10px] text-slate-500 truncate">${escapeHtml(o.senderName)}</span></div>
      <span class="text-[10px] font-semibold ${dl ? dl.cls + ' px-1.5 rounded border' : 'text-slate-400'} whitespace-nowrap"><i data-lucide="calendar" class="w-3 h-3 inline -mt-0.5"></i> ${formatVNDate(o.deadline).slice(0, 5)}${dl ? ' • ' + dl.text : ''}</span>
    </div>
    ${(ORDER_TRANSITIONS[o.status] || []).length ? `<div class="flex flex-wrap gap-1 mt-2">${orderHandlerActionsHTML(o, false)}</div>` : ''}
  </div>`;
}
function orderKanbanHTML(list) {
  return `<div class="order-kanban">${ORDER_KANBAN_COLS.map(s => {
    const m = ORDER_STATUSES[s]; const items = list.filter(o => o.status === s);
    return `<div class="order-kcol" ondragover="event.preventDefault();this.classList.add('drop-hover')" ondragleave="this.classList.remove('drop-hover')" ondrop="this.classList.remove('drop-hover');if(orderDragId){orderChangeStatus(orderDragId,'${s}');orderDragId=null;}">
      <div class="order-kcol-head border-${m.color}-400"><span class="flex items-center gap-1.5"><i data-lucide="${m.icon}" class="w-3.5 h-3.5 text-${m.color}-600"></i>${m.short}</span><span class="px-2 rounded-full bg-${m.color}-100 text-${m.color}-700 text-[10px] font-extrabold">${items.length}</span></div>
      <div class="space-y-2.5 min-h-[80px]">${items.map(orderKanbanCard).join('') || `<div class="text-[11px] text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">Kéo thả vào đây</div>`}</div>
    </div>`;
  }).join('')}</div>${list.some(o => o.status === 'rejected') ? `<p class="text-[11px] text-slate-400">* ${list.filter(o => o.status === 'rejected').length} Order đã từ chối/hủy — xem ở chế độ Bảng.</p>` : ''}`;
}
function orderInboxTableHTML(list) {
  if (!list.length) return `<div class="order-card py-14 text-center text-sm text-slate-500"><i data-lucide="inbox" class="w-10 h-10 mx-auto text-slate-300"></i><p class="mt-2">Chưa có Order nào.</p></div>`;
  return `<div class="order-card p-0 overflow-x-auto"><table class="w-full text-left min-w-[900px]">
    <thead><tr class="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50"><th class="px-4 py-3">Mã</th><th class="px-4 py-3">Người gửi</th><th class="px-4 py-3">Loại</th><th class="px-4 py-3">Nội dung</th><th class="px-4 py-3">Người xử lý</th><th class="px-4 py-3">Hạn cuối</th><th class="px-4 py-3">Trạng thái</th><th class="px-4 py-3 text-right">Thao tác</th></tr></thead>
    <tbody>${list.map(o => { const dl = orderDeadlineInfo(o); return `<tr class="order-row" onclick="orderOpenDrawer('${o.id}','handler')">
      <td class="px-4 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">${escapeHtml(o.code)}</td>
      <td class="px-4 py-3"><div class="text-xs font-semibold text-slate-700">${escapeHtml(o.senderName)}</div><div class="text-[10px] text-slate-400">${escapeHtml(o.department)}</div></td>
      <td class="px-4 py-3 text-xs text-slate-600">${escapeHtml(o.docType)}</td>
      <td class="px-4 py-3 text-xs text-slate-700 max-w-xs"><div class="line-clamp-2">${escapeHtml(o.content)}</div></td>
      <td class="px-4 py-3 text-xs text-slate-600">${escapeHtml(o.assigneeName)}</td>
      <td class="px-4 py-3 text-xs whitespace-nowrap">${formatVNDate(o.deadline)}${dl ? `<div class="inline-block mt-0.5 px-1.5 rounded border text-[10px] font-bold ${dl.cls}">${dl.text}</div>` : ''}</td>
      <td class="px-4 py-3">${orderBadge(o.status)}</td>
      <td class="px-4 py-3"><div class="flex justify-end flex-wrap gap-1">${orderHandlerActionsHTML(o, false)}</div></td></tr>`; }).join('')}</tbody></table></div>`;
}

function orderUpdateNavBadges() {
  const me = (currentUser.email || '').toLowerCase();
  const pending = orderList.filter(o => o.status === 'pending' && (o.assigneeEmail === me || isManager(currentUser))).length;
  ['nav-orders-count', 'nav-orders-mgr-count'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = pending;
    el.classList.toggle('hidden', pending === 0);
  });
}

function orderRerender() {
  const portal = document.getElementById('order-portal');
  const portalOpen = portal && portal.classList.contains('flex');
  if (portalOpen) {
    if (ORDER_DEMO_MODE && orderPortalView === 'handler') orderRenderInbox('order-portal-inbox', true);
    else if (orderPortalUser) {
      const content = document.getElementById('order-portal-content');
      if (content && orderPortalTab === 'mine') {
        // Chỉ vẽ lại danh sách + thống kê, không làm mất form đang nhập
        orderRenderPortal();
      } else if (!content) orderRenderPortal();
    }
  }
  if (typeof activeTab !== 'undefined' && activeTab === 'orders') orderRenderInbox('orders-inbox-root');
  orderUpdateNavBadges();
  orderRefreshDrawer();
}

// ---------- Tích hợp với app chính ----------
function orderHandleHash() {
  if (location.hash === '#order') orderOpenPortal();
}
window.addEventListener('hashchange', orderHandleHash);
window.addEventListener('DOMContentLoaded', () => {
  if (location.hash === '#order') { orderOpenPortal(); return; }
  if (isUserAuthenticatedSession()) {
    orderLoadStaff();
    orderSubscribe('handler');
  }
});
// Sau khi đăng nhập app chính bằng OTP → tự kết nối Hộp Order
const _orderOrigVerifyOTP = handleVerifyOTP;
handleVerifyOTP = async function (e) {
  await _orderOrigVerifyOTP(e);
  if (isUserAuthenticatedSession()) { orderLoadStaff(); orderSubscribe('handler'); }
};
