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
    window.addEventListener("minimumStockAuthReady", () => { loadDashboardOnStart(); loadLisUploadGuide(); });

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

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", async () => {
        const ok = await showConfirmModal("ยืนยันการล้างฐานทั้งหมด", "ปุ่มนี้จะลบทั้ง Dashboard และฐานประวัติ LIS ที่เก็บไว้ตั้งแต่เปิดระบบ\n\nหลังล้าง ต้องนำไฟล์ย้อนหลังทั้งหมดมาเป็นฐานใหม่อีกครั้ง ใช้เฉพาะกรณีจำเป็นจริง ๆ");
        if (!ok) return;

        clearDataBtn.disabled = true;
        clearDataBtn.textContent = "กำลังล้างข้อมูล...";
        showStatus("กำลังล้างข้อมูลเดิมในระบบ", true);

        try {
          await MinimumStockBackend.clearAllSnapshots({ gasWebAppUrl: WEB_APP_URL });
          if (MinimumStockBackend.clearAllOutreachBatches) {
            await MinimumStockBackend.clearAllOutreachBatches();
          }
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
          showModal("success", "ล้างฐานข้อมูลแล้ว", "ระบบล้าง Dashboard และฐานประวัติ LIS แล้ว ครั้งถัดไปต้องอัปโหลดข้อมูลย้อนหลังทั้งหมดเป็นฐานใหม่");
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
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260916-v2-9-21-filter-synced-charts";
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

function showConfirmModal(title, message) {
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
    overlay.style.display = "flex";

    const cleanup = (result) => {
      overlay.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
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
const OUTREACH_USED = "นำไปใช้/จ่ายออก";
const OUTREACH_DESTROYED = "ทิ้ง/ทำลาย";
const OUTREACH_TRANSFORMED = "แปรรูปต่อ";
const OUTREACH_UNKNOWN = "ยังไม่ทราบผล/คงเหลือ/สถานะอื่น";
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

function outcomeLabel(code) {
  if (code === "used") return OUTREACH_USED;
  if (code === "destroyed") return OUTREACH_DESTROYED;
  if (code === "transformed") return OUTREACH_TRANSFORMED;
  if (code === "conflict") return OUTREACH_CONFLICT;
  return OUTREACH_UNKNOWN;
}

function outcomeLabelForRow(row) {
  const status = String(row?.status || "");
  if (status.includes("Dedicated")) return "ส่งต่อ/แลกกับ รพ.อื่น (Dedicated)";
  return outcomeLabel(row?.outcomeCode);
}

function normalizeOutreachSourceSummary(raw) {
  return (raw || []).map(item => ({
    sourceGroup: item.source_group || item.sourceGroup || "",
    donateSource: item.donate_source || item.donateSource || "",
    received: Number(item.received || 0),
    uniqueBags: Number(item.unique_bags || item.uniqueBags || 0),
    used: Number(item.used || 0),
    dedicated: Number(item.dedicated || 0),
    destroyed: Number(item.destroyed || 0),
    transformed: Number(item.transformed || 0),
    unresolved: Number(item.unresolved || 0),
    conflicts: Number(item.conflicts || 0),
    usePercent: outreachPercent(item.used, item.received),
    destroyPercent: outreachPercent(item.destroyed, item.received)
  }));
}

function normalizeOutreachGroupSummary(raw) {
  return (raw || []).map(item => ({
    sourceGroup: item.source_group || item.sourceGroup || "",
    received: Number(item.received || 0),
    used: Number(item.used || 0),
    dedicated: Number(item.dedicated || 0),
    destroyed: Number(item.destroyed || 0),
    transformed: Number(item.transformed || 0),
    unresolved: Number(item.unresolved || 0),
    conflicts: Number(item.conflicts || 0)
  }));
}

function normalizeOutreachSummary(raw = {}) {
  const received = Number(raw.received || 0);
  return {
    received,
    uniqueBags: Number(raw.unique_bags || raw.uniqueBags || 0),
    selfInhouse: Number(raw.self_inhouse || raw.selfInhouse || 0),
    selfOutreach: Number(raw.self_outreach || raw.selfOutreach || 0),
    trc: Number(raw.trc || 0),
    otherHospital: Number(raw.other_hospital || raw.otherHospital || 0),
    used: Number(raw.used || 0),
    dedicated: Number(raw.dedicated || 0),
    destroyed: Number(raw.destroyed || 0),
    transformed: Number(raw.transformed || 0),
    unresolved: Number(raw.unresolved || 0),
    conflicts: Number(raw.conflicts || 0),
    usePercent: outreachPercent(raw.used, received),
    destroyPercent: outreachPercent(raw.destroyed, received)
  };
}

async function loadOutreachAnalysis(forceRefresh = false) {
  const container = document.getElementById("outreachOutcomeDashboard");
  if (!container) return;

  container.innerHTML = `
    <div class="hero-card mt-4">
      <div class="fw-bold">กำลังโหลดรายงานวิเคราะห์ผลถุงเลือดออกหน่วย...</div>
      <div class="small-muted mt-1">กำลังอ่านฐานประวัติ LIS และสรุปผลล่าสุด</div>
    </div>
  `;

  try {
    const data = await MinimumStockBackend.getOutreachAnalysis({ forceRefresh });
    currentOutreachAnalysisData = data;
    currentOutreachSourceSummary = normalizeOutreachSourceSummary(data?.report?.sources || []);
    renderOutreachAnalysis();
  } catch (err) {
    const message = String(err?.message || err || "");
    const isTimeout = /statement timeout|canceling statement/i.test(message);
    container.innerHTML = `
      <div class="hero-card mt-4 outreach-error-card">
        <h4 class="fw-bold mb-2">${isTimeout ? "รายงานใช้เวลานานเกินไป" : "เปิดรายงานไม่ได้"}</h4>
        <div class="small-muted mb-3">${isTimeout ? "ข้อมูลที่อัปโหลดไว้ไม่ได้ถูกลบ แต่คำสั่งสรุปรายงานใช้เวลานานจน Supabase ยกเลิกคำสั่ง" : escapeOutreachHtml(message)}</div>
        ${isTimeout ? `<div class="small-muted mb-3">ลองโหลดใหม่ได้เลย โดยยังไม่ต้องอัปโหลดไฟล์ LIS ซ้ำ</div>` : ""}
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-main" type="button" onclick="loadOutreachAnalysis(true)">ลองโหลดรายงานอีกครั้ง</button>
          <button class="btn btn-light" type="button" onclick="scrollToUpload()">ไปหน้า Upload File</button>
        </div>
      </div>
    `;
  }
}

function renderProductMultiSelect(products, selectedProducts) {
  const selected = Array.isArray(selectedProducts) ? Array.from(new Set(selectedProducts)) : [];
  const selectedSet = new Set(selected);
  const label = selected.length === 0 ? "ทุกชนิด" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} ชนิด`;
  const helper = selected.length === 0 ? "แตะเพื่อเลือกหลายชนิด" : selected.length === 1 ? "เลือกอยู่ 1 ชนิด" : `เลือกอยู่ ${selected.length} ชนิด`;
  const preview = selected.length
    ? selected.slice(0, 3).map(product => `<span>${escapeOutreachHtml(product)}</span>`).join("") + (selected.length > 3 ? `<span>+${selected.length - 3}</span>` : "")
    : `<span class="is-placeholder">ยังไม่ได้เลือกเฉพาะชนิด</span>`;
  return `
    <details class="product-multi-select" id="outreachProductPicker" ontoggle="handleOutreachProductPickerToggle(this)">
      <summary>
        <span class="product-picker-label">ชนิดผลิตภัณฑ์</span>
        <strong id="outreachProductLabel">${escapeOutreachHtml(label)}</strong>
        <small id="outreachProductHelper">${escapeOutreachHtml(helper)}</small>
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
    label.textContent = selected.length === 0 ? "ทุกชนิด" : selected.length === 1 ? selected[0] : `เลือกแล้ว ${selected.length} ชนิด`;
  }
  if (helper) {
    helper.textContent = selected.length === 0 ? "แตะเพื่อเลือกหลายชนิด" : selected.length === 1 ? "เลือกอยู่ 1 ชนิด" : `เลือกอยู่ ${selected.length} ชนิด`;
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
  return monthNames.map((name, index) => {
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
    return `<option value="${current}" selected>${current + 543}</option>`;
  }
  const start = Math.min(minYear, maxYear);
  const end = Math.max(minYear, maxYear);
  const options = [];
  for (let year = end; year >= start; year -= 1) {
    options.push(`<option value="${year}" ${year === selected ? "selected" : ""}>${year + 543}</option>`);
  }
  return options.join("");
}

function outreachMonthParts(value, fallbackValue = "") {
  const match = String(value || fallbackValue || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  return { year: Number(match[1]), month: Number(match[2]) };
}

function outreachMonthKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
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
  if (filters?.sourceGroup) chips.push(`กลุ่ม: ${filters.sourceGroup}`);
  if (filters?.source) chips.push(`จุด/แหล่ง: ${filters.source}`);
  if (Array.isArray(filters?.productTypes) && filters.productTypes.length) {
    chips.push(filters.productTypes.length === 1 ? `ผลิตภัณฑ์: ${filters.productTypes[0]}` : `ผลิตภัณฑ์: ${filters.productTypes.length} ชนิด`);
  }
  if (filters?.bloodGroup) chips.push(`หมู่เลือด: ${filters.bloodGroup}`);
  if (filters?.rh) chips.push(`Rh: ${filters.rh}`);

  if (!chips.length) {
    box.innerHTML = `
      <div class="filter-summary-strip is-default">
        <strong>กำลังดูข้อมูลทั้งหมด</strong>
        <span>ยังไม่ได้จำกัดตัวกรองเพิ่มเติม</span>
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
    <div class="trend-focus-strip is-synced">
      <strong>กราฟใช้ตัวกรองด้านบนชุดเดียวกันทั้งหมด · ${escapeOutreachHtml(rangeText)}</strong>
      <span>ไม่มีตัวกรองปีแยกใต้กราฟแล้ว การ์ด กราฟ ตาราง และสรุปแหล่งรับเข้าใช้ช่วงข้อมูลเดียวกัน</span>
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
  applyOutreachFilters();
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
    <div class="outreach-report-shell">
      <div class="simple-page-head">
        <div>
          <h1>ผลถุงเลือด</h1>
          <div class="page-subline">ดูว่าเลือดที่รับเข้าถูกใช้ ทิ้ง หรือยังอยู่ในระบบ · อัปเดต ${escapeOutreachHtml(formatDisplayDateTime(data.calculatedAt) || "-")}</div>
        </div>
        <div class="compact-actions no-print">
          <button id="outreachExportCsvBtn" class="btn btn-light" type="button" onclick="exportOutreachCsv()">CSV</button>
          <button id="outreachExportExcelBtn" class="btn btn-light" type="button" onclick="exportOutreachExcel()">Excel</button>
          <button class="btn btn-main" type="button" onclick="printOutreachReport()">PDF</button>
        </div>
      </div>

      <details class="simple-details filter-details mb-3 no-print">
        <summary>กรองข้อมูล</summary>
        <div class="outreach-filter-grid pt-3">
          <div class="outreach-range-pair">
            <div class="outreach-range-head">
              <div>
                <strong>ช่วงข้อมูลรายเดือน</strong>
                <span>แยกเดือนกับปี เพื่อไม่ต้องเลื่อนรายการยาวเมื่อข้อมูลเพิ่มขึ้นในอนาคต</span>
              </div>
              <div class="outreach-range-quick-actions" aria-label="ช่วงข้อมูลด่วน">
                <button type="button" onclick="setOutreachQuickMonthRange('thisYear')">ปีนี้</button>
                <button type="button" onclick="setOutreachQuickMonthRange('last12')">12 เดือนล่าสุด</button>
                <button type="button" onclick="setOutreachQuickMonthRange('all')">ทั้งหมด</button>
              </div>
            </div>
            ${(() => {
              const fromParts = outreachMonthParts(f.dateFrom || availableMinDate, availableMinDate);
              const toParts = outreachMonthParts(f.dateTo || availableMaxDate, availableMaxDate);
              return `
                <div class="outreach-month-year-side">
                  <span class="range-mini-label">ตั้งแต่</span>
                  <div class="outreach-month-year-controls">
                    <select id="outreachMonthFromMonth" class="form-select" aria-label="เดือนเริ่มต้น" onchange="applyOutreachMonthRangeFilter()">${renderOutreachMonthSelectOptions(fromParts.month)}</select>
                    <select id="outreachMonthFromYear" class="form-select" aria-label="ปีเริ่มต้น" onchange="applyOutreachMonthRangeFilter()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, fromParts.year)}</select>
                  </div>
                </div>
                <span class="outreach-range-arrow" aria-hidden="true">→</span>
                <div class="outreach-month-year-side">
                  <span class="range-mini-label">ถึง</span>
                  <div class="outreach-month-year-controls">
                    <select id="outreachMonthToMonth" class="form-select" aria-label="เดือนสิ้นสุด" onchange="applyOutreachMonthRangeFilter()">${renderOutreachMonthSelectOptions(toParts.month)}</select>
                    <select id="outreachMonthToYear" class="form-select" aria-label="ปีสิ้นสุด" onchange="applyOutreachMonthRangeFilter()">${renderOutreachYearSelectOptions(availableMinDate, availableMaxDate, toParts.year)}</select>
                  </div>
                </div>`;
            })()}
          </div>
          <label class="outreach-filter-item">กลุ่มแหล่งรับเข้า<select id="outreachSourceGroup" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.sourceGroups || [], f.sourceGroup || "", "ทั้งหมด")}</select></label>
          <label class="outreach-filter-item">จุดออกหน่วย / แหล่งรับเข้า<select id="outreachSource" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.sources || [], f.source || "", "ทุกจุด")}</select></label>
          ${renderProductMultiSelect(options.products || [], f.productTypes || [])}
          <label class="outreach-filter-item">หมู่เลือด<select id="outreachBloodGroup" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.bloodGroups || [], f.bloodGroup || "", "ทุกหมู่")}</select></label>
          <label class="outreach-filter-item">Rh<select id="outreachRh" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.rhs || [], f.rh || "", "ทุก Rh")}</select></label>
          <details class="outreach-advanced-date">
            <summary>วันที่แบบละเอียด</summary>
            <div class="outreach-exact-date-grid">
              <label class="outreach-filter-item">วันที่รับเข้า ตั้งแต่<input id="outreachDateFrom" type="date" class="form-control" min="${escapeOutreachHtml(availableMinDate)}" max="${escapeOutreachHtml(availableMaxDate)}" value="${escapeOutreachHtml(f.dateFrom || "")}" onchange="applyOutreachExactDateFilter()" /></label>
              <label class="outreach-filter-item">ถึง<input id="outreachDateTo" type="date" class="form-control" min="${escapeOutreachHtml(availableMinDate)}" max="${escapeOutreachHtml(availableMaxDate)}" value="${escapeOutreachHtml(f.dateTo || "")}" onchange="applyOutreachExactDateFilter()" /></label>
            </div>
          </details>
        </div>
        <div class="d-flex justify-content-between align-items-center gap-2 mt-3">
          <div id="outreachFilterLoading" class="small-muted" style="display:none;">กำลังคำนวณ...</div>
          <button class="btn btn-light btn-sm" type="button" onclick="resetOutreachFilters()">ล้างตัวกรอง</button>
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
            <div class="small-muted">แสดงต่อเนื่องตามช่วงเดือน/ปีที่เลือกด้านบน · ไม่มีตัวกรองปีซ้ำด้านล่าง</div>
          </div>
        </div>
        <div id="outreachTrendInsight" class="mb-2"></div>
        <div id="outreachTrendChart"><div class="small-muted py-4">กำลังโหลดกราฟ...</div></div>
      </div>

      <details class="simple-details mb-3" open>
        <summary>เปรียบเทียบแหล่งรับเข้าและจุดออกหน่วย · ตามตัวกรองด้านบน</summary>
        <div class="pt-3" id="outreachCharts"></div>
      </details>

      <details class="simple-details mb-4">
        <summary>ดูตารางรายจุด</summary>
        <div class="pt-3" id="outreachSourceTable"></div>
      </details>

      <details class="simple-details mb-4">
        <summary>วิธีนับ</summary>
        <div class="pt-3 small-muted">นับผลปลายทางระดับ “ถุงต้นทาง” โดย BagNumber หลักและ .S1/.S2/... ถือเป็นถุงเดียวกัน · ถ้ามี Released/Dedicated อย่างน้อย 1 รายการ ให้นับว่าใช้/จ่ายเพียง 1 ถุง และไม่นับ Expired ของถุงหลักซ้ำ · ตัด 1B6 / EQA / Test / เลขถุง 10062Q79877 / 10067R02375 ออกจากการคำนวณทุกกรณี รวมทั้งข้อมูลสอน/ทดสอบและถุงรับต่อจากรามาธิบดี/พญาไท</div>
      </details>
    </div>`;

  renderOutreachValidation(validation, data.reviewRows || []);
  renderOutreachFilterSummary(f);
  renderOutreachReportSections(data.report || {});
  loadOutreachTrend();
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
    box.innerHTML = `<div class="data-quality-strip is-ok mb-3"><strong>✓ ข้อมูลพร้อมวิเคราะห์</strong><span> ระบบตัดข้อมูลสอน/ทดสอบออกจาก KPI อัตโนมัติ</span></div>`;
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
    sourceGroup: read("outreachSourceGroup"),
    source: read("outreachSource"),
    productTypes: getSelectedOutreachProducts(),
    bloodGroup: read("outreachBloodGroup"),
    rh: read("outreachRh")
  };
}

function getOutreachMonthRangeControlValues() {
  const read = id => Number(document.getElementById(id)?.value || 0);
  return {
    from: outreachMonthKey(read("outreachMonthFromYear"), read("outreachMonthFromMonth")),
    to: outreachMonthKey(read("outreachMonthToYear"), read("outreachMonthToMonth"))
  };
}

function applyOutreachMonthRangeFilter() {
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
  applyOutreachFilters();
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
  applyOutreachFilters();
}

function applyOutreachExactDateFilter() {
  const fromDate = document.getElementById("outreachDateFrom")?.value || "";
  const toDate = document.getElementById("outreachDateTo")?.value || "";
  const fromMonth = outreachMonthValueFromDate(fromDate);
  const toMonth = outreachMonthValueFromDate(toDate);
  if (fromMonth && toMonth) setOutreachMonthRangeControls(fromMonth, toMonth);
  applyOutreachFilters();
}

function resetOutreachFilters() {
  ["outreachDateFrom", "outreachDateTo", "outreachSourceGroup", "outreachSource", "outreachBloodGroup", "outreachRh"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });
  document.querySelectorAll(".outreach-product-check").forEach(el => { el.checked = false; });
  updateOutreachProductLabel();
  updateOutreachProductDraftCount();

  const minDate = currentOutreachAnalysisData?.filterOptions?.minDate || currentOutreachAnalysisData?.sourceStartDate || "";
  const maxDate = currentOutreachAnalysisData?.filterOptions?.maxDate || currentOutreachAnalysisData?.sourceEndDate || "";
  const minMonth = outreachMonthValueFromDate(minDate);
  const maxMonth = outreachMonthValueFromDate(maxDate);
  if (minMonth && maxMonth) {
    setOutreachMonthRangeControls(minMonth, maxMonth);
    const fromDateEl = document.getElementById("outreachDateFrom");
    const toDateEl = document.getElementById("outreachDateTo");
    if (fromDateEl) fromDateEl.value = `${minMonth}-01`;
    if (toDateEl) toDateEl.value = outreachLastDayOfMonth(maxMonth);
  }
  applyOutreachFilters();
}

async function applyOutreachFilters() {
  if (!currentOutreachAnalysisData?.batchId) return;
  const requestId = ++outreachRequestSeq;
  const loading = document.getElementById("outreachFilterLoading");
  if (loading) loading.style.display = "block";

  try {
    const filters = getOutreachFilterValues();
    const data = await MinimumStockBackend.getOutreachAnalysis({ filters });
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
          expired: Number(m.expired || 0)
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
  const maxValue = Math.max(1, ...months.flatMap(m => [Number(m.stockIn||0), Number(m.released||0), Number(m.expired||0)]));
  const totalIn = months.reduce((s,m)=>s+Number(m.stockIn||0),0);
  const totalReleased = months.reduce((s,m)=>s+Number(m.released||0),0);
  const totalExpired = months.reduce((s,m)=>s+Number(m.expired||0),0);
  const multiYear = new Set(months.map(m => Number(m.year))).size > 1;
  const ariaStart = months[0] ? `${monthNames[Number(months[0].month)-1]} ${Number(months[0].year)+543}` : "";
  const ariaEnd = months[months.length-1] ? `${monthNames[Number(months[months.length-1].month)-1]} ${Number(months[months.length-1].year)+543}` : "";

  box.innerHTML = `
    <div class="trend-summary-row">
      <span><i class="trend-dot trend-in"></i>Stock in <b>${totalIn.toLocaleString()}</b></span>
      <span><i class="trend-dot trend-released"></i>Released <b>${totalReleased.toLocaleString()}</b></span>
      <span><i class="trend-dot trend-expired"></i>Expired <b>${totalExpired.toLocaleString()}</b></span>
    </div>
    <div class="monthly-trend-chart" style="--trend-columns:${Math.max(12,months.length)}" role="img" aria-label="กราฟ Stock in Released Expired รายเดือน ${ariaStart} ถึง ${ariaEnd}">
      ${months.map((m) => {
        const monthIndex = Math.max(0, Number(m.month || 1) - 1);
        const year = Number(m.year || 0);
        const stockIn = Number(m.stockIn || 0);
        const released = Number(m.released || 0);
        const expired = Number(m.expired || 0);
        const hIn = Math.max(stockIn ? 10 : 2, Math.round((stockIn / maxValue) * 100));
        const hRel = Math.max(released ? 10 : 2, Math.round((released / maxValue) * 100));
        const hExp = expired ? Math.max(10, Math.round((expired / maxValue) * 100)) : 0;
        const shortYear = String(year + 543).slice(-2);
        const label = multiYear ? `${monthNames[monthIndex]} ${shortYear}` : monthNames[monthIndex];
        const fullLabel = `${monthNamesLong[monthIndex]} ${year + 543}`;
        return `
          <div class="month-group">
            <div class="month-top-value">${Math.max(stockIn, released, expired).toLocaleString()}</div>
            <div class="month-bars">
              <span class="month-bar trend-in" style="height:${hIn}%" title="${fullLabel} · Stock in ${stockIn.toLocaleString()}"></span>
              <span class="month-bar trend-released" style="height:${hRel}%" title="${fullLabel} · Released ${released.toLocaleString()}"></span>
              <span class="month-bar trend-expired" style="height:${hExp}%" title="${fullLabel} · Expired ${expired.toLocaleString()}"></span>
            </div>
            <div class="month-label">${label}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="trend-note-row">
      <div class="small-muted">เลขเหนือแต่ละเดือนคือค่าที่มากที่สุดของเดือนนั้น ส่วนตัวเลขละเอียดดูในตารางด้านล่าง</div>
    </div>
    <div class="trend-table-wrap mt-3">
      <table class="table table-sm trend-data-table align-middle mb-0">
        <thead>
          <tr>
            <th>เดือน / ปี</th>
            <th class="text-end">Stock in</th>
            <th class="text-end">Released</th>
            <th class="text-end">Expired</th>
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
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="small-muted mt-2">กราฟยึดตัวกรองด้านบนทั้งหมด · ช่วงเดือน/ปีใช้ DateStockIn เพื่อเลือกชุดถุง · นับ 1 ครั้งต่อถุงต้นทาง (.S1/.S2 รวมกับถุงหลัก) · Stock in ใช้ DateStockIn · Released/Expired วางตามเดือนของ DateStockOut</div>`;
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
  box.innerHTML = `
    <div class="simple-kpi-grid outreach-key-kpis mb-3">
      <div class="simple-kpi"><span>รับเข้าทั้งหมด</span><strong>${Number(s.received||0).toLocaleString()}</strong><small>ถุงต้นทาง · นับ .S1/.S2 รวมกับถุงหลัก</small></div>
      <div class="simple-kpi is-good"><span>ใช้ / จ่าย / ส่งต่อ</span><strong>${Number(s.used||0).toLocaleString()}</strong><small>${s.usePercent.toFixed(1)}% · Dedicated ${Number(s.dedicated||0).toLocaleString()}</small></div>
      <div class="simple-kpi is-alert"><span>ทิ้ง / ทำลาย</span><strong>${Number(s.destroyed||0).toLocaleString()}</strong><small>${s.destroyPercent.toFixed(1)}%</small></div>
      <div class="simple-kpi"><span>ยังไม่จบผล</span><strong>${(Number(s.unresolved||0)+Number(s.transformed||0)).toLocaleString()}</strong><small>คงเหลือ/อื่น ${Number(s.unresolved||0).toLocaleString()} · แปรรูป ${Number(s.transformed||0).toLocaleString()}</small></div>
    </div>
    <div class="source-mini-grid mb-3">
      <div><span>รับบริจาคใน รพ.</span><b>${Number(s.selfInhouse||0).toLocaleString()}</b></div>
      <div><span>ออกหน่วย</span><b>${Number(s.selfOutreach||0).toLocaleString()}</b></div>
      <div><span>กาชาด</span><b>${Number(s.trc||0).toLocaleString()}</b></div>
      <div><span>รพ.อื่น</span><b>${Number(s.otherHospital||0).toLocaleString()}</b></div>
    </div>
    ${s.conflicts ? `<div class="outreach-conflict-note mb-3">มี ${s.conflicts.toLocaleString()} รายการที่ข้อมูลขัดแย้งและถูกกันออกจากผลลัพธ์ปลายทาง</div>` : ""}
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
  const groups = groupOrder.map(name => map.get(name) || { sourceGroup: name, received: 0, used: 0, destroyed: 0, transformed: 0, unresolved: 0, conflicts: 0 });
  const maxGroup = Math.max(1, ...groups.map(item => Math.max(item.received || 0, item.used || 0, item.destroyed || 0, item.unresolved || 0, item.transformed || 0)));
  const topSources = (sourceSummary || []).slice(0, 12);
  const maxSource = Math.max(1, ...topSources.map(item => Math.max(item.received || 0, item.used || 0, item.destroyed || 0)));
  const topDiscard = [...(sourceSummary || [])].sort((a, b) => b.destroyPercent - a.destroyPercent || b.received - a.received).slice(0, 12);

  box.innerHTML = `
    <div class="outreach-chart-grid mb-3">
      <div class="hero-card outreach-chart-card">
        <div class="outreach-section-head mb-3">
          <div>
            <h5 class="fw-bold mb-1">เปรียบเทียบแหล่งรับเข้า</h5>
            <div class="small-muted">รวม 4 กลุ่มตามการใช้งานจริงของหน่วย พร้อมตัวเลขของแต่ละผลลัพธ์</div>
          </div>
        </div>
        <div class="outreach-group-card-list">
        ${groups.map(item => `
          <div class="outreach-group-card-row">
            <div class="outreach-chart-topline">
              <div class="outreach-chart-title">${escapeOutreachHtml(item.sourceGroup)}</div>
              <div class="outreach-total-badge">รับเข้า ${item.received.toLocaleString()}</div>
            </div>
            <div class="outreach-pill-row">
              ${renderOutreachMetricPill("รับเข้า", item.received, "received")}
              ${renderOutreachMetricPill("ใช้/จ่ายออก", item.used, "used")}
              ${renderOutreachMetricPill("ทิ้ง/ทำลาย", item.destroyed, "destroyed")}
              ${renderOutreachMetricPill("คงเหลือ/อื่น", item.unresolved, "unresolved")}
              ${item.transformed ? renderOutreachMetricPill("แปรรูปต่อ", item.transformed, "transformed") : ""}
              ${item.conflicts ? renderOutreachMetricPill("ข้อมูลขัดแย้ง", item.conflicts, "conflict") : ""}
            </div>
            <div class="outreach-stacked-bar" aria-label="${escapeOutreachHtml(item.sourceGroup)}">
              <span class="bar-used" style="width:${(Number(item.used || 0) / maxGroup) * 100}%" title="ใช้ ${item.used}"></span>
              <span class="bar-destroyed" style="width:${(Number(item.destroyed || 0) / maxGroup) * 100}%" title="ทิ้ง ${item.destroyed}"></span>
              <span class="bar-transformed" style="width:${(Number(item.transformed || 0) / maxGroup) * 100}%" title="แปรรูปต่อ ${item.transformed}"></span>
              <span class="bar-unresolved" style="width:${(Number(item.unresolved || 0) / maxGroup) * 100}%" title="คงเหลือ/อื่น ${item.unresolved}"></span>
              <span class="bar-conflict" style="width:${(Number(item.conflicts || 0) / maxGroup) * 100}%" title="ขัดแย้ง ${item.conflicts}"></span>
            </div>
          </div>
        `).join("")}
        </div>
        <div class="outreach-legend"><span><i class="legend-used"></i> ใช้/จ่ายออก</span><span><i class="legend-destroyed"></i> ทิ้ง/ทำลาย</span><span><i class="legend-transformed"></i> แปรรูปต่อ</span><span><i class="legend-unresolved"></i> ยังไม่ทราบผล</span><span><i class="legend-conflict"></i> ข้อมูลขัดแย้ง</span></div>
      </div>

      <div class="hero-card outreach-chart-card">
        <div class="outreach-section-head mb-3">
          <div>
            <h5 class="fw-bold mb-1">รับเข้า / ใช้ / ทิ้ง ตามจุด</h5>
            <div class="small-muted">แสดง 12 จุดที่มีจำนวนรับเข้าสูงสุดตามตัวกรอง พร้อมตัวเลขทุกชุดเพื่ออ่านง่ายขึ้น</div>
          </div>
        </div>
        <div class="outreach-bars-list">
          ${topSources.map(item => `
            <div class="outreach-source-card-row">
              <div class="outreach-source-card-head">
                <div class="outreach-source-bar-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
                <div class="small-muted">${escapeOutreachHtml(item.sourceGroup || "")}</div>
              </div>
              <div class="outreach-pill-row is-compact">
                ${renderOutreachMetricPill("รับเข้า", item.received, "received")}
                ${renderOutreachMetricPill("ใช้", item.used, "used")}
                ${renderOutreachMetricPill("ทิ้ง", item.destroyed, "destroyed")}
              </div>
              <div class="outreach-metric-bars">
                ${renderOutreachMetricBar("รับเข้า", item.received, maxSource, "received")}
                ${renderOutreachMetricBar("ใช้", item.used, maxSource, "used")}
                ${renderOutreachMetricBar("ทิ้ง", item.destroyed, maxSource, "destroyed")}
              </div>
            </div>
          `).join("") || `<div class="small-muted">ไม่มีข้อมูลตามตัวกรอง</div>`}
        </div>
      </div>
    </div>

    <div class="hero-card outreach-chart-card mb-3">
      <div class="outreach-section-head mb-3">
        <div>
          <h5 class="fw-bold mb-1">ร้อยละทิ้ง/ทำลายของแต่ละจุด</h5>
          <div class="small-muted">ร้อยละทิ้ง = ทิ้ง/ทำลาย ÷ ผลิตภัณฑ์รับเข้าตามตัวกรอง × 100</div>
        </div>
      </div>
      <div class="outreach-percent-bars">
        ${topDiscard.map(item => `
          <div class="outreach-percent-row">
            <div>
              <div class="outreach-percent-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
              <div class="small-muted">ทิ้ง ${Number(item.destroyed || 0).toLocaleString()} / รับเข้า ${Number(item.received || 0).toLocaleString()}</div>
            </div>
            <div class="outreach-percent-track"><span style="width:${Math.min(100, item.destroyPercent)}%"></span></div>
            <div class="outreach-percent-value">${item.destroyPercent.toFixed(1)}%</div>
          </div>
        `).join("") || `<div class="small-muted">ไม่มีข้อมูลตามตัวกรอง</div>`}
      </div>
    </div>
  `;
}

function renderOutreachSourceTable(sourceSummary) {
  const box = document.getElementById("outreachSourceTable");
  if (!box) return;
  box.innerHTML = `
    <div class="simple-table-card mb-4">
      <div class="table-card-head">
        <div><h3>แต่ละจุดได้ผลเป็นอย่างไร</h3><p>เรียงจากรับเข้ามากสุด · กดแถวเพื่อดูรายถุง</p></div>
        <span>${(sourceSummary || []).length.toLocaleString()} จุด</span>
      </div>
      <div class="table-responsive outreach-summary-table-wrap">
        <table class="table outreach-summary-table align-middle simple-table">
          <thead><tr><th>จุด / แหล่งรับเข้า</th><th class="text-end">รับเข้า</th><th class="text-end">ใช้/จ่าย/ส่งต่อ</th><th class="text-end">ทิ้ง</th><th class="text-end">% ใช้</th><th class="text-end">% ทิ้ง</th></tr></thead>
          <tbody>${(sourceSummary || []).map((item,index)=>`
            <tr class="outreach-click-row" onclick="openOutreachSourceDetail(${index},1)">
              <td><div class="fw-bold">${escapeOutreachHtml(item.donateSource)}</div><div class="small-muted">${escapeOutreachHtml(item.sourceGroup)}</div></td>
              <td class="text-end fw-bold">${item.received.toLocaleString()}</td>
              <td class="text-end">${item.used.toLocaleString()}${item.dedicated ? `<div class="tiny-note">Dedicated ${item.dedicated.toLocaleString()}</div>` : ""}</td>
              <td class="text-end">${item.destroyed.toLocaleString()}</td>
              <td class="text-end fw-bold">${item.usePercent.toFixed(1)}%</td>
              <td class="text-end">${item.destroyPercent.toFixed(1)}%</td>
            </tr>`).join("") || `<tr><td colspan="6" class="text-center small-muted py-4">ไม่มีข้อมูลตามตัวกรอง</td></tr>`}</tbody>
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
            <th>BagNumber</th><th>ProductType</th><th>BloodGroup</th><th>Rh</th><th>DonateSource</th><th>DateStockIn</th><th>DateStockOut</th><th>Status</th><th>DestroyReason</th><th>ผลลัพธ์สุดท้าย</th>
          </tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="fw-bold">${escapeOutreachHtml(row.bagNumber)}</td>
                <td>${escapeOutreachHtml(row.productType)}</td>
                <td>${escapeOutreachHtml(row.bloodGroup)}</td>
                <td>${escapeOutreachHtml(row.rh)}</td>
                <td>${escapeOutreachHtml(row.donateSource)}</td>
                <td>${escapeOutreachHtml(row.dateStockIn)}</td>
                <td>${escapeOutreachHtml(row.dateStockOut)}</td>
                <td>${escapeOutreachHtml(row.status)}</td>
                <td>${escapeOutreachHtml(row.destroyReason)}</td>
                <td><span class="outreach-outcome-badge ${outreachOutcomeClass(row.outcomeCode)}">${escapeOutreachHtml(outcomeLabelForRow(row))}</span></td>
              </tr>
            `).join("") || `<tr><td colspan="10" class="text-center small-muted py-4">ไม่มีรายละเอียดตามตัวกรอง</td></tr>`}
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

function outreachOutcomeClass(code) {
  if (code === "used") return "is-used";
  if (code === "destroyed") return "is-destroyed";
  if (code === "transformed") return "is-transformed";
  if (code === "conflict") return "is-conflict";
  return "is-unresolved";
}

function closeOutreachDetail() {
  const overlay = document.getElementById("outreachDetailOverlay");
  if (overlay) overlay.style.display = "none";
}

function mapOutreachExportRows(rows) {
  return (rows || []).map(row => ({
    BagNumber: row.bagNumber,
    ProductType: row.productType,
    BloodGroup: row.bloodGroup,
    Rh: row.rh,
    DonateSource: row.donateSource,
    SourceGroup: row.sourceGroup,
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

    const s = normalizeOutreachSummary(currentOutreachAnalysisData?.report?.summary || {});
    const summaryRows = [
      { รายการ: "ผลิตภัณฑ์รับเข้าทั้งหมด", จำนวน: s.received },
      { รายการ: "BagNumber ไม่ซ้ำ", จำนวน: s.uniqueBags },
      { รายการ: "หาเอง – รับบริจาคในโรงพยาบาล", จำนวน: s.selfInhouse },
      { รายการ: "หาเอง – ออกหน่วย", จำนวน: s.selfOutreach },
      { รายการ: "กาชาดไทย", จำนวน: s.trc },
      { รายการ: "รับจากโรงพยาบาลอื่น", จำนวน: s.otherHospital },
      { รายการ: "นำไปใช้/จ่ายออก", จำนวน: s.used },
      { รายการ: "ทิ้ง/ทำลาย", จำนวน: s.destroyed },
      { รายการ: "แปรรูปต่อ", จำนวน: s.transformed },
      { รายการ: "ยังไม่ทราบผล/คงเหลือ", จำนวน: s.unresolved },
      { รายการ: "ข้อมูลขัดแย้ง", จำนวน: s.conflicts },
      { รายการ: "ร้อยละนำไปใช้", จำนวน: s.usePercent },
      { รายการ: "ร้อยละทิ้ง", จำนวน: s.destroyPercent }
    ];
    const sourceRows = (currentOutreachSourceSummary || []).map(item => ({
      จุดออกหน่วยหรือแหล่งรับเข้า: item.donateSource,
      กลุ่มแหล่งรับเข้า: item.sourceGroup,
      รับเข้า: item.received,
      BagNumberไม่ซ้ำ: item.uniqueBags,
      นำไปใช้จ่ายออก: item.used,
      ทิ้งทำลาย: item.destroyed,
      แปรรูปต่อ: item.transformed,
      ยังไม่ทราบผลคงเหลือ: item.unresolved,
      ข้อมูลขัดแย้ง: item.conflicts,
      ร้อยละใช้: item.usePercent,
      ร้อยละทิ้ง: item.destroyPercent
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceRows), "By Source");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Product Detail");
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

if (page === "outreach") {
  loadOutreachAnalysis(false);
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
    button.addEventListener("click", handleInstallAppClick);
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
