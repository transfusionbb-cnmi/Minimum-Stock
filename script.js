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

    uploadBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = "กำลังตรวจสอบไฟล์...";
      showStatus("กำลังตรวจสอบคอลัมน์ BagNumber, Status, DonateSource และวันที่ก่อนคำนวณ", true);
      loadingBox.style.display = "block";
      dashboard.style.display = "none";

      try {
        const preflight = await MinimumStockBackend.preflightOutreachFile(selectedFile);
        const validation = preflight.validation || {};

        if (!preflight.ok || validation.blocking) {
          throw new Error("ไฟล์ขาดคอลัมน์สำคัญ: " + (validation.missingHeaders || []).join(", "));
        }

        if (Number(validation.issueCount || 0) > 0) {
          const previewIssues = (validation.issues || []).slice(0, 6).map(item => "• " + item.message).join("\n");
          const moreText = Number(validation.issueCount || 0) > 6 ? `\n• และอีก ${Number(validation.issueCount) - 6} รายการ` : "";
          const ok = await showConfirmModal(
            "พบข้อมูลที่ต้องตรวจสอบก่อนคำนวณ",
            `พบรายการต้องตรวจสอบ ${validation.issueCount} รายการ\n` +
            `ข้อมูลซ้ำระดับผลิตภัณฑ์ ${validation.duplicateComponentCount || 0} กลุ่ม | BagNumber ที่มีหลาย ProductType ${validation.multiProductBagCount || 0} (ถือว่าปกติ) | วันที่ผิด ${validation.invalidDateCount || 0} | Status ไม่รู้จัก ${validation.unknownStatusCount || 0} | DonateSource ต้องตรวจ ${validation.unknownSourceCount || 0} | แหล่งรับเข้าขัดแย้ง ${validation.sourceConflictCount || 0} | ผลลัพธ์ขัดแย้ง ${validation.outcomeConflictCount || 0}\n\n` +
            `${previewIssues}${moreText}\n\n` +
            "ระบบจะไม่นับซ้ำ และรายการที่จัดกลุ่มไม่ได้จะไม่ถูกรวมในยอดจนกว่าจะตรวจสอบ ต้องการดำเนินการต่อหรือไม่?"
          );
          if (!ok) {
            showStatus("ยกเลิกการอัปโหลด ข้อมูลเดิมใน Supabase ยังไม่ถูกล้าง", true);
            return;
          }
        }

        uploadBtn.textContent = "กำลังตรวจสอบ Supabase...";
        showStatus("กำลังตรวจสอบว่า Supabase พร้อมสำหรับโครงสร้างวิเคราะห์ v2.6.1 ก่อนเริ่มบันทึกชุดข้อมูลใหม่", true);
        await MinimumStockBackend.ensureOutreachSchema();

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
            if (progress.stage === "outreach-save") uploadBtn.textContent = "กำลังบันทึกข้อมูลวิเคราะห์...";
            if (progress.stage === "snapshot") uploadBtn.textContent = "กำลังบันทึกข้อมูลล่าสุด...";
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
        showModal("success", "คำนวณสำเร็จ", `อ่านข้อมูล ${refreshedData.totalRows} รายการ พบ Released ${refreshedData.releasedRows} รายการ${reviewText}`);

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
        const ok = await showConfirmModal("ยืนยันการล้างข้อมูล", "ต้องการล้างทั้ง Minimum Stock และข้อมูลวิเคราะห์ออกหน่วยล่าสุดใน Supabase รวมถึง cache ของแอพนี้ใช่ไหม?\n\nหลังล้างแล้วทุก Dashboard จะว่างจนกว่าจะอัปโหลดไฟล์ใหม่");
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
          showModal("success", "ล้างข้อมูลเดิมแล้ว", "ระบบล้าง snapshot Minimum Stock, ข้อมูลวิเคราะห์ออกหน่วย และ cache ของแอพนี้แล้ว");
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
let currentOutreachAnalysisData = null;
let currentOutreachFilteredRows = [];
let currentOutreachSourceSummary = [];
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260914-v2-6-2-confirm-modal-dom-fix";
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
    // v2.6.2: resolve the confirmation elements only when the modal is used.
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

  tabContent.innerHTML = `
    <div class="summary-card mb-3">
      <div class="small-muted">
        พร้อมใช้ = Available ที่ Blood Bank เท่านั้น | คล้องกับผู้ป่วย = ReadyToIssue ทุก Location | ถุงย่อย suffix .S1, .S2, ... ไม่นับเป็น standard unit | LR / Patient / Location อื่นแยกต่างหาก
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
            <th class="text-end">S ไม่รวม</th>
            <th class="text-end">อื่น/ไม่รวม</th>
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
              <td class="text-end">${r.splitSubunitExcluded ?? 0}</td>
              <td class="text-end">${r.excludedOtherLocation ?? 0}</td>
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
    <div class="stock-mobile-label">S ไม่รวม</div>
    <div class="stock-mobile-value">${r.splitSubunitExcluded ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">อื่น/ไม่รวม</div>
    <div class="stock-mobile-value">${r.excludedOtherLocation ?? 0}</div>
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


/* ---------------- Outreach blood bag outcome analysis v2.6.2 ---------------- */
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

function normalizeOutreachSourceSummary(raw) {
  return (raw || []).map(item => ({
    sourceGroup: item.source_group || item.sourceGroup || "",
    donateSource: item.donate_source || item.donateSource || "",
    received: Number(item.received || 0),
    uniqueBags: Number(item.unique_bags || item.uniqueBags || 0),
    used: Number(item.used || 0),
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
      <div class="small-muted mt-1">v2.6.2 โหลดเฉพาะสรุปจาก Supabase เพื่อให้เปิดบนมือถือได้เร็วขึ้น</div>
    </div>
  `;

  try {
    const data = await MinimumStockBackend.getOutreachAnalysis({ forceRefresh });
    currentOutreachAnalysisData = data;
    currentOutreachSourceSummary = normalizeOutreachSourceSummary(data?.report?.sources || []);
    renderOutreachAnalysis();
  } catch (err) {
    container.innerHTML = `
      <div class="hero-card mt-4 outreach-error-card">
        <h4 class="fw-bold mb-2">เปิดรายงานไม่ได้</h4>
        <div class="small-muted mb-3">${escapeOutreachHtml(err.message)}</div>
        <button class="btn btn-main" type="button" onclick="scrollToUpload()">ไปหน้า Upload File</button>
      </div>
    `;
  }
}

function renderOutreachAnalysis() {
  const container = document.getElementById("outreachOutcomeDashboard");
  const data = currentOutreachAnalysisData;
  if (!container) return;

  if (!data || !data.batchId) {
    container.innerHTML = `
      <div class="hero-card mt-4 text-center py-5">
        <div class="fs-1 mb-2">📈</div>
        <h3 class="fw-bold mb-2">ยังไม่มีข้อมูลสำหรับรายงานนี้</h3>
        <div class="small-muted mb-3">รัน SQL ของ v2.6.1 แล้วอัปโหลดไฟล์ CSV/Excel ล่าสุดจาก LIS 1 ครั้ง ระบบจะสร้างรายงานจากไฟล์เดียวกับ Minimum Stock อัตโนมัติ</div>
        <button class="btn btn-main" type="button" onclick="scrollToUpload()">ไปหน้า Upload File</button>
      </div>
    `;
    return;
  }

  const options = data.filterOptions || {};
  const f = data.filters || {};
  const validation = data.validation || {};

  container.innerHTML = `
    <div class="outreach-report-shell mt-4">
      <div class="hero-card outreach-header-card mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="forecast-pill mb-2">CQI รอบ 2 · LIS CSV</div>
            <h1 class="fw-bold mb-1">วิเคราะห์ผลถุงเลือดจากการออกหน่วย</h1>
            <div class="small-muted">ไฟล์ล่าสุด: <strong>${escapeOutreachHtml(data.fileName || "-")}</strong> · คำนวณ ${escapeOutreachHtml(formatDisplayDateTime(data.calculatedAt) || "-")}</div>
            <div class="small-muted">ช่วงข้อมูลใน LIS: ${escapeOutreachHtml(data.sourceStartDate || "-")} ถึง ${escapeOutreachHtml(data.sourceEndDate || "-")}</div>
          </div>
          <div class="d-flex flex-wrap gap-2 outreach-action-buttons no-print">
            <button id="outreachExportCsvBtn" class="btn btn-light" type="button" onclick="exportOutreachCsv()">CSV</button>
            <button id="outreachExportExcelBtn" class="btn btn-light" type="button" onclick="exportOutreachExcel()">Excel</button>
            <button class="btn btn-main" type="button" onclick="printOutreachReport()">พิมพ์ / บันทึก PDF</button>
          </div>
        </div>
      </div>

      <div class="outreach-method-note hero-card mb-3">
        <div class="fw-bold mb-1">หลักการนับในรายงานนี้</div>
        <div class="small-muted">
          LIS สามารถมี 1 BagNumber แตกเป็นหลาย ProductType ได้ จึงวิเคราะห์ผลลัพธ์ที่ระดับ <strong>BagNumber + ProductType + DateStockIn</strong> เพื่อไม่บังคับให้ RBC / Plasma / Platelet ของเลขถุงเดียวกันมีผลลัพธ์เดียวกัน
          · การ์ด “BagNumber ไม่ซ้ำ” แสดงจำนวนเลขถุงต้นทางแยกไว้ให้ตรวจสอบ
          · สถานะ “Be Transformed” แสดงเป็น “แปรรูปต่อ” แยกจากคงเหลือและทิ้ง
        </div>
      </div>

      <div class="hero-card mb-3 no-print">
        <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
          <div>
            <div class="fw-bold">ตัวกรองรายงาน</div>
            <div class="small-muted">ช่วงวันที่ใช้ DateStockIn · เมื่อเปลี่ยนตัวกรอง ระบบคำนวณสรุปที่ Supabase ไม่ดาวน์โหลดข้อมูลทั้งก้อนลงมือถือ</div>
          </div>
          <button class="btn btn-light btn-sm" type="button" onclick="resetOutreachFilters()">ล้างตัวกรอง</button>
        </div>
        <div class="outreach-filter-grid">
          <label class="outreach-filter-item">วันที่รับเข้า ตั้งแต่
            <input id="outreachDateFrom" type="date" class="form-control" min="${escapeOutreachHtml(options.minDate || "")}" max="${escapeOutreachHtml(options.maxDate || "")}" value="${escapeOutreachHtml(f.dateFrom || "")}" onchange="applyOutreachFilters()" />
          </label>
          <label class="outreach-filter-item">ถึงวันที่
            <input id="outreachDateTo" type="date" class="form-control" min="${escapeOutreachHtml(options.minDate || "")}" max="${escapeOutreachHtml(options.maxDate || "")}" value="${escapeOutreachHtml(f.dateTo || "")}" onchange="applyOutreachFilters()" />
          </label>
          <label class="outreach-filter-item">เดือน / ปี
            <input id="outreachMonth" type="month" class="form-control" onchange="applyOutreachMonthFilter()" />
          </label>
          <label class="outreach-filter-item">กลุ่มแหล่งรับเข้า
            <select id="outreachSourceGroup" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.sourceGroups || [], f.sourceGroup || "", "ทั้งหมด")}</select>
          </label>
          <label class="outreach-filter-item">จุดออกหน่วย / DonateSource
            <select id="outreachSource" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.sources || [], f.source || "", "ทุกจุด")}</select>
          </label>
          <label class="outreach-filter-item">ProductType
            <select id="outreachProduct" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.products || [], f.productType || "", "ทุกชนิด")}</select>
          </label>
          <label class="outreach-filter-item">Blood Group
            <select id="outreachBloodGroup" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.bloodGroups || [], f.bloodGroup || "", "ทุกหมู่")}</select>
          </label>
          <label class="outreach-filter-item">Rh
            <select id="outreachRh" class="form-select" onchange="applyOutreachFilters()">${renderSelectOptions(options.rhs || [], f.rh || "", "ทุก Rh")}</select>
          </label>
        </div>
        <div id="outreachFilterLoading" class="small-muted mt-3" style="display:none;">กำลังคำนวณตามตัวกรอง...</div>
      </div>

      <div id="outreachValidationBox"></div>
      <div id="outreachSummaryCards"></div>
      <div id="outreachCharts"></div>
      <div id="outreachSourceTable"></div>
    </div>
  `;

  renderOutreachValidation(validation, data.reviewRows || []);
  renderOutreachReportSections(data.report || {});
}

function renderOutreachValidation(validation, reviewRows) {
  const box = document.getElementById("outreachValidationBox");
  if (!box) return;
  const issueCount = Number(validation?.issueCount || 0);
  const duplicateComponentCount = Number(validation?.duplicateComponentCount || 0);
  const multiProductBagCount = Number(validation?.multiProductBagCount || 0);
  const excludedRawRowCount = Number(validation?.excludedRawRowCount || 0);

  if (!issueCount) {
    box.innerHTML = `
      <div class="outreach-validation-card is-ok mb-3">
        <strong>✓ ตรวจสอบโครงสร้าง LIS แล้ว</strong>
        <span>BagNumber ที่มีหลาย ProductType ${multiProductBagCount.toLocaleString()} เลขถือเป็นโครงสร้างปกติ · ตัดข้อมูลสอน/ทดสอบ ${excludedRawRowCount.toLocaleString()} แถวออกจากการวิเคราะห์</span>
      </div>
    `;
    return;
  }

  const issues = validation.issues || [];
  const truncated = Boolean(validation.issuesTruncated);
  box.innerHTML = `
    <details class="outreach-validation-card mb-3 no-print">
      <summary>
        <strong>⚠ มีข้อมูลที่ควรตรวจสอบ ${issueCount.toLocaleString()} รายการ</strong>
        <span>ซ้ำระดับผลิตภัณฑ์ ${duplicateComponentCount.toLocaleString()} กลุ่ม · BagNumber หลาย ProductType ${multiProductBagCount.toLocaleString()} (ปกติ) · วันที่ผิด ${Number(validation.invalidDateCount || 0).toLocaleString()} · Status ไม่รู้จัก ${Number(validation.unknownStatusCount || 0).toLocaleString()} · DonateSource ต้องตรวจ ${Number(validation.unknownSourceCount || 0).toLocaleString()} · แหล่งรับเข้าขัดแย้ง ${Number(validation.sourceConflictCount || 0).toLocaleString()} · ผลลัพธ์ขัดแย้ง ${Number(validation.outcomeConflictCount || 0).toLocaleString()}</span>
      </summary>
      <div class="small-muted mt-2">ข้อมูลสอน/ทดสอบถูกตัดออก ${excludedRawRowCount.toLocaleString()} แถว และไม่เข้า KPI</div>
      <div class="outreach-validation-list mt-3">
        ${issues.map(item => `<div class="outreach-validation-item"><strong>${escapeOutreachHtml(item.bagNumber || "-")}</strong><span>${escapeOutreachHtml(item.message || "")}</span></div>`).join("")}
        ${truncated ? `<div class="small-muted mt-2">แสดงเฉพาะ 500 รายการแรกในกล่องนี้</div>` : ""}
      </div>
      ${(reviewRows || []).length ? `
        <div class="fw-bold mt-3 mb-2">ตัวอย่างผลิตภัณฑ์ที่ถูกทำเครื่องหมาย “ต้องตรวจสอบ”</div>
        <div class="table-responsive outreach-review-table-wrap">
          <table class="table table-sm align-middle mb-0">
            <thead><tr><th>BagNumber</th><th>ProductType</th><th>DonateSource</th><th>กลุ่ม</th><th>ผลลัพธ์</th></tr></thead>
            <tbody>${reviewRows.map(row => `<tr><td class="fw-bold">${escapeOutreachHtml(row.bagNumber)}</td><td>${escapeOutreachHtml(row.productType || "-")}</td><td>${escapeOutreachHtml(row.donateSource || "-")}</td><td>${escapeOutreachHtml(row.sourceGroup)}</td><td>${escapeOutreachHtml(outcomeLabel(row.outcomeCode))}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="small-muted mt-2">แสดงตัวอย่างไม่เกิน 100 รายการ · รายการที่จัดแหล่งไม่ได้จะไม่ถูกนำมารวมในยอดจนกว่าจะตรวจสอบ</div>
      ` : ""}
    </details>
  `;
}

function getOutreachFilterValues() {
  const read = id => document.getElementById(id)?.value || "";
  return {
    dateFrom: read("outreachDateFrom"),
    dateTo: read("outreachDateTo"),
    sourceGroup: read("outreachSourceGroup"),
    source: read("outreachSource"),
    productType: read("outreachProduct"),
    bloodGroup: read("outreachBloodGroup"),
    rh: read("outreachRh")
  };
}

function applyOutreachMonthFilter() {
  const month = document.getElementById("outreachMonth")?.value || "";
  const from = document.getElementById("outreachDateFrom");
  const to = document.getElementById("outreachDateTo");
  if (month && from && to) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    from.value = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    to.value = `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  applyOutreachFilters();
}

function resetOutreachFilters() {
  ["outreachDateFrom", "outreachDateTo", "outreachMonth", "outreachSourceGroup", "outreachSource", "outreachProduct", "outreachBloodGroup", "outreachRh"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });
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
    renderOutreachReportSections(data.report || {});
  } catch (err) {
    showModal("error", "คำนวณตัวกรองไม่สำเร็จ", err.message);
  } finally {
    if (requestId === outreachRequestSeq && loading) loading.style.display = "none";
  }
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
  const cards = [
    ["ผลิตภัณฑ์รับเข้าทั้งหมด", s.received, "รายการ"],
    ["BagNumber ไม่ซ้ำ", s.uniqueBags, "เลขถุง"],
    ["หาเอง – รับบริจาคในโรงพยาบาล", s.selfInhouse, "รายการ"],
    ["หาเอง – ออกหน่วย", s.selfOutreach, "รายการ"],
    ["กาชาดไทย", s.trc, "รายการ"],
    ["รับจากโรงพยาบาลอื่น", s.otherHospital, "รายการ"],
    ["นำไปใช้/จ่ายออก", s.used, "รายการ"],
    ["ทิ้ง/ทำลาย", s.destroyed, "รายการ"],
    ["แปรรูปต่อ", s.transformed, "รายการ"],
    ["ยังไม่ทราบผล/คงเหลือ", s.unresolved, "รายการ"],
    ["ร้อยละนำไปใช้", s.usePercent.toFixed(1), "%"],
    ["ร้อยละทิ้ง", s.destroyPercent.toFixed(1), "%"]
  ];

  box.innerHTML = `
    <div class="outreach-summary-grid mb-3">
      ${cards.map(([label, value, unit]) => `
        <div class="outreach-summary-card">
          <div class="small-muted">${escapeOutreachHtml(label)}</div>
          <div class="outreach-summary-value">${escapeOutreachHtml(unit === "%" ? value : (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value))}</div>
          <div class="outreach-summary-unit">${unit}</div>
        </div>
      `).join("")}
    </div>
    ${s.conflicts ? `<div class="outreach-conflict-note mb-3">มี <strong>${s.conflicts.toLocaleString()}</strong> ผลิตภัณฑ์ที่ข้อมูลขัดแย้ง ระบบนับไว้ใน “รับเข้า” แต่ไม่เอาไปนับซ้ำเป็นใช้/ทิ้ง/แปรรูป/คงเหลือ</div>` : ""}
  `;
}

function renderOutreachCharts(groupData, sourceSummary) {
  const box = document.getElementById("outreachCharts");
  if (!box) return;

  const groupOrder = [OUTREACH_GROUP_SELF_INHOUSE, OUTREACH_GROUP_SELF_OUTREACH, OUTREACH_GROUP_TRC, OUTREACH_GROUP_OTHER_HOSPITAL];
  const map = new Map((groupData || []).map(item => [item.sourceGroup, item]));
  const groups = groupOrder.map(name => map.get(name) || { sourceGroup: name, received: 0, used: 0, destroyed: 0, transformed: 0, unresolved: 0, conflicts: 0 });
  const maxGroup = Math.max(1, ...groups.map(item => item.received));
  const topSources = (sourceSummary || []).slice(0, 12);
  const maxSource = Math.max(1, ...topSources.map(item => item.received));
  const topDiscard = [...(sourceSummary || [])].sort((a, b) => b.destroyPercent - a.destroyPercent || b.received - a.received).slice(0, 12);

  box.innerHTML = `
    <div class="outreach-chart-grid mb-3">
      <div class="hero-card outreach-chart-card">
        <h5 class="fw-bold mb-1">เปรียบเทียบแหล่งรับเข้า</h5>
        <div class="small-muted mb-3">รวม 4 กลุ่มตามการใช้งานจริงของหน่วย</div>
        ${groups.map(item => `
          <div class="outreach-chart-row">
            <div class="outreach-chart-label">${escapeOutreachHtml(item.sourceGroup)} <strong>${item.received.toLocaleString()}</strong></div>
            <div class="outreach-stacked-bar">
              <span class="bar-used" style="width:${(item.used / maxGroup) * 100}%" title="ใช้ ${item.used}"></span>
              <span class="bar-destroyed" style="width:${(item.destroyed / maxGroup) * 100}%" title="ทิ้ง ${item.destroyed}"></span>
              <span class="bar-transformed" style="width:${(item.transformed / maxGroup) * 100}%" title="แปรรูปต่อ ${item.transformed}"></span>
              <span class="bar-unresolved" style="width:${(item.unresolved / maxGroup) * 100}%" title="คงเหลือ/อื่น ${item.unresolved}"></span>
              <span class="bar-conflict" style="width:${(item.conflicts / maxGroup) * 100}%" title="ขัดแย้ง ${item.conflicts}"></span>
            </div>
          </div>
        `).join("")}
        <div class="outreach-legend"><span><i class="legend-used"></i> ใช้/จ่ายออก</span><span><i class="legend-destroyed"></i> ทิ้ง/ทำลาย</span><span><i class="legend-transformed"></i> แปรรูปต่อ</span><span><i class="legend-unresolved"></i> ยังไม่ทราบผล</span><span><i class="legend-conflict"></i> ข้อมูลขัดแย้ง</span></div>
      </div>

      <div class="hero-card outreach-chart-card">
        <h5 class="fw-bold mb-1">รับเข้า / ใช้ / ทิ้ง ตามจุด</h5>
        <div class="small-muted mb-3">แสดง 12 จุดที่มีจำนวนรับเข้าสูงสุดตามตัวกรอง</div>
        <div class="outreach-bars-list">
          ${topSources.map(item => `
            <div class="outreach-source-bar-row">
              <div class="outreach-source-bar-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
              <div class="outreach-mini-bars">
                <span class="mini-received" style="width:${(item.received / maxSource) * 100}%" title="รับเข้า ${item.received}"></span>
                <span class="mini-used" style="width:${(item.used / maxSource) * 100}%" title="ใช้ ${item.used}"></span>
                <span class="mini-destroyed" style="width:${(item.destroyed / maxSource) * 100}%" title="ทิ้ง ${item.destroyed}"></span>
              </div>
              <div class="small-muted text-end">${item.received.toLocaleString()}</div>
            </div>
          `).join("") || `<div class="small-muted">ไม่มีข้อมูลตามตัวกรอง</div>`}
        </div>
      </div>
    </div>

    <div class="hero-card outreach-chart-card mb-3">
      <h5 class="fw-bold mb-1">ร้อยละทิ้ง/ทำลายของแต่ละจุด</h5>
      <div class="small-muted mb-3">ร้อยละทิ้ง = ทิ้ง/ทำลาย ÷ ผลิตภัณฑ์รับเข้าตามตัวกรอง × 100</div>
      <div class="outreach-percent-bars">
        ${topDiscard.map(item => `
          <div class="outreach-percent-row">
            <div class="outreach-percent-name" title="${escapeOutreachHtml(item.donateSource)}">${escapeOutreachHtml(item.donateSource)}</div>
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
    <div class="hero-card mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h5 class="fw-bold mb-1">สรุปตามจุดออกหน่วย / แหล่งรับเข้า</h5>
          <div class="small-muted">เรียงจากจำนวนรับเข้าสูงสุด · กดที่แถวเพื่อดูรายละเอียดระดับผลิตภัณฑ์</div>
        </div>
        <div class="small-muted">${(sourceSummary || []).length.toLocaleString()} จุด / แหล่งรับเข้า</div>
      </div>
      <div class="table-responsive outreach-summary-table-wrap">
        <table class="table outreach-summary-table align-middle">
          <thead>
            <tr>
              <th>จุดออกหน่วย / แหล่งรับเข้า</th>
              <th>กลุ่มแหล่งรับเข้า</th>
              <th class="text-end">รับเข้า</th>
              <th class="text-end">BagNumber</th>
              <th class="text-end">ใช้/จ่ายออก</th>
              <th class="text-end">ทิ้ง/ทำลาย</th>
              <th class="text-end">แปรรูปต่อ</th>
              <th class="text-end">ยังไม่ทราบผล</th>
              <th class="text-end">% ใช้</th>
              <th class="text-end">% ทิ้ง</th>
            </tr>
          </thead>
          <tbody>
            ${(sourceSummary || []).map((item, index) => `
              <tr class="outreach-click-row" onclick="openOutreachSourceDetail(${index}, 1)">
                <td class="fw-bold">${escapeOutreachHtml(item.donateSource)}</td>
                <td><span class="outreach-source-badge">${escapeOutreachHtml(item.sourceGroup)}</span></td>
                <td class="text-end fw-bold">${item.received.toLocaleString()}</td>
                <td class="text-end">${item.uniqueBags.toLocaleString()}</td>
                <td class="text-end">${item.used.toLocaleString()}</td>
                <td class="text-end">${item.destroyed.toLocaleString()}</td>
                <td class="text-end">${item.transformed.toLocaleString()}</td>
                <td class="text-end">${item.unresolved.toLocaleString()}</td>
                <td class="text-end">${item.usePercent.toFixed(1)}%</td>
                <td class="text-end">${item.destroyPercent.toFixed(1)}%</td>
              </tr>
            `).join("") || `<tr><td colspan="10" class="text-center small-muted py-4">ไม่มีข้อมูลตามตัวกรอง</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
                <td><span class="outreach-outcome-badge ${outreachOutcomeClass(row.outcomeCode)}">${escapeOutreachHtml(outcomeLabel(row.outcomeCode))}</span></td>
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
    FinalOutcome: outcomeLabel(row.outcomeCode)
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
