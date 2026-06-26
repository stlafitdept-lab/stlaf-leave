/* File: main.jsx
Author: Iya
Date: 2026-08-25
Purpose: Houses the core frontend runtime dashboard application script, 
handling user interactions, dynamic tables, and API fetch calls.*/

// ==========================================
// 1. CONFIGURATION & GLOBALS
// ==========================================
const API_BASE_URL = 'https://stlaf-api-1.onrender.com';

window.dashboardRecords = window.dashboardRecords || {};

if (typeof window.showPopup === "undefined") {
  window.showPopup = function ({ title, message, type }) {
    alert(`${title}: ${message}`);
  };
}

// ==========================================
// 2. CORE DATA FETCHING (COMMON)
// ==========================================
let ADMIN_ACTIVE_TAB = 'all-leaves';
let EMPLOYEE_ACTIVE_TAB = "leave";

window.onEmployeeYearChange = () => {
  window.switchTab?.(EMPLOYEE_ACTIVE_TAB || "leave");
};

async function fetchData(endpoint, queryParam, tableId, renderFn, options = {}) {
  const tableBody = document.getElementById(tableId);
  if (!tableBody || !queryParam) return;

  const {
    mode = "",        // mode=normal | ut | all
    extraQuery = {},  // any extra query params
    colSpan = null    // override colspan if needed
  } = options;

  // 1) YEAR (separate filters)
  const currentYear = new Date().getFullYear().toString();

  // ✅ Employee uses #employee-year-filter, Admin uses #year-filter
  const yearSelect =
    document.getElementById("employee-year-filter") ||
    document.getElementById("year-filter");

  const selectedYear = yearSelect?.value || currentYear;

  // ensure dropdown has a value
  if (yearSelect && !yearSelect.value) yearSelect.value = selectedYear;

  const role = localStorage.getItem("logged_user_role") || "";
  const dept = localStorage.getItem("logged_user_dept") || "";

  // 2) AUTO COLSPAN (match your table headers)
  const computedColSpan =
    colSpan ??
    (tableId === "leave-table-body" ? 7 :
      tableId === "ot-table-body" ? 6 :
        tableId === "ut-table-body" ? 8 :     // Type, Date, Start, End, Reason, Status, Action
          tableId === "ob-table-body" ? 5 :      // Purpose, Date, Time In, Time Out, Status
            tableId === "admin-table-body" ? 7 :   // default admin view in your UI
              6);

  // 3) LOADING STATE
  tableBody.innerHTML = `
    <tr>
      <td colspan="${computedColSpan}" class="p-12 text-center">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-[#c5a021] mb-4"></div>
        <p class="text-slate-400 font-medium">Fetching ${selectedYear} records...</p>
      </td>
    </tr>
  `;

  // 4) BUILD QUERY STRING
  const params = new URLSearchParams();
  params.set("employeeId", queryParam);
  params.set("role", role);
  params.set("department", dept);
  params.set("year", selectedYear);

  if (mode) params.set("mode", mode);

  // attach extra query params
  Object.entries(extraQuery || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && `${v}` !== "") params.set(k, v);
  });

  const url = `${API_BASE_URL}/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(url);

    // safer parsing (php might output HTML warnings)
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Non-JSON response from backend:", raw);
      throw new Error("Invalid server response. Check PHP output for errors.");
    }

    if (!response.ok) throw new Error("Network response was not ok");

    tableBody.innerHTML = "";

    // backend could return {success:false,...}
    if (data && typeof data === "object" && !Array.isArray(data) && data.success === false) {
      throw new Error(data.message || data.error || "Request failed.");
    }

    if (!Array.isArray(data) || data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="${computedColSpan}" class="p-12 text-center text-slate-400">
            <p>No records found for ${selectedYear}.</p>
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = data.map(renderFn).join("");
    }

    // stats update (if available)
    if (typeof updateGlobalStats === "function") {
      updateGlobalStats(queryParam, role, dept, selectedYear);
    }

  } catch (e) {
    console.error(`Error fetching ${endpoint}:`, e);
    tableBody.innerHTML = `
      <tr>
        <td colspan="${computedColSpan}" class="p-12 text-center">
          <p class="text-red-500 font-bold">⚠️ Connection Error</p>
          <p class="text-slate-400 text-sm">${e?.message || "Unable to load data. Please check the server connection."}</p>
        </td>
      </tr>
    `;
  }
}

async function updateGlobalStats(queryParam, role, dept, selectedYear) {
  console.log("Updating stats for:", { queryParam, role, dept, selectedYear }); // Debug log

  try {
    const response = await fetch(`${API_BASE_URL}/get_stats.php?id=${queryParam}&role=${role}&dept=${dept}&year=${selectedYear}`);

    if (!response.ok) throw new Error('Network response was not ok');

    const stats = await response.json();
    console.log("Backend Stats Received:", stats); // Debug log

    const userRole = role ? role.toLowerCase() : "";

    // 1. ADMIN / SUPERADMIN STATS
    if (userRole === 'admin' || userRole === 'superadmin') {
      const totalLeavesEl = document.getElementById('admin-total-leaves');
      const totalOtsEl = document.getElementById('admin-total-ots');
      if (totalLeavesEl) totalLeavesEl.innerText = stats.total_leaves || 0;
      if (totalOtsEl) totalOtsEl.innerText = stats.total_ots || 0;
    }

    // 3. APPROVER STATS
    // Ensure logic matches variable names from PHP (total_pending and total_processed)
    if (userRole === 'approver') {
      const pendingEl = document.getElementById('approver-total-pending');
      const processedEl = document.getElementById('approver-total-processed');

      console.log("Targeting Approver Elements:", { pendingEl, processedEl });

      if (pendingEl) {
        pendingEl.innerText = stats.total_pending ?? 0;
      }
      if (processedEl) {
        processedEl.innerText = stats.total_processed ?? 0;
      }
    }

  } catch (error) {
    console.error("Error updating stats:", error);
  }
}

// ==========================================
// 3. EMPLOYEE PORTAL LOGIC - UPDATED
// ==========================================

const fetchMyLeaves = () => fetchData(
  'get_leaves.php',
  localStorage.getItem("logged_user_id"),
  "leave-table-body",
  renderLeaveRow,
  { mode: "normal" } // ✅ Fixed: Wrapped in an object
);

const fetchMyOvertime = () => fetchData(
  'get_overtime.php',
  localStorage.getItem("logged_user_id"),
  "ot-table-body",
  renderOTRow
  // No options needed here
);

const fetchMyUndertime = () => fetchData(
  'get_leaves.php',
  localStorage.getItem("logged_user_id"),
  "ut-table-body",
  renderUTRow,
  { mode: "ut" } // ✅ Fixed: Wrapped in an object
);

const fetchMyOB = () => {
  const empId = localStorage.getItem("logged_user_id"); // Siguraduhin na ito yung "STLAF-..."
  if (!empId) return;

  fetchData('get_ob.php', empId, 'ob-table-body', window.renderOBRow);
};

window.fetchMyOB = fetchMyOB;

window.switchTab = (tab) => {
  EMPLOYEE_ACTIVE_TAB = tab;

  const sections = {
    leave: document.getElementById('leave-section'),
    ot: document.getElementById('ot-section'),
    ut: document.getElementById('ut-section'),
    ob: document.getElementById('ob-section'),
  };

  const tabs = {
    leave: document.getElementById('tab-leave'),
    ot: document.getElementById('tab-ot'),
    ut: document.getElementById('tab-ut'),
    ob: document.getElementById('tab-ob'),
  };

  const tables = {
    leave: document.getElementById('leave-table-body'),
    ot: document.getElementById('ot-table-body'),
    ut: document.getElementById('ut-table-body'),
    ob: document.getElementById('ob-table-body'),
  };

  // hide all sections
  Object.values(sections).forEach(sec => sec?.classList.add('hidden'));

  // reset ALL tabs styles (IMPORTANT FIX)
  Object.values(tabs).forEach(btn => {
    if (!btn) return;

    btn.classList.remove(
      'border-[#c5a021]',
      'text-[#1a2634]'
    );

    btn.classList.add(
      'border-transparent',
      'text-slate-400'
    );
  });

  // optional clear tables
  Object.values(tables).forEach(tbl => {
    if (tbl) tbl.innerHTML = '';
  });

  // ACTIVATE SELECTED TAB
  const activeTab = tabs[tab];
  const activeSection = sections[tab];

  if (activeTab) {
    activeTab.classList.add('border-[#c5a021]', 'text-[#1a2634]');
    activeTab.classList.remove('border-transparent', 'text-slate-400');
  }

  if (activeSection) {
    activeSection.classList.remove('hidden');
  }

  // fetch per tab
  if (tab === 'leave') fetchMyLeaves();
  else if (tab === 'ot') fetchMyOvertime();
  else if (tab === 'ut') fetchMyUndertime();
  else if (tab === 'ob') window.fetchMyOB?.();
};

window.refreshEmployeeData = async () => {
  const currentType = ADMIN_ACTIVE_TAB || 'all-leaves';

  // 1) READ FILTERS
  const searchTerm = document.getElementById('admin-search-input')?.value?.trim() || '';
  const selectedMonth = document.getElementById('month-filter')?.value || 'all';
  const selectedYear = document.getElementById('year-filter')?.value || new Date().getFullYear().toString();

  const selectedStatus = document.getElementById('status-filter')?.value || 'all';
  const selectedPay = document.getElementById('pay-filter')?.value || 'all';
  const selectedDept = document.getElementById('dept-filter')?.value || 'all';

  const isUsers = currentType === 'manage-users';
  const isLeaves = currentType === 'all-leaves';
  const isOT = currentType === 'all-overtime';
  const isOB = currentType === 'all-ob';

  const hasRejectReasonCol = (isLeaves || isOT); // ✅ only leaves & OT

  // 2) TABLE HEADERS
  const thead = document.getElementById('admin-table-header');
  if (thead) {
    if (isUsers) {
      thead.innerHTML = `
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">ID Number</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Employee Name</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Department</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Position</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Status</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-center">Action</th>
      `;
    } else {
      // ✅ dynamic labels per tab
      const typeHeader = isLeaves ? 'Type' : (isOT ? 'OT Date' : 'Purpose');
      const periodHeader = isLeaves ? 'Period' : (isOT ? 'Hours' : 'Date');
      const reasonHeader = isLeaves ? 'Reason' : (isOT ? 'Reason' : 'Time');

      thead.innerHTML = `
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Employee</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Department</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Position</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">${typeHeader}</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">${periodHeader}</th>
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">${reasonHeader}</th>
        ${hasRejectReasonCol ? `<th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-left">Reject Reason</th>` : ``}
        <th class="py-3 px-4 bg-white text-[11px] uppercase font-black tracking-widest text-slate-400 text-center">Status</th>
      `;
    }
  }

  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;

  // loading
  const colSpanLoading = isUsers ? 6 : (hasRejectReasonCol ? 8 : 7);
  tbody.innerHTML = `
    <tr>
      <td colspan="${colSpanLoading}" class="py-10 text-center text-slate-400">
        Fetching records...
      </td>
    </tr>
  `;

  try {
    // 3) API CALL
    const url =
      `${API_BASE_URL}/get_admin_data.php`
      + `?type=${encodeURIComponent(currentType)}`
      + `&search=${encodeURIComponent(searchTerm)}`
      + `&year=${encodeURIComponent(selectedYear)}`
      + `&month=${encodeURIComponent(selectedMonth)}`
      + `&status=${encodeURIComponent(selectedStatus)}`
      + `&pay_status=${encodeURIComponent(selectedPay)}`
      + `&department=${encodeURIComponent(selectedDept)}`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) throw new Error(result.error);

    // 4) STAT CARDS UPDATE
    const totalEmpEl = document.getElementById('admin-total-employees');
    const totalFiledEl = document.getElementById('admin-total-filed');
    if (totalEmpEl) totalEmpEl.innerText = result.stats?.total_users || '0';
    if (totalFiledEl) totalFiledEl.innerText = result.stats?.total_filed || '0';

    // 5) EMPTY STATE
    if (!result.data || result.data.length === 0) {
      const colSpan = isUsers ? 6 : (hasRejectReasonCol ? 8 : 7);
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" class="py-6 text-center text-slate-400 font-medium tracking-widest text-[10px] uppercase italic">
            No records found.
          </td>
        </tr>`;
      return;
    }

    const fmtTime = (t) => (t && String(t).length >= 5) ? String(t).slice(0, 5) : '—';
    const isRejected = (s) => (s || '').toString().trim().toLowerCase() === 'rejected';

    // Use your helper if present
    const getRej = (item) => {
      if (typeof getRejectedReason === "function") return getRejectedReason(item) || '';
      return item.rejection_reason || item.reject_reason || item.rejected_reason || item.rejectReason || item.rejectionReason || '';
    };

    // 6) RENDER ROWS
    tbody.innerHTML = result.data.map(item => {
      if (isUsers) {
        const displayID = item.id_number || item.username || 'N/A';

        if (item && item.id) {
          window.dashboardRecords[`user_${item.id}`] = item;
        }

        return `
          <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition group" data-record-key="user_${item.id}">
            <td class="clickable-td py-3 px-4 font-bold text-slate-700 text-[13px]"><div>${displayID}</div></td>
            <td class="clickable-td py-3 px-4 font-bold text-slate-700 text-[13px]"><div>${item.name || 'N/A'}</div></td>
            <td class="clickable-td py-3 px-4 text-slate-500 text-[13px]"><div>${item.department || 'N/A'}</div></td>
            <td class="clickable-td py-3 px-4 text-slate-500 text-[13px]"><div>${item.position || 'N/A'}</div></td>
            <td class="clickable-td py-3 px-4">
              <div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 tracking-wider">Active</span>
              </div>
            </td>
            <td class="py-3 px-4">
              <div class="flex items-center justify-center gap-1">
                <button onclick='handleEditUser(${JSON.stringify(item)})' class="p-1.5 text-slate-300 hover:text-[#c5a021] transition-colors">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2.25 2.25 0 113.182 3.182L12 10.364l-3 1 1-3 9.182-9.182z" />
                  </svg>
                </button>
                <button onclick="handleDeleteUser(${item.id}, '${item.name}')" class="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>`;
      }

      // ✅ normalize content per tab
      let typeVal = 'N/A';
      let periodVal = 'N/A';
      let reasonVal = '—';

      if (isLeaves) {
        typeVal = item.leave_type || 'N/A';
        periodVal = `${item.start_date || 'N/A'} - ${item.end_date || 'N/A'}`;
        reasonVal = item.reason || '—';
      } else if (isOT) {
        typeVal = item.ot_date || 'N/A';
        periodVal = `${item.hours ?? '0'} hrs`;
        reasonVal = item.reason || item.task_description || '—';
      } else if (isOB) {
        typeVal = item.purpose || 'N/A';
        periodVal = item.date || 'N/A';
        reasonVal = `${fmtTime(item.time_in)} - ${fmtTime(item.time_out)}`;
      }

      const payBadge = isLeaves ? `
        <div class="mt-1">
          <span class="text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase ${(item.pay_status || '').toLowerCase() === 'paid'
          ? 'bg-green-100 text-green-700 border border-green-200'
          : 'bg-orange-100 text-orange-700 border border-orange-200'
        }">
            ${(item.pay_status || 'UNPAID').toUpperCase()}
          </span>
        </div>
      ` : '';

      const statusLabel = isOB ? (item.status || 'Recorded') : (item.status || 'Pending');
      const rej = getRej(item);
      const rejCell = (hasRejectReasonCol && isRejected(statusLabel)) ? (rej || '—') : '—';

      const recordType = isLeaves ? 'leave' : (isOT ? 'ot' : 'ob');
      if (item && item.id) {
        window.dashboardRecords[`${recordType}_${item.id}`] = { ...item, _requestType: recordType };
      }

      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition" data-record-key="${recordType}_${item.id}">
          <td class="clickable-td py-3 px-4 font-bold text-slate-700 text-[13px]"><div>${item.employeeName || item.name || 'N/A'}</div></td>
          <td class="clickable-td py-3 px-4 text-slate-500 text-[13px]"><div>${item.department || 'N/A'}</div></td>
          <td class="clickable-td py-3 px-4 text-slate-500 text-[13px]"><div>${item.position || 'N/A'}</div></td>

          <td class="clickable-td py-3 px-4 text-slate-600 font-medium text-[13px]">
            <div>
              <div>${typeVal}</div>
              ${payBadge}
            </div>
          </td>

          <td class="clickable-td py-3 px-4 text-slate-400 text-[13px]"><div>${periodVal}</div></td>

          <td class="clickable-td py-3 px-4 text-slate-500 text-[13px] max-w-[220px] truncate" title="${reasonVal}">
            <div>${reasonVal}</div>
          </td>

          ${hasRejectReasonCol ? `
            <td class="clickable-td py-3 px-4 text-slate-500 text-[13px] max-w-[220px] truncate" title="${rejCell}">
              <div>${rejCell}</div>
            </td>
          ` : ``}

          <td class="clickable-td py-3 px-4 text-center">
            <div>
              <span class="${getStatusStyle(statusLabel)}">
                ${(statusLabel).toUpperCase()}
              </span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error("Refresh Error:", error);
    const colSpan = (currentType === 'manage-users') ? 6 : (hasRejectReasonCol ? 8 : 7);
    tbody.innerHTML = `
      <tr>
        <td colspan="${colSpan}" class="py-8 text-center text-red-500 font-bold">
          Failed to load data.
        </td>
      </tr>
    `;
  }
};

// Helper for status colors
function getStatusStyle(status) {
  const base =
    "inline-flex items-center justify-center " +
    "w-[110px] h-[28px] " +                 // fixed size (same width/height)
    "px-0 rounded-full " +                  // pill style
    "text-[10px] font-black uppercase tracking-wider " +
    "border";

  const s = (status || "Pending").toString().trim().toLowerCase();

  if (s === "approved") return `${base} bg-green-100 text-green-700 border-green-200`;
  if (s === "pending") return `${base} bg-yellow-100 text-yellow-700 border-yellow-200`;
  if (s === "rejected") return `${base} bg-red-100 text-red-700 border-red-200`;
  if (s === "recorded") return `${base} bg-purple-100 text-purple border-purple-200`;

  return `${base} bg-gray-100 text-gray-700 border-gray-200`;
}

// ==========================================
// 4. FORM & MODAL CONTROLS
// ==========================================
window.openForm = (type) => {
  const container = document.getElementById('form-container');
  const title = document.getElementById('form-title');
  const fields = document.getElementById('form-fields');

  if (!container || !fields) return;

  container.dataset.formType = type;
  container.classList.remove('hidden');
  container.querySelector('div').scrollTop = 0;

  const labelClass = "block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase";
  const inputClass = "w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all";

  // ================= LEAVE =================
  if (type === 'leave') {
    title.innerText = "Request Leave";
    fields.innerHTML = `
    <div class="space-y-2" id="leave-form-content">

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="${labelClass}">LEAVE TYPE</label>
          <select id="f_leave_type" class="${inputClass}">
            <option value="" disabled selected>Select type</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Vacation Leave">Vacation Leave</option>
            <option value="Wellness Leave">Wellness Leave</option>
            <option value="Undertime">Undertime</option>
            <option value="Halfday">Halfday</option>
          </select>
        </div>

        <div>
          <label class="${labelClass}">PAY STATUS</label>
          <div class="flex items-center h-[42px] gap-10 px-3">
            <label class="flex items-center cursor-pointer group">
              <input type="radio" name="f_pay_status" value="Paid" checked class="w-3.5 h-3.5 text-[#c5a021]">
              <span class="ml-1.5 text-xs font-semibold text-slate-600">Paid</span>
            </label>

            <label class="flex items-center cursor-pointer group">
              <input type="radio" name="f_pay_status" value="Unpaid" class="w-3.5 h-3.5 text-[#c5a021]">
              <span class="ml-1.5 text-xs font-semibold text-slate-600">Unpaid</span>
            </label>
          </div>
        </div>
      </div>

      <div id="dynamic-leave-section">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="${labelClass}">START DATE</label>
            <input type="date" id="f_start" class="${inputClass}">
          </div>
          <div>
            <label class="${labelClass}">END DATE</label>
            <input type="date" id="f_end" class="${inputClass}">
          </div>
        </div>
      </div>

      <div>
        <label class="${labelClass}">Reason</label>
        <textarea id="f_reason" class="${inputClass} h-24 resize-none "></textarea>
      </div>

    </div>

      <div id="sick-leave-upload-section" class="hidden">
  <div class="p-3 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 space-y-1">

    <div class="flex items-start gap-1 mt-0 mb-0">
      <div class="mt-0">
        <input type="checkbox" id="f_sick_upload_confirm"
          class="w-4 h-4 rounded border-slate-300 text-[#c5a021] focus:ring-[#c5a021]">
      </div>

      <div class="flex-1">
        <label for="f_sick_upload_confirm"
          class="text-[11px] font-bold text-slate-600 uppercase tracking-tight cursor-pointer">
          I have uploaded the Medical Certificate / Supporting Documents via the Google Form.
        </label>

        <p id="sick-leave-upload-note"
          class="text-[10px] text-slate-400 mt-1 italic">
          Required for Sick Leave of 3 days or more.
        </p>
      </div>
    </div>

    <!-- UPLOAD BUTTON -->
    <a href="https://docs.google.com/forms/d/e/1FAIpQLSfwnzivD5GKXctQWEo7dkpiEi3eC0O6AQiXi4xA9eMbmStfhA/viewform?usp=publish-editor"
       target="_blank"
       class="inline-flex items-center justify-center w-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-white bg-[#c5a021] rounded-lg hover:bg-[#a88419] transition">
      Upload Medical Certificate
    </a>

  </div>
</div>

    `;

    setTimeout(() => {
      const leaveTypeSelect = document.getElementById('f_leave_type');
      if (leaveTypeSelect) {
        leaveTypeSelect.onchange = function () {
          window.updateLeaveFields?.(this.value);
        };
      }
    }, 100);
  }

  // ================= OT =================
  else if (type === 'ot') {
    title.innerText = "File Overtime";
    fields.innerHTML = `
    <div class="space-y-4">

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="${labelClass}">DATE</label>
          <input type="date" id="f_date" class="${inputClass}">
        </div>

        <div>
          <label class="${labelClass}">TOTAL HOURS</label>
          <input type="number" id="f_hours" step="0.5" class="${inputClass}">
        </div>
      </div>

      <div>
        <label class="${labelClass}">Reason</label>
        <textarea id="f_reason" class="${inputClass} h-24 resize-none"></textarea>
      </div>

    </div>
    `;
  }

  // ================= OB =================
  else if (type === 'ob') {
    title.innerText = "Official Business / Field";

    fields.innerHTML = `
  <div class="space-y-4">

    <div>
      <label class="${labelClass}">PURPOSE</label>
      <input type="text" id="f_purpose" class="${inputClass}">
    </div>

    <div>
      <label class="${labelClass}">DATE</label>
      <input type="date" id="f_date" class="${inputClass}">
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="${labelClass}">TIME IN</label>
        <input type="time" id="f_time_in" class="${inputClass}">
      </div>

      <div>
        <label class="${labelClass}">TIME OUT</label>
        <input type="time" id="f_time_out" class="${inputClass}">
      </div>
    </div>

    <!-- UPLOAD SECTION -->
    <div id="ob-upload-section" class="p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 space-y-3">

      <div class="flex items-start gap-3">
        <div class="mt-1">
          <input type="checkbox" id="f_ob_photo_confirm"
            class="w-4 h-4 rounded border-slate-300 text-[#c5a021] focus:ring-[#c5a021]">
        </div>

        <div class="flex-1">
          <label for="f_ob_photo_confirm"
            class="text-[11px] font-bold text-slate-600 uppercase tracking-tight cursor-pointer">
            I have uploaded the OB / Field Photo via the Google Form.
          </label>

          <p class="text-[10px] text-slate-400 mt-1 italic">
            Required before submitting OB / Field request.
          </p>
        </div>
      </div>

      <!-- BUTTON -->
      <a href="https://docs.google.com/forms/d/e/1FAIpQLSdEKof3aNp0uVOLvbxYmLB2wOaeNLJIwwFvHcuumGsG_csr_g/viewform"
         target="_blank"
         class="inline-flex items-center justify-center w-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-white bg-[#c5a021] rounded-lg hover:bg-[#a88419] transition">
        Upload OB / Field Photo
      </a>

    </div>

  </div>
  `;
  }
};

function getLeaveDurationDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  return diffDays > 0 ? diffDays : 0;
}

window.updateLeaveFields = (value) => {
  const dynamicSection = document.getElementById('dynamic-leave-section');
  const uploadSection = document.getElementById('sick-leave-upload-section');
  const uploadNote = document.getElementById('sick-leave-upload-note');
  if (!dynamicSection) return;

  // ✅ PRESERVE CURRENT VALUES BEFORE CHANGING DOM
  const currentStart = document.getElementById('f_start')?.value || '';
  const currentEnd = document.getElementById('f_end')?.value || '';
  const currentUploadConfirmed = document.getElementById('f_sick_upload_confirm')?.checked === true;
  const leaveDays = getLeaveDurationDays(currentStart, currentEnd);
  const needsSickUpload = value === 'Sick Leave' && leaveDays >= 3;

  console.log('🔄 updateLeaveFields called:', { value, currentStart, currentEnd, leaveDays, needsSickUpload });

  if (value === 'Undertime' || value === 'Halfday') {
    dynamicSection.innerHTML = `
            <div class="grid grid-cols-1 gap-4">
                <div>
                    <label class="block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase">DATE</label>
                    <input type="date" id="f_start" value="${currentStart}" class="w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase">FROM TIME</label>
                        <input type="time" id="f_from_time" class="w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase">TO TIME</label>
                        <input type="time" id="f_to_time" class="w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all">
                    </div>
                </div>
            </div>
            <input type="hidden" id="f_end" value="${currentStart}">`;
    if (uploadSection) uploadSection.classList.add('hidden');
  } else {
    dynamicSection.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase">START DATE</label>
                    <input type="date" id="f_start" value="${currentStart}" class="w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all">
                </div>
                <div>
                    <label class="block text-[10px] font-bold mb-1 text-slate-500 tracking-widest uppercase">END DATE</label>
                    <input type="date" id="f_end" value="${currentEnd}" class="w-full border-2 border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#c5a021] outline-none bg-white transition-all">
                </div>
            </div>`;
    if (uploadSection) {
      uploadSection.classList.toggle('hidden', value !== 'Sick Leave');
      if (uploadNote) {
        uploadNote.innerText =
          needsSickUpload
            ? "(Optional) I uploaded supporting files for this Sick Leave request."
            : "(Optional) I uploaded supporting files for this Sick Leave request.";
      }
      const uploadConfirm = document.getElementById('f_sick_upload_confirm');
      if (uploadConfirm) uploadConfirm.checked = currentUploadConfirmed;
    }
  }

  console.log('✅ Dynamic fields updated');
};

window.closeForm = () => {
  const container = document.getElementById('form-container');

  if (container) {
    // 1. Hide the modal
    container.classList.add('hidden');

    // 2. Clear Edit/Request Metadata
    // This ensures the next form opened is "Fresh"
    delete container.dataset.editId;
    delete container.dataset.requestId;
    delete container.dataset.requestType;

    // 3. Clear the form fields (Optional but recommended)
    const fields = document.getElementById('form-fields');
    if (fields) fields.innerHTML = '';

    // 4. Reset the Title
    const title = document.getElementById('form-title');
    if (title) title.innerText = 'File Request';
  }
};

window.submitForm = async () => {
  const container = document.getElementById('form-container');
  if (!container) return;

  const type = container.dataset.formType;
  const editId = container.dataset.editId;

  console.log("SUBMIT FORM TYPE:", type, "EDIT ID:", editId);

  // Find the submit button inside the modal
  const submitBtn = container.querySelector('button[onclick*="submitForm"]');
  if (!submitBtn || submitBtn.disabled) return;

  // ✅ Get employee details
  const emp_id = localStorage.getItem("logged_user_id") || '';
  const emp_name = localStorage.getItem("logged_user_name") || 'Unknown Employee';
  const emp_dept = localStorage.getItem("logged_user_dept") || 'Unknown Department';

  let payload = {
    employeeId: emp_id,
    employeeName: emp_name,
    department: emp_dept
  };
  let endpoint = '';

  // --- ADMIN APPROVAL LOGIC ---
  if (type === 'update-status') {
    endpoint = 'update_status.php';
    payload = {
      id: container.dataset.requestId,
      status: document.getElementById('f_status')?.value,
      type: container.dataset.requestType
    };
    if (!payload.status) {
      return window.showPopup({ title: "Missing Info", message: "Please select a status.", type: 'danger' });
    }
  }

  // --- EMPLOYEE MANAGEMENT (ADMIN - ADD/EDIT USER) ---
  else if (type === 'add-member' || type === 'edit-member') {
    endpoint = 'save_employee.php';
    const empName = document.getElementById('emp_name')?.value?.trim();
    const empDept = document.getElementById('emp_dept')?.value?.trim();
    const empPos = document.getElementById('emp_pos')?.value?.trim();
    const empUser = document.getElementById('emp_username')?.value?.trim();
    const empPass = document.getElementById('emp_password')?.value; // don't trim passwords

    if (!empName || !empDept || !empUser || (type === 'add-member' && !empPass)) {
      const missing = [];
      if (!empName) missing.push("Full Name");
      if (!empDept) missing.push("Department");
      if (!empUser) missing.push("ID Number");
      if (type === 'add-member' && !empPass) missing.push("Password");

      return window.showPopup({
        title: "Missing Info",
        message: "Missing: " + missing.join(", "),
        type: "danger"
      });
    }

    const empRole = document.getElementById('emp_role')?.value || 'Employee';

    Object.assign(payload, {
      id: editId,
      name: empName,
      department: empDept,
      position: empPos,
      username: empUser,
      password: empPass,
      role: empRole
    });

    if (type === 'edit-member') payload.mode = 'edit';
  }

  // --- LEAVE REQUEST (New or Edit) ---
  else if (type === 'leave') {
    endpoint = editId ? 'update_leave.php' : 'save_leave.php';
    if (editId) payload.id = editId;

    const leaveTypeEl = document.getElementById('f_leave_type');
    const startDateEl = document.getElementById('f_start');
    const endDateEl = document.getElementById('f_end');
    const reasonEl = document.getElementById('f_reason');
    const payStatusInput = document.querySelector('input[name="f_pay_status"]:checked');

    Object.assign(payload, {
      leave_type: leaveTypeEl?.value || '',
      start_date: startDateEl?.value || '',
      end_date: endDateEl?.value || '',
      from_time: document.getElementById('f_from_time')?.value || "",
      to_time: document.getElementById('f_to_time')?.value || "",
      reason: reasonEl?.value || '',
      pay_status: payStatusInput ? payStatusInput.value : 'Paid'
    });

    if (!payload.leave_type) return window.showPopup({ title: "Required", message: "Please select Leave Type.", type: 'danger' });
    if (!payload.start_date) return window.showPopup({ title: "Required", message: "Please select Start Date.", type: 'danger' });
    if (!payload.reason || payload.reason.trim() === "") {
      return window.showPopup({ title: "Required", message: "Please provide Reason.", type: "danger" });
    }
    if (!payStatusInput) return window.showPopup({ title: "Required", message: "Please select Pay Status.", type: 'danger' });

    const leaveType = payload.leave_type;
    const leaveDays = getLeaveDurationDays(payload.start_date, payload.end_date);
    const sickUploadConfirmed = document.getElementById('f_sick_upload_confirm')?.checked === true;

    if (leaveType !== 'Undertime' && leaveType !== 'Halfday' && !payload.end_date) {
      return window.showPopup({ title: "Required", message: "Please select End Date.", type: 'danger' });
    }
  }

  // --- OVERTIME REQUEST (New or Edit) ---
  else if (type === 'ot') {
    endpoint = editId ? 'update_ot.php' : 'save_ot.php';
    if (editId) payload.id = editId;

    Object.assign(payload, {
      ot_date: document.getElementById('f_date')?.value || '',
      hours: document.getElementById('f_hours')?.value || '',
      reason: document.getElementById('f_reason')?.value || ''
    });

    if (!payload.ot_date || !payload.hours) {
      return window.showPopup({ title: "Missing Info", message: "Please provide both date and hours.", type: 'danger' });
    }
    if (!payload.reason || payload.reason.trim() === "") {
      return window.showPopup({ title: "Required", message: "Please provide Reason / Task Description.", type: 'danger' });
    }
  }

  // --- OFFICIAL BUSINESS (OB) ---
  else if (type === 'ob') {
    endpoint = editId ? 'update_ob.php' : 'save_ob.php';
    if (editId) payload.id = editId;

    const obPhotoConfirmed = document.getElementById('f_ob_photo_confirm')?.checked === true;

    Object.assign(payload, {
      purpose: document.getElementById('f_purpose')?.value || '',
      date: document.getElementById('f_date')?.value || '',
      time_in: document.getElementById('f_time_in')?.value || '',
      time_out: document.getElementById('f_time_out')?.value || ''
    });

    if (!payload.purpose || payload.purpose.trim() === "" || !payload.date || !payload.time_in || !payload.time_out) {
      return window.showPopup({ title: "Missing Info", message: "Please provide complete OB details.", type: 'danger' });
    }

    if (!obPhotoConfirmed) {
      return window.showPopup({ title: "Required", message: "Please upload the OB photo in Google Form before submitting.", type: 'danger' });
    }
  } else {
    return window.showPopup({ title: "Error", message: "Unknown form type.", type: 'danger' });
  }

  // --- SUBMISSION ---
  try {
    console.log('🚀 SENDING TO:', endpoint, payload);

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> PROCESSING...`;

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const rawResponse = await response.text();
    console.log('📡 RAW RESPONSE:', rawResponse);

    let result;
    try {
      result = JSON.parse(rawResponse);
    } catch {
      throw new Error('Invalid server response: ' + rawResponse.substring(0, 200));
    }

    if (result.success) {
      window.showPopup({ title: "Success!", message: result.message || "Saved successfully!" });
      window.closeForm();

      if (type === 'update-status') window.switchApproverTab?.('pending-leave');
      else if (type === 'add-member' || type === 'edit-member') window.refreshEmployeeData?.();
      else if (type === 'leave') fetchMyLeaves();
      else if (type === 'ot') fetchMyOvertime();
      else if (type === 'ob') window.fetchMyOB?.();
    } else {
      throw new Error(result.message || result.error || "Unable to save.");
    }
  } catch (e) {
    console.error('❌ SUBMIT ERROR:', e);
    window.showPopup({ title: "Error", message: e.message, type: 'danger' });
  } finally {
    // ✅ always re-enable button
    submitBtn.disabled = false;
    submitBtn.innerText = "SUBMIT";
  }
};



window.openEmployeeForm = (mode, employeeData = null) => {
  const container = document.getElementById('form-container');
  const title = document.getElementById('form-title');
  const fields = document.getElementById('form-fields');
  if (!container || !fields) return;

  container.dataset.formType = (mode === 'edit') ? 'edit-member' : 'add-member';

  // ✅ important: clear editId when adding
  if (mode === 'edit' && employeeData) container.dataset.editId = employeeData.id;
  else delete container.dataset.editId;

  title.innerText = (mode === 'edit') ? "Edit Member" : "Add New Member";

  const depts = [
    "CCT",
    "KCS",
    "DCP",
    "IT Department",
    "Human Resources Department",
    "Accounting Department",
    "Marketing Department",
    "Operation Department",
    "Administrative Department",
    "Litigation Department",
    "Corporate Department"
  ];

  const currentID = employeeData?.id_number || employeeData?.username || '';

  fields.innerHTML = `
    <div class="space-y-2">
      <div>
        <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">Full Name</label>
        <input type="text" id="emp_name"
          value="${employeeData?.name || ''}"
          class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-sm"
          placeholder=" ">
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">Department</label>
          <select id="emp_dept"
            class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-slate-600 text-sm">
            <option value=" " disabled selected>Select Department</option>
            ${depts.map(d => `<option value="${d}" ${employeeData?.department === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">Role</label>
          <select id="emp_role"
            class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-slate-600 text-sm">
            <option value="Employee" ${(employeeData?.role || '').toLowerCase() !== 'approver' ? 'selected' : ''}>Employee</option>
            <option value="Approver" ${(employeeData?.role || '').toLowerCase() === 'approver' ? 'selected' : ''}>Approver</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">Position</label>
        <input type="text" id="emp_pos"
          value="${employeeData?.position || ''}"
          class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-sm"
          placeholder=" ">
      </div>

      <div>
        <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">ID Number</label>
        <input type="text"
          id="emp_username"
          value="${currentID}"
          placeholder=" "
          class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-sm">
        <p class="text-[10px] text-slate-400 mt-1 italic">
          * Accepts numeric (00-00000) or alphanumeric (APP/ADMIN) formats.
        </p>
      </div>

      <div>
        <label class="block text-[10px] font-bold mb-1 uppercase tracking-wider text-black">
          ${mode === 'edit' ? 'New Password (Leave blank to keep current)' : 'Password'}
        </label>
        <div class="relative">
          <input type="password" id="emp_password"
            ${mode !== 'edit' ? 'required' : ''}
            class="w-full border p-2 rounded focus:ring-2 focus:ring-[#c5a021] outline-none text-sm">
          <button type="button" onclick="window.togglePassword('emp_password')" class="absolute right-2 top-2 text-slate-400 hover:text-[#c5a021]">
            <svg id="eye-icon-emp_password" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // ✅ default Department only on ADD (prevents Missing Info)
  setTimeout(() => {
    if (mode !== 'edit') {
      const deptSel = document.getElementById("emp_dept");
      if (deptSel && !deptSel.value) {
        deptSel.value = depts[0]; // default = first item ("IT Department")
      }
    }
  }, 0);

  container.classList.remove('hidden');
};

window.removeUser = async (userId) => {
  window.showPopup({
    title: "Confirm Removal",
    message: "Are you sure you want to remove this employee?",
    type: 'danger',
    onConfirm: async () => {
      try {
        // Fetch logic for delete...
        if (result.success) {
          window.showPopup({
            title: "Success",
            message: "Employee record removed.",
            type: 'info'
          });
          if (window.refreshEmployeeData) window.refreshEmployeeData();
        } else {
          window.showPopup({
            title: "Failed",
            message: result.error || "Could not delete.",
            type: 'danger'
          });
        }
      } catch (e) {
        console.error("Delete Error:", e);
        window.showPopup({ title: "Error", message: "Connection problem.", type: 'danger' });
      }
    }
  });
};


// ==========================================
// 5. APPROVER PORTAL LOGIC
// ==========================================

window.switchApproverTab = async (tabType) => {
  // 1) UI UPDATES (Tabs styling)
  const tabIds = ['tab-pending-leave', 'tab-pending-ot', 'tab-all-leave', 'tab-all-ot'];
  tabIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.remove('text-[#c5a021]', 'border-[#c5a021]');
      btn.classList.add('text-slate-400', 'border-transparent');
    }
  });

  const activeBtn = document.getElementById(`tab-${tabType}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
    activeBtn.classList.add('text-[#c5a021]', 'border-[#c5a021]');
  }

  // 2) TABLE HEADER UPDATES
  const thead = document.querySelector('#approver-layout thead tr');

  const isLeaveTab = tabType.includes('leave');
  const isOTTab = tabType.includes('ot');
  const isHistory = (tabType === 'all-leave' || tabType === 'all-ot');

  const typeLabel = isLeaveTab ? 'Leave Type' : 'Type';
  const hoursCol = isLeaveTab ? '' : '<th class="py-4 px-4 bg-white text-left font-bold text-slate-600">Hours</th>';

  // last column label (your current behavior)
  const actionLabel = tabType.includes('all') ? 'Status' : 'Action';

  // ✅ Reject Reason column ONLY for history tabs
  const rejectReasonCol = isHistory
    ? '<th class="py-4 px-4 bg-white text-left font-bold text-slate-600">Reject Reason</th>'
    : '';

  if (thead) {
    thead.innerHTML = `
      <th class="py-4 px-4 bg-white text-left font-bold text-slate-600">Employee</th>
      <th class="py-4 px-4 bg-white text-left font-bold text-slate-600">${typeLabel}</th>
      <th class="py-4 px-4 bg-white text-left font-bold text-slate-600">Date</th>
      ${hoursCol}
      <th class="py-4 px-4 bg-white text-left font-bold text-slate-600">Reason</th>
      ${rejectReasonCol}
      <th class="py-4 px-4 bg-white text-left font-bold text-slate-600">${actionLabel}</th>
    `;
  }

  const tbody = document.getElementById('approver-table-body');

  // ✅ colSpan matches headers:
  // pending-leave: 5, pending-ot: 6
  // all-leave: 6, all-ot: 7  (extra Reject Reason column)
  const colSpan = isHistory ? (isOTTab ? 7 : 6) : (isOTTab ? 6 : 5);

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="py-12 text-center text-slate-400">Fetching records...</td></tr>`;
  }

  // 3) GET DATA FROM LOCALSTORAGE
  const approverId = localStorage.getItem("logged_user_id");
  const approverDept = localStorage.getItem("logged_user_dept");
  const approverRole = localStorage.getItem("logged_user_role");

  const selectedYear = document.getElementById('year-filter')?.value || new Date().getFullYear().toString();

  try {
    if (typeof updateGlobalStats === 'function') {
      await updateGlobalStats(approverId, approverRole, approverDept, selectedYear);
    }

    // 4) FETCH TABLE DATA
    const tableUrl =
      `${API_BASE_URL}/get_approvals.php`
      + `?type=${encodeURIComponent(tabType)}`
      + `&department=${encodeURIComponent(approverDept)}`
      + `&role=${encodeURIComponent(approverRole)}`
      + `&year=${encodeURIComponent(selectedYear)}`;

    const response = await fetch(tableUrl);
    const data = await response.json();

    let records = [];
    if (tabType === 'pending-leave') {
      records = data.pending_leaves || (Array.isArray(data) ? data : []);
    } else if (tabType === 'pending-ot') {
      records = data.pending_overtimes || (Array.isArray(data) ? data : []);
    } else {
      records = Array.isArray(data) ? data : (data.history || []);
    }

    if (typeof window.renderApproverTable === 'function') {
      window.renderApproverTable(records, tabType);
    }
  } catch (error) {
    console.error("Error in switchApproverTab:", error);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="py-12 text-center text-red-400">Error: Could not load data.</td></tr>`;
    }
  }
};

window.renderApproverTable = (data, type) => {
  const tbody = document.getElementById('approver-table-body');

  const isHistory = type === 'all-leave' || type === 'all-ot';
  const isOT = type.includes('ot');

  // ✅ Colspan depends if history (has extra column)
  const colSpan = isHistory ? (isOT ? 7 : 6) : (isOT ? 6 : 5);

  if (!tbody || !Array.isArray(data) || data.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="py-12 text-center text-slate-400">No records found.</td></tr>`;
    }
    return;
  }

  const isRejected = (status) =>
    (status || "").toString().trim().toLowerCase() === "rejected";

  const safeText = (v) => (v === null || v === undefined ? "" : String(v));

  const getRej = (item) => {
    if (typeof getRejectedReason === "function") return getRejectedReason(item) || "";
    return safeText(
      item.rejection_reason ||
      item.reject_reason ||
      item.rejected_reason ||
      item.rejectReason ||
      item.rejectionReason ||
      ""
    );
  };

  tbody.innerHTML = data.map(item => {
    const name = item.employee_name || item.employeeName || "Unknown";
    const category = item.category || (isOT ? "Overtime" : "Leave");
    const reason = item.reason || item.task_description || "No reason";
    const statusVal = item.status || "Pending";

    // ✅ Only computed/used in history
    const rejCell = (isHistory && isRejected(statusVal)) ? (getRej(item) || "—") : "—";

    const recordType = type.toLowerCase().includes('ot') ? 'ot' : 'leave';
    if (item && item.id) {
      window.dashboardRecords[`${recordType}_${item.id}`] = { ...item, _requestType: recordType };
    }

    if (isOT) {
      const date = item.ot_date || "N/A";
      const hrs = item.hours || "0";

      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition text-sm" data-record-key="${recordType}_${item.id}">
          <td class="clickable-td py-4 px-4 font-bold text-slate-700"><div>${safeText(name)}</div></td>
          <td class="clickable-td py-4 px-4"><div>${safeText(category)}</div></td>
          <td class="clickable-td py-4 px-4 text-xs"><div>${safeText(date)}</div></td>
          <td class="clickable-td py-4 px-4 text-xs font-bold text-amber-600"><div>${safeText(hrs)} hrs</div></td>
          <td class="clickable-td py-4 px-4 text-slate-500 max-w-[220px] truncate" title="${safeText(reason)}"><div>"${safeText(reason)}"</div></td>

          ${isHistory ? `
            <td class="clickable-td py-4 px-4 text-slate-500 max-w-[220px] truncate" title="${safeText(rejCell)}">
              <div>${safeText(rejCell)}</div>
            </td>
          ` : ``}

          <td class="py-4 px-4">${window.renderActions(item, type)}</td>
        </tr>
      `;
    }

    const dateRange = (item.start_date && item.end_date)
      ? `${item.start_date} to ${item.end_date}`
      : (item.start_date || "N/A");

    const payStatus = (item.pay_status || "UNPAID").toString();
    const payStatusBadge = `
      <div class="mt-1">
        <span class="text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase ${payStatus === 'Paid'
        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        : 'bg-orange-100 text-orange-700 border border-orange-200'
      }">
          ${safeText(payStatus)}
        </span>
      </div>
    `;

    return `
      <tr class="border-b border-slate-50 hover:bg-slate-50 transition text-sm" data-record-key="${recordType}_${item.id}">
        <td class="clickable-td py-4 px-4 font-bold text-slate-700"><div>${safeText(name)}</div></td>
        <td class="clickable-td py-4 px-4">
          <div>
            <div class="font-medium">${safeText(category)}</div>
            ${payStatusBadge}
          </div>
        </td>
        <td class="clickable-td py-4 px-4 text-xs"><div>${safeText(dateRange)}</div></td>
        <td class="clickable-td py-4 px-4 text-slate-500 max-w-[220px] truncate" title="${safeText(reason)}"><div>"${safeText(reason)}"</div></td>

        ${isHistory ? `
          <td class="clickable-td py-4 px-4 text-slate-500 max-w-[220px] truncate" title="${safeText(rejCell)}">
            <div>${safeText(rejCell)}</div>
          </td>
        ` : ``}

        <td class="py-4 px-4 text-right">${window.renderActions(item, type)}</td>
      </tr>
    `;
  }).join('');
};

window.renderActions = (item, type) => {
  // 1. Check if we are in an "All" or History tab (Read-only)
  if (type.includes('all')) {
    const status = item.status || 'Pending';
    return `
  <div class="flex justify-start">
    <span class="${getStatusStyle(status || 'Pending')}">
      ${(status || 'Pending').toUpperCase()}
    </span>
  </div>
`;
  }

  // 2. Identify if this is for Overtime or Leave to ensure correct backend routing
  // This ensures that 'pending-ot' or 'ot-history' results in 'overtime'
  const categoryType = type.toLowerCase().includes('ot') ? 'overtime' : 'leave';

  // 3. Return the Action Buttons
  return `
        <div class="flex justify-start gap-2"> 
            <button 
                onclick="window.updateStatus('${item.id}', 'Approved', '${type}')" 
                class="px-3 py-1.5 rounded-[8px] font-bold text-[12px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-sm hover:shadow-md active:scale-95 transition-all border border-emerald-200">
                Approve
            </button>
            <button 
                onclick="window.updateStatus('${item.id}', 'Rejected', '${type}')" 
                class="px-3 py-1.5 rounded-[8px] font-bold text-[12px] bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-sm hover:shadow-md active:scale-95 transition-all border border-rose-200">
                Reject
            </button>   
        </div>`;
};

window.showRejectPopup = ({ title, message, onSubmit }) => {
  const popup = document.getElementById('custom-popup');
  if (!popup) return;

  const popupContent = popup.querySelector('.bg-white');
  const titleEl = document.getElementById('popup-title');
  const msgEl = document.getElementById('popup-message');
  const btnContainer = document.getElementById('popup-buttons');

  if (!popupContent || !titleEl || !msgEl || !btnContainer) return;

  popupContent.classList.remove('border-[#c5a021]');
  popupContent.classList.add('border-t-8', 'border-red-600');

  titleEl.innerText = title;
  msgEl.innerHTML = `
        <div class="space-y-4 text-left">
            <p class="text-sm leading-relaxed text-slate-500">${message}</p>
            <textarea
                id="reject-reason-input"
                rows="5"
                class="w-full resize-none rounded-xl border-2 border-red-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#c5a021] focus:ring-2 focus:ring-[#c5a021]/20"
                placeholder="Enter rejection reason..."
            ></textarea>
            <p id="reject-reason-error" class="hidden text-xs font-semibold text-red-500">Reason is required.</p>
        </div>
    `;

  btnContainer.innerHTML = `
        <button id="reject-cancel" class="flex-1 py-3 border border-slate-200 rounded-lg font-bold text-slate-400 hover:bg-slate-50 transition uppercase text-xs">Cancel</button>
       <button id="reject-submit"
    class="flex-1 py-3 text-white rounded-lg font-bold uppercase text-xs tracking-[0.2em]
    bg-gradient-to-r from-[#c5a021] to-[#d9b84b]
    hover:opacity-90 transition shadow-md">
    Submit Reason
</button
    `;

  popup.classList.remove('hidden');

  const textarea = document.getElementById('reject-reason-input');
  const error = document.getElementById('reject-reason-error');
  const cancelBtn = document.getElementById('reject-cancel');
  const submitBtn = document.getElementById('reject-submit');

  const closeRejectPopup = () => popup.classList.add('hidden');

  const submitReason = () => {
    const reason = textarea?.value?.trim() || '';

    if (!reason) {
      error?.classList.remove('hidden');
      textarea?.focus();
      return;
    }

    error?.classList.add('hidden');
    closeRejectPopup();

    if (typeof onSubmit === 'function') {
      onSubmit(reason);
    }
  };

  cancelBtn?.addEventListener('click', closeRejectPopup);
  submitBtn?.addEventListener('click', submitReason);
  textarea?.addEventListener('input', () => error?.classList.add('hidden'));
  textarea?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitReason();
    }

    if (event.key === 'Escape') {
      closeRejectPopup();
    }
  });

  textarea?.focus();
};

window.updateStatus = async (id, status, tabType) => {
  const category = tabType.toLowerCase().includes('ot') ? 'overtime' : 'leave';
  const isReject = status === 'Rejected';

  const submitStatusUpdate = async (rejectionReason = '') => {
    try {
      const response = await fetch(`${API_BASE_URL}/update_status.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          status: status,
          type: category,
          rejection_reason: rejectionReason,
          reject_reason: rejectionReason,
          rejectionReason: rejectionReason,
          rejected_reason: rejectionReason,
          rejectReason: rejectionReason
        })
      });

      const data = await response.json();

      if (data.success) {
        window.showPopup({
          title: 'Success!',
          message: `${category.charAt(0).toUpperCase() + category.slice(1)} request has been ${status.toLowerCase()} successfully.`,
          type: 'info'
        });

        if (typeof window.switchApproverTab === 'function') {
          const nextTab = status === 'Rejected'
            ? (category === 'overtime' ? 'all-ot' : 'all-leave')
            : tabType;

          window.switchApproverTab(nextTab);
        }
      } else {
        window.showPopup({
          title: 'Error',
          message: data.message || "Failed to update status.",
          type: 'danger'
        });
      }
    } catch (e) {
      console.error("Update Error:", e);
      window.showPopup({
        title: 'System Error',
        message: "Could not connect to the server.",
        type: 'danger'
      });
    }
  };

  if (isReject) {
    window.showRejectPopup({
      title: 'REJECT REQUEST',
      message: `Please provide a rejection reason before rejecting this ${category} request.`,
      onSubmit: (rejectionReason) => {
        submitStatusUpdate(rejectionReason);
      }
    });
    return;
  }

  window.showPopup({
    title: 'Confirm Action',
    message: `Are you sure you want to ${status.toLowerCase()} this ${category} request?`,
    type: 'info',
    onConfirm: () => submitStatusUpdate()
  });
};

// ==========================================
// 6. ADMIN PORTAL LOGIC
// ==========================================

window.switchAdminTab = (tabType) => {
  // ✅ set active tab
  ADMIN_ACTIVE_TAB = tabType;

  const tabIds = {
    'all-leaves': 'tab-admin-leaves',
    'all-overtime': 'tab-admin-ot',
    'all-ob': 'tab-admin-ob',
    'manage-users': 'tab-admin-users'
  };

  // reset all tabs style
  Object.values(tabIds).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('border-[#c5a021]', 'text-[#1a2634]');
    el.classList.add('border-transparent', 'text-slate-400');
  });

  // active tab style
  const activeTab = document.getElementById(tabIds[tabType]);
  if (activeTab) {
    activeTab.classList.remove('border-transparent', 'text-slate-400');
    activeTab.classList.add('border-[#c5a021]', 'text-[#1a2634]');
  }

  // Show/hide export buttons based on active tab
  const exportRequestsBtn = document.getElementById('btn-export-requests');
  const exportMembersBtn = document.getElementById('btn-export-members');
  if (exportRequestsBtn) exportRequestsBtn.classList.toggle('hidden', tabType === 'manage-users');
  if (exportMembersBtn) exportMembersBtn.classList.toggle('hidden', tabType !== 'manage-users');

  // refresh correct data
  window.refreshEmployeeData?.();
};

// ==========================================
// CSV EXPORT HELPERS
// ==========================================

/**
 * Export last 3 months of leave / OT / OB requests as Excel table.
 */
window.exportRequests = async () => {
  const btn = document.getElementById('btn-export-requests');
  const originalHTML = btn?.innerHTML || '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></span> Exporting...`;
  }

  try {
    const currentYear = new Date().getFullYear();
    const urls = [
      `${API_BASE_URL}/get_admin_data.php?type=all-leaves&year=${currentYear}&month=all`,
      `${API_BASE_URL}/get_admin_data.php?type=all-overtime&year=${currentYear}&month=all`,
      `${API_BASE_URL}/get_admin_data.php?type=all-ob&year=${currentYear}&month=all`
    ];

    const currentMonth = new Date().getMonth();
    if (currentMonth < 3) {
      const prevYear = currentYear - 1;
      urls.push(`${API_BASE_URL}/get_admin_data.php?type=all-leaves&year=${prevYear}&month=all`);
      urls.push(`${API_BASE_URL}/get_admin_data.php?type=all-overtime&year=${prevYear}&month=all`);
      urls.push(`${API_BASE_URL}/get_admin_data.php?type=all-ob&year=${prevYear}&month=all`);
    }

    const responses = await Promise.all(urls.map(url => fetch(url)));
    const results = await Promise.all(responses.map(res => res.ok ? res.json() : { data: [] }));

    let allRequests = [];
    results.forEach((res, index) => {
      const isLeave = urls[index].includes('all-leaves');
      const isOT = urls[index].includes('all-overtime');
      const data = res.data || [];

      data.forEach(item => {
        item._exportType = isLeave ? 'Leave' : (isOT ? 'Overtime' : 'Official Business');
        allRequests.push(item);
      });
    });

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const parseDate = (d) => d ? new Date(d) : new Date(0);

    allRequests = allRequests.filter(item => {
      const itemDate = parseDate(item.created_at || item.date_filed || item.start_date || item.ot_date || item.date);
      return itemDate >= threeMonthsAgo;
    });

    allRequests.sort((a, b) => {
      const d1 = parseDate(b.created_at || b.date_filed || b.start_date || b.ot_date || b.date);
      const d2 = parseDate(a.created_at || a.date_filed || a.start_date || a.ot_date || a.date);
      return d1 - d2;
    });

    const headers = [
      'Request ID', 'Employee Name', 'Department', 'Request Type',
      'Sub-Type / Leave Type', 'Date Filed / Start Date',
      'Inclusive Dates / Period', 'Reason', 'Status', 'Pay Status', 'Approver Name'
    ];

    const rows = allRequests.map(item => {
      let subType = '—', inclusive = '—';
      if (item._exportType === 'Leave') {
        subType = item.leave_type || '—';
        inclusive = (item.start_date && item.end_date) ? `${item.start_date} - ${item.end_date}` : (item.start_date || '—');
      } else if (item._exportType === 'Overtime') {
        inclusive = item.ot_date ? `${item.ot_date} (${item.hours || 0} hrs)` : '—';
      } else if (item._exportType === 'Official Business') {
        subType = item.purpose || '—';
        inclusive = item.date ? `${item.date} ${item.time_in || ''} - ${item.time_out || ''}` : '—';
      }

      let statusStr = item.status || 'Pending';
      if (statusStr.toLowerCase() === 'rejected') {
        const rej = item.rejection_reason || item.reject_reason || item.rejected_reason || item.rejectReason || item.rejectionReason || '';
        if (rej) statusStr += ` (${rej})`;
      }

      return [
        item.id || item.request_id || '—',
        item.employeeName || item.name || '—',
        item.department || '—',
        item._exportType,
        subType,
        item.created_at || item.date_filed || item.start_date || item.ot_date || item.date || '—',
        inclusive,
        item.reason || item.task_description || item.purpose || '—',
        statusStr,
        item.pay_status || '—',
        item.approver_name || '—'
      ];
    });

    const escapeHTML = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const headersHTML = headers.map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const rowsHTML = rows.map(r => `<tr>${r.map(cell => `<td>${escapeHTML(cell)}</td>`).join('')}</tr>`).join('');

    const htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8" />
    <style>
        table { border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; }
        th { background-color: #1a2634; color: #ffffff; font-weight: bold; border: 1px solid #dddddd; padding: 10px; text-align: left; }
        td { border: 1px solid #dddddd; padding: 8px; vertical-align: top; }
        tr:nth-child(even) td { background-color: #f9f9f9; }
    </style>
</head>
<body>
    <table>
        <thead><tr>${headersHTML}</tr></thead>
        <tbody>${rowsHTML}</tbody>
    </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const now = new Date();
    const filename = `requests_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xls`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    window.showPopup({ title: 'Export Complete', message: 'Last 3 months of requests downloaded successfully.', type: 'info' });
  } catch (e) {
    console.error('Export error:', e);
    window.showPopup({ title: 'Export Failed', message: e.message, type: 'danger' });
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
  }
};

/**
 * Export full member roster as Excel table (no passwords).
 */
window.exportMembers = async () => {
  const btn = document.getElementById('btn-export-members');
  const originalHTML = btn?.innerHTML || '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></span> Exporting...`;
  }

  try {
    const url = `${API_BASE_URL}/get_admin_data.php?type=manage-users`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const result = await response.json();
    if (result.error) throw new Error(result.error);
    const users = result.data || [];

    const headers = ['ID Number / Username', 'Full Name', 'Department', 'Position', 'Role', 'Account Status'];
    const rows = users.map(u => [
      u.id_number || u.username || 'N/A',
      u.name || 'N/A',
      u.department || 'N/A',
      u.position || 'N/A',
      u.role || 'N/A',
      'Active'
    ]);

    const escapeHTML = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const headersHTML = headers.map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const rowsHTML = rows.map(r => `<tr>${r.map(cell => `<td>${escapeHTML(cell)}</td>`).join('')}</tr>`).join('');

    const htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8" />
    <style>
        table { border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; }
        th { background-color: #1a2634; color: #ffffff; font-weight: bold; border: 1px solid #dddddd; padding: 10px; text-align: left; }
        td { border: 1px solid #dddddd; padding: 8px; vertical-align: top; }
        tr:nth-child(even) td { background-color: #f9f9f9; }
    </style>
</head>
<body>
    <table>
        <thead><tr>${headersHTML}</tr></thead>
        <tbody>${rowsHTML}</tbody>
    </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const now = new Date();
    const filename = `members_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xls`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    window.showPopup({ title: 'Export Complete', message: 'Member roster downloaded successfully.', type: 'info' });
  } catch (e) {
    console.error('Export error:', e);
    window.showPopup({ title: 'Export Failed', message: e.message, type: 'danger' });
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
  }
};


// ==========================================
// 7. LOGIN & AUTHENTICATION
// ==========================================
window.updateLoginFields = function () {
  const roleSelect = document.getElementById("role-select");
  const container = document.getElementById("login-form-fields");

  if (!roleSelect || !container) return;

  const role = roleSelect.value;
  container.innerHTML = "";

  let fieldsHTML = "";

  if (role === "Employee") {
    fieldsHTML = `
      <label class="block text-xs font-bold text-black mb-2 uppercase mt-3">ID Number</label>
      <input
        type="text"
        id="employee_id"
        class="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#c5a021] outline-none transition"
        placeholder="e.g. 00-00000"
      />
    `;
  } else if (role === "Approver") {
    fieldsHTML = `
      <label class="block text-xs font-bold mb-1 mt-3 text-black uppercase tracking-wider">Select Department</label>
      <select
        id="employee_id"
        class="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-[#c5a021]"
      >
        <option value="" >Select Department</option>
        <option value="CCT">CCT</option>
        <option value="KCS">KCS</option>
        <option value="DCP">DCP</option>
        <option value="IT Department">IT Department</option>
        <option value="Human Resources Department">Human Resources Department</option>
        <option value="Accounting Department">Accounting Department</option>
        <option value="Marketing Department">Marketing Department</option>
        <option value="Operation Department">Operation Department</option>
        <option value="Administrative Department">Administrative Department</option>
        <option value="Litigation Department">Litigation Department</option>
        <option value="Corporate Department">Corporate Department</option>
      </select>
    `;
  } else if (role === "superadmin") {
    fieldsHTML = `
      <label class="block text-xs font-bold mb-1 mt-3">Username</label>
      <input
        type="text"
        id="employee_id"
        class="w-full border p-2 mb-3 rounded focus:outline-none focus:ring-2 focus:ring-[#c5a021]"
        placeholder="Enter username"
      />
    `;
  }

  const passwordField = `
    <label class="block text-xs font-bold mb-1 mt-3">Password</label>
    <div class="relative">
      <input
        type="password"
        id="password"
        class="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-[#c5a021]"
        placeholder="Enter password"
      />
      <button
        type="button"
        onclick="window.togglePassword('password')"
        class="absolute right-3 top-2 text-slate-400 hover:text-[#c5a021]"
      >
        <svg
          id="eye-icon-password"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="#f1c42e"
          class="w-5 h-5"
        >
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  `;

  container.innerHTML = fieldsHTML + passwordField;
};

window.handleLogin = async function (event) {
  // Prevent form reload
  event?.preventDefault?.();

  console.log("handleLogin triggered");

  // ===== 2. GET FORM DATA =====
  const roleEl = document.getElementById("role-select");
  const role = roleEl?.value?.trim() || "";

  const usernameEl = document.getElementById("employee_id");
  const username = usernameEl?.value?.trim() || "";

  const passwordEl = document.getElementById("password");
  const password = passwordEl?.value || "";

  const loginBtn = document.getElementById("login-btn");
  const oldText = loginBtn?.innerHTML;

  // ===== 3. VALIDATION =====
  if (!role) {
    showPopup({ title: "Warning", message: "Please select a role.", type: "danger" });
    roleEl?.focus();
    return;
  }

  if (!username) {
    let fieldName = role === "Employee" ? "ID Number" : (role === "Approver" ? "Department" : "Username");
    showPopup({ title: "Warning", message: `Please enter/select your ${fieldName}.`, type: "danger" });
    usernameEl?.focus();
    return;
  }

  if (!password) {
    showPopup({ title: "Warning", message: "Please enter your password.", type: "danger" });
    passwordEl?.focus();
    return;
  }

  try {
    // ===== 4. START LOADING STATE =====
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = `
        <span class="inline-flex items-center justify-center gap-2">
          <span class="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
          LOGGING IN...
        </span>
      `;
    }

    // ===== 5. SEND REQUEST TO RENDER =====
    const response = await fetch(`${API_BASE_URL}/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        password: password,
        role: role,
      }),
    });

    // Get the raw text first (to catch PHP errors that aren't JSON)
    const rawText = await response.text();
    console.log("RAW RESPONSE FROM SERVER:", rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      throw new Error("Server sent an invalid response. Check Render logs.");
    }

    // ===== 6. HANDLE RESPONSE =====
    if (result.success) {
      // Login Successful
      const user = result.user || {};

      // Save to LocalStorage
      localStorage.setItem("logged_user_id", user.id_number || "");
      localStorage.setItem("logged_user_name", user.name || "");
      localStorage.setItem("logged_user_role", user.role || role);
      localStorage.setItem("logged_user_dept", user.department || "");
      localStorage.setItem("logged_user_position", user.position || "");

      showPopup({
        title: "Success",
        message: `Welcome, ${user.name || "User"}!`,
        type: "success",
      });

      // Redirect or Reload after a short delay
      setTimeout(() => {
        location.reload();
      }, 1000);
    }

    // ===== FAILED =====
    showPopup({
      title: "Login Failed",
      message: result.message || "Invalid login.",
      type: "danger",
    });

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = oldText || "LOG IN";
    }
  } catch (err) {
    // ===== 7. HANDLE NETWORK/SERVER ERRORS =====
    console.error("handleLogin error:", err);

    showPopup({
      title: "Connection Error",
      message: "Could not connect to the server. Please try again later.",
      type: "danger",
    });

    // Reset Button
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = oldText || "LOG IN";
    }
  };
};


// ==========================================
// VERIFY FUNCTIONS LOADED
// ==========================================
console.log("✅ updateLoginFields:", typeof window.updateLoginFields);
console.log("✅ handleLogin:", typeof window.handleLogin);
console.log("✅ togglePassword:", typeof window.togglePassword);


window.logout = () => { localStorage.clear(); location.reload(); };

window.togglePassword = function (inputId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(`eye-icon-${inputId}`);

  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";

  if (icon) {
    if (isHidden) {
      icon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      `;
    } else {
      icon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      `;
    }
  }
};

// ==========================================
// 8. INITIALIZATION & UI CONTROL
// ==========================================
function displayLayoutForRole(role) {
  const roleLower = role ? role.toLowerCase() : "";
  const layouts = { employee: "employee-layout", approver: "approver-layout", superadmin: "admin-layout", admin: "admin-layout" };

  Object.values(layouts).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  if (roleLower === "superadmin" || roleLower === "admin") {
    document.getElementById("admin-layout")?.classList.remove("hidden");
    if (typeof window.switchAdminTab === "function") window.switchAdminTab('all-leaves');
  } else if (roleLower === "employee") {
    document.getElementById("employee-layout")?.classList.remove("hidden");
    if (typeof fetchMyLeaves === "function") fetchMyLeaves();
    if (typeof fetchMyOvertime === "function") fetchMyOvertime();
  } else if (roleLower === "approver") {
    document.getElementById("approver-layout")?.classList.remove("hidden");
    if (typeof window.switchApproverTab === "function") window.switchApproverTab('pending-leave');
  }
}

function populateEmployeeFutureYears(yearsAhead = 5, startYear = 2026) {
  const sel = document.getElementById("employee-year-filter");
  if (!sel) return;

  const now = new Date().getFullYear();
  const from = Math.max(startYear, now); // ensures future-only starting point

  sel.innerHTML = "";

  for (let y = from; y <= from + yearsAhead; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    sel.appendChild(opt);
  }

  // default selected year
  sel.value = String(from);
}

document.addEventListener("DOMContentLoaded", () => {
  populateEmployeeFutureYears(5, 2026);

  const id = localStorage.getItem("logged_user_id");
  const role = localStorage.getItem("logged_user_role");
  const name = localStorage.getItem("logged_user_name");
  const position = localStorage.getItem("logged_user_position");

  // ==========================================
  // IF LOGGED IN - SHOW DASHBOARD
  // ==========================================
  if (id && role) {
    const userDisplayName = document.getElementById("user-display-name");
    const userDisplayPosition = document.getElementById("user-display-position");
    const portalName = document.getElementById("portal-name");

    if (userDisplayName) userDisplayName.innerText = name || "";
    if (userDisplayPosition) userDisplayPosition.innerText = id ? id.toUpperCase() : "—";
    if (portalName) {
      portalName.innerText =
        role.toLowerCase() === "superadmin"
          ? "ADMIN PORTAL"
          : role.toUpperCase() + " PORTAL";
    }

    document.getElementById("login-page")?.classList.add("hidden");
    document.getElementById("dashboard-container")?.classList.remove("hidden");
    displayLayoutForRole(role);
  }

  // ==========================================
  // ENTER KEY TO LOGIN
  // ==========================================
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const loginPage = document.getElementById("login-page");
      if (loginPage && !loginPage.classList.contains("hidden")) {
        window.handleLogin(event);
      }
    }
  });

  // ==========================================
  // SUBMIT REQUEST BUTTONS
  // ==========================================
  document.querySelectorAll(".submit-request-btn").forEach((btn) => {
    btn.onclick = () => window.submitForm();
  });
});

// ==========================================
// 9. UTILS & HELPERS
// ==========================================
function getStatusClass(status) {
  const s = status?.toLowerCase();
  switch (s) {
    case 'approved': return 'bg-green-100 text-green-700 border border-green-200';
    case 'pending': return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    case 'rejected': return 'bg-red-100 text-red-700 border border-red-200';
    default: return 'bg-gray-100 text-gray-700';
  }
}

window.showPopup = ({ title = '', message = '', type = 'info', onConfirm = null }) => {
  const popup = document.getElementById('custom-popup');
  if (!popup) return;

  const popupContent = popup.querySelector('.bg-white');
  const titleEl = document.getElementById('popup-title');
  const msgEl = document.getElementById('popup-message');
  const btnContainer = document.getElementById('popup-buttons');

  if (!popupContent || !titleEl || !msgEl || !btnContainer) return;

  // BORDER STYLE
  if (type === 'danger') {
    popupContent.classList.remove('border-emerald-600');
    popupContent.classList.add('border-red-600');
  } else {
    popupContent.classList.remove('border-red-600');
    popupContent.classList.add('border-emerald-600');
  }

  // CONTENT
  titleEl.innerText = title || 'Notice';
  msgEl.innerText = message || '';

  btnContainer.innerHTML = '';

  // BUTTON LOGIC
  if (onConfirm) {
    btnContainer.innerHTML = `
            <button id="p-cancel"
                class="flex-1 py-3 border border-slate-200 rounded-lg font-bold text-slate-400 hover:bg-slate-50 transition uppercase text-xs">
                Cancel
            </button>

            <button id="p-confirm"
    class="bg-gradient-to-r from-[#c5a021] to-[#d9b84b] flex-1 py-3 text-white rounded-lg font-bold hover:opacity-90 transition shadow-md uppercase text-xs">
    Confirm
</button>
        `;

    document.getElementById('p-cancel').onclick = () => popup.classList.add('hidden');

    document.getElementById('p-confirm').onclick = () => {
      popup.classList.add('hidden');
      onConfirm();
    };

  } else {
    btnContainer.innerHTML = `
            <button id="p-ok"
                class="${type === 'danger' ? 'bg-red-600' : 'bg-[#c5a021]'} w-full py-3 text-white rounded-lg font-bold hover:opacity-90 transition shadow-md uppercase text-xs">
                OK
            </button>
        `;

    document.getElementById('p-ok').onclick = () => popup.classList.add('hidden');
  }

  popup.classList.remove('hidden');
};

// ==========================================
// 10. ROW RENDERING TEMPLATES
// ==========================================
const formatTime = (t) => {
  if (!t) return "N/A";

  const value = String(t).trim();
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return value;

  let hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${period}`;
};

const getRejectedReason = (item = {}) => {
  return (
    item.rejection_reason ||
    item.reject_reason ||
    item.rejected_reason ||
    item.rejectReason ||
    item.rejectionReason ||
    item.reject_remarks ||
    item.rejection_note ||
    item.reason_for_rejection ||
    item.remarks ||
    ''
  );
};

const renderLeaveRow = (leave) => {
  const status = leave.status || 'Pending';
  const isRejected = status.toLowerCase() === 'rejected';
  const rejectionReason = getRejectedReason(leave);

  if (leave && leave.id) {
    window.dashboardRecords[`leave_${leave.id}`] = leave;
  }

  return `
    <tr class="border-b border-slate-50 hover:bg-slate-50/80 transition-all group" data-record-key="leave_${leave.id}">
        <td class="clickable-td py-4 px-4 font-medium text-slate-800">
            <div>
                <div class="font-bold">${leave.leave_type || 'N/A'}</div>
                <div class="mt-1">
                    <span class="text-[9px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${(leave.pay_status || '').toLowerCase() === 'paid'
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      : 'bg-orange-100 text-orange-700 border border-orange-200'
    }">
                        ${leave.pay_status?.toUpperCase() || 'UNPAID'}
                    </span>
                </div>
            </div>
        </td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-700 font-medium"><div>${leave.start_date || '—'}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-700 font-medium"><div>${leave.end_date || '—'}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[180px] truncate" title="${leave.reason || ''}">
            <div>${leave.reason || 'No reason provided'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[180px] truncate" title="${rejectionReason}">
            <div>${isRejected ? (rejectionReason || '—') : '—'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-center">
            <div>
                <span class="${getStatusStyle(status)}">
                    ${status.toUpperCase()}
                </span>
            </div>
        </td>
        <td class="py-4 px-4 text-center">
            ${renderEmployeeActionCell(leave, 'leave')}
        </td>
    </tr>
    `;
};

const renderOTRow = (ot) => {
  const status = ot.status || 'Pending';
  const isRejected = status.toLowerCase() === 'rejected';
  const rejectionReason = getRejectedReason(ot);

  if (ot && ot.id) {
    window.dashboardRecords[`ot_${ot.id}`] = ot;
  }

  return `
    <tr class="border-b border-slate-50 hover:bg-slate-50/80 transition-all group" data-record-key="ot_${ot.id}">
        <td class="clickable-td py-4 px-4 text-sm text-slate-700 font-medium"><div>${ot.ot_date || '—'}</div></td>
        <td class="clickable-td py-4 px-4">
            <div><span class="text-amber-600 font-medium text-sm ">${ot.hours || '0'}h</span></div>
        </td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[180px] truncate" title="${ot.reason || ot.task_description || ''}">
            <div>${ot.reason || ot.task_description || 'No description'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[180px] truncate" title="${rejectionReason}">
            <div>${isRejected ? (rejectionReason || '—') : '—'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-center">
            <div>
                <span class="${getStatusStyle(status)}">
                    ${status.toUpperCase()}
                </span>
            </div>
        </td>
        <td class="py-4 px-4 text-center">
            ${renderEmployeeActionCell(ot, 'ot')}
        </td>
    </tr>
    `;
};

const renderUTRow = (ut) => {
  const status = ut.status || 'Pending';
  const isRejected = status.toLowerCase() === 'rejected';
  const rejectionReason = getRejectedReason(ut);

  if (ut && ut.id) {
    window.dashboardRecords[`ut_${ut.id}`] = ut;
  }

  return `
    <tr class="border-b border-slate-50 hover:bg-slate-50/80 transition-all group" data-record-key="ut_${ut.id}">
        <td class="clickable-td py-4 px-4 font-bold text-slate-800"><div>${ut.leave_type || 'Undertime'}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-700 font-medium"><div>${ut.start_date || '—'}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-700"><div>${formatTime(ut.from_time)}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-700"><div>${formatTime(ut.to_time)}</div></td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[150px] truncate" title="${ut.reason || ''}">
            <div>${ut.reason || 'No reason'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-sm text-slate-600 max-w-[180px] truncate" title="${rejectionReason}">
            <div>${isRejected ? (rejectionReason || '—') : '—'}</div>
        </td>
        <td class="clickable-td py-4 px-4 text-center">
            <div>
                <span class="${getStatusStyle(status)}">
                    ${status.toUpperCase()}
                </span>
            </div>
        </td>
        <td class="py-4 px-4 text-center">
            ${renderEmployeeActionCell(ut, 'ut')}
        </td>
    </tr>
    `;
};

const renderOBRow = (ob) => {
  if (ob && ob.id) {
    window.dashboardRecords[`ob_${ob.id}`] = ob;
  }

  return `
  <tr class="border-b border-slate-50 hover:bg-slate-50/80 transition-all group" data-record-key="ob_${ob.id}">
    <td class="clickable-td py-4 px-4 font-medium text-slate-800 max-w-[200px] truncate" title="${(ob.purpose || 'No purpose').trim().toLowerCase().replace(/^./, (c) => c.toUpperCase())}">
      <div>${(ob.purpose || 'No purpose').trim().toLowerCase().replace(/^./, (c) => c.toUpperCase())}</div>
    </td>
    <td class="clickable-td py-4 px-4 text-sm text-slate-700 font-medium"><div>${ob.date || '—'}</div></td>
    <td class="clickable-td py-4 px-4 text-sm text-slate-700"><div>${formatTime(ob.time_in)}</div></td>
    <td class="clickable-td py-4 px-4 text-sm text-slate-700"><div>${formatTime(ob.time_out)}</div></td>
    <td class="clickable-td py-4 px-4 text-center">
      <div>
        <span class="${getStatusStyle(ob.status || 'Recorded')}">
          ${(ob.status || 'Recorded').toUpperCase()}
        </span>
      </div>
    </td> 
  </tr>
  `;
};


window.renderActionButtons = (id, category) => {
  // Maps category to your specific functions: e.g., 'Leave' -> window.handleEditRequest(id, 'leave')
  const editFn = `window.handleEditRequest(${id}, '${category.toLowerCase()}')`;
  const deleteFn = `window.handleDeleteRequest(${id}, '${category.toLowerCase()}')`;

  return `
        <div class="flex items-center justify-center transition-all duration-200 gap-2">
            <button onclick="${editFn}" 
                    class="px-3 py-1.5 rounded-[8px] font-bold text-[12px] bg-blue-100 text-blue-700 hover:bg-blue-200 shadow-sm hover:shadow-md active:scale-95 transition-all border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                    title="Edit ${category}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                Edit
            </button>
            <button onclick="${deleteFn}" 
                   class="px-3 py-1.5 rounded-[8px] font-bold text-[12px] bg-red-100 text-red-700 hover:bg-red-200 shadow-sm hover:shadow-md active:scale-95 transition-all border border-red-200 flex items-center gap-1 whitespace-nowrap"  
                    title="Delete ${category}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Delete
            </button>
        </div>
    `;
};

window.formatIDNumber = (input) => {
  let value = input.value.replace(/\D/g, '');
  if (value.length > 2) {
    value = value.substring(0, 2) + '-' + value.substring(2, 7);
  }
  input.value = value;
};

// Function para sa Edit button (Match sa Form design)
window.handleEditUser = (userData) => {
  // Siguraduhin na kahit anong format (APP001, ADMIN001, o 24-00001) ay mapupunta sa tamang key
  const cleanedData = {
    ...userData,
    id_number: userData.id_number || userData.username || ''
  };

  if (typeof openEmployeeForm === 'function') {
    openEmployeeForm('edit', cleanedData);
  } else {
    Swal.fire({
      title: 'SYSTEM NOTE',
      text: 'Employee form is initializing...',
      icon: 'info',
      confirmButtonColor: '#c5a021',
      background: '#f8f5f0'
    });
  }
};


window.renderLeaveRow = renderLeaveRow;
window.renderOTRow = renderOTRow;
window.renderUTRow = renderUTRow;
window.renderOBRow = renderOBRow;

const isPendingStatus = (status) => (status || "").toString().trim().toLowerCase() === "pending";

const renderEmployeeActionCell = (record, category) => {
  // show buttons only if Pending
  if (!isPendingStatus(record?.status)) {
    return `<span class="text-slate-300 text-xs font-bold uppercase tracking-wider">—</span>`;
  }
  return window.renderActionButtons(record.id, category);
};

// ==========================================
// 14. EDIT & DELETE HANDLERS FOR EMPLOYEE REQUESTS
// ==========================================
window.handleEditRequest = async (id, type) => {
  const normalizedType = (type === "ut" || type === "undertime") ? "leave" : type;

  if (type === "ob") {
    return window.showPopup({
      title: "Not Allowed",
      message: "OB / Field records are recorded only and cannot be edited.",
      type: "danger"
    });
  }

  // Open the correct form before populating fields
  window.openForm?.(normalizedType);

  try {
    const endpoint = normalizedType === 'leave' ? 'get_leaves.php' : (normalizedType === 'ot' ? 'get_overtime.php' : 'get_ob.php');
    const empId = localStorage.getItem("logged_user_id");

    const response = await fetch(`${API_BASE_URL}/${endpoint}?employeeId=${empId}&id=${id}`);
    const data = await response.json();

    const record = Array.isArray(data) ? data.find(r => r.id == id) : data;

    if (!record) throw new Error("Record not found");
    if (record.status && record.status.toLowerCase() !== 'pending') {
      return window.showPopup({ title: "Action Denied", message: "Only pending requests can be edited.", type: 'danger' });
    }

    console.log('🔍 LOADING RECORD FOR EDIT:', record);

    // Wait for form to fully render + populate
    setTimeout(() => {
      const container = document.getElementById('form-container');
      if (!container) return;
      container.dataset.editId = id;
      container.dataset.editType = normalizedType;

      // Populate with multiple retries
      const populateForm = (attempt = 1) => {
        console.log(`🔄 Populate attempt ${attempt}`);

        if (normalizedType === 'leave') {
          const leaveTypeEl = document.getElementById('f_leave_type');
          const startEl = document.getElementById('f_start');
          const endEl = document.getElementById('f_end');
          const reasonEl = document.getElementById('f_reason');
          const payRadios = document.querySelectorAll('input[name="f_pay_status"]');

          // Set leave type first (triggers dynamic fields)
          if (leaveTypeEl && !leaveTypeEl.value) {
            leaveTypeEl.value = record.leave_type || 'Undertime';
            if (typeof window.updateLeaveFields === 'function') {
              window.updateLeaveFields(leaveTypeEl.value);
            }
            // Wait for dynamic fields to render
            setTimeout(() => populateForm(attempt + 1), 250);
            return;
          }

          // Now set dates AFTER dynamic fields are ready
          if (startEl) {
            startEl.value = record.start_date || '';
            console.log('✅ Start date set:', startEl.value);
          }
          if (endEl) {
            endEl.value = record.end_date || '';
            console.log('✅ End date set:', endEl.value);
          }
          if (leaveTypeEl?.value === 'Sick Leave' && typeof window.updateLeaveFields === 'function') {
            window.updateLeaveFields(leaveTypeEl.value);
          }
          if (reasonEl) {
            reasonEl.value = record.reason || '';
          }

          // Set pay status
          const targetPayStatus = record.pay_status || 'Paid';
          payRadios.forEach(radio => {
            if (radio.value === targetPayStatus) radio.checked = true;
          });

          console.log('✅ LEAVE EDIT FORM FULLY POPULATED');
        } else {
          // OT and OB population (simpler)
          const fields = {
            'f_date': record.ot_date || record.date || '',
            'f_hours': record.hours || '',
            'f_reason': record.reason || record.task_description || '',
            'f_purpose': record.purpose || '',
            'f_time_in': record.time_in || '',
            'f_time_out': record.time_out || ''
          };

          Object.entries(fields).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
              el.value = value;
              console.log(`✅ ${id} set:`, value);
            }
          });
          console.log('✅ OT/OB FORM POPULATED');
        }
      };

      populateForm();
    }, 500); // Extra wait time for form rendering

  } catch (e) {
    console.error("Edit Error:", e);
    window.showPopup({ title: "Error", message: "Could not load request details.", type: 'danger' });
  }
};

window.handleDeleteRequest = async (id, type) => {
  if (type === "ob") {
    return window.showPopup({
      title: "Not Allowed",
      message: "OB / Field records are recorded only and cannot be deleted.",
      type: "danger"
    });
  }

  window.showPopup({
    title: "Confirm Delete",
    message: `Are you sure you want to delete this ${type.toUpperCase()} request?`,
    type: 'danger',
    onConfirm: async () => {
      try {
        let endpoint = '';
        if (type === 'leave' || type === 'ut' || type === 'undertime') {
          endpoint = 'delete_leave.php';
        } else if (type === 'ot') {
          endpoint = 'delete_ot.php';
        } else if (type === 'ob') {
          endpoint = 'delete_ob.php';
        }

        const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id })
        });

        const rawText = await response.text();
        console.log(`${type} delete raw response:`, rawText);

        let result;
        try {
          result = JSON.parse(rawText);
        } catch {
          throw new Error(`Invalid response from ${endpoint}`);
        }

        // ✅ FLEXIBLE: Handle both formats (success:true OR just message)
        const isSuccess = result.success === true ||
          (response.ok && result.message && !result.error);

        if (isSuccess) {
          window.showPopup({
            title: "Deleted!",
            message: result.message || `${type.toUpperCase()} removed successfully!`,
            type: 'success'
          });

          // Refresh table
          const lowerType = type.toLowerCase();
          if (lowerType === 'leave') fetchMyLeaves();
          else if (lowerType === 'ot') fetchMyOvertime();
          else if (lowerType === 'ob') window.fetchMyOB?.();
          else if (lowerType === 'ut') fetchMyUndertime();
        } else {
          throw new Error(result.message || result.error || "Delete failed");
        }
      } catch (e) {
        window.showPopup({
          title: "Error",
          message: e.message,
          type: 'danger'
        });
      }
    }
  });
};

// Map old names to new handlers for compatibility
window.editLeave = (id) => window.handleEditRequest(id, 'leave');
window.deleteLeave = (id) => window.handleDeleteRequest(id, 'leave');
window.editOT = (id) => window.handleEditRequest(id, 'ot');
window.deleteOT = (id) => window.handleDeleteRequest(id, 'ot');

window.handleDeleteUser = (id, name) => {
  Swal.fire({
    title: '<span class="text-slate-800 text-xl font-bold uppercase tracking-tight">System Notice</span>',
    html: `
            <div class="mt-2">
                <p class="text-slate-500 text-sm leading-relaxed">
                    Are you sure you want to remove <br>
                    <span class="text-slate-800 font-bold text-base underline decoration-[#c5a021] decoration-2 underline-offset-4">${name}</span>?
                </p>
                <p class="text-[10px] text-red-400 mt-4 uppercase font-black tracking-widest">This action cannot be undone</p>
            </div>
        `,
    showCancelButton: true,
    confirmButtonColor: '#c5a021', // Gold match sa theme
    cancelButtonColor: '#f1f5f9', // Light gray background for cancel
    confirmButtonText: 'CONFIRM',
    cancelButtonText: '<span class="text-slate-500">CANCEL</span>',
    reverseButtons: true,
    background: '#ffffff', // Puti gaya ng popup mo
    padding: '2rem',
    showClass: {
      popup: 'animate__animated animate__fadeInUp animate__faster'
    },
    hideClass: {
      popup: 'animate__animated animate__fadeOutDown animate__faster'
    },
    customClass: {
      popup: 'rounded-2xl border-t-[6px] border-[#c5a021] shadow-2xl', // Gold top border match sa popup mo
      confirmButton: 'px-8 py-2.5 rounded-lg font-black text-[11px] tracking-[0.2em] shadow-lg shadow-[#c5a021]/20',
      cancelButton: 'px-8 py-2.5 rounded-lg font-black text-[11px] tracking-[0.2em] border border-slate-200'
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        // I-trigger ang loading state
        Swal.showLoading();

        const response = await fetch(`${API_BASE_URL}/delete_user.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id })
        });

        const data = await response.json();

        if (data.success) {
          Swal.fire({
            title: '<span class="text-emerald-600 text-lg font-black tracking-widest">SUCCESS</span>',
            text: 'Employee record has been purged.',
            icon: 'success',
            confirmButtonColor: '#c5a021',
            background: '#ffffff',
            customClass: {
              popup: 'rounded-2xl border-t-[6px] border-emerald-500 shadow-xl'
            }
          });
          window.refreshEmployeeData();
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        Swal.fire({
          title: 'SYSTEM ERROR',
          text: 'Unable to complete the request.',
          icon: 'error',
          confirmButtonColor: '#ef4444',
          background: '#ffffff',
          customClass: { popup: 'rounded-2xl border-t-[6px] border-red-500' }
        });
      }
    }
  });
};


// ==========================================
// 12. FORM POPULATION HELPER (For Edit)
// ==========================================
window.populateFormFields = (type, data) => {
  const commonFields = {
    'f_purpose': data.purpose,
    'f_date': data.date,
    'f_reason': data.reason,
    'f_start': data.start_date,
    'f_end': data.end_date,
    'f_hours': data.hours,
    'f_time_in': data.time_in,
    'f_time_out': data.time_out,
    'f_from_time': data.from_time,
    'f_to_time': data.to_time
  };

  // Set common fields
  Object.entries(commonFields).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field && value) field.value = value;
  });

  // Type-specific fields
  if (type === 'leave') {
    const payStatusInput = document.querySelector('input[name="f_pay_status"][value="' + (data.pay_status || 'Paid') + '"]');
    if (payStatusInput) payStatusInput.checked = true;
  }

  // Mark as edit mode (you can use this in submitForm)
  const container = document.getElementById('form-container');
  if (container) {
    container.dataset.editId = data.id;
    container.dataset.editType = type;
  }
};

// ==========================================
// 15. CLICKABLE TD DETAIL MODAL LOGIC
// ==========================================
window.showRecordDetails = (recordKey) => {
  const data = window.dashboardRecords[recordKey];
  if (!data) return;

  const currentRole = (localStorage.getItem("logged_user_role") || "").toLowerCase();

  // Let's determine the type of the record based on the key prefix
  let type = '';
  if (recordKey.startsWith('leave_')) type = 'leave';
  else if (recordKey.startsWith('ot_')) type = 'ot';
  else if (recordKey.startsWith('ob_')) type = 'ob';
  else if (recordKey.startsWith('user_')) type = 'user';

  if (type === 'user') {
    Swal.fire({
      title: '<span class="text-slate-800 text-lg font-bold uppercase tracking-wider">EMPLOYEE DETAILS</span>',
      html: `
        <div class="text-left space-y-3 mt-4 text-slate-600 text-sm">
          <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
            <span class="font-bold text-slate-400 text-xs uppercase">ID Number</span>
            <span class="col-span-2 text-slate-800 font-bold">${data.id_number || data.username || 'N/A'}</span>
          </div>
          <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
            <span class="font-bold text-slate-400 text-xs uppercase">Full Name</span>
            <span class="col-span-2 text-slate-800 font-bold">${data.name || 'N/A'}</span>
          </div>
          <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
            <span class="font-bold text-slate-400 text-xs uppercase">Department</span>
            <span class="col-span-2 text-slate-800">${data.department || 'N/A'}</span>
          </div>
          <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
            <span class="font-bold text-slate-400 text-xs uppercase">Position</span>
            <span class="col-span-2 text-slate-800">${data.position || 'N/A'}</span>
          </div>
          <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
            <span class="font-bold text-slate-400 text-xs uppercase">Role</span>
            <span class="col-span-2"><span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 tracking-wider">${data.role || 'Employee'}</span></span>
          </div>
        </div>
      `,
      showCancelButton: true,
      cancelButtonText: 'CLOSE',
      confirmButtonText: 'EDIT MEMBER',
      confirmButtonColor: '#c5a021',
      cancelButtonColor: '#f1f5f9',
      customClass: {
        popup: 'rounded-2xl border-t-[6px] border-[#c5a021] shadow-2xl p-6',
        confirmButton: 'px-6 py-2.5 rounded-lg font-black text-[11px] tracking-[0.2em] shadow-lg shadow-[#c5a021]/20',
        cancelButton: 'px-6 py-2.5 rounded-lg font-black text-[11px] tracking-[0.2em] border border-slate-200 text-slate-500'
      },
      showConfirmButton: (currentRole === 'admin' || currentRole === 'superadmin'),
      reverseButtons: true,
    }).then((res) => {
      if (res.isConfirmed) {
        window.handleEditUser(data);
      }
    });
    return;
  }

  // Mapped/Formatted values
  let title = '';
  let detailsHtml = '';

  const status = data.status || (type === 'ob' ? 'Recorded' : 'Pending');
  const badgeStyle = getStatusStyle(status);

  if (type === 'leave') {
    title = 'LEAVE REQUEST';
    const duration = getLeaveDurationDays(data.start_date, data.end_date);
    const dateRange = (data.start_date && data.end_date)
      ? `${data.start_date} to ${data.end_date}`
      : (data.start_date || 'N/A');

    const durationText = duration > 0 ? ` (${duration} ${duration === 1 ? 'day' : 'days'})` : '';

    detailsHtml = `
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Leave Type</span>
        <span class="col-span-2 text-slate-800 font-bold">${data.leave_type || 'N/A'}</span>
      </div>
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Pay Status</span>
        <span class="col-span-2">
          <span class="text-[10px] px-2 py-0.5 rounded-md font-black uppercase ${(data.pay_status || 'Paid') === 'Paid'
        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        : 'bg-orange-100 text-orange-700 border border-orange-200'
      }">
            ${(data.pay_status || 'Paid').toUpperCase()}
          </span>
        </span>
      </div>
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Period</span>
        <span class="col-span-2 text-slate-800">${dateRange}${durationText}</span>
      </div>
      ${(data.leave_type === 'Undertime' || data.leave_type === 'Halfday') && (data.from_time || data.to_time) ? `
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Time</span>
        <span class="col-span-2 text-slate-800">${formatTime(data.from_time)} to ${formatTime(data.to_time)}</span>
      </div>
      ` : ''}
    `;
  } else if (type === 'ot') {
    title = 'OVERTIME REQUEST';
    detailsHtml = `
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">OT Date</span>
        <span class="col-span-2 text-slate-800 font-bold">${data.ot_date || 'N/A'}</span>
      </div>
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Hours</span>
        <span class="col-span-2 text-amber-600 font-bold">${data.hours || '0'} hrs</span>
      </div>
    `;
  } else if (type === 'ob') {
    title = 'OFFICIAL BUSINESS';
    detailsHtml = `
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Date</span>
        <span class="col-span-2 text-slate-800 font-bold">${data.date || 'N/A'}</span>
      </div>
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Purpose</span>
        <span class="col-span-2 text-slate-800 font-bold">${data.purpose || 'N/A'}</span>
      </div>
      <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
        <span class="font-bold text-slate-400 text-xs uppercase">Time In/Out</span>
        <span class="col-span-2 text-slate-800">${formatTime(data.time_in)} - ${formatTime(data.time_out)}</span>
      </div>
    `;
  }

  // Common details
  const empName = data.employeeName || data.name || data.employee_name || 'N/A';
  const dept = data.department || 'N/A';
  const pos = data.position || 'N/A';
  const reason = data.reason || data.task_description || data.purpose || 'No description provided';
  const rejectReason = getRejectedReason(data);

  const isPending = status.toLowerCase() === 'pending';
  const isRejected = status.toLowerCase() === 'rejected';

  // Determine actions
  let showApproverActions = (currentRole === 'approver') && isPending;
  let showEmployeeActions = (currentRole === 'employee') && isPending && (type !== 'ob');

  let popupBorderColor = '#c5a021';
  if (status.toLowerCase() === 'approved') popupBorderColor = '#10b981';
  if (isRejected) popupBorderColor = '#ef4444';

  Swal.fire({
    title: `<span class="text-slate-800 text-lg font-bold uppercase tracking-wider">${title} DETAILS</span>`,
    html: `
      <div class="text-left space-y-3 mt-4 text-slate-600 text-sm">
        <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
          <span class="font-bold text-slate-400 text-xs uppercase">Employee</span>
          <span class="col-span-2 text-slate-800 font-bold">${empName}</span>
        </div>
        ${dept !== 'N/A' || pos !== 'N/A' ? `
        <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
          <span class="font-bold text-slate-400 text-xs uppercase">Dept / Pos</span>
          <span class="col-span-2 text-slate-700">${dept} ${pos !== 'N/A' ? `/ ${pos}` : ''}</span>
        </div>
        ` : ''}
        
        ${detailsHtml}

        <div class="grid grid-cols-3 border-b border-slate-100 pb-2">
          <span class="font-bold text-slate-400 text-xs uppercase">Reason</span>
          <span class="col-span-2 text-slate-700 break-words leading-relaxed">"${reason}"</span>
        </div>

        ${isRejected && rejectReason ? `
        <div class="grid grid-cols-3 border-b border-red-50 pb-2 bg-red-50/50 p-2 rounded-xl">
          <span class="font-bold text-red-500 text-xs uppercase">Rejection Reason</span>
          <span class="col-span-2 text-red-700 font-semibold break-words leading-relaxed">"${rejectReason}"</span>
        </div>
        ` : ''}

        <div class="grid grid-cols-3 pt-2">
          <span class="font-bold text-slate-400 text-xs uppercase">Status</span>
          <span class="col-span-2">
            <span class="${badgeStyle}">
              ${status.toUpperCase()}
            </span>
          </span>
        </div>
      </div>
    `,
    showDenyButton: showApproverActions || showEmployeeActions,
    showConfirmButton: showApproverActions || showEmployeeActions,
    showCancelButton: true,
    confirmButtonText: showApproverActions ? 'APPROVE' : 'EDIT',
    denyButtonText: showApproverActions ? 'REJECT' : 'DELETE',
    cancelButtonText: 'CLOSE',
    confirmButtonColor: showApproverActions ? '#10b981' : '#3b82f6',
    denyButtonColor: '#ef4444',
    cancelButtonColor: '#f1f5f9',
    reverseButtons: true,
    customClass: {
      popup: 'rounded-2xl shadow-2xl p-6',
      confirmButton: 'px-5 py-2.5 rounded-lg font-black text-[11px] tracking-[0.15em] uppercase shadow-md',
      denyButton: 'px-5 py-2.5 rounded-lg font-black text-[11px] tracking-[0.15em] uppercase shadow-md text-white',
      cancelButton: 'px-5 py-2.5 rounded-lg font-black text-[11px] tracking-[0.15em] uppercase border border-slate-200 text-slate-500'
    },
    didOpen: (popup) => {
      popup.style.borderTop = `6px solid ${popupBorderColor}`;
    }
  }).then((res) => {
    if (res.isConfirmed) {
      if (showApproverActions) {
        const activeTab = document.querySelector('#approver-layout button[id^="tab-pending-"], #approver-layout button[id^="tab-all-"]')?.id?.replace('tab-', '') || 'pending-leave';
        window.updateStatus(data.id, 'Approved', activeTab);
      } else if (showEmployeeActions) {
        window.handleEditRequest(data.id, type);
      }
    } else if (res.isDenied) {
      if (showApproverActions) {
        const activeTab = document.querySelector('#approver-layout button[id^="tab-pending-"], #approver-layout button[id^="tab-all-"]')?.id?.replace('tab-', '') || 'pending-leave';
        window.updateStatus(data.id, 'Rejected', activeTab);
      } else if (showEmployeeActions) {
        window.handleDeleteRequest(data.id, type);
      }
    }
  });
};

// Event delegation for table cell clicks
document.addEventListener('click', (e) => {
  const cell = e.target.closest('.clickable-td');
  if (!cell) return;

  // Exclude actual interactive elements inside the cell
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('svg')) {
    return;
  }

  const row = cell.closest('tr');
  if (!row) return;

  const recordKey = row.dataset.recordKey;
  if (recordKey) {
    window.showRecordDetails(recordKey);
  }
});

