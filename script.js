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
    window.addEventListener("minimumStockAuthReady", () => { loadDashboardOnStart(); loadLisUploadGuide(); handleAppHashRoute(true); });

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

      const lowerName = file.name.toLowerCase();
      const ok = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv");
      if (!ok) {
        showStatus("กรุณาเลือกไฟล์ CSV หรือ Excel จาก LIS", false);
        return;
      }

      selectedFile = file;
      fileName.textContent = file.name;
      uploadBtn.disabled = false;
      showStatus("เลือกไฟล์แล้ว พร้อมอัปโหลด", true);
    }

    async function loadLisUploadGuide() {
      const box = document.getElementById("lisUploadGuide");
      if (!box || !window.MinimumStockBackend?.getLisDataState) return;
      try {
        const state = await MinimumStockBackend.getLisDataState();
        if (state?.baselineEstablished) {
          const latest = state.latestUpload || {};
          box.innerHTML = `
            <div class="upload-rule-badge">ฐานย้อนหลังพร้อมแล้ว</div>
            <div class="fw-bold mt-2">ครั้งต่อไปใช้ไฟล์ LIS ย้อนหลังอย่างน้อย 2 ปี</div>
            <div class="small-muted mt-1">มากกว่า 2 ปีอัปโหลดได้ · ระบบจะอัปเดตถุงเดิมและเพิ่มถุงใหม่ โดยไม่ลบประวัติเก่า</div>
            ${latest.file_name ? `<div class="small-muted mt-2">อัปเดตล่าสุด: <b>${latest.file_name}</b></div>` : ""}
          `;
        } else {
          box.innerHTML = `
            <div class="upload-rule-badge is-baseline">ยังไม่มีฐานย้อนหลัง</div>
            <div class="fw-bold mt-2">ครั้งแรกให้อัปโหลดข้อมูลย้อนหลังทั้งหมด</div>
            <div class="small-muted mt-1">หลังสร้างฐานแล้ว ไฟล์อัปเดตต้องครอบคลุมย้อนหลังอย่างน้อย 2 ปี</div>
          `;
        }
      } catch (err) {
        box.innerHTML = `<div class="small-muted">ยังอ่านสถานะฐาน LIS ไม่ได้: ${err.message}</div>`;
      }
    }

    uploadBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = "กำลังตรวจสอบไฟล์...";
      showStatus("กำลังตรวจสอบคอลัมน์ BagNumber, Status, DonateSource และวันที่ก่อนคำนวณ", true);
      loadingBox.style.display = "block";
      dashboard.style.display = "none";

      try {
        await MinimumStockBackend.ensureOutreachSchema();
        const preflight = await MinimumStockBackend.preflightOutreachFile(selectedFile);
        const validation = preflight.validation || {};

        if (!preflight.ok || validation.blocking) {
          const coverageMessage = validation.uploadCoverage && !validation.uploadCoverage.ok ? validation.uploadCoverage.message : "";
          const missing = (validation.missingHeaders || []).join(", ");
          throw new Error(coverageMessage || (missing ? `ไฟล์ขาดคอลัมน์สำคัญ: ${missing}` : "ไฟล์นี้ยังไม่ผ่านการตรวจสอบ"));
        }

        if (Number(validation.issueCount || 0) > 0) {
          const previewIssues = (validation.issues || []).slice(0, 6).map(item => "• " + item.message).join("\n");
          const moreText = Number(validation.issueCount || 0) > 6 ? `\n• และอีก ${Number(validation.issueCount) - 6} รายการ` : "";
          const ok = await showConfirmModal(
            "มีข้อมูลบางรายการต้องตรวจสอบ",
            `พบ ${validation.issueCount} รายการที่ระบบไม่ควรเดาเอง\n` +
            `DonateSource ต้องตรวจ ${validation.unknownSourceCount || 0} · แหล่งรับเข้าขัดแย้ง ${validation.sourceConflictCount || 0} · ผลลัพธ์ขัดแย้ง ${validation.outcomeConflictCount || 0} · วันที่ผิด ${validation.invalidDateCount || 0}\n\n` +
            `${previewIssues}${moreText}\n\n` +
            "รายการเหล่านี้จะถูกกันออกจาก KPI จนกว่าจะตรวจสอบ ส่วน BagNumber ที่แตกหลาย ProductType ถือเป็นข้อมูลปกติ ต้องการอัปเดตต่อหรือไม่?"
          );
          if (!ok) {
            showStatus("ยกเลิกการอัปโหลด ข้อมูลเดิมใน Supabase ยังไม่ถูกล้าง", true);
            return;
          }
        }

        uploadBtn.textContent = "กำลังเตรียมอัปเดตข้อมูล...";
        showStatus("ตรวจไฟล์ผ่านแล้ว กำลังอัปเดตฐานย้อนหลังและ Dashboard", true);

        // v2.6.2 ไม่ล้างข้อมูลเดิมก่อนเริ่ม เพื่อป้องกันข้อมูลหายถ้าไฟล์ใหม่หรืออินเทอร์เน็ตมีปัญหาระหว่างอัปโหลด
        clearMinimumStockLocalCaches({ keepVersion: true });
        currentOutreachAnalysisData = null;

        uploadBtn.textContent = "กำลังอ่านไฟล์และคำนวณ...";
        showStatus("กำลังคำนวณ Minimum Stock และเตรียมข้อมูลวิเคราะห์จากไฟล์ LIS ชุดใหม่ โดยข้อมูลเดิมยังใช้งานได้จนกว่าจะบันทึกสำเร็จ", true);

        const data = await MinimumStockBackend.uploadExcel(selectedFile, {
          gasWebAppUrl: WEB_APP_URL,
          onProgress: progress => {
            if (!progress) return;
            if (progress.message) showStatus(progress.message, true);
            if (progress.stage === "outreach-save") uploadBtn.textContent = "กำลังเตรียมข้อมูล LIS...";
            if (progress.stage === "outreach-merge") uploadBtn.textContent = "กำลังอัปเดตฐาน LIS...";
            if (progress.stage === "snapshot") uploadBtn.textContent = "กำลังอัปเดต Dashboard...";
          }
        });

        if (!data.ok) {
          throw new Error(data.message || "อัปโหลดไม่สำเร็จ");
        }

        // หลังบันทึกสำเร็จ ให้ล้าง cache ของ Dashboard แล้วอ่าน snapshot ล่าสุด
        clearMinimumStockLocalCaches({ keepVersion: true });
        uploadBtn.textContent = "กำลังโหลดข้อมูลล่าสุดจาก Supabase...";
        showStatus("บันทึกสำเร็จ กำลังโหลด snapshot ล่าสุดจาก Supabase", true);

        const refreshedData = await MinimumStockBackend.getDashboard({
          gasWebAppUrl: WEB_APP_URL,
          forceRefresh: true
        });

        if (!refreshedData || !refreshedData.ok) {
          throw new Error((refreshedData && refreshedData.message) || "โหลด snapshot ล่าสุดหลังอัปโหลดไม่สำเร็จ");
        }

        showStatus("✅ คำนวณและโหลดข้อมูลล่าสุดสำเร็จ: " + refreshedData.fileName, true);
        saveDashboardCache(refreshedData);
        renderDashboard(refreshedData);

        if (document.getElementById("page-mobile")?.classList.contains("active")) {
          loadMobilePlanning();
        }
        if (document.getElementById("page-outreach")?.classList.contains("active")) {
          loadOutreachAnalysis(true);
        }

        const reviewText = Number(validation.issueCount || 0) > 0 ? ` | มี ${validation.issueCount} รายการให้ตรวจสอบในเมนูวิเคราะห์ออกหน่วย` : "";
        await loadLisUploadGuide();
        showModal("success", "อัปเดตข้อมูลแล้ว", `อ่านข้อมูล ${refreshedData.totalRows} รายการ และอัปเดต Dashboard สำเร็จ${reviewText}`);

      } catch (err) {
        showStatus("❌ " + err.message, false);
        showModal("error", "ไม่สำเร็จ", err.message);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "อัปเดตข้อมูลจาก LIS";
        loadingBox.style.display = "none";
      }
    });

    function currentUserCanClearDatabase() {
      const access = window.MinimumStockAccess || {};
      return Boolean(access.authenticated && access.active && String(access.role || "").toLowerCase() === "admin");
    }

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", async () => {
        // v2.9.32: UI guard เป็นเพียงชั้นแรก ฐานข้อมูลตรวจสิทธิ์ Admin ซ้ำอีกครั้ง
        if (!currentUserCanClearDatabase()) {
          showModal("error", "ไม่มีสิทธิ์ล้างฐานข้อมูล", "การล้างฐานข้อมูลอนุญาตเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น");
          return;
        }

        const firstConfirm = await showConfirmModal(
          "⚠️ ล้างฐานข้อมูลทั้งหมด?",
          "การดำเนินการนี้จะลบ Dashboard และฐานประวัติ LIS ทั้งหมดที่ใช้วิเคราะห์ในแอป\n\nหลังลบแล้วต้องนำไฟล์ LIS ย้อนหลังทั้งหมดมาอัปโหลดสร้างฐานใหม่อีกครั้ง",
          { confirmText: "ตรวจสอบต่อ", danger: true }
        );
        if (!firstConfirm) return;

        const finalConfirm = await showConfirmModal(
          "ยืนยันครั้งสุดท้าย",
          "ข้อมูลที่ลบไม่สามารถกู้คืนจากหน้าแอปได้\n\nยืนยันว่าต้องการล้างฐานข้อมูลทั้งหมดจริงหรือไม่?",
          { confirmText: "ลบฐานข้อมูลทั้งหมด", danger: true }
        );
        if (!finalConfirm) return;

        // เช็ก role ซ้ำทันที ก่อนยิงคำสั่ง destructive เผื่อ session/สิทธิ์เปลี่ยนระหว่างเปิด modal
        if (!currentUserCanClearDatabase()) {
          showModal("error", "สิทธิ์ผู้ใช้เปลี่ยนแปลง", "ไม่สามารถล้างฐานข้อมูลได้ กรุณาเข้าสู่ระบบด้วยบัญชี Admin");
          return;
        }

        clearDataBtn.disabled = true;
        clearDataBtn.textContent = "กำลังล้างข้อมูล...";
        showStatus("กำลังล้างข้อมูลเดิมในระบบ", true);

        try {
          if (!MinimumStockBackend.adminClearAllData) {
            throw new Error("ยังไม่ได้อัปเดตระบบล้างฐานแบบ Admin-only v2.9.32");
          }
          await MinimumStockBackend.adminClearAllData();
          clearMinimumStockLocalCaches({ keepVersion: true });
          currentDashboardData = null;
          currentMobilePlanningData = null;
          currentOutreachAnalysisData = null;
          currentOutreachFilteredRows = [];
          currentOutreachSourceSummary = [];
          renderEmptyDashboardAfterClear();
          if (document.getElementById("page-outreach")?.classList.contains("active")) {
            renderOutreachAnalysis();
          }
          showStatus("✅ ล้างข้อมูลเดิมแล้ว พร้อมอัปโหลดไฟล์ใหม่", true);
          showModal("success", "ล้างฐานข้อมูลแล้ว", "ล้าง Dashboard และฐานประวัติ LIS แล้ว ครั้งถัดไปต้องอัปโหลดข้อมูลย้อนหลังทั้งหมดเป็นฐานใหม่");
          await loadLisUploadGuide();
        } catch (err) {
          showStatus("❌ " + err.message, false);
          showModal("error", "ล้างข้อมูลไม่สำเร็จ", err.message);
        } finally {
          clearDataBtn.disabled = false;
          clearDataBtn.textContent = "ล้างฐานข้อมูลทั้งหมด";
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
let currentOutreachAnalysisData = null;
let currentOutreachFilteredRows = [];
let currentOutreachSourceSummary = [];
let currentOutreachTrendYear = new Date().getFullYear();
let currentOutreachTrendData = null;
let currentBloodKpiData = null;
let currentTrcRareData = null;
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260923-v2-9-72-kpi-menu-labels";
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
        <div class="small-muted mb-3">ล้างข้อมูลเดิมแล้ว กรุณาอัปโหลดไฟล์ CSV/Excel ใหม่เพื่อเริ่มคำนวณรอบล่าสุด</div>
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
  const totalNet = results.reduce((sum, r) => sum + Number(r.netAvailable || 0), 0);
  const needItems = results.filter(r => ["critical", "warning"].includes(String(r.alertLevel || "").toLowerCase()));
  const overstockItems = results.filter(r => String(r.alertLevel || "").toLowerCase() === "overstock");
  const normalItems = Math.max(0, results.length - needItems.length - overstockItems.length);
  const topDashboard = document.getElementById("topDashboard");

  topDashboard.innerHTML = `
    <div class="simple-page-head">
      <div>
        <div class="page-kicker">STOCK TODAY</div>
        <h1>สต๊อกที่ควรมีวันนี้</h1>
        <div class="page-subline">อัปเดต ${formatDisplayDateTime(data.calculatedAt) || "-"} · ${escapeOutreachHtml(data.fileName || "-")}</div>
      </div>
      <button class="btn btn-main no-print" onclick="scrollToUpload()">อัปเดต LIS</button>
    </div>

    <div class="simple-kpi-grid">
      <div class="simple-kpi is-alert"><span>ควรเติม</span><strong>${needItems.length}</strong><small>รายการ</small></div>
      <div class="simple-kpi is-good"><span>อยู่ในเกณฑ์</span><strong>${normalItems}</strong><small>รายการ</small></div>
      <div class="simple-kpi"><span>ใช้ได้จริงรวม</span><strong>${totalNet.toLocaleString()}</strong><small>unit</small></div>
      <div class="simple-kpi"><span>เป้าขั้นต่ำรวม</span><strong>${totalMin.toLocaleString()}</strong><small>unit</small></div>
    </div>

    ${needItems.length ? `
      <div class="attention-strip">
        <div><strong>ต้องดู ${needItems.length} รายการ</strong><span> ${needItems.slice(0,4).map(r => `${r.type} ${r.bloodGroup}`).join(" · ")}${needItems.length > 4 ? " …" : ""}</span></div>
      </div>` : `
      <div class="attention-strip is-ok"><strong>สต๊อกหลักอยู่ในเกณฑ์</strong><span> ยังไม่มีรายการที่ต้องเติมเร่งด่วน</span></div>`}

    <div class="tab-scroll simple-tabs">
      ${["LPRC / LDPRC", "FFP", "LDPPC", "Cryo", "SDP"].map(type => `
        <button class="tab-btn ${type === currentTab ? "active" : ""}" onclick="changeTab('${type}')">${type}</button>
      `).join("")}
    </div>
    <div id="tabContent"></div>

    ${overstockItems.length ? `<details class="simple-details mt-3"><summary>ดูรายการที่ stock สูงมาก (${overstockItems.length})</summary><div class="pt-3">${renderPriorityList(overstockItems, "ไม่มีรายการ")}</div></details>` : ""}
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

function showConfirmModal(title, message, options = {}) {
  return new Promise((resolve) => {
    // Resolve confirmation elements only when the modal is used.
    // This prevents stale/null references if script.js is evaluated before
    // the confirm modal markup has finished parsing or when a cached HTML
    // shell and a newer script are briefly mixed during deployment.
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");

    if (!overlay || !titleEl || !messageEl || !okBtn || !cancelBtn) {
      console.error("Confirmation modal elements are missing from the DOM");
      resolve(window.confirm(`${title || "ยืนยัน"}\n\n${String(message || "")}`));
      return;
    }

    titleEl.textContent = title || "ยืนยัน";
    messageEl.textContent = String(message || "");
    messageEl.style.whiteSpace = "pre-line";
    okBtn.textContent = options.confirmText || "ตกลง";
    okBtn.className = options.danger ? "btn btn-danger" : "btn btn-main";
    okBtn.style.minWidth = "120px";
    overlay.style.display = "flex";

    const cleanup = (result) => {
      overlay.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
      okBtn.textContent = "ตกลง";
      okBtn.className = "btn btn-main";
      okBtn.style.minWidth = "120px";
      resolve(result);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
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

  const statusText = r => {
    const level = String(r.alertLevel || "").toLowerCase();
    if (level === "critical") return "เติมด่วน";
    if (level === "warning") return "ควรเติม";
    if (level === "overstock") return "สูงกว่าปกติ";
    if (level === "watch") return "เฝ้าระวัง";
    return "พอดี";
  };

  tabContent.innerHTML = `
    <div class="simple-table-card desktop-stock-table">
      <table class="table align-middle mb-0 simple-table">
        <thead><tr><th>หมู่เลือด</th><th class="text-end">ควรมี</th><th class="text-end">ใช้ได้จริง</th><th class="text-end">ขาด / เกิน</th><th>สถานะ</th></tr></thead>
        <tbody>${filtered.map(r => `
          <tr>
            <td class="fw-bold fs-5">${r.bloodGroup}</td>
            <td class="text-end">${r.minimumStock ?? 0}</td>
            <td class="text-end fw-bold">${r.netAvailable ?? 0}</td>
            <td class="text-end fw-bold ${Number(r.gap || 0) < 0 ? "text-danger" : ""}">${Number(r.gap || 0) > 0 ? "+" : ""}${r.gap ?? 0}</td>
            <td><span class="action-pill ${getAlertClass(r.alertLevel)}">${statusText(r)}</span></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>

    <div class="mobile-stock-cards simple-mobile-cards">
      ${filtered.map(r => `
        <div class="stock-mobile-card">
          <div class="stock-mobile-head"><div class="fs-3 fw-bold">Group ${r.bloodGroup}</div><span class="action-pill ${getAlertClass(r.alertLevel)}">${statusText(r)}</span></div>
          <div class="stock-mobile-grid simple-4-grid">
            <div class="stock-mobile-item"><div class="stock-mobile-label">ควรมี</div><div class="stock-mobile-value">${r.minimumStock ?? 0}</div></div>
            <div class="stock-mobile-item"><div class="stock-mobile-label">ใช้ได้จริง</div><div class="stock-mobile-value">${r.netAvailable ?? 0}</div></div>
            <div class="stock-mobile-item"><div class="stock-mobile-label">ขาด/เกิน</div><div class="stock-mobile-value">${Number(r.gap || 0) > 0 ? "+" : ""}${r.gap ?? 0}</div></div>
            <div class="stock-mobile-item"><div class="stock-mobile-label">พร้อมใช้</div><div class="stock-mobile-value">${r.available ?? 0}</div></div>
          </div>
        </div>`).join("")}
    </div>

    <details class="simple-details mt-3">
      <summary>ดูรายละเอียดวิธีนับ ${currentTab}</summary>
      <div class="small-muted pt-3 pb-2">พร้อมใช้ = Available ที่ Blood Bank · คล้องผู้ป่วย = ReadyToIssue · ถุงย่อย .S1/.S2 ไม่รวม standard unit</div>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0 technical-table">
          <thead><tr><th>Group</th><th>Minimum</th><th>พร้อมใช้</th><th>LR</th><th>Patient</th><th>รอตรวจ</th><th>คล้องผู้ป่วย</th><th>S ไม่รวม</th><th>อื่น/ไม่รวม</th><th>ใช้ได้จริง</th></tr></thead>
          <tbody>${filtered.map(r => `<tr><td><b>${r.bloodGroup}</b></td><td>${r.minimumStock ?? 0}</td><td>${r.available ?? 0}</td><td>${r.lrSpare ?? 0}</td><td>${r.patientManual ?? 0}</td><td>${r.pendingScreening ?? 0}</td><td>${r.readyToIssue ?? 0}</td><td>${r.splitSubunitExcluded ?? 0}</td><td>${r.excludedOtherLocation ?? 0}</td><td><b>${r.netAvailable ?? 0}</b></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </details>
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
  const decision = getMobilePlanningDecision(decisionBase);
  const riskText = Array.isArray(decisionBase.riskGroups) && decisionBase.riskGroups.length ? decisionBase.riskGroups.join(", ") : "ไม่มี";

  holder.innerHTML = `
    <div class="simple-page-head">
      <div>
        <div class="page-kicker">MOBILE PLAN</div>
        <h1>ควรออกหน่วยเพิ่มไหม?</h1>
        <div class="page-subline">เลือกวันที่ แล้วระบบเทียบ stock กับการใช้ย้อนหลังให้</div>
      </div>
      <div class="date-action-box">
        <input id="mobilePlanDate" type="date" class="mobile-date-input" value="${targetMobileDate}" />
        <button class="btn btn-main" onclick="loadMobilePlanning()">คำนวณ</button>
      </div>
    </div>

    <div class="decision-card ${decision.level}">
      <div class="decision-icon">${decision.icon}</div>
      <div><div class="decision-label">คำแนะนำสำหรับอีก ${planDays} วัน</div><h2>${decision.title}</h2><div class="decision-meta">หมู่ที่เสี่ยง: <b>${riskText}</b></div></div>
    </div>

    <div class="simple-kpi-grid">
      <div class="simple-kpi"><span>คาดว่าจะใช้</span><strong>${decisionBase.totalForecastUse || 0}</strong><small>unit</small></div>
      <div class="simple-kpi"><span>คาดว่าหาเองได้</span><strong>${decisionBase.totalExpectedCnmiIn || 0}</strong><small>unit</small></div>
      <div class="simple-kpi"><span>คาดว่าจะเหลือ</span><strong>${decisionBase.totalProjectedBalance || 0}</strong><small>unit</small></div>
      <div class="simple-kpi ${Number(decisionBase.totalNeedToCollect || 0)>0?"is-alert":"is-good"}"><span>ควรหาเพิ่ม</span><strong>${decisionBase.totalNeedToCollect || 0}</strong><small>unit</small></div>
    </div>

    <div class="group-forecast-grid simple-group-grid">
      ${prcRows.sort((a,b)=>({O:1,A:2,B:3,AB:4}[a.bloodGroup]||9)-({O:1,A:2,B:3,AB:4}[b.bloodGroup]||9)).map(r => `
        <div class="group-forecast-card ${Number(r.needToCollect||0)>0?"needs-fill":""}">
          <div class="group-card-title"><strong>Group ${r.bloodGroup}</strong><span>${Number(r.needToCollect||0)>0?`ควรหาเพิ่ม ${r.needToCollect}`:"พอใช้"}</span></div>
          <div class="group-forecast-kpi">
            <div class="group-forecast-item"><div class="small-muted">มีตอนนี้</div><div class="value">${r.netAvailable || 0}</div></div>
            <div class="group-forecast-item"><div class="small-muted">คาดว่าใช้</div><div class="value">${r.forecastUse || 0}</div></div>
            <div class="group-forecast-item"><div class="small-muted">หาเองได้</div><div class="value">${r.lastYearCnmiIn || 0}</div></div>
          </div>
        </div>`).join("")}
    </div>

    <details class="simple-details mt-3">
      <summary>ดูวิธีคำนวณและตารางละเอียด</summary>
      <div class="pt-3 small-muted mb-2">ใช้ stock ปัจจุบัน + การใช้ย้อนหลัง + การจัดหาเองช่วงเดียวกันปีก่อน เพื่อช่วยวางแผน ไม่ได้แทนการตัดสินใจหน้างาน</div>
      <div class="table-responsive"><table class="table table-sm align-middle mb-0 technical-table"><thead><tr><th>Group</th><th>ใช้ได้ตอนนี้</th><th>คาดว่าจะใช้</th><th>หาได้เอง</th><th>คาดว่าจะเหลือ</th><th>ควรออกเพิ่ม</th><th>CNMI</th><th>TRC</th></tr></thead><tbody>${renderMobilePlanningRows(prcRows)}</tbody></table></div>
    </details>
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
  const eligible = stockRows.filter(r => {
    const type = String(r.type || "");
    const d = Number(r.daysToExpire);
    return ["LPRC / LDPRC", "LDPPC", "SDP", "FFP"].includes(type) && d >= 0;
  });
  const focusRows = eligible.filter(r => Number(r.daysToExpire) <= Number(days || 7));
  const within1 = eligible.filter(r => Number(r.daysToExpire) <= 1).length;
  const within3 = eligible.filter(r => Number(r.daysToExpire) <= 3).length;
  const within7 = eligible.filter(r => Number(r.daysToExpire) <= 7).length;
  const groupedRows = buildExpiryGroupedRows(focusRows);

  holder.innerHTML = `
    <div class="simple-page-head">
      <div>
        <h1>ควรใช้ถุงไหนก่อน?</h1>
        <div class="page-subline">หน้านี้ใช้ดูเลือดที่กำลังหมดอายุ เพื่อช่วยจัดลำดับใช้ก่อนและลดการทิ้ง</div>
      </div>
    </div>

    <div class="purpose-card mb-3">
      <div class="purpose-icon">◷</div>
      <div><strong>วิธีใช้หน้านี้</strong><span>เลือกช่วงวัน แล้วดูรายการบนสุดก่อน ยิ่งเหลือวันน้อยยิ่งควรจัดลำดับใช้ก่อน</span></div>
    </div>

    <div class="simple-kpi-grid expiry-quick-grid">
      <div class="simple-kpi ${within1 ? "is-alert" : "is-good"}"><span>ภายใน 1 วัน</span><strong>${within1}</strong><small>รายการ</small></div>
      <div class="simple-kpi ${within3 ? "is-alert" : ""}"><span>ภายใน 3 วัน</span><strong>${within3}</strong><small>รายการ</small></div>
      <div class="simple-kpi"><span>ภายใน 7 วัน</span><strong>${within7}</strong><small>รายการ</small></div>
    </div>

    <div class="choice-row mb-3">
      <span class="choice-label">แสดงรายการที่จะหมดอายุภายใน</span>
      ${[1,3,5,7,14,30].map(d => `<button class="plan-btn expiry-day-btn ${Number(days)===d?"active":""}" data-days="${d}" onclick="setExpiryDays(${d})">${d} วัน</button>`).join("")}
    </div>

    ${focusRows.length ? `
      <div class="simple-table-card table-responsive">
        <div class="table-card-head">
          <div><h3>${focusRows.length.toLocaleString()} รายการที่ควรติดตาม</h3><p>เรียงจากหมดอายุเร็วที่สุด</p></div>
        </div>
        <table class="table align-middle mb-0 simple-table">
          <thead><tr><th>ความเร่งด่วน</th><th>ผลิตภัณฑ์ / หมู่เลือด</th><th class="text-end">จำนวน</th><th class="text-end">เหลือ</th><th>แนะนำ</th></tr></thead>
          <tbody>${renderExpiryGroupedRowsSimple(groupedRows)}</tbody>
        </table>
      </div>` : `
      <div class="empty-state-card"><div class="empty-icon">✓</div><h3>ยังไม่มีรายการใกล้หมดอายุ</h3><p>ในช่วง ${days} วันที่เลือก</p></div>`}
  `;
}

function renderExpiryGroupedRowsSimple(rows) {
  if (!rows || !rows.length) return `<tr><td colspan="5" class="text-center small-muted py-4">ไม่มีรายการ</td></tr>`;
  return rows.map(r => `
    <tr>
      <td class="fw-bold">${getExpiryUrgency(r.daysToExpire)}</td>
      <td><span class="mobile-product-badge ${getTypeClass(r.type)}">${r.type}</span> <b>${r.bloodGroup}</b></td>
      <td class="text-end fw-bold">${r.count}</td>
      <td class="text-end">${r.daysToExpire} วัน</td>
      <td>${getExpiryActionText(r)}</td>
    </tr>`).join("");
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


/* ---------------- Outreach blood bag outcome analysis v2.7.1 ---------------- */
const OUTREACH_USED = "ใช้ / จ่าย / ส่งต่อ";
const OUTREACH_EXPIRED = "หมดอายุ";
const OUTREACH_REJECTED = "ไม่เหมาะสมต่อการใช้ (Rejected)";
const OUTREACH_OTHER_DISCARD = "ทำลายด้วยเหตุอื่น";
const OUTREACH_TRANSFORMED = "แปรรูป (ขั้นตอนกลาง)";
const OUTREACH_UNKNOWN = "ยังอยู่ในคลัง/ยังไม่มีผลปลายทาง";
const OUTREACH_CONFLICT = "ข้อมูลขัดแย้ง ต้องตรวจสอบ";
const OUTREACH_GROUP_SELF_INHOUSE = "หาเอง – รับบริจาคในโรงพยาบาล";
const OUTREACH_GROUP_SELF_OUTREACH = "หาเอง – ออกหน่วย";
const OUTREACH_GROUP_TRC = "กาชาดไทย";
const OUTREACH_GROUP_OTHER_HOSPITAL = "รับจากโรงพยาบาลอื่น";
let outreachDetailPage = 1;
let outreachDetailSourceIndex = -1;
let outreachRequestSeq = 0;
let outreachExportBusy = false;

function escapeOutreachHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function outreachPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator || 0) / Number(denominator || 1)) * 100).toFixed(1));
}

function renderSelectOptions(values, selectedValue, allLabel) {
  return `<option value="">${escapeOutreachHtml(allLabel)}</option>` +
    (values || []).map(value => `<option value="${escapeOutreachHtml(value)}" ${String(selectedValue || "") === value ? "selected" : ""}>${escapeOutreachHtml(value)}</option>`).join("");
}

function effectiveOutreachOutcomeCode(row) {
  const status = String(row?.status || "").trim();
  const code = String(row?.outcomeCode || "").trim();
  if (status === "Released" || status === "Dedicated") return "used";
  if (status === "Rejected") return "rejected";
  if (status === "Expired") return "expired";
  if (status === "Be Transformed") return "transformed";
  if (["Destroyed", "Discarded", "Disposed"].includes(status)) return "other_discard";
  if (code === "destroyed") return "other_discard"; // legacy master row
  return code || "unresolved";
}

function outcomeLabel(code) {
  if (code === "used") return OUTREACH_USED;
  if (code === "expired") return OUTREACH_EXPIRED;
  if (code === "rejected") return OUTREACH_REJECTED;
  if (code === "other_discard") return OUTREACH_OTHER_DISCARD;
  if (code === "destroyed") return OUTREACH_OTHER_DISCARD;
  if (code === "transformed") return OUTREACH_TRANSFORMED;
  if (code === "conflict") return OUTREACH_CONFLICT;
  return OUTREACH_UNKNOWN;
}

function outcomeLabelForRow(row) {
  const status = String(row?.status || "");
  if (status === "Dedicated") return "ส่งต่อให้ รพ.อื่น (Dedicated)";
  return outcomeLabel(effectiveOutreachOutcomeCode(row));
}

function normalizeOutreachSourceSummary(raw) {
  return (raw || []).map(item => {
    const received = Number(item.received || 0);
    const expired = Number(item.expired ?? item.destroyed ?? 0);
    const rejected = Number(item.rejected || 0);
    const otherDiscarded = Number(item.other_discarded || item.otherDiscarded || 0);
    const legacyTransformed = Number(item.transformed || 0);
    return {
      sourceGroup: item.source_group || item.sourceGroup || "",
      donateSource: item.donate_source || item.donateSource || "",
      received,
      uniqueBags: Number(item.unique_bags || item.uniqueBags || 0),
      used: Number(item.used || 0),
      dedicated: Number(item.dedicated || 0),
      expired,
      rejected,
      otherDiscarded,
      transformed: 0,
      unresolved: Number(item.unresolved || 0) + legacyTransformed,
      conflicts: Number(item.conflicts || 0),
      usePercent: outreachPercent(item.used, received),
      expiredPercent: outreachPercent(expired, received)
    };
  });
}

function normalizeOutreachGroupSummary(raw) {
  return (raw || []).map(item => {
    const legacyTransformed = Number(item.transformed || 0);
    return {
      sourceGroup: item.source_group || item.sourceGroup || "",
      received: Number(item.received || 0),
      used: Number(item.used || 0),
      dedicated: Number(item.dedicated || 0),
      expired: Number(item.expired ?? item.destroyed ?? 0),
      rejected: Number(item.rejected || 0),
      otherDiscarded: Number(item.other_discarded || item.otherDiscarded || 0),
      transformed: 0,
      unresolved: Number(item.unresolved || 0) + legacyTransformed,
      conflicts: Number(item.conflicts || 0)
    };
  });
}

function normalizeOutreachSummary(raw = {}) {
  const received = Number(raw.received || 0);
  const expired = Number(raw.expired ?? raw.destroyed ?? 0);
  const rejected = Number(raw.rejected || 0);
  const otherDiscarded = Number(raw.other_discarded || raw.otherDiscarded || 0);
  const legacyTransformed = Number(raw.transformed || 0);
  return {
    received,
    uniqueBags: Number(raw.unique_bags || raw.uniqueBags || 0),
    selfInhouse: Number(raw.self_inhouse || raw.selfInhouse || 0),
    selfOutreach: Number(raw.self_outreach || raw.selfOutreach || 0),
    trc: Number(raw.trc || 0),
    otherHospital: Number(raw.other_hospital || raw.otherHospital || 0),
    used: Number(raw.used || 0),
    dedicated: Number(raw.dedicated || 0),
    expired,
    rejected,
    otherDiscarded,
    transformed: 0,
    unresolved: Number(raw.unresolved || 0) + legacyTransformed,
    conflicts: Number(raw.conflicts || 0),
    usePercent: outreachPercent(raw.used, received),
    expiredPercent: outreachPercent(expired, received)
  };
}

async function loadOutreachAnalysis(forceRefresh = false) {
  const container = document.getElementById("outreachOutcomeDashboard");
  if (!container) return;

  container.innerHTML = `
    <div class="hero-card mt-4">
      <div class="fw-bold">กำลังเตรียมตัวกรองผลถุงเลือด...</div>
      <div class="small-muted mt-1">ระบบจะยังไม่คำนวณรายงานจนกว่าจะเลือกช่วงข้อมูลแล้วกด “แสดงผล”</div>
    </div>`;

  try {
    const data = await MinimumStockBackend.getOutreachFilterBootstrap();
    currentOutreachAnalysisData = data;
    currentOutreachSourceSummary = [];
    currentOutreachTrendData = null;
    renderOutreachAnalysis();
  } catch (err) {
    const message = String(err?.message || err || "");
    container.innerHTML = `
      <div class="hero-card mt-4 outreach-error-card">
        <h4 class="fw-bold mb-2">เปิดตัวกรองผลถุงเลือดไม่ได้</h4>
        <div class="small-muted mb-3">${escapeOutreachHtml(message)}</div>
        <button class="btn btn-main" type="button" onclick="loadOutreachAnalysis(true)">ลองใหม่</button>
      </div>`;
  }
}

function renderProductMultiSelect(products, selectedProducts) {
  const selected = Array.isArray(selectedProducts) ? Array.from(new Set(selectedProducts)) : [];
  const selectedSet = new Set(selected);
  const label = selected.length === 0 ? "กรุณาเลือก" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} ชนิด`;
  const preview = selected.length
    ? selected.slice(0, 3).map(product => `<span>${escapeOutreachHtml(product)}</span>`).join("") + (selected.length > 3 ? `<span>+${selected.length - 3}</span>` : "")
    : `<span class="is-placeholder">ยังไม่ได้เลือกเฉพาะชนิด</span>`;
  return `
    <details class="product-multi-select" id="outreachProductPicker" ontoggle="handleOutreachProductPickerToggle(this)">
      <summary>
        <span class="product-picker-label">ชนิดผลิตภัณฑ์</span>
        <strong id="outreachProductLabel">${escapeOutreachHtml(label)}</strong>
        <span class="product-picker-chevron" aria-hidden="true">⌄</span>
      </summary>
      <button class="product-multi-backdrop" type="button" aria-label="ปิดตัวเลือกผลิตภัณฑ์" onclick="cancelOutreachProductSelection()"></button>
      <div class="product-multi-menu" role="dialog" aria-modal="true" aria-label="เลือกชนิดผลิตภัณฑ์">
        <div class="product-multi-head">
          <div>
            <strong>เลือกผลิตภัณฑ์</strong>
            <span id="outreachProductDraftCount">${selected.length ? `เลือกแล้ว ${selected.length} รายการ` : "ยังไม่ได้จำกัดชนิด"}</span>
          </div>
          <button type="button" class="product-picker-close" aria-label="ยกเลิกและปิด" onclick="cancelOutreachProductSelection()">×</button>
        </div>

        <div class="product-selection-preview" id="outreachProductPreview">${preview}</div>

        <div class="product-multi-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input id="outreachProductSearch" class="product-multi-search" type="search" placeholder="ค้นหาชื่อผลิตภัณฑ์" autocomplete="off" oninput="filterOutreachProductOptions(this.value)" />
        </div>

        <div class="product-multi-actions">
          <button type="button" onclick="setAllOutreachProducts(true)">เลือกทั้งหมด</button>
          <button type="button" onclick="setAllOutreachProducts(false)">ล้างทั้งหมด</button>
        </div>

        <div class="product-multi-list" id="outreachProductList">
          ${(products || []).map((product) => `
            <label class="product-check-row" data-product-search="${escapeOutreachHtml(String(product).toLowerCase())}">
              <input class="outreach-product-check" type="checkbox" value="${escapeOutreachHtml(product)}" ${selectedSet.has(product) ? "checked" : ""} onchange="handleOutreachProductChange()" />
              <span>${escapeOutreachHtml(product)}</span>
            </label>`).join("")}
          <div class="product-search-empty" id="outreachProductSearchEmpty" hidden>ไม่พบผลิตภัณฑ์ที่ค้นหา</div>
        </div>

        <div class="product-multi-footer">
          <button type="button" class="btn-product-cancel" onclick="cancelOutreachProductSelection()">ยกเลิก</button>
          <button type="button" class="btn-product-apply" id="outreachProductApply" onclick="commitOutreachProductSelection()">ใช้ตัวกรอง${selected.length ? ` (${selected.length})` : ""}</button>
        </div>
      </div>
    </details>`;
}


const outreachMultiFilterConfig = {
  sourceGroup: { label: "กลุ่มแหล่งรับเข้า", allLabel: "ทั้งหมด" },
  source: { label: "จุดออกหน่วย / แหล่งรับเข้า", allLabel: "ทุกจุด" },
  bloodGroup: { label: "หมู่เลือด", allLabel: "ทุกหมู่" },
  rh: { label: "Rh", allLabel: "ทุก Rh" }
};
const outreachMultiFilterSnapshots = {};

function normalizeOutreachSelectedValues(values) {
  return Array.from(new Set((Array.isArray(values) ? values : values ? [values] : [])
    .map(value => String(value || "").trim())
    .filter(Boolean)));
}

function renderOutreachMultiSelect(key, label, options, selectedValues, allLabel) {
  const selected = normalizeOutreachSelectedValues(selectedValues);
  const selectedSet = new Set(selected);
  const safeKey = String(key || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const summary = selected.length === 0 ? "กรุณาเลือก" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} รายการ`;
  return `
    <details class="filter-multi-select" id="outreachMultiPicker-${safeKey}" ontoggle="handleOutreachMultiPickerToggle(this,'${safeKey}')">
      <summary>
        <span class="product-picker-label">${escapeOutreachHtml(label)}</span>
        <strong id="outreachMultiLabel-${safeKey}">${escapeOutreachHtml(summary)}</strong>
        <span class="product-picker-chevron" aria-hidden="true">⌄</span>
      </summary>
      <button class="product-multi-backdrop" type="button" aria-label="ปิดตัวเลือก" onclick="cancelOutreachMultiSelection('${safeKey}')"></button>
      <div class="product-multi-menu" role="dialog" aria-modal="true" aria-label="${escapeOutreachHtml(label)}">
        <div class="product-multi-head">
          <div>
            <strong>${escapeOutreachHtml(label)}</strong>
            <span id="outreachMultiCount-${safeKey}">${selected.length ? `เลือกแล้ว ${selected.length} รายการ` : allLabel}</span>
          </div>
          <button type="button" class="product-picker-close" aria-label="ยกเลิกและปิด" onclick="cancelOutreachMultiSelection('${safeKey}')">×</button>
        </div>
        <div class="product-multi-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input id="outreachMultiSearch-${safeKey}" class="product-multi-search" type="search" placeholder="ค้นหา" autocomplete="off" oninput="filterOutreachMultiOptions('${safeKey}',this.value)" />
        </div>
        <div class="product-multi-actions">
          <button type="button" onclick="setAllOutreachMulti('${safeKey}',true)">เลือกทั้งหมด</button>
          <button type="button" onclick="setAllOutreachMulti('${safeKey}',false)">ล้างทั้งหมด</button>
        </div>
        <div class="product-multi-list" id="outreachMultiList-${safeKey}">
          ${(options || []).map(option => `
            <label class="product-check-row outreach-multi-row-${safeKey}" data-filter-search="${escapeOutreachHtml(String(option).toLowerCase())}">
              <input class="outreach-multi-check" data-filter-key="${safeKey}" type="checkbox" value="${escapeOutreachHtml(option)}" ${selectedSet.has(option) ? "checked" : ""} onchange="updateOutreachMultiDraft('${safeKey}')" />
              <span>${escapeOutreachHtml(option)}</span>
            </label>`).join("")}
          <div class="product-search-empty" id="outreachMultiEmpty-${safeKey}" hidden>ไม่พบรายการที่ค้นหา</div>
        </div>
        <div class="product-multi-footer">
          <button type="button" class="btn-product-cancel" onclick="cancelOutreachMultiSelection('${safeKey}')">ยกเลิก</button>
          <button type="button" class="btn-product-apply" id="outreachMultiApply-${safeKey}" onclick="commitOutreachMultiSelection('${safeKey}')">${selected.length ? `ใช้ตัวกรอง (${selected.length})` : `ใช้${escapeOutreachHtml(allLabel)}`}</button>
        </div>
      </div>
    </details>`;
}

function getSelectedOutreachMulti(key) {
  return Array.from(document.querySelectorAll(`.outreach-multi-check[data-filter-key="${key}"]:checked`))
    .map(el => el.value)
    .filter(Boolean);
}

function updateOutreachMultiDraft(key) {
  const selected = getSelectedOutreachMulti(key);
  const config = outreachMultiFilterConfig[key] || { allLabel: "ทั้งหมด" };
  const count = document.getElementById(`outreachMultiCount-${key}`);
  const apply = document.getElementById(`outreachMultiApply-${key}`);
  if (count) count.textContent = selected.length ? `เลือกแล้ว ${selected.length} รายการ` : config.allLabel;
  if (apply) apply.textContent = selected.length ? `ใช้ตัวกรอง (${selected.length})` : `ใช้${config.allLabel}`;
}

function updateOutreachMultiLabel(key) {
  const selected = getSelectedOutreachMulti(key);
  const config = outreachMultiFilterConfig[key] || { allLabel: "ทั้งหมด" };
  const label = document.getElementById(`outreachMultiLabel-${key}`);
  const helper = document.getElementById(`outreachMultiHelper-${key}`);
  if (label) label.textContent = selected.length === 0 ? "กรุณาเลือก" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} รายการ`;
}

function handleOutreachMultiPickerToggle(details, key) {
  if (!details) return;
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
  if (details.open) {
    outreachMultiFilterSnapshots[key] = getSelectedOutreachMulti(key);
    const search = document.getElementById(`outreachMultiSearch-${key}`);
    if (search) search.value = "";
    filterOutreachMultiOptions(key, "");
    updateOutreachMultiDraft(key);
    if (isMobile) document.body.classList.add("product-picker-open");
  } else {
    document.body.classList.remove("product-picker-open");
  }
}

function filterOutreachMultiOptions(key, query) {
  const normalized = String(query || "").trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll(`.outreach-multi-row-${key}`).forEach(row => {
    const text = String(row.dataset.filterSearch || row.textContent || "").toLowerCase();
    const show = !normalized || text.includes(normalized);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const empty = document.getElementById(`outreachMultiEmpty-${key}`);
  if (empty) empty.hidden = visible > 0;
}

function setAllOutreachMulti(key, selectAll) {
  document.querySelectorAll(`.outreach-multi-check[data-filter-key="${key}"]`).forEach(el => { el.checked = Boolean(selectAll); });
  updateOutreachMultiDraft(key);
}

function cancelOutreachMultiSelection(key) {
  const previous = new Set(outreachMultiFilterSnapshots[key] || []);
  document.querySelectorAll(`.outreach-multi-check[data-filter-key="${key}"]`).forEach(el => { el.checked = previous.has(el.value); });
  updateOutreachMultiDraft(key);
  updateOutreachMultiLabel(key);
  const picker = document.getElementById(`outreachMultiPicker-${key}`);
  if (picker) picker.open = false;
}

function commitOutreachMultiSelection(key) {
  outreachMultiFilterSnapshots[key] = getSelectedOutreachMulti(key);
  updateOutreachMultiLabel(key);
  const picker = document.getElementById(`outreachMultiPicker-${key}`);
  if (picker) picker.open = false;
}

let outreachProductSelectionSnapshot = [];

function getSelectedOutreachProducts() {
  return Array.from(document.querySelectorAll(".outreach-product-check:checked"))
    .map(el => el.value)
    .filter(Boolean);
}

function updateOutreachProductPreview() {
  const preview = document.getElementById("outreachProductPreview");
  if (!preview) return;
  const selected = getSelectedOutreachProducts();
  if (!selected.length) {
    preview.innerHTML = '<span class="is-placeholder">ยังไม่ได้เลือกเฉพาะชนิด</span>';
    return;
  }
  preview.innerHTML = selected.slice(0, 6)
    .map(value => `<span>${escapeOutreachHtml(value)}</span>`)
    .join("") + (selected.length > 6 ? `<span>+${selected.length - 6}</span>` : "");
}

function updateOutreachProductLabel() {
  const selected = getSelectedOutreachProducts();
  const label = document.getElementById("outreachProductLabel");
  const helper = document.getElementById("outreachProductHelper");
  if (label) {
    label.textContent = selected.length === 0 ? "กรุณาเลือก" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} ชนิด`;
  }
}

function updateOutreachProductDraftCount() {
  const selected = getSelectedOutreachProducts();
  const count = document.getElementById("outreachProductDraftCount");
  const apply = document.getElementById("outreachProductApply");
  if (count) count.textContent = selected.length ? `เลือกแล้ว ${selected.length} รายการ` : "ยังไม่ได้จำกัดชนิด";
  if (apply) apply.textContent = selected.length ? `ใช้ตัวกรอง (${selected.length})` : "ใช้ทุกชนิด";
  updateOutreachProductPreview();
}

function formatThaiDateShort(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return `${d} ${monthNames[m - 1] || ""} ${y + 543}`.trim();
    }
  }
  return text;
}

function formatThaiMonthYear(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return String(value);
  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const y = Number(match[1]);
  const m = Number(match[2]);
  return `${monthNames[m - 1] || ""} ${y + 543}`.trim();
}

function outreachMonthValueFromDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function outreachLastDayOfMonth(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
}

function renderOutreachMonthSelectOptions(selectedMonth) {
  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const selected = Number(selectedMonth || 0);
  return `<option value="">กรุณาเลือก</option>` + monthNames.map((name, index) => {
    const value = index + 1;
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${name}</option>`;
  }).join("");
}

function renderOutreachYearSelectOptions(minDate, maxDate, selectedYear) {
  const minYear = Number(String(minDate || "").slice(0,4));
  const maxYear = Number(String(maxDate || "").slice(0,4));
  const selected = Number(selectedYear || 0);
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || minYear < 1900 || maxYear < 1900) {
    const current = new Date().getFullYear();
    return `<option value="">กรุณาเลือก</option><option value="${current}" ${selected === current ? "selected" : ""}>${current + 543}</option>`;
  }
  const start = Math.min(minYear, maxYear);
  const end = Math.max(minYear, maxYear);
  const options = [`<option value="">กรุณาเลือก</option>`];
  for (let year = end; year >= start; year -= 1) {
    options.push(`<option value="${year}" ${year === selected ? "selected" : ""}>${year + 543}</option>`);
  }
  return options.join("");
}

function outreachMonthParts(value, fallbackValue = "") {
  const match = String(value || fallbackValue || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return { year: 0, month: 0 };
  return { year: Number(match[1]), month: Number(match[2]) };
}

function outreachMonthKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || y < 1900 || !Number.isFinite(m) || m < 1 || m > 12) return "";
  return `${y}-${String(m).padStart(2,"0")}`;
}

function clampOutreachMonthKey(value, minDate, maxDate) {
  let monthKey = String(value || "");
  const minMonth = outreachMonthValueFromDate(minDate);
  const maxMonth = outreachMonthValueFromDate(maxDate);
  if (minMonth && monthKey && monthKey < minMonth) monthKey = minMonth;
  if (maxMonth && monthKey && monthKey > maxMonth) monthKey = maxMonth;
  return monthKey;
}

function setOutreachMonthRangeControls(monthFrom, monthTo) {
  const from = outreachMonthParts(monthFrom);
  const to = outreachMonthParts(monthTo);
  const controls = {
    outreachMonthFromMonth: from.month,
    outreachMonthFromYear: from.year,
    outreachMonthToMonth: to.month,
    outreachMonthToYear: to.year
  };
  Object.entries(controls).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  });
}

function isOutreachFullMonthRange(filters) {
  const from = String(filters?.dateFrom || "");
  const to = String(filters?.dateTo || "");
  if (!from && !to) return false;
  const fromMonth = outreachMonthValueFromDate(from);
  const toMonth = outreachMonthValueFromDate(to);
  const fromIsBoundary = !from || from === `${fromMonth}-01`;
  const toIsBoundary = !to || to === outreachLastDayOfMonth(toMonth);
  return fromIsBoundary && toIsBoundary;
}

function getOutreachTrendYearRange(filters = {}) {
  const fallbackStart = currentOutreachAnalysisData?.filterOptions?.minDate || currentOutreachAnalysisData?.sourceStartDate || "";
  const fallbackEnd = currentOutreachAnalysisData?.filterOptions?.maxDate || currentOutreachAnalysisData?.sourceEndDate || "";
  const from = String(filters.dateFrom || fallbackStart || "");
  const to = String(filters.dateTo || fallbackEnd || "");
  const startYear = Number(from.slice(0,4));
  const endYear = Number(to.slice(0,4));
  if (Number.isFinite(startYear) && Number.isFinite(endYear) && startYear > 1900 && endYear > 1900) {
    return { startYear: Math.min(startYear,endYear), endYear: Math.max(startYear,endYear) };
  }
  const only = Number((to || from).slice(0,4));
  const safe = Number.isFinite(only) && only > 1900 ? only : new Date().getFullYear();
  return { startYear: safe, endYear: safe };
}

function renderOutreachFilterSummary(filters) {
  const box = document.getElementById("outreachFilterSummary");
  if (!box) return;
  const chips = [];
  if (filters?.dateFrom || filters?.dateTo) {
    if (isOutreachFullMonthRange(filters)) {
      chips.push(`ช่วงเดือน: ${formatThaiMonthYear(filters?.dateFrom) || "เริ่มต้น"} → ${formatThaiMonthYear(filters?.dateTo) || "ล่าสุด"}`);
    } else {
      chips.push(`ช่วงวันที่: ${formatThaiDateShort(filters?.dateFrom) || "เริ่มต้น"} → ${formatThaiDateShort(filters?.dateTo) || "ล่าสุด"}`);
    }
  }
  const summarizeMulti = (label, values, unit = "รายการ") => {
    const selected = normalizeOutreachSelectedValues(values);
    if (!selected.length) return;
    chips.push(selected.length === 1 ? `${label}: ${selected[0]}` : `${label}: ${selected.join(" · ")}`);
  };
  summarizeMulti("กลุ่ม", filters?.sourceGroups || (filters?.sourceGroup ? [filters.sourceGroup] : []));
  summarizeMulti("จุด/แหล่ง", filters?.sources || (filters?.source ? [filters.source] : []));
  if (Array.isArray(filters?.productTypes) && filters.productTypes.length) {
    chips.push(filters.productTypes.length === 1 ? `ผลิตภัณฑ์: ${filters.productTypes[0]}` : `ผลิตภัณฑ์: ${filters.productTypes.join(" · ")}`);
  }
  summarizeMulti("หมู่เลือด", filters?.bloodGroups || (filters?.bloodGroup ? [filters.bloodGroup] : []));
  summarizeMulti("Rh", filters?.rhs || (filters?.rh ? [filters.rh] : []));

  if (!chips.length) {
    box.innerHTML = `
      <div class="filter-summary-strip is-default">
        <strong>ยังไม่ได้เลือกตัวกรอง</strong>
        <span>กรุณาเลือกช่วงข้อมูลก่อนกดแสดงผล</span>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="filter-summary-strip">
      <strong>กำลังดูข้อมูลตามตัวกรองนี้</strong>
      <div class="filter-summary-chips">${chips.map(text => `<span>${escapeOutreachHtml(text)}</span>`).join("")}</div>
    </div>`;
}

function renderOutreachTrendInsight(data) {
  const box = document.getElementById("outreachTrendInsight");
  if (!box) return;
  const filters = getOutreachFilterValues();
  const months = Array.isArray(data?.months) ? data.months : [];
  const first = months[0];
  const last = months[months.length - 1];
  const rangeText = first && last
    ? `${formatThaiMonthYear(`${first.year}-${String(first.month).padStart(2,"0")}`)} → ${formatThaiMonthYear(`${last.year}-${String(last.month).padStart(2,"0")}`)}`
    : (filters.dateFrom || filters.dateTo ? `${formatThaiMonthYear(filters.dateFrom) || "เริ่มต้น"} → ${formatThaiMonthYear(filters.dateTo) || "ล่าสุด"}` : "ข้อมูลทั้งหมด");
  box.innerHTML = `
    <div class="trend-focus-strip is-synced is-compact">
      <strong>ช่วงกราฟ: ${escapeOutreachHtml(rangeText)}</strong>
    </div>`;
}

function handleOutreachProductPickerToggle(details) {
  if (!details) return;
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
  if (details.open) {
    outreachProductSelectionSnapshot = getSelectedOutreachProducts();
    const search = document.getElementById("outreachProductSearch");
    if (search) search.value = "";
    filterOutreachProductOptions("");
    updateOutreachProductDraftCount();
    if (isMobile) document.body.classList.add("product-picker-open");
  } else {
    document.body.classList.remove("product-picker-open");
  }
}

function filterOutreachProductOptions(query) {
  const normalized = String(query || "").trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll(".product-check-row").forEach(row => {
    const text = String(row.dataset.productSearch || row.textContent || "").toLowerCase();
    const show = !normalized || text.includes(normalized);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const empty = document.getElementById("outreachProductSearchEmpty");
  if (empty) empty.hidden = visible > 0;
}

function setAllOutreachProducts(selectAll) {
  document.querySelectorAll(".outreach-product-check").forEach(el => { el.checked = Boolean(selectAll); });
  updateOutreachProductDraftCount();
}

function handleOutreachProductChange() {
  updateOutreachProductDraftCount();
}

function restoreOutreachProductSnapshot() {
  const previous = new Set(outreachProductSelectionSnapshot || []);
  document.querySelectorAll(".outreach-product-check").forEach(el => { el.checked = previous.has(el.value); });
}

function cancelOutreachProductSelection() {
  restoreOutreachProductSnapshot();
  updateOutreachProductDraftCount();
  const picker = document.getElementById("outreachProductPicker");
  if (picker) picker.open = false;
}

function commitOutreachProductSelection() {
  updateOutreachProductLabel();
  outreachProductSelectionSnapshot = getSelectedOutreachProducts();
  const picker = document.getElementById("outreachProductPicker");
  if (picker) picker.open = false;
}

function renderOutreachAnalysis() {
  const container = document.getElementById("outreachOutcomeDashboard");
  const data = currentOutreachAnalysisData;
  if (!container) return;

  if (!data || !data.batchId) {
    container.innerHTML = `
      <div class="empty-state-card mt-4">
        <div class="empty-icon">↻</div>
        <h3>ยังไม่มีข้อมูลผลถุงเลือด</h3>
        <p>อัปเดตไฟล์ LIS ก่อน 1 ครั้ง ระบบจะสร้างรายงานให้เอง</p>
        <button class="btn btn-main" type="button" onclick="scrollToUpload()">ไปอัปเดต LIS</button>
      </div>`;
    return;
  }

  const options = data.filterOptions || {};
  const f = data.filters || {};
  const validation = data.validation || {};
  const availableMinDate = options.minDate || data.sourceStartDate || "";
  const availableMaxDate = options.maxDate || data.sourceEndDate || "";

  container.innerHTML = `
    <div class="outreach-report-shell ${data.reportLoaded ? "is-loaded" : "is-waiting"}">
      <div class="simple-page-head">
        <div>
          <h1>ผลถุงเลือด</h1>
          <div class="page-subline">อัปเดต ${escapeOutreachHtml(formatDisplayDateTime(data.calculatedAt) || "-")}</div>
        </div>
        <div class="compact-actions no-print">
          ${data.reportLoaded ? `<button id="outreachExportCsvBtn" class="btn btn-light" type="button" onclick="exportOutreachCsv()">CSV</button><button id="outreachExportExcelBtn" class="btn btn-light" type="button" onclick="exportOutreachExcel()">Excel</button><button class="btn btn-main" type="button" onclick="printOutreachReport()">PDF</button>` : ``}
        </div>
      </div>

      <details class="simple-details filter-details mb-3 no-print" ${data.reportLoaded ? "" : "open"}>
        <summary>กรองข้อมูล</summary>
        <div class="outreach-filter-grid pt-3">
          <div class="outreach-range-pair">
            <div class="outreach-range-head">
              <div>
                <strong>ช่วงข้อมูลรายเดือน</strong>
                
              </div>
              <div class="outreach-range-quick-actions" aria-label="ช่วงข้อมูลด่วน">
                <button type="button" onclick="setOutreachQuickMonthRange('thisYear')">ปีนี้</button>
                <button type="button" onclick="setOutreachQuickMonthRange('last12')">12 เดือนล่าสุด</button>
                <button type="button" onclick="setOutreachQuickMonthRange('all')">ทั้งหมด</button>
              </div>
            </div>
            ${(() => {
              const fromParts = outreachMonthParts(f.dateFrom || "", "");
              const toParts = outreachMonthParts(f.dateTo || "", "");
              return `
                <div class="outreach-month-year-side">
                  <span class="range-mini-label">ตั้งแต่</span>
                  <div class="outreach-month-year-controls">
                    <select id="outreachMonthFromMonth" class="form-select" aria-label="เดือนเริ่มต้น" onchange="syncOutreachMonthRangeFilter()">${renderOutreachMonthSelectOptions(fromParts.month)}</select>
                    <select id="outreachMonthFromYear" class="form-select" aria-label="ปีเริ่มต้น" onchange="syncOutreachMonthRangeFilter()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, fromParts.year)}</select>
                  </div>
                </div>
                <span class="outreach-range-arrow" aria-hidden="true">→</span>
                <div class="outreach-month-year-side">
                  <span class="range-mini-label">ถึง</span>
                  <div class="outreach-month-year-controls">
                    <select id="outreachMonthToMonth" class="form-select" aria-label="เดือนสิ้นสุด" onchange="syncOutreachMonthRangeFilter()">${renderOutreachMonthSelectOptions(toParts.month)}</select>
                    <select id="outreachMonthToYear" class="form-select" aria-label="ปีสิ้นสุด" onchange="syncOutreachMonthRangeFilter()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, toParts.year)}</select>
                  </div>
                </div>`;
            })()}
          </div>
          ${renderOutreachMultiSelect("sourceGroup", "กลุ่มแหล่งรับเข้า", options.sourceGroups || [], f.sourceGroups || (f.sourceGroup ? [f.sourceGroup] : []), "ทั้งหมด")}
          ${renderOutreachMultiSelect("source", "จุดออกหน่วย / แหล่งรับเข้า", options.sources || [], f.sources || (f.source ? [f.source] : []), "ทุกจุด")}
          ${renderProductMultiSelect(options.products || [], f.productTypes || [])}
          ${renderOutreachMultiSelect("bloodGroup", "หมู่เลือด", options.bloodGroups || [], f.bloodGroups || (f.bloodGroup ? [f.bloodGroup] : []), "ทุกหมู่")}
          ${renderOutreachMultiSelect("rh", "Rh", options.rhs || [], f.rhs || (f.rh ? [f.rh] : []), "ทุก Rh")}
          <input id="outreachDateFrom" type="hidden" value="${escapeOutreachHtml(f.dateFrom || "")}" /><input id="outreachDateTo" type="hidden" value="${escapeOutreachHtml(f.dateTo || "")}" />
        </div>
        <div class="d-flex justify-content-between align-items-center gap-2 mt-3 flex-wrap">
          <div id="outreachFilterLoading" class="small-muted" style="display:none;">กำลังคำนวณ...</div>
          <div class="d-flex gap-2 ms-auto">
            <button class="btn btn-light" type="button" onclick="resetOutreachFilters()">ล้างตัวกรอง</button>
            <button class="btn btn-main" type="button" onclick="applyOutreachFilters()">แสดงผล</button>
          </div>
        </div>
      </details>

      ${data.filterWarning ? `<div class="data-quality-strip mb-3"><strong>ตัวกรองบางรายการโหลดช้า</strong><span>รายงานหลักยังใช้ข้อมูลเดิมในฐานได้ตามปกติ · ${escapeOutreachHtml(data.filterWarning)}</span></div>` : ""}
      <div id="outreachValidationBox"></div>
      <div id="outreachFilterSummary" class="mb-3"></div>
      <div id="outreachSummaryCards"></div>

      <div class="simple-panel mb-3 trend-panel">
        <div class="panel-heading-row trend-head-row">
          <div>
            <h3>แนวโน้มรายเดือน</h3>
            <div class="small-muted">ตามช่วงที่เลือก</div>
          </div>
        </div>
        <div id="outreachTrendInsight" class="mb-2"></div>
        <div id="outreachTrendChart"><div class="small-muted py-4">กำลังโหลดกราฟ...</div></div>
      </div>

      <details class="simple-details mb-3" open>
        <summary>เปรียบเทียบแหล่งรับเข้าและจุด</summary>
        <div class="pt-3" id="outreachCharts"></div>
      </details>

      <details class="simple-details mb-4">
        <summary>ตารางรายจุด</summary>
        <div class="pt-3" id="outreachSourceTable"></div>
      </details>
    </div>`;

  renderOutreachValidation(validation, data.reviewRows || []);
  if (data.reportLoaded && data.report) {
    renderOutreachFilterSummary(f);
    renderOutreachReportSections(data.report || {});
    loadOutreachTrend();
  } else {
    renderOutreachManualPlaceholder();
  }
}
function renderOutreachValidation(validation, reviewRows) {
  const box = document.getElementById("outreachValidationBox");
  if (!box) return;
  const issueCount = Number(validation?.issueCount || 0);
  const masterReviewCount = Number(validation?.masterReviewCount || 0);
  const unknownSource = Number(validation?.unknownSourceCount || 0);
  const sourceConflict = Number(validation?.sourceConflictCount || 0);
  const outcomeConflict = Number(validation?.outcomeConflictCount || 0);
  const invalidDate = Number(validation?.invalidDateCount || 0);
  const totalNeedReview = Math.max(masterReviewCount, unknownSource + sourceConflict + outcomeConflict + invalidDate, issueCount);

  if (!totalNeedReview) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <details class="simple-details data-review-details mb-3 no-print">
      <summary>⚠ มี ${totalNeedReview.toLocaleString()} รายการที่ควรตรวจสอบ</summary>
      <div class="pt-3 small-muted">ระบบไม่เดาข้อมูลที่ไม่ชัดเจน และกันรายการเหล่านี้ออกจาก KPI จนกว่าจะตรวจสอบ</div>
      <div class="review-chip-row mt-2">
        ${unknownSource ? `<span>DonateSource ${unknownSource}</span>` : ""}
        ${sourceConflict ? `<span>แหล่งรับเข้าขัดแย้ง ${sourceConflict}</span>` : ""}
        ${outcomeConflict ? `<span>ผลลัพธ์ขัดแย้ง ${outcomeConflict}</span>` : ""}
        ${invalidDate ? `<span>วันที่ผิด ${invalidDate}</span>` : ""}
      </div>
      ${(reviewRows || []).length ? `<div class="table-responsive mt-3"><table class="table table-sm align-middle mb-0 technical-table"><thead><tr><th>BagNumber</th><th>Product</th><th>DonateSource</th><th>ผล</th></tr></thead><tbody>${reviewRows.slice(0,30).map(row => `<tr><td><b>${escapeOutreachHtml(row.bagNumber)}</b></td><td>${escapeOutreachHtml(row.productType || "-")}</td><td>${escapeOutreachHtml(row.donateSource || "-")}</td><td>${escapeOutreachHtml(outcomeLabelForRow(row))}</td></tr>`).join("")}</tbody></table></div>` : ""}
    </details>`;
}

function getOutreachFilterValues() {
  const read = id => document.getElementById(id)?.value || "";
  return {
    dateFrom: read("outreachDateFrom"),
    dateTo: read("outreachDateTo"),
    sourceGroups: getSelectedOutreachMulti("sourceGroup"),
    sources: getSelectedOutreachMulti("source"),
    productTypes: getSelectedOutreachProducts(),
    bloodGroups: getSelectedOutreachMulti("bloodGroup"),
    rhs: getSelectedOutreachMulti("rh")
  };
}

function getOutreachMonthRangeControlValues() {
  const read = id => Number(document.getElementById(id)?.value || 0);
  return {
    from: outreachMonthKey(read("outreachMonthFromYear"), read("outreachMonthFromMonth")),
    to: outreachMonthKey(read("outreachMonthToYear"), read("outreachMonthToMonth"))
  };
}

function syncOutreachMonthRangeFilter() {
  const fromDateEl = document.getElementById("outreachDateFrom");
  const toDateEl = document.getElementById("outreachDateTo");
  const minDate = currentOutreachAnalysisData?.filterOptions?.minDate || currentOutreachAnalysisData?.sourceStartDate || "";
  const maxDate = currentOutreachAnalysisData?.filterOptions?.maxDate || currentOutreachAnalysisData?.sourceEndDate || "";
  let { from: monthFrom, to: monthTo } = getOutreachMonthRangeControlValues();

  monthFrom = clampOutreachMonthKey(monthFrom, minDate, maxDate);
  monthTo = clampOutreachMonthKey(monthTo, minDate, maxDate);

  if (monthFrom && monthTo && monthFrom > monthTo) {
    const activeId = document.activeElement?.id || "";
    if (activeId === "outreachMonthFromMonth" || activeId === "outreachMonthFromYear") monthTo = monthFrom;
    else monthFrom = monthTo;
  }

  setOutreachMonthRangeControls(monthFrom, monthTo);
  if (fromDateEl) fromDateEl.value = monthFrom ? `${monthFrom}-01` : "";
  if (toDateEl) toDateEl.value = monthTo ? outreachLastDayOfMonth(monthTo) : "";
}

function setOutreachQuickMonthRange(mode) {
  const minDate = currentOutreachAnalysisData?.filterOptions?.minDate || currentOutreachAnalysisData?.sourceStartDate || "";
  const maxDate = currentOutreachAnalysisData?.filterOptions?.maxDate || currentOutreachAnalysisData?.sourceEndDate || "";
  const minMonth = outreachMonthValueFromDate(minDate);
  const maxMonth = outreachMonthValueFromDate(maxDate);
  if (!minMonth || !maxMonth) return;

  let monthFrom = minMonth;
  let monthTo = maxMonth;
  const maxParts = outreachMonthParts(maxMonth);

  if (mode === "thisYear") {
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(currentYear, Number(minMonth.slice(0,4))), Number(maxMonth.slice(0,4)));
    monthFrom = clampOutreachMonthKey(outreachMonthKey(year, 1), minDate, maxDate);
    monthTo = clampOutreachMonthKey(outreachMonthKey(year, 12), minDate, maxDate);
  } else if (mode === "last12") {
    const end = new Date(maxParts.year, maxParts.month - 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    monthFrom = clampOutreachMonthKey(outreachMonthKey(start.getFullYear(), start.getMonth() + 1), minDate, maxDate);
    monthTo = maxMonth;
  }

  setOutreachMonthRangeControls(monthFrom, monthTo);
  const fromDateEl = document.getElementById("outreachDateFrom");
  const toDateEl = document.getElementById("outreachDateTo");
  if (fromDateEl) fromDateEl.value = `${monthFrom}-01`;
  if (toDateEl) toDateEl.value = outreachLastDayOfMonth(monthTo);
}

function syncOutreachExactDateFilter() {
  const fromDate = document.getElementById("outreachDateFrom")?.value || "";
  const toDate = document.getElementById("outreachDateTo")?.value || "";
  const fromMonth = outreachMonthValueFromDate(fromDate);
  const toMonth = outreachMonthValueFromDate(toDate);
  if (fromMonth && toMonth) setOutreachMonthRangeControls(fromMonth, toMonth);
}

function resetOutreachFilters() {
  ["outreachDateFrom", "outreachDateTo", "outreachMonthFromMonth", "outreachMonthFromYear", "outreachMonthToMonth", "outreachMonthToYear"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });
  document.querySelectorAll(".outreach-product-check,.outreach-multi-check").forEach(el => { el.checked = false; });
  updateOutreachProductLabel();
  updateOutreachProductDraftCount();
  Object.keys(outreachMultiFilterConfig).forEach(key => {
    outreachMultiFilterSnapshots[key] = [];
    updateOutreachMultiLabel(key);
    updateOutreachMultiDraft(key);
  });
  if (currentOutreachAnalysisData) {
    currentOutreachAnalysisData = { ...currentOutreachAnalysisData, filters: {}, report: null, reportLoaded: false };
    currentOutreachSourceSummary = [];
    currentOutreachTrendData = null;
  }
  renderOutreachManualPlaceholder();
}

function renderOutreachManualPlaceholder() {
  ['outreachFilterSummary','outreachSummaryCards','outreachTrendChart','outreachCharts','outreachSourceTable','outreachTrendInsight'].forEach(id => {
    const el=document.getElementById(id); if(el) el.innerHTML='';
  });
}

async function applyOutreachFilters() {
  if (!currentOutreachAnalysisData?.batchId) return;
  const requestId = ++outreachRequestSeq;
  const loading = document.getElementById("outreachFilterLoading");
  const actionButton = Array.from(document.querySelectorAll('#outreachOutcomeDashboard .btn-main')).find(btn => String(btn.textContent || '').trim() === 'แสดงผล');
  if (loading) {
    loading.textContent = "กำลังค้นหา...";
    loading.style.display = "block";
  }
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.dataset.originalText = actionButton.textContent;
    actionButton.textContent = "กำลังแสดงผล...";
  }

  try {
    // Sync month controls one more time before reading hidden date values.
    // This also fixes cases where the user selects the month/year and clicks “แสดงผล” immediately.
    syncOutreachMonthRangeFilter();
    const filters = getOutreachFilterValues();
    if (!filters.dateFrom || !filters.dateTo) {
      throw new Error("กรุณาเลือกช่วงข้อมูลก่อน หรือกดปุ่ม ‘ทั้งหมด’ แล้วจึงกดแสดงผล");
    }

    const data = await MinimumStockBackend.getOutreachAnalysis({ filters, forceRefresh: true });
    if (requestId !== outreachRequestSeq) return;

    data.reportLoaded = true;
    data.filters = { ...(data.filters || {}), ...filters };
    if ((!data.reviewRows || !data.reviewRows.length) && currentOutreachAnalysisData?.reviewRows?.length) {
      data.reviewRows = currentOutreachAnalysisData.reviewRows;
    }

    currentOutreachAnalysisData = data;
    currentOutreachSourceSummary = normalizeOutreachSourceSummary(data?.report?.sources || []);
    currentOutreachTrendData = null;

    // Rebuild the whole report shell after a successful search.
    // Previously only inner sections were updated, which could leave the page looking blank.
    renderOutreachAnalysis();

    requestAnimationFrame(() => {
      const target = document.getElementById('outreachSummaryCards') || document.getElementById('outreachOutcomeDashboard');
      if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } catch (err) {
    const message = String(err?.message || err || 'ไม่สามารถโหลดผลลัพธ์ได้');
    const errorBox = document.getElementById('outreachFilterLoading');
    if (errorBox) {
      errorBox.textContent = `ไม่สามารถแสดงผล: ${message}`;
      errorBox.style.display = 'block';
      errorBox.classList.add('text-danger');
    }
    showModal("error", "ค้นหาผลถุงเลือดไม่สำเร็จ", message);
  } finally {
    if (requestId === outreachRequestSeq) {
      const currentLoading = document.getElementById("outreachFilterLoading");
      if (currentLoading && !currentLoading.classList.contains('text-danger')) currentLoading.style.display = "none";
      if (actionButton && document.body.contains(actionButton)) {
        actionButton.disabled = false;
        actionButton.textContent = actionButton.dataset.originalText || 'แสดงผล';
      }
    }
  }
}


async function loadOutreachTrend() {
  const box = document.getElementById("outreachTrendChart");
  if (!box || !currentOutreachAnalysisData?.batchId) return;

  box.innerHTML = `<div class="small-muted py-4">กำลังโหลดกราฟ...</div>`;
  try {
    const filters = getOutreachFilterValues();
    const range = getOutreachTrendYearRange(filters);
    const yearCount = Math.max(1, range.endYear - range.startYear + 1);
    const maxYears = 8;
    const startYear = yearCount > maxYears ? range.endYear - maxYears + 1 : range.startYear;
    const years = [];
    for (let y = startYear; y <= range.endYear; y += 1) years.push(y);

    const results = [];
    for (const y of years) {
      results.push(await MinimumStockBackend.getOutreachMonthlyTrend(y, filters));
    }
    const monthFrom = outreachMonthValueFromDate(filters.dateFrom || currentOutreachAnalysisData?.filterOptions?.minDate || currentOutreachAnalysisData?.sourceStartDate || "");
    const monthTo = outreachMonthValueFromDate(filters.dateTo || currentOutreachAnalysisData?.filterOptions?.maxDate || currentOutreachAnalysisData?.sourceEndDate || "");
    const months = [];

    results.forEach((result, index) => {
      const y = years[index];
      (Array.isArray(result?.months) ? result.months : []).forEach((m) => {
        const monthNumber = Number(m.month || 0);
        if (!monthNumber) return;
        const key = `${y}-${String(monthNumber).padStart(2,"0")}`;
        if (monthFrom && key < monthFrom) return;
        if (monthTo && key > monthTo) return;
        months.push({
          year: y,
          month: monthNumber,
          stockIn: Number(m.stockIn || 0),
          released: Number(m.released || 0),
          expired: Number(m.expired || 0),
          rejected: Number(m.rejected || 0),
          unresolved: Number(m.unresolved || 0)
        });
      });
    });

    const result = { startYear, endYear: range.endYear, years, months };
    currentOutreachTrendData = result;
    renderOutreachTrendChart(result);
    renderOutreachTrendInsight(result);
  } catch (err) {
    box.innerHTML = `<div class="data-quality-strip"><strong>โหลดกราฟไม่ได้</strong><span>${escapeOutreachHtml(err.message)}</span></div>`;
  }
}

function renderOutreachTrendChart(data) {
  const box = document.getElementById("outreachTrendChart");
  if (!box) return;
  const months = Array.isArray(data?.months) ? data.months : [];
  if (!months.length) {
    box.innerHTML = `<div class="small-muted py-4">ยังไม่มีข้อมูลในช่วงเดือน/ปีที่เลือก</div>`;
    return;
  }

  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const monthNamesLong = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const maxReceived = Math.max(1, ...months.map(m => Number(m.stockIn || 0)));
  const totalIn = months.reduce((s,m)=>s+Number(m.stockIn||0),0);
  const totalReleased = months.reduce((s,m)=>s+Number(m.released||0),0);
  const totalExpired = months.reduce((s,m)=>s+Number(m.expired||0),0);
  const totalRejected = months.reduce((s,m)=>s+Number(m.rejected||0),0);
  const totalUnresolved = months.reduce((s,m)=>s+Number(m.unresolved||0),0);
  const multiYear = new Set(months.map(m => Number(m.year))).size > 1;
  const ariaStart = months[0] ? `${monthNames[Number(months[0].month)-1]} ${Number(months[0].year)+543}` : "";
  const ariaEnd = months[months.length-1] ? `${monthNames[Number(months[months.length-1].month)-1]} ${Number(months[months.length-1].year)+543}` : "";

  box.innerHTML = `
    <div class="trend-toolbar-row">
      <div class="trend-summary-row">
        <span><i class="trend-dot trend-released"></i>ใช้/จ่าย/ส่งต่อ <b>${totalReleased.toLocaleString()}</b></span>
        <span><i class="trend-dot trend-expired"></i>หมดอายุ <b>${totalExpired.toLocaleString()}</b></span>
        <span><i class="trend-dot trend-rejected"></i>ไม่เหมาะสม <b>${totalRejected.toLocaleString()}</b></span>
        <span><i class="trend-dot trend-unresolved"></i>ยังอยู่ในคลัง <b>${totalUnresolved.toLocaleString()}</b></span>
        <span class="trend-total-chip">รับเข้ารวม <b>${totalIn.toLocaleString()}</b></span>
      </div>
      <button class="btn btn-light btn-sm no-print" type="button" onclick="downloadOutreachTrendChartPng()">ดาวน์โหลดกราฟ PNG</button>
    </div>
    <div class="monthly-outcome-chart is-stacked" style="--trend-columns:${Math.max(12,months.length)}" role="img" aria-label="กราฟผลลัพธ์ของเลือดที่รับเข้ารายเดือน ${ariaStart} ถึง ${ariaEnd}">
      ${months.map((m, idx) => {
        const monthIndex = Math.max(0, Number(m.month || 1) - 1);
        const year = Number(m.year || 0);
        const stockIn = Number(m.stockIn || 0);
        const released = Number(m.released || 0);
        const expired = Number(m.expired || 0);
        const rejected = Number(m.rejected || 0);
        const unresolved = Number(m.unresolved || 0);
        const fullLabel = `${monthNamesLong[monthIndex]} ${year + 543}`;
        const stackHeight = Math.max(stockIn ? 10 : 2, Math.round((stockIn / maxReceived) * 100));
        const pct = value => stockIn > 0 ? Math.max(0, (Number(value || 0) / stockIn) * 100) : 0;
        const prevYear = idx > 0 ? Number(months[idx-1]?.year || 0) : null;
        const startsYear = multiYear && (idx === 0 || prevYear !== year);
        return `
          <div class="outcome-month-group ${startsYear && idx > 0 ? 'is-year-break' : ''}">
            <div class="month-top-value">${stockIn.toLocaleString()}</div>
            <div class="outcome-bar-area">
              <div class="outcome-stack is-single" style="height:${stackHeight}%" title="${fullLabel} · รับเข้า ${stockIn.toLocaleString()} · ใช้/จ่าย/ส่งต่อ ${released.toLocaleString()} · หมดอายุ ${expired.toLocaleString()} · ไม่เหมาะสม ${rejected.toLocaleString()} · ยังอยู่ในคลัง ${unresolved.toLocaleString()}">
                <span class="outcome-segment is-used" style="height:${pct(released)}%" title="ใช้/จ่าย/ส่งต่อ ${released.toLocaleString()}"></span>
                <span class="outcome-segment is-expired" style="height:${pct(expired)}%" title="หมดอายุ ${expired.toLocaleString()}"></span>
                <span class="outcome-segment is-rejected" style="height:${pct(rejected)}%" title="ไม่เหมาะสม ${rejected.toLocaleString()}"></span>
                <span class="outcome-segment is-unresolved" style="height:${pct(unresolved)}%" title="ยังอยู่ในคลัง ${unresolved.toLocaleString()}"></span>
              </div>
            </div>
            <div class="month-label">${monthNames[monthIndex]}</div>
            <div class="month-year-label">${startsYear ? year + 543 : ''}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="trend-table-wrap mt-3">
      <table class="table table-sm trend-data-table align-middle mb-0">
        <thead><tr><th>เดือน / ปี</th><th class="text-end">รับเข้า</th><th class="text-end">ใช้/จ่าย/ส่งต่อ</th><th class="text-end">หมดอายุ</th><th class="text-end">ไม่เหมาะสม</th><th class="text-end">ยังอยู่ในคลัง</th></tr></thead>
        <tbody>
          ${months.map((m) => {
            const monthIndex = Math.max(0, Number(m.month || 1) - 1);
            return `<tr><td><strong>${monthNamesLong[monthIndex]} ${Number(m.year || 0) + 543}</strong></td><td class="text-end">${Number(m.stockIn || 0).toLocaleString()}</td><td class="text-end">${Number(m.released || 0).toLocaleString()}</td><td class="text-end">${Number(m.expired || 0).toLocaleString()}</td><td class="text-end">${Number(m.rejected || 0).toLocaleString()}</td><td class="text-end">${Number(m.unresolved || 0).toLocaleString()}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function downloadOutreachTrendChartPng() {
  const months = Array.isArray(currentOutreachTrendData?.months) ? currentOutreachTrendData.months : [];
  if (!months.length) {
    showModal("error", "ยังไม่มีกราฟ", "กรุณาเลือกช่วงข้อมูลที่มีรายการก่อน");
    return;
  }
  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const canvas = document.createElement("canvas");
  const width = Math.max(1200, months.length * 92 + 180);
  const height = 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#173b5d";
  ctx.font = "700 30px Sarabun, sans-serif";
  ctx.fillText("แนวโน้มผลลัพธ์ถุงเลือดรายเดือน", 60, 56);
  const first = months[0], last = months[months.length - 1];
  ctx.font = "400 17px Sarabun, sans-serif";
  ctx.fillStyle = "#6f8598";
  ctx.fillText(`ช่วง ${monthNames[first.month-1]} ${Number(first.year)+543} – ${monthNames[last.month-1]} ${Number(last.year)+543}`, 60, 86);

  const legend = [
    ["ใช้/จ่าย/ส่งต่อ", "#2d9f73"],
    ["หมดอายุ", "#dc6d68"],
    ["ไม่เหมาะสม", "#d7a44b"],
    ["ยังอยู่ในคลัง", "#a8b8c6"]
  ];
  let lx = 60;
  ctx.font = "600 15px Sarabun, sans-serif";
  legend.forEach(([label,color]) => {
    ctx.fillStyle = color; ctx.fillRect(lx, 112, 14, 14);
    ctx.fillStyle = "#36556f"; ctx.fillText(label, lx + 22, 125);
    lx += ctx.measureText(label).width + 65;
  });

  const chartX = 72, chartY = 160, chartH = 430, chartW = width - 130;
  const maxReceived = Math.max(1, ...months.map(m => Number(m.stockIn || 0)));
  ctx.strokeStyle = "#e6eef4"; ctx.lineWidth = 1;
  ctx.fillStyle = "#7890a4"; ctx.font = "400 13px Sarabun, sans-serif";
  for (let i=0;i<=4;i+=1) {
    const y = chartY + chartH - (chartH*i/4);
    ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX+chartW, y); ctx.stroke();
    const value = Math.round(maxReceived*i/4);
    ctx.fillText(value.toLocaleString(), 20, y+4);
  }
  const slot = chartW / months.length;
  months.forEach((m, idx) => {
    const stockIn = Number(m.stockIn || 0);
    const values = [Number(m.released||0), Number(m.expired||0), Number(m.rejected||0), Number(m.unresolved||0)];
    const colors = ["#2d9f73", "#dc6d68", "#d7a44b", "#a8b8c6"];
    const totalHeight = stockIn / maxReceived * chartH;
    const barW = Math.min(48, slot * 0.56);
    const x = chartX + slot*idx + (slot-barW)/2;
    let yBottom = chartY + chartH;
    values.forEach((v, j) => {
      const h = stockIn > 0 ? totalHeight * (v / stockIn) : 0;
      if (h <= 0) return;
      ctx.fillStyle = colors[j];
      ctx.fillRect(x, yBottom-h, barW, h);
      yBottom -= h;
    });
    ctx.fillStyle = "#173b5d"; ctx.font = "700 13px Sarabun, sans-serif";
    const totalText = stockIn.toLocaleString();
    ctx.fillText(totalText, x + (barW-ctx.measureText(totalText).width)/2, chartY+chartH-totalHeight-8);
    ctx.fillStyle = "#60788d"; ctx.font = "600 13px Sarabun, sans-serif";
    const label = `${monthNames[Number(m.month)-1]} ${String(Number(m.year)+543).slice(-2)}`;
    ctx.save();
    ctx.translate(x+barW/2, chartY+chartH+28);
    ctx.rotate(-0.45);
    ctx.fillText(label, -ctx.measureText(label).width/2, 0);
    ctx.restore();
  });
  ctx.fillStyle = "#7890a4";
  ctx.font = "400 13px Sarabun, sans-serif";
  ctx.fillText("ความสูงรวมของแต่ละแท่งเท่ากับจำนวนรับเข้าในเดือนนั้น", 60, height-42);

  const link = document.createElement("a");
  link.download = `blood-outcome-trend-${new Date().toISOString().slice(0,10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function renderOutreachReportSections(report) {
  const summary = normalizeOutreachSummary(report?.summary || {});
  const groups = normalizeOutreachGroupSummary(report?.groups || []);
  const sources = normalizeOutreachSourceSummary(report?.sources || []);
  currentOutreachSourceSummary = sources;
  renderOutreachSummaryCards(summary);
  renderOutreachCharts(groups, sources);
  renderOutreachSourceTable(sources);
}

function renderOutreachSummaryCards(s) {
  const box = document.getElementById("outreachSummaryCards");
  if (!box) return;
  const unsuitable = Number(s.rejected||0) + Number(s.otherDiscarded||0);
  const inStock = Number(s.unresolved||0);
  const review = Number(s.conflicts||0);
  const accounted = Number(s.used||0) + Number(s.expired||0) + unsuitable + inStock + review;
  const reconciliationDiff = Number(s.received||0) - accounted;
  box.innerHTML = `
    <div class="simple-kpi-grid outreach-key-kpis mb-3">
      <div class="simple-kpi"><span>รับเข้าทั้งหมด</span><strong>${Number(s.received||0).toLocaleString()}</strong><small>ถุงต้นทาง</small></div>
      <div class="simple-kpi is-good"><span>ใช้ / จ่าย / ส่งต่อ</span><strong>${Number(s.used||0).toLocaleString()}</strong><small>${s.usePercent.toFixed(1)}% · Dedicated ${Number(s.dedicated||0).toLocaleString()}</small></div>
      <div class="simple-kpi is-alert"><span>หมดอายุ</span><strong>${Number(s.expired||0).toLocaleString()}</strong><small>${s.expiredPercent.toFixed(1)}%</small></div>
      <div class="simple-kpi is-rejected"><span>ไม่เหมาะสมต่อการใช้</span><strong>${unsuitable.toLocaleString()}</strong><small>Rejected ${Number(s.rejected||0).toLocaleString()}${s.otherDiscarded ? ` · เหตุอื่น ${Number(s.otherDiscarded).toLocaleString()}` : ""}</small></div>
      <div class="simple-kpi"><span>ยังอยู่ในคลัง</span><strong>${inStock.toLocaleString()}</strong><small>ยังไม่มีผลปลายทาง</small></div>
    </div>
    <div class="outreach-reconcile-strip ${reconciliationDiff ? "has-warning" : "is-ok"} mb-3">
      <strong>${reconciliationDiff ? "⚠ ยอดยังไม่ครบ" : "✓ ผลลัพธ์ครบ"}</strong>
      <span>${accounted.toLocaleString()} / ${Number(s.received||0).toLocaleString()} ถุง${review ? ` · ต้องตรวจสอบ ${review.toLocaleString()}` : ""}</span>
    </div>
    <div class="source-mini-grid mb-3">
      <div><span>รับบริจาคใน รพ.</span><b>${Number(s.selfInhouse||0).toLocaleString()}</b></div>
      <div><span>ออกหน่วย</span><b>${Number(s.selfOutreach||0).toLocaleString()}</b></div>
      <div><span>กาชาด</span><b>${Number(s.trc||0).toLocaleString()}</b></div>
      <div><span>รพ.อื่น</span><b>${Number(s.otherHospital||0).toLocaleString()}</b></div>
    </div>
    ${reconciliationDiff ? `<div class="data-quality-strip mb-3"><strong>ต่าง ${reconciliationDiff > 0 ? "+" : ""}${reconciliationDiff.toLocaleString()} ถุง</strong><span>กรุณาตรวจสอบก่อนใช้รายงาน</span></div>` : ""}
  `;
}

function renderOutreachMetricPill(label, value, tone = "neutral") {
  return `<span class="outreach-metric-pill is-${tone}"><small>${escapeOutreachHtml(label)}</small><b>${Number(value || 0).toLocaleString()}</b></span>`;
}

function renderOutreachMetricBar(label, value, maxValue, tone = "neutral") {
  const safeValue = Number(value || 0);
  const width = Math.max(safeValue > 0 ? 10 : 0, Math.min(100, maxValue > 0 ? (safeValue / maxValue) * 100 : 0));
  return `
    <div class="outreach-metric-bar is-${tone}">
      <div class="outreach-metric-bar-label">${escapeOutreachHtml(label)}</div>
      <div class="outreach-metric-bar-track"><span style="width:${width}%"></span></div>
      <div class="outreach-metric-bar-value">${safeValue.toLocaleString()}</div>
    </div>`;
}

function renderOutreachCharts(groupData, sourceSummary) {
  const box = document.getElementById("outreachCharts");
  if (!box) return;

  const groupOrder = [OUTREACH_GROUP_SELF_INHOUSE, OUTREACH_GROUP_SELF_OUTREACH, OUTREACH_GROUP_TRC, OUTREACH_GROUP_OTHER_HOSPITAL];
  const map = new Map((groupData || []).map(item => [item.sourceGroup, item]));
  const groups = groupOrder.map(name => map.get(name) || { sourceGroup: name, received: 0, used: 0, expired: 0, rejected: 0, otherDiscarded: 0, unresolved: 0, conflicts: 0 });
  const maxGroup = Math.max(1, ...groups.map(item => Math.max(item.received || 0, item.used || 0, item.expired || 0, (Number(item.rejected||0)+Number(item.otherDiscarded||0)), item.unresolved || 0)));
  const topSources = (sourceSummary || []).slice(0, 12);
  const maxSource = Math.max(1, ...topSources.map(item => Math.max(item.received || 0, item.used || 0, item.expired || 0)));
  const topExpired = [...(sourceSummary || [])].sort((a, b) => b.expiredPercent - a.expiredPercent || b.received - a.received).slice(0, 12);

  box.innerHTML = `
    <div class="d-flex justify-content-end mb-2 no-print"><button class="btn btn-light btn-sm" type="button" onclick="downloadOutreachSourceChartPng()">ดาวน์โหลดกราฟแหล่งรับเข้า PNG</button></div>
    <div class="outreach-chart-grid mb-3">
      <div class="hero-card outreach-chart-card">
        <div class="outreach-section-head mb-3">
          <div>
            <h5 class="fw-bold mb-1">เปรียบเทียบแหล่งรับเข้า</h5>
            <div class="small-muted">4 กลุ่มหลัก</div>
          </div>
        </div>
        <div class="outreach-group-card-list">
        ${groups.map(item => {
          const unsuitable = Number(item.rejected||0) + Number(item.otherDiscarded||0);
          const inStock = Number(item.unresolved||0);
          const accounted = Number(item.used||0) + Number(item.expired||0) + unsuitable + inStock + Number(item.conflicts||0);
          const balanced = accounted === Number(item.received||0);
          return `
          <div class="outreach-group-card-row">
            <div class="outreach-chart-topline">
              <div class="outreach-chart-title">${escapeOutreachHtml(item.sourceGroup)}</div>
              <div class="outreach-total-badge">รับเข้า ${item.received.toLocaleString()}</div>
            </div>
            <div class="outreach-pill-row">
              ${renderOutreachMetricPill("ใช้/จ่าย/ส่งต่อ", item.used, "used")}
              ${renderOutreachMetricPill("หมดอายุ", item.expired, "expired")}
              ${renderOutreachMetricPill("ไม่เหมาะสมต่อการใช้", unsuitable, "rejected")}
              ${renderOutreachMetricPill("ยังอยู่ในคลัง", inStock, "unresolved")}
              ${item.conflicts ? renderOutreachMetricPill("ต้องตรวจสอบ", item.conflicts, "conflict") : ""}
            </div>
            <div class="outreach-stacked-bar" aria-label="${escapeOutreachHtml(item.sourceGroup)}">
              <span class="bar-used" style="width:${(Number(item.used || 0) / maxGroup) * 100}%" title="ใช้/จ่าย/ส่งต่อ ${item.used}"></span>
              <span class="bar-expired" style="width:${(Number(item.expired || 0) / maxGroup) * 100}%" title="หมดอายุ ${item.expired}"></span>
              <span class="bar-rejected" style="width:${(unsuitable / maxGroup) * 100}%" title="ไม่เหมาะสมต่อการใช้ ${unsuitable}"></span>
              <span class="bar-unresolved" style="width:${(inStock / maxGroup) * 100}%" title="ยังอยู่ในคลัง ${inStock}"></span>
              <span class="bar-conflict" style="width:${(Number(item.conflicts || 0) / maxGroup) * 100}%" title="ต้องตรวจสอบ ${item.conflicts}"></span>
            </div>
            <div class="outreach-card-balance ${balanced ? "is-ok" : "has-warning"}">${balanced ? "✓ ครบ" : "⚠ ตรวจสอบ"} ${accounted.toLocaleString()}/${Number(item.received||0).toLocaleString()} ถุง</div>
          </div>`;
        }).join("")}
        </div>
        <div class="outreach-legend"><span><i class="legend-used"></i> ใช้/จ่าย/ส่งต่อ</span><span><i class="legend-expired"></i> หมดอายุ</span><span><i class="legend-rejected"></i> ไม่เหมาะสมต่อการใช้</span><span><i class="legend-unresolved"></i> ยังอยู่ในคลัง</span></div>
      </div>

      <div class="hero-card outreach-chart-card">
        <div class="outreach-section-head mb-3">
          <div>
            <h5 class="fw-bold mb-1">รับเข้า / ใช้ / หมดอายุ ตามจุด</h5>
            <div class="small-muted">12 จุดรับเข้าสูงสุด</div>
          </div>
        </div>
        <div class="outreach-bars-list">
          ${topSources.map(item => {
            const unsuitable = Number(item.rejected||0) + Number(item.otherDiscarded||0);
            const inStock = Number(item.unresolved||0);
            const accounted = Number(item.used||0) + Number(item.expired||0) + unsuitable + inStock + Number(item.conflicts||0);
            const balanced = accounted === Number(item.received||0);
            return `
            <div class="outreach-source-card-row">
              <div class="outreach-source-card-head">
                <div class="outreach-source-bar-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
                <div class="small-muted">${escapeOutreachHtml(item.sourceGroup || "")}</div>
              </div>
              <div class="outreach-pill-row is-compact">
                ${renderOutreachMetricPill("รับเข้า", item.received, "received")}
                ${renderOutreachMetricPill("ใช้/จ่าย", item.used, "used")}
                ${renderOutreachMetricPill("หมดอายุ", item.expired, "expired")}
                ${renderOutreachMetricPill("ไม่เหมาะสม", unsuitable, "rejected")}
                ${renderOutreachMetricPill("ยังอยู่ในคลัง", inStock, "unresolved")}
                ${item.conflicts ? renderOutreachMetricPill("ต้องตรวจสอบ", item.conflicts, "conflict") : ""}
              </div>
              <div class="outreach-metric-bars">
                ${renderOutreachMetricBar("รับเข้า", item.received, maxSource, "received")}
                ${renderOutreachMetricBar("ใช้", item.used, maxSource, "used")}
                ${renderOutreachMetricBar("หมดอายุ", item.expired, maxSource, "expired")}
              </div>
              <div class="outreach-card-balance ${balanced ? "is-ok" : "has-warning"}">${balanced ? "✓ ครบ" : "⚠ ตรวจสอบ"} ${accounted.toLocaleString()}/${Number(item.received||0).toLocaleString()} ถุง</div>
            </div>`;
          }).join("") || `<div class="small-muted">ไม่มีข้อมูลตามตัวกรอง</div>`}
        </div>
      </div>
    </div>

    <div class="hero-card outreach-chart-card mb-3">
      <div class="outreach-section-head mb-3">
        <div>
          <h5 class="fw-bold mb-1">ร้อยละหมดอายุของแต่ละจุด</h5>
          <div class="small-muted">เทียบจากจำนวนรับเข้า</div>
        </div>
      </div>
      <div class="outreach-percent-bars">
        ${topExpired.map(item => `
          <div class="outreach-percent-row">
            <div>
              <div class="outreach-percent-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
              <div class="small-muted">หมดอายุ ${Number(item.expired || 0).toLocaleString()} / รับเข้า ${Number(item.received || 0).toLocaleString()}</div>
            </div>
            <div class="outreach-percent-track"><span style="width:${Math.min(100, item.expiredPercent)}%"></span></div>
            <div class="outreach-percent-value">${item.expiredPercent.toFixed(1)}%</div>
          </div>
        `).join("") || `<div class="small-muted">ไม่มีข้อมูลตามตัวกรอง</div>`}
      </div>
    </div>
  `;
}


function downloadOutreachSourceChartPng() {
  const rows = (currentOutreachSourceSummary || []).slice(0,12);
  if (!rows.length) {
    showModal("error", "ยังไม่มีกราฟ", "ไม่มีข้อมูลแหล่งรับเข้าตามตัวกรองปัจจุบัน");
    return;
  }
  const canvas=document.createElement("canvas");
  canvas.width=1600; canvas.height=Math.max(760,220+rows.length*58);
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#173b5d";ctx.font="700 32px Sarabun, sans-serif";ctx.fillText("ผลลัพธ์ถุงเลือดตามแหล่งรับเข้า",60,58);
  ctx.fillStyle="#6f8598";ctx.font="400 17px Sarabun, sans-serif";ctx.fillText("12 จุดที่มีจำนวนรับเข้าสูงสุดตามตัวกรอง",60,88);
  const legend=[["ใช้/จ่าย/ส่งต่อ","#2d9f73"],["หมดอายุ","#dc6d68"],["ไม่เหมาะสม","#d7a44b"],["ยังอยู่ในคลัง","#a8b8c6"]];
  let lx=60;ctx.font="600 14px Sarabun, sans-serif";
  legend.forEach(([label,color])=>{ctx.fillStyle=color;ctx.fillRect(lx,112,14,14);ctx.fillStyle="#36556f";ctx.fillText(label,lx+22,125);lx+=ctx.measureText(label).width+70;});
  const labelX=60, barX=480, barW=940, rowStart=175;
  const maxReceived=Math.max(1,...rows.map(r=>Number(r.received||0)));
  rows.forEach((r,i)=>{
    const y=rowStart+i*58;
    const name=String(r.donateSource||"");
    ctx.fillStyle="#173b5d";ctx.font="700 15px Sarabun, sans-serif";ctx.fillText(name.length>44?name.slice(0,44)+"…":name,labelX,y+17);
    ctx.fillStyle="#edf3f7";ctx.fillRect(barX,y,barW,24);
    const received=Number(r.received||0), used=Number(r.used||0), expired=Number(r.expired||0), rejected=Number(r.rejected||0)+Number(r.otherDiscarded||0), unresolved=Number(r.unresolved||0);
    const fullW=barW*(received/maxReceived); let x=barX;
    [[used,"#2d9f73"],[expired,"#dc6d68"],[rejected,"#d7a44b"],[unresolved,"#a8b8c6"]].forEach(([v,c])=>{const w=received>0?fullW*(v/received):0;if(w>0){ctx.fillStyle=c;ctx.fillRect(x,y,w,24);x+=w;}});
    ctx.fillStyle="#173b5d";ctx.font="700 14px Sarabun, sans-serif";ctx.fillText(received.toLocaleString(),barX+barW+22,y+17);
  });
  ctx.fillStyle="#7890a4";ctx.font="400 13px Sarabun, sans-serif";ctx.fillText("ความยาวแท่งเทียบตามจำนวนรับเข้า และแบ่งสีตามผลลัพธ์สุดท้าย",60,canvas.height-34);
  const link=document.createElement('a');link.download=`blood-outcome-by-source-${new Date().toISOString().slice(0,10)}.png`;link.href=canvas.toDataURL('image/png');link.click();
}

function renderOutreachSourceTable(sourceSummary) {
  const box = document.getElementById("outreachSourceTable");
  if (!box) return;
  box.innerHTML = `
    <div class="simple-table-card mb-4">
      <div class="table-card-head">
        <div><h3>ตารางสรุปรายจุด</h3><p>เรียงจากรับเข้ามากสุด</p></div>
        <span>${(sourceSummary || []).length.toLocaleString()} จุด</span>
      </div>
      <div class="table-responsive outreach-summary-table-wrap">
        <table class="table outreach-summary-table align-middle simple-table">
          <thead><tr><th>จุด / แหล่งรับเข้า</th><th class="text-end">รับเข้า</th><th class="text-end">ใช้/จ่าย/ส่งต่อ</th><th class="text-end">หมดอายุ</th><th class="text-end">ไม่เหมาะสม</th><th class="text-end">ยังอยู่ในคลัง</th><th class="text-end">% ใช้</th><th class="text-end">% หมดอายุ</th></tr></thead>
          <tbody>${(sourceSummary || []).map((item,index)=>{
            const unsuitable = Number(item.rejected||0) + Number(item.otherDiscarded||0);
            const inStock = Number(item.unresolved||0);
            return `
            <tr class="outreach-click-row" onclick="openOutreachSourceDetail(${index},1)">
              <td><div class="fw-bold">${escapeOutreachHtml(item.donateSource)}</div><div class="small-muted">${escapeOutreachHtml(item.sourceGroup)}</div></td>
              <td class="text-end fw-bold">${item.received.toLocaleString()}</td>
              <td class="text-end">${item.used.toLocaleString()}${item.dedicated ? `<div class="tiny-note">Dedicated ${item.dedicated.toLocaleString()}</div>` : ""}</td>
              <td class="text-end">${item.expired.toLocaleString()}</td>
              <td class="text-end">${unsuitable.toLocaleString()}</td>
              <td class="text-end">${inStock.toLocaleString()}</td>
              <td class="text-end fw-bold">${item.usePercent.toFixed(1)}%</td>
              <td class="text-end">${item.expiredPercent.toFixed(1)}%</td>
            </tr>`;
          }).join("") || `<tr><td colspan="8" class="text-center small-muted py-4">ไม่มีข้อมูลตามตัวกรอง</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

async function openOutreachSourceDetail(index, page = 1) {
  const item = currentOutreachSourceSummary[index];
  if (!item || !currentOutreachAnalysisData?.batchId) return;
  outreachDetailSourceIndex = index;
  outreachDetailPage = Math.max(1, Number(page || 1));

  const overlay = document.getElementById("outreachDetailOverlay");
  const title = document.getElementById("outreachDetailTitle");
  const body = document.getElementById("outreachDetailBody");
  if (!overlay || !title || !body) return;

  title.textContent = item.donateSource;
  body.innerHTML = `<div class="py-5 text-center"><div class="fw-bold">กำลังโหลดรายละเอียด...</div><div class="small-muted">โหลดเฉพาะหน้าที่เปิด เพื่อไม่ให้มือถือรับข้อมูลหลายหมื่นแถวพร้อมกัน</div></div>`;
  overlay.style.display = "flex";

  try {
    const result = await MinimumStockBackend.getOutreachRows({
      batchId: currentOutreachAnalysisData.batchId,
      filters: getOutreachFilterValues(),
      sourceGroup: item.sourceGroup,
      source: item.donateSource,
      page: outreachDetailPage,
      perPage: 100
    });
    const rows = result.rows || [];
    const totalRows = Number(result.count || 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / 100));
    if (outreachDetailPage > totalPages) outreachDetailPage = totalPages;
    const start = totalRows ? (outreachDetailPage - 1) * 100 + 1 : 0;

    body.innerHTML = `
      <div class="small-muted mb-3">${escapeOutreachHtml(item.sourceGroup)} · หน้า ${outreachDetailPage}/${totalPages} · ${totalRows.toLocaleString()} ผลิตภัณฑ์</div>
      <div class="table-responsive outreach-detail-table-wrap">
        <table class="table outreach-detail-table align-middle">
          <thead><tr>
            <th>BagNumber</th><th>ProductType</th><th>BloodGroup</th><th>Rh</th><th>DonateSource</th><th>วันที่อ้างอิง</th><th>CollectDate</th><th>DateStockIn</th><th>DateStockOut</th><th>Status</th><th>DestroyReason</th><th>ผลตาม Status</th>
          </tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="fw-bold">${escapeOutreachHtml(row.bagNumber)}</td>
                <td>${escapeOutreachHtml(row.productType)}</td>
                <td>${escapeOutreachHtml(row.bloodGroup)}</td>
                <td>${escapeOutreachHtml(row.rh)}</td>
                <td>${escapeOutreachHtml(row.donateSource)}</td>
                <td>${escapeOutreachHtml(row.cohortDate)}</td>
                <td>${escapeOutreachHtml(row.collectDate)}</td>
                <td>${escapeOutreachHtml(row.dateStockIn)}</td>
                <td>${escapeOutreachHtml(row.dateStockOut)}</td>
                <td>${escapeOutreachHtml(row.status)}</td>
                <td>${escapeOutreachHtml(row.destroyReason)}</td>
                <td><span class="outreach-outcome-badge ${outreachOutcomeClass(row)}">${escapeOutreachHtml(outcomeLabelForRow(row))}</span></td>
              </tr>
            `).join("") || `<tr><td colspan="12" class="text-center small-muted py-4">ไม่มีรายละเอียดตามตัวกรอง</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2 mt-3">
        <button class="btn btn-light" type="button" ${outreachDetailPage <= 1 ? "disabled" : ""} onclick="openOutreachSourceDetail(${index}, ${outreachDetailPage - 1})">← ก่อนหน้า</button>
        <div class="small-muted">${start.toLocaleString()}-${Math.min(start + rows.length - 1, totalRows).toLocaleString()} จาก ${totalRows.toLocaleString()}</div>
        <button class="btn btn-light" type="button" ${outreachDetailPage >= totalPages ? "disabled" : ""} onclick="openOutreachSourceDetail(${index}, ${outreachDetailPage + 1})">ถัดไป →</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="outreach-error-card p-3"><strong>โหลดรายละเอียดไม่ได้</strong><div class="small-muted">${escapeOutreachHtml(err.message)}</div></div>`;
  }
}

function outreachOutcomeClass(codeOrRow) {
  const code = typeof codeOrRow === "object" ? effectiveOutreachOutcomeCode(codeOrRow) : String(codeOrRow || "");
  if (code === "used") return "is-used";
  if (code === "expired") return "is-expired";
  if (code === "rejected") return "is-rejected";
  if (code === "other_discard" || code === "destroyed") return "is-other-discard";
  if (code === "transformed") return "is-transformed";
  if (code === "conflict") return "is-conflict";
  return "is-unresolved";
}

function closeOutreachDetail() {
  const overlay = document.getElementById("outreachDetailOverlay");
  if (overlay) overlay.style.display = "none";
}

function outreachProductFamilyClient(productType) {
  const p = String(productType || "").trim().toLowerCase();
  if (!p) return "UNKNOWN";

  if (p.includes("cryo-removed plasma") || p.includes("cryo removed plasma")) return "PLASMA";
  if (p.includes("cryoprecipitate") || /(^|[^a-z])cryo([^a-z]|$)/i.test(p)) return "CRYO";
  if (p.includes("platelet") || /(^|[^a-z0-9])(sdp|ldppc|ppc)([^a-z0-9]|$)/i.test(p)) return "PLATELET";
  if (p.includes("fresh frozen plasma") || p.includes("frozen plasma") || p.includes("plasma") || /(^|[^a-z0-9])ffp([^a-z0-9]|$)/i.test(p)) return "PLASMA";
  if (p.includes("red cell") || p.includes("packed cell") || /(^|[^a-z0-9])(prc|lprc|ldprc|rbc)([^a-z0-9]|$)/i.test(p)) return "RBC";
  if (p.includes("whole blood")) return "WHOLE_BLOOD";
  if (p.includes("buffy coat")) return "BUFFY_COAT";
  if (p.includes("autologous")) return "AUTOLOGOUS";

  return `OTHER:${p.replace(/\s+/g, " ").toUpperCase()}`;
}

function outreachFamilyKeyClient(value, productType) {
  const bag = String(value || "").trim().toUpperCase().replace(/\.S\d+$/i, "");
  if (!bag) return "";
  return `${bag}||${outreachProductFamilyClient(productType)}`;
}

function aggregateOutreachRowsForExport(rows) {
  const families = new Map();
  const priority = row => {
    const code = effectiveOutreachOutcomeCode(row);
    if (code === "used") return 0;
    if (code === "rejected") return 1;
    if (code === "expired") return 2;
    if (code === "other_discard") return 3;
    if (code === "conflict") return 4;
    if (code === "transformed") return 5; // intermediate only; final family outcome falls to unresolved
    return 6;
  };

  (rows || []).forEach(row => {
    const familyKey = outreachFamilyKeyClient(row?.bagNumber, row?.productType);
    if (!familyKey) return;
    let family = families.get(familyKey);
    if (!family) {
      family = { key: familyKey, rows: [], preferredRow: row };
      families.set(familyKey, family);
    }
    family.rows.push(row);
    if (priority(row) < priority(family.preferredRow)) family.preferredRow = row;
  });

  const familyRows = Array.from(families.values()).map(family => {
    const codes = family.rows.map(effectiveOutreachOutcomeCode);
    const hasUsed = codes.includes("used");
    const hasRejected = codes.includes("rejected");
    const hasExpired = codes.includes("expired");
    const hasOtherDiscard = codes.includes("other_discard") || codes.includes("destroyed");
    const hasConflict = codes.includes("conflict");
    const finalCode = hasUsed ? "used"
      : hasRejected ? "rejected"
      : hasExpired ? "expired"
      : hasOtherDiscard ? "other_discard"
      : hasConflict ? "conflict"
      : "unresolved"; // transformed-only family = intermediate, still awaiting final outcome
    const preferred = family.preferredRow || family.rows[0] || {};
    const dedicated = family.rows.some(row => String(row?.status || "") === "Dedicated");
    return {
      familyKey: family.key,
      productFamily: outreachProductFamilyClient(preferred.productType),
      sourceGroup: preferred.sourceGroup || "",
      donateSource: preferred.donateSource || "",
      outcomeCode: finalCode,
      dedicated,
      memberCount: family.rows.length,
      statuses: Array.from(new Set(family.rows.map(row => String(row?.status || "").trim()).filter(Boolean))).join(" | ")
    };
  });

  const summary = {
    received: familyRows.length,
    uniqueBags: familyRows.length,
    used: familyRows.filter(row => row.outcomeCode === "used").length,
    dedicated: familyRows.filter(row => row.dedicated).length,
    expired: familyRows.filter(row => row.outcomeCode === "expired").length,
    rejected: familyRows.filter(row => row.outcomeCode === "rejected").length,
    otherDiscarded: familyRows.filter(row => row.outcomeCode === "other_discard").length,
    transformed: 0,
    unresolved: familyRows.filter(row => row.outcomeCode === "unresolved").length,
    conflicts: familyRows.filter(row => row.outcomeCode === "conflict").length,
    selfInhouse: familyRows.filter(row => row.sourceGroup === OUTREACH_GROUP_SELF_INHOUSE).length,
    selfOutreach: familyRows.filter(row => row.sourceGroup === OUTREACH_GROUP_SELF_OUTREACH).length,
    trc: familyRows.filter(row => row.sourceGroup === OUTREACH_GROUP_TRC).length,
    otherHospital: familyRows.filter(row => row.sourceGroup === OUTREACH_GROUP_OTHER_HOSPITAL).length
  };
  summary.usePercent = outreachPercent(summary.used, summary.received);
  summary.expiredPercent = outreachPercent(summary.expired, summary.received);

  const sourceMap = new Map();
  familyRows.forEach(row => {
    const key = `${row.sourceGroup}\u0000${row.donateSource}`;
    let item = sourceMap.get(key);
    if (!item) {
      item = {
        sourceGroup: row.sourceGroup,
        donateSource: row.donateSource,
        received: 0,
        uniqueBags: 0,
        used: 0,
        dedicated: 0,
        expired: 0,
        rejected: 0,
        otherDiscarded: 0,
        transformed: 0,
        unresolved: 0,
        conflicts: 0
      };
      sourceMap.set(key, item);
    }
    item.received += 1;
    item.uniqueBags += 1;
    if (row.outcomeCode === "used") item.used += 1;
    if (row.dedicated) item.dedicated += 1;
    if (row.outcomeCode === "expired") item.expired += 1;
    if (row.outcomeCode === "rejected") item.rejected += 1;
    if (row.outcomeCode === "other_discard") item.otherDiscarded += 1;
    if (row.outcomeCode === "unresolved") item.unresolved += 1;
    if (row.outcomeCode === "conflict") item.conflicts += 1;
  });
  const sources = Array.from(sourceMap.values()).map(item => ({
    ...item,
    usePercent: outreachPercent(item.used, item.received),
    expiredPercent: outreachPercent(item.expired, item.received)
  })).sort((a, b) => b.received - a.received || String(a.donateSource).localeCompare(String(b.donateSource), "th"));

  return { summary, sources, familyRows };
}

function mapOutreachExportRows(rows) {
  return (rows || []).map(row => ({
    FamilyKey: outreachFamilyKeyClient(row.bagNumber, row.productType),
    ProductFamily: outreachProductFamilyClient(row.productType),
    BagNumber: row.bagNumber,
    ProductType: row.productType,
    BloodGroup: row.bloodGroup,
    Rh: row.rh,
    DonateSource: row.donateSource,
    SourceGroup: row.sourceGroup,
    CollectDate: row.collectDate,
    CohortDate: row.cohortDate,
    DateStockIn: row.dateStockIn,
    DateStockOut: row.dateStockOut,
    Status: row.status,
    DestroyReason: row.destroyReason,
    FinalOutcome: outcomeLabelForRow(row)
  }));
}

async function loadOutreachRowsForExport() {
  if (outreachExportBusy) throw new Error("กำลังเตรียมไฟล์ส่งออกอยู่ กรุณารอสักครู่");
  outreachExportBusy = true;
  const csvBtn = document.getElementById("outreachExportCsvBtn");
  const xlsxBtn = document.getElementById("outreachExportExcelBtn");
  if (csvBtn) csvBtn.disabled = true;
  if (xlsxBtn) xlsxBtn.disabled = true;
  try {
    showStatus("กำลังโหลดรายละเอียดตามตัวกรองเพื่อส่งออก...", true);
    const result = await MinimumStockBackend.getOutreachRows({
      batchId: currentOutreachAnalysisData?.batchId,
      filters: getOutreachFilterValues(),
      all: true,
      onProgress: progress => {
        if (progress?.message) showStatus(progress.message, true);
      }
    });
    return result.rows || [];
  } finally {
    outreachExportBusy = false;
    if (csvBtn) csvBtn.disabled = false;
    if (xlsxBtn) xlsxBtn.disabled = false;
  }
}

async function loadOutreachFamilyRowsForExport() {
  showStatus("กำลังตรวจผลปลายทางของถุงต้นทางทั้ง family...", true);
  const result = await MinimumStockBackend.getOutreachFamilyRows(getOutreachFilterValues(), {
    onProgress: progress => {
      if (progress?.message) showStatus(progress.message, true);
    }
  });
  return result.rows || [];
}

async function exportOutreachCsv() {
  try {
    const rawRows = await loadOutreachRowsForExport();
    const rows = mapOutreachExportRows(rawRows);
    if (!rows.length) throw new Error("ไม่มีข้อมูลตามตัวกรองสำหรับส่งออก");
    const headers = Object.keys(rows[0]);
    const csvEscape = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(csvEscape).join(","), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `outreach-blood-outcome-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showStatus(`✅ ส่งออก CSV ${rows.length.toLocaleString()} รายการแล้ว`, true);
  } catch (err) {
    showModal("error", "ส่งออก CSV ไม่สำเร็จ", err.message);
  }
}

async function exportOutreachExcel() {
  if (!window.XLSX) {
    showModal("error", "ส่งออกไม่ได้", "ไม่พบไลบรารี Excel");
    return;
  }
  try {
    const rawRows = await loadOutreachRowsForExport();
    const detailRows = mapOutreachExportRows(rawRows);
    if (!detailRows.length) throw new Error("ไม่มีข้อมูลตามตัวกรองสำหรับส่งออก");

    // v2.9.29: ใช้สมาชิก family ทั้งหมดเพื่อหาผลปลายทาง
    // Product filter เลือก family แต่ Released/Dedicated/Expired ของสมาชิกอื่นใน family ยังต้องมีผลต่อ final outcome
    const familyMemberRawRows = await loadOutreachFamilyRowsForExport();
    const familyMemberRows = mapOutreachExportRows(familyMemberRawRows);
    const audit = aggregateOutreachRowsForExport(familyMemberRawRows);
    const s = audit.summary;
    const summaryRows = [
      { รายการ: "ผลิตภัณฑ์รับเข้าทั้งหมด (ถุงต้นทาง)", จำนวน: s.received },
      { รายการ: "Bag family ไม่ซ้ำ", จำนวน: s.uniqueBags },
      { รายการ: "หาเอง – รับบริจาคในโรงพยาบาล", จำนวน: s.selfInhouse },
      { รายการ: "หาเอง – ออกหน่วย", จำนวน: s.selfOutreach },
      { รายการ: "กาชาดไทย", จำนวน: s.trc },
      { รายการ: "รับจากโรงพยาบาลอื่น", จำนวน: s.otherHospital },
      { รายการ: "ใช้ / จ่าย / ส่งต่อ", จำนวน: s.used },
      { รายการ: "Dedicated (รวมอยู่ในใช้/จ่าย/ส่งต่อ)", จำนวน: s.dedicated },
      { รายการ: "หมดอายุ (Expired เท่านั้น)", จำนวน: s.expired },
      { รายการ: "ไม่เหมาะสมต่อการใช้ (Rejected)", จำนวน: s.rejected },
      { รายการ: "ไม่เหมาะสม/ไม่ใช้ต่อ เหตุอื่น", จำนวน: s.otherDiscarded },
      { รายการ: "ยังอยู่ในคลัง/ยังไม่มีผลปลายทาง", จำนวน: s.unresolved },
      { รายการ: "ข้อมูลต้องตรวจสอบ", จำนวน: s.conflicts },
      { รายการ: "ผลลัพธ์รวม", จำนวน: s.used + s.expired + s.rejected + s.otherDiscarded + s.unresolved + s.conflicts },
      { รายการ: "ร้อยละใช้/จ่าย/ส่งต่อ", จำนวน: s.usePercent },
      { รายการ: "ร้อยละหมดอายุ", จำนวน: s.expiredPercent }
    ];
    const sourceRows = (audit.sources || []).map(item => ({
      จุดออกหน่วยหรือแหล่งรับเข้า: item.donateSource,
      กลุ่มแหล่งรับเข้า: item.sourceGroup,
      รับเข้า: item.received,
      BagFamilyไม่ซ้ำ: item.uniqueBags,
      ใช้จ่ายส่งต่อ: item.used,
      Dedicated: item.dedicated,
      หมดอายุ: item.expired,
      ไม่เหมาะสมต่อการใช้: item.rejected + item.otherDiscarded,
      Rejected: item.rejected,
      เหตุอื่นไม่ใช้ต่อ: item.otherDiscarded,
      ยังอยู่ในคลัง: item.unresolved,
      ต้องตรวจสอบ: item.conflicts,
      ผลลัพธ์รวม: item.used + item.expired + item.rejected + item.otherDiscarded + item.unresolved + item.conflicts,
      ร้อยละใช้: item.usePercent,
      ร้อยละหมดอายุ: item.expiredPercent
    }));
    const familyRows = (audit.familyRows || []).map(item => ({
      FamilyKey: item.familyKey,
      ProductFamily: item.productFamily || "",
      จุดออกหน่วยหรือแหล่งรับเข้า: item.donateSource,
      กลุ่มแหล่งรับเข้า: item.sourceGroup,
      FinalOutcome: outcomeLabel(item.outcomeCode),
      Dedicated: item.dedicated ? "Yes" : "No",
      StatusในFamily: item.statuses,
      จำนวนรายการในFamily: item.memberCount
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceRows), "By Source");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(familyRows), "Family Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Filtered Detail");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(familyMemberRows), "Family Members");
    XLSX.writeFile(wb, `outreach-blood-outcome-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showStatus(`✅ ส่งออก Excel ${detailRows.length.toLocaleString()} รายการแล้ว`, true);
  } catch (err) {
    showModal("error", "ส่งออก Excel ไม่สำเร็จ", err.message);
  }
}

function printOutreachReport() {
  window.print();
}

function bindOutreachDetailModal() {
  const overlay = document.getElementById("outreachDetailOverlay");
  const closeBtn = document.getElementById("outreachDetailCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeOutreachDetail);
  if (overlay) {
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeOutreachDetail();
    });
  }
}

document.addEventListener("DOMContentLoaded", bindOutreachDetailModal);




let currentBloodKpiInsights = null;


const KPI_SUBROUTES = new Set(['overview','utilization','expiry','trc','cqi','trc-monthly','trc-minimum','trc-bags','turnaround','aging','outreach','minimum']);
let currentBloodKpiRoute = 'overview';
let currentBloodKpiRouteData = null;
const bloodKpiFilterSelections = new Map();
const bloodKpiLazyCache = {
  dependency: new Map(),
  trend: new Map(),
  analysis: new Map(),
  familyRows: new Map(),
  trcMinimumReview: new Map(),
  dashboard: null,
  insights: new Map(),
  bootstrap: null,
  detailRequests: new Set()
};

function getKpiRouteFromHash() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  if (raw === 'kpi' || raw === 'blood-kpi') return 'utilization';
  const m = raw.match(/^(?:kpi|blood-kpi)\/([^/?#]+)/i);
  const route = String(m?.[1] || 'utilization').toLowerCase();
  return KPI_SUBROUTES.has(route) ? route : 'utilization';
}

function getKpiHash(route) {
  const safe = KPI_SUBROUTES.has(route) ? route : 'utilization';
  return safe === 'utilization' ? '#/kpi' : `#/kpi/${safe}`;
}

function getKpiSidebarLandingRoute(route) {
  if (['utilization','turnaround','aging'].includes(route)) return 'utilization';
  if (route === 'trc-monthly') return 'trc';
  if (route === 'trc-bags') return 'trc-minimum';
  if (['expiry','outreach','minimum','trc-minimum','trc','cqi'].includes(route)) return route;
  return 'utilization';
}

function setKpiTreeState(route) {
  const landing = getKpiSidebarLandingRoute(route);
  document.querySelectorAll('[data-kpi-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.kpiRoute === landing);
  });
  const tree = document.getElementById('bloodKpiTree');
  const parent = document.getElementById('bloodKpiMenuBtn');
  if (tree) tree.classList.add('open');
  if (parent) { parent.classList.add('active'); parent.setAttribute('aria-expanded','true'); }
}

function toggleKpiSideTree(treeId, parentBtn) {
  const tree = document.getElementById(treeId);
  if (!tree) return;
  const willOpen = !tree.classList.contains('open');
  document.querySelectorAll('.side-tree[data-kpi-tree]').forEach(item => {
    if (item !== tree) item.classList.remove('open');
  });
  tree.classList.toggle('open', willOpen);
  if (parentBtn && willOpen) parentBtn.classList.add('tree-open');
  document.querySelectorAll('.side-tree-parent').forEach(btn => {
    if (btn !== parentBtn) btn.classList.remove('tree-open');
  });
  if (parentBtn) parentBtn.classList.toggle('tree-open', willOpen);
  if (parentBtn) parentBtn.setAttribute('aria-expanded', String(willOpen));
}

function toggleKpiTreeAndOpen(route = 'utilization', btn = null) {
  const target = getKpiHash(route);
  if (window.location.hash === target) {
    handleAppHashRoute(true);
  } else {
    window.location.hash = target;
  }
}

function openKpiRoute(route, btn, event) {
  if (event) event.preventDefault();
  if (route === 'trc-bags' && currentBloodKpiRoute === 'trc-minimum') {
    const current = bloodKpiFilterSelections.get('trc-minimum');
    if (current) bloodKpiFilterSelections.set('trc-bags', { ...current, route:'trc-bags' });
  } else if (route === 'trc-minimum' && currentBloodKpiRoute === 'trc-bags') {
    const current = bloodKpiFilterSelections.get('trc-bags');
    if (current) bloodKpiFilterSelections.set('trc-minimum', { ...current, route:'trc-minimum' });
  }
  toggleKpiTreeAndOpen(route, btn);
}

const APP_PAGE_ROUTES = {
  upload: '#/upload',
  minimum: '#/stock',
  expiry: '#/expiry',
  mobile: '#/mobile',
  outreach: '#/outcomes',
  'trc-rare': '#/trc-required',
  install: '#/install',
  admin: '#/users',
  'admin-add': '#/users/add',
  audit: '#/audit'
};

const APP_ROUTE_ALIASES = new Map([
  ['upload', 'upload'], ['lis', 'upload'],
  ['stock', 'minimum'], ['minimum', 'minimum'],
  ['expiry', 'expiry'], ['near-expiry', 'expiry'],
  ['mobile', 'mobile'], ['mobile-unit', 'mobile'],
  ['outcomes', 'outreach'], ['outreach', 'outreach'], ['blood-outcomes', 'outreach'],
  ['trc-required', 'trc-rare'], ['trc-rare', 'trc-rare'],
  ['install', 'install'],
  ['users', 'admin'], ['users/add', 'admin-add'], ['add-user', 'admin-add'],
  ['audit', 'audit'], ['audit-log', 'audit']
]);

function normalizeAppHashPath() {
  return String(window.location.hash || '').replace(/^#\/?/, '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function getAppPageHash(page) {
  return APP_PAGE_ROUTES[page] || '#/stock';
}

function getAppPageFromHash() {
  const path = normalizeAppHashPath();
  if (!path) return 'minimum';
  return APP_ROUTE_ALIASES.get(path) || null;
}

function getAppPageButton(page) {
  return document.querySelector(`[data-app-page="${page}"]`) || null;
}

function navigateToPageRoute(page, btn = null) {
  if (page === 'blood-kpi') {
    toggleKpiTreeAndOpen('utilization', btn);
    return;
  }
  const target = getAppPageHash(page);
  if (window.location.hash === target) {
    handleAppHashRoute(true);
  } else {
    window.location.hash = target;
  }
}

function isAdminRoutePage(page) {
  return ['admin', 'admin-add', 'audit'].includes(page);
}

function handleAppHashRoute(force = false) {
  const raw = String(window.location.hash || '');

  if (/^#\/(?:kpi|blood-kpi)(?:\/|$)/i.test(raw)) {
    if (document.getElementById('installOverlay')?.style.display === 'flex') closeInstallModal();
    const route = getKpiRouteFromHash();
    const landingRoute = getKpiSidebarLandingRoute(route);
    const routeBtn = document.querySelector(`[data-kpi-route="${route}"]`) || document.querySelector(`[data-kpi-route="${landingRoute}"]`) || document.getElementById('bloodKpiMenuBtn');
    showDashboardPage('blood-kpi', routeBtn, { skipKpiLoad: true, routed: true });
    setKpiTreeState(route);
    loadBloodKpiPage(null, route, { force });
    return true;
  }

  let page = getAppPageFromHash();
  if (!page) {
    history.replaceState(null, document.title, window.location.pathname + window.location.search + '#/stock');
    page = 'minimum';
  } else if (!raw) {
    history.replaceState(null, document.title, window.location.pathname + window.location.search + '#/stock');
  }

  if (isAdminRoutePage(page)) {
    const access = window.MinimumStockAuthUI?.getCurrentAccess?.();
    if (!access?.active || access?.role !== 'admin') {
      history.replaceState(null, document.title, window.location.pathname + window.location.search + '#/stock');
      page = 'minimum';
    }
  }

  if (page !== 'install' && document.getElementById('installOverlay')?.style.display === 'flex') {
    closeInstallModal();
  }

  if (page === 'install') {
    document.querySelectorAll('.side-btn').forEach(el => el.classList.remove('active'));
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.classList.add('active');
    document.querySelectorAll('[data-kpi-route]').forEach(el => el.classList.remove('active'));
    toggleSidebar(false);
    handleInstallAppClick();
    return true;
  }

  const btn = getAppPageButton(page);
  showDashboardPage(page, btn, { routed: true });
  if (page === 'outreach') {
    const tree = document.getElementById('bloodKpiTree');
    const parent = document.getElementById('bloodKpiMenuBtn');
    if (tree) tree.classList.add('open');
    if (parent) { parent.classList.add('active'); parent.setAttribute('aria-expanded', 'true'); }
    document.querySelectorAll('[data-kpi-route]').forEach(el => el.classList.remove('active'));
  }
  return true;
}

window.addEventListener('hashchange', () => handleAppHashRoute(false));

async function ensureBloodKpiDependency(year) {
  const key = Number(year || new Date().getFullYear());
  if (bloodKpiLazyCache.dependency.has(key)) return bloodKpiLazyCache.dependency.get(key);
  const data = await MinimumStockBackend.getBloodKpiRedCellDependency(key);
  bloodKpiLazyCache.dependency.set(key, data);
  currentBloodKpiData = data;
  return data;
}

function getBloodKpiRangeMeta(filters = {}) {
  const start = String(filters.dateFrom || '');
  const end = String(filters.dateTo || '');
  const startDate = parseBloodKpiDate(start);
  const endDate = parseBloodKpiDate(end);
  const startYear = startDate ? startDate.getFullYear() : new Date().getFullYear();
  const endYear = endDate ? endDate.getFullYear() : startYear;
  return { start, end, startDate, endDate, startYear, endYear, label: `${formatThaiMonthYear(start) || '-'} – ${formatThaiMonthYear(end) || '-'}` };
}

function isBloodKpiMonthInRange(year, month, filters = {}) {
  const key = `${Number(year)}-${String(Number(month)).padStart(2,'0')}`;
  const from = String(filters.dateFrom || '').slice(0,7);
  const to = String(filters.dateTo || '').slice(0,7);
  return (!from || key >= from) && (!to || key <= to);
}

async function ensureBloodKpiDependencyRange(filters = {}) {
  const meta = getBloodKpiRangeMeta(filters);
  const years = [];
  for (let y = meta.startYear; y <= meta.endYear; y += 1) years.push(y);
  const yearly = await Promise.all(years.map(y => ensureBloodKpiDependency(y)));
  const months = [];
  yearly.forEach((data, idx) => {
    const year = years[idx];
    (data?.months || []).forEach(row => {
      if (!isBloodKpiMonthInRange(year, row?.month, filters)) return;
      months.push({ ...row, year, periodLabel: `${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row?.month||0)] || ''} ${String(year+543).slice(-2)}` });
    });
  });
  const totalRbc = months.reduce((sum,m)=>sum+Number(m.totalRbc||0),0);
  const trcRbc = months.reduce((sum,m)=>sum+Number(m.trcRbc||0),0);
  const rareTrcRbc = months.reduce((sum,m)=>sum+Number(m.rareTrcRbc||0),0);
  const routineTrcRbc = Math.max(0,trcRbc-rareTrcRbc);
  const adjustedTotalRbc = Math.max(0,totalRbc-rareTrcRbc);
  return {
    years,
    months,
    rangeLabel: meta.label,
    specialTrackingReady: yearly.every(d=>d?.specialTrackingReady !== false),
    sdrTrackingReady: yearly.every(d=>d?.sdrTrackingReady !== false),
    summary: {
      totalRbc, trcRbc, rareTrcRbc, routineTrcRbc, adjustedTotalRbc,
      rate: totalRbc ? Number(((trcRbc/totalRbc)*100).toFixed(2)) : 0,
      adjustedRate: adjustedTotalRbc ? Number(((routineTrcRbc/adjustedTotalRbc)*100).toFixed(2)) : 0
    }
  };
}

async function ensureBloodKpiAnalysis(filters = {}) {
  const key = JSON.stringify(filters || {});
  if (bloodKpiLazyCache.analysis.has(key)) return bloodKpiLazyCache.analysis.get(key);
  const data = await MinimumStockBackend.getOutreachAnalysis({ filters });
  data.reportLoaded = true;
  bloodKpiLazyCache.analysis.set(key, data);
  return data;
}

async function ensureBloodKpiTrend(year, filters = {}) {
  const key = `${Number(year || new Date().getFullYear())}|${JSON.stringify(filters || {})}`;
  if (bloodKpiLazyCache.trend.has(key)) return bloodKpiLazyCache.trend.get(key);
  const data = await MinimumStockBackend.getOutreachMonthlyTrend(Number(year), filters || {});
  bloodKpiLazyCache.trend.set(key, data);
  return data;
}

async function ensureBloodKpiTrendRange(filters = {}) {
  const key = `range|${JSON.stringify(filters || {})}`;
  if (bloodKpiLazyCache.trend.has(key)) return bloodKpiLazyCache.trend.get(key);
  const meta = getBloodKpiRangeMeta(filters);
  const years = [];
  for (let y = meta.startYear; y <= meta.endYear; y += 1) years.push(y);
  const yearly = await Promise.all(years.map(y => MinimumStockBackend.getOutreachMonthlyTrend(y, filters || {})));
  const rows = [];
  yearly.forEach((data, idx) => {
    const year = years[idx];
    trendToOutcomeRows(data).forEach(row => {
      if (!isBloodKpiMonthInRange(year, row.month, filters)) return;
      rows.push({
        ...row,
        year,
        periodLabel: `${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month||0)] || ''}${years.length > 1 ? ` ${String(year+543).slice(-2)}` : ''}`
      });
    });
  });
  const data = { months: rows, rangeLabel: meta.label, groupedBy: 'month' };
  bloodKpiLazyCache.trend.set(key,data);
  return data;
}

function isBloodKpiRbcDependencyProduct(productType) {
  const p = String(productType || '').trim().toLowerCase();
  if (!p) return false;
  return outreachProductFamilyClient(productType) === 'RBC' || /(^|[^a-z0-9])sdr([^a-z0-9]|$)/i.test(p);
}

async function ensureBloodKpiRbcSourceRange(filters = {}) {
  const key = `rbc-source|${JSON.stringify(filters || {})}`;
  if (bloodKpiLazyCache.trend.has(key)) return bloodKpiLazyCache.trend.get(key);

  const bootstrap = await ensureBloodKpiBootstrap();
  const allProducts = bootstrap?.filterOptions?.products || [];
  const rbcProducts = allProducts.filter(isBloodKpiRbcDependencyProduct);
  const meta = getBloodKpiRangeMeta(filters);
  const years = [];
  for (let y = meta.startYear; y <= meta.endYear; y += 1) years.push(y);

  const sourceGroups = [
    OUTREACH_GROUP_SELF_INHOUSE,
    OUTREACH_GROUP_SELF_OUTREACH,
    OUTREACH_GROUP_OTHER_HOSPITAL
  ];
  const baseFilters = { ...(filters || {}) };
  delete baseFilters.sourceGroups;
  delete baseFilters.sourceGroup;
  delete baseFilters.sources;
  delete baseFilters.source;
  if (rbcProducts.length) baseFilters.productTypes = rbcProducts;

  const calls = [];
  sourceGroups.forEach(sourceGroup => {
    years.forEach(year => {
      calls.push(
        MinimumStockBackend.getOutreachMonthlyTrend(year, { ...baseFilters, sourceGroups: [sourceGroup] })
          .then(data => ({ sourceGroup, year, data }))
      );
    });
  });
  const loaded = await Promise.all(calls);
  const monthMap = new Map();
  years.forEach(year => {
    for (let month = 1; month <= 12; month += 1) {
      if (!isBloodKpiMonthInRange(year, month, filters)) continue;
      const keyMonth = `${year}-${String(month).padStart(2,'0')}`;
      monthMap.set(keyMonth, {
        year,
        month,
        periodLabel: `${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][month]} ${String(year+543).slice(-2)}`,
        selfInhouse: 0,
        selfOutreach: 0,
        trcTotal: 0,
        otherHospital: 0
      });
    }
  });

  const keyByGroup = {
    [OUTREACH_GROUP_SELF_INHOUSE]: 'selfInhouse',
    [OUTREACH_GROUP_SELF_OUTREACH]: 'selfOutreach',
    [OUTREACH_GROUP_OTHER_HOSPITAL]: 'otherHospital'
  };
  loaded.forEach(({ sourceGroup, year, data }) => {
    const targetKey = keyByGroup[sourceGroup];
    (data?.months || []).forEach(row => {
      const month = Number(row?.month || 0);
      if (!month || !isBloodKpiMonthInRange(year, month, filters)) return;
      const keyMonth = `${year}-${String(month).padStart(2,'0')}`;
      const bucket = monthMap.get(keyMonth);
      if (!bucket || !targetKey) return;
      bucket[targetKey] = Number(row?.stockIn || 0);
    });
  });

  const data = {
    months: Array.from(monthMap.values()).sort((a,b) => (a.year-b.year) || (a.month-b.month)),
    rbcProducts,
    rangeLabel: meta.label
  };
  bloodKpiLazyCache.trend.set(key, data);
  return data;
}

function mergeBloodKpiTrcPlanningMonths(dependency = {}, sourceRange = {}) {
  const sourceMap = new Map((sourceRange?.months || []).map(row => [`${Number(row.year)}-${String(Number(row.month)).padStart(2,'0')}`, row]));
  return (dependency?.months || []).map(row => {
    const key = `${Number(row.year)}-${String(Number(row.month)).padStart(2,'0')}`;
    const source = sourceMap.get(key) || {};
    const rare = Number(row?.rareTrcRbc || 0);
    const routine = Number(row?.routineTrcRbc ?? Math.max(0, Number(row?.trcRbc || source?.trcTotal || 0) - rare));
    return {
      ...row,
      selfInhouse: Number(source?.selfInhouse || 0),
      selfOutreach: Number(source?.selfOutreach || 0),
      trcTotal: Number(row?.trcRbc ?? source?.trcTotal ?? 0),
      routineTrc: routine,
      rareTrc: rare,
      otherHospital: Number(source?.otherHospital || 0)
    };
  });
}

function summarizeBloodKpiTrcPlanning(rows = []) {
  const items = (Array.isArray(rows) ? rows : []).slice().sort((a,b) => (Number(a.year)-Number(b.year)) || (Number(a.month)-Number(b.month)));
  const latest = items[items.length - 1] || null;
  const previous = items.length > 1 ? items[items.length - 2] : null;
  const last3 = items.slice(-3);
  const avg3 = last3.length ? last3.reduce((sum,row)=>sum+Number(row?.routineTrc||0),0) / last3.length : 0;
  return { latest, previous, avg3, avg3Months: last3.length };
}

async function ensureBloodKpiTrcMinimumReview(filters = {}) {
  const key = JSON.stringify({ dateFrom: filters?.dateFrom || '', dateTo: filters?.dateTo || '' });
  if (bloodKpiLazyCache.trcMinimumReview.has(key)) return bloodKpiLazyCache.trcMinimumReview.get(key);
  const data = await MinimumStockBackend.getTrcMinimumReview(filters || {});
  bloodKpiLazyCache.trcMinimumReview.set(key, data);
  return data;
}

async function ensureBloodKpiFamilyRows(filters = {}) {
  const key = JSON.stringify(filters || {});
  if (bloodKpiLazyCache.familyRows.has(key)) return bloodKpiLazyCache.familyRows.get(key);
  const result = await MinimumStockBackend.getOutreachFamilyRows(filters || {});
  const rows = result?.rows || [];
  bloodKpiLazyCache.familyRows.set(key, rows);
  return rows;
}

async function ensureBloodKpiDashboard() {
  if (bloodKpiLazyCache.dashboard?.results?.length) return bloodKpiLazyCache.dashboard;
  const data = currentDashboardData?.results?.length ? currentDashboardData : await MinimumStockBackend.getDashboard({});
  bloodKpiLazyCache.dashboard = data;
  if (data?.results?.length) currentDashboardData = data;
  return data;
}

async function ensureBloodKpiBootstrap() {
  if (bloodKpiLazyCache.bootstrap) return bloodKpiLazyCache.bootstrap;
  const data = await MinimumStockBackend.getOutreachFilterBootstrap();
  bloodKpiLazyCache.bootstrap = data;
  return data;
}

async function ensureBloodKpiHeavyInsights(filters = {}) {
  const key = `range|${JSON.stringify(filters || {})}`;
  if (bloodKpiLazyCache.insights.has(key)) return bloodKpiLazyCache.insights.get(key);
  const rows = await ensureBloodKpiFamilyRows(filters || {});
  const insights = buildBloodKpiInsights({
    dependency: { summary: {} },
    analysis: { report: { summary: {} } },
    familyRows: rows,
    dashboard: { results: [] },
    year: null,
    filters
  });
  bloodKpiLazyCache.insights.set(key, insights);
  return insights;
}

function renderKpiInlineFilterPanel(route, bootstrap, preset = {}) {
  if (route === 'minimum') return '';
  const options = bootstrap?.filterOptions || {};
  const showDetailFilters = !['trc','cqi','trc-monthly','trc-minimum','trc-bags'].includes(route);
  const showTrcMinimumProductFilter = ['trc-minimum','trc-bags'].includes(route);
  const selectedTrcProducts = normalizeKpiSelectedValues(preset.trcProductGroups || []);
  const selectedSourceGroups = route === 'outreach' ? [OUTREACH_GROUP_SELF_OUTREACH] : normalizeKpiSelectedValues(preset.sourceGroups || []);
  const selectedSources = normalizeKpiSelectedValues(preset.sources || []);
  const selectedProducts = normalizeKpiSelectedValues(preset.products || []);
  const selectedBloodGroups = normalizeKpiSelectedValues(preset.bloodGroups || []);
  const selectedRhs = normalizeKpiSelectedValues(preset.rhs || []);
  const showSite = ['outreach','overview','utilization','expiry','turnaround','aging'].includes(route);
  const availableMinDate = options.minDate || bootstrap?.sourceStartDate || '';
  const availableMaxDate = options.maxDate || bootstrap?.sourceEndDate || '';
  const fromParts = outreachMonthParts(preset.dateFrom || '', '');
  const toParts = outreachMonthParts(preset.dateTo || '', '');
  return `<div class="simple-panel kpi-inline-filter-panel no-print">
    <div class="panel-heading-row kpi-inline-filter-head"><div><h3>ตัวกรองข้อมูล</h3><small class="small-muted">เลือกช่วงเวลา แล้วกดแสดงผล · ตัวกรองที่ไม่ได้เลือกหมายถึงทุกค่า</small></div></div>
    <div class="kpi-filter-grid">
      <div class="outreach-range-pair kpi-range-pair">
        <div class="outreach-range-head">
          <strong>ช่วงข้อมูล</strong>
          <div class="outreach-range-quick-actions">
            <button type="button" onclick="setKpiQuickMonthRange('thisYear')">ปีนี้</button>
            <button type="button" onclick="setKpiQuickMonthRange('last12')">12 เดือนล่าสุด</button>
            <button type="button" onclick="setKpiQuickMonthRange('all')">ทั้งหมด</button>
          </div>
        </div>
        <div class="outreach-month-year-side"><div class="outreach-month-year-controls">
          <select id="kpiMonthFromMonth" class="form-select" aria-label="เดือนเริ่มต้น" onchange="syncKpiMonthRange()">${renderOutreachMonthSelectOptions(fromParts.month)}</select>
          <select id="kpiMonthFromYear" class="form-select" aria-label="ปีเริ่มต้น" onchange="syncKpiMonthRange()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, fromParts.year)}</select>
        </div></div>
        <span class="outreach-range-arrow">→</span>
        <div class="outreach-month-year-side"><div class="outreach-month-year-controls">
          <select id="kpiMonthToMonth" class="form-select" aria-label="เดือนสิ้นสุด" onchange="syncKpiMonthRange()">${renderOutreachMonthSelectOptions(toParts.month)}</select>
          <select id="kpiMonthToYear" class="form-select" aria-label="ปีสิ้นสุด" onchange="syncKpiMonthRange()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, toParts.year)}</select>
        </div></div>
      </div>
      <div class="kpi-year-compare-row"><span>เทียบผลรายปี</span><select id="kpiCompareYearA" aria-label="ปีแรกที่เปรียบเทียบ">${renderKpiCompareYearOptions(availableMinDate,availableMaxDate,preset.compareYearA,1)}</select><span>กับ</span><select id="kpiCompareYearB" aria-label="ปีที่สองที่เปรียบเทียบ">${renderKpiCompareYearOptions(availableMinDate,availableMaxDate,preset.compareYearB,0)}</select><button type="button" onclick="applyKpiYearCompare('${route}')">แสดงกราฟเทียบปี</button></div>
      ${showDetailFilters && route === 'outreach' ? `<div class="outreach-filter-item kpi-fixed-filter"><span class="product-picker-label">กลุ่มแหล่งรับเข้า</span><strong>${escapeOutreachHtml(OUTREACH_GROUP_SELF_OUTREACH)}</strong></div>` : ''}
      ${showDetailFilters && route !== 'outreach' ? renderKpiMultiSelect('sourceGroup','กลุ่มแหล่งรับเข้า',options.sourceGroups||[],selectedSourceGroups,'ทุกกลุ่ม') : ''}
      ${showDetailFilters && showSite ? renderKpiMultiSelect('source','จุดออกหน่วย / แหล่งรับเข้า',options.sources||[],selectedSources,'ทุกจุด') : ''}
      ${showDetailFilters ? renderKpiProductFamilyShortcuts(options.products||[],selectedProducts) : ''}
      ${showDetailFilters ? renderKpiMultiSelect('product','ผลิตภัณฑ์',options.products||[],selectedProducts,'ทุกชนิด') : ''}
      ${showDetailFilters ? renderKpiMultiSelect('bloodGroup','หมู่เลือด',options.bloodGroups||[],selectedBloodGroups,'ทุกหมู่') : ''}
      ${showDetailFilters ? renderKpiMultiSelect('rh','Rh',options.rhs||[],selectedRhs,'ทุก Rh') : ''}
      ${route === 'cqi' || route === 'trc' || route === 'trc-monthly' ? '<div class="kpi-fixed-filter">ผลิตภัณฑ์: เลือดแดง (รวม SDR)</div>' : ''}
      ${showTrcMinimumProductFilter ? renderKpiMultiSelect('trcProduct','ชนิดผลิตภัณฑ์',TRC_MINIMUM_PRODUCT_FILTER_OPTIONS,selectedTrcProducts,'ทุกชนิด') : ''}
    </div>
    <div class="kpi-filter-gate-footer"><button class="btn btn-main" type="button" onclick="applyBloodKpiFilters('${route}')">แสดงผล</button></div>
  </div>`;
}

function renderKpiCategoryTabs(route) {
  const groups = {
    utilization: [
      ['utilization','การใช้ประโยชน์'],
      ['turnaround','รับเข้า → ใช้'],
      ['aging','อายุเลือดก่อนใช้']
    ],
    turnaround: [
      ['utilization','การใช้ประโยชน์'],
      ['turnaround','รับเข้า → ใช้'],
      ['aging','อายุเลือดก่อนใช้']
    ],
    aging: [
      ['utilization','การใช้ประโยชน์'],
      ['turnaround','รับเข้า → ใช้'],
      ['aging','อายุเลือดก่อนใช้']
    ],
    trc: [
      ['cqi','จัดหาเอง'],
      ['trc','รับกาชาด'],
      ['trc-monthly','รับเข้ารายเดือน']
    ],
    cqi: [
      ['cqi','จัดหาเอง'],
      ['trc','รับกาชาด'],
      ['trc-monthly','รับเข้ารายเดือน']
    ],
    'trc-monthly': [
      ['cqi','จัดหาเอง'],
      ['trc','รับกาชาด'],
      ['trc-monthly','รับเข้ารายเดือน']
    ],
    expiry: [
      ['expiry','โลหิตหมดอายุ'],
      ['minimum','Minimum Stock']
    ],
    minimum: [
      ['expiry','โลหิตหมดอายุ'],
      ['minimum','Minimum Stock']
    ],
    'trc-minimum': [
      ['trc-minimum','สรุปตามวัน'],
      ['trc-bags','ดูรายการถุง']
    ],
    'trc-bags': [
      ['trc-minimum','สรุปตามวัน'],
      ['trc-bags','ดูรายการถุง']
    ]
  };
  const tabs = groups[route];
  if (!tabs) return '';
  return `<div class="kpi-category-tabs no-print" role="navigation" aria-label="หัวข้อย่อย KPI">${tabs.map(([target,label]) => `<button class="kpi-category-tab ${target===route?'active':''}" type="button" onclick="openKpiRoute('${target}',this)">${escapeOutreachHtml(label)}</button>`).join('')}</div>`;
}

function kpiPageHeader(title, subtitle, year, years = [], showYearSelect = true) {
  const bootstrap = bloodKpiLazyCache.bootstrap || {};
  const preset = bloodKpiFilterSelections.get(currentBloodKpiRoute) || bloodKpiFilterSelections.get('overview') || {};
  const filterPanel = currentBloodKpiRoute === 'minimum' ? '' : renderKpiInlineFilterPanel(currentBloodKpiRoute, bootstrap, preset);
  return `<div class="simple-page-head mt-2">
    <div><h1>${escapeOutreachHtml(title)}</h1></div>
    <div class="d-flex gap-2 align-items-end flex-wrap no-print">
      ${['trc','trc-monthly','trc-minimum','trc-bags'].includes(currentBloodKpiRoute) ? '' : `<button class="btn btn-light" type="button" onclick="downloadCurrentKpiPng()">PNG</button>`}
      <button class="btn btn-main" type="button" onclick="window.print()">${['trc','trc-monthly','trc-minimum','trc-bags'].includes(currentBloodKpiRoute) ? 'PDF ทั้งหน้า' : 'PDF'}</button>
    </div>
  </div>${renderKpiCategoryTabs(currentBloodKpiRoute)}${filterPanel}`;
}

function getKpiYearsFromBootstrap(bootstrap) {
  const minYear = Number(String(bootstrap?.filterOptions?.minDate || bootstrap?.sourceStartDate || '').slice(0,4));
  const maxYear = Number(String(bootstrap?.filterOptions?.maxDate || bootstrap?.sourceEndDate || '').slice(0,4));
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || minYear < 1900 || maxYear < 1900) return [new Date().getFullYear()];
  const years = [];
  for (let y = Math.max(minYear,maxYear); y >= Math.min(minYear,maxYear); y -= 1) years.push(y);
  return years;
}

const kpiMultiFilterConfig = {
  sourceGroup: { label: 'กลุ่มแหล่งรับเข้า', allLabel: 'ทุกกลุ่ม' },
  source: { label: 'จุดออกหน่วย / แหล่งรับเข้า', allLabel: 'ทุกจุด' },
  product: { label: 'ผลิตภัณฑ์', allLabel: 'ทุกชนิด' },
  bloodGroup: { label: 'หมู่เลือด', allLabel: 'ทุกหมู่' },
  rh: { label: 'Rh', allLabel: 'ทุก Rh' },
  trcProduct: { label: 'ชนิดผลิตภัณฑ์', allLabel: 'ทุกชนิด' }
};
const kpiMultiFilterSnapshots = {};

function normalizeKpiSelectedValues(values) {
  return Array.from(new Set((Array.isArray(values) ? values : values ? [values] : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
}

function renderKpiMultiSelect(key, label, options, selectedValues, allLabel) {
  const selected = normalizeKpiSelectedValues(selectedValues);
  const selectedSet = new Set(selected);
  const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const summary = selected.length === 0 ? 'กรุณาเลือก' : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} รายการ`;
  return `
    <details class="filter-multi-select kpi-multi-select" id="kpiMultiPicker-${safeKey}" ontoggle="handleKpiMultiPickerToggle(this,'${safeKey}')">
      <summary>
        <span class="product-picker-label">${escapeOutreachHtml(label)}</span>
        <strong id="kpiMultiLabel-${safeKey}">${escapeOutreachHtml(summary)}</strong>
        <span class="product-picker-chevron" aria-hidden="true">⌄</span>
      </summary>
      <button class="product-multi-backdrop" type="button" aria-label="ปิดตัวเลือก" onclick="cancelKpiMultiSelection('${safeKey}')"></button>
      <div class="product-multi-menu" role="dialog" aria-modal="true" aria-label="${escapeOutreachHtml(label)}">
        <div class="product-multi-head">
          <div><strong>${escapeOutreachHtml(label)}</strong><span id="kpiMultiCount-${safeKey}">${selected.length ? `เลือกแล้ว ${selected.length} รายการ` : `ยังไม่จำกัด`}</span></div>
          <button type="button" class="product-picker-close" aria-label="ยกเลิกและปิด" onclick="cancelKpiMultiSelection('${safeKey}')">×</button>
        </div>
        <div class="product-multi-search-wrap"><span aria-hidden="true">⌕</span><input id="kpiMultiSearch-${safeKey}" class="product-multi-search" type="search" placeholder="ค้นหา" autocomplete="off" oninput="filterKpiMultiOptions('${safeKey}',this.value)" /></div>
        <div class="product-multi-actions"><button type="button" onclick="setAllKpiMulti('${safeKey}',true)">เลือกทั้งหมด</button><button type="button" onclick="setAllKpiMulti('${safeKey}',false)">ล้างทั้งหมด</button></div>
        <div class="product-multi-list" id="kpiMultiList-${safeKey}">
          ${(options || []).map(option => `<label class="product-check-row kpi-multi-row-${safeKey}" data-filter-search="${escapeOutreachHtml(String(option).toLowerCase())}"><input class="kpi-multi-check" data-filter-key="${safeKey}" type="checkbox" value="${escapeOutreachHtml(option)}" ${selectedSet.has(option) ? 'checked' : ''} onchange="updateKpiMultiDraft('${safeKey}')" /><span>${escapeOutreachHtml(option)}</span></label>`).join('')}
          <div class="product-search-empty" id="kpiMultiEmpty-${safeKey}" hidden>ไม่พบรายการที่ค้นหา</div>
        </div>
        <div class="product-multi-footer"><button type="button" class="btn-product-cancel" onclick="cancelKpiMultiSelection('${safeKey}')">ยกเลิก</button><button type="button" class="btn-product-apply" id="kpiMultiApply-${safeKey}" onclick="commitKpiMultiSelection('${safeKey}')">${selected.length ? `ใช้ตัวกรอง (${selected.length})` : 'ใช้แบบไม่จำกัด'}</button></div>
      </div>
    </details>`;
}

function getSelectedKpiMulti(key) {
  return Array.from(document.querySelectorAll(`.kpi-multi-check[data-filter-key="${key}"]:checked`)).map(el => el.value).filter(Boolean);
}

function updateKpiMultiDraft(key) {
  const selected = getSelectedKpiMulti(key);
  const count = document.getElementById(`kpiMultiCount-${key}`);
  const apply = document.getElementById(`kpiMultiApply-${key}`);
  if (count) count.textContent = selected.length ? `เลือกแล้ว ${selected.length} รายการ` : 'ยังไม่จำกัด';
  if (apply) apply.textContent = selected.length ? `ใช้ตัวกรอง (${selected.length})` : 'ใช้แบบไม่จำกัด';
}

function updateKpiMultiLabel(key) {
  const selected = getSelectedKpiMulti(key);
  const config = kpiMultiFilterConfig[key] || { allLabel: 'ทั้งหมด' };
  const label = document.getElementById(`kpiMultiLabel-${key}`);
  const helper = document.getElementById(`kpiMultiHelper-${key}`);
  if (label) label.textContent = selected.length === 0 ? 'กรุณาเลือก' : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} รายการ`;
}

function handleKpiMultiPickerToggle(details, key) {
  if (!details) return;
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 560px)').matches;
  if (details.open) {
    kpiMultiFilterSnapshots[key] = getSelectedKpiMulti(key);
    const search = document.getElementById(`kpiMultiSearch-${key}`);
    if (search) search.value = '';
    filterKpiMultiOptions(key, '');
    updateKpiMultiDraft(key);
    if (isMobile) document.body.classList.add('product-picker-open');
  } else {
    document.body.classList.remove('product-picker-open');
  }
}

function filterKpiMultiOptions(key, query) {
  const normalized = String(query || '').trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll(`.kpi-multi-row-${key}`).forEach(row => {
    const text = String(row.dataset.filterSearch || row.textContent || '').toLowerCase();
    const show = !normalized || text.includes(normalized);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const empty = document.getElementById(`kpiMultiEmpty-${key}`);
  if (empty) empty.hidden = visible > 0;
}

function setAllKpiMulti(key, selectAll) {
  document.querySelectorAll(`.kpi-multi-check[data-filter-key="${key}"]`).forEach(el => { el.checked = Boolean(selectAll); });
  updateKpiMultiDraft(key);
}

function cancelKpiMultiSelection(key) {
  const previous = new Set(kpiMultiFilterSnapshots[key] || []);
  document.querySelectorAll(`.kpi-multi-check[data-filter-key="${key}"]`).forEach(el => { el.checked = previous.has(el.value); });
  updateKpiMultiDraft(key);
  updateKpiMultiLabel(key);
  const picker = document.getElementById(`kpiMultiPicker-${key}`);
  if (picker) picker.open = false;
}

function commitKpiMultiSelection(key) {
  kpiMultiFilterSnapshots[key] = getSelectedKpiMulti(key);
  updateKpiMultiLabel(key);
  const picker = document.getElementById(`kpiMultiPicker-${key}`);
  if (picker) picker.open = false;
}

const TRC_MINIMUM_PRODUCT_FILTER_OPTIONS = [
  'เลือดแดง (LPRC/LDPRC)',
  'FFP',
  'LDPPC',
  'Cryo',
  'SDP'
];

function classifyTrcMinimumProduct(productType) {
  const p = String(productType || '').trim().toLowerCase();
  if (!p) return '';
  if (
    p.includes('leukocyte poor prc') ||
    p.includes('leukocyte-poor prc') ||
    p.includes('leukocyte poor packed red cell') ||
    p.includes('leukocyte-poor packed red cell') ||
    p.includes('leukocyte depleted prc') ||
    p.includes('leukocyte-depleted prc') ||
    p.includes('leukocyte depleted pack red cell') ||
    p.includes('leukocyte depleted packed red cell') ||
    /(^|[^a-z0-9])lprc([^a-z0-9]|$)/i.test(p) ||
    /(^|[^a-z0-9])ldprc([^a-z0-9]|$)/i.test(p)
  ) return 'เลือดแดง (LPRC/LDPRC)';
  if (p.includes('fresh frozen plasma (female)')) return '';
  if (p.includes('cryo-removed plasma') || p.includes('cryo removed plasma')) return '';
  if (p.includes('fresh frozen plasma') || p.includes('frozen plasma') || /(^|[^a-z0-9])ffp([^a-z0-9]|$)/i.test(p)) return 'FFP';
  if (p.includes('single donor platelet') || /(^|[^a-z0-9])sdp([^a-z0-9]|$)/i.test(p)) return 'SDP';
  if (p.includes('leukocyte depleted pooled platelet concentrate') || p.includes('pooled platelet concentrate') || /(^|[^a-z0-9])ldppc([^a-z0-9]|$)/i.test(p)) return 'LDPPC';
  if (p.includes('cryoprecipitate') || /(^|[^a-z0-9])cryo([^a-z0-9]|$)/i.test(p)) return 'Cryo';
  return '';
}

function filterTrcMinimumReviewByProductGroups(review = {}, selectedGroups = []) {
  const selected = new Set(normalizeKpiSelectedValues(selectedGroups));
  if (!selected.size || review?.schemaReady === false) return review;

  const rawDays = Array.isArray(review?.days) ? review.days : [];
  const days = rawDays.map(day => {
    const bags = (Array.isArray(day?.bags) ? day.bags : []).filter(bag => selected.has(classifyTrcMinimumProduct(bag?.productType)));
    if (!bags.length) return null;
    const needed = bags.filter(b => b?.canEvaluate !== false && b?.assessment !== 'review').length;
    const reviewCount = bags.filter(b => b?.canEvaluate !== false && b?.assessment === 'review').length;
    const unassessed = bags.filter(b => b?.canEvaluate === false).length;
    return {
      ...day,
      routineTrc: bags.length,
      needed,
      review: reviewCount,
      unassessed,
      bags
    };
  }).filter(Boolean);

  const monthMap = new Map();
  days.forEach(day => {
    const date = new Date(`${String(day?.date || '').slice(0,10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2,'0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { year, month, routineTrc:0, assessed:0, needed:0, review:0, unassessed:0, reviewDays:0 });
    const row = monthMap.get(key);
    row.routineTrc += Number(day?.routineTrc || 0);
    row.needed += Number(day?.needed || 0);
    row.review += Number(day?.review || 0);
    row.unassessed += Number(day?.unassessed || 0);
    row.assessed += Number(day?.needed || 0) + Number(day?.review || 0);
    if (Number(day?.review || 0) > 0) row.reviewDays += 1;
  });
  const monthly = Array.from(monthMap.values()).sort((a,b)=>(a.year-b.year)||(a.month-b.month)).map(row => ({
    ...row,
    reviewRate: row.assessed > 0 ? Number(((row.review * 100) / row.assessed).toFixed(2)) : 0
  }));

  const summary = monthly.reduce((acc,row) => {
    acc.routineTrc += Number(row.routineTrc || 0);
    acc.assessed += Number(row.assessed || 0);
    acc.needed += Number(row.needed || 0);
    acc.review += Number(row.review || 0);
    acc.unassessed += Number(row.unassessed || 0);
    acc.reviewDays += Number(row.reviewDays || 0);
    if (Number(row.review || 0) > 0) acc.reviewMonths += 1;
    return acc;
  }, { routineTrc:0, assessed:0, needed:0, review:0, unassessed:0, reviewDays:0, reviewMonths:0 });
  summary.reviewRate = summary.assessed > 0 ? Number(((summary.review * 100) / summary.assessed).toFixed(2)) : 0;
  summary.dataStart = review?.summary?.dataStart || null;

  return {
    ...review,
    productFilter: Array.from(selected),
    summary,
    monthly,
    days
  };
}

function renderKpiFilterGate(route, bootstrap, preset = {}) {
  const titles={overview:'ภาพรวม KPI เลือด',utilization:'การใช้ประโยชน์จากโลหิต',expiry:'โลหิตหมดอายุ',trc:'พึ่งกาชาด Routine',cqi:'การจัดหาโลหิตด้วยตนเอง','trc-monthly':'รับเข้ารายเดือน / ออกหน่วย','trc-minimum':'กาชาดเทียบ Minimum Stock','trc-bags':'รายการถุงที่ควรทบทวน',turnaround:'ระยะเวลาหมุนเวียนเลือด',aging:'อายุเลือดก่อนถูกใช้',outreach:'ประสิทธิผลออกหน่วย'};
  return `<div class="kpi-filter-gate-shell"><div class="simple-page-head mt-2"><h1>${escapeOutreachHtml(titles[route]||'KPI เลือด')}</h1></div>${renderKpiInlineFilterPanel(route,bootstrap,preset)}</div>`;
}

function renderKpiCompareYearOptions(minDate, maxDate, selected, fallbackOffset = 0) {
  const earliest = Number(String(minDate || '').slice(0,4));
  const latest = Number(String(maxDate || '').slice(0,4));
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return '';
  const defaultYear = Math.max(earliest,latest-fallbackOffset);
  return Array.from({length:latest-earliest+1},(_,i)=>earliest+i).map(year=>`<option value="${year}" ${year===Number(selected||defaultYear)?'selected':''}>${year+543}</option>`).join('');
}

function applyKpiYearCompare(route) {
  const a = Number(document.getElementById('kpiCompareYearA')?.value);
  const b = Number(document.getElementById('kpiCompareYearB')?.value);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return showModal('error','เลือกปีที่ต่างกัน','กรุณาเลือกสองปีที่ต้องการเปรียบเทียบ');
  setKpiMonthRangeControls(`${Math.min(a,b)}-01`,`${Math.max(a,b)}-12`);
  const selection = readBloodKpiFilterGate(route);
  selection.compareYearA = a;
  selection.compareYearB = b;
  bloodKpiFilterSelections.set(route,selection);
  loadBloodKpiPage(null,route,{apply:true,selection});
}

function renderKpiProductFamilyShortcuts(products = [], selected = []) {
  const families = [['ทั้งหมด','all'],['เลือดแดง','RBC'],['เกล็ดเลือด','PLATELET'],['FFP','FFP'],['Cryo','CRYO']];
  const group = products => products.map(p=>String(p));
  const current = group(selected);
  const options = families.map(([label,key])=>`<button type="button" class="kpi-family-preset ${key==='all' && !current.length ? 'active':''}" onclick="chooseKpiProductFamily('${key}')">${label}</button>`).join('');
  return `<div class="kpi-product-family-presets"><span>เลือกกลุ่มผลิตภัณฑ์</span>${options}</div>`;
}

function chooseKpiProductFamily(family) {
  const products = bloodKpiLazyCache.bootstrap?.filterOptions?.products || [];
  const matches = family === 'all' ? [] : products.filter(product => {
    const name = String(product||'').toLowerCase();
    if (family === 'RBC') return isBloodKpiRbcDependencyProduct(product);
    if (family === 'FFP') return classifyTrcMinimumProduct(product) === 'FFP';
    if (family === 'CRYO') return classifyTrcMinimumProduct(product) === 'Cryo';
    if (family === 'PLATELET') return outreachProductFamilyClient(product) === 'PLATELET';
    return false;
  });
  if (family !== 'all' && !matches.length) return showModal('error','ไม่มีผลิตภัณฑ์กลุ่มนี้','กรุณาตรวจชนิดผลิตภัณฑ์ในข้อมูล LIS');
  document.querySelectorAll('.kpi-multi-check[data-filter-key="product"]').forEach(input=> {input.checked=matches.includes(input.value);});
  updateKpiMultiDraft('product');updateKpiMultiLabel('product');
  document.querySelectorAll('.kpi-family-preset').forEach(button=>button.classList.toggle('active',button.textContent === ({all:'ทั้งหมด',RBC:'เลือดแดง',PLATELET:'เกล็ดเลือด',FFP:'FFP',CRYO:'Cryo'}[family])));
}

function getKpiMonthRangeControlValues() {
  const read = id => Number(document.getElementById(id)?.value || 0);
  return {
    from: outreachMonthKey(read('kpiMonthFromYear'), read('kpiMonthFromMonth')),
    to: outreachMonthKey(read('kpiMonthToYear'), read('kpiMonthToMonth'))
  };
}

function setKpiMonthRangeControls(monthFrom, monthTo) {
  const from = outreachMonthParts(monthFrom || '', '');
  const to = outreachMonthParts(monthTo || '', '');
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ? String(value) : ''; };
  set('kpiMonthFromMonth', from.month); set('kpiMonthFromYear', from.year);
  set('kpiMonthToMonth', to.month); set('kpiMonthToYear', to.year);
}

function syncKpiMonthRange() {
  const bootstrap = bloodKpiLazyCache.bootstrap || {};
  const minDate = bootstrap?.filterOptions?.minDate || bootstrap?.sourceStartDate || '';
  const maxDate = bootstrap?.filterOptions?.maxDate || bootstrap?.sourceEndDate || '';
  let { from, to } = getKpiMonthRangeControlValues();
  from = clampOutreachMonthKey(from, minDate, maxDate);
  to = clampOutreachMonthKey(to, minDate, maxDate);
  if (from && to && from > to) to = from;
  setKpiMonthRangeControls(from, to);
}

function setKpiQuickMonthRange(mode) {
  const bootstrap = bloodKpiLazyCache.bootstrap || {};
  const minDate = bootstrap?.filterOptions?.minDate || bootstrap?.sourceStartDate || '';
  const maxDate = bootstrap?.filterOptions?.maxDate || bootstrap?.sourceEndDate || '';
  const minMonth = outreachMonthValueFromDate(minDate);
  const maxMonth = outreachMonthValueFromDate(maxDate);
  if (!minMonth || !maxMonth) return;
  let monthFrom = minMonth, monthTo = maxMonth;
  const maxParts = outreachMonthParts(maxMonth);
  if (mode === 'thisYear') {
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(currentYear, Number(minMonth.slice(0,4))), Number(maxMonth.slice(0,4)));
    monthFrom = clampOutreachMonthKey(outreachMonthKey(year,1), minDate, maxDate);
    monthTo = clampOutreachMonthKey(outreachMonthKey(year,12), minDate, maxDate);
  } else if (mode === 'last12') {
    const end = new Date(maxParts.year, maxParts.month - 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    monthFrom = clampOutreachMonthKey(outreachMonthKey(start.getFullYear(), start.getMonth()+1), minDate, maxDate);
  }
  setKpiMonthRangeControls(monthFrom, monthTo);
}

function readBloodKpiFilterGate(route) {
  const range = getKpiMonthRangeControlValues();
  return {
    route,
    dateFrom: range.from ? `${range.from}-01` : '',
    dateTo: range.to ? outreachLastDayOfMonth(range.to) : '',
    sourceGroups: route === 'outreach' ? [OUTREACH_GROUP_SELF_OUTREACH] : getSelectedKpiMulti('sourceGroup'),
    sources: getSelectedKpiMulti('source'),
    products: getSelectedKpiMulti('product'),
    trcProductGroups: ['trc-minimum','trc-bags'].includes(route) ? getSelectedKpiMulti('trcProduct') : [],
    bloodGroups: getSelectedKpiMulti('bloodGroup'),
    rhs: getSelectedKpiMulti('rh')
  };
}

async function renderBloodKpiYearComparison(route, selection, filters, data) {
  const years = [Number(selection.compareYearA),Number(selection.compareYearB)];
  if (!years.every(Number.isInteger) || years[0] === years[1]) return '';
  const sliced = year => ({...filters,dateFrom:`${year}-01-01`,dateTo:`${year}-12-31`});
  let rows = [], title = '', unit = '%', note = '';
  if (route === 'cqi') {
    title = 'จัดหาโลหิตด้วยตนเอง';
    rows = (data.rows||[]).map(r=>({year:r.year,month:r.month,value:r.rate,base:r.base}));
    note = 'จุดที่ยอดแยกแหล่งไม่ตรงยอดรวมจะเว้นว่าง';
  } else if (route === 'trc') {
    title = 'พึ่งกาชาด Routine';
    rows = (data.months||[]).map(r=>({year:r.year,month:r.month,value:Number(r.adjustedTotalRbc||0)>0?Number(r.adjustedRate):null}));
  } else if (route === 'trc-monthly') {
    title = 'รับเข้ากาชาด Routine';unit = ' ถุง';
    rows = (data.planningMonths||[]).map(r=>({year:r.year,month:r.month,value:Number(r.totalRbc||0)>0?Number(r.routineTrc):null}));
  } else if (route === 'trc-minimum' || route === 'trc-bags') {
    title = 'วันที่ Stock พอแต่ยังรับกาชาด';
    rows = (data.minimumReview?.monthly||[]).map(r=>({year:r.year,month:r.month,value:Number(r.assessed||0)>0?100*Number(r.review||0)/Number(r.assessed):null}));
    note = 'ร้อยละของถุงที่ประเมินได้';
  } else if (route === 'utilization' || route === 'expiry') {
    title = route==='utilization'?'การใช้ประโยชน์':'โลหิตหมดอายุ';
    rows = (data.monthly||[]).map(r=>({year:r.year,month:r.month,value:Number(r.totalFinal||0)>0?Number(route==='utilization'?r.utilizationRate:r.expiredRate):null}));
  } else if (route === 'aging') {
    title='Median อายุเลือดก่อนใช้';unit=' วัน';
    rows=(data.monthlyAgeRows||[]).map(r=>({year:r.year,month:r.month,value:Number(r.usedCount||0)>0 && Number.isFinite(Number(r.medianDays))?Number(r.medianDays):null}));
  } else if (route === 'overview') {
    title = 'การใช้ประโยชน์จากโลหิต';
    const trend = await ensureBloodKpiTrendRange(filters);
    rows = trendToOutcomeRows(trend).map(r=>({year:r.year,month:r.month,value:r.utilizationRate}));
    note='ดูอัตราหมดอายุและการพึ่งพากาชาดแยกในแต่ละหน้า KPI';
  } else if (route === 'turnaround' || route === 'outreach') {
    title = route==='turnaround'?'Median วันรับเข้า → ใช้':'ประสิทธิผลออกหน่วย';
    unit = route==='turnaround'?' วัน':'%';
    const yearly = await Promise.all(years.map(y=>ensureBloodKpiHeavyInsights(sliced(y))));
    const yearValues = yearly.map((r,i)=>({year:years[i],value:route==='turnaround'?r.medianDaysToUse:r.outreachEffectiveness}));
    return `<div class="simple-panel kpi-executive-panel mt-3"><h3>เทียบปี · ${title}</h3>${renderKpiTwoYearBarSvg(yearValues,title,unit)}<div class="small-muted">คำนวณแยกจากรายการถุงของแต่ละปี</div></div>`;
  }
  if (!title) return '';
  const selectedRows=rows.filter(r=>years.includes(Number(r.year)));
  const overlay=renderKpiYearOverlayChart(selectedRows,'value',{title,unit,yMax:unit==='%'?100:undefined,target:route==='cqi'?85:undefined});
  return `<div class="simple-panel kpi-executive-panel mt-3"><div class="panel-heading-row"><h3>เทียบปี · ${title}</h3></div>${overlay}${note?`<div class="small-muted">${note}</div>`:''}</div>`;
}

function buildBloodKpiBackendFilters(selection = {}) {
  const filters = {};
  if (selection.dateFrom) filters.dateFrom = selection.dateFrom;
  if (selection.dateTo) filters.dateTo = selection.dateTo;
  if (Array.isArray(selection.sourceGroups) && selection.sourceGroups.length) filters.sourceGroups = selection.sourceGroups;
  if (Array.isArray(selection.sources) && selection.sources.length) filters.sources = selection.sources;
  if (Array.isArray(selection.products) && selection.products.length) filters.productTypes = selection.products;
  if (Array.isArray(selection.bloodGroups) && selection.bloodGroups.length) filters.bloodGroups = selection.bloodGroups;
  if (Array.isArray(selection.rhs) && selection.rhs.length) filters.rhs = selection.rhs;
  return filters;
}

function applyBloodKpiFilters(route) {
  const selection = readBloodKpiFilterGate(route);
  if (route !== 'minimum' && (!selection.dateFrom || !selection.dateTo)) {
    return showModal('error','กรุณาเลือกช่วงข้อมูล','เลือกเดือนเริ่มต้นและเดือนสิ้นสุดก่อน');
  }
  bloodKpiFilterSelections.set(route, selection);
  loadBloodKpiPage(null, route, { apply: true, selection });
}

function renderKpiOverview({ dependency, analysis, year }) {
  const summary = normalizeOutreachSummary(analysis?.report?.summary || {});
  const used = Number(summary.used || 0), expired = Number(summary.expired || 0);
  const finalBase = used + expired;
  const utilization = finalBase ? outreachPercent(used, finalBase) : 0;
  const expiry = finalBase ? outreachPercent(expired, finalBase) : 0;
  const depSummary = dependency?.summary || {};
  const routineRate = Number((depSummary.adjustedRate ?? depSummary.rate) || 0);
  currentBloodKpiRouteData = { route: 'overview', year, utilization, expiry, routineRate };
  return `${kpiPageHeader('ภาพรวม KPI เลือด','',year,dependency?.years||[])}
    <div class="simple-kpi-grid blood-kpi-main-grid mb-3">
      <button class="simple-kpi kpi-click-card" onclick="openKpiRoute('utilization',null,event)"><span>การใช้ประโยชน์จากโลหิต</span><strong>${utilization.toFixed(1)}%</strong></button>
      <button class="simple-kpi is-alert kpi-click-card" onclick="openKpiRoute('expiry',null,event)"><span>โลหิตหมดอายุ</span><strong>${expiry.toFixed(1)}%</strong></button>
      <button class="simple-kpi is-good kpi-click-card" onclick="openKpiRoute('trc',null,event)"><span>พึ่งพากาชาด Routine</span><strong>${routineRate.toFixed(1)}%</strong></button>
    </div>
    <div class="simple-panel kpi-executive-panel mb-3"><div class="panel-heading-row"><h3>ภาพรวมตัวชี้วัดในช่วงที่เลือก</h3></div>${renderHorizontalBarChartSvg([{label:'การใช้ประโยชน์',value:utilization},{label:'โลหิตหมดอายุ',value:expiry},{label:'พึ่งกาชาด Routine',value:routineRate}],{valueKey:'value',suffix:'%',max:100,color:'#5aa9e6'})}</div>
    <div class="kpi-overview-links">
      ${[
        ['turnaround','ระยะเวลารับเข้า → ใช้'],
        ['aging','อายุเลือดก่อนถูกใช้'],
        ['outreach','ประสิทธิผลออกหน่วย'],
        ['minimum','Minimum Stock']
      ].map(([route,title])=>`<button class="kpi-overview-link" onclick="openKpiRoute('${route}',null,event)"><strong>${title}</strong><b>›</b></button>`).join('')}
    </div>`;
}

function groupKpiRatesFromAnalysis(analysis) {
  return normalizeOutreachGroupSummary(analysis?.report?.groups || []).map(item => {
    const finalBase = Number(item.used||0) + Number(item.expired||0);
    return {
      label: item.sourceGroup || '(ไม่ระบุ)',
      used: Number(item.used||0),
      expired: Number(item.expired||0),
      totalFinal: finalBase,
      utilizationRate: finalBase ? outreachPercent(item.used, finalBase) : 0,
      expiredRate: finalBase ? outreachPercent(item.expired, finalBase) : 0
    };
  });
}

function trendToOutcomeRows(trend) {
  return (trend?.months || []).map(m => {
    const used = Number(m.used ?? m.released ?? 0), expired = Number(m.expired || 0);
    const totalFinal = Number(m.totalFinal ?? (used + expired));
    return {
      month: Number(m.month || 0), year: Number(m.year || 0), periodLabel: m.periodLabel || '',
      used, expired, totalFinal,
      unresolved: Number(m.unresolved || 0),
      utilizationRate: totalFinal ? outreachPercent(used,totalFinal) : null,
      expiredRate: totalFinal ? outreachPercent(expired,totalFinal) : null
    };
  });
}

function renderKpiReadStrip(title, text, tone = 'info') {
  return `<div class="kpi-read-strip ${tone}"><strong>${escapeOutreachHtml(title)}</strong><span>${escapeOutreachHtml(text)}</span></div>`;
}

function renderKpiInfoDetails(title, html) {
  return `<details class="kpi-info-details no-print"><summary>ⓘ ${escapeOutreachHtml(title || 'รายละเอียด')}</summary><div class="kpi-info-details-body">${html || ''}</div></details>`;
}

function getKpiTopRow(rows, valueKey, ascending = false) {
  const items = Array.isArray(rows) ? rows.filter(item => Number.isFinite(Number(item?.[valueKey]))) : [];
  if (!items.length) return null;
  const sorted = items.slice().sort((a, b) => ascending ? Number(a?.[valueKey] || 0) - Number(b?.[valueKey] || 0) : Number(b?.[valueKey] || 0) - Number(a?.[valueKey] || 0));
  return sorted[0] || null;
}

function getKpiPeakMonth(rows, valueKey) {
  const items = Array.isArray(rows) ? rows.filter(item => Number.isFinite(Number(item?.[valueKey]))) : [];
  if (!items.length) return null;
  return items.slice().sort((a, b) => Number(b?.[valueKey] || 0) - Number(a?.[valueKey] || 0))[0] || null;
}


function getKpiPeakMonthWithBase(rows, valueKey, minBase = 10) {
  const items = Array.isArray(rows) ? rows.filter(item => Number.isFinite(Number(item?.[valueKey])) && Number(item?.totalFinal || 0) > 0) : [];
  if (!items.length) return null;
  const enough = items.filter(item => Number(item?.totalFinal || 0) >= minBase);
  const pool = enough.length ? enough : items;
  return pool.slice().sort((a,b)=>Number(b?.[valueKey]||0)-Number(a?.[valueKey]||0))[0] || null;
}

function renderSingleSourceExecutiveSummary(row, mode = 'utilization') {
  if (!row) return `<div class="empty-state-card"><h3>ยังไม่มีข้อมูลแหล่งรับเข้า</h3></div>`;
  const isExpiry = mode === 'expiry';
  const value = Number(isExpiry ? row.expiredRate : row.utilizationRate || 0);
  const label = isExpiry ? 'อัตราหมดอายุของแหล่งที่เลือก' : 'อัตราการใช้ประโยชน์ของแหล่งที่เลือก';
  const tone = isExpiry ? 'single-source-alert' : 'single-source-good';
  return `<div class="single-source-summary ${tone}">
    <div><span>${escapeOutreachHtml(label)}</span><strong>${value.toFixed(1)}%</strong><small>${escapeOutreachHtml(row.label || '')}</small></div>
    <div class="single-source-meter"><div style="width:${Math.max(2,Math.min(100,value))}%"></div></div>
    <div class="small-muted">ใช้ฐาน ${Number(row.totalFinal||0).toLocaleString()} ถุงที่พร้อมใช้</div>
  </div>`;
}

function renderKpiQuickCards(cards = []) {
  const usable = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!usable.length) return '';
  return `<div class="simple-kpi-grid blood-kpi-mini-grid mb-3">${usable.map(card => `<div class="simple-kpi ${card.tone || ''}"><span>${escapeOutreachHtml(card.label || '')}</span><strong>${escapeOutreachHtml(card.value || '—')}</strong>${card.note ? `<small>${escapeOutreachHtml(card.note)}</small>` : ''}</div>`).join('')}</div>`;
}

function renderDeferredKpiPanel(route, year, dependency) {
  const config = {
    turnaround: {
      title: 'ระยะเวลาหมุนเวียนเลือด (รับเข้า → ใช้)',
      subtitle: 'ดูว่าเลือดแต่ละแหล่งใช้เร็วหรือช้าเพียงใด โดยคิดเป็นค่า Median',
      hintTitle: 'อ่านค่านี้อย่างไร',
      hintText: 'ค่ายิ่งน้อย = หมุนเวียนได้เร็วกว่า เหมาะสำหรับเทียบแหล่งเลือด ไม่ได้ใช้แทนอัตราหมดอายุ',
      bullets: ['ใช้ค่า Median เพื่อลดผลกระทบจากค่าผิดปกติ', 'เหมาะดูร่วมกับ KPI หมดอายุ', 'เปิดโหลดเมื่อพร้อมดูรายละเอียด']
    },
    aging: {
      title: 'อายุเลือดก่อนถูกใช้รายเดือน',
      subtitle: 'ดูถุงที่รับเข้าในแต่ละเดือนว่าค้างอยู่กี่วันก่อนถูกใช้/จ่าย',
      hintTitle: 'อ่านค่านี้อย่างไร',
      hintText: 'ใช้ Median วันรับเข้า → ใช้ แยกรายเดือน ค่ายิ่งต่ำหมายถึงเลือดหมุนเวียนเร็วกว่า',
      bullets: ['แสดงเดือนที่รับเข้าเป็นแกนหลัก', 'ดู Median เพื่อลดผลของค่าผิดปกติ', 'คงคลังอายุมาก ณ วันนี้จะแสดงเป็นข้อมูลรอง']
    },
    outreach: {
      title: 'ประสิทธิผลเลือดจากการออกหน่วย',
      subtitle: 'ดูว่าเลือดจากแต่ละจุดออกหน่วย ถูกใช้จริงมากน้อยเพียงใด',
      hintTitle: 'อ่านค่านี้อย่างไร',
      hintText: 'ค่ายิ่งสูงยิ่งดี แต่ควรดูจำนวนถุงร่วมด้วย เพื่อไม่ให้หลงกับจุดที่มีข้อมูลน้อยเกินไป',
      bullets: ['แสดงเฉพาะจุดที่มีข้อมูลเพียงพอ', 'เหมาะใช้เปรียบเทียบจุดออกหน่วย', 'เปิดโหลดเมื่อพร้อมดูรายละเอียด']
    }
  }[route] || {};
  currentBloodKpiRouteData = { route, year };
  const years = dependency?.years || [];
  return `${kpiPageHeader(config.title || 'KPI รายละเอียด', '', year, years, route !== 'aging')}
    <div class="simple-panel kpi-load-card">
      <div class="kpi-load-card-row"><span>${escapeOutreachHtml(config.hintText || 'กดโหลดเมื่อต้องการดูรายละเอียด')}</span><button class="btn btn-main" type="button" onclick="requestBloodKpiDeepLoad('${route}', ${Number(year)})">โหลดข้อมูล</button></div>
    </div>`;
}

function requestBloodKpiDeepLoad(route, year) {
  bloodKpiLazyCache.detailRequests.add(`${route}:${Number(year)}`);
  return loadBloodKpiPage(year, route, { deep: true, force: true });
}

function renderKpiUtilization({ analysis, trend, dependency, year }) {
  const summary = normalizeOutreachSummary(analysis?.report?.summary || {});
  const finalBase = Number(summary.used||0) + Number(summary.expired||0);
  const rate = finalBase ? outreachPercent(summary.used, finalBase) : 0;
  const groups = groupKpiRatesFromAnalysis(analysis).sort((a,b)=>b.utilizationRate-a.utilizationRate);
  const monthly = trendToOutcomeRows(trend);
  const topGroup = getKpiTopRow(groups, 'utilizationRate');
  const peakMonth = getKpiPeakMonthWithBase(monthly, 'utilizationRate', 10);
  currentBloodKpiRouteData = { route:'utilization', year, rate, groups, monthly };
  const monthNames=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${kpiPageHeader('อัตราการใช้ประโยชน์จากโลหิต','ยิ่งสูงยิ่งดี · ดูทั้งจำนวนถุงที่ใช้จริง และร้อยละการใช้ประโยชน์ในภาพเดียว',year,dependency?.years||trend?.years||[])}
    ${renderKpiQuickCards([
      { label:'ใช้ประโยชน์', value:`${rate.toFixed(1)}%`, note:`${Number(summary.used||0).toLocaleString()} / ${finalBase.toLocaleString()} ถุง`, tone:'is-good' },
      topGroup ? { label:'แหล่งสูงสุด', value:`${topGroup.label}`, note:`${topGroup.utilizationRate.toFixed(1)}% · ${topGroup.totalFinal.toLocaleString()} ถุง`, tone:'' } : null,
      peakMonth ? { label:'เดือนสูงสุด', value:peakMonth.periodLabel || monthNames[Number(peakMonth.month||0)] || '-', note:`${Number(peakMonth.utilizationRate||0).toFixed(1)}% · ${Number(peakMonth.used||0).toLocaleString()} / ${Number(peakMonth.totalFinal||0).toLocaleString()} ถุง`, tone:'' } : null
    ])}
    <div class="simple-panel kpi-executive-panel mb-3">
      <div class="panel-heading-row"><div><h3>แนวโน้มการใช้ประโยชน์</h3></div></div>
      ${renderExecutiveMonthlyRateChart(monthly, year, 'utilization')}
    </div>
    <div class="simple-panel kpi-executive-panel">
      <div class="panel-heading-row"><div><h3>เปรียบเทียบตามกลุ่มแหล่งรับเข้า</h3></div></div>
      ${groups.length <= 1 ? renderSingleSourceExecutiveSummary(groups[0], 'utilization') : renderExecutiveHorizontalBars(groups,{valueKey:'utilizationRate',suffix:'%',color:'#53c29d',max:100,countKey:'totalFinal',countLabel:'ถุงที่พร้อมใช้'})}
    </div>`;
}

function renderKpiExpiry({ analysis, trend, dependency, year }) {
  const summary = normalizeOutreachSummary(analysis?.report?.summary || {});
  const finalBase = Number(summary.used||0) + Number(summary.expired||0);
  const rate = finalBase ? outreachPercent(summary.expired, finalBase) : 0;
  const groups = groupKpiRatesFromAnalysis(analysis).sort((a,b)=>b.expiredRate-a.expiredRate);
  const monthly = trendToOutcomeRows(trend);
  const topGroup = getKpiTopRow(groups, 'expiredRate');
  const peakMonth = getKpiPeakMonthWithBase(monthly, 'expiredRate', 10);
  currentBloodKpiRouteData = { route:'expiry', year, rate, groups, monthly };
  const monthNames=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${kpiPageHeader('อัตราโลหิตหมดอายุ','ยิ่งต่ำยิ่งดี · ดูทั้งจำนวนถุงที่หมดอายุ และร้อยละที่เสียไปในแต่ละเดือน',year,dependency?.years||trend?.years||[])}
    ${renderKpiQuickCards([
      { label:'หมดอายุ', value:`${rate.toFixed(1)}%`, note:`${Number(summary.expired||0).toLocaleString()} / ${finalBase.toLocaleString()} ถุง`, tone:'is-alert' },
      topGroup ? { label:'แหล่งสูงสุด', value:`${topGroup.label}`, note:`${topGroup.expiredRate.toFixed(1)}% · ${topGroup.totalFinal.toLocaleString()} ถุง`, tone:'' } : null,
      peakMonth ? { label:'เดือนสูงสุด', value:peakMonth.periodLabel || monthNames[Number(peakMonth.month||0)] || '-', note:`${Number(peakMonth.expiredRate||0).toFixed(1)}% · ${Number(peakMonth.expired||0).toLocaleString()} / ${Number(peakMonth.totalFinal||0).toLocaleString()} ถุง`, tone:'' } : null
    ])}
    <div class="simple-panel kpi-executive-panel mb-3">
      <div class="panel-heading-row"><div><h3>แนวโน้มอัตราหมดอายุ</h3></div></div>
      ${renderExecutiveMonthlyRateChart(monthly, year, 'expiry')}
    </div>
    <div class="simple-panel kpi-executive-panel">
      <div class="panel-heading-row"><div><h3>แหล่งเลือดใดมี Expired สูงสุด</h3></div></div>
      ${groups.length <= 1 ? renderSingleSourceExecutiveSummary(groups[0], 'expiry') : renderExecutiveHorizontalBars(groups,{valueKey:'expiredRate',suffix:'%',color:'#ee8a81',max:100,countKey:'totalFinal',countLabel:'ถุงที่พร้อมใช้'})}
    </div>`;
}

function getKpiTrcCore(dependency = {}, sourceRange = null) {
  const summary = dependency?.summary || {};
  const months = dependency?.months || [];
  const planningMonths = sourceRange ? mergeBloodKpiTrcPlanningMonths(dependency, sourceRange) : [];
  const planning = summarizeBloodKpiTrcPlanning(planningMonths);
  const overall = Number(summary.rate||0), adjusted = Number(summary.adjustedRate ?? overall);
  const rare = Number(summary.rareTrcRbc||0), routine = Number(summary.routineTrcRbc ?? Math.max(0,Number(summary.trcRbc||0)-rare));
  const routineBase = Number(summary.adjustedTotalRbc ?? Math.max(0, Number(summary.totalRbc||0)-rare));
  return { summary, months, planningMonths, planning, overall, adjusted, rare, routine, routineBase };
}

function renderKpiTrc({ dependency, year }) {
  const core = getKpiTrcCore(dependency, null);
  const { months, adjusted, rare, routine, routineBase } = core;
  currentBloodKpiRouteData = { route:'trc', year, adjusted, rare, routine, routineBase, months, planningMonths:[] };
  return `${kpiPageHeader('ภาพรวมกาชาด Routine','เลือดหายาก / Ag-matched / Rh Negative แยกออกจาก Routine KPI',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'พึ่งกาชาด Routine', value:`${adjusted.toFixed(1)}%`, note:`${routine.toLocaleString()} / ${routineBase.toLocaleString()} ถุง`, tone:'is-good' },
      { label:'เลือดหายาก / จำเป็น', value:`${rare.toLocaleString()} ถุง`, note:'ไม่รวม Routine KPI', tone:'' }
    ])}
    <div class="simple-panel kpi-executive-panel mb-3" id="trc-rate-panel">
      <div class="panel-heading-row"><div><h3>แนวโน้มรายเดือน</h3></div><button class="btn btn-light btn-sm no-print" type="button" onclick="downloadTrcChartPng('rate')">PNG</button></div>
      <div id="trc-rate-chart">${renderTrcRangeSvg(months)}</div>
    </div>
`;
}

function calculateCqiSelfSupplyMonths(dependency = {}, sourceRange = {}) {
  const rows = mergeBloodKpiTrcPlanningMonths(dependency, sourceRange);
  return rows.map(row => {
    const own = Number(row.selfInhouse || 0) + Number(row.selfOutreach || 0);
    const trc = Number(row.trcTotal || 0);
    const other = Number(row.otherHospital || 0);
    const base = own + trc + other;
    const dependencyBase = Number(row.totalRbc || 0);
    return { ...row, own, trc, other, base, dependencyBase,
      consistent: base === dependencyBase,
      rate: base > 0 && base === dependencyBase ? own / base * 100 : null };
  });
}

function renderKpiYearOverlayChart(rows = [], key = 'rate', options = {}) {
  const years = [...new Set(rows.map(r => Number(r.year)).filter(Boolean))].sort();
  if (!years.length) return '<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>';
  const names = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const colors = ['#3a84c4','#ef9148','#54a984','#946bc0'];
  const values = rows.map(r => r[key]).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  const max = Math.max(Number(options.yMax || 0), Number(options.target || 0), ...values, 1);
  const yMax = options.yMax || Math.ceil(max * 1.1 / 10) * 10;
  const w = 1000, h = 445, left = 70, right = 45, top = 85, bottom = 60;
  const x = m => left + (m - 1) * (w-left-right) / 11;
  const y = v => top + (h-top-bottom) * (1 - Math.max(0, Math.min(yMax, Number(v))) / yMax);
  const grid = [0,.25,.5,.75,1].map(f => { const v=yMax*f; return `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#e7eff5"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#60798c">${Number(v.toFixed(1))}${options.unit||''}</text>`; }).join('');
  const series = years.map((year,i) => {
    const color = colors[i % colors.length];
    const pts = rows.filter(r=>Number(r.year)===year && r[key] !== null && r[key] !== undefined && Number.isFinite(Number(r[key]))).sort((a,b)=>Number(a.month)-Number(b.month));
    // A missing month breaks the line; no point is inferred from another month.
    const paths = pts.map((r,j)=>`${j && Number(r.month)===Number(pts[j-1].month)+1 ? 'L':'M'}${x(Number(r.month))},${y(r[key])}`).join(' ');
    const dots = pts.map(r => `<circle cx="${x(Number(r.month))}" cy="${y(r[key])}" r="5" fill="#fff" stroke="${color}" stroke-width="3"><title>${names[Number(r.month)]} ${year+543}: ${Number(r[key]).toFixed(1)}${options.unit||''}</title></circle><text x="${x(Number(r.month))}" y="${Math.max(top+15,y(r[key])-(i%2?22:12))}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${Number(r[key]).toFixed(1)}${options.unit||''}</text>`).join('');
    return `<path d="${paths}" fill="none" stroke="${color}" stroke-width="3.5"/>${dots}<g transform="translate(${left+i*155},57)"><line x1="0" y1="0" x2="25" y2="0" stroke="${color}" stroke-width="4"/><text x="32" y="4" font-size="13" fill="#3a536b">${year+543}</text></g>`;
  }).join('');
  const goal = Number(options.target) > 0 ? `<line x1="${left}" y1="${y(options.target)}" x2="${w-right}" y2="${y(options.target)}" stroke="#df6866" stroke-width="2" stroke-dasharray="8 6"/><text x="${w-right-3}" y="${y(options.target)-7}" text-anchor="end" fill="#b94646" font-size="12" font-weight="700">เป้าหมาย ${options.target}${options.unit||''}</text>` : '';
  const labels = names.slice(1).map((name,i)=>`<text x="${x(i+1)}" y="${h-24}" text-anchor="middle" font-size="12" fill="#647c91">${name}</text>`).join('');
  return `<div class="kpi-year-chart-scroll"><svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeOutreachHtml(options.title||'เปรียบเทียบรายเดือนแยกปี')}"><rect x="5" y="5" width="${w-10}" height="${h-10}" rx="20" fill="#fff" stroke="#e7eff5"/><text x="${left}" y="34" font-size="17" font-weight="700" fill="#234969">${escapeOutreachHtml(options.title||'เปรียบเทียบรายเดือนแยกปี')}</text>${grid}${goal}${series}${labels}</svg></div><div class="small-muted mt-2">จุดที่ไม่มีข้อมูลจะเว้นว่าง ไม่มีการแทนค่าเป็น 0</div>`;
}

function renderKpiTwoYearBarSvg(items, title, unit) {
  const max=Math.max(1,...items.map(r=>Number(r.value)||0));
  const bars=items.map((r,i)=>{
    const y=85+i*100, width=Math.max(0,Math.min(590,(Number(r.value)||0)/max*590));
    return `<text x="80" y="${y+22}" fill="#335c76" font-size="20" font-weight="700">${r.year+543}</text><rect x="170" y="${y}" width="590" height="35" rx="13" fill="#edf4f9"/><rect x="170" y="${y}" width="${width}" height="35" rx="13" fill="${i?'#eaa174':'#5da9d9'}"/><text x="780" y="${y+24}" fill="#34546c" font-size="20" font-weight="700">${r.value !== null && r.value !== undefined && Number.isFinite(Number(r.value))?Number(r.value).toFixed(1)+unit:'ไม่มีข้อมูล'}</text>`;
  }).join('');
  return `<svg class="kpi-exec-chart" viewBox="0 0 1050 330" role="img" aria-label="${escapeOutreachHtml(title)}"><rect width="1050" height="330" rx="18" fill="#fff"/><text x="55" y="43" fill="#244967" font-size="20" font-weight="700">${escapeOutreachHtml(title)}</text>${bars}</svg>`;
}

function renderKpiCqi({ dependency, sourceRange, year }) {
  const rows = calculateCqiSelfSupplyMonths(dependency, sourceRange);
  const eligible = rows.filter(row => row.rate !== null);
  const mismatched = rows.filter(row => row.base !== row.dependencyBase);
  const passed = eligible.filter(row => row.rate >= 85).length;
  const coverage = eligible.length ? passed / eligible.length * 100 : null;
  const monthName = row => `${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month)||0]} ${Number(row.year||0)+543}`;
  currentBloodKpiRouteData = { route:'cqi', year, rows, passed, coverage };
  return `${kpiPageHeader('การจัดหาโลหิตด้วยตนเอง','เป้าหมายรายเดือน ≥ 85% และผ่านอย่างน้อย 50% ของเดือนที่มีข้อมูล',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      {label:'เดือนผ่านเกณฑ์ ≥ 85%',value:eligible.length ? `${passed} / ${eligible.length} เดือน` : '—',note:'นับเฉพาะเดือนที่มีข้อมูลและยอดตรงกัน',tone:coverage >= 50 ? 'is-good' : 'is-alert'},
      {label:'สัดส่วนเดือนที่ผ่าน',value:coverage === null ? '—' : `${coverage.toFixed(1)}%`,note:'เป้าหมาย ≥ 50%',tone:coverage >= 50 ? 'is-good' : 'is-alert'},
      {label:'เดือนต้องตรวจสอบ',value:`${mismatched.length} เดือน`,note:'ยอดแยกแหล่งไม่ตรงยอดรวม จึงงดตัดสินผล',tone:mismatched.length ? 'is-alert' : ''}
    ])}
    <div class="simple-panel kpi-executive-panel mb-3"><div class="panel-heading-row"><div><h3>แนวโน้มการจัดหาโลหิตด้วยตนเอง</h3></div></div>${renderKpiYearOverlayChart(rows, 'rate', {title:'สัดส่วนจัดหาเองรายเดือน (%)', target:85, yMax:100, unit:'%'})}</div>
    <div class="simple-panel kpi-executive-panel mb-3"><div class="panel-heading-row"><div><h3>ผลรายเดือน</h3></div></div>
    <div class="table-responsive"><table class="table simple-table align-middle mb-0"><thead><tr><th>เดือน</th><th class="text-end">จัดหาเอง ใน รพ. + ออกหน่วย</th><th class="text-end">กาชาด</th><th class="text-end">รพ.อื่น</th><th class="text-end">รวม</th><th class="text-end">จัดหาเอง</th><th>ผล ≥ 85%</th></tr></thead><tbody>
    ${rows.length ? rows.map(row => `<tr><td>${escapeOutreachHtml(monthName(row))}</td><td class="text-end">${row.own.toLocaleString()}</td><td class="text-end">${row.trc.toLocaleString()}</td><td class="text-end">${row.other.toLocaleString()}</td><td class="text-end">${row.base.toLocaleString()}</td><td class="text-end fw-bold">${row.rate === null ? '—' : row.rate.toFixed(1)+'%'}</td><td>${row.base !== row.dependencyBase ? 'ตรวจสอบยอด' : row.rate === null ? 'ไม่มีข้อมูล' : row.rate >= 85 ? 'ผ่าน' : 'ไม่ผ่าน'}</td></tr>`).join('') : '<tr><td colspan="7">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>'}
    </tbody></table></div></div>
    <div class="simple-panel"><h3>นิยามที่ใช้</h3><p class="mb-1">จัดหาเอง (%) = (หาเองใน รพ. + หาเองออกหน่วย) ÷ เลือดแดงรับเข้าทุกแหล่ง × 100 · นับเป็นรายเดือน</p><p class="small-muted mb-0">นับระดับถุงต้นทางตามวันที่รับเข้า; เดือนที่ยอดแยกแหล่งไม่เท่ากับยอดรวม หรือไม่มีเลือดรับเข้า จะไม่รวมในตัวหารเดือนประเมิน</p></div>`;
}

function renderKpiTrcMonthly({ dependency, sourceRange, year }) {
  const core = getKpiTrcCore(dependency, sourceRange);
  const { planningMonths, planning, adjusted, rare, routine, routineBase, months } = core;
  const latestRoutine = Number(planning.latest?.routineTrc || 0);
  const previousRoutine = Number(planning.previous?.routineTrc || 0);
  const latestLabel = planning.latest?.periodLabel || 'เดือนล่าสุด';
  const previousLabel = planning.previous?.periodLabel || 'เดือนก่อน';
  currentBloodKpiRouteData = { route:'trc-monthly', year, adjusted, rare, routine, routineBase, months, planningMonths };
  return `${kpiPageHeader('รับเข้ารายเดือน / ออกหน่วย','ดูจำนวนรับเข้าจากกาชาด Routine เทียบเลือดที่ได้จากการออกหน่วย',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:`กาชาด · ${latestLabel}`, value:`${latestRoutine.toLocaleString()} ถุง`, note:`เดือนก่อน ${previousRoutine.toLocaleString()} ถุง`, tone:'' },
      { label:`เฉลี่ย ${planning.avg3Months || 0} เดือน`, value:`${planning.avg3.toLocaleString(undefined,{maximumFractionDigits:1})} ถุง/เดือน`, note:'', tone:'' },
      { label:'พึ่งกาชาด Routine', value:`${adjusted.toFixed(1)}%`, note:`${routine.toLocaleString()} / ${routineBase.toLocaleString()} ถุง`, tone:'is-good' }
    ])}
    <div class="simple-panel kpi-executive-panel mb-3" id="trc-outreach-panel">
      <div class="panel-heading-row"><div><h3>กาชาด Routine vs ออกหน่วย</h3></div><button class="btn btn-light btn-sm no-print" type="button" onclick="downloadTrcChartPng('outreach')">PNG</button></div>
      <div id="trc-outreach-chart">${renderRoutineTrcVsOutreachMonthlySvg(planningMonths)}</div>
    </div>
    <div class="simple-panel kpi-executive-panel" id="trc-source-panel">
      <div class="panel-heading-row"><div><h3>รับเข้าแยกตามแหล่ง</h3></div><button class="btn btn-light btn-sm no-print" type="button" onclick="downloadTrcChartPng('source')">PNG</button></div>
      <div id="trc-source-chart">${renderRbcSourceIntakeMonthlySvg(planningMonths)}</div>
    </div>`;
}

function renderKpiTrcMinimum({ dependency, sourceRange, minimumReview, year }) {
  const core = getKpiTrcCore(dependency, sourceRange);
  const { planningMonths, adjusted, rare, routine, routineBase, months } = core;
  currentBloodKpiRouteData = { route:'trc-minimum', year, adjusted, rare, routine, routineBase, months, planningMonths, minimumReview };
  return `${kpiPageHeader('กาชาดเทียบ Minimum Stock','คัดกรองเดือนที่รับกาชาด Routine ทั้งที่ Stock ต้นวันถึง Minimum แล้ว',year,dependency?.years||[])}
    ${renderTrcMinimumReviewPanel(minimumReview, planningMonths, { includeDetails:false })}
    <div class="kpi-inline-actions no-print"><button class="btn btn-main btn-sm" type="button" onclick="openKpiRoute('trc-bags',this)">ดูรายการถุง</button></div>`;
}

function renderKpiTrcBags({ dependency, sourceRange, minimumReview, year }) {
  const core = getKpiTrcCore(dependency, sourceRange);
  const { planningMonths, adjusted, rare, routine, routineBase, months } = core;
  currentBloodKpiRouteData = { route:'trc-bags', year, adjusted, rare, routine, routineBase, months, planningMonths, minimumReview };
  return `${kpiPageHeader('รายการถุงที่ควรทบทวน','',year,dependency?.years||[])}
    <div class="simple-panel kpi-executive-panel mb-3"><div class="panel-heading-row"><h3>ถุงที่ควรทบทวนรายเดือน</h3></div>${renderTrcMinimumReviewMonthlySvg(minimumReview,planningMonths)}</div>
    ${renderTrcMinimumReviewPanel(minimumReview, planningMonths, { includeChart:false, includeDetails:true })}`;
}

function renderKpiTurnaround({ insights, dependency, year }) {
  const rows=(insights.sourceGroupRates||[]).filter(r=>Number.isFinite(r.medianDaysToUse)).sort((a,b)=>a.medianDaysToUse-b.medianDaysToUse);
  const fastest = rows[0] || null;
  const slowest = rows.length ? rows[rows.length - 1] : null;
  currentBloodKpiRouteData={route:'turnaround',year,value:insights.medianDaysToUse,groups:rows};
  return `${kpiPageHeader('ระยะเวลาหมุนเวียนเลือด (รับเข้า → ใช้)','',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'Median', value:Number.isFinite(insights.medianDaysToUse)? `${insights.medianDaysToUse} วัน` : '—', note:'', tone:'' },
      fastest ? { label:'เร็วที่สุด', value: fastest.label, note:`Median ${Number(fastest.medianDaysToUse||0).toFixed(1)} วัน`, tone:'is-good' } : null,
      slowest ? { label:'ช้าที่สุด', value: slowest.label, note:`Median ${Number(slowest.medianDaysToUse||0).toFixed(1)} วัน`, tone:'is-alert' } : null
    ])}
    <div class="simple-panel"><div class="panel-heading-row"><div><h3>Median วันแยกตามแหล่งเลือด</h3></div></div>${renderHorizontalBarChartSvg(rows,{valueKey:'medianDaysToUse',suffix:' วัน',color:'#5aa9e6',sublabelKey:'totalFinal',sublabelSuffix:' ถุงที่พร้อมใช้'})}</div>`;
}

function renderKpiAging({ insights, dependency, year }) {
  const rows = Array.isArray(insights.monthlyAgeRows) ? insights.monthlyAgeRows : [];
  const valid = rows.filter(r => Number.isFinite(r.medianDays) && Number(r.usedCount||0) > 0);
  const longest = valid.length ? valid.slice().sort((a,b)=>Number(b.medianDays||0)-Number(a.medianDays||0))[0] : null;
  const monthNames=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  currentBloodKpiRouteData={route:'aging',year,rate:insights.longHeldRate,count:insights.longHeldCount,base:insights.longHeldBase,monthlyAgeRows:rows,groups:rows};
  return `${kpiPageHeader('อายุเลือดก่อนถูกใช้','',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'Median', value:Number.isFinite(insights.medianDaysToUse)?`${insights.medianDaysToUse} วัน`:'—', note:'', tone:'' },
      longest ? { label:'ค้างนานสุด', value:longest.periodLabel || monthNames[Number(longest.month||0)] || '-', note:`${Number(longest.medianDays||0).toFixed(1)} วัน · ${Number(longest.usedCount||0).toLocaleString()} ถุง`, tone:'is-alert' } : null,
      { label:'คงคลัง ≥ 21 วัน', value:`${Number(insights.longHeldRate||0).toFixed(1)}%`, note:`RBC ≥ 21 วัน ${Number(insights.longHeldCount||0).toLocaleString()} / ${Number(insights.longHeldBase||0).toLocaleString()} ถุง`, tone:'' }
    ])}
    <div class="simple-panel kpi-executive-panel mb-3">
      <div class="panel-heading-row"><div><h3>Median วันค้างก่อนใช้</h3></div></div>
      ${renderMonthlyAgeExecutiveSvg(rows,insights.rangeLabel || '')}
    </div>
    <div class="kpi-two-chart-grid">
      <div class="simple-panel"><div class="panel-heading-row"><div><h3>สัดส่วนช่วงอายุเลือดก่อนใช้</h3></div></div>${renderAgeDistributionSvg(insights.ageDistribution||{})}</div>
      <div class="simple-panel"><div class="panel-heading-row"><div><h3>คงคลังอายุมาก ณ วันนี้</h3></div></div><div class="kpi-current-aging-note"><strong>${Number(insights.longHeldCount||0).toLocaleString()} ถุง</strong><span>RBC ≥ 21 วัน · ${Number(insights.longHeldBase||0).toLocaleString()} ถุงในฐาน</span></div></div>
    </div>`;
}

function renderKpiOutreach({ insights, dependency, year }) {
  const rows=(insights.outreachEffectRows||[]).slice().sort((a,b)=>b.rate-a.rate || b.finalCount-a.finalCount);
  const best = rows[0] || null;
  const weakest = rows.length ? rows[rows.length - 1] : null;
  currentBloodKpiRouteData={route:'outreach',year,rate:insights.outreachEffectiveness,rows};
  return `${kpiPageHeader('ประสิทธิผลเลือดจากการออกหน่วย','',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'ประสิทธิผล', value:`${Number(insights.outreachEffectiveness||0).toFixed(1)}%`, note:'', tone:'is-good' },
      best ? { label:'จุดสูงสุด', value: best.label, note:`${best.rate.toFixed(1)}% จาก ${best.finalCount.toLocaleString()} ถุง`, tone:'' } : null,
      weakest ? { label:'ควรติดตาม', value: weakest.label, note:`${weakest.rate.toFixed(1)}% จาก ${weakest.finalCount.toLocaleString()} ถุง`, tone:'is-alert' } : null
    ])}
    <div class="simple-panel"><div class="panel-heading-row"><div><h3>Top จุดออกหน่วยตามอัตราการใช้ประโยชน์</h3></div></div>${renderHorizontalBarChartSvg(rows,{valueKey:'rate',suffix:'%',color:'#68c3a3',max:100,sublabelKey:'finalCount',sublabelSuffix:' ถุงที่พร้อมใช้'})}</div>`;
}

let minimumKpiProductFamily = 'all';
function changeMinimumKpiProductFamily(value) {
  minimumKpiProductFamily = ['all','RBC','PLATELET','FFP','CRYO'].includes(value) ? value : 'all';
  const box=document.getElementById('bloodKpiDashboard');
  if (box && bloodKpiLazyCache.dashboard) { box.innerHTML=renderKpiMinimum({dashboard:bloodKpiLazyCache.dashboard,year:new Date().getFullYear()});enhanceBloodKpiChartExports(box); }
}
function renderKpiMinimum({ dashboard, year }) {
  const all=(dashboard?.results||[]);
  const filtered=all.filter(r=>{
    if(minimumKpiProductFamily==='all')return true;
    const type=String(r.type||'');
    if(minimumKpiProductFamily==='FFP')return classifyTrcMinimumProduct(type)==='FFP';
    if(minimumKpiProductFamily==='CRYO')return classifyTrcMinimumProduct(type)==='Cryo';
    return minimumKpiProductFamily==='RBC'?isBloodKpiRbcDependencyProduct(type):outreachProductFamilyClient(type)==='PLATELET';
  });
  const rows=filtered.filter(r=>Number(r?.gap||0)<0).map(r=>({type:r.type||'',bloodGroup:r.bloodGroup||'',minimumStock:Number(r.minimumStock||0),netAvailable:Number(r.netAvailable||0),gap:Number(r.gap||0)}));
  currentBloodKpiRouteData={route:'minimum',year,rows,total:Number(dashboard?.results?.length||0)};
  return `${kpiPageHeader('Minimum Stock','',year,[], false)}
    <div class="simple-panel kpi-inline-filter-panel no-print"><div class="panel-heading-row"><h3>ตัวกรองข้อมูล · Stock วันนี้</h3></div><label>กลุ่มผลิตภัณฑ์ <select class="form-select" style="max-width:280px" onchange="changeMinimumKpiProductFamily(this.value)">${[['all','ทุกชนิด'],['RBC','เลือดแดง'],['PLATELET','เกล็ดเลือด'],['FFP','FFP'],['CRYO','Cryo']].map(([value,label])=>`<option value="${value}" ${minimumKpiProductFamily===value?'selected':''}>${label}</option>`).join('')}</select></label><small class="small-muted">Stock ณ วันนี้ ไม่มีข้อมูลย้อนหลังสำหรับเทียบปี</small></div>
    ${renderKpiQuickCards([
      { label:'ต่ำกว่า Minimum วันนี้', value:`${rows.length} รายการ`, note:`จาก ${filtered.length} รายการ`, tone:'is-alert' }
    ])}
    <div class="simple-panel kpi-executive-panel mb-3"><div class="panel-heading-row"><h3>จำนวนที่ขาดจาก Minimum วันนี้</h3></div>${renderHorizontalBarChartSvg(rows.slice().sort((a,b)=>a.gap-b.gap).slice(0,8).map(r=>({label:`${r.type} ${r.bloodGroup}`,value:Math.abs(r.gap)})),{valueKey:'value',suffix:' ถุง',color:'#ec8b80'})}</div>
    <div class="simple-panel"><div class="panel-heading-row"><div><h3>รายการที่ต่ำกว่า Minimum วันนี้</h3></div></div><div class="table-responsive"><table class="table simple-table align-middle mb-0"><thead><tr><th>ชนิด</th><th>หมู่เลือด</th><th class="text-end">Minimum</th><th class="text-end">ใช้ได้จริง</th><th class="text-end">ขาด</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${escapeOutreachHtml(r.type)}</td><td><b>${escapeOutreachHtml(r.bloodGroup)}</b></td><td class="text-end">${r.minimumStock}</td><td class="text-end">${r.netAvailable}</td><td class="text-end text-danger">${Math.abs(r.gap)}</td></tr>`).join(''):`<tr><td colspan="5" class="small-muted">ไม่มีรายการต่ำกว่า Minimum วันนี้</td></tr>`}</tbody></table></div></div>`;
}

async function loadBloodKpiPage(year = null, route = null, options = {}) {
  const box = document.getElementById('bloodKpiDashboard');
  if (!box) return;
  const safeRoute = KPI_SUBROUTES.has(route) ? route : (route || getKpiRouteFromHash());
  currentBloodKpiRoute = KPI_SUBROUTES.has(safeRoute) ? safeRoute : 'overview';
  setKpiTreeState(currentBloodKpiRoute);
  try {
    if ((!options?.apply || options?.filterOnly) && currentBloodKpiRoute !== 'minimum') {
      const bootstrap = await ensureBloodKpiBootstrap();
      const preset = bloodKpiFilterSelections.get(currentBloodKpiRoute) || bloodKpiFilterSelections.get('overview') || {};
      box.innerHTML = renderKpiFilterGate(currentBloodKpiRoute, bootstrap, preset);
      return;
    }
    if (currentBloodKpiRoute === 'minimum' && (!options?.apply || options?.filterOnly)) {
      const dashboard = await ensureBloodKpiDashboard();
      box.innerHTML = renderKpiMinimum({ dashboard, year:new Date().getFullYear() });
      enhanceBloodKpiChartExports(box);
      return;
    }
    const selection = options?.selection || bloodKpiFilterSelections.get(currentBloodKpiRoute) || {};
    const filters = buildBloodKpiBackendFilters(selection);
    const meta = getBloodKpiRangeMeta(filters);
    const endYear = meta.endYear;
    box.innerHTML = `<div class="hero-card mt-4"><div class="fw-bold">กำลังโหลด...</div></div>`;
    let html = '';
    if (currentBloodKpiRoute === 'overview') {
      const [dependency, analysis] = await Promise.all([ensureBloodKpiDependencyRange(filters), ensureBloodKpiAnalysis(filters)]);
      html = renderKpiOverview({dependency,analysis,year:endYear});
    } else if (currentBloodKpiRoute === 'utilization') {
      const [dependency, analysis, trend] = await Promise.all([ensureBloodKpiDependencyRange(filters), ensureBloodKpiAnalysis(filters), ensureBloodKpiTrendRange(filters)]);
      html = renderKpiUtilization({dependency,analysis,trend,year:endYear});
    } else if (currentBloodKpiRoute === 'expiry') {
      const [dependency, analysis, trend] = await Promise.all([ensureBloodKpiDependencyRange(filters), ensureBloodKpiAnalysis(filters), ensureBloodKpiTrendRange(filters)]);
      html = renderKpiExpiry({dependency,analysis,trend,year:endYear});
    } else if (currentBloodKpiRoute === 'trc') {
      const dependency = await ensureBloodKpiDependencyRange(filters);
      html = renderKpiTrc({dependency,year:endYear});
    } else if (currentBloodKpiRoute === 'cqi') {
      const [dependency, sourceRange] = await Promise.all([ensureBloodKpiDependencyRange(filters), ensureBloodKpiRbcSourceRange(filters)]);
      html = renderKpiCqi({dependency,sourceRange,year:endYear});
    } else if (currentBloodKpiRoute === 'trc-monthly') {
      const [dependency, sourceRange] = await Promise.all([
        ensureBloodKpiDependencyRange(filters),
        ensureBloodKpiRbcSourceRange(filters)
      ]);
      html = renderKpiTrcMonthly({dependency,sourceRange,year:endYear});
    } else if (['trc-minimum','trc-bags'].includes(currentBloodKpiRoute)) {
      const [dependency, sourceRange, minimumReviewRaw] = await Promise.all([
        ensureBloodKpiDependencyRange(filters),
        ensureBloodKpiRbcSourceRange(filters),
        ensureBloodKpiTrcMinimumReview(filters)
      ]);
      const minimumReview = filterTrcMinimumReviewByProductGroups(minimumReviewRaw, selection?.trcProductGroups || []);
      html = currentBloodKpiRoute === 'trc-minimum'
        ? renderKpiTrcMinimum({dependency,sourceRange,minimumReview,year:endYear})
        : renderKpiTrcBags({dependency,sourceRange,minimumReview,year:endYear});
    } else if (['turnaround','aging','outreach'].includes(currentBloodKpiRoute)) {
      const insights = await ensureBloodKpiHeavyInsights(filters);
      insights.rangeLabel = meta.label;
      const dependency = { years: [] };
      html = currentBloodKpiRoute === 'turnaround' ? renderKpiTurnaround({insights,dependency,year:endYear}) : currentBloodKpiRoute === 'aging' ? renderKpiAging({insights,dependency,year:endYear}) : renderKpiOutreach({insights,dependency,year:endYear});
    } else if (currentBloodKpiRoute === 'minimum') {
      const dashboard = await ensureBloodKpiDashboard();
      html = renderKpiMinimum({dashboard,year:new Date().getFullYear()});
    }
    box.innerHTML = html;
    if (selection.compareYearA && selection.compareYearB && currentBloodKpiRoute !== 'minimum') {
      const resultRoute = currentBloodKpiRoute;
      try {
        const comparison = await renderBloodKpiYearComparison(resultRoute,selection,filters,currentBloodKpiRouteData||{});
        if (resultRoute===currentBloodKpiRoute && box.isConnected) box.insertAdjacentHTML('beforeend',comparison);
      } catch (compareError) {
        if (resultRoute===currentBloodKpiRoute) box.insertAdjacentHTML('beforeend',`<div class="simple-panel small-muted">เทียบปีไม่ได้: ${escapeOutreachHtml(compareError.message)}</div>`);
      }
    }
    enhanceBloodKpiChartExports(box);
  } catch (err) {
    box.innerHTML = `<div class="hero-card mt-4"><h4 class="fw-bold mb-2">เปิด KPI นี้ไม่ได้</h4><div class="small-muted mb-3">${escapeOutreachHtml(err.message)}</div><button class="btn btn-main" type="button" onclick="loadBloodKpiPage(null,currentBloodKpiRoute,{filterOnly:true})">ตัวกรอง</button></div>`;
  }
}

function enhanceBloodKpiChartExports(root) {
  root.querySelectorAll('.simple-panel svg').forEach(svg=>{
    const panel = svg.closest('.simple-panel');
    const heading = panel?.querySelector('.panel-heading-row') || panel;
    if (!heading || heading.querySelector('.kpi-export-chart') || [...heading.querySelectorAll('button')].some(button=>/PNG/i.test(button.textContent||''))) return;
    const button=document.createElement('button');
    button.type='button';button.className='btn btn-light btn-sm no-print kpi-export-chart';
    button.textContent='บันทึกกราฟ PNG';
    button.onclick=()=>downloadKpiPanelChartPng(svg,heading.querySelector('h3')?.textContent||'KPI');
    heading.appendChild(button);
  });
}

function downloadKpiPanelChartPng(svg,title) {
  if (!svg) return;
  const clone=svg.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const view=svg.viewBox?.baseVal;
  clone.setAttribute('width',String(view?.width||1000));clone.setAttribute('height',String(view?.height||480));
  const objectUrl=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
  const img=new Image();
  img.onload=()=>{
    try {
      const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1180;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#163c5d';ctx.font='bold 38px sans-serif';ctx.fillText(String(title||'KPI').slice(0,72),65,65);
      const selection=bloodKpiFilterSelections.get(currentBloodKpiRoute)||{};
      const label=[selection.dateFrom?.slice(0,7),selection.dateTo?.slice(0,7)].filter(Boolean).join(' – ');
      const products=selection.products?.length?selection.products.join(', '):currentBloodKpiRoute==='cqi'?'เลือดแดง':'ทุกผลิตภัณฑ์';
      ctx.fillStyle='#506d82';ctx.font='22px sans-serif';ctx.fillText(`ช่วง ${label||'ปัจจุบัน'} · ${products}`.slice(0,110),65,108);
      const scale=Math.min(1860/img.width,970/img.height);
      ctx.drawImage(img,65,145,img.width*scale,img.height*scale);
      ctx.fillStyle='#758da0';ctx.font='18px sans-serif';ctx.fillText(`CNMI Blood Stock · บันทึก ${new Date().toLocaleDateString('th-TH')}`,65,1150);
      const link=document.createElement('a');link.download=`blood-stock-${currentBloodKpiRoute}-${new Date().toISOString().slice(0,10)}.png`;link.href=canvas.toDataURL('image/png');link.click();
    } finally {URL.revokeObjectURL(objectUrl);}
  };
  img.onerror=()=>{URL.revokeObjectURL(objectUrl);showModal('error','บันทึกกราฟไม่สำเร็จ','กรุณาลองอีกครั้ง');};
  img.src=objectUrl;
}

function downloadPrimaryKpiSvgAsPng(data) {
  const svg = document.querySelector('#bloodKpiDashboard .kpi-exec-chart');
  if (!svg) return false;
  try {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], { type:'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000; canvas.height = 1320;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      const titles={utilization:'อัตราการใช้ประโยชน์จากโลหิต',expiry:'อัตราโลหิตหมดอายุ',aging:'อายุเลือดก่อนถูกใช้รายเดือน',cqi:'การจัดหาโลหิตด้วยตนเอง'};
      ctx.fillStyle='#173b5d'; ctx.font='700 44px sans-serif'; ctx.fillText(titles[data.route]||'KPI เลือด',70,72);
      ctx.fillStyle='#7890a4'; ctx.font='400 20px sans-serif'; ctx.fillText(`Blood Stock CNMI · ปี ${Number(data.year||new Date().getFullYear())+543}`,70,110);
      let headline='';
      if(data.route==='utilization') headline=`อัตราการใช้ประโยชน์ ${Number(data.rate||0).toFixed(1)}%`;
      if(data.route==='expiry') headline=`อัตราโลหิตหมดอายุ ${Number(data.rate||0).toFixed(1)}%`;
      if(data.route==='aging') headline='Median วันรับเข้า → ใช้ แยกรายเดือน';
      if(data.route==='cqi') headline=`เดือนผ่านเกณฑ์ ${Number(data.passed||0)} เดือน · เป้าหมายรายเดือน ≥ 85%`;
      ctx.fillStyle='#36556f'; ctx.font='700 30px sans-serif'; ctx.fillText(headline,70,162);
      const targetW=1860, targetH=1000;
      const scale=Math.min(targetW/image.width,targetH/image.height);
      const dw=image.width*scale, dh=image.height*scale;
      ctx.drawImage(image,70,205,dw,dh);
      ctx.fillStyle='#8ca0b2'; ctx.font='400 16px sans-serif'; ctx.fillText(`Export ${new Date().toLocaleDateString('th-TH')} · พร้อมใช้ใน PowerPoint / Canva`,70,1270);
      const a=document.createElement('a'); a.download=`blood-kpi-${data.route}-${new Date().toISOString().slice(0,10)}.png`; a.href=canvas.toDataURL('image/png'); a.click();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
    return true;
  } catch (_) { return false; }
}

function downloadCurrentKpiPng() {
  const data = currentBloodKpiRouteData || {};
  if (['utilization','expiry','aging','cqi'].includes(data.route) && downloadPrimaryKpiSvgAsPng(data)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 900;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1600,900);
  ctx.fillStyle='#173b5d';ctx.font='700 38px sans-serif';
  const titles={overview:'ภาพรวม KPI เลือด',utilization:'อัตราการใช้ประโยชน์จากโลหิต',expiry:'อัตราโลหิตหมดอายุ',trc:'อัตราพึ่งพากาชาด Routine',turnaround:'ระยะเวลารับเข้า → ใช้',aging:'อายุเลือดก่อนถูกใช้รายเดือน',outreach:'ประสิทธิผลเลือดจากการออกหน่วย',minimum:'Minimum Stock'};
  ctx.fillText(titles[data.route]||'KPI เลือด',60,65);
  ctx.fillStyle='#7890a4';ctx.font='400 18px sans-serif';ctx.fillText(`ปี ${Number(data.year||new Date().getFullYear())+543} · Blood Stock CNMI`,60,98);
  const cards=[];
  if(data.route==='overview'){cards.push(['ใช้ประโยชน์',`${Number(data.utilization||0).toFixed(1)}%`],['หมดอายุ',`${Number(data.expiry||0).toFixed(1)}%`],['พึ่งกาชาด Routine',`${Number(data.routineRate||0).toFixed(1)}%`]);}
  if(data.route==='utilization') cards.push(['ใช้ประโยชน์',`${Number(data.rate||0).toFixed(1)}%`]);
  if(data.route==='expiry') cards.push(['หมดอายุ',`${Number(data.rate||0).toFixed(1)}%`]);
  if(data.route==='trc') cards.push(['พึ่งพากาชาด Routine',`${Number(data.adjusted||0).toFixed(1)}%`],['เบิกกาชาด Routine',`${Number(data.routine||0).toLocaleString()} ถุง`],['เลือดหายาก/จำเป็น',`${Number(data.rare||0).toLocaleString()} ถุง`]);
  if(data.route==='turnaround') cards.push(['Median รับเข้า→ใช้',`${Number.isFinite(data.value)?data.value:'—'} วัน`]);
  if(data.route==='aging') cards.push(['คงคลังอายุมากวันนี้',`${Number(data.rate||0).toFixed(1)}%`]);
  if(data.route==='outreach') cards.push(['ประสิทธิผลรวม',`${Number(data.rate||0).toFixed(1)}%`]);
  if(data.route==='minimum') cards.push(['ต่ำกว่า Minimum วันนี้',`${(data.rows||[]).length} รายการ`]);
  cards.forEach((c,i)=>{const x=60+i*390,y=140;ctx.fillStyle='#f7fbfe';ctx.strokeStyle='#dce8f2';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,350,130,18);ctx.fill();ctx.stroke();ctx.fillStyle='#6f8598';ctx.font='400 18px sans-serif';ctx.fillText(c[0],x+20,y+35);ctx.fillStyle='#173b5d';ctx.font='700 38px sans-serif';ctx.fillText(c[1],x+20,y+90);});
  const chartRows=data.groups||data.rows||[];
  if(Array.isArray(chartRows)&&chartRows.length){const values=chartRows.slice(0,8).map(r=>({label:r.label||`${r.type||''} ${r.bloodGroup||''}`.trim(),value:Number(r.utilizationRate??r.expiredRate??r.medianDaysToUse??r.rate??Math.abs(r.gap||0))}));const max=Math.max(...values.map(v=>v.value),1);values.forEach((r,i)=>{const y=330+i*58;ctx.fillStyle='#35556f';ctx.font='400 17px sans-serif';ctx.fillText(String(r.label).slice(0,38),60,y+18);ctx.fillStyle='#eef3f8';ctx.fillRect(430,y,900,22);ctx.fillStyle='#5aa9e6';ctx.fillRect(430,y,Math.max(5,900*r.value/max),22);ctx.fillStyle='#35556f';ctx.fillText(r.value.toFixed(1),1350,y+18);});}
  ctx.fillStyle='#8ca0b2';ctx.font='400 14px sans-serif';ctx.fillText(`Export ${new Date().toLocaleDateString('th-TH')} · ใช้สำหรับนำเสนอ/แนบรายงาน`,60,860);
  const a=document.createElement('a');a.download=`blood-kpi-${data.route||'summary'}-${new Date().toISOString().slice(0,10)}.png`;a.href=canvas.toDataURL('image/png');a.click();
}

function parseBloodKpiDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function diffBloodKpiDays(startValue, endValue) {
  const start = parseBloodKpiDate(startValue);
  const end = parseBloodKpiDate(endValue);
  if (!(start instanceof Date) || !(end instanceof Date)) return null;
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000);
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff;
}

function medianBloodKpi(values) {
  const nums = (values || []).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(1));
}

function bloodKpiOutcomePriority(code) {
  if (code === 'used') return 0;
  if (code === 'rejected') return 1;
  if (code === 'expired') return 2;
  if (code === 'other_discard') return 3;
  if (code === 'conflict') return 4;
  if (code === 'transformed') return 5;
  return 6;
}

function buildBloodKpiInsights({ dependency, analysis, familyRows, dashboard, year, filters = {} }) {
  const rows = Array.isArray(familyRows) ? familyRows.filter(row => row?.aggregateEligible !== false) : [];
  const families = new Map();
  rows.forEach(row => {
    const key = outreachFamilyKeyClient(row?.bagNumber, row?.productType);
    if (!key) return;
    let family = families.get(key);
    if (!family) {
      family = {
        key,
        rows: [],
        preferredRow: row,
        firstCohortDate: row?.cohortDate || row?.dateStockIn || '',
        firstStockInDate: row?.dateStockIn || row?.cohortDate || '',
        usedDates: []
      };
      families.set(key, family);
    }
    family.rows.push(row);
    const currentPriority = bloodKpiOutcomePriority(effectiveOutreachOutcomeCode(row));
    const preferredPriority = bloodKpiOutcomePriority(effectiveOutreachOutcomeCode(family.preferredRow));
    if (currentPriority < preferredPriority) family.preferredRow = row;
    const candidateCohort = parseBloodKpiDate(row?.cohortDate || row?.dateStockIn);
    const currentCohort = parseBloodKpiDate(family.firstCohortDate);
    if (candidateCohort && (!currentCohort || candidateCohort < currentCohort)) {
      family.firstCohortDate = row?.cohortDate || row?.dateStockIn || family.firstCohortDate;
    }
    const candidateStockIn = parseBloodKpiDate(row?.dateStockIn || row?.cohortDate);
    const currentStockIn = parseBloodKpiDate(family.firstStockInDate);
    if (candidateStockIn && (!currentStockIn || candidateStockIn < currentStockIn)) {
      family.firstStockInDate = row?.dateStockIn || row?.cohortDate || family.firstStockInDate;
    }
    if (["Released", "Dedicated"].includes(String(row?.status || '')) && row?.dateStockOut) {
      family.usedDates.push(row.dateStockOut);
    }
  });

  const aggregated = Array.from(families.values()).map(family => {
    const rows = family.rows || [];
    const codes = rows.map(effectiveOutreachOutcomeCode);
    const hasUsed = codes.includes('used');
    const hasRejected = codes.includes('rejected');
    const hasExpired = codes.includes('expired');
    const hasOtherDiscard = codes.includes('other_discard') || codes.includes('destroyed');
    const hasConflict = codes.includes('conflict');
    const finalCode = hasUsed ? 'used' : hasRejected ? 'rejected' : hasExpired ? 'expired' : hasOtherDiscard ? 'other_discard' : hasConflict ? 'conflict' : 'unresolved';
    const preferred = family.preferredRow || rows[0] || {};
    const dedicated = rows.some(row => String(row?.status || '') === 'Dedicated');
    const cohortDate = preferred.cohortDate || family.firstCohortDate || preferred.dateStockIn || '';
    const stockInDate = preferred.dateStockIn || family.firstStockInDate || cohortDate || '';
    const finalDate = family.usedDates.map(parseBloodKpiDate).filter(Boolean).sort((a,b)=>a-b)[0] || null;
    const productFamily = outreachProductFamilyClient(preferred.productType);
    return {
      familyKey: family.key,
      sourceGroup: preferred.sourceGroup || '',
      donateSource: preferred.donateSource || '',
      productType: preferred.productType || '',
      productFamily,
      bloodGroup: preferred.bloodGroup || '',
      rh: preferred.rh || '',
      outcomeCode: finalCode,
      dedicated,
      cohortDate,
      stockInDate,
      finalDate: finalDate ? finalDate.toISOString().slice(0, 10) : '',
      isRbc: productFamily === 'RBC'
    };
  });

  const today = new Date();
  const useYearScope = Number.isFinite(Number(year)) && Number(year) > 1900 && !(filters?.dateFrom || filters?.dateTo);
  const yearScopedFamilies = useYearScope ? aggregated.filter(f => {
    const d = parseBloodKpiDate(f.cohortDate || f.stockInDate);
    return d && d.getFullYear() === Number(year);
  }) : [];
  const analyticFamilies = useYearScope && yearScopedFamilies.length ? yearScopedFamilies : aggregated;
  const finalFamilies = analyticFamilies.filter(f => ['used', 'expired'].includes(f.outcomeCode));
  const usedFamilies = analyticFamilies.filter(f => f.outcomeCode === 'used');
  const expiredFamilies = analyticFamilies.filter(f => f.outcomeCode === 'expired');
  const utilizationRate = finalFamilies.length ? outreachPercent(usedFamilies.length, finalFamilies.length) : 0;
  const expiredRate = finalFamilies.length ? outreachPercent(expiredFamilies.length, finalFamilies.length) : 0;

  const daysToUse = usedFamilies.map(f => diffBloodKpiDays(f.cohortDate || f.stockInDate, f.finalDate)).filter(v => Number.isFinite(v));
  const medianDaysToUse = medianBloodKpi(daysToUse);

  const unresolvedRbc = analyticFamilies.filter(f => f.isRbc && f.outcomeCode === 'unresolved');
  const agedThreshold = 21;
  const agedRbc = unresolvedRbc.filter(f => {
    const days = diffBloodKpiDays(f.cohortDate || f.stockInDate, today.toISOString().slice(0,10));
    return Number.isFinite(days) && days >= agedThreshold;
  });
  const longHeldRate = unresolvedRbc.length ? outreachPercent(agedRbc.length, unresolvedRbc.length) : 0;

  const rangeMeta = getBloodKpiRangeMeta(filters || {});
  const monthKeys = [];
  if (filters?.dateFrom && filters?.dateTo && rangeMeta.startDate && rangeMeta.endDate) {
    const cursor = new Date(rangeMeta.startDate.getFullYear(), rangeMeta.startDate.getMonth(), 1);
    const endCursor = new Date(rangeMeta.endDate.getFullYear(), rangeMeta.endDate.getMonth(), 1);
    while (cursor <= endCursor) {
      monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`);
      cursor.setMonth(cursor.getMonth()+1);
    }
  } else if (Number.isFinite(Number(year)) && Number(year) > 1900) {
    for (let m=1;m<=12;m+=1) monthKeys.push(`${Number(year)}-${String(m).padStart(2,'0')}`);
  }
  const monthlyAgeBuckets = new Map(monthKeys.map(key => [key,{ key, days:[], usedCount:0, within7:0, day8to14:0, day15to21:0, over21:0 }]));
  usedFamilies.forEach(f => {
    const receivedDate = parseBloodKpiDate(f.cohortDate || f.stockInDate);
    if (!receivedDate) return;
    const key = `${receivedDate.getFullYear()}-${String(receivedDate.getMonth()+1).padStart(2,'0')}`;
    if (!monthlyAgeBuckets.has(key)) return;
    const days = diffBloodKpiDays(f.cohortDate || f.stockInDate, f.finalDate);
    if (!Number.isFinite(days)) return;
    const bucket = monthlyAgeBuckets.get(key);
    bucket.days.push(days); bucket.usedCount += 1;
    if (days <= 7) bucket.within7 += 1; else if (days <= 14) bucket.day8to14 += 1; else if (days <= 21) bucket.day15to21 += 1; else bucket.over21 += 1;
  });
  let monthlyAgeRows = Array.from(monthlyAgeBuckets.values()).map(bucket => {
    const [yy,mm] = bucket.key.split('-').map(Number);
    const avg = bucket.days.length ? bucket.days.reduce((sum,v)=>sum+v,0)/bucket.days.length : null;
    return { year:yy, month:mm, periodLabel:`${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][mm]}${monthKeys.length>12?` ${String(yy+543).slice(-2)}`:''}`, usedCount:bucket.usedCount, medianDays:medianBloodKpi(bucket.days), averageDays:Number.isFinite(avg)?Number(avg.toFixed(1)):null, within7:bucket.within7, day8to14:bucket.day8to14, day15to21:bucket.day15to21, over21:bucket.over21 };
  });
  if (monthlyAgeRows.length > 24) {
    const byYear = new Map();
    monthlyAgeRows.forEach(r => {
      if (!byYear.has(r.year)) byYear.set(r.year,{ year:r.year, days:[], usedCount:0, within7:0, day8to14:0, day15to21:0, over21:0 });
      const y=byYear.get(r.year); y.usedCount+=r.usedCount; y.within7+=r.within7; y.day8to14+=r.day8to14; y.day15to21+=r.day15to21; y.over21+=r.over21;
    });
    // keep monthly medians unavailable for yearly aggregation; derive weighted approximation from family rows below
    monthlyAgeRows = Array.from(byYear.values()).map(y => {
      const days = usedFamilies.map(f => ({d:parseBloodKpiDate(f.cohortDate||f.stockInDate),v:diffBloodKpiDays(f.cohortDate||f.stockInDate,f.finalDate)})).filter(x=>x.d && x.d.getFullYear()===y.year && Number.isFinite(x.v)).map(x=>x.v);
      return { ...y, month:0, periodLabel:String(y.year+543), medianDays:medianBloodKpi(days), averageDays:days.length?Number((days.reduce((a,b)=>a+b,0)/days.length).toFixed(1)):null };
    });
  }
  const ageDistribution = { within7:monthlyAgeRows.reduce((s,r)=>s+Number(r.within7||0),0), day8to14:monthlyAgeRows.reduce((s,r)=>s+Number(r.day8to14||0),0), day15to21:monthlyAgeRows.reduce((s,r)=>s+Number(r.day15to21||0),0), over21:monthlyAgeRows.reduce((s,r)=>s+Number(r.over21||0),0) };

  const sourceGroupMap = new Map();
  analyticFamilies.forEach(f => {
    const key = f.sourceGroup || '(ไม่ระบุ)';
    if (!sourceGroupMap.has(key)) sourceGroupMap.set(key, { label: key, used: 0, expired: 0, totalFinal: 0, days: [] });
    const item = sourceGroupMap.get(key);
    if (f.outcomeCode === 'used') {
      item.used += 1;
      item.totalFinal += 1;
      const d = diffBloodKpiDays(f.cohortDate || f.stockInDate, f.finalDate);
      if (Number.isFinite(d)) item.days.push(d);
    } else if (f.outcomeCode === 'expired') {
      item.expired += 1;
      item.totalFinal += 1;
    }
  });
  const sourceGroupRates = Array.from(sourceGroupMap.values()).map(item => ({
    label: item.label,
    used: item.used,
    expired: item.expired,
    totalFinal: item.totalFinal,
    utilizationRate: item.totalFinal ? outreachPercent(item.used, item.totalFinal) : 0,
    expiredRate: item.totalFinal ? outreachPercent(item.expired, item.totalFinal) : 0,
    medianDaysToUse: medianBloodKpi(item.days)
  })).sort((a, b) => b.expiredRate - a.expiredRate || b.totalFinal - a.totalFinal);

  const outreachFamilies = analyticFamilies.filter(f => f.sourceGroup === OUTREACH_GROUP_SELF_OUTREACH);
  const outreachMap = new Map();
  outreachFamilies.forEach(f => {
    const key = f.donateSource || '(ไม่ระบุ)';
    if (!outreachMap.has(key)) outreachMap.set(key, { label: key, used: 0, expired: 0, finalCount: 0, received: 0 });
    const item = outreachMap.get(key);
    item.received += 1;
    if (f.outcomeCode === 'used') {
      item.used += 1; item.finalCount += 1;
    } else if (f.outcomeCode === 'expired') {
      item.expired += 1; item.finalCount += 1;
    }
  });
  const outreachEffectRows = Array.from(outreachMap.values()).map(item => ({
    ...item,
    rate: item.finalCount ? outreachPercent(item.used, item.finalCount) : 0,
    expiredRate: item.finalCount ? outreachPercent(item.expired, item.finalCount) : 0
  })).filter(item => item.received > 0).sort((a,b) => b.rate - a.rate || b.received - a.received);
  const outreachOverallFinal = outreachFamilies.filter(f => ['used', 'expired'].includes(f.outcomeCode));
  const outreachOverallUsed = outreachFamilies.filter(f => f.outcomeCode === 'used');
  const outreachEffectiveness = outreachOverallFinal.length ? outreachPercent(outreachOverallUsed.length, outreachOverallFinal.length) : 0;

  const monthlyMap = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, { month: i + 1, used: 0, expired: 0, unresolved: 0, totalFinal: 0 }]));
  aggregated.forEach(f => {
    const d = parseBloodKpiDate(f.cohortDate || f.stockInDate);
    if (!d || d.getFullYear() !== Number(year)) return;
    const item = monthlyMap.get(d.getMonth() + 1);
    if (f.outcomeCode === 'used') { item.used += 1; item.totalFinal += 1; }
    else if (f.outcomeCode === 'expired') { item.expired += 1; item.totalFinal += 1; }
    else if (f.outcomeCode === 'unresolved') { item.unresolved += 1; }
  });
  const monthlyOutcomeRows = Array.from(monthlyMap.values()).map(item => ({
    ...item,
    utilizationRate: item.totalFinal ? outreachPercent(item.used, item.totalFinal) : 0,
    expiredRate: item.totalFinal ? outreachPercent(item.expired, item.totalFinal) : 0
  }));

  const lowStockRows = Array.isArray(dashboard?.results)
    ? dashboard.results.filter(r => Number(r?.gap || 0) < 0).map(r => ({
        type: r.type || '', bloodGroup: r.bloodGroup || '', minimumStock: Number(r.minimumStock || 0), netAvailable: Number(r.netAvailable || 0), gap: Number(r.gap || 0)
      }))
    : [];

  const dependencySummary = dependency?.summary || {};
  const routineRate = Number((dependencySummary.adjustedRate ?? dependencySummary.rate) || 0);
  const overallYears = Array.from(new Set([
    ...(Array.isArray(dependency?.years) ? dependency.years : []),
    ...monthlyOutcomeRows.map(() => Number(year))
  ].filter(Number.isFinite))).sort((a,b)=>b-a);

  return {
    year: Number(year),
    years: overallYears,
    aggregated,
    utilizationRate,
    expiredRate,
    routineRate,
    medianDaysToUse,
    longHeldRate,
    longHeldCount: agedRbc.length,
    longHeldBase: unresolvedRbc.length,
    monthlyAgeRows,
    ageDistribution,
    outreachEffectiveness,
    sourceGroupRates,
    outreachEffectRows: outreachEffectRows.slice(0, 10),
    monthlyOutcomeRows,
    lowStockRows,
    lowStockCount: lowStockRows.length,
    lowStockTotal: Array.isArray(dashboard?.results) ? dashboard.results.length : 0,
    note: 'อัตราการใช้และหมดอายุในหน้านี้ใช้ฐานเฉพาะ Used + Expired เพื่อไม่ให้ปนรายการ Rejected / ทำลายอื่น',
    analysisSummary: normalizeOutreachSummary(analysis?.report?.summary || {}),
  };
}

function renderBloodKpiPage(data) {
  const box = document.getElementById("bloodKpiDashboard");
  if (!box) return;
  const year = Number(data?.year || 0);
  const comparisonYear = Number(data?.comparisonYear || year - 1);
  const years = Array.isArray(data?.years) ? data.years.map(Number).filter(Number.isFinite) : [];
  const summary = data?.summary || {};
  const months = Array.isArray(data?.months) ? data.months : [];
  const rate = Number(summary.rate || 0);
  const adjustedRate = Number(summary.adjustedRate ?? rate);
  const rareTrcRbc = Number(summary.rareTrcRbc || 0);
  const routineTrcRbc = Number(summary.routineTrcRbc ?? Math.max(0, Number(summary.trcRbc || 0) - rareTrcRbc));
  const specialReady = data?.specialTrackingReady !== false;
  const sdrReady = data?.sdrTrackingReady !== false;
  const adjustedReady = specialReady && sdrReady;
  const previousRate = Number(summary.previousRate || 0);
  const previousTotal = Number(summary.previousTotalRbc || 0);
  const delta = Number(summary.deltaPp || 0);
  const reduction = Number(summary.reductionPp || 0);
  const improved = previousTotal > 0 && reduction > 0;
  const changedText = previousTotal <= 0 ? "ยังไม่มีข้อมูลปีก่อนสำหรับเทียบ" : Math.abs(delta) < 0.005 ? "เท่ากับปีก่อน" : improved ? `ลดลง ${Math.abs(reduction).toFixed(2)} จุดเปอร์เซ็นต์` : `เพิ่มขึ้น ${Math.abs(delta).toFixed(2)} จุดเปอร์เซ็นต์`;
  const insights = data?.insights || currentBloodKpiInsights || {};
  const yearOptions = (years.length ? years : [year]).map(y => `<option value="${y}" ${y===year?"selected":""}>${y+543}</option>`).join("");
  const sourceRateRows = Array.isArray(insights.sourceGroupRates) ? insights.sourceGroupRates : [];
  const outreachRows = Array.isArray(insights.outreachEffectRows) ? insights.outreachEffectRows : [];
  const monthlyOutcomeRows = Array.isArray(insights.monthlyOutcomeRows) ? insights.monthlyOutcomeRows : [];
  const lowStockRows = Array.isArray(insights.lowStockRows) ? insights.lowStockRows : [];

  box.innerHTML = `
    <div class="kpi-blood-shell">
      <div class="simple-page-head mt-2">
        <div><h1>ภาพรวม KPI</h1></div>
        <div class="d-flex gap-2 align-items-end flex-wrap no-print">
          <label class="outreach-filter-item mb-0">ปีที่ดู
            <select class="form-select kpi-year-select" onchange="loadBloodKpiPage(this.value)">${yearOptions}</select>
          </label>
          <button class="btn btn-light" type="button" onclick="downloadBloodKpiExecutivePng()">PNG สรุป</button>
          <button class="btn btn-light" type="button" onclick="downloadBloodKpiChartPng()">PNG พึ่งพากาชาด</button>
          <button class="btn btn-light" type="button" onclick="exportBloodKpiExcel()">Excel</button>
          <button class="btn btn-main" type="button" onclick="window.print()">PDF</button>
        </div>
      </div>

      <div class="simple-kpi-grid blood-kpi-main-grid mb-3">
        <div class="simple-kpi"><span>ใช้ประโยชน์</span><strong>${Number(insights.utilizationRate || 0).toFixed(1)}%</strong></div>
        <div class="simple-kpi is-alert"><span>หมดอายุ</span><strong>${Number(insights.expiredRate || 0).toFixed(1)}%</strong></div>
        <div class="simple-kpi is-good"><span>พึ่งกาชาด Routine</span><strong>${adjustedReady ? adjustedRate.toFixed(1) : rate.toFixed(1)}%</strong></div>
        <div class="simple-kpi"><span>Median รับเข้า → ใช้</span><strong>${Number.isFinite(insights.medianDaysToUse) ? insights.medianDaysToUse : '—'} วัน</strong></div>
        <div class="simple-kpi"><span>คงคลัง ≥ 21 วัน</span><strong>${Number(insights.longHeldRate || 0).toFixed(1)}%</strong></div>
        <div class="simple-kpi"><span>ประสิทธิผลออกหน่วย</span><strong>${Number(insights.outreachEffectiveness || 0).toFixed(1)}%</strong></div>
      </div>

      ${renderKpiInfoDetails('วิธีคำนวณ', escapeOutreachHtml(insights.note || ''))}

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>แนวโน้มผลถุงเลือดรายเดือน</h3></div></div>
          ${renderBloodOutcomeMonthlySvg(monthlyOutcomeRows, year)}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>พึ่งกาชาด Routine รายเดือน</h3></div></div>
          ${renderBloodKpiLineSvg(months, year, comparisonYear)}
          <div class="small-muted mt-2">${escapeOutreachHtml(changedText)}${previousTotal > 0 ? ` จากปี ${comparisonYear+543}` : ''}</div>
          ${adjustedReady ? `<div class="kpi-adjusted-box mt-3"><div><span>Routine KPI</span><b>${adjustedRate.toFixed(1)}%</b></div><div class="kpi-adjusted-detail">กาชาด ${routineTrcRbc.toLocaleString()} ถุง · Rare/จำเป็น ${rareTrcRbc.toLocaleString()} ถุง</div></div>` : ''}
        </div>
      </div>

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>หมดอายุแยกแหล่ง</h3></div></div>
          ${renderHorizontalBarChartSvg(sourceRateRows.slice(0, 6), { valueKey: 'expiredRate', label: 'Expired %', suffix: '%', color: '#f28b82', max: 100 })}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>Median รับเข้า → ใช้</h3></div></div>
          ${renderHorizontalBarChartSvg(sourceRateRows.slice().sort((a,b)=>(a.medianDaysToUse ?? 999)-(b.medianDaysToUse ?? 999)).filter(r => Number.isFinite(r.medianDaysToUse)), { valueKey: 'medianDaysToUse', label: 'วัน', suffix: ' วัน', color: '#5aa9e6', max: null })}
        </div>
      </div>

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>ประสิทธิผลออกหน่วย</h3></div></div>
          ${renderHorizontalBarChartSvg(outreachRows.slice(0, 8), { valueKey: 'rate', label: 'ใช้ได้จริง', suffix: '%', color: '#68c3a3', max: 100, sublabelKey: 'finalCount', sublabelSuffix: ' ถุงมีผลลัพธ์แล้ว' })}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>Minimum Stock วันนี้</h3></div></div>
          <div class="simple-kpi-grid blood-kpi-mini-grid mb-3">
            <div class="simple-kpi is-alert"><span>ต่ำกว่า Minimum</span><strong>${Number(insights.lowStockCount || 0)} รายการ</strong><small>จาก ${Number(insights.lowStockTotal || 0)} รายการ</small></div>
          </div>
          <div class="table-responsive">
            <table class="table simple-table align-middle mb-0">
              <thead><tr><th>ชนิด</th><th>หมู่เลือด</th><th class="text-end">Minimum</th><th class="text-end">ใช้ได้จริง</th><th class="text-end">ขาด</th></tr></thead>
              <tbody>${lowStockRows.length ? lowStockRows.slice(0, 8).map(r => `<tr><td>${escapeOutreachHtml(r.type)}</td><td><b>${escapeOutreachHtml(r.bloodGroup)}</b></td><td class="text-end">${Number(r.minimumStock || 0).toLocaleString()}</td><td class="text-end">${Number(r.netAvailable || 0).toLocaleString()}</td><td class="text-end text-danger">${Math.abs(Number(r.gap || 0)).toLocaleString()}</td></tr>`).join('') : `<tr><td colspan="5" class="small-muted">ยังไม่มีรายการที่ต่ำกว่า Minimum วันนี้</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="simple-panel mb-3">
        <div class="panel-heading-row"><div><h3>สรุปรายเดือน</h3></div></div>
        <div class="table-responsive">
          <table class="table simple-table align-middle mb-0">
            <thead><tr><th>เดือน</th><th class="text-end">Used</th><th class="text-end">Expired</th><th class="text-end">ยังอยู่ในคลัง</th><th class="text-end">ใช้ประโยชน์</th><th class="text-end">หมดอายุ</th><th class="text-end">TRC รวม</th><th class="text-end">Routine TRC</th></tr></thead>
            <tbody>${monthlyOutcomeRows.map((m, idx) => `<tr><td>${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][idx]}</td><td class="text-end">${Number(m.used || 0).toLocaleString()}</td><td class="text-end">${Number(m.expired || 0).toLocaleString()}</td><td class="text-end">${Number(m.unresolved || 0).toLocaleString()}</td><td class="text-end fw-bold">${Number(m.utilizationRate || 0).toFixed(1)}%</td><td class="text-end fw-bold">${Number(m.expiredRate || 0).toFixed(1)}%</td><td class="text-end">${Number(months[idx]?.trcRbc || 0).toLocaleString()}</td><td class="text-end">${adjustedReady ? Number(months[idx]?.routineTrcRbc ?? Math.max(0, Number(months[idx]?.trcRbc || 0) - Number(months[idx]?.rareTrcRbc || 0))).toLocaleString() : '—'}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function getKpiContinuousMonthChartMeta(rows = []) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const monthNames = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const multiYear = new Set(items.map(row => Number(row?.year || 0)).filter(Boolean)).size > 1;
  const yearBands = [];
  let start = 0;
  while (start < items.length) {
    const year = Number(items[start]?.year || 0);
    let end = start;
    while (end + 1 < items.length && Number(items[end + 1]?.year || 0) === year) end += 1;
    yearBands.push({
      year,
      start,
      end,
      label: year ? String(year + 543) : ''
    });
    start = end + 1;
  }
  return { items, monthNames, multiYear, yearBands };
}

function renderKpiYearBandSvg(yearBands = [], xCenter = () => 0, chartBottom = 0) {
  if (!Array.isArray(yearBands) || yearBands.length <= 1) return '';
  return yearBands.map((band, idx) => {
    const centerX = (xCenter(band.start) + xCenter(band.end)) / 2;
    const divider = idx < yearBands.length - 1
      ? `<line x1="${(xCenter(band.end) + xCenter(band.end + 1)) / 2}" y1="68" x2="${(xCenter(band.end) + xCenter(band.end + 1)) / 2}" y2="${chartBottom + 8}" stroke="#dce8f2" stroke-width="1.4" stroke-dasharray="6 8"/>`
      : '';
    return `${divider}<text x="${centerX}" y="${chartBottom + 42}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#6c8599">${escapeOutreachHtml(band.label || '')}</text>`;
  }).join('');
}

function wrapScrollableKpiSvg(svgMarkup, wide = false) {
  return `<div class="kpi-chart-scroll${wide ? ' wide' : ''}">${svgMarkup}</div>`;
}

function renderKpiSegmentValueLabel(cx, yTop, height, value, color, options = {}) {
  const numeric = Number(value || 0);
  if (!(numeric > 0)) return '';
  const barWidth = Number(options.barWidth || 40);
  const top = Number(options.top || 0);
  const fontSize = Number(options.fontSize || 10.5);
  const minInside = Number(options.minInside || 17);
  const insideColor = options.insideColor || '#ffffff';
  const side = Number(options.side || 1) >= 0 ? 1 : -1;
  const text = options.text || numeric.toLocaleString();
  if (height >= minInside) {
    return `<text x="${cx}" y="${yTop + height / 2 + fontSize * .34}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${insideColor}" style="paint-order:stroke;stroke:${color};stroke-width:1.8px;stroke-linejoin:round">${text}</text>`;
  }
  const x = cx + side * (barWidth / 2 + 5);
  const anchor = side > 0 ? 'start' : 'end';
  const y = Math.max(top + fontSize, yTop + height / 2 + fontSize * .34);
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${Math.max(8.5, fontSize - .8)}" font-weight="900" fill="${color}" style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round">${text}</text>`;
}

function renderExecutiveMonthlyRateChart(rows, year, mode = 'utilization') {
  const { items, monthNames, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  const isExpiry = mode === 'expiry';
  const rateKey = isExpiry ? 'expiredRate' : 'utilizationRate';
  const title = isExpiry ? 'สัดส่วนโลหิตหมดอายุรายเดือน' : 'สัดส่วนการใช้ประโยชน์รายเดือน';
  const primaryColor = isExpiry ? '#b64f49' : '#2b805f';
  const usedColor = '#2d9f73';
  const expiredColor = '#dc6d68';
  const lowBaseColor = '#d99a2b';
  const safeItems = items.map((source, idx) => {
    const used = Number(source?.used || 0);
    const expired = Number(source?.expired || 0);
    const totalFinal = Number(source?.totalFinal ?? (used + expired));
    const rawRate = source?.[rateKey];
    const rate = totalFinal > 0
      ? (Number.isFinite(Number(rawRate)) ? Number(rawRate) : ((isExpiry ? expired : used) / totalFinal) * 100)
      : null;
    return { ...source, used, expired, totalFinal, rate, lowBase: totalFinal > 0 && totalFinal < 10, periodLabel: monthNames[Number(source?.month || 0)] || source?.periodLabel || String(idx + 1) };
  });
  if (!safeItems.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;

  const maxCount = Math.max(1, ...safeItems.map(r => r.totalFinal));
  const yMax = Math.max(8, Math.ceil(maxCount / 5) * 5);
  const left = 84, right = 54, top = 76, bottom = multiYear ? 124 : 92;
  const groupW = safeItems.length > 18 ? 70 : 82;
  const chartW = Math.max(720, groupW * safeItems.length);
  const w = left + right + chartW, h = 580, chartH = h - top - bottom;
  const barW = Math.max(30, Math.min(44, groupW * .54));
  const yCount = value => top + chartH - (Math.max(0, Number(value || 0)) / yMax) * chartH;
  const xCenter = i => left + groupW * i + groupW / 2;
  const chartBottom = top + chartH;
  const grid = [0,.25,.5,.75,1].map(frac => { const yy = top + chartH - chartH * frac; return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8eff5" stroke-width="1.5"/><text x="${left-14}" y="${yy+5}" text-anchor="end" font-size="12.5" fill="#8299ac">${Math.round(yMax*frac)}</text>`; }).join('');

  const clipDefs = safeItems.map((row, i) => {
    const cx = xCenter(i), x = cx - barW/2, totalY = yCount(row.totalFinal), totalH = row.totalFinal > 0 ? Math.max(4, chartBottom-totalY) : 0;
    return row.totalFinal > 0 ? `<clipPath id="kpiStackClip${i}"><rect x="${x}" y="${totalY}" width="${barW}" height="${totalH}" rx="10"/></clipPath>` : '';
  }).join('');
  const bars = safeItems.map((row, i) => {
    const cx = xCenter(i), x = cx - barW/2, totalY = yCount(row.totalFinal), totalH = row.totalFinal > 0 ? Math.max(4, chartBottom-totalY) : 0;
    const expiredH = row.totalFinal > 0 ? (row.expired / row.totalFinal) * totalH : 0;
    const usedH = row.totalFinal > 0 ? (row.used / row.totalFinal) * totalH : 0;
    const expiredY = totalY;
    const usedY = chartBottom - usedH;
    const expiredValueLabel = renderKpiSegmentValueLabel(cx, expiredY, expiredH, row.expired, expiredColor, { barWidth:barW, top, side:-1, fontSize:safeItems.length>18?9.4:10.2 });
    const usedValueLabel = renderKpiSegmentValueLabel(cx, usedY, usedH, row.used, usedColor, { barWidth:barW, top, side:1, fontSize:safeItems.length>18?9.4:10.2 });
    const badgeY = Math.max(top + 12, totalY - 34), badgeW = row.lowBase ? 60 : 52;
    const yearTip = Number(row.year||0) ? ` ${Number(row.year)+543}` : '';
    return `<g>
      ${row.totalFinal>0 ? `<g clip-path="url(#kpiStackClip${i})"><rect x="${x}" y="${totalY}" width="${barW}" height="${totalH}" fill="#f8fbfe"/>${row.expired>0 ? `<rect x="${x}" y="${totalY}" width="${barW}" height="${expiredH}" fill="${expiredColor}"><title>${escapeOutreachHtml(row.periodLabel)}${yearTip} · Expired ${row.expired.toLocaleString()} ถุง</title></rect>` : ''}${row.used>0 ? `<rect x="${x}" y="${chartBottom-usedH}" width="${barW}" height="${usedH}" fill="${usedColor}"><title>${escapeOutreachHtml(row.periodLabel)}${yearTip} · Used ${row.used.toLocaleString()} ถุง</title></rect>` : ''}</g><rect x="${x}" y="${totalY}" width="${barW}" height="${totalH}" rx="10" fill="none" stroke="#9dc8e9" stroke-width="1.5"><title>${escapeOutreachHtml(row.periodLabel)}${yearTip} · พร้อมใช้ ${row.totalFinal.toLocaleString()} ถุง</title></rect>${expiredValueLabel}${usedValueLabel}` : ''}
      ${row.rate!==null ? `<line x1="${cx}" y1="${badgeY+22}" x2="${cx}" y2="${Math.max(top+28,totalY-3)}" stroke="${row.lowBase?lowBaseColor:'#9ab2c7'}" stroke-width="1.4"/><rect x="${cx-badgeW/2}" y="${badgeY}" width="${badgeW}" height="22" rx="11" fill="${row.lowBase?'#fff7ea':'#fff'}" stroke="${row.lowBase?lowBaseColor:'#b9cfe0'}"/><text x="${cx}" y="${badgeY+15}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${row.lowBase?'#b87813':primaryColor}">${row.rate.toFixed(1)}%${row.lowBase?'*':''}</text>` : ''}
      <text x="${cx}" y="${h-(multiYear?68:38)}" text-anchor="middle" font-size="${safeItems.length>18?11.5:13}" font-weight="600" fill="#5f7689">${escapeOutreachHtml(row.periodLabel)}</text>
    </g>`;
  }).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, xCenter, chartBottom) : '';
  const legendX = w-right-210;
  const svg = `<svg class="kpi-exec-chart kpi-stacked-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><defs>${clipDefs}</defs><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/><text x="${left}" y="38" font-size="18" font-weight="700" fill="#183b5d">${title}</text><g transform="translate(${legendX},36)"><rect x="0" y="-11" width="16" height="12" rx="4" fill="${usedColor}"/><text x="22" y="-1" font-size="12" fill="#587082">Used</text><rect x="92" y="-11" width="16" height="12" rx="4" fill="${expiredColor}"/><text x="114" y="-1" font-size="12" fill="#587082">Expired</text></g>${grid}${yearBandsSvg}${bars}</svg>`;
  return wrapScrollableKpiSvg(svg, safeItems.length > 10);
}



function renderTrcRangeSvg(rows) {
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if (!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const left = 72, right = 44, top = 58, bottom = multiYear ? 112 : 88;
  const groupW = items.length > 18 ? 70 : 82;
  const chartW = Math.max(720, groupW * items.length);
  const w = left + right + chartW, h = 520, chartH = h - top - bottom;
  const x = i => left + chartW * (i + .5) / items.length;
  const y = v => top + chartH - (Math.max(0, Math.min(100, Number(v || 0))) / 100) * chartH;
  const clampLabelY = value => Math.max(top + 13, Math.min(top + chartH + 23, value));
  const grid = [0,25,50,75,100].map(v => `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#e8eff5"/><text x="${left-12}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#8398aa">${v}%</text>`).join('');
  const routinePath = items.map((r,i)=>`${i===0?'M':'L'}${x(i)},${y(r.adjustedRate)}`).join(' ');
  const pointFontSize = items.length > 18 ? 10.5 : 11.5;
  const halo = 'paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round';
  const pointLabels = items.map((r,i) => {
    const routine = Number(r?.adjustedRate || 0);
    return `<text x="${x(i)}" y="${clampLabelY(y(routine)-14)}" text-anchor="middle" font-size="${pointFontSize}" font-weight="800" fill="#2f7fc1" style="${halo}">${routine.toFixed(1)}%</text>`;
  }).join('');
  const labels = items.map((r,i)=>`<text x="${x(i)}" y="${h - (multiYear ? 56 : 32)}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(r.month||0)] || r.periodLabel || '')}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, x, top + chartH) : '';
  const points = items.map((r,i) => {
    const monthLabel = escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(r.month||0)] || r.periodLabel || '');
    const routine = Number(r?.adjustedRate || 0);
    return `<circle cx="${x(i)}" cy="${y(routine)}" r="5" fill="#fff" stroke="#2f7fc1" stroke-width="3"><title>${monthLabel} · Routine ${routine.toFixed(1)}%</title></circle>`;
  }).join('');
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="แนวโน้มอัตราพึ่งพากาชาด Routine พร้อมตัวเลขรายเดือน"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${grid}${yearBandsSvg}<path d="${routinePath}" fill="none" stroke="#2f7fc1" stroke-width="4"/>${points}${pointLabels}${labels}<g transform="translate(${w-right-145},30)"><line x1="0" y1="0" x2="30" y2="0" stroke="#2f7fc1" stroke-width="4"/><text x="38" y="4" font-size="12" fill="#5b7285">Routine KPI</text></g></svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}

function renderTrcRareMonthlySvg(rows) {
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if (!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const left = 72, right = 44, top = 58, bottom = multiYear ? 112 : 88;
  const groupW = items.length > 18 ? 70 : 82;
  const chartW = Math.max(720, groupW * items.length);
  const w = left + right + chartW, h = 390, chartH = h - top - bottom;
  const maxCount = Math.max(1, ...items.map(r => Number(r?.rareTrcRbc || 0)));
  const x = i => left + chartW * (i + .5) / items.length;
  const y = v => top + chartH - (Math.max(0, Number(v || 0)) / maxCount) * chartH;
  const tickMax = Math.max(1, Math.ceil(maxCount));
  const tickValues = [...new Set([0, Math.ceil(tickMax/2), tickMax])];
  const grid = tickValues.map(v => `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#e8eff5"/><text x="${left-12}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#8398aa">${v}</text>`).join('');
  const barW = Math.min(34, Math.max(16, groupW * .42));
  const bars = items.map((r,i) => {
    const value = Number(r?.rareTrcRbc || 0);
    const cx = x(i), barY = y(value), barH = Math.max(value > 0 ? 4 : 0, top + chartH - barY);
    const labelY = Math.max(top + 14, barY - 8);
    return `<rect x="${cx-barW/2}" y="${barY}" width="${barW}" height="${barH}" rx="${Math.min(8,barW/2)}" fill="#d88985" opacity=".88"><title>${value.toLocaleString()} ถุง</title></rect>${value>0?`<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="${items.length>18?10.5:11.5}" font-weight="800" fill="#9a514c">${value.toLocaleString()}</text>`:''}`;
  }).join('');
  const labels = items.map((r,i)=>`<text x="${x(i)}" y="${h - (multiYear ? 56 : 32)}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(r.month||0)] || r.periodLabel || '')}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, x, top + chartH) : '';
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="จำนวนเลือดหายากหรือภาวะจำเป็นจากกาชาดรายเดือน"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${grid}${yearBandsSvg}${bars}${labels}</svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}

function renderRbcSourceIntakeMonthlySvg(rows) {
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if (!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const series = [
    { key:'selfInhouse', label:'รับบริจาคใน รพ.', color:'#74b7e8', insideColor:'#173b5d' },
    { key:'selfOutreach', label:'ออกหน่วย', color:'#63bf9b', insideColor:'#173b5d' },
    { key:'routineTrc', label:'กาชาด Routine', color:'#4b83c3', insideColor:'#ffffff' },
    { key:'otherHospital', label:'รพ.อื่น', color:'#a7b5c2', insideColor:'#173b5d' }
  ];
  const totals = items.map(row => series.reduce((sum,item)=>sum+Number(row?.[item.key]||0),0));
  const maxValue = Math.max(1, ...totals);
  const step = maxValue <= 20 ? 5 : maxValue <= 100 ? 20 : maxValue <= 300 ? 50 : maxValue <= 800 ? 100 : 200;
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const left = 82, right = 60, top = 98, bottom = multiYear ? 122 : 92;
  const groupW = items.length > 18 ? 82 : 94;
  const chartW = Math.max(840, groupW * items.length);
  const w = left + right + chartW, h = 560, chartH = h - top - bottom;
  const xCenter = i => left + groupW * i + groupW / 2;
  const y = value => top + chartH - (Math.max(0, Number(value || 0)) / yMax) * chartH;
  const chartBottom = top + chartH;
  const barW = Math.max(34, Math.min(48, groupW * .52));
  const grid = [0,.25,.5,.75,1].map(frac => {
    const value = Math.round(yMax * frac);
    const yy = top + chartH - chartH * frac;
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8eff5"/><text x="${left-12}" y="${yy+4}" text-anchor="end" font-size="12" fill="#8398aa">${value.toLocaleString()}</text>`;
  }).join('');
  const bars = items.map((row,i) => {
    const cx = xCenter(i), x = cx - barW/2;
    let running = 0;
    const parts = series.map((item, itemIndex) => {
      const value = Number(row?.[item.key] || 0);
      if (value <= 0) return '';
      const yTop = y(running + value);
      const yBottom = y(running);
      const hh = Math.max(2, yBottom - yTop);
      const valueLabel = renderKpiSegmentValueLabel(cx, yTop, hh, value, item.color, {
        barWidth:barW,
        top,
        side:itemIndex % 2 === 0 ? -1 : 1,
        fontSize:items.length>18?8.8:9.8,
        minInside:15,
        insideColor:item.insideColor
      });
      running += value;
      return `<rect x="${x}" y="${yTop}" width="${barW}" height="${hh}" fill="${item.color}" opacity=".95"><title>${escapeOutreachHtml(row.periodLabel || '')} · ${item.label} ${value.toLocaleString()} ถุง</title></rect>${valueLabel}`;
    }).join('');
    const total = totals[i] || 0;
    const totalY = Math.max(top + 13, y(total) - 10);
    const totalLabel = total > 0 ? `<text x="${cx}" y="${totalY}" text-anchor="middle" font-size="${items.length>18?10:11}" font-weight="900" fill="#36556f" style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round">รวม ${total.toLocaleString()}</text>` : '';
    return `${parts}${totalLabel}`;
  }).join('');
  const labels = items.map((row,i) => `<text x="${xCenter(i)}" y="${h-(multiYear?56:32)}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month||0)] || row.periodLabel || '')}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, xCenter, chartBottom) : '';
  let legendX = left;
  const legend = series.map(item => {
    const width = item.label.length > 15 ? 180 : 145;
    const out = `<g transform="translate(${legendX},34)"><rect x="0" y="-9" width="14" height="14" rx="4" fill="${item.color}"/><text x="22" y="2" font-size="12" fill="#5b7285">${escapeOutreachHtml(item.label)}</text></g>`;
    legendX += width;
    return out;
  }).join('');
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="ภาพรวมจำนวนรับเข้า RBC และ SDR รายเดือนแบบแท่งซ้อนแยกตามแหล่งเลือด พร้อมตัวเลขทุกแหล่ง"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${legend}${grid}${yearBandsSvg}${bars}${labels}</svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}


function renderRoutineTrcVsOutreachMonthlySvg(rows) {
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if (!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const maxValue = Math.max(1, ...items.flatMap(row => [Number(row?.routineTrc || 0), Number(row?.selfOutreach || 0)]));
  const step = maxValue <= 20 ? 5 : maxValue <= 100 ? 20 : maxValue <= 300 ? 50 : maxValue <= 800 ? 100 : 200;
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const left = 82, right = 46, top = 88, bottom = multiYear ? 122 : 92;
  const groupW = items.length > 18 ? 84 : 96;
  const chartW = Math.max(760, groupW * items.length);
  const w = left + right + chartW, h = 500, chartH = h - top - bottom;
  const xCenter = i => left + groupW * i + groupW / 2;
  const y = value => top + chartH - (Math.max(0, Number(value || 0)) / yMax) * chartH;
  const chartBottom = top + chartH;
  const barW = Math.max(20, Math.min(29, groupW * .3));
  const gap = 6;
  const grid = [0,.25,.5,.75,1].map(frac => {
    const value = Math.round(yMax * frac);
    const yy = top + chartH - chartH * frac;
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8eff5"/><text x="${left-12}" y="${yy+4}" text-anchor="end" font-size="12" fill="#8398aa">${value.toLocaleString()}</text>`;
  }).join('');
  const bars = items.map((row,i) => {
    const center = xCenter(i);
    const values = [
      { value:Number(row?.routineTrc || 0), label:'กาชาด Routine', color:'#4b83c3', x:center-gap/2-barW },
      { value:Number(row?.selfOutreach || 0), label:'ออกหน่วย', color:'#63bf9b', x:center+gap/2 }
    ];
    return values.map(item => {
      const yy = y(item.value);
      const hh = item.value > 0 ? Math.max(3, chartBottom - yy) : 0;
      const labelY = Math.max(top + 13, yy - 7);
      return `<rect x="${item.x}" y="${yy}" width="${barW}" height="${hh}" rx="6" fill="${item.color}" opacity=".95"><title>${escapeOutreachHtml(row.periodLabel || '')} · ${item.label} ${item.value.toLocaleString()} ถุง</title></rect>${item.value>0?`<text x="${item.x+barW/2}" y="${labelY}" text-anchor="middle" font-size="${items.length>18?10:11}" font-weight="800" fill="#36556f" style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round">${item.value.toLocaleString()}</text>`:''}`;
    }).join('');
  }).join('');
  const labels = items.map((row,i) => `<text x="${xCenter(i)}" y="${h-(multiYear?56:32)}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month||0)] || row.periodLabel || '')}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, xCenter, chartBottom) : '';
  const legend = `<g transform="translate(${left},34)"><rect x="0" y="-9" width="14" height="14" rx="4" fill="#4b83c3"/><text x="22" y="2" font-size="12" fill="#5b7285">กาชาด Routine</text><rect x="150" y="-9" width="14" height="14" rx="4" fill="#63bf9b"/><text x="172" y="2" font-size="12" fill="#5b7285">ออกหน่วย</text></g>`;
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="จำนวนกาชาด Routine เทียบเลือดจากการออกหน่วยรายเดือน"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${legend}${grid}${yearBandsSvg}${bars}${labels}</svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}

function buildTrcMinimumReviewMonthRows(review = {}, planningRows = []) {
  const reviewMap = new Map((Array.isArray(review?.monthly) ? review.monthly : []).map(row => [
    `${Number(row?.year)}-${String(Number(row?.month || 0)).padStart(2,'0')}`,
    row
  ]));
  return (Array.isArray(planningRows) ? planningRows : []).map(row => {
    const key = `${Number(row?.year)}-${String(Number(row?.month || 0)).padStart(2,'0')}`;
    const found = reviewMap.get(key) || {};
    return {
      year: Number(row?.year || found?.year || 0),
      month: Number(row?.month || found?.month || 0),
      periodLabel: row?.periodLabel || '',
      routineTrc: Number(found?.routineTrc || 0),
      assessed: Number(found?.assessed || 0),
      needed: Number(found?.needed || 0),
      review: Number(found?.review || 0),
      unassessed: Number(found?.unassessed || 0),
      reviewRate: Number(found?.reviewRate || 0)
    };
  });
}

function renderTrcMinimumReviewMonthlySvg(review = {}, planningRows = []) {
  const rows = buildTrcMinimumReviewMonthRows(review, planningRows);
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if (!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const maxValue = Math.max(1, ...items.map(row => Number(row?.assessed || 0) + Number(row?.unassessed || 0)));
  const step = maxValue <= 20 ? 5 : maxValue <= 100 ? 20 : maxValue <= 300 ? 50 : 100;
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const left = 82, right = 60, top = 98, bottom = multiYear ? 122 : 92;
  const groupW = items.length > 18 ? 78 : 90;
  const chartW = Math.max(840, groupW * items.length);
  const w = left + right + chartW, h = 540, chartH = h - top - bottom;
  const chartBottom = top + chartH;
  const xCenter = i => left + groupW * i + groupW / 2;
  const y = value => top + chartH - (Math.max(0, Number(value || 0)) / yMax) * chartH;
  const barW = Math.max(34, Math.min(48, groupW * .54));
  const grid = [0,.25,.5,.75,1].map(frac => {
    const value = Math.round(yMax * frac);
    const yy = top + chartH - chartH * frac;
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8eff5"/><text x="${left-12}" y="${yy+4}" text-anchor="end" font-size="12" fill="#8398aa">${value.toLocaleString()}</text>`;
  }).join('');
  const bars = items.map((row,i) => {
    const cx = xCenter(i), x = cx - barW/2;
    const segments = [
      { key:'needed', value:Number(row?.needed || 0), color:'#63bf9b', label:'Stock ต่ำกว่า Minimum', insideColor:'#173b5d' },
      { key:'review', value:Number(row?.review || 0), color:'#e7a14f', label:'Stock พอแล้ว · ควรทบทวน', insideColor:'#ffffff' },
      { key:'unassessed', value:Number(row?.unassessed || 0), color:'#a9b7c3', label:'ประเมินไม่ได้', insideColor:'#173b5d' }
    ];
    let running = 0;
    const parts = segments.map((seg, segIndex) => {
      if (seg.value <= 0) return '';
      const yTop = y(running + seg.value), yBottom = y(running);
      const hh = Math.max(2, yBottom-yTop);
      const valueLabel = renderKpiSegmentValueLabel(cx, yTop, hh, seg.value, seg.color, {
        barWidth:barW,
        top,
        side:segIndex % 2 === 0 ? -1 : 1,
        fontSize:items.length>18?9.0:10.0,
        minInside:15,
        insideColor:seg.insideColor
      });
      running += seg.value;
      return `<rect x="${x}" y="${yTop}" width="${barW}" height="${hh}" fill="${seg.color}"><title>${escapeOutreachHtml(row.periodLabel || '')} · ${seg.label} ${seg.value.toLocaleString()} ถุง</title></rect>${valueLabel}`;
    }).join('');
    const total = Number(row?.routineTrc || 0);
    const labelY = Math.max(top + 14, y(running)-10);
    const totalLabel = total > 0 ? `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="${items.length>18?10:11}" font-weight="900" fill="#36556f" style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round">รวม ${total.toLocaleString()}</text>` : '';
    return `${parts}${totalLabel}`;
  }).join('');
  const labels = items.map((row,i) => `<text x="${xCenter(i)}" y="${h-(multiYear?56:32)}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month||0)] || row.periodLabel || '')}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, xCenter, chartBottom) : '';
  const legend = `<g transform="translate(${left},34)"><rect x="0" y="-9" width="14" height="14" rx="4" fill="#63bf9b"/><text x="22" y="2" font-size="12" fill="#5b7285">Stock ต่ำกว่า Minimum</text><rect x="190" y="-9" width="14" height="14" rx="4" fill="#e7a14f"/><text x="212" y="2" font-size="12" fill="#5b7285">Stock พอแล้ว · ควรทบทวน</text><rect x="430" y="-9" width="14" height="14" rx="4" fill="#a9b7c3"/><text x="452" y="2" font-size="12" fill="#5b7285">ประเมินไม่ได้</text></g>`;
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="กาชาด Routine เทียบสถานะ Minimum Stock ตอนต้นวันรายเดือน พร้อมตัวเลขทุกสถานะ"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${legend}${grid}${yearBandsSvg}${bars}${labels}</svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}


function renderTrcMinimumReviewBagStatus(bag = {}) {
  if (bag?.canEvaluate === false) return `<span class="trc-min-badge is-unknown">ประเมินไม่ได้</span>`;
  if (bag?.assessment === 'review') return `<span class="trc-min-badge is-review">ควรทบทวน</span>`;
  return `<span class="trc-min-badge is-needed">เติม Minimum</span>`;
}

function renderTrcMinimumReviewDays(review = {}) {
  const days = Array.isArray(review?.days) ? review.days : [];
  if (!days.length) return `<div class="trc-min-empty">ยังไม่มีรายการกาชาด Routine ในช่วงที่เลือก</div>`;
  return `<div class="trc-min-day-toolbar no-print">
      <button class="trc-day-filter active" type="button" data-trc-day-filter="review" onclick="filterTrcMinimumReviewDays('review',this)">วันที่ควรทบทวน</button>
      <button class="trc-day-filter" type="button" data-trc-day-filter="all" onclick="filterTrcMinimumReviewDays('all',this)">ทุกวันที่รับกาชาด</button>
    </div>
    <div class="trc-min-day-list">${days.map(day => {
      const hasReview = Number(day?.review || 0) > 0;
      const bags = Array.isArray(day?.bags) ? day.bags : [];
      return `<details class="trc-min-day" data-has-review="${hasReview ? '1':'0'}" ${hasReview ? '' : 'style="display:none"'}>
        <summary>
          <span><b>${escapeOutreachHtml(formatThaiDateShort(day?.date) || String(day?.date || '-'))}</b><small>กาชาด Routine ${Number(day?.routineTrc || 0).toLocaleString()} ถุง</small></span>
          <span class="trc-min-day-count ${hasReview ? 'is-review':''}">${hasReview ? `ควรทบทวน ${Number(day?.review || 0).toLocaleString()} ถุง` : `เติม Minimum ${Number(day?.needed || 0).toLocaleString()} ถุง`}</span>
        </summary>
        <div class="table-responsive"><table class="table simple-table trc-min-detail-table align-middle mb-0"><thead><tr><th>Bag No.</th><th>ผลิตภัณฑ์</th><th>หมู่เลือด</th><th class="text-end">Minimum</th><th class="text-end">Stock ต้นวัน</th><th>ประเมิน</th></tr></thead><tbody>${bags.map(bag => `<tr class="${bag?.assessment === 'review' && bag?.canEvaluate !== false ? 'trc-review-row':''}"><td><b class="trc-bag-no">${escapeOutreachHtml(bag?.bagNumber || '-')}</b></td><td>${escapeOutreachHtml(bag?.productType || '-')}</td><td>${escapeOutreachHtml(`${bag?.bloodGroup || '-'}${bag?.rh ? ` ${bag.rh}`:''}`)}</td><td class="text-end">${Number(bag?.minimumStock || 0).toLocaleString()}</td><td class="text-end"><b>${Number(bag?.stockStartDay || 0).toLocaleString()}</b></td><td>${renderTrcMinimumReviewBagStatus(bag)}</td></tr>`).join('')}</tbody></table></div>
      </details>`;
    }).join('')}</div>`;
}

function filterTrcMinimumReviewDays(mode = 'review', btn = null) {
  document.querySelectorAll('.trc-min-day').forEach(el => {
    el.style.display = mode === 'all' || el.dataset.hasReview === '1' ? '' : 'none';
  });
  document.querySelectorAll('.trc-day-filter').forEach(el => el.classList.toggle('active', el === btn || (!btn && el.dataset.trcDayFilter === mode)));
}

function renderTrcMinimumReviewPanel(review = {}, planningRows = [], options = {}) {
  if (review?.schemaReady === false) {
    return `<div class="simple-panel kpi-executive-panel mb-3 trc-minimum-review-panel"><div class="panel-heading-row"><div><h3>กาชาด Routine เทียบ Minimum Stock</h3><div class="small-muted">ดูว่ารับกาชาดในวันที่ Stock ต่ำกว่า Minimum หรือวันที่ Stock เพียงพอแล้ว</div></div></div><div class="trc-min-setup"><b>ต้องติดตั้งส่วนคำนวณ v2.9.64 ก่อน</b><span>${escapeOutreachHtml(review?.message || 'กรุณารัน SQL-v2.9.64-TRC-MINIMUM-REVIEW-PERFORMANCE.sql 1 ครั้ง')}</span></div></div>`;
  }
  const summary = review?.summary || {};
  const reviewRate = Number(summary?.reviewRate || 0);
  const unassessed = Number(summary?.unassessed || 0);
  const includeChart = options?.includeChart !== false;
  const includeDetails = options?.includeDetails !== false;
  const heading = includeDetails && !includeChart ? 'รายการตามวัน' : 'กาชาดเทียบ Minimum Stock';
  const selectedProducts = normalizeKpiSelectedValues(review?.productFilter || []);
  const productChip = selectedProducts.length ? `<span class="kpi-filter-result-chip">${escapeOutreachHtml(selectedProducts.join(' · '))}</span>` : '';
  const subtitle = includeDetails && !includeChart
    ? 'เปิดตามวันที่เพื่อดู Bag No., ผลิตภัณฑ์, หมู่เลือด, Minimum และ Stock ต้นวัน'
    : 'ครอบคลุม LPRC/LDPRC, FFP, LDPPC, Cryo และ SDP ว่ารับกาชาดในวันที่ Stock ต้นวันต่ำกว่า Minimum หรือมีเพียงพอแล้ว';
  return `<div class="simple-panel kpi-executive-panel mb-3 trc-minimum-review-panel" id="trc-minimum-review-panel">
    <div class="panel-heading-row"><div><h3>${heading}</h3>${productChip}</div><div class="trc-chart-actions no-print">${includeChart ? `<button class="btn btn-light btn-sm" type="button" onclick="downloadTrcChartPng('minimumReview')">PNG</button>` : ''}<button class="btn btn-light btn-sm" type="button" onclick="exportTrcMinimumReviewExcel()">Excel รายถุง</button></div></div>
    <div class="trc-min-summary-grid">
      <div class="trc-min-stat"><span>ประเมินได้</span><strong>${Number(summary?.assessed || 0).toLocaleString()} ถุง</strong></div>
      <div class="trc-min-stat is-needed"><span>Stock ต่ำกว่า Minimum</span><strong>${Number(summary?.needed || 0).toLocaleString()} ถุง</strong></div>
      <div class="trc-min-stat is-review"><span>Stock พอแล้ว</span><strong>${Number(summary?.review || 0).toLocaleString()} ถุง</strong></div>
      <div class="trc-min-stat ${reviewRate > 0 ? 'is-review':''}"><span>ควรทบทวน</span><strong>${reviewRate.toFixed(1)}%</strong></div>
    </div>
    ${includeChart ? `<div id="trc-minimum-review-chart">${renderTrcMinimumReviewMonthlySvg(review, planningRows)}</div>` : ''}
    ${renderKpiInfoDetails('วิธีคำนวณ', `สีส้ม = รายการที่ควรทบทวน ไม่ได้แปลว่าเบิกผิด<br>Rare / Ag-matched / Rh Negative ไม่รวมใน KPI นี้<br>ใช้ Stock ต้นวันที่คำนวณย้อนจาก DateStockIn / DateStockOut${unassessed > 0 ? `<br>ประเมินไม่ได้ ${unassessed.toLocaleString()} ถุง` : ''}`)}
    ${includeDetails ? `<div class="trc-min-detail-head"><div><h4>รายละเอียดรายวัน</h4></div></div>${renderTrcMinimumReviewDays(review)}` : ''}
  </div>`;
}

function renderExecutiveHorizontalBars(rows, options={}) {
  const items=(Array.isArray(rows)?rows:[]).slice(0,8);
  if(!items.length) return `<div class="small-muted">ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ</div>`;
  const valueKey=options.valueKey||'value', suffix=options.suffix||'', countKey=options.countKey||'', countLabel=options.countLabel||'', color=options.color||'#5aa9e6';
  const max=Number(options.max)||Math.max(...items.map(r=>Number(r?.[valueKey]||0)),1);
  const w=1260,rowH=82,left=410,right=120,top=26,bottom=26,h=top+bottom+rowH*items.length,chartW=w-left-right;
  return `<svg class="kpi-exec-bar-chart" viewBox="0 0 ${w} ${h}" role="img">${items.map((item,i)=>{const v=Number(item?.[valueKey]||0),width=max?Math.max(10,(v/max)*chartW):10,y=top+i*rowH,label=String(item?.label||'');const count=countKey?Number(item?.[countKey]||0):null;return `<text x="${left-18}" y="${y+26}" text-anchor="end" font-size="17" font-weight="700" fill="#284a63">${escapeOutreachHtml(label)}</text>${countKey?`<text x="${left-18}" y="${y+50}" text-anchor="end" font-size="13" fill="#8297a9">${count.toLocaleString()} ${escapeOutreachHtml(countLabel)}</text>`:''}<rect x="${left}" y="${y+16}" width="${chartW}" height="28" rx="14" fill="#edf3f7"/><rect x="${left}" y="${y+16}" width="${width}" height="28" rx="14" fill="${color}" opacity="0.96"/><text x="${left+Math.min(width+14,chartW-8)}" y="${y+35}" font-size="16" font-weight="700" fill="#294d68">${v.toFixed(1)}${suffix}</text>`}).join('')}</svg>`;
}

function renderMonthlyAgeExecutiveSvg(rows, rangeLabel = '') {
  const { items, multiYear, yearBands } = getKpiContinuousMonthChartMeta(rows);
  if(!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const valid=items.filter(r=>Number.isFinite(r.medianDays));
  const left=84,right=56,top=72,bottom=multiYear ? 120 : 96;
  const groupW = items.length > 18 ? 70 : 82;
  const chartW = Math.max(720, groupW * items.length);
  const w=left+right+chartW,h=540,chartH=h-top-bottom;
  const maxDays=Math.max(7,...valid.map(r=>Number(r.medianDays||0))),yMax=Math.max(28,Math.ceil(maxDays/7)*7);
  const x=i=>left+chartW*(i+.5)/items.length,y=v=>top+chartH-(Number(v||0)/yMax)*chartH;
  const grid=[0,.25,.5,.75,1].map(frac=>{const val=Math.round(yMax*frac),yy=top+chartH-chartH*frac;return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-14}" y="${yy+5}" text-anchor="end" font-size="13" fill="#7890a4">${val}</text>`}).join('');
  const points=items.map((r,i)=>Number.isFinite(r.medianDays)?{i,value:Number(r.medianDays)}:null).filter(Boolean);
  const path=points.map((p,j)=>`${j===0?'M':'L'}${x(p.i)},${y(p.value)}`).join(' ');
  const dots=items.map((r,i)=>{const m=Number(r.medianDays);return Number.isFinite(m)?`<circle cx="${x(i)}" cy="${y(m)}" r="7" fill="#fff" stroke="#367fb5" stroke-width="4"/><text x="${x(i)}" y="${Math.max(top+14,y(m)-18)}" text-anchor="middle" font-size="12" font-weight="700" fill="#27648f">${m.toFixed(1)}</text>`:''}).join('');
  const labels=items.map((r,i)=>`<text x="${x(i)}" y="${h-(multiYear?48:46)}" text-anchor="middle" font-size="${items.length>18?11:13}" font-weight="600" fill="#536f84">${escapeOutreachHtml(['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(r.month||0)] || r.periodLabel || '')}</text><text x="${x(i)}" y="${h-(multiYear?28:26)}" text-anchor="middle" font-size="11" fill="#8aa0b1">n=${Number(r.usedCount||0).toLocaleString()}</text>`).join('');
  const yearBandsSvg = multiYear ? renderKpiYearBandSvg(yearBands, x, top + chartH) : '';
  const svg = `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img"><rect x="10" y="10" width="${w-20}" height="${h-20}" rx="28" fill="#fff" stroke="#edf3f7"/>${grid}${yearBandsSvg}<line x1="${left}" y1="${y(21)}" x2="${w-right}" y2="${y(21)}" stroke="#e4a74c" stroke-width="2" stroke-dasharray="7 7"/><path d="${path}" fill="none" stroke="#367fb5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  return wrapScrollableKpiSvg(svg, items.length > 10);
}


function renderAgeDistributionSvg(dist={}) {
  const rows=[['0–7 วัน',Number(dist.within7||0),'#63c29f'],['8–14 วัน',Number(dist.day8to14||0),'#75b7e8'],['15–21 วัน',Number(dist.day15to21||0),'#f1c76a'],['> 21 วัน',Number(dist.over21||0),'#ef8b83']];
  const total=rows.reduce((s,r)=>s+r[1],0);
  const w=720,h=300,left=150,right=80,top=28,rowH=60,chartW=w-left-right;
  return `<svg class="kpi-age-dist-chart" viewBox="0 0 ${w} ${h}" role="img">${rows.map((r,i)=>{const pct=total?100*r[1]/total:0,y=top+i*rowH,width=chartW*pct/100;return `<text x="${left-12}" y="${y+24}" text-anchor="end" font-size="14" fill="#35556f">${r[0]}</text><rect x="${left}" y="${y+8}" width="${chartW}" height="24" rx="12" fill="#edf3f7"/><rect x="${left}" y="${y+8}" width="${Math.max(width,3)}" height="24" rx="12" fill="${r[2]}"/><text x="${left+chartW+10}" y="${y+25}" font-size="14" font-weight="700" fill="#35556f">${pct.toFixed(1)}%</text><text x="${left}" y="${y+48}" font-size="11" fill="#8aa0b1">${r[1].toLocaleString()} ถุง</text>`}).join('')}</svg>`;
}

function renderBloodOutcomeMonthlySvg(rows, year) {
  const items = Array.isArray(rows) ? rows : [];
  const w = 920, h = 390, left = 58, right = 40, top = 44, bottom = 58;
  const chartW = w-left-right, chartH = h-top-bottom;
  const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const totals = items.map(r => Number(r.used||0)+Number(r.expired||0)+Number(r.unresolved||0));
  const maxValue = Math.max(5, ...totals), roundedMax = Math.ceil(maxValue/5)*5;
  const y = value => top + chartH - (Number(value||0)/roundedMax)*chartH;
  const groupW = chartW/Math.max(12,items.length||12), barW = Math.min(30,groupW*.44);
  const grid=[0,.25,.5,.75,1].map(frac=>{const value=Math.round(roundedMax*frac),yy=y(value);return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-10}" y="${yy+4}" text-anchor="end" font-size="11" fill="#7890a4">${value}</text>`}).join('');
  const bars=items.map((r,i)=>{
    const used=Number(r.used||0), expired=Number(r.expired||0), unresolved=Number(r.unresolved||0), total=used+expired+unresolved;
    const cx=left+groupW*i+groupW/2, x=cx-barW/2, topY=y(total), totalH=chartH-(topY-top);
    const usedH=total?totalH*used/total:0, expiredH=total?totalH*expired/total:0, unresolvedH=total?totalH*unresolved/total:0;
    const unresolvedY=topY, expiredY=topY+unresolvedH, usedY=top+chartH-usedH;
    const labels = [
      renderKpiSegmentValueLabel(cx, unresolvedY, unresolvedH, unresolved, '#9ab3c5', {barWidth:barW, top, side:-1, fontSize:9.2, minInside:15, insideColor:'#173b5d'}),
      renderKpiSegmentValueLabel(cx, expiredY, expiredH, expired, '#f28b82', {barWidth:barW, top, side:1, fontSize:9.2, minInside:15, insideColor:'#ffffff'}),
      renderKpiSegmentValueLabel(cx, usedY, usedH, used, '#68c3a3', {barWidth:barW, top, side:-1, fontSize:9.2, minInside:15, insideColor:'#173b5d'})
    ].join('');
    const totalLabel = total > 0 ? `<text x="${cx}" y="${Math.max(top+12,topY-8)}" text-anchor="middle" font-size="10.5" font-weight="900" fill="#36556f" style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round">รวม ${total.toLocaleString()}</text>` : '';
    return `<g><rect x="${x}" y="${topY}" width="${barW}" height="${Math.max(total?3:0,totalH)}" rx="7" fill="#f7fbfe" stroke="#dce8f2"/>${unresolved?`<rect x="${x+1}" y="${topY}" width="${barW-2}" height="${unresolvedH}" rx="6" fill="#9ab3c5"><title>${names[i]} ยังอยู่ในคลัง ${unresolved.toLocaleString()} ถุง</title></rect>`:''}${expired?`<rect x="${x+1}" y="${topY+unresolvedH}" width="${barW-2}" height="${expiredH}" fill="#f28b82"><title>${names[i]} Expired ${expired.toLocaleString()} ถุง</title></rect>`:''}${used?`<rect x="${x+1}" y="${top+chartH-usedH}" width="${barW-2}" height="${usedH}" rx="6" fill="#68c3a3"><title>${names[i]} Used ${used.toLocaleString()} ถุง</title></rect>`:''}${labels}${totalLabel}<text x="${cx}" y="${h-18}" text-anchor="middle" font-size="11" fill="#6f8598">${names[i]}</text></g>`;
  }).join('');
  return `<svg class="kpi-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="แนวโน้มผลถุงเลือดรายเดือน พร้อมตัวเลขทุกผลลัพธ์">${grid}${bars}<g transform="translate(${left+8},${top-14})"><rect x="0" y="-8" width="16" height="10" rx="3" fill="#68c3a3"></rect><text x="24" y="0" font-size="12" fill="#36556f">Used</text><rect x="78" y="-8" width="16" height="10" rx="3" fill="#f28b82"></rect><text x="102" y="0" font-size="12" fill="#36556f">Expired</text><rect x="178" y="-8" width="16" height="10" rx="3" fill="#9ab3c5"></rect><text x="202" y="0" font-size="12" fill="#36556f">ยังอยู่ในคลัง</text><text x="332" y="0" font-size="12" fill="#7890a4">ปี ${year+543}</text></g></svg>`;
}



function renderBloodKpiLineSvg(months, year, comparisonYear) {
  const rows = Array.isArray(months) ? months : [];
  const w = 920, h = 390, left = 62, right = 28, top = 36, bottom = 54;
  const chartW = w-left-right, chartH = h-top-bottom;
  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const validRates = rows.flatMap(m => [Number(m.rate||0), Number(m.previousRate||0), Number((m.adjustedRate ?? m.rate) || 0)]).filter(Number.isFinite);
  const maxRate = Math.max(10, Math.ceil(Math.max(...validRates, 0) / 10) * 10);
  const yMax = Math.min(100, maxRate + 10);
  const x = i => left + (chartW * i / 11);
  const y = v => top + chartH - (Math.max(0,Math.min(yMax,Number(v||0))) / yMax) * chartH;
  const pathFor = key => rows.map((m,i)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(m[key] ?? m.rate).toFixed(1)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map(frac => {
    const value = Math.round(yMax*frac);
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-10}" y="${yy+4}" text-anchor="end" font-size="11" fill="#7890a4">${value}%</text>`;
  }).join("");
  const xLabels = rows.map((m,i)=>`<text x="${x(i)}" y="${h-18}" text-anchor="middle" font-size="11" fill="#6f8598">${monthNames[i]}</text>`).join("");
  const labelStyle='paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round';
  const currentDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.rate)}" r="4" fill="#2d9f73"><title>${monthNames[i]} ${year+543}: ${Number(m.rate||0).toFixed(1)}%</title></circle>`).join("");
  const adjustedDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.adjustedRate ?? m.rate)}" r="3" fill="#1c77c3"><title>${monthNames[i]} ปรับแล้ว: ${Number((m.adjustedRate ?? m.rate)||0).toFixed(1)}%</title></circle>`).join("");
  const prevDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.previousRate)}" r="3" fill="#7890a4"><title>${monthNames[i]} ${comparisonYear+543}: ${Number(m.previousRate||0).toFixed(1)}%</title></circle>`).join("");
  const currentLabels = rows.map((m,i)=>`<text x="${x(i)}" y="${Math.max(top+11,y(m.rate)-11)}" text-anchor="middle" font-size="9.8" font-weight="800" fill="#2d9f73" style="${labelStyle}">${Number(m.rate||0).toFixed(1)}%</text>`).join('');
  const adjustedLabels = rows.map((m,i)=>`<text x="${x(i)}" y="${Math.min(top+chartH-8,y(m.adjustedRate ?? m.rate)+17)}" text-anchor="middle" font-size="9.3" font-weight="800" fill="#1c77c3" style="${labelStyle}">${Number((m.adjustedRate ?? m.rate)||0).toFixed(1)}%</text>`).join('');
  const prevLabels = rows.map((m,i)=>`<text x="${x(i)}" y="${Math.min(top+chartH+16,y(m.previousRate)+31)}" text-anchor="middle" font-size="8.8" font-weight="700" fill="#7890a4" style="${labelStyle}">${Number(m.previousRate||0).toFixed(1)}%</text>`).join('');
  return `<svg class="kpi-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="แนวโน้มอัตราพึ่งพาเลือดแดงจากสภากาชาดไทย พร้อมตัวเลขทุกเส้น">
    ${grid}
    <path d="${pathFor("previousRate")}" fill="none" stroke="#8fa5b7" stroke-width="2.5" stroke-dasharray="7 6"/>
    <path d="${pathFor("rate")}" fill="none" stroke="#2d9f73" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${pathFor("adjustedRate")}" fill="none" stroke="#1c77c3" stroke-width="2.5" stroke-dasharray="2 8"/>
    ${prevDots}${currentDots}${adjustedDots}${prevLabels}${currentLabels}${adjustedLabels}${xLabels}
    <g transform="translate(${left+8},${top+8})"><line x1="0" y1="0" x2="28" y2="0" stroke="#2d9f73" stroke-width="4"/><text x="36" y="4" font-size="12" fill="#36556f">รวม ${year+543}</text><line x1="118" y1="0" x2="146" y2="0" stroke="#1c77c3" stroke-width="2.5" stroke-dasharray="2 8"/><text x="154" y="4" font-size="12" fill="#36556f">ปรับแล้ว</text><line x1="240" y1="0" x2="268" y2="0" stroke="#8fa5b7" stroke-width="2.5" stroke-dasharray="7 6"/><text x="276" y="4" font-size="12" fill="#36556f">${comparisonYear+543}</text></g>
  </svg>`;
}


function renderHorizontalBarChartSvg(rows, options = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const limited = items.slice(0, 8);
  if (!limited.length) return `<div class="small-muted">ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ</div>`;
  const valueKey = options.valueKey || 'value';
  const suffix = options.suffix || '';
  const sublabelKey = options.sublabelKey || '';
  const sublabelSuffix = options.sublabelSuffix || '';
  const color = options.color || '#5aa9e6';
  const maxValue = options.max || Math.max(...limited.map(item => Number(item?.[valueKey] || 0)), 1);
  const w = 860, rowH = 54, top = 18, bottom = 18, left = 210, right = 56;
  const h = top + bottom + rowH * limited.length;
  const chartW = w - left - right;
  return `<svg class="kpi-bar-svg" viewBox="0 0 ${w} ${h}" role="img">${limited.map((item, index) => {
    const value = Number(item?.[valueKey] || 0);
    const width = maxValue > 0 ? (value / maxValue) * chartW : 0;
    const y = top + rowH * index;
    const label = String(item?.label || '');
    const extra = sublabelKey ? `${Number(item?.[sublabelKey] || 0).toLocaleString()}${sublabelSuffix}` : '';
    return `
      <text x="${left - 12}" y="${y + 20}" text-anchor="end" font-size="13" fill="#35556f">${escapeOutreachHtml(label)}</text>
      ${extra ? `<text x="${left - 12}" y="${y + 38}" text-anchor="end" font-size="11" fill="#7f95a8">${escapeOutreachHtml(extra)}</text>` : ''}
      <rect x="${left}" y="${y + 8}" width="${chartW}" height="18" rx="9" fill="#eef3f8"></rect>
      <rect x="${left}" y="${y + 8}" width="${Math.max(width, 3)}" height="18" rx="9" fill="${color}"></rect>
      <text x="${left + chartW + 10}" y="${y + 22}" font-size="13" fill="#35556f">${value.toFixed(1)}${suffix}</text>`;
  }).join('')}</svg>`;
}

function getTrcChartExportConfig(kind) {
  const configs = {
    outreach: {
      panelId:'trc-outreach-chart',
      title:'กาชาด Routine เทียบเลือดจากการออกหน่วย',
      subtitle:'จำนวนถุงรายเดือนเพื่อใช้ประกอบการวางแผนออกหน่วย',
      note:'ใช้ร่วมกับ Minimum Stock และ Forecast ก่อนกำหนดรอบออกหน่วย · กาชาด Routine ไม่รวม Rare / Ag-matched / Rh Negative'
    },
    source: {
      panelId:'trc-source-chart',
      title:'ภาพรวมจำนวนรับเข้า RBC / SDR รายเดือน',
      subtitle:'แท่งซ้อนแสดงจำนวนรับเข้าจากแต่ละแหล่งในเดือนเดียวกัน',
      note:'ตัวเลขบนยอดแท่ง = จำนวนรับเข้ารวม · แต่ละช่วงสีแสดงจำนวนถุงของแหล่งนั้นโดยตรง · Rare / Ag-matched / Rh Negative แยกออกจาก Routine KPI ตามเกณฑ์เดิม'
    },
    rate: {
      panelId:'trc-rate-chart',
      title:'แนวโน้มพึ่งพากาชาด Routine',
      subtitle:'อัตราพึ่งพากาชาดของเลือด Routine ในแต่ละเดือน',
      note:'Routine KPI แยก Rare / Ag-matched / Rh Negative ออกแล้ว เพื่อไม่ให้ภาวะจำเป็นทางคลินิกปนกับการบริหาร Stock Routine'
    },
    rare: {
      panelId:'trc-rare-chart',
      title:'เลือดหายาก / ภาวะจำเป็นจากกาชาด',
      subtitle:'จำนวนถุง Rare / Ag-matched / Rh Negative รายเดือน',
      note:'รายงานแยกเพื่อแสดงการพึ่งพาที่เกิดจากความจำเป็นทางคลินิก และไม่รวมใน Routine KPI'
    },
    minimumReview: {
      panelId:'trc-minimum-review-chart',
      title:'กาชาด Routine เทียบ Minimum Stock',
      subtitle:'แยกรายเดือนว่ารับกาชาดขณะ Stock ต้นวันต่ำกว่า Minimum หรือมีเพียงพอแล้ว ตามชนิดผลิตภัณฑ์ที่เลือก',
      note:'ตัวเลขในแต่ละช่วงสี = จำนวนถุงของสถานะนั้น · สีส้ม = ควรทบทวน ไม่ได้สรุปว่าเบิกผิด · ตัด Rare / Ag-matched / Rh Negative ออก · Stock ย้อนหลังประเมินจาก DateStockIn/DateStockOut ณ ต้นวัน'
    }
  };
  return configs[kind] || null;
}

function getTrcChartExportSummary(kind) {
  const data = currentBloodKpiRouteData || {};
  const rows = Array.isArray(data.planningMonths) && data.planningMonths.length ? data.planningMonths : (Array.isArray(data.months) ? data.months : []);
  const first = rows[0] || null, last = rows[rows.length - 1] || null;
  const range = first && last ? `${first.periodLabel || ''} – ${last.periodLabel || ''}` : 'ช่วงที่เลือก';
  const planning = summarizeBloodKpiTrcPlanning(Array.isArray(data.planningMonths) ? data.planningMonths : []);
  if (kind === 'outreach') return `ช่วง ${range} · กาชาด Routine เดือนล่าสุด ${Number(planning.latest?.routineTrc || 0).toLocaleString()} ถุง · เฉลี่ย ${planning.avg3Months || 0} เดือนล่าสุด ${Number(planning.avg3 || 0).toLocaleString(undefined,{maximumFractionDigits:1})} ถุง/เดือน`;
  if (kind === 'source') return `ช่วง ${range} · ใช้ดูโครงสร้างแหล่งรับเข้าและการเปลี่ยนแปลงของจำนวนถุงรายเดือน`;
  if (kind === 'rate') return `ช่วง ${range} · Routine KPI ${Number(data.adjusted || 0).toFixed(1)}% · กาชาด Routine ${Number(data.routine || 0).toLocaleString()} ถุง`;
  if (kind === 'rare') return `ช่วง ${range} · เลือดหายาก / ภาวะจำเป็น ${Number(data.rare || 0).toLocaleString()} ถุง`;
  if (kind === 'minimumReview') {
    const s = data.minimumReview?.summary || {};
    const products = normalizeKpiSelectedValues(data.minimumReview?.productFilter || []);
    const productText = products.length ? products.join(' · ') : 'ทุกชนิดผลิตภัณฑ์';
    return `ช่วง ${range} · ผลิตภัณฑ์: ${productText} · ประเมินได้ ${Number(s.assessed || 0).toLocaleString()} ถุง · Stock พอแล้ว/ควรทบทวน ${Number(s.review || 0).toLocaleString()} ถุง (${Number(s.reviewRate || 0).toFixed(1)}%) · ${Number(s.reviewDays || 0).toLocaleString()} วัน`;
  }
  return `ช่วง ${range}`;
}

function downloadTrcChartPng(kind) {
  const config = getTrcChartExportConfig(kind);
  const host = config ? document.getElementById(config.panelId) : null;
  const svg = host?.querySelector('svg');
  if (!config || !svg) {
    showStatus('ไม่พบกราฟสำหรับส่งออก', false);
    return;
  }
  try {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const viewBox = svg.viewBox?.baseVal;
    const rawW = Number(viewBox?.width || svg.getAttribute('width') || 1600);
    const rawH = Number(viewBox?.height || svg.getAttribute('height') || 560);
    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], { type:'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const canvasW = Math.min(3600, Math.max(2200, Math.round(rawW * 1.05)));
      const padX = 90, headerH = 310, footerH = 125;
      const maxChartW = canvasW - padX * 2;
      const scale = Math.min(maxChartW / rawW, 1.45);
      const drawW = rawW * scale, drawH = rawH * scale;
      canvas.width = canvasW;
      canvas.height = Math.ceil(headerH + drawH + footerH);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#173b5d'; ctx.font = '700 44px sans-serif'; ctx.fillText(config.title, padX, 68);
      ctx.fillStyle = '#60788d'; ctx.font = '400 22px sans-serif'; wrapCanvasText(ctx, config.subtitle, padX, 108, canvasW-padX*2, 30);
      ctx.fillStyle = '#31556f'; ctx.font = '700 20px sans-serif'; wrapCanvasText(ctx, getTrcChartExportSummary(kind), padX, 166, canvasW-padX*2, 28);
      ctx.fillStyle = '#71889b'; ctx.font = '400 18px sans-serif'; wrapCanvasText(ctx, config.note, padX, 216, canvasW-padX*2, 26);
      const drawX = Math.max(padX, (canvasW-drawW)/2);
      ctx.drawImage(image, drawX, headerH, drawW, drawH);
      const footerY = headerH + drawH + 48;
      ctx.fillStyle = '#8ca0b2'; ctx.font = '400 16px sans-serif';
      ctx.fillText(`Blood Stock CNMI · Export ${new Date().toLocaleDateString('th-TH')} · ภาพนี้รวมชื่อกราฟ คำอธิบาย และช่วงข้อมูลไว้แล้ว`, padX, footerY);
      const a = document.createElement('a');
      a.download = `blood-kpi-trc-${kind}-${new Date().toISOString().slice(0,10)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showStatus('ส่งออกกราฟไม่สำเร็จ', false);
    };
    image.src = url;
  } catch (error) {
    console.error('TRC chart export failed', error);
    showStatus('ส่งออกกราฟไม่สำเร็จ', false);
  }
}

function exportTrcMinimumReviewExcel() {
  if (!window.XLSX) {
    showStatus('ยังโหลดโมดูล Excel ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่', false);
    return;
  }
  const review = currentBloodKpiRouteData?.minimumReview || {};
  if (review?.schemaReady === false) {
    showStatus('กรุณารัน SQL-v2.9.61-TRC-MINIMUM-REVIEW.sql ก่อน', false);
    return;
  }
  const summary = review?.summary || {};
  const monthly = Array.isArray(review?.monthly) ? review.monthly : [];
  const days = Array.isArray(review?.days) ? review.days : [];
  const summaryRows = [
    { รายการ:'กาชาด Routine ในช่วงที่เลือก', ค่า:Number(summary.routineTrc || 0), หน่วย:'ถุง' },
    { รายการ:'รายการที่ประเมินได้', ค่า:Number(summary.assessed || 0), หน่วย:'ถุง' },
    { รายการ:'รับตอน Stock ต่ำกว่า Minimum', ค่า:Number(summary.needed || 0), หน่วย:'ถุง' },
    { รายการ:'รับตอน Stock เพียงพอแล้ว / ควรทบทวน', ค่า:Number(summary.review || 0), หน่วย:'ถุง' },
    { รายการ:'สัดส่วนที่ควรทบทวน', ค่า:Number(summary.reviewRate || 0), หน่วย:'%' },
    { รายการ:'วันที่มีรายการควรทบทวน', ค่า:Number(summary.reviewDays || 0), หน่วย:'วัน' },
    { รายการ:'เดือนที่มีรายการควรทบทวน', ค่า:Number(summary.reviewMonths || 0), หน่วย:'เดือน' },
    { รายการ:'ประเมินไม่ได้', ค่า:Number(summary.unassessed || 0), หน่วย:'ถุง' }
  ];
  const monthlyRows = monthly.map(row => ({
    'ปี พ.ศ.': Number(row.year || 0) + 543,
    เดือน: ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month || 0)] || row.month,
    'กาชาด Routine (ถุง)': Number(row.routineTrc || 0),
    'ประเมินได้ (ถุง)': Number(row.assessed || 0),
    'Stock ต่ำกว่า Minimum (ถุง)': Number(row.needed || 0),
    'Stock พอแล้ว / ควรทบทวน (ถุง)': Number(row.review || 0),
    'ประเมินไม่ได้ (ถุง)': Number(row.unassessed || 0),
    'สัดส่วนควรทบทวน (%)': Number(row.reviewRate || 0),
    'วันที่ควรทบทวน': Number(row.reviewDays || 0)
  }));
  const detailRows = [];
  days.forEach(day => {
    (Array.isArray(day?.bags) ? day.bags : []).forEach(bag => {
      detailRows.push({
        วันที่รับเข้า: formatThaiDateShort(day?.date) || String(day?.date || ''),
        'Bag No.': bag?.bagNumber || '',
        ผลิตภัณฑ์: bag?.productType || '',
        หมู่เลือด: `${bag?.bloodGroup || ''}${bag?.rh ? ` ${bag.rh}` : ''}`.trim(),
        Minimum: Number(bag?.minimumStock || 0),
        'Stock ต้นวัน': Number(bag?.stockStartDay || 0),
        ผลประเมิน: bag?.canEvaluate === false ? 'ประเมินไม่ได้' : bag?.assessment === 'review' ? 'ควรทบทวน — Stock พอแล้ว' : 'สอดคล้อง — Stock ต่ำกว่า Minimum',
        หมายเหตุ: bag?.assessmentNote || ''
      });
    });
  });
  const selectedProducts = normalizeKpiSelectedValues(review?.productFilter || []);
  const methodRows = [
    { หัวข้อ:'ตัวกรองผลิตภัณฑ์', รายละเอียด:selectedProducts.length ? selectedProducts.join(' · ') : 'ทุกชนิดผลิตภัณฑ์' },
    { หัวข้อ:'ขอบเขต', รายละเอียด:'เฉพาะกาชาด Routine; ตัด Rare / Ag-matched / Rh Negative ที่ลงทะเบียนไว้แล้วออกจาก KPI' },
    { หัวข้อ:'Stock ย้อนหลัง', รายละเอียด:'คำนวณ Stock ต้นวันจาก DateStockIn / DateStockOut ใน LIS' },
    { หัวข้อ:'Minimum ย้อนหลัง', รายละเอียด:'คำนวณจาก Released 180 วันก่อนวันรับเข้า: ceil(max(avg/day × 2, max daily use))' },
    { หัวข้อ:'ข้อจำกัด', รายละเอียด:'LIS ไม่มีเวลา movement ภายในวันครบทุกแถว และฐานวิเคราะห์ย้อนหลังไม่ได้เก็บ Location รายวัน จึงใช้เป็น screening KPI เพื่อชี้รายการที่ควรทบทวน ไม่ใช่ข้อสรุปว่าเบิกผิด' },
    { หัวข้อ:'วันที่ Export', รายละเอียด:new Date().toLocaleString('th-TH') }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'CQI Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Bag Detail');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(methodRows), 'Method');
  XLSX.writeFile(wb, `trc-minimum-review-${new Date().toISOString().slice(0,10)}.xlsx`);
  showStatus(`✅ ส่งออก Excel รายถุง ${detailRows.length.toLocaleString()} รายการแล้ว`, true);
}

function downloadBloodKpiChartPng() {
  const data = currentBloodKpiData;
  const months = Array.isArray(data?.months) ? data.months : [];
  if (!months.length) return;
  const year = Number(data.year||0), prev = Number(data.comparisonYear||year-1);
  const canvas = document.createElement("canvas");
  canvas.width = 1700; canvas.height = 980;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#173b5d"; ctx.font="700 34px sans-serif"; ctx.fillText("อัตราการพึ่งพาเลือดแดงจากสภากาชาดไทย",60,58);
  ctx.fillStyle="#6f8598"; ctx.font="400 18px sans-serif"; ctx.fillText(`ปี ${year+543} เทียบกับ ${prev+543} · แสดงตัวเลขของทุกเส้น`,60,90);
  const left=100, top=180, right=80, bottom=160, chartW=canvas.width-left-right, chartH=canvas.height-top-bottom;
  const maxRate=Math.min(100,Math.max(20,Math.ceil(Math.max(...months.flatMap(m=>[Number(m.rate||0),Number(m.previousRate||0),Number((m.adjustedRate??m.rate)||0)]),0)/10)*10+10));
  const x=i=>left+chartW*i/11, y=v=>top+chartH-(Number(v||0)/maxRate)*chartH;
  ctx.strokeStyle="#e6eef4"; ctx.fillStyle="#7890a4"; ctx.font="400 13px sans-serif";
  for(let i=0;i<=4;i++){const val=Math.round(maxRate*i/4),yy=y(val);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+chartW,yy);ctx.stroke();ctx.fillText(`${val}%`,46,yy+4);}
  const drawLine=(key,color,dash=[],width=3)=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();months.forEach((m,i)=>{const xx=x(i),yy=y(m[key] ?? m.rate);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);});ctx.stroke();ctx.restore();};
  drawLine('previousRate','#8fa5b7',[8,6],2.5); drawLine('rate','#2d9f73',[],4); drawLine('adjustedRate','#1c77c3',[2,8],2.5);
  const names=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  months.forEach((m,i)=>{
    const series=[
      {v:Number(m.rate||0),c:'#2d9f73',dy:-14,font:'700 13px sans-serif'},
      {v:Number((m.adjustedRate??m.rate)||0),c:'#1c77c3',dy:22,font:'700 12px sans-serif'},
      {v:Number(m.previousRate||0),c:'#7890a4',dy:42,font:'600 11px sans-serif'}
    ];
    series.forEach((it,j)=>{ctx.fillStyle=it.c;ctx.beginPath();ctx.arc(x(i),y(it.v),j===0?5:4,0,Math.PI*2);ctx.fill();ctx.font=it.font;const t=`${it.v.toFixed(1)}%`;const tw=ctx.measureText(t).width;ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeText(t,x(i)-tw/2,y(it.v)+it.dy);ctx.fillText(t,x(i)-tw/2,y(it.v)+it.dy);});
    ctx.fillStyle="#60788d";ctx.font="600 13px sans-serif";ctx.fillText(names[i],x(i)-14,top+chartH+34);
  });
  ctx.fillStyle="#36556f";ctx.font="600 15px sans-serif";ctx.fillText(`รวม ${year+543}`,80,135);ctx.strokeStyle="#2d9f73";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(20,130);ctx.lineTo(65,130);ctx.stroke();
  ctx.fillText(`ปรับแล้ว`,215,135);ctx.save();ctx.strokeStyle="#1c77c3";ctx.lineWidth=2.5;ctx.setLineDash([2,8]);ctx.beginPath();ctx.moveTo(135,130);ctx.lineTo(200,130);ctx.stroke();ctx.restore();
  ctx.fillText(`${prev+543}`,365,135);ctx.save();ctx.strokeStyle="#8fa5b7";ctx.lineWidth=2.5;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(300,130);ctx.lineTo(350,130);ctx.stroke();ctx.restore();
  ctx.fillStyle='#71889b';ctx.font='400 17px sans-serif';ctx.fillText('หมายเหตุ: ค่า “ปรับแล้ว” ใช้ Routine KPI หลังตัด Rare / Ag-matched / Rh Negative ตามเกณฑ์ระบบ',60,canvas.height-78);
  ctx.fillStyle='#8ca0b2';ctx.font='400 15px sans-serif';ctx.fillText(`Blood Stock CNMI · Export ${new Date().toLocaleDateString('th-TH')} · ตัวเลขกำกับครบทุก series`,60,canvas.height-44);
  const link=document.createElement('a');link.download=`blood-kpi-rbc-trc-${year+543}.png`;link.href=canvas.toDataURL('image/png');link.click();
}


function exportBloodKpiExcel() {
  if (!currentBloodKpiData || !currentBloodKpiInsights || !window.XLSX) return;
  const dependency = currentBloodKpiData;
  const insights = currentBloodKpiInsights;
  const summaryRows = [
    { KPI: 'อัตราการใช้ประโยชน์จากโลหิต', ค่า: Number(insights.utilizationRate || 0), หน่วย: '%', หมายเหตุ: 'Used ÷ (Used + Expired)' },
    { KPI: 'อัตราโลหิตหมดอายุ', ค่า: Number(insights.expiredRate || 0), หน่วย: '%', หมายเหตุ: 'Expired ÷ (Used + Expired)' },
    { KPI: 'อัตราพึ่งพากาชาด Routine', ค่า: Number((dependency.summary?.adjustedRate ?? dependency.summary?.rate) || 0), หน่วย: '%', หมายเหตุ: 'ตัด Rare/Ag-matched/Rh Negative ออก' },
    { KPI: 'Median วันรับเข้า → ใช้', ค่า: Number(insights.medianDaysToUse || 0), หน่วย: 'วัน', หมายเหตุ: 'คำนวณจากถุงที่ใช้/จ่ายแล้ว' },
    { KPI: 'อัตราเลือดค้างนาน', ค่า: Number(insights.longHeldRate || 0), หน่วย: '%', หมายเหตุ: 'RBC คงคลัง ≥ 21 วัน' },
    { KPI: 'ประสิทธิผลเลือดจากออกหน่วย', ค่า: Number(insights.outreachEffectiveness || 0), หน่วย: '%', หมายเหตุ: 'Used ÷ (Used + Expired) ของ SELF_OUTREACH' }
  ];
  const monthlyRows = (insights.monthlyOutcomeRows || []).map((row, idx) => ({
    เดือน: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][idx],
    Used: row.used,
    Expired: row.expired,
    ยังอยู่ในคลัง: row.unresolved,
    ร้อยละใช้ประโยชน์: row.utilizationRate,
    ร้อยละหมดอายุ: row.expiredRate,
    TRCรวม: Number(dependency.months?.[idx]?.trcRbc || 0),
    RoutineTRC: Number(dependency.months?.[idx]?.routineTrcRbc ?? Math.max(0, Number(dependency.months?.[idx]?.trcRbc || 0) - Number(dependency.months?.[idx]?.rareTrcRbc || 0)))
  }));
  const sourceRows = (insights.sourceGroupRates || []).map(item => ({
    แหล่งรับเข้า: item.label,
    Used: item.used,
    Expired: item.expired,
    ผลลัพธ์UsedPlusExpired: item.totalFinal,
    ร้อยละใช้ประโยชน์: item.utilizationRate,
    ร้อยละหมดอายุ: item.expiredRate,
    Medianวันรับเข้าใช้: item.medianDaysToUse
  }));
  const outreachRows = (insights.outreachEffectRows || []).map(item => ({
    จุดออกหน่วย: item.label,
    รับเข้า: item.received,
    Used: item.used,
    Expired: item.expired,
    ผลลัพธ์สุดท้าย: item.finalCount,
    ร้อยละใช้ประโยชน์: item.rate,
    ร้อยละหมดอายุ: item.expiredRate
  }));
  const lowRows = (insights.lowStockRows || []).map(item => ({
    ชนิด: item.type,
    หมู่เลือด: item.bloodGroup,
    Minimum: item.minimumStock,
    ใช้ได้จริง: item.netAvailable,
    ขาด: Math.abs(item.gap)
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'KPI Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceRows), 'By Source Group');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outreachRows), 'Outreach Sites');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lowRows), 'Low Stock Today');
  XLSX.writeFile(wb, `blood-kpi-executive-${new Date().toISOString().slice(0,10)}.xlsx`);
  showStatus('✅ ส่งออก Excel KPI เลือดแล้ว', true);
}

function drawExecCard(ctx, x, y, w, h, title, value, note) {
  ctx.fillStyle = '#f8fbfe';
  ctx.strokeStyle = '#dce8f2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6f8598';
  ctx.font = '400 18px sans-serif';
  ctx.fillText(title, x + 18, y + 30);
  ctx.fillStyle = '#173b5d';
  ctx.font = '700 34px sans-serif';
  ctx.fillText(value, x + 18, y + 78);
  ctx.fillStyle = '#7f95a8';
  ctx.font = '400 14px sans-serif';
  wrapCanvasText(ctx, note, x + 18, y + 102, w - 36, 18);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let yy = y;
  words.forEach(word => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = testLine;
    }
  });
  if (line) ctx.fillText(line, x, yy);
}

function drawExecBarChart(ctx, config) {
  const { x, y, w, h, title, rows, color, suffix } = config;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dce8f2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#173b5d'; ctx.font = '700 20px sans-serif'; ctx.fillText(title, x + 18, y + 28);
  const list = (rows || []).slice(0, 5);
  if (!list.length) {
    ctx.fillStyle = '#7f95a8'; ctx.font = '400 14px sans-serif'; ctx.fillText('ยังไม่มีข้อมูล', x + 18, y + 56); return;
  }
  const max = Math.max(...list.map(r => Number(r.value || 0)), 1);
  list.forEach((row, idx) => {
    const yy = y + 60 + idx * 38;
    ctx.fillStyle = '#35556f'; ctx.font = '400 14px sans-serif';
    const label = String(row.label || '');
    ctx.fillText(label.length > 28 ? label.slice(0, 28) + '…' : label, x + 18, yy + 12);
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(x + 220, yy, w - 310, 14);
    ctx.fillStyle = color || '#5aa9e6'; ctx.fillRect(x + 220, yy, Math.max(4, ((w - 310) * Number(row.value || 0) / max)), 14);
    ctx.fillStyle = '#35556f'; ctx.fillText(`${Number(row.value || 0).toFixed(1)}${suffix || ''}`, x + w - 72, yy + 12);
  });
}

function downloadBloodKpiExecutivePng() {
  if (!currentBloodKpiData || !currentBloodKpiInsights) return;
  const dependency = currentBloodKpiData;
  const insights = currentBloodKpiInsights;
  const canvas = document.createElement('canvas');
  canvas.width = 1800; canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef8ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#173b5d'; ctx.font = '700 38px sans-serif'; ctx.fillText('Blood KPI Summary', 60, 64);
  ctx.fillStyle = '#6f8598'; ctx.font = '400 18px sans-serif'; ctx.fillText(`สรุปพร้อมนำเสนอผู้บริหาร | Export วันที่ ${new Date().toLocaleDateString('th-TH')}`, 60, 96);

  const cardW = 260, cardH = 132, gap = 18, startX = 60, startY = 130;
  const cards = [
    ['ใช้ประโยชน์', `${Number(insights.utilizationRate || 0).toFixed(1)}%`, 'Used ÷ (Used + Expired)'],
    ['หมดอายุ', `${Number(insights.expiredRate || 0).toFixed(1)}%`, 'Expired ÷ (Used + Expired)'],
    ['พึ่งกาชาด Routine', `${Number((dependency.summary?.adjustedRate ?? dependency.summary?.rate) || 0).toFixed(1)}%`, 'ตัด Rare/Ag-matched/Rh Negative ออก'],
    ['Median รับเข้า→ใช้', `${Number.isFinite(insights.medianDaysToUse) ? insights.medianDaysToUse : '—'} วัน`, 'คำนวณจากถุงที่ใช้/จ่ายแล้ว'],
    ['เลือดค้างนาน', `${Number(insights.longHeldRate || 0).toFixed(1)}%`, 'RBC คงคลัง ≥ 21 วัน'],
    ['ประสิทธิผลออกหน่วย', `${Number(insights.outreachEffectiveness || 0).toFixed(1)}%`, 'Used ÷ (Used + Expired) ของออกหน่วย']
  ];
  cards.forEach((card, idx) => {
    const row = Math.floor(idx / 3), col = idx % 3;
    drawExecCard(ctx, startX + col * (cardW + gap), startY + row * (cardH + gap), cardW, cardH, card[0], card[1], card[2]);
  });

  drawExecBarChart(ctx, {
    x: 60, y: 440, w: 820, h: 280,
    title: 'อัตราหมดอายุแยกตามแหล่งเลือด',
    rows: (insights.sourceGroupRates || []).slice(0, 5).map(item => ({ label: item.label, value: item.expiredRate })),
    color: '#f28b82', suffix: '%'
  });
  drawExecBarChart(ctx, {
    x: 920, y: 440, w: 820, h: 280,
    title: 'ประสิทธิผลเลือดจากการออกหน่วย',
    rows: (insights.outreachEffectRows || []).slice(0, 5).map(item => ({ label: item.label, value: item.rate })),
    color: '#68c3a3', suffix: '%'
  });
  drawExecBarChart(ctx, {
    x: 60, y: 760, w: 820, h: 250,
    title: 'Median วันรับเข้า → ใช้ แยกตามแหล่งเลือด',
    rows: (insights.sourceGroupRates || []).filter(item => Number.isFinite(item.medianDaysToUse)).slice().sort((a,b)=>(a.medianDaysToUse??999)-(b.medianDaysToUse??999)).slice(0,5).map(item => ({ label: item.label, value: item.medianDaysToUse })),
    color: '#5aa9e6', suffix: ' วัน'
  });
  drawExecBarChart(ctx, {
    x: 920, y: 760, w: 820, h: 250,
    title: 'ต่ำกว่า Minimum วันนี้',
    rows: (insights.lowStockRows || []).slice(0, 5).map(item => ({ label: `${item.type} ${item.bloodGroup}`, value: Math.abs(Number(item.gap || 0)) })),
    color: '#f6c85f', suffix: ' u'
  });

  ctx.fillStyle = '#7f95a8'; ctx.font = '400 14px sans-serif';
  wrapCanvasText(ctx, 'หมายเหตุ: KPI หน้านี้ยังไม่ใช้ Rejected/ทำลายอื่นเป็น KPI หลัก และตัวชี้วัด “ร้อยละของจำนวนวันที่ต่ำกว่า Minimum” จะทำต่อได้เมื่อเริ่มสะสม snapshot รายวันเพิ่ม', 60, 1080, 1680, 20);
  const link = document.createElement('a');
  link.download = `blood-kpi-summary-${new Date().toISOString().slice(0,10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function trcRareStatusBadge(row) {
  if (!row?.matched) return `<span class="trc-match-badge is-pending">รอ LIS</span>`;
  if (row?.sourceGroup === OUTREACH_GROUP_TRC) return `<span class="trc-match-badge is-ok">จับคู่ TRC แล้ว</span>`;
  return `<span class="trc-match-badge is-warning">พบใน LIS แต่ไม่ใช่ TRC</span>`;
}

function formatTrcRareProduct(value) {
  const text = String(value || "").trim();
  return text || "-";
}

async function loadTrcRarePage(options = {}) {
  const box = document.getElementById("trcRareDashboard");
  if (!box) return;
  if (!options.silent) box.innerHTML = `<div class="hero-card mt-4"><div class="fw-bold">กำลังโหลดทะเบียนเลือดหายาก / ภาวะจำเป็น...</div><div class="small-muted">กำลังจับคู่ Bag No. กับข้อมูล LIS</div></div>`;
  try {
    const data = await MinimumStockBackend.getTrcRareRegistry(300);
    currentTrcRareData = data;
    renderTrcRarePage(data);
    window.setTimeout(() => document.getElementById("trcRareBagInput")?.focus(), 80);
  } catch (err) {
    box.innerHTML = `<div class="trc-rare-shell"><div class="simple-page-head mt-2"><div><h1>เลือดหายาก / ภาวะจำเป็น</h1><div class="page-subline">Rare / Ag-matched / Rh Negative · แยกจาก Routine KPI</div></div></div><div class="simple-panel"><h4 class="fw-bold mb-2">ยังเปิดทะเบียนไม่ได้</h4><div class="small-muted">${escapeOutreachHtml(err.message)}</div></div></div>`;
  }
}

function trcRareSummaryIcon(kind) {
  const icons = {
    registered: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5M10 12h6M10 16h6"/></svg>`,
    matched: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>`,
    pending: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>`,
    review: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>`
  };
  return icons[kind] || icons.registered;
}

function renderTrcRarePage(data) {
  const box = document.getElementById("trcRareDashboard");
  if (!box) return;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const summary = data?.summary || {};
  box.innerHTML = `
    <div class="trc-rare-shell">
      <div class="simple-page-head trc-page-head mt-2">
        <div>
          <h1>เลือดหายาก / ภาวะจำเป็น</h1>
          <div class="page-subline">บันทึกถุงที่จำเป็นต้องพึ่งสภากาชาดไทยเพราะ Rare / Ag-matched / Rh Negative โดยแยกออกจาก Routine KPI</div>
        </div>
        <div class="trc-head-actions no-print">
          <span class="trc-scope-chip">Rare / Ag-matched / Rh Negative</span>
          <button class="trc-refresh-btn" type="button" onclick="loadTrcRarePage()" aria-label="รีเฟรช">↻</button>
        </div>
      </div>

      <div class="trc-compact-notes mb-3">
        <span class="trc-note-chip is-warning">ใช้เฉพาะกรณีจำเป็นทางคลินิก ไม่ใช่สต๊อก Routine ไม่พอ</span>
        <span class="trc-note-chip">เมื่อ LIS ยืนยันว่ามาจากกาชาด ระบบจะแยกออกจาก Routine KPI</span>
      </div>

      <div class="trc-rare-grid mb-3">
        <div class="simple-panel trc-entry-card">
          <div class="panel-heading-row trc-entry-head mb-3"><div><h3>ลงทะเบียนถุง</h3><div class="small-muted">ยิงบาร์โค้ดก่อน แล้วระบบจับคู่ LIS ภายหลัง</div></div></div>
          <form id="trcRareForm" onsubmit="submitTrcRareTag(event)">
            <label class="trc-field">Bag No.
              <div class="trc-input-wrap">
                <span class="trc-input-icon" aria-hidden="true">▥</span>
                <input id="trcRareBagInput" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" placeholder="ยิงบาร์โค้ดหรือพิมพ์เลขถุง" onkeydown="handleTrcRareBarcodeKey(event)" required />
              </div>
            </label>
            <label class="trc-field">ผลิตภัณฑ์
              <select id="trcRareProductInput" class="form-select" required>
                <option value="" selected disabled>กรุณาเลือก</option>
                <option value="SDR">SDR</option>
                <option value="LPRC">LPRC</option>
                <option value="LDPRC">LDPRC</option>
                <option value="FFP">FFP</option>
                <option value="LDPPC">LDPPC</option>
                <option value="SDP">SDP</option>
                <option value="Cryoprecipitate">Cryoprecipitate</option>
              </select>
            </label>
            <details class="trc-note-details">
              <summary>เพิ่มหมายเหตุ</summary>
              <label class="trc-field trc-note-field">หมายเหตุ
                <input id="trcRareNoteInput" type="text" autocomplete="off" placeholder="เช่น anti-Jka / Jk(a−)" />
              </label>
            </details>
            <div class="trc-form-actions">
              <button id="trcRareSaveBtn" class="btn btn-main" type="submit">บันทึก</button>
              <button class="btn trc-clear-btn" type="button" onclick="clearTrcRareForm()">ล้างค่า</button>
            </div>
            <div id="trcRareInlineStatus" class="trc-inline-status" aria-live="polite"></div>
          </form>
        </div>

        <div class="trc-summary-card">
          <div class="trc-summary-item">
            <span class="trc-summary-icon is-registered">${trcRareSummaryIcon("registered")}</span>
            <span class="trc-summary-label">ลงทะเบียน</span>
            <b>${Number(summary.active || 0).toLocaleString()}</b>
          </div>
          <div class="trc-summary-item is-ok">
            <span class="trc-summary-icon is-ok">${trcRareSummaryIcon("matched")}</span>
            <span class="trc-summary-label">จับคู่แล้ว</span>
            <b>${Number(summary.matchedTrc || 0).toLocaleString()}</b>
          </div>
          <div class="trc-summary-item is-pending">
            <span class="trc-summary-icon is-pending">${trcRareSummaryIcon("pending")}</span>
            <span class="trc-summary-label">รอ LIS</span>
            <b>${Number(summary.pending || 0).toLocaleString()}</b>
          </div>
          <div class="trc-summary-item is-warning">
            <span class="trc-summary-icon is-warning">${trcRareSummaryIcon("review")}</span>
            <span class="trc-summary-label">ต้องตรวจสอบ</span>
            <b>${Number(summary.nonTrc || 0).toLocaleString()}</b>
          </div>
          <div class="trc-summary-help">รายการที่ LIS ยืนยันว่ามาจากกาชาดจะถูกรายงานเป็น “เลือดหายาก / ภาวะจำเป็น” แยกจาก Routine KPI</div>
        </div>
      </div>

      <div class="simple-panel trc-recent-panel">
        <div class="panel-heading-row mb-2"><div><h3>รายการล่าสุด</h3><div class="small-muted">ยิงซ้ำ = อัปเดตรายการเดิม</div></div></div>
        <div class="trc-rare-list">
          ${rows.length ? rows.map(row => `
            <div class="trc-rare-row">
              <div class="trc-rare-main">
                <div class="trc-rare-bag">${escapeOutreachHtml(row.bagNumber || "-")}</div>
                <div class="trc-rare-meta"><span>${escapeOutreachHtml(formatTrcRareProduct(row.productType))}</span><span>${escapeOutreachHtml(formatDisplayDateTime(row.createdAt) || "-")}</span>${row.note ? `<span>${escapeOutreachHtml(row.note)}</span>` : ""}</div>
              </div>
              <div class="trc-rare-match">${trcRareStatusBadge(row)}${row.matched ? `<small>${escapeOutreachHtml(row.donateSource || row.sourceGroup || "")}</small>` : `<small>รอข้อมูล LIS</small>`}</div>
              <button class="btn btn-light btn-sm trc-remove-btn no-print" type="button" onclick="removeTrcRareTag(${Number(row.id)})">ยกเลิก</button>
            </div>`).join("") : `<div class="trc-empty-state"><span class="trc-empty-icon">▤</span><div class="fw-bold">ยังไม่มีรายการ</div><div class="small-muted">เริ่มโดยยิง Bag No. ด้านบน</div></div>`}
        </div>
      </div>
    </div>`;
}

function clearTrcRareForm() {
  const bagInput = document.getElementById("trcRareBagInput");
  const productInput = document.getElementById("trcRareProductInput");
  const noteInput = document.getElementById("trcRareNoteInput");
  const status = document.getElementById("trcRareInlineStatus");
  if (bagInput) bagInput.value = "";
  if (productInput) productInput.value = "";
  if (noteInput) noteInput.value = "";
  if (status) { status.className = "trc-inline-status"; status.textContent = ""; }
  bagInput?.focus();
}

function handleTrcRareBarcodeKey(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const value = String(event.target?.value || "").trim();
  if (!value) return;
  document.getElementById("trcRareProductInput")?.focus();
}

async function submitTrcRareTag(event) {
  event?.preventDefault?.();
  const bagInput = document.getElementById("trcRareBagInput");
  const productInput = document.getElementById("trcRareProductInput");
  const noteInput = document.getElementById("trcRareNoteInput");
  const btn = document.getElementById("trcRareSaveBtn");
  const bagNumber = String(bagInput?.value || "").trim();
  const productType = String(productInput?.value || "").trim();
  const note = String(noteInput?.value || "").trim();
  if (!bagNumber) {
    bagInput?.focus();
    return;
  }
  if (!productType) {
    const status = document.getElementById("trcRareInlineStatus");
    if (status) {
      status.className = "trc-inline-status is-warning";
      status.textContent = "กรุณาเลือกผลิตภัณฑ์ก่อนบันทึก";
    }
    productInput?.focus();
    return;
  }
  try {
    if (btn) { btn.disabled = true; btn.textContent = "กำลังบันทึก..."; }
    const result = await MinimumStockBackend.saveTrcRareTag({ bagNumber, productType, note });
    await loadTrcRarePage({ silent: true });
    const nextProduct = document.getElementById("trcRareProductInput");
    if (nextProduct) nextProduct.value = "";
    const nextBag = document.getElementById("trcRareBagInput");
    if (nextBag) { nextBag.value = ""; nextBag.focus(); }
    const status = document.getElementById("trcRareInlineStatus");
    if (status) {
      status.className = "trc-inline-status is-ok";
      status.textContent = `${result?.updated ? "อัปเดต" : "บันทึก"} ${bagNumber} · ${productType} แล้ว — ยิงถุงต่อไปได้เลย`;
    }
  } catch (err) {
    showModal("error", "บันทึกไม่สำเร็จ", err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "บันทึก"; }
  }
}

async function removeTrcRareTag(id) {
  const ok = await showConfirmModal("ยกเลิกรายการนี้", "รายการจะกลับไปอยู่ในกลุ่ม Routine KPI หาก LIS ระบุว่ามาจากกาชาด ส่วน Audit Log ยังเก็บประวัติไว้", { confirmText: "ยืนยันยกเลิก" });
  if (!ok) return;
  try {
    await MinimumStockBackend.removeTrcRareTag(id);
    await loadTrcRarePage({ silent: true });
  } catch (err) {
    showModal("error", "ยกเลิกไม่สำเร็จ", err.message);
  }
}

function scrollToUpload() {
  navigateToPageRoute('upload', document.getElementById('uploadMenuBtn'));
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

    function showDashboardPage(page, btn, options = {}) {
  document.querySelectorAll(".dashboard-page").forEach(el => {
    el.classList.remove("active");
  });

  const targetPage = document.getElementById("page-" + page);
  if (targetPage) targetPage.classList.add("active");

  document.querySelectorAll(".side-btn").forEach(el => {
    el.classList.remove("active");
  });

  if (btn) btn.classList.add("active");

  toggleSidebar(false);

  if (page === "mobile") {
  loadMobilePlanning();
}

if (page === "expiry") {
  loadExpiryRisk(7);
}

if (page === "outreach") {
  loadOutreachAnalysis(false);
}

if (page === "blood-kpi" && !options.skipKpiLoad) {
  loadBloodKpiPage(null, getKpiRouteFromHash());
}

if (page === "trc-rare") {
  loadTrcRarePage();
}

if (page === "upload") {
  loadLisUploadGuide();
}

if (page === "admin" && window.MinimumStockAuthUI?.loadAdminPanel) {
  window.MinimumStockAuthUI.loadAdminPanel();
}

if (page === "audit" && window.MinimumStockAuthUI?.loadAuditPanel) {
  window.MinimumStockAuthUI.loadAuditPanel();
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


/* ---------------- PWA install ---------------- */
let deferredInstallPrompt = null;
const INSTALL_HELP_DISMISSED_KEY = "minimumStock.installHelpDismissed";

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isIOSSafari() {
  const ua = window.navigator.userAgent;
  return isIOSDevice() && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

function getInstallElements() {
  return {
    button: document.getElementById("installAppBtn"),
    overlay: document.getElementById("installOverlay"),
    title: document.getElementById("installTitle"),
    message: document.getElementById("installMessage"),
    close: document.getElementById("installCloseBtn"),
    dismissWrap: document.getElementById("installDismissWrap"),
    dismissCheck: document.getElementById("installDismissCheck")
  };
}

function hideInstallButtonWhenInstalled() {
  const { button } = getInstallElements();
  if (!button) return;
  button.classList.toggle("is-installed", isStandaloneMode());
}

function closeInstallModal() {
  const { overlay, dismissCheck } = getInstallElements();
  if (!overlay) return;
  if (dismissCheck?.checked) {
    try { localStorage.setItem(INSTALL_HELP_DISMISSED_KEY, "1"); } catch (_) {}
  }
  overlay.style.display = "none";
}

function showInstallModal(mode = "ios", autoShown = false) {
  const { overlay, title, message, close, dismissWrap, dismissCheck } = getInstallElements();
  if (!overlay || !title || !message || !close) return;

  if (mode === "ios") {
    title.textContent = "ติดตั้งบน iPhone / iPad";
    message.innerHTML = `
      <div class="install-step"><span class="install-step-number">1</span><span>กดปุ่มแชร์ <strong>⬆️</strong> ใน Safari</span></div>
      <div class="install-step"><span class="install-step-number">2</span><span>เลือก <strong>เพิ่มไปยังหน้าจอโฮม</strong></span></div>
      <div class="install-step"><span class="install-step-number">3</span><span>กด <strong>เพิ่ม</strong></span></div>
    `;
  } else {
    title.textContent = "ติดตั้งแอป";
    message.innerHTML = `
      <div class="install-step"><span class="install-step-number">1</span><span>เปิดเมนู Chrome <strong>⋮</strong></span></div>
      <div class="install-step"><span class="install-step-number">2</span><span>เลือก <strong>ติดตั้งแอป</strong> หรือ <strong>เพิ่มไปยังหน้าจอหลัก</strong></span></div>
    `;
  }

  if (dismissWrap) dismissWrap.style.display = autoShown ? "flex" : "none";
  if (dismissCheck) dismissCheck.checked = false;
  close.onclick = closeInstallModal;
  overlay.onclick = (event) => {
    if (event.target === overlay) closeInstallModal();
  };
  overlay.style.display = "flex";
}

async function handleInstallAppClick() {
  if (isStandaloneMode()) {
    hideInstallButtonWhenInstalled();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      hideInstallButtonWhenInstalled();
    }
    return;
  }

  showInstallModal(isIOSDevice() ? "ios" : "android", false);
}

function setupPWAInstall() {
  const { button } = getInstallElements();
  hideInstallButtonWhenInstalled();

  if (button) {
    button.addEventListener("click", () => navigateToPageRoute('install', button));
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    hideInstallButtonWhenInstalled();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallButtonWhenInstalled();
    showModal("success", "ติดตั้งสำเร็จ", "เพิ่ม Minimum Stock ไปยังหน้าจอแอปแล้ว");
  });

  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", hideInstallButtonWhenInstalled);

  if (isIOSSafari() && !isStandaloneMode()) {
    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_HELP_DISMISSED_KEY) === "1"; } catch (_) {}
    if (!dismissed) {
      window.setTimeout(() => showInstallModal("ios", true), 900);
    }
  }
}

async function registerMinimumStockServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    registration.update().catch(() => {});
  } catch (error) {
    console.warn("Service Worker registration failed", error);
  }
}

window.addEventListener("load", () => {
  setupPWAInstall();
  registerMinimumStockServiceWorker();
});
