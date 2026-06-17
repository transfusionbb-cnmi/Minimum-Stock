const WEB_APP_URL = (window.MINIMUM_STOCK_CONFIG && window.MINIMUM_STOCK_CONFIG.GAS_WEB_APP_URL) || "https://script.google.com/macros/s/AKfycbzOcuADXBhegKJzgNODfyX2MfafMJmQ0ZP1k0Q0AxeeI5FAj1_716evZDFOCvHn9iIw/exec";

    const uploadZone = document.getElementById("uploadZone");
    const fileInput = document.getElementById("fileInput");
    const fileName = document.getElementById("fileName");
    const uploadBtn = document.getElementById("uploadBtn");
    const clearDataBtn = document.getElementById("clearDataBtn");
    const statusBox = document.getElementById("statusBox");
    const loadingBox = document.getElementById("loadingBox");
    const dashboard = document.getElementById("dashboard");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalIcon = document.getElementById("modalIcon");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const confirmOverlay = document.getElementById("confirmOverlay");
    const confirmTitle = document.getElementById("confirmTitle");
    const confirmMessage = document.getElementById("confirmMessage");
    const confirmOkBtn = document.getElementById("confirmOkBtn");
    const confirmCancelBtn = document.getElementById("confirmCancelBtn");

    let selectedFile = null;
    document.addEventListener("DOMContentLoaded", loadDashboardOnStart);

    uploadZone.addEventListener("click", () => fileInput.click());

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener("change", () => {
      handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      if (!file) return;

      const ok = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
      if (!ok) {
        showStatus("กรุณาเลือกไฟล์ Excel เท่านั้น", false);
        return;
      }

      selectedFile = file;
      fileName.textContent = file.name;
      uploadBtn.disabled = false;
      showStatus("เลือกไฟล์แล้ว พร้อมอัปโหลด", true);
    }

    uploadBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = "กำลังล้างข้อมูลเดิม...";
      showStatus("กำลังล้างข้อมูลเดิมก่อนอัปโหลดรอบใหม่", true);
      loadingBox.style.display = "block";
      dashboard.style.display = "none";

      try {
        await MinimumStockBackend.clearAllSnapshots({ gasWebAppUrl: WEB_APP_URL });
        clearMinimumStockLocalCaches({ keepVersion: true });

        uploadBtn.textContent = "กำลังอ่านไฟล์และคำนวณ...";
        showStatus("ล้างข้อมูลเดิมแล้ว กำลังอ่าน Excel, คำนวณ และบันทึกไฟล์ใหม่", true);

        const data = await MinimumStockBackend.uploadExcel(selectedFile, {
          gasWebAppUrl: WEB_APP_URL,
          skipClearBeforeUpload: true
        });

        if (!data.ok) {
          throw new Error(data.message || "อัปโหลดไม่สำเร็จ");
        }

        showStatus("✅ คำนวณสำเร็จ: " + data.fileName, true);
clearMinimumStockLocalCaches({ keepVersion: true });
saveDashboardCache(data);
renderDashboard(data);

if (document.getElementById("page-mobile")?.classList.contains("active")) {
  loadMobilePlanning();
}

showModal("success", "คำนวณสำเร็จ", `อ่านข้อมูล ${data.totalRows} รายการ พบ Released ${data.releasedRows} รายการ`);

      } catch (err) {
        showStatus("❌ " + err.message, false);
        showModal("error", "ไม่สำเร็จ", err.message);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "อัปโหลดและคำนวณ Minimum Stock";
        loadingBox.style.display = "none";
      }
    });

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", async () => {
        const ok = await showConfirmModal("ยืนยันการล้างข้อมูล", "ต้องการล้างข้อมูล Minimum Stock เดิมใน Supabase และ cache ของแอพนี้ใช่ไหม?\n\nหลังล้างแล้วหน้า Dashboard จะว่าง จนกว่าจะอัปโหลดไฟล์ใหม่");
        if (!ok) return;

        clearDataBtn.disabled = true;
        clearDataBtn.textContent = "กำลังล้างข้อมูล...";
        showStatus("กำลังล้างข้อมูลเดิมในระบบ", true);

        try {
          await MinimumStockBackend.clearAllSnapshots({ gasWebAppUrl: WEB_APP_URL });
          clearMinimumStockLocalCaches({ keepVersion: true });
          currentDashboardData = null;
          currentMobilePlanningData = null;
          renderEmptyDashboardAfterClear();
          showStatus("✅ ล้างข้อมูลเดิมแล้ว พร้อมอัปโหลดไฟล์ใหม่", true);
          showModal("success", "ล้างข้อมูลเดิมแล้ว", "ระบบล้าง snapshot เดิมและ cache ของแอพนี้แล้ว");
        } catch (err) {
          showStatus("❌ " + err.message, false);
          showModal("error", "ล้างข้อมูลไม่สำเร็จ", err.message);
        } finally {
          clearDataBtn.disabled = false;
          clearDataBtn.textContent = "🧹 ล้างข้อมูลเดิมในระบบ";
        }
      });
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const result = reader.result;
          const base64 = result.split(",")[1];
          resolve(base64);
        };

        reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
        reader.readAsDataURL(file);
      });
    }

    function showStatus(message, good) {
      statusBox.style.display = "block";
      statusBox.style.background = good ? "#eef7ff" : "#fff1f1";
      statusBox.style.borderColor = good ? "#c8e6ff" : "#ffc9c9";
      statusBox.textContent = message;
    }

    let currentDashboardData = null;
let currentTab = "LPRC / LDPRC";
let currentMobilePlanningData = null;
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260617-v2-5-1-supabaseonly";
const DASHBOARD_CACHE_KEY = `minimumStock.${APP_VERSION}.dashboard.summary`;
const MOBILE_CACHE_KEY = `minimumStock.${APP_VERSION}.mobile.latest`;
const EXPIRY_CACHE_KEY = `minimumStock.${APP_VERSION}.expiry.latest`;

function saveDashboardCache(data) {
  try {
    if (!data || !Array.isArray(data.results) || data.results.length === 0) return;
    const slim = {
      ok: true,
      message: data.message || "โหลดจาก cache",
      fileName: data.fileName || "",
      calculatedAt: data.calculatedAt || "",
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      totalRows: Number(data.totalRows || 0),
      releasedRows: Number(data.releasedRows || 0),
      resultRows: Number(data.resultRows || (data.results || []).length || 0),
      results: data.results || [],
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(slim));
  } catch (err) {
    console.warn("saveDashboardCache failed", err);
  }
}

function readDashboardCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;
    return data;
  } catch (err) {
    console.warn("readDashboardCache failed", err);
    return null;
  }
}


function saveLightCache(key, data) {
  try {
    if (!key || !data || !data.ok) return;
    const payload = {
      ...data,
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    // ถ้าข้อมูลใหญ่เกิน localStorage ให้ข้าม ไม่ให้เว็บพัง
    console.warn("saveLightCache failed", err);
  }
}

function readLightCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.ok) return null;
    return data;
  } catch (err) {
    console.warn("readLightCache failed", err);
    return null;
  }
}

function clearMinimumStockLocalCaches(options = {}) {
  try {
    const keepVersion = Boolean(options.keepVersion);
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (keepVersion && key === "minimumStock.__appVersion") continue;
      if (
        key === DASHBOARD_CACHE_KEY ||
        key === MOBILE_CACHE_KEY ||
        key === EXPIRY_CACHE_KEY ||
        key.startsWith("minimumStock.") ||
        key.startsWith("MinimumStock.") ||
        key.startsWith("minstock.") ||
        key.includes("minimum_stock")
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    sessionStorage.clear();
  } catch (err) {
    console.warn("clearMinimumStockLocalCaches failed", err);
  }
}

function clearMinimumStockCacheNow() {
  try {
    clearMinimumStockLocalCaches({ keepVersion: false });
    if (typeof window.resetMinimumStockAppCache === "function") {
      window.resetMinimumStockAppCache();
      return;
    }
    location.reload();
  } catch (err) {
    console.warn("clearMinimumStockCacheNow failed", err);
    location.reload();
  }
}

function renderEmptyDashboardAfterClear() {
  const topDashboard = document.getElementById("topDashboard");
  const expiryRiskDashboard = document.getElementById("expiryRiskDashboard");
  const mobilePlanningDashboard = document.getElementById("mobilePlanningDashboard");

  if (topDashboard) {
    topDashboard.innerHTML = `
      <div class="hero-card mt-4">
        <h3 class="fw-bold mb-2">ยังไม่มีข้อมูล Minimum Stock</h3>
        <div class="small-muted mb-3">ล้างข้อมูลเดิมแล้ว กรุณาอัปโหลดไฟล์ Excel ใหม่เพื่อเริ่มคำนวณรอบล่าสุด</div>
        <button class="btn btn-main" onclick="scrollToUpload()">ไปหน้าอัปโหลดไฟล์</button>
      </div>
    `;
  }

  if (expiryRiskDashboard) expiryRiskDashboard.innerHTML = "";
  if (mobilePlanningDashboard) mobilePlanningDashboard.innerHTML = "";
}

function isSameDashboardData(a, b) {
  if (!a || !b) return false;
  return String(a.fileName || "") === String(b.fileName || "") &&
    String(a.calculatedAt || "") === String(b.calculatedAt || "") &&
    Number(a.totalRows || 0) === Number(b.totalRows || 0) &&
    Number(a.releasedRows || 0) === Number(b.releasedRows || 0);
}

function renderDashboard(data) {
  currentDashboardData = data;

  const results = data.results || [];
  const totalMin = results.reduce((sum, r) => sum + Number(r.minimumStock || 0), 0);
  const totalUsed = results.reduce((sum, r) => sum + Number(r.totalUsed || 0), 0);
  const totalNet = results.reduce((sum, r) => sum + Number(r.netAvailable || 0), 0);

  const criticalItems = results.filter(r =>
  !["LDPPC", "SDP"].includes(r.type) &&
  (
    String(r.alertLevel || "").toLowerCase() === "critical" ||
    String(r.alertLevel || "").toLowerCase() === "warning"
  )
);

  const overstockItems = results.filter(r =>
    String(r.alertLevel || "").toLowerCase() === "overstock"
  );

  const topDashboard = document.getElementById("topDashboard");

  topDashboard.innerHTML = `
    <div class="mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 class="fw-bold mb-1">Minimum Stock Dashboard</h1>
          <div class="small-muted">
            ข้อมูลล่าสุดจากไฟล์: <b>${data.fileName || "-"}</b><br>
            อัปเดตล่าสุด: <b>${formatDisplayDateTime(data.calculatedAt) || "-"}</b>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-main" onclick="scrollToUpload()">อัปโหลดไฟล์ใหม่</button>
          <button class="btn btn-outline-secondary" onclick="clearMinimumStockCacheNow()">ล้าง Cache แอพนี้</button>
        </div>
      </div>

      <div class="summary-grid mb-4">
        <div class="summary-card">
          <div class="small-muted">ช่วงวันที่</div>
          <div class="fw-bold">${data.startDate || "-"} ถึง ${data.endDate || "-"}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Total Used</div>
          <div class="fs-3 fw-bold">${totalUsed}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Net Available</div>
          <div class="fs-3 fw-bold">${totalNet}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Minimum Stock รวม</div>
          <div class="fs-3 fw-bold">${totalMin}</div>
        </div>
      </div>

      <div class="priority-grid">
        <div class="priority-card critical">
          <h5 class="fw-bold mb-2">⚠️ ต้องจัดการก่อน</h5>
          ${renderPriorityList(criticalItems, "ไม่มีรายการต่ำกว่า Minimum")}
        </div>

        <div class="priority-card overstock">
          <h5 class="fw-bold mb-2">📦 Stock สูงมาก</h5>
          ${renderPriorityList(overstockItems, "ไม่มีรายการสูงเกิน")}
        </div>
      </div>

      <div class="tab-scroll">
        ${["LPRC / LDPRC", "FFP", "LDPPC", "Cryo", "SDP"].map(type => `
          <button class="tab-btn ${type === currentTab ? "active" : ""}" onclick="changeTab('${type}')">
            ${type}
          </button>
        `).join("")}
      </div>

      <div id="tabContent"></div>
    </div>
  `;

  renderTabContent();
}

function getTypeClass(type) {
  const t = String(type || "").toLowerCase();

  if (t.includes("lprc")) return "type-prc";
  if (t.includes("ffp")) return "type-ffp";
  if (t.includes("ldppc")) return "type-ldppc";
  if (t.includes("cryo")) return "type-cryo";
  if (t.includes("sdp")) return "type-sdp";

  return "type-ffp";
}

function showModal(type, title, message) {
  modalIcon.textContent = type === "success" ? "✅" : "⚠️";
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalOverlay.style.display = "flex";
}

function closeModal() {
  modalOverlay.style.display = "none";
}

function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title || "ยืนยัน";
    confirmMessage.innerHTML = String(message || "").replace(/\n/g, "<br>");
    confirmOverlay.style.display = "flex";

    const cleanup = (result) => {
      confirmOverlay.style.display = "none";
      confirmOkBtn.onclick = null;
      confirmCancelBtn.onclick = null;
      confirmOverlay.onclick = null;
      resolve(result);
    };

    confirmOkBtn.onclick = () => cleanup(true);
    confirmCancelBtn.onclick = () => cleanup(false);
    confirmOverlay.onclick = (e) => {
      if (e.target === confirmOverlay) cleanup(false);
    };
  });
}

    async function loadDashboardOnStart() {
  const topDashboard = document.getElementById("topDashboard");
  const cachedData = readDashboardCache();

  // Instant mode: แสดงข้อมูลสรุปล่าสุดจากเครื่องก่อน แล้วค่อย sync Supabase เบื้องหลัง
  // ทำให้การเปิดหน้า Minimum Stock กลับมาไวเหมือนช่วงก่อนย้ายฐานข้อมูล
  if (cachedData) {
    renderDashboard(cachedData);
  } else {
    topDashboard.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลด Dashboard ล่าสุด...</div>
        <div class="small-muted">ระบบกำลังดึงค่า Minimum Stock ล่าสุดจากข้อมูลที่อัปโหลดไว้</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getDashboard({
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Dashboard ไม่สำเร็จ");
    }

    if (!data.results || data.results.length === 0) {
      if (!cachedData) {
        topDashboard.innerHTML = `
          <div class="hero-card">
            <h4 class="fw-bold mb-2">ยังไม่มีข้อมูล Minimum Stock</h4>
            <div class="small-muted">กรุณาอัปโหลดไฟล์ Excel เพื่อคำนวณครั้งแรก</div>
          </div>
        `;
      }
      return;
    }

    saveDashboardCache(data);
    if (!cachedData || !isSameDashboardData(cachedData, data)) {
      renderDashboard(data);
    }

  } catch (err) {
    if (cachedData) {
      showStatus("แสดงข้อมูลล่าสุดที่เคยโหลดไว้ก่อน ระบบจะ Sync ใหม่เมื่อเชื่อมต่อได้", true);
      return;
    }

    topDashboard.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลด Dashboard ไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

    function changeTab(type) {
  currentTab = type;
  renderDashboard(currentDashboardData);
}

function renderTabContent() {
  const results = currentDashboardData?.results || [];
  const filtered = results.filter(r => r.type === currentTab);

  const tabContent = document.getElementById("tabContent");

  tabContent.innerHTML = `
    <div class="summary-card mb-3">
      <div class="small-muted">
        ใช้ได้จริง = พร้อมใช้ - LR - Patient - คล้องกับผู้ป่วย | ขาด/เกิน = ใช้ได้จริง - Minimum Stock
      </div>

    <div class="result-table table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Blood Group</th>
            <th class="text-end">Minimum</th>
            <th class="text-end">พร้อมใช้</th>
            <th class="text-end">LR</th>
            <th class="text-end">Patient</th>
            <th class="text-end">รอตรวจ/รอแปะ Bag</th>
            <th class="text-end">คล้องกับผู้ป่วย</th>
            <th class="text-end">ใช้ได้จริง</th>
            <th class="text-end">ขาด/เกิน</th>
            <th>คำแนะนำ</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              <td class="fw-bold">${r.bloodGroup}</td>
              <td class="text-end fw-bold">${r.minimumStock}</td>
              <td class="text-end">${r.available ?? 0}</td>
              <td class="text-end">${r.lrSpare ?? 0}</td>
              <td class="text-end">${r.patientManual ?? 0}</td>
              <td class="text-end">${r.pendingScreening ?? 0}</td>
              <td class="text-end">${r.readyToIssue ?? 0}</td>
              <td class="text-end fw-bold">${r.netAvailable ?? 0}</td>
              <td class="text-end fw-bold">${r.gap ?? 0}</td>
              <td>
                <span class="action-pill ${getAlertClass(r.alertLevel)}">
                  ${getShortActionText(r)}
                </span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="mobile-stock-cards">
      ${filtered.map(r => `
        <div class="stock-mobile-card">
          <div class="stock-mobile-head">
            <div>
              <div class="small-muted">Blood Group</div>
              <div class="fs-3 fw-bold">${r.bloodGroup}</div>
            </div>
            <span class="action-pill ${getAlertClass(r.alertLevel)}">
              ${getShortActionText(r)}
            </span>
          </div>

          <div class="stock-mobile-grid">
  <div class="stock-mobile-item">
    <div class="stock-mobile-label">Minimum</div>
    <div class="stock-mobile-value">${r.minimumStock}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">พร้อมใช้</div>
    <div class="stock-mobile-value">${r.available ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">LR</div>
    <div class="stock-mobile-value">${r.lrSpare ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">Patient</div>
    <div class="stock-mobile-value">${r.patientManual ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">รอตรวจ/รอแปะ</div>
    <div class="stock-mobile-value">${r.pendingScreening ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">คล้องผู้ป่วย</div>
    <div class="stock-mobile-value">${r.readyToIssue ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">ใช้ได้จริง</div>
    <div class="stock-mobile-value">${r.netAvailable ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">ขาด/เกิน</div>
    <div class="stock-mobile-value">${r.gap ?? 0}</div>
  </div>
</div>
        </div>
      `).join("")}
    </div>
  `;
}

    function getShortActionText(r) {
  const level = String(r.alertLevel || "").toLowerCase();

  if (level === "critical") return "เติมด่วน";
  if (level === "warning") return "ควรเติม";
  if (level === "watch") return "เฝ้าระวัง";
  if (level === "overstock") return "ชะลอเติม";
  return "ปกติ";
}

function renderPriorityList(items, emptyText) {
  if (!items || items.length === 0) {
    return `<div class="small-muted">${emptyText}</div>`;
  }

  return `
    <div class="d-grid gap-2">
      ${items.map(r => `
        <div>
          <b>${r.type} ${r.bloodGroup}</b>
          <span class="small-muted">${Number(r.gap) < 0 ? "ขาด" : "เกิน"} ${Math.abs(Number(r.gap || 0))} ยูนิต</span><br>
          <span class="small-muted">${r.suggestedAction || r.suggestion}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function getAlertClass(level) {
  const l = String(level || "").toLowerCase();

  if (l === "critical") return "alert-critical";
  if (l === "warning") return "alert-warning";
  if (l === "watch") return "alert-watch";
  if (l === "overstock") return "alert-overstock";
  return "alert-normal";
}
    function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

    function diffDaysFromToday(targetDateText) {
  const todayText = getTodayYmd();

  const today = new Date(todayText + "T00:00:00");
  const target = new Date(targetDateText + "T00:00:00");

  if (isNaN(target)) return 1;

  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  return Math.max(1, diff);
}

async function loadMobilePlanning(targetMobileDate) {
  const holder = document.getElementById("mobilePlanningDashboard");
  if (!holder) return;

  const selectedMobileDate =
    targetMobileDate ||
    document.getElementById("mobilePlanDate")?.value ||
    getTodayYmd();

  const targetPlanDays = diffDaysFromToday(selectedMobileDate);
  const cachedMobile = readLightCache(MOBILE_CACHE_KEY);

  if (cachedMobile) {
    cachedMobile.targetMobileDate = selectedMobileDate;
    cachedMobile.targetPlanDays = targetPlanDays;
    currentMobilePlanningData = cachedMobile;
    renderMobilePlanning(cachedMobile);
  } else {
    holder.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลดแผนออกหน่วย...</div>
        <div class="small-muted">ระบบกำลังคำนวณจากวันที่คาดว่าจะออกหน่วย เทียบกับ stock ปัจจุบันและข้อมูลย้อนหลัง 2 ปี</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getMobilePlanning({
      selectedDate: getTodayYmd(),
      planDays: targetPlanDays,
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Mobile Unit Planning ไม่สำเร็จ");
    }

    data.targetMobileDate = selectedMobileDate;
    data.targetPlanDays = targetPlanDays;

    saveLightCache(MOBILE_CACHE_KEY, data);
    currentMobilePlanningData = data;
    renderMobilePlanning(data);

  } catch (err) {
    holder.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลดแผนออกหน่วยไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

function renderMobilePlanning(data) {
  const holder = document.getElementById("mobilePlanningDashboard");
  if (!holder) return;

  const summary = data.summary || {};
  const decisionBase = summary.decisionBase || {};
  const rows = summary.typeGroupRows || [];

  const planDays = Number(data.targetPlanDays || data.planDays || decisionBase.planDays || 14);
  const targetMobileDate = data.targetMobileDate || getTodayYmd();

  const prcRows = rows.filter(r => r.type === "LPRC / LDPRC");

  const prcCnmi = prcRows.reduce((sum, r) => sum + Number(r.cnmi || 0), 0);
  const prcTrc = prcRows.reduce((sum, r) => sum + Number(r.trc || 0), 0);
  const prcTotalSource = prcCnmi + prcTrc;

  const prcTrcRatioDisplay = prcTotalSource > 0
    ? ((prcTrc / prcTotalSource) * 100).toFixed(1)
    : "0.0";

  const decision = getMobilePlanningDecision(decisionBase);
  const riskText = Array.isArray(decisionBase.riskGroups) && decisionBase.riskGroups.length
    ? decisionBase.riskGroups.join(", ")
    : "-";

  holder.innerHTML = `
    <div class="forecast-hero">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <div class="forecast-pill mb-2">LPRC / LDPRC Forecast</div>
          <h1 class="fw-bold mb-2">ประเมินแผนออกหน่วยรับบริจาค</h1>
          <div class="small-muted">
            เลือกวันที่ที่คาดว่าจะออกหน่วย ระบบจะประเมินจาก stock ปัจจุบัน + การใช้ย้อนหลัง + การจัดหาเองในช่วงเดียวกันปีที่แล้ว
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <div class="small-muted mb-1">วันที่คาดว่าจะออกหน่วย</div>
            <input
              id="mobilePlanDate"
              type="date"
              class="mobile-date-input"
              value="${targetMobileDate}"
            />
          </div>

          <button class="btn btn-main" onclick="loadMobilePlanning()">
            คำนวณแผน
          </button>
        </div>
      </div>

      <div class="mobile-decision-card ${decision.level}">
        <div class="small-muted mb-1">คำตอบของระบบ</div>
        <h3 class="fw-bold mb-2">${decision.icon} ${decision.title}</h3>
        <div>${decision.text}</div>
      </div>
    </div>

    <div class="mobile-kpi-grid">
      <div class="summary-card">
        <div class="small-muted">คาดว่าจะใช้</div>
        <div class="fs-3 fw-bold">${decisionBase.totalForecastUse || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">คาดว่าจะจัดหาเองได้</div>
        <div class="fs-3 fw-bold">${decisionBase.totalExpectedCnmiIn || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">คาดว่าจะเหลือ</div>
        <div class="fs-3 fw-bold">${decisionBase.totalProjectedBalance || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">ควรออกหน่วยเพิ่ม</div>
        <div class="fs-3 fw-bold">${decisionBase.totalNeedToCollect || 0}</div>
      </div>
    </div>

    <div class="mobile-note-box">
  <div class="fw-bold mb-1">สรุปเพิ่มเติม</div>
  <div class="small-muted mb-2">
    หมู่เลือดที่เสี่ยงขาด: <b>${riskText}</b> |
    TRC Ratio: <b>${prcTrcRatioDisplay}%</b>
  </div>

  <div class="fw-bold">
    เลือดที่หมดอายุก่อนวันออกหน่วยและไม่นำมาคิดเป็น stock ใช้งาน:
    ${decisionBase.totalExpiringBeforePlan || 0} unit
  </div>
</div>

    <div class="mobile-chart-card mb-3">
      <h5 class="fw-bold mb-3">แหล่งที่มาของ LPRC / LDPRC ใน stock ปัจจุบัน</h5>
      ${renderSimpleBar("CNMI", prcCnmi, prcTotalSource, "fill-cnmi")}
      ${renderSimpleBar("TRC", prcTrc, prcTotalSource, "fill-trc")}
    </div>

    <div class="mobile-chart-card mb-3">
      <h5 class="fw-bold mb-3">Forecast แยกตามหมู่เลือด</h5>
      ${renderPrcBloodGroupChart(prcRows)}
    </div>

    <div class="mobile-note-box">
      <div class="fw-bold mb-1">ตารางสรุปตามหมู่เลือด</div>
      <div class="small-muted">
        คาดว่าจะใช้ = ค่าเฉลี่ยล่าสุดเทียบกับช่วงเดียวกันปีที่แล้ว |
        หาได้เอง = CNMI DateStockIn ช่วงเดียวกันปีที่แล้ว |
        ควรออกเพิ่ม = ส่วนที่ยังไม่พอหลังรวม stock ปัจจุบันและที่คาดว่าจะหาได้เอง
      </div>
    </div>

    <div class="mobile-table-card table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Group</th>
            <th class="text-end">ใช้ได้ตอนนี้</th>
            <th class="text-end">คาดว่าจะใช้</th>
            <th class="text-end">หาได้เอง</th>
            <th class="text-end">คาดว่าจะเหลือ</th>
            <th class="text-end">ควรออกเพิ่ม</th>
            <th class="text-end">CNMI</th>
            <th class="text-end">TRC</th>
          </tr>
        </thead>
        <tbody>
          ${renderMobilePlanningRows(prcRows)}
        </tbody>
      </table>
    </div>
  `;
}

function getMobilePlanningDecision(decisionBase) {
  const planDays = Number(decisionBase.planDays || 14);
  const needToCollect = Number(decisionBase.totalNeedToCollect || 0);
  const forecastUse = Number(decisionBase.totalForecastUse || 0);
  const expectedCnmiIn = Number(decisionBase.totalExpectedCnmiIn || 0);
  const trcRatio = Number(decisionBase.prcTrcRatio || 0);
  const riskGroups = Array.isArray(decisionBase.riskGroups) ? decisionBase.riskGroups : [];
  const riskText = riskGroups.length ? riskGroups.join(", ") : "-";

  if (needToCollect > 0 && planDays <= 7) {
    return {
      level: "critical",
      icon: "🚨",
      title: `ควรเติมด่วนภายใน ${planDays} วัน`,
      text: `ระบบคาดว่าจะใช้ LPRC / LDPRC ${forecastUse} unit และคาดว่าจะจัดหาเองได้ ${expectedCnmiIn} unit แต่ยังควรออกหน่วยเพิ่ม ${needToCollect} unit โดยหมู่ที่เสี่ยงขาดคือ ${riskText} อาจต้องวางแผนออกหน่วยหรือประสาน TRC เฉพาะหน้า`
    };
  }

  if (needToCollect > 0) {
    return {
      level: "warning",
      icon: "🚌",
      title: `ควรวางแผนออกหน่วยภายใน ${planDays} วัน`,
      text: `ระบบคาดว่าจะใช้ LPRC / LDPRC ${forecastUse} unit และคาดว่าจะจัดหาเองได้ ${expectedCnmiIn} unit เมื่อเทียบกับ stock ปัจจุบันแล้วยังควรออกหน่วยเพิ่ม ${needToCollect} unit โดยหมู่ที่ควรเน้นคือ ${riskText}`
    };
  }

  if (trcRatio >= 30) {
    return {
      level: "watch",
      icon: "👀",
      title: `ยังพอใช้ถึงวันออกหน่วย แต่ควรลดการพึ่ง TRC`,
      text: `LPRC / LDPRC ยังพอใช้ตาม forecast แต่สัดส่วนเลือดจาก TRC อยู่ที่ ${trcRatio}% ควรพิจารณาวางรอบออกหน่วยเพื่อลดการเบิกจาก TRC`
    };
  }

  return {
    level: "normal",
    icon: "✅",
    title: `ยังไม่จำเป็นต้องออกหน่วยภายใน ${planDays} วัน`,
    text: `LPRC / LDPRC ยังพอใช้ตาม forecast และสัดส่วนเลือดจาก TRC ไม่สูง สามารถติดตามตามรอบปกติ`
  };
}

function renderSimpleBar(label, value, total, fillClass) {
  const percent = total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0;

  return `
    <div class="mobile-bar-row">
      <div class="mobile-bar-label">
        <span>${label}</span>
        <span>${value} (${percent}%)</span>
      </div>
      <div class="mobile-bar-track">
        <div class="mobile-bar-fill ${fillClass}" style="width:${percent}%"></div>
      </div>
    </div>
  `;
}

function renderPrcBloodGroupChart(rows) {
  const prcRows = (rows || [])
    .filter(r => r.type === "LPRC / LDPRC")
    .sort((a, b) => {
      const order = { "O": 1, "A": 2, "B": 3, "AB": 4 };
      return (order[a.bloodGroup] || 99) - (order[b.bloodGroup] || 99);
    });

  if (!prcRows.length) {
    return `<div class="small-muted">ยังไม่มีข้อมูล LPRC / LDPRC</div>`;
  }

  const maxValue = Math.max(
    ...prcRows.map(r => Math.max(
      Number(r.netAvailable || 0),
      Number(r.forecastUse || 0),
      Number(r.needToCollect || 0)
    )),
    1
  );

  return `
    <div class="group-forecast-grid">
      ${prcRows.map(r => `
        <div class="group-forecast-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="fw-bold fs-5">Group ${r.bloodGroup}</div>
            <div class="group-forecast-note">
              จัดหาเองได้ ${r.lastYearCnmiIn || 0} unit
            </div>
          </div>

          <div class="group-forecast-kpi">
            <div class="group-forecast-item">
              <div class="small-muted">ใช้ได้จริง</div>
              <div class="value">${r.netAvailable || 0}</div>
            </div>
            <div class="group-forecast-item">
              <div class="small-muted">คาดว่าจะใช้</div>
              <div class="value">${r.forecastUse || 0}</div>
            </div>
            <div class="group-forecast-item">
              <div class="small-muted">ควรเติม</div>
              <div class="value">${r.needToCollect || 0}</div>
            </div>
          </div>

          ${renderMiniCompareBar("ใช้ได้จริง", r.netAvailable, maxValue, "fill-cnmi")}
          ${renderMiniCompareBar("คาดว่าจะใช้", r.forecastUse, maxValue, "fill-trc")}
          ${renderMiniCompareBar("ควรเติม", r.needToCollect, maxValue, "fill-high")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderMiniCompareBar(label, value, maxValue, fillClass) {
  const percent = maxValue > 0 ? Math.round((Number(value || 0) / maxValue) * 100) : 0;

  return `
    <div class="mobile-bar-row" style="margin-bottom:8px;">
      <div class="mobile-bar-label small-muted">
        <span>${label}</span>
        <span>${value || 0}</span>
      </div>
      <div class="mobile-bar-track" style="height:10px;">
        <div class="mobile-bar-fill ${fillClass}" style="width:${percent}%"></div>
      </div>
    </div>
  `;
}

    
function renderMobilePlanningRows(rows) {
  if (!rows || rows.length === 0) {
    return `
      <tr>
        <td colspan="8" class="text-center small-muted py-4">
          ยังไม่มีข้อมูล LPRC / LDPRC สำหรับประเมินแผนออกหน่วย
        </td>
      </tr>
    `;
  }

  const orderBlood = {
    "O": 1,
    "A": 2,
    "B": 3,
    "AB": 4
  };

  const sorted = [...rows].sort((a, b) => {
    return (orderBlood[a.bloodGroup] || 99) - (orderBlood[b.bloodGroup] || 99);
  });

  return sorted.map(r => {
    const needToCollect = Number(r.needToCollect || 0);
    const projectedBalance = Number(r.projectedBalance || 0);

    let rowClass = "";
    if (needToCollect > 0) rowClass = "table-warning";
    if (projectedBalance < 0) rowClass = "table-danger";

    return `
      <tr class="${rowClass}">
        <td class="fw-bold">Group ${r.bloodGroup}</td>
        <td class="text-end fw-bold">${r.netAvailable || 0}</td>
        <td class="text-end fw-bold">${r.forecastUse || 0}</td>
        <td class="text-end fw-bold">${r.lastYearCnmiIn || 0}</td>
        <td class="text-end fw-bold">${r.projectedBalance || 0}</td>
        <td class="text-end fw-bold">${r.needToCollect || 0}</td>
        <td class="text-end">${r.cnmi || 0}</td>
        <td class="text-end">${r.trc || 0}</td>
      </tr>
    `;
  }).join("");
}

    async function loadExpiryRisk(days) {
  const holder = document.getElementById("expiryRiskDashboard");
  if (!holder) return;

  const targetDays = Number(days || document.querySelector(".expiry-day-btn.active")?.dataset.days || 7);
  const cachedExpiry = readLightCache(EXPIRY_CACHE_KEY);

  if (cachedExpiry) {
    renderExpiryRisk(cachedExpiry, targetDays);
  } else {
    holder.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลด Expiry Risk...</div>
        <div class="small-muted">ระบบกำลังดึงรายการเลือดใกล้หมดอายุ</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getMobilePlanning({
      selectedDate: getTodayYmd(),
      planDays: 1,
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Expiry Risk ไม่สำเร็จ");
    }

    saveLightCache(EXPIRY_CACHE_KEY, data);
    renderExpiryRisk(data, targetDays);

  } catch (err) {
    holder.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลด Expiry Risk ไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

function setExpiryDays(days) {
  document.querySelectorAll(".expiry-day-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.days) === Number(days));
  });

  loadExpiryRisk(days);
}

function renderExpiryRisk(data, days) {
  const holder = document.getElementById("expiryRiskDashboard");
  if (!holder) return;

  const stockRows = data.stockRows || [];

  const focusRows = stockRows.filter(r => {
    const type = String(r.type || "");
    const daysToExpire = Number(r.daysToExpire);

    const isFocusProduct =
      type === "LPRC / LDPRC" ||
      type === "LDPPC" ||
      type === "SDP" ||
      type === "FFP";

    return isFocusProduct && daysToExpire >= 0 && daysToExpire <= days;
  });

  const redCount = focusRows.filter(r => r.type === "LPRC / LDPRC").length;
  const plateletCount = focusRows.filter(r => r.type === "LDPPC" || r.type === "SDP").length;
  const ffpCount = focusRows.filter(r => r.type === "FFP").length;

  const groupedRows = buildExpiryGroupedRows(focusRows);

  holder.innerHTML = `
    <div class="forecast-hero">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <div class="forecast-pill mb-2">Expiry Risk</div>
          <h1 class="fw-bold mb-2">เลือดใกล้หมดอายุ</h1>
          <div class="small-muted">
            ใช้ดู LPRC / LDPRC, Platelet และ FFP ที่จะหมดอายุในช่วงที่เลือก เพื่อจัดการก่อนเกิด waste
          </div>
        </div>
      </div>

      <div class="plan-button-row">
        ${[1, 3, 5, 7, 14, 30].map(d => `
          <button
            class="plan-btn expiry-day-btn ${Number(days) === d ? "active" : ""}"
            data-days="${d}"
            onclick="setExpiryDays(${d})"
          >
            ${d} วัน
          </button>
        `).join("")}
      </div>
    </div>

    <div class="mobile-kpi-grid">
      <div class="summary-card">
        <div class="small-muted">LPRC / LDPRC</div>
        <div class="fs-3 fw-bold">${redCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">Platelet</div>
        <div class="fs-3 fw-bold">${plateletCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">FFP</div>
        <div class="fs-3 fw-bold">${ffpCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">รวมใน ${days} วัน</div>
        <div class="fs-3 fw-bold">${focusRows.length}</div>
      </div>
    </div>

    <div class="mobile-table-card table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>ความเร่งด่วน</th>
            <th>Product</th>
            <th>Group</th>
            <th class="text-end">จำนวน</th>
            <th class="text-end">หมดอายุเร็วสุด</th>
            <th>ควรทำ</th>
          </tr>
        </thead>
        <tbody>
          ${renderExpiryGroupedRows(groupedRows)}
        </tbody>
      </table>
    </div>
  `;
}

function buildExpiryGroupedRows(rows) {
  const bucket = {};

  rows.forEach(r => {
    const key = `${r.type}||${r.bloodGroup}||${r.daysToExpire}`;

    if (!bucket[key]) {
      bucket[key] = {
        type: r.type,
        bloodGroup: r.bloodGroup,
        daysToExpire: Number(r.daysToExpire),
        count: 0
      };
    }

    bucket[key].count++;
  });

  return Object.values(bucket).sort((a, b) => {
    if (a.daysToExpire !== b.daysToExpire) return a.daysToExpire - b.daysToExpire;
    return String(a.type).localeCompare(String(b.type));
  });
}

function getExpiryUrgency(daysToExpire) {
  const d = Number(daysToExpire);

  if (d <= 1) return "🔴 ด่วนมาก";
  if (d <= 3) return "🟠 ด่วน";
  if (d <= 7) return "🟡 เฝ้าระวัง";
  return "🔵 ติดตาม";
}

function getExpiryActionText(row) {
  const d = Number(row.daysToExpire);

  if (d <= 1) return "เร่งกระจาย / แจ้งหน้างานทันที";
  if (d <= 3) return "จัดลำดับใช้ก่อน และติดตามทุกวัน";
  if (d <= 7) return "เฝ้าระวังและวางแผนใช้ก่อน";
  return "ติดตามตามรอบ";
}

function renderExpiryGroupedRows(rows) {
  if (!rows || rows.length === 0) {
    return `
      <tr>
        <td colspan="6" class="text-center small-muted py-4">
          ไม่มีรายการใกล้หมดอายุในช่วงที่เลือก
        </td>
      </tr>
    `;
  }

  return rows.map(r => `
    <tr>
      <td class="fw-bold">${getExpiryUrgency(r.daysToExpire)}</td>
      <td>
        <span class="mobile-product-badge ${getTypeClass(r.type)}">
          ${r.type}
        </span>
      </td>
      <td class="fw-bold">${r.bloodGroup}</td>
      <td class="text-end fw-bold">${r.count}</td>
      <td class="text-end">${r.daysToExpire} วัน</td>
      <td>${getExpiryActionText(r)}</td>
    </tr>
  `).join("");
}

function scrollToUpload() {
  const uploadBtn = document.querySelector("[onclick=\"showDashboardPage('upload', this)\"]");
  showDashboardPage("upload", uploadBtn);
}

function formatDisplayDateTime(value) {
  if (!value) return "";

  const d = new Date(value);
  if (isNaN(d)) return value;

  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

    function showDashboardPage(page, btn) {
  document.querySelectorAll(".dashboard-page").forEach(el => {
    el.classList.remove("active");
  });

  document.getElementById("page-" + page).classList.add("active");

  document.querySelectorAll(".side-btn").forEach(el => {
    el.classList.remove("active");
  });

  btn.classList.add("active");

  toggleSidebar(false);

  if (page === "mobile") {
  loadMobilePlanning();
}

if (page === "expiry") {
  loadExpiryRisk(7);
}
}

function toggleSidebar(force) {
  const sideMenu = document.getElementById("sideMenu");
  const overlay = document.getElementById("sideOverlay");

  const shouldOpen = force === undefined
    ? !sideMenu.classList.contains("open")
    : force;

  sideMenu.classList.toggle("open", shouldOpen);
  overlay.classList.toggle("show", shouldOpen);
}
