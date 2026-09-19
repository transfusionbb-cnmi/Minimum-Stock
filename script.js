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
            if (progress.stage === "outreach-merge") uploadBtn.textContent = "กำลังอัปเดต Status ถุงเดิม...";
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
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260919-v2-9-51-range-filters-clean-ui";
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
  if (loading) loading.style.display = "block";

  try {
    const filters = getOutreachFilterValues();
    if (!filters.dateFrom || !filters.dateTo) {
      throw new Error("กรุณาเลือกช่วงข้อมูลก่อน หรือกดปุ่ม ‘ทั้งหมด’ แล้วจึงกดแสดงผล");
    }
    const data = await MinimumStockBackend.getOutreachAnalysis({ filters });
    data.reportLoaded = true;
    if (requestId !== outreachRequestSeq) return;

    // Preserve review rows from the unfiltered initial load so the validation box remains useful.
    if ((!data.reviewRows || !data.reviewRows.length) && currentOutreachAnalysisData?.reviewRows?.length) {
      data.reviewRows = currentOutreachAnalysisData.reviewRows;
    }
    currentOutreachAnalysisData = data;
    currentOutreachSourceSummary = normalizeOutreachSourceSummary(data?.report?.sources || []);
    renderOutreachFilterSummary(filters);
    renderOutreachReportSections(data.report || {});
    loadOutreachTrend();
  } catch (err) {
    showModal("error", "คำนวณตัวกรองไม่สำเร็จ", err.message);
  } finally {
    if (requestId === outreachRequestSeq && loading) loading.style.display = "none";
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
    <div class="monthly-outcome-chart" style="--trend-columns:${Math.max(12,months.length)}" role="img" aria-label="กราฟผลลัพธ์ของเลือดที่รับเข้ารายเดือน ${ariaStart} ถึง ${ariaEnd}">
      ${months.map((m) => {
        const monthIndex = Math.max(0, Number(m.month || 1) - 1);
        const year = Number(m.year || 0);
        const stockIn = Number(m.stockIn || 0);
        const released = Number(m.released || 0);
        const expired = Number(m.expired || 0);
        const rejected = Number(m.rejected || 0);
        const unresolved = Number(m.unresolved || 0);
        const shortYear = String(year + 543).slice(-2);
        const label = multiYear ? `${monthNames[monthIndex]} ${shortYear}` : monthNames[monthIndex];
        const fullLabel = `${monthNamesLong[monthIndex]} ${year + 543}`;
        const barHeight = Math.max(stockIn ? 10 : 2, Math.round((stockIn / maxReceived) * 100));
        const pct = value => stockIn > 0 ? (Number(value || 0) / stockIn) * 100 : 0;
        return `
          <div class="outcome-month-group">
            <div class="month-top-value">${stockIn.toLocaleString()}</div>
            <div class="outcome-bar-area">
              <div class="outcome-stack" style="height:${barHeight}%" title="${fullLabel} · รับเข้า ${stockIn.toLocaleString()}">
                <span class="outcome-segment is-used" style="height:${pct(released)}%" title="ใช้/จ่าย/ส่งต่อ ${released.toLocaleString()}"></span>
                <span class="outcome-segment is-expired" style="height:${pct(expired)}%" title="หมดอายุ ${expired.toLocaleString()}"></span>
                <span class="outcome-segment is-rejected" style="height:${pct(rejected)}%" title="ไม่เหมาะสม ${rejected.toLocaleString()}"></span>
                <span class="outcome-segment is-unresolved" style="height:${pct(unresolved)}%" title="ยังอยู่ในคลัง ${unresolved.toLocaleString()}"></span>
              </div>
            </div>
            <div class="month-label">${label}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="trend-note-row"><div class="small-muted">ความสูงของแท่ง = จำนวนรับเข้า · สีภายในแท่ง = ผลลัพธ์สุดท้ายของถุงในเดือนนั้น</div></div>
    <div class="trend-table-wrap mt-3">
      <table class="table table-sm trend-data-table align-middle mb-0">
        <thead>
          <tr>
            <th>เดือน / ปี</th>
            <th class="text-end">รับเข้า</th>
            <th class="text-end">ใช้/จ่าย/ส่งต่อ</th>
            <th class="text-end">หมดอายุ</th>
            <th class="text-end">ไม่เหมาะสม</th>
            <th class="text-end">ยังอยู่ในคลัง</th>
          </tr>
        </thead>
        <tbody>
          ${months.map((m) => {
            const monthIndex = Math.max(0, Number(m.month || 1) - 1);
            return `
            <tr>
              <td><strong>${monthNamesLong[monthIndex]} ${Number(m.year || 0) + 543}</strong></td>
              <td class="text-end">${Number(m.stockIn || 0).toLocaleString()}</td>
              <td class="text-end">${Number(m.released || 0).toLocaleString()}</td>
              <td class="text-end">${Number(m.expired || 0).toLocaleString()}</td>
              <td class="text-end">${Number(m.rejected || 0).toLocaleString()}</td>
              <td class="text-end">${Number(m.unresolved || 0).toLocaleString()}</td>
            </tr>`;
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


const KPI_SUBROUTES = new Set(['overview','utilization','expiry','trc','turnaround','aging','outreach','minimum']);
let currentBloodKpiRoute = 'overview';
let currentBloodKpiRouteData = null;
const bloodKpiFilterSelections = new Map();
const bloodKpiLazyCache = {
  dependency: new Map(),
  trend: new Map(),
  analysis: new Map(),
  familyRows: new Map(),
  dashboard: null,
  insights: new Map(),
  bootstrap: null,
  detailRequests: new Set()
};

function getKpiRouteFromHash() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  if (raw === 'kpi' || raw === 'blood-kpi') return 'overview';
  const m = raw.match(/^(?:kpi|blood-kpi)\/([^/?#]+)/i);
  const route = String(m?.[1] || 'overview').toLowerCase();
  return KPI_SUBROUTES.has(route) ? route : 'overview';
}

function getKpiHash(route) {
  const safe = KPI_SUBROUTES.has(route) ? route : 'overview';
  return safe === 'overview' ? '#/kpi' : `#/kpi/${safe}`;
}

function setKpiTreeState(route) {
  const tree = document.getElementById('kpiTree');
  if (tree) tree.classList.add('open');
  document.querySelectorAll('.side-tree-child[data-kpi-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.kpiRoute === route);
  });
  const parent = document.getElementById('bloodKpiMenuBtn');
  if (parent) parent.classList.add('active');
}

function toggleKpiTreeAndOpen(route = 'overview', btn = null) {
  const target = getKpiHash(route);
  if (window.location.hash === target) {
    handleAppHashRoute(true);
  } else {
    window.location.hash = target;
  }
}

function openKpiRoute(route, btn, event) {
  if (event) event.preventDefault();
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
    toggleKpiTreeAndOpen('overview', btn);
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
    const parent = document.getElementById('bloodKpiMenuBtn');
    showDashboardPage('blood-kpi', parent, { skipKpiLoad: true, routed: true });
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
    document.querySelectorAll('.side-tree-child').forEach(el => el.classList.remove('active'));
    document.getElementById('kpiTree')?.classList.remove('open');
    toggleSidebar(false);
    handleInstallAppClick();
    return true;
  }

  const btn = getAppPageButton(page);
  showDashboardPage(page, btn, { routed: true });
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
  let rows = [];
  yearly.forEach((data, idx) => {
    const year = years[idx];
    trendToOutcomeRows(data).forEach(row => {
      if (!isBloodKpiMonthInRange(year, row.month, filters)) return;
      rows.push({ ...row, year, periodLabel: `${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(row.month||0)] || ''}${years.length > 1 ? ` ${String(year+543).slice(-2)}` : ''}` });
    });
  });
  if (rows.length > 24) {
    const yearlyMap = new Map();
    rows.forEach(row => {
      if (!yearlyMap.has(row.year)) yearlyMap.set(row.year,{ year:row.year, used:0, expired:0, unresolved:0 });
      const item=yearlyMap.get(row.year); item.used+=Number(row.used||0); item.expired+=Number(row.expired||0); item.unresolved+=Number(row.unresolved||0);
    });
    rows = Array.from(yearlyMap.values()).map(item => {
      const totalFinal=item.used+item.expired;
      return { ...item, month:0, totalFinal, utilizationRate: totalFinal ? outreachPercent(item.used,totalFinal) : 0, expiredRate: totalFinal ? outreachPercent(item.expired,totalFinal) : 0, periodLabel:String(item.year+543) };
    });
  }
  const data = { months: rows, rangeLabel: meta.label, groupedBy: rows.length && rows[0].month===0 ? 'year' : 'month' };
  bloodKpiLazyCache.trend.set(key,data);
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

function kpiPageHeader(title, subtitle, year, years = [], showYearSelect = true) {
  return `<div class="simple-page-head mt-2">
    <div><h1>${escapeOutreachHtml(title)}</h1></div>
    <div class="d-flex gap-2 align-items-end flex-wrap no-print">
      <button class="btn btn-light" type="button" onclick="loadBloodKpiPage(null,currentBloodKpiRoute,{filterOnly:true})">ตัวกรอง</button>
      <button class="btn btn-light" type="button" onclick="downloadCurrentKpiPng()">PNG</button>
      <button class="btn btn-main" type="button" onclick="window.print()">PDF</button>
    </div>
  </div>`;
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
  rh: { label: 'Rh', allLabel: 'ทุก Rh' }
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

function renderKpiFilterGate(route, bootstrap, preset = {}) {
  const options = bootstrap?.filterOptions || {};
  const config = {
    overview: 'ภาพรวม KPI เลือด',
    utilization: 'อัตราการใช้ประโยชน์จากโลหิต',
    expiry: 'อัตราโลหิตหมดอายุ',
    trc: 'อัตราพึ่งพากาชาด Routine',
    turnaround: 'ระยะเวลาหมุนเวียนเลือด',
    aging: 'อายุเลือดก่อนถูกใช้',
    outreach: 'ประสิทธิผลเลือดจากการออกหน่วย',
    minimum: 'Minimum Stock'
  }[route] || 'KPI เลือด';
  const showDetailFilters = !['trc','minimum'].includes(route);
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

  return `<div class="kpi-filter-gate-shell">
    <div class="simple-page-head mt-2"><div><h1>${escapeOutreachHtml(config)}</h1></div></div>
    <div class="simple-panel kpi-filter-gate">
      <div class="kpi-filter-grid">
        ${route !== 'minimum' ? `<div class="outreach-range-pair kpi-range-pair">
          <div class="outreach-range-head">
            <strong>ช่วงข้อมูล</strong>
            <div class="outreach-range-quick-actions">
              <button type="button" onclick="setKpiQuickMonthRange('thisYear')">ปีนี้</button>
              <button type="button" onclick="setKpiQuickMonthRange('last12')">12 เดือนล่าสุด</button>
              <button type="button" onclick="setKpiQuickMonthRange('all')">ทั้งหมด</button>
            </div>
          </div>
          <div class="outreach-month-year-side">
            <div class="outreach-month-year-controls">
              <select id="kpiMonthFromMonth" class="form-select" aria-label="เดือนเริ่มต้น" onchange="syncKpiMonthRange()">${renderOutreachMonthSelectOptions(fromParts.month)}</select>
              <select id="kpiMonthFromYear" class="form-select" aria-label="ปีเริ่มต้น" onchange="syncKpiMonthRange()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, fromParts.year)}</select>
            </div>
          </div>
          <span class="outreach-range-arrow">→</span>
          <div class="outreach-month-year-side">
            <div class="outreach-month-year-controls">
              <select id="kpiMonthToMonth" class="form-select" aria-label="เดือนสิ้นสุด" onchange="syncKpiMonthRange()">${renderOutreachMonthSelectOptions(toParts.month)}</select>
              <select id="kpiMonthToYear" class="form-select" aria-label="ปีสิ้นสุด" onchange="syncKpiMonthRange()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, toParts.year)}</select>
            </div>
          </div>
        </div>` : ''}
        ${showDetailFilters && route === 'outreach' ? `<div class="outreach-filter-item kpi-fixed-filter"><span class="product-picker-label">กลุ่มแหล่งรับเข้า</span><strong>${escapeOutreachHtml(OUTREACH_GROUP_SELF_OUTREACH)}</strong></div>` : ''}
        ${showDetailFilters && route !== 'outreach' ? renderKpiMultiSelect('sourceGroup','กลุ่มแหล่งรับเข้า',options.sourceGroups||[],selectedSourceGroups,'ทุกกลุ่ม') : ''}
        ${showDetailFilters && showSite ? renderKpiMultiSelect('source','จุดออกหน่วย / แหล่งรับเข้า',options.sources||[],selectedSources,'ทุกจุด') : ''}
        ${showDetailFilters ? renderKpiMultiSelect('product','ผลิตภัณฑ์',options.products||[],selectedProducts,'ทุกชนิด') : ''}
        ${showDetailFilters ? renderKpiMultiSelect('bloodGroup','หมู่เลือด',options.bloodGroups||[],selectedBloodGroups,'ทุกหมู่') : ''}
        ${showDetailFilters ? renderKpiMultiSelect('rh','Rh',options.rhs||[],selectedRhs,'ทุก Rh') : ''}
      </div>
      <div class="kpi-filter-gate-footer"><button class="btn btn-main" type="button" onclick="applyBloodKpiFilters('${route}')">แสดงผล</button></div>
    </div>
  </div>`;
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
    bloodGroups: getSelectedKpiMulti('bloodGroup'),
    rhs: getSelectedKpiMulti('rh')
  };
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
  return `${kpiPageHeader(config.title || 'KPI รายละเอียด', config.subtitle || '', year, years, route !== 'aging')}
    ${renderKpiReadStrip(config.hintTitle || 'คำอธิบาย', config.hintText || 'หน้านี้เป็นข้อมูลเชิงลึก จึงแยกโหลดเฉพาะเมื่อกดเข้ามา', 'soft')}
    <div class="simple-panel"><div class="panel-heading-row"><div><h3>เหตุผลที่แยกหน้านี้ออกมา</h3><div class="small-muted">ช่วยให้ระบบเปิดหน้า KPI ได้เร็วขึ้น และให้คนดูเข้าใจความหมายก่อนเห็นกราฟ</div></div></div>
      <ul class="kpi-bullet-list">${(config.bullets || []).map(item => `<li>${escapeOutreachHtml(item)}</li>`).join('')}</ul>
      <div class="d-flex flex-wrap gap-2 mt-3 no-print"><button class="btn btn-main" type="button" onclick="requestBloodKpiDeepLoad('${route}', ${Number(year)})">โหลดกราฟและรายละเอียด KPI นี้</button><button class="btn btn-light" type="button" onclick="openKpiRoute('overview', ${Number(year)}, event)">กลับไปภาพรวม KPI</button></div>
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
      { label:'อัตราการใช้ประโยชน์', value:`${rate.toFixed(1)}%`, note:`Used ${Number(summary.used||0).toLocaleString()} จาก ${finalBase.toLocaleString()} ถุงที่พร้อมใช้`, tone:'is-good' },
      topGroup ? { label:'แหล่งเลือดที่ใช้ประโยชน์สูงสุด', value:`${topGroup.label}`, note:`${topGroup.utilizationRate.toFixed(1)}% · ${topGroup.totalFinal.toLocaleString()} ถุง`, tone:'' } : null,
      peakMonth ? { label:'เดือนที่ใช้ประโยชน์สูงสุด', value:peakMonth.periodLabel || monthNames[Number(peakMonth.month||0)] || '-', note:`${Number(peakMonth.utilizationRate||0).toFixed(1)}% · Used ${Number(peakMonth.used||0).toLocaleString()} / ${Number(peakMonth.totalFinal||0).toLocaleString()} ถุง`, tone:'' } : null
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
      { label:'อัตราโลหิตหมดอายุ', value:`${rate.toFixed(1)}%`, note:`Expired ${Number(summary.expired||0).toLocaleString()} จาก ${finalBase.toLocaleString()} ถุงที่พร้อมใช้`, tone:'is-alert' },
      topGroup ? { label:'แหล่งเลือดที่หมดอายุสูงสุด', value:`${topGroup.label}`, note:`${topGroup.expiredRate.toFixed(1)}% · ${topGroup.totalFinal.toLocaleString()} ถุง`, tone:'' } : null,
      peakMonth ? { label:'เดือนที่หมดอายุสูงสุด', value:peakMonth.periodLabel || monthNames[Number(peakMonth.month||0)] || '-', note:`${Number(peakMonth.expiredRate||0).toFixed(1)}% · Expired ${Number(peakMonth.expired||0).toLocaleString()} / ${Number(peakMonth.totalFinal||0).toLocaleString()} ถุง`, tone:'' } : null
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

function renderKpiTrc({ dependency, year }) {
  const summary = dependency?.summary || {};
  const months = dependency?.months || [];
  const overall = Number(summary.rate||0), adjusted = Number(summary.adjustedRate ?? overall);
  const rare = Number(summary.rareTrcRbc||0), routine = Number(summary.routineTrcRbc ?? Math.max(0,Number(summary.trcRbc||0)-rare));
  currentBloodKpiRouteData = { route:'trc', year, overall, adjusted, rare, routine, months };
  return `${kpiPageHeader('อัตราพึ่งพากาชาด Routine','',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'พึ่งพากาชาดรวม', value:`${overall.toFixed(1)}%`, note:`${Number(summary.trcRbc||0).toLocaleString()} ถุง`, tone:'' },
      { label:'พึ่งพากาชาด Routine', value:`${adjusted.toFixed(1)}%`, note:`${routine.toLocaleString()} ถุง`, tone:'is-good' },
      { label:'Rare / Ag-matched / Rh Negative', value:`${rare.toLocaleString()} ถุง`, note:'', tone:'' }
    ])}
    <div class="simple-panel kpi-executive-panel"><div class="panel-heading-row"><div><h3>แนวโน้มตามช่วงที่เลือก</h3></div></div>${renderTrcRangeSvg(months)}</div>`;
}

function renderKpiTurnaround({ insights, dependency, year }) {
  const rows=(insights.sourceGroupRates||[]).filter(r=>Number.isFinite(r.medianDaysToUse)).sort((a,b)=>a.medianDaysToUse-b.medianDaysToUse);
  const fastest = rows[0] || null;
  const slowest = rows.length ? rows[rows.length - 1] : null;
  currentBloodKpiRouteData={route:'turnaround',year,value:insights.medianDaysToUse,groups:rows};
  return `${kpiPageHeader('ระยะเวลาหมุนเวียนเลือด (รับเข้า → ใช้)','',year,dependency?.years||[])}
    ${renderKpiQuickCards([
      { label:'Median รวม', value:Number.isFinite(insights.medianDaysToUse)? `${insights.medianDaysToUse} วัน` : '—', note:'', tone:'' },
      fastest ? { label:'หมุนเวียนเร็วที่สุด', value: fastest.label, note:`Median ${Number(fastest.medianDaysToUse||0).toFixed(1)} วัน`, tone:'is-good' } : null,
      slowest ? { label:'หมุนเวียนช้าที่สุด', value: slowest.label, note:`Median ${Number(slowest.medianDaysToUse||0).toFixed(1)} วัน`, tone:'is-alert' } : null
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
      { label:'Median ช่วงที่เลือก', value:Number.isFinite(insights.medianDaysToUse)?`${insights.medianDaysToUse} วัน`:'—', note:'', tone:'' },
      longest ? { label:'ช่วงที่ค้างก่อนใช้นานที่สุด', value:longest.periodLabel || monthNames[Number(longest.month||0)] || '-', note:`${Number(longest.medianDays||0).toFixed(1)} วัน · ${Number(longest.usedCount||0).toLocaleString()} ถุง`, tone:'is-alert' } : null,
      { label:'คงคลังอายุมาก ณ วันนี้', value:`${Number(insights.longHeldRate||0).toFixed(1)}%`, note:`RBC ≥ 21 วัน ${Number(insights.longHeldCount||0).toLocaleString()} / ${Number(insights.longHeldBase||0).toLocaleString()} ถุง`, tone:'' }
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
      { label:'ประสิทธิผลรวม', value:`${Number(insights.outreachEffectiveness||0).toFixed(1)}%`, note:'', tone:'is-good' },
      best ? { label:'จุดออกหน่วยที่ใช้ประโยชน์ดีที่สุด', value: best.label, note:`${best.rate.toFixed(1)}% จาก ${best.finalCount.toLocaleString()} ถุง`, tone:'' } : null,
      weakest ? { label:'จุดที่ควรติดตามเพิ่ม', value: weakest.label, note:`${weakest.rate.toFixed(1)}% จาก ${weakest.finalCount.toLocaleString()} ถุง`, tone:'is-alert' } : null
    ])}
    <div class="simple-panel"><div class="panel-heading-row"><div><h3>Top จุดออกหน่วยตามอัตราการใช้ประโยชน์</h3></div></div>${renderHorizontalBarChartSvg(rows,{valueKey:'rate',suffix:'%',color:'#68c3a3',max:100,sublabelKey:'finalCount',sublabelSuffix:' ถุงที่พร้อมใช้'})}</div>`;
}

function renderKpiMinimum({ dashboard, year }) {
  const rows=(dashboard?.results||[]).filter(r=>Number(r?.gap||0)<0).map(r=>({type:r.type||'',bloodGroup:r.bloodGroup||'',minimumStock:Number(r.minimumStock||0),netAvailable:Number(r.netAvailable||0),gap:Number(r.gap||0)}));
  currentBloodKpiRouteData={route:'minimum',year,rows,total:Number(dashboard?.results?.length||0)};
  return `${kpiPageHeader('Minimum Stock','',year,[], false)}
    ${renderKpiQuickCards([
      { label:'ต่ำกว่า Minimum วันนี้', value:`${rows.length} รายการ`, note:`จาก ${Number(dashboard?.results?.length||0)} รายการ`, tone:'is-alert' }
    ])}
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
  } catch (err) {
    box.innerHTML = `<div class="hero-card mt-4"><h4 class="fw-bold mb-2">เปิด KPI นี้ไม่ได้</h4><div class="small-muted mb-3">${escapeOutreachHtml(err.message)}</div><button class="btn btn-main" type="button" onclick="loadBloodKpiPage(null,currentBloodKpiRoute,{filterOnly:true})">ตัวกรอง</button></div>`;
  }
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
      const titles={utilization:'อัตราการใช้ประโยชน์จากโลหิต',expiry:'อัตราโลหิตหมดอายุ',aging:'อายุเลือดก่อนถูกใช้รายเดือน'};
      ctx.fillStyle='#173b5d'; ctx.font='700 44px sans-serif'; ctx.fillText(titles[data.route]||'KPI เลือด',70,72);
      ctx.fillStyle='#7890a4'; ctx.font='400 20px sans-serif'; ctx.fillText(`Blood Stock CNMI · ปี ${Number(data.year||new Date().getFullYear())+543}`,70,110);
      let headline='';
      if(data.route==='utilization') headline=`อัตราการใช้ประโยชน์ ${Number(data.rate||0).toFixed(1)}%`;
      if(data.route==='expiry') headline=`อัตราโลหิตหมดอายุ ${Number(data.rate||0).toFixed(1)}%`;
      if(data.route==='aging') headline='Median วันรับเข้า → ใช้ แยกรายเดือน';
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
  if (['utilization','expiry','aging'].includes(data.route) && downloadPrimaryKpiSvgAsPng(data)) return;
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
  if(data.route==='trc') cards.push(['พึ่งพารวม',`${Number(data.overall||0).toFixed(1)}%`],['Routine',`${Number(data.adjusted||0).toFixed(1)}%`],['Rare/Ag',`${Number(data.rare||0).toLocaleString()} ถุง`]);
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
        <div>
          <h1>KPI เลือด</h1>
          <div class="page-subline">พร้อมกราฟและ Export สำหรับใช้ในงานนำเสนอผู้บริหาร</div>
        </div>
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
        <div class="simple-kpi"><span>KPI 1 · ใช้ประโยชน์</span><strong>${Number(insights.utilizationRate || 0).toFixed(1)}%</strong><small>Used ÷ (Used + Expired)</small></div>
        <div class="simple-kpi is-alert"><span>KPI 2 · หมดอายุ</span><strong>${Number(insights.expiredRate || 0).toFixed(1)}%</strong><small>Expired ÷ (Used + Expired)</small></div>
        <div class="simple-kpi is-good"><span>KPI 3 · พึ่งกาชาด Routine</span><strong>${adjustedReady ? adjustedRate.toFixed(1) : rate.toFixed(1)}%</strong><small>${adjustedReady ? 'ตัด Rare/Ag-matched/Rh Negative ออกแล้ว' : 'ใช้สูตรรวมชั่วคราว'}</small></div>
        <div class="simple-kpi"><span>Median วันรับเข้า → ใช้</span><strong>${Number.isFinite(insights.medianDaysToUse) ? insights.medianDaysToUse : '—'}</strong><small>คำนวณจากถุงที่ใช้/จ่ายแล้ว</small></div>
        <div class="simple-kpi"><span>อัตราเลือดค้างนาน</span><strong>${Number(insights.longHeldRate || 0).toFixed(1)}%</strong><small>RBC คงคลัง ≥ 21 วัน · ${Number(insights.longHeldCount || 0).toLocaleString()}/${Number(insights.longHeldBase || 0).toLocaleString()} ถุง</small></div>
        <div class="simple-kpi"><span>ประสิทธิผลออกหน่วย</span><strong>${Number(insights.outreachEffectiveness || 0).toFixed(1)}%</strong><small>Used ÷ (Used + Expired) ของเลือดจากออกหน่วย</small></div>
      </div>

      <div class="attention-strip mb-3"><div><strong>หมายเหตุการคำนวณ</strong><span> ${escapeOutreachHtml(insights.note || '')}</span></div></div>

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>แนวโน้มผลถุงเลือดรายเดือน</h3><div class="small-muted">ดู Used / Expired / ยังอยู่ในคลัง ของปี ${year+543}</div></div></div>
          ${renderBloodOutcomeMonthlySvg(monthlyOutcomeRows, year)}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>พึ่งพากาชาดรายเดือน</h3><div class="small-muted">ปี ${year+543} เทียบกับ ${comparisonYear+543}</div></div></div>
          ${renderBloodKpiLineSvg(months, year, comparisonYear)}
          <div class="small-muted mt-2">${escapeOutreachHtml(changedText)}${previousTotal > 0 ? ` จากปี ${comparisonYear+543}` : ''}</div>
          ${adjustedReady ? `<div class="kpi-adjusted-box mt-3"><div><span>มุมมองปรับแล้ว · ตัด Rare/Ag-matched/Rh Negative</span><b>${adjustedRate.toFixed(1)}%</b></div><div class="kpi-adjusted-detail">TRC routine ${routineTrcRbc.toLocaleString()} ถุง · Rare/Ag-matched/Rh Negative ${rareTrcRbc.toLocaleString()} ถุง</div></div>` : ''}
        </div>
      </div>

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>อัตราหมดอายุแยกตามแหล่งเลือด</h3><div class="small-muted">แยก 4 กลุ่มหลักเพื่อดูว่าของเสียเกิดจากแหล่งใด</div></div></div>
          ${renderHorizontalBarChartSvg(sourceRateRows.slice(0, 6), { valueKey: 'expiredRate', label: 'Expired %', suffix: '%', color: '#f28b82', max: 100 })}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>Median วันรับเข้า → ใช้ แยกตามแหล่งเลือด</h3><div class="small-muted">ยิ่งน้อย = หมุนเวียนได้เร็วกว่า</div></div></div>
          ${renderHorizontalBarChartSvg(sourceRateRows.slice().sort((a,b)=>(a.medianDaysToUse ?? 999)-(b.medianDaysToUse ?? 999)).filter(r => Number.isFinite(r.medianDaysToUse)), { valueKey: 'medianDaysToUse', label: 'วัน', suffix: ' วัน', color: '#5aa9e6', max: null })}
        </div>
      </div>

      <div class="kpi-two-chart-grid mb-3">
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>ประสิทธิผลเลือดจากการออกหน่วย</h3><div class="small-muted">Top จุดออกหน่วยที่มีผลลัพธ์แล้วมากที่สุด</div></div></div>
          ${renderHorizontalBarChartSvg(outreachRows.slice(0, 8), { valueKey: 'rate', label: 'ใช้ได้จริง', suffix: '%', color: '#68c3a3', max: 100, sublabelKey: 'finalCount', sublabelSuffix: ' ถุงมีผลลัพธ์แล้ว' })}
        </div>
        <div class="simple-panel">
          <div class="panel-heading-row"><div><h3>Minimum Stock วันนี้</h3><div class="small-muted">ตัวนี้เป็นมุมมองวันนี้ก่อน ส่วน KPI “ร้อยละของวันที่ต่ำกว่าเกณฑ์” ต้องเริ่มสะสมประวัติรายวันเพิ่ม</div></div></div>
          <div class="simple-kpi-grid blood-kpi-mini-grid mb-3">
            <div class="simple-kpi is-alert"><span>ต่ำกว่า Minimum วันนี้</span><strong>${Number(insights.lowStockCount || 0)}</strong><small>จากทั้งหมด ${Number(insights.lowStockTotal || 0)} รายการ</small></div>
            <div class="simple-kpi"><span>พร้อมพัฒนาต่อ</span><strong>Daily KPI</strong><small>หากเก็บ snapshot รายวันเพิ่ม จะคำนวณร้อยละจำนวนวันได้</small></div>
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
        <div class="panel-heading-row"><div><h3>ตารางสรุปรายเดือน</h3><div class="small-muted">ใช้สำหรับคัดลอกตัวเลขไปทำรายงานต่อได้ทันที</div></div></div>
        <div class="table-responsive">
          <table class="table simple-table align-middle mb-0">
            <thead><tr><th>เดือน</th><th class="text-end">Used</th><th class="text-end">Expired</th><th class="text-end">ยังอยู่ในคลัง</th><th class="text-end">ใช้ประโยชน์</th><th class="text-end">หมดอายุ</th><th class="text-end">TRC รวม</th><th class="text-end">Routine TRC</th></tr></thead>
            <tbody>${monthlyOutcomeRows.map((m, idx) => `<tr><td>${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][idx]}</td><td class="text-end">${Number(m.used || 0).toLocaleString()}</td><td class="text-end">${Number(m.expired || 0).toLocaleString()}</td><td class="text-end">${Number(m.unresolved || 0).toLocaleString()}</td><td class="text-end fw-bold">${Number(m.utilizationRate || 0).toFixed(1)}%</td><td class="text-end fw-bold">${Number(m.expiredRate || 0).toFixed(1)}%</td><td class="text-end">${Number(months[idx]?.trcRbc || 0).toLocaleString()}</td><td class="text-end">${adjustedReady ? Number(months[idx]?.routineTrcRbc ?? Math.max(0, Number(months[idx]?.trcRbc || 0) - Number(months[idx]?.rareTrcRbc || 0))).toLocaleString() : '—'}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function renderExecutiveMonthlyRateChart(rows, year, mode = 'utilization') {
  const items = Array.isArray(rows) ? rows : [];
  const isExpiry = mode === 'expiry';
  const numeratorKey = isExpiry ? 'expired' : 'used';
  const rateKey = isExpiry ? 'expiredRate' : 'utilizationRate';
  const numeratorLabel = isExpiry ? 'Expired' : 'Used';
  const title = isExpiry ? 'Expired เทียบถุงที่พร้อมใช้' : 'Used เทียบถุงที่พร้อมใช้';
  const totalColor = isExpiry ? '#f8dfdc' : '#d7f0e5';
  const barColor = isExpiry ? '#e48379' : '#56bd9a';
  const lowBaseColor = '#d99a2b';
  const safeItems = items.map((source,idx) => {
    const numerator = Number(source?.[numeratorKey] || 0);
    const totalFinal = Number(source?.totalFinal ?? (Number(source?.used || 0)+Number(source?.expired || 0)));
    const rawRate = source?.[rateKey];
    const rate = totalFinal > 0 ? (Number.isFinite(Number(rawRate)) ? Number(rawRate) : (numerator/totalFinal)*100) : null;
    return { ...source, numerator, totalFinal, rate, lowBase:totalFinal>0&&totalFinal<10, periodLabel:source?.periodLabel || String(idx+1) };
  });
  if (!safeItems.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const validRows=safeItems.filter(r=>r.totalFinal>0);
  const maxCount=Math.max(1,...safeItems.map(r=>Math.max(r.totalFinal,r.numerator)));
  const yMax=Math.max(8,Math.ceil(maxCount/5)*5);
  const w=1260,h=560,left=84,right=60,top=70,bottom=100,chartW=w-left-right,chartH=h-top-bottom;
  const groupW=chartW/Math.max(1,safeItems.length), pairW=Math.min(54,groupW*.68), barW=Math.max(12,Math.floor(pairW/2));
  const yCount=v=>top+chartH-(Math.max(0,Number(v||0))/yMax)*chartH;
  const xCenter=i=>left+groupW*i+groupW/2;
  const grid=[0,.25,.5,.75,1].map(frac=>{const yy=top+chartH-chartH*frac;return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8eff5" stroke-width="1.6"/><text x="${left-14}" y="${yy+5}" text-anchor="end" font-size="13" fill="#8299ac">${Math.round(yMax*frac)}</text>`}).join('');
  const bars=safeItems.map((row,i)=>{const cx=xCenter(i),totalX=cx-barW,numX=cx,totalY=yCount(row.totalFinal),numY=yCount(row.numerator),totalH=Math.max(row.totalFinal>0?4:0,top+chartH-totalY),numH=Math.max(row.numerator>0?4:0,top+chartH-numY),higherY=Math.min(totalY,numY),badgeY=Math.max(top+18,higherY-38),badgeW=row.lowBase?58:50;return `<g><rect x="${totalX}" y="${totalY}" width="${barW}" height="${totalH}" rx="8" fill="${totalColor}"/><rect x="${numX}" y="${numY}" width="${barW}" height="${numH}" rx="8" fill="${barColor}"/>${row.totalFinal>0?`<text x="${totalX+barW/2}" y="${Math.max(top+14,totalY-8)}" text-anchor="middle" font-size="11" font-weight="700" fill="#7892a5">${row.totalFinal.toLocaleString()}</text>`:''}${row.numerator>0?`<text x="${numX+barW/2}" y="${Math.max(top+14,numY-8)}" text-anchor="middle" font-size="11" font-weight="700" fill="#295b49">${row.numerator.toLocaleString()}</text>`:''}${row.rate!==null?`<line x1="${cx}" y1="${badgeY+24}" x2="${cx}" y2="${higherY-4}" stroke="${row.lowBase?lowBaseColor:'#9ab2c7'}" stroke-width="1.6"/><rect x="${cx-badgeW/2}" y="${badgeY}" width="${badgeW}" height="24" rx="12" fill="${row.lowBase?'#fff7ea':'#fff'}" stroke="${row.lowBase?lowBaseColor:'#b9cfe0'}"/><text x="${cx}" y="${badgeY+16}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${row.lowBase?'#b87813':'#2f5c84'}">${row.rate.toFixed(1)}%${row.lowBase?'*':''}</text>`:''}<text x="${cx}" y="${h-38}" text-anchor="middle" font-size="${safeItems.length>18?11.5:13}" font-weight="600" fill="#5f7689">${escapeOutreachHtml(row.periodLabel)}</text></g>`}).join('');
  return `<svg class="kpi-exec-chart kpi-grouped-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/><text x="${left}" y="36" font-size="18" font-weight="700" fill="#183b5d">${title}</text><g transform="translate(${w-right-192},34)"><rect x="0" y="-11" width="16" height="12" rx="4" fill="${totalColor}"/><text x="22" y="-1" font-size="12" fill="#587082">พร้อมใช้</text><rect x="98" y="-11" width="16" height="12" rx="4" fill="${barColor}"/><text x="120" y="-1" font-size="12" fill="#587082">${numeratorLabel}</text></g>${grid}${bars}</svg>`;
}


function renderTrcRangeSvg(rows) {
  const items=Array.isArray(rows)?rows:[];
  if(!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const w=1240,h=500,left=72,right=44,top=46,bottom=88,chartW=w-left-right,chartH=h-top-bottom;
  const x=i=>left+chartW*(i+.5)/items.length,y=v=>top+chartH-(Math.max(0,Math.min(100,Number(v||0)))/100)*chartH;
  const grid=[0,25,50,75,100].map(v=>`<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#e8eff5"/><text x="${left-12}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#8398aa">${v}%</text>`).join('');
  const overallPath=items.map((r,i)=>`${i===0?'M':'L'}${x(i)},${y(r.rate)}`).join(' '),routinePath=items.map((r,i)=>`${i===0?'M':'L'}${x(i)},${y(r.adjustedRate)}`).join(' ');
  const labels=items.map((r,i)=>`<text x="${x(i)}" y="${h-32}" text-anchor="middle" font-size="${items.length>18?10.5:12.5}" fill="#587184">${escapeOutreachHtml(r.periodLabel||'')}</text>`).join('');
  return `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="26" fill="#fff" stroke="#edf3f7"/>${grid}<path d="${overallPath}" fill="none" stroke="#8aa0b4" stroke-width="3"/><path d="${routinePath}" fill="none" stroke="#2f7fc1" stroke-width="4"/>${items.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.adjustedRate)}" r="5" fill="#fff" stroke="#2f7fc1" stroke-width="3"/>`).join('')}${labels}<g transform="translate(${w-right-230},30)"><line x1="0" y1="0" x2="28" y2="0" stroke="#8aa0b4" stroke-width="3"/><text x="36" y="4" font-size="12" fill="#5b7285">รวม</text><line x1="92" y1="0" x2="120" y2="0" stroke="#2f7fc1" stroke-width="4"/><text x="128" y="4" font-size="12" fill="#5b7285">Routine</text></g></svg>`;
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
  const items=Array.isArray(rows)?rows:[];
  if(!items.length) return `<div class="small-muted py-4">ไม่มีข้อมูลในช่วงที่เลือก</div>`;
  const valid=items.filter(r=>Number.isFinite(r.medianDays));
  const w=1240,h=520,left=84,right=56,top=72,bottom=96,chartW=w-left-right,chartH=h-top-bottom;
  const maxDays=Math.max(7,...valid.map(r=>Number(r.medianDays||0))),yMax=Math.max(28,Math.ceil(maxDays/7)*7);
  const x=i=>left+chartW*(i+.5)/items.length,y=v=>top+chartH-(Number(v||0)/yMax)*chartH;
  const grid=[0,.25,.5,.75,1].map(frac=>{const val=Math.round(yMax*frac),yy=top+chartH-chartH*frac;return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-14}" y="${yy+5}" text-anchor="end" font-size="13" fill="#7890a4">${val}</text>`}).join('');
  const points=items.map((r,i)=>Number.isFinite(r.medianDays)?{i,value:Number(r.medianDays)}:null).filter(Boolean);
  const path=points.map((p,j)=>`${j===0?'M':'L'}${x(p.i)},${y(p.value)}`).join(' ');
  const dots=items.map((r,i)=>{const m=Number(r.medianDays);return Number.isFinite(m)?`<circle cx="${x(i)}" cy="${y(m)}" r="7" fill="#fff" stroke="#367fb5" stroke-width="4"/><text x="${x(i)}" y="${Math.max(top+14,y(m)-18)}" text-anchor="middle" font-size="12" font-weight="700" fill="#27648f">${m.toFixed(1)}</text>`:''}).join('');
  const labels=items.map((r,i)=>`<text x="${x(i)}" y="${h-46}" text-anchor="middle" font-size="${items.length>18?11:13}" font-weight="600" fill="#536f84">${escapeOutreachHtml(r.periodLabel||'')}</text><text x="${x(i)}" y="${h-26}" text-anchor="middle" font-size="11" fill="#8aa0b1">n=${Number(r.usedCount||0).toLocaleString()}</text>`).join('');
  return `<svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img"><rect x="10" y="10" width="${w-20}" height="${h-20}" rx="28" fill="#fff" stroke="#edf3f7"/>${grid}<line x1="${left}" y1="${y(21)}" x2="${w-right}" y2="${y(21)}" stroke="#e4a74c" stroke-width="2" stroke-dasharray="7 7"/><path d="${path}" fill="none" stroke="#367fb5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function renderAgeDistributionSvg(dist={}) {
  const rows=[['0–7 วัน',Number(dist.within7||0),'#63c29f'],['8–14 วัน',Number(dist.day8to14||0),'#75b7e8'],['15–21 วัน',Number(dist.day15to21||0),'#f1c76a'],['> 21 วัน',Number(dist.over21||0),'#ef8b83']];
  const total=rows.reduce((s,r)=>s+r[1],0);
  const w=720,h=300,left=150,right=80,top=28,rowH=60,chartW=w-left-right;
  return `<svg class="kpi-age-dist-chart" viewBox="0 0 ${w} ${h}" role="img">${rows.map((r,i)=>{const pct=total?100*r[1]/total:0,y=top+i*rowH,width=chartW*pct/100;return `<text x="${left-12}" y="${y+24}" text-anchor="end" font-size="14" fill="#35556f">${r[0]}</text><rect x="${left}" y="${y+8}" width="${chartW}" height="24" rx="12" fill="#edf3f7"/><rect x="${left}" y="${y+8}" width="${Math.max(width,3)}" height="24" rx="12" fill="${r[2]}"/><text x="${left+chartW+10}" y="${y+25}" font-size="14" font-weight="700" fill="#35556f">${pct.toFixed(1)}%</text><text x="${left}" y="${y+48}" font-size="11" fill="#8aa0b1">${r[1].toLocaleString()} ถุง</text>`}).join('')}</svg>`;
}

function renderBloodOutcomeMonthlySvg(rows, year) {
  const items = Array.isArray(rows) ? rows : [];
  const w = 860, h = 360, left = 52, right = 24, top = 26, bottom = 54;
  const chartW = w-left-right, chartH = h-top-bottom;
  const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const maxValue = Math.max(5, ...items.map(r => Math.max(Number(r.used || 0), Number(r.expired || 0), Number(r.unresolved || 0))));
  const roundedMax = Math.ceil(maxValue / 5) * 5;
  const y = value => top + chartH - (Number(value || 0) / roundedMax) * chartH;
  const groupW = chartW / 12;
  const barW = Math.min(16, groupW / 4);
  const grid = [0, .25, .5, .75, 1].map(frac => {
    const value = Math.round(roundedMax * frac);
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-10}" y="${yy+4}" text-anchor="end" font-size="11" fill="#7890a4">${value}</text>`;
  }).join('');
  const bars = items.map((r, i) => {
    const baseX = left + groupW * i + groupW / 2 - barW * 1.8;
    const usedH = chartH - (y(r.used) - top);
    const expH = chartH - (y(r.expired) - top);
    const unrH = chartH - (y(r.unresolved) - top);
    return `
      <rect x="${baseX}" y="${y(r.used)}" width="${barW}" height="${usedH}" rx="4" fill="#68c3a3"><title>${names[i]} Used ${Number(r.used || 0).toLocaleString()} ถุง</title></rect>
      <rect x="${baseX + barW + 5}" y="${y(r.expired)}" width="${barW}" height="${expH}" rx="4" fill="#f28b82"><title>${names[i]} Expired ${Number(r.expired || 0).toLocaleString()} ถุง</title></rect>
      <rect x="${baseX + (barW + 5) * 2}" y="${y(r.unresolved)}" width="${barW}" height="${unrH}" rx="4" fill="#9ab3c5"><title>${names[i]} ยังอยู่ในคลัง ${Number(r.unresolved || 0).toLocaleString()} ถุง</title></rect>
      <text x="${left + groupW * i + groupW / 2}" y="${h-18}" text-anchor="middle" font-size="11" fill="#6f8598">${names[i]}</text>`;
  }).join('');
  return `<svg class="kpi-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="แนวโน้มผลถุงเลือดรายเดือน">
    ${grid}
    ${bars}
    <g transform="translate(${left+8},${top+8})">
      <rect x="0" y="-8" width="16" height="10" rx="3" fill="#68c3a3"></rect><text x="24" y="0" font-size="12" fill="#36556f">Used</text>
      <rect x="78" y="-8" width="16" height="10" rx="3" fill="#f28b82"></rect><text x="102" y="0" font-size="12" fill="#36556f">Expired</text>
      <rect x="178" y="-8" width="16" height="10" rx="3" fill="#9ab3c5"></rect><text x="202" y="0" font-size="12" fill="#36556f">ยังอยู่ในคลัง</text>
      <text x="332" y="0" font-size="12" fill="#7890a4">ปี ${year+543}</text>
    </g>
  </svg>`;
}

function renderBloodKpiLineSvg(months, year, comparisonYear) {
  const rows = Array.isArray(months) ? months : [];
  const w = 860, h = 360, left = 58, right = 24, top = 26, bottom = 48;
  const chartW = w-left-right, chartH = h-top-bottom;
  const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const validRates = rows.flatMap(m => [Number(m.rate||0), Number(m.previousRate||0), Number((m.adjustedRate ?? m.rate) || 0)]).filter(Number.isFinite);
  const maxRate = Math.max(10, Math.ceil(Math.max(...validRates, 0) / 10) * 10);
  const yMax = Math.min(100, maxRate + 10);
  const x = i => left + (chartW * i / 11);
  const y = v => top + chartH - (Math.max(0,Math.min(yMax,Number(v||0))) / yMax) * chartH;
  const pathFor = key => rows.map((m,i)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map(frac => {
    const value = Math.round(yMax*frac);
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e7eef4"/><text x="${left-10}" y="${yy+4}" text-anchor="end" font-size="11" fill="#7890a4">${value}%</text>`;
  }).join("");
  const xLabels = rows.map((m,i)=>`<text x="${x(i)}" y="${h-18}" text-anchor="middle" font-size="11" fill="#6f8598">${monthNames[i]}</text>`).join("");
  const currentDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.rate)}" r="4" fill="#2d9f73"><title>${monthNames[i]} ${year+543}: ${Number(m.rate||0).toFixed(1)}%</title></circle>`).join("");
  const adjustedDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.adjustedRate ?? m.rate)}" r="3" fill="#1c77c3"><title>${monthNames[i]} ปรับแล้ว: ${Number((m.adjustedRate ?? m.rate)||0).toFixed(1)}%</title></circle>`).join("");
  const prevDots = rows.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.previousRate)}" r="3" fill="#7890a4"><title>${monthNames[i]} ${comparisonYear+543}: ${Number(m.previousRate||0).toFixed(1)}%</title></circle>`).join("");
  return `<svg class="kpi-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="แนวโน้มอัตราพึ่งพาเลือดแดงจากสภากาชาดไทย">
    ${grid}
    <path d="${pathFor("previousRate")}" fill="none" stroke="#8fa5b7" stroke-width="2.5" stroke-dasharray="7 6"/>
    <path d="${pathFor("rate")}" fill="none" stroke="#2d9f73" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${pathFor("adjustedRate")}" fill="none" stroke="#1c77c3" stroke-width="2.5" stroke-dasharray="2 8"/>
    ${prevDots}${currentDots}${adjustedDots}${xLabels}
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

function downloadBloodKpiChartPng() {
  const data = currentBloodKpiData;
  const months = Array.isArray(data?.months) ? data.months : [];
  if (!months.length) return;
  const year = Number(data.year||0), prev = Number(data.comparisonYear||year-1);
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 860;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#173b5d"; ctx.font="700 34px sans-serif"; ctx.fillText("อัตราการพึ่งพาเลือดแดงจากสภากาชาดไทย",60,58);
  ctx.fillStyle="#6f8598"; ctx.font="400 18px sans-serif"; ctx.fillText(`ปี ${year+543} เทียบกับ ${prev+543}`,60,90);
  const left=92, top=155, right=70, bottom=95, chartW=canvas.width-left-right, chartH=canvas.height-top-bottom;
  const maxRate=Math.min(100,Math.max(20,Math.ceil(Math.max(...months.flatMap(m=>[Number(m.rate||0),Number(m.previousRate||0),Number((m.adjustedRate??m.rate)||0)]),0)/10)*10+10));
  const x=i=>left+chartW*i/11, y=v=>top+chartH-(Number(v||0)/maxRate)*chartH;
  ctx.strokeStyle="#e6eef4"; ctx.fillStyle="#7890a4"; ctx.font="400 13px sans-serif";
  for(let i=0;i<=4;i++){const val=Math.round(maxRate*i/4),yy=y(val);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+chartW,yy);ctx.stroke();ctx.fillText(`${val}%`,40,yy+4);}
  const drawLine=(key,color,dash=[],width=3)=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();months.forEach((m,i)=>{const xx=x(i),yy=y(m[key] ?? m.rate);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);});ctx.stroke();ctx.restore();};
  drawLine('previousRate','#8fa5b7',[8,6],2.5); drawLine('rate','#2d9f73',[],4); drawLine('adjustedRate','#1c77c3',[2,8],2.5);
  const names=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  months.forEach((m,i)=>{ctx.fillStyle="#2d9f73";ctx.beginPath();ctx.arc(x(i),y(m.rate),5,0,Math.PI*2);ctx.fill();ctx.fillStyle="#60788d";ctx.font="600 13px sans-serif";ctx.fillText(names[i],x(i)-14,top+chartH+32);});
  ctx.fillStyle="#36556f";ctx.font="600 15px sans-serif";ctx.fillText(`รวม ${year+543}`,80,125);ctx.strokeStyle="#2d9f73";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(20,120);ctx.lineTo(65,120);ctx.stroke();
  ctx.fillText(`ปรับแล้ว`,215,125);ctx.save();ctx.strokeStyle="#1c77c3";ctx.lineWidth=2.5;ctx.setLineDash([2,8]);ctx.beginPath();ctx.moveTo(135,120);ctx.lineTo(200,120);ctx.stroke();ctx.restore();
  ctx.fillText(`${prev+543}`,365,125);ctx.save();ctx.strokeStyle="#8fa5b7";ctx.lineWidth=2.5;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(300,120);ctx.lineTo(350,120);ctx.stroke();ctx.restore();
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
  if (!options.silent) box.innerHTML = `<div class="hero-card mt-4"><div class="fw-bold">กำลังโหลดทะเบียนกาชาดจำเป็น...</div><div class="small-muted">กำลังจับคู่ Bag No. กับข้อมูล LIS</div></div>`;
  try {
    const data = await MinimumStockBackend.getTrcRareRegistry(300);
    currentTrcRareData = data;
    renderTrcRarePage(data);
    window.setTimeout(() => document.getElementById("trcRareBagInput")?.focus(), 80);
  } catch (err) {
    box.innerHTML = `<div class="trc-rare-shell"><div class="simple-page-head mt-2"><div><h1>กาชาดจำเป็น</h1><div class="page-subline">แยกถุง Rare / Ag-matched / Rh Negative ออกจากการพึ่งพากาชาดทั่วไป</div></div></div><div class="simple-panel"><h4 class="fw-bold mb-2">ยังเปิดทะเบียนไม่ได้</h4><div class="small-muted">${escapeOutreachHtml(err.message)}</div></div></div>`;
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
          <h1>กาชาดจำเป็น</h1>
          <div class="page-subline">บันทึกถุงที่จำเป็นต้องเบิกจากสภากาชาดไทย เช่น rare / Ag-matched / Rh Negative</div>
        </div>
        <div class="trc-head-actions no-print">
          <span class="trc-scope-chip">เฉพาะเลือดหายาก / Ag-matched / Rh Negative</span>
          <button class="trc-refresh-btn" type="button" onclick="loadTrcRarePage()" aria-label="รีเฟรช">↻</button>
        </div>
      </div>

      <div class="trc-compact-notes mb-3">
        <span class="trc-note-chip is-warning">ไม่ใช้กรณีสต๊อกไม่พอ</span>
        <span class="trc-note-chip">บันทึกเฉพาะ Bag No. และผลิตภัณฑ์</span>
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
          <div class="trc-summary-help">นับเฉพาะถุงที่ยืนยันจาก LIS ว่ามาจากกาชาด</div>
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
  const ok = await showConfirmModal("ยกเลิกรายการนี้", "รายการจะไม่ถูกนำไปตัดออกจากอัตราพึ่งพากาชาด แต่ Audit Log ยังเก็บประวัติไว้", { confirmText: "ยืนยันยกเลิก" });
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

  if (page !== "blood-kpi") {
    document.querySelectorAll(".side-tree-child").forEach(el => el.classList.remove("active"));
    document.getElementById("kpiTree")?.classList.remove("open");
  }

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
