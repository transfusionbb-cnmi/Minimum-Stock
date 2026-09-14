(function () {
  "use strict";

  const EXCEL_COL = {
    bagNumber: 0,
    productType: 1,
    bloodGroup: 2,
    rh: 3,
    location: 4,
    sex: 5,
    donateSource: 6,
    collectDate: 7,
    expireDate: 8,
    status: 9,
    dateStockIn: 10,
    dateStockOut: 11,
    destroyReason: 12
  };

  let cachedClient = null;
  let cachedSummarySnapshot = null;
  let cachedFullSnapshot = null;
  let cachedOutreachSnapshot = null;

  const SUMMARY_SELECT = [
    "id",
    "created_at",
    "file_name",
    "calculated_at",
    "total_rows",
    "released_rows",
    "result_rows",
    "start_date",
    "end_date",
    "results"
  ].join(",");

  // ระบุเฉพาะคอลัมน์เดิม เพื่อไม่ดึง outreach_analysis ก้อนใหญ่ตอนเปิด Mobile Unit Planning
  const FULL_SELECT = [
    "id",
    "created_at",
    "file_name",
    "calculated_at",
    "total_rows",
    "released_rows",
    "result_rows",
    "start_date",
    "end_date",
    "results",
    "stock_rows",
    "usage_history_rows",
    "in_history_rows",
    "raw_preview"
  ].join(",");

  const OUTREACH_SELECT = [
    "id",
    "created_at",
    "file_name",
    "calculated_at",
    "outreach_analysis"
  ].join(",");

  function getConfig() {
    return window.MINIMUM_STOCK_CONFIG || {};
  }

  function isConfigured() {
    const cfg = getConfig();
    return Boolean(
      window.supabase &&
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_ANON_KEY &&
      cfg.SUPABASE_URL.startsWith("https://") &&
      !cfg.SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
      !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
      cfg.SUPABASE_ANON_KEY.length > 30
    );
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (cachedClient) return cachedClient;

    const cfg = getConfig();
    cachedClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return cachedClient;
  }

  function getTableName() {
    return getConfig().SNAPSHOT_TABLE || "minimum_stock_snapshots";
  }

  function clearCachedSnapshotState() {
    cachedSummarySnapshot = null;
    cachedFullSnapshot = null;
    cachedOutreachSnapshot = null;
  }

  async function clearAllSnapshots(options = {}) {
    clearCachedSnapshotState();

    if (!isConfigured()) {
      return {
        ok: true,
        message: "ล้าง cache ฝั่งแอพแล้ว แต่ยังไม่ได้ตั้งค่า Supabase",
        deleted: 0
      };
    }

    const client = getClient();
    if (!client) {
      return { ok: true, message: "ไม่พบ Supabase client", deleted: 0 };
    }

    // แนะนำให้รันไฟล์ supabase-clear-before-upload.sql เพื่อสร้าง RPC นี้
    const { data, error } = await client.rpc("minimum_stock_clear_all_snapshots");

    if (error) {
      // fallback เผื่อบาง Project เปิด delete policy ไว้แล้ว
      const { error: directDeleteError } = await client
        .from(getTableName())
        .delete()
        .not("id", "is", null);

      if (directDeleteError) {
        throw new Error(
          "ล้างข้อมูลเดิมใน Supabase ไม่สำเร็จ: " +
          (error.message || directDeleteError.message) +
          " | ให้รันไฟล์ supabase-clear-before-upload.sql ใน SQL Editor ก่อน"
        );
      }

      return { ok: true, message: "ล้างข้อมูลเดิมแล้ว", deleted: null };
    }

    return data || { ok: true, message: "ล้างข้อมูลเดิมแล้ว", deleted: null };
  }

  async function fallbackGetDashboard(gasWebAppUrl) {
    if (!gasWebAppUrl) throw new Error("ยังไม่ได้ตั้งค่า Supabase และไม่มี GAS_WEB_APP_URL สำรอง");
    const res = await fetch(gasWebAppUrl + "?action=getDashboard");
    return res.json();
  }

  async function fallbackMobilePlanning(gasWebAppUrl, selectedDate, planDays) {
    if (!gasWebAppUrl) throw new Error("ยังไม่ได้ตั้งค่า Supabase และไม่มี GAS_WEB_APP_URL สำรอง");
    const url =
      gasWebAppUrl +
      "?action=getMobilePlanning&selectedDate=" +
      encodeURIComponent(selectedDate || todayYmd()) +
      "&planDays=" +
      encodeURIComponent(planDays || 14);
    const res = await fetch(url);
    return res.json();
  }

  async function fallbackUploadExcel(file, gasWebAppUrl) {
    if (!gasWebAppUrl) throw new Error("ยังไม่ได้ตั้งค่า Supabase และไม่มี GAS_WEB_APP_URL สำรอง");

    const base64 = await fileToBase64(file);
    const formData = new FormData();
    formData.append("action", "uploadExcel");
    formData.append("fileName", file.name);
    formData.append("fileBase64", base64);

    const res = await fetch(gasWebAppUrl, {
      method: "POST",
      body: formData
    });
    return res.json();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
      reader.readAsDataURL(file);
    });
  }

  function todayYmd() {
    return formatYmd(new Date());
  }

  function formatYmd(date) {
    if (!(date instanceof Date) || isNaN(date)) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function excelSerialToDate(value) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Number(value) * 86400000);
  }

  function normalizeAnyDate(value) {
    if (!value) return "";

    if (value instanceof Date && !isNaN(value)) {
      return formatYmd(value);
    }

    if (typeof value === "number" && isFinite(value)) {
      return formatYmd(excelSerialToDate(value));
    }

    const text = String(value).trim();
    if (!text) return "";

    const dateOnly = text.split(" ")[0];
    const parts = dateOnly.split(/[\/\-]/);
    if (parts.length !== 3) return "";

    let d;
    let m;
    let y;

    if (String(parts[0]).length === 4) {
      y = Number(parts[0]);
      m = Number(parts[1]);
      d = Number(parts[2]);
    } else {
      d = Number(parts[0]);
      m = Number(parts[1]);
      y = Number(parts[2]);
    }

    if (y > 2400) y -= 543;

    const result = new Date(y, m - 1, d);
    if (isNaN(result)) return "";
    return formatYmd(result);
  }

  function normalizeDateStockOut(value) {
    return normalizeAnyDate(value);
  }

  function parseYmdDate(value) {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value)) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const cleanText = normalizeAnyDate(value);
    if (!cleanText) return null;

    const parts = cleanText.split("-");
    if (parts.length !== 3) return null;

    const result = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(result) ? null : result;
  }

  function buildMinimumStockGroups() {
    return [
      {
        key: "PRC",
        componentGroup: "Leukocyte Poor PRC / Leukocyte Depleted PRC",
        type: "LPRC / LDPRC",
        useBloodGroup: true,
        bloodGroups: ["A", "B", "O", "AB"],
        unitMultiplier: 1
      },
      {
        key: "FFP",
        componentGroup: "Fresh Frozen Plasma",
        type: "FFP",
        useBloodGroup: true,
        bloodGroups: ["A", "B", "O", "AB"],
        unitMultiplier: 1
      },
      {
        key: "LDPPC",
        componentGroup: "Leukocyte Depleted Pooled Platelet Concentrate",
        type: "LDPPC",
        useBloodGroup: true,
        bloodGroups: ["A", "B", "O", "AB"],
        unitMultiplier: 1
      },
      {
        key: "CRYO",
        componentGroup: "Cryoprecipitate",
        type: "Cryo",
        useBloodGroup: false,
        bloodGroups: ["ไม่แยกหมู่"],
        unitMultiplier: 10
      },
      {
        key: "SDP",
        componentGroup: "Single Donor Platelet",
        type: "SDP",
        useBloodGroup: true,
        bloodGroups: ["A", "B", "O", "AB"],
        unitMultiplier: 1
      }
    ];
  }

  function matchProductGroup(productType) {
    const p = String(productType || "").trim().toLowerCase();
    const groups = buildMinimumStockGroups();

    // กลุ่ม PRC ของแอปนี้ต้องนับเฉพาะ LPRC / LDPRC เท่านั้น
    // ห้ามใช้คำกว้าง ๆ ว่า "pack red cell" เพราะจะดึง PRC ชนิดอื่นเข้ามารวม
    // และทำให้ยอด LPRC/LDPRC สูงกว่าจำนวนถุงจริง
    const isLprcOrLdprc =
      p.includes("leukocyte poor prc") ||
      p.includes("leukocyte-poor prc") ||
      p.includes("leukocyte poor packed red cell") ||
      p.includes("leukocyte-poor packed red cell") ||
      p.includes("leukocyte depleted prc") ||
      p.includes("leukocyte-depleted prc") ||
      p.includes("leukocyte depleted pack red cell") ||
      p.includes("leukocyte depleted packed red cell") ||
      /(^|[^a-z0-9])lprc([^a-z0-9]|$)/i.test(p) ||
      /(^|[^a-z0-9])ldprc([^a-z0-9]|$)/i.test(p);

    if (isLprcOrLdprc) {
      return groups.find(g => g.key === "PRC");
    }

    if (p.includes("fresh frozen plasma (female)")) return null;

    if (
      p.includes("fresh frozen plasma") ||
      p.includes("frozen plasma") ||
      p.includes("ffp")
    ) {
      return groups.find(g => g.key === "FFP");
    }

    if (p.includes("single donor platelet") || p.includes("sdp")) {
      return groups.find(g => g.key === "SDP");
    }

    if (
      p.includes("leukocyte depleted pooled platelet concentrate") ||
      p.includes("pooled platelet concentrate") ||
      p.includes("ldppc")
    ) {
      return groups.find(g => g.key === "LDPPC");
    }

    // Cryo-Removed Plasma เป็น plasma ที่เอา cryoprecipitate ออกแล้ว ไม่ใช่ Cryoprecipitate
    if (p.includes("cryo-removed plasma") || p.includes("cryo removed plasma")) return null;

    if (p.includes("cryo")) return groups.find(g => g.key === "CRYO");

    return null;
  }

  function normalizeBagKey(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function isSplitSubunitBagNumber(value) {
    // ถุงย่อย/แบ่งส่วน เช่น .S1, .S2, .S10 ไม่ถือเป็น 1 standard unit
    // ส่วน suffix อื่น เช่น .P5 ของ pooled product ยังนับตามปกติ
    return /\.S\d+$/i.test(normalizeBagKey(value));
  }

  function normalizeCurrentStockLocation(value) {
    const text = String(value || "").trim().toLowerCase();

    if (text === "blood bank" || text.includes("คลังเลือด")) return "BLOOD_BANK";
    if (text === "lr" || /(^|[^a-z])lr([^a-z]|$)/.test(text)) return "LR";
    if (text.includes("patient") || text.includes("ผู้ป่วย")) return "PATIENT";

    return "OTHER";
  }

  function currentStockStatusPriority(status) {
    if (status === "ReadyToIssue") return 4;
    if (status === "Quarantine") return 3;
    if (status === "In Screening Process") return 3;
    if (status === "Available") return 2;
    return 0;
  }

  function currentStockLocationPriority(location) {
    const category = normalizeCurrentStockLocation(location);
    if (category === "PATIENT") return 4;
    if (category === "LR") return 3;
    if (category === "BLOOD_BANK") return 2;
    return 1;
  }

  function collectUniqueCurrentStockRows(dataRows) {
    const unique = new Map();

    dataRows.forEach((row, rowIndex) => {
      const bagNumber = row[EXCEL_COL.bagNumber];
      const productType = String(row[EXCEL_COL.productType] || "").trim();
      const bloodGroup = String(row[EXCEL_COL.bloodGroup] || "").trim();
      const location = String(row[EXCEL_COL.location] || "").trim();
      const status = String(row[EXCEL_COL.status] || "").trim();

      const isCurrentStock =
        status === "Available" ||
        status === "In Screening Process" ||
        status === "Quarantine" ||
        status === "ReadyToIssue";
      if (!isCurrentStock) return;

      const matchedGroup = matchProductGroup(productType);
      if (!matchedGroup) return;

      const targetBloodGroup = matchedGroup.useBloodGroup ? bloodGroup : "ไม่แยกหมู่";
      const normalizedBag = normalizeBagKey(bagNumber);
      // De-duplicate เฉพาะเลขถุงที่ตรงกันทั้งข้อความเท่านั้น
      // suffix .S ยังเก็บเป็นรายการแยกเพื่อรายงานจำนวนที่ถูกตัดออก แต่จะไม่รวมใน standard unit
      // ถ้าไม่มีเลขถุง ห้ามรวมหลายแถวเป็นถุงเดียวกัน จึงใช้เลขแถวเป็น fallback
      const key = matchedGroup.key + "||" + targetBloodGroup + "||" + (normalizedBag || "ROW_" + rowIndex);
      const candidate = { row, matchedGroup, targetBloodGroup, status, location };
      const existing = unique.get(key);

      if (!existing) {
        unique.set(key, candidate);
        return;
      }

      // ถ้าถุงเดียวซ้ำหลายแถว ให้เลือกสถานะที่จำกัดการใช้งานมากกว่า
      // เพื่อไม่ให้ถุงเดียวถูกนับซ้ำทั้ง Available และ ReadyToIssue/Quarantine
      const candidateStatusPriority = currentStockStatusPriority(status);
      const existingStatusPriority = currentStockStatusPriority(existing.status);
      if (
        candidateStatusPriority > existingStatusPriority ||
        (
          candidateStatusPriority === existingStatusPriority &&
          currentStockLocationPriority(location) > currentStockLocationPriority(existing.location)
        )
      ) {
        unique.set(key, candidate);
      }
    });

    return Array.from(unique.values());
  }

  function calculateMinimumStock(dataRows) {
    const calcDays = Number(getConfig().CALC_DAYS || 180);
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - calcDays + 1);

    const groups = buildMinimumStockGroups();
    const bucket = {};
    const uniqueCurrentStockRows = collectUniqueCurrentStockRows(dataRows);

    groups.forEach(g => {
      if (!bucket[g.key]) {
        bucket[g.key] = {
          componentGroup: g.componentGroup,
          type: g.type,
          useBloodGroup: g.useBloodGroup,
          bloodGroups: {}
        };
      }

      g.bloodGroups.forEach(bg => {
        bucket[g.key].bloodGroups[bg] = {
          daily: {},
          totalUsed: 0,
          available: 0,
          lrSpare: 0,
          patientManual: 0,
          pendingScreening: 0,
          readyToIssue: 0,
          excludedOtherLocation: 0,
          splitSubunitExcluded: 0
        };
      });
    });

    dataRows.forEach(row => {
      const bagNumber = row[EXCEL_COL.bagNumber];
      const productType = String(row[EXCEL_COL.productType] || "").trim();
      const bloodGroup = String(row[EXCEL_COL.bloodGroup] || "").trim();
      const location = String(row[EXCEL_COL.location] || "").trim();
      const status = String(row[EXCEL_COL.status] || "").trim();
      const dateStockOut = row[EXCEL_COL.dateStockOut];

      const matchedGroup = matchProductGroup(productType);
      if (!matchedGroup) return;

      const targetBloodGroup = matchedGroup.useBloodGroup ? bloodGroup : "ไม่แยกหมู่";
      if (!bucket[matchedGroup.key]) return;
      if (!bucket[matchedGroup.key].bloodGroups[targetBloodGroup]) return;

      const item = bucket[matchedGroup.key].bloodGroups[targetBloodGroup];
      const releasedMultiplier = matchedGroup.unitMultiplier || 1;

      // Current stock จะนับจากรายการที่ de-duplicate ตามเลขถุงด้านล่าง
      // ใน loop นี้ใช้เฉพาะประวัติ Released เพื่อคำนวณ Minimum Stock
      if (status !== "Released") return;

      const cleanDateText = normalizeDateStockOut(dateStockOut);
      if (!cleanDateText) return;

      const cleanDate = parseYmdDate(cleanDateText);
      if (!cleanDate) return;
      if (cleanDate < startDate || cleanDate > endDate) return;

      item.totalUsed += releasedMultiplier;
      item.daily[cleanDateText] = (item.daily[cleanDateText] || 0) + releasedMultiplier;
    });

    uniqueCurrentStockRows.forEach(record => {
      const { matchedGroup, targetBloodGroup, status, location } = record;
      const item = bucket[matchedGroup.key]?.bloodGroups?.[targetBloodGroup];
      if (!item) return;

      const bagNumber = record.row[EXCEL_COL.bagNumber];
      const locationCategory = normalizeCurrentStockLocation(location);

      if (isSplitSubunitBagNumber(bagNumber)) {
        item.splitSubunitExcluded += 1;
        return;
      }

      if (status === "Available") {
        if (locationCategory === "BLOOD_BANK") {
          item.available += 1;
        } else if (locationCategory === "LR") {
          item.lrSpare += 1;
        } else if (locationCategory === "PATIENT") {
          item.patientManual += 1;
        } else {
          // Donor / Test / ER / ค่าว่าง และ Location อื่น ไม่ใช่ stock พร้อมใช้ในคลังเลือด
          item.excludedOtherLocation += 1;
        }
        return;
      }

      if (status === "In Screening Process" || status === "Quarantine") {
        if (locationCategory === "BLOOD_BANK") {
          item.pendingScreening += 1;
        } else {
          item.excludedOtherLocation += 1;
        }
        return;
      }

      if (status === "ReadyToIssue") {
        // "คล้องกับผู้ป่วย" อ้างอิงจากสถานะ ReadyToIssue โดยตรง
        // ไม่จำกัด Location เพราะรายการที่เตรียมให้ผู้ป่วยอาจถูกบันทึกเป็น
        // Blood Bank, Patient, LR หรือ Location อื่นตาม workflow หน้างาน
        // หากกรองเฉพาะ Blood Bank จะทำให้ยอดคล้องจริงขาดไปบางถุง
        item.readyToIssue += 1;
      }
    });

    const results = [];

    Object.keys(bucket).forEach(groupKey => {
      const group = bucket[groupKey];

      Object.keys(group.bloodGroups).forEach(bg => {
        const item = group.bloodGroups[bg];
        const totalUsed = item.totalUsed;
        const dailyValues = Object.values(item.daily);
        const maxDay = dailyValues.length ? Math.max(...dailyValues) : 0;
        const avgDay = totalUsed / calcDays;
        const minimumStock = Math.ceil(Math.max(avgDay * 2, maxDay));

        const available = item.available;
        const lrSpare = item.lrSpare;
        const patientManual = item.patientManual;
        const pendingScreening = item.pendingScreening;
        const readyToIssue = item.readyToIssue;
        const excludedOtherLocation = item.excludedOtherLocation;
        const splitSubunitExcluded = item.splitSubunitExcluded;

        // available ถูกจำกัดให้เป็น Status=Available และ Location=Blood Bank แล้ว
        // LR / Patient / ReadyToIssue เป็นคนละกลุ่ม จึงห้ามนำมาหักซ้ำ
        const netAvailable = available;
        const gap = netAvailable - minimumStock;

        let alertLevel = "Normal";
        let suggestion = "เพียงพอ";
        let suggestedAction = "ติดตาม stock ตามรอบปกติ";

        if (gap <= -5) {
          alertLevel = "Critical";
          suggestion = "ต่ำกว่า Minimum มาก";
          suggestedAction = "ควรพิจารณาเติม stock โดยเร็ว";
        } else if (gap < 0) {
          alertLevel = "Warning";
          suggestion = "ต่ำกว่า Minimum";
          suggestedAction = "ควรพิจารณาเติม stock";
        } else if (gap === 0) {
          alertLevel = "Watch";
          suggestion = "พอดี Minimum";
          suggestedAction = "ควรเฝ้าระวังใกล้ชิด";
        } else if (minimumStock > 0 && gap > minimumStock * 3) {
          alertLevel = "Overstock";
          suggestion = "สูงกว่า Minimum มาก";
          suggestedAction = "ระวังหมดอายุ / พิจารณาชะลอการเติม stock";
        }

        results.push({
          componentGroup: group.componentGroup,
          bloodGroup: bg,
          totalUsed,
          countDays: calcDays,
          maxDay,
          avgDay: Number(avgDay.toFixed(2)),
          minimumStock,
          available,
          lrSpare,
          patientManual,
          pendingScreening,
          readyToIssue,
          excludedOtherLocation,
          splitSubunitExcluded,
          netAvailable,
          gap,
          suggestion,
          alertLevel,
          suggestedAction,
          type: group.type
        });
      });
    });

    return {
      startDate: formatYmd(startDate),
      endDate: formatYmd(endDate),
      results
    };
  }

  function isExcludedDonateSource(value) {
    const text = String(value || "").trim();
    const excludedSources = [
      "External Quality Assessment (EQA)",
      "Test สอนแพทย์ พยาบาล",
      "ห้องรับบริจาคโลหิต รามาธิบดีจักรีนฤบดินทร์ (1B6)"
    ];
    return excludedSources.includes(text);
  }

  function mapDonateSource(value) {
    const text = String(value || "").trim();
    if (text === "ศูนย์บริการโลหิตแห่งชาติ สภากาชาดไทย") return "TRC";
    return "CNMI";
  }

  function buildLatestStockDetail(dataRows) {
    const output = [];
    const uniqueCurrentStockRows = collectUniqueCurrentStockRows(dataRows);

    uniqueCurrentStockRows.forEach(record => {
      const row = record.row;
      const bagNumber = row[EXCEL_COL.bagNumber];
      const productType = String(row[EXCEL_COL.productType] || "").trim();
      const bloodGroupRaw = String(row[EXCEL_COL.bloodGroup] || "").trim();
      const rh = String(row[EXCEL_COL.rh] || "").trim();
      const location = String(row[EXCEL_COL.location] || "").trim();
      const donateSourceRaw = String(row[EXCEL_COL.donateSource] || "").trim();
      const collectDate = row[EXCEL_COL.collectDate];
      const expireDate = row[EXCEL_COL.expireDate];
      const status = String(row[EXCEL_COL.status] || "").trim();
      const dateStockIn = row[EXCEL_COL.dateStockIn];
      const dateStockOut = row[EXCEL_COL.dateStockOut];

      if (!bagNumber && !productType && !status) return;
      if (isSplitSubunitBagNumber(bagNumber)) return;

      const matchedGroup = record.matchedGroup;
      if (isExcludedDonateSource(donateSourceRaw)) return;

      output.push({
        bagNumber: String(bagNumber || ""),
        productType,
        componentGroup: matchedGroup.componentGroup,
        type: matchedGroup.type,
        bloodGroup: matchedGroup.useBloodGroup ? bloodGroupRaw : "ไม่แยกหมู่",
        rh,
        location,
        donateSourceRaw,
        sourceGroup: mapDonateSource(donateSourceRaw),
        collectDate: normalizeAnyDate(collectDate),
        expireDate: normalizeAnyDate(expireDate),
        status,
        dateStockIn: normalizeAnyDate(dateStockIn),
        dateStockOut,
        cleanDateStockOut: normalizeDateStockOut(dateStockOut)
      });
    });

    return output;
  }

  function buildLatestUsageHistory(dataRows) {
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 2);
    const bucket = {};

    dataRows.forEach(row => {
      const bagNumber = row[EXCEL_COL.bagNumber];
      const productType = String(row[EXCEL_COL.productType] || "").trim();
      const bloodGroup = String(row[EXCEL_COL.bloodGroup] || "").trim();
      const status = String(row[EXCEL_COL.status] || "").trim();
      const dateStockOut = row[EXCEL_COL.dateStockOut];

      if (status !== "Released") return;
      if (isSplitSubunitBagNumber(bagNumber)) return;

      const matchedGroup = matchProductGroup(productType);
      if (!matchedGroup || matchedGroup.type !== "LPRC / LDPRC") return;

      const cleanDateText = normalizeDateStockOut(dateStockOut);
      if (!cleanDateText) return;

      const cleanDate = parseYmdDate(cleanDateText);
      if (!cleanDate || cleanDate < startDate || cleanDate > endDate) return;

      const targetBloodGroup = matchedGroup.useBloodGroup ? bloodGroup : "ไม่แยกหมู่";
      const used = Number(matchedGroup.unitMultiplier || 1);
      const key = cleanDateText + "||" + matchedGroup.type + "||" + targetBloodGroup;

      if (!bucket[key]) {
        bucket[key] = {
          dateStockOut: cleanDateText,
          type: matchedGroup.type,
          bloodGroup: targetBloodGroup,
          used: 0
        };
      }

      bucket[key].used += used;
    });

    return Object.keys(bucket)
      .map(key => bucket[key])
      .sort((a, b) => a.dateStockOut.localeCompare(b.dateStockOut) || a.bloodGroup.localeCompare(b.bloodGroup));
  }

  function buildLatestInHistory(dataRows) {
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 2);
    const bucket = {};

    dataRows.forEach(row => {
      const bagNumber = row[EXCEL_COL.bagNumber];
      const productType = String(row[EXCEL_COL.productType] || "").trim();
      const bloodGroup = String(row[EXCEL_COL.bloodGroup] || "").trim();
      const donateSourceRaw = String(row[EXCEL_COL.donateSource] || "").trim();
      const dateStockIn = row[EXCEL_COL.dateStockIn];

      const matchedGroup = matchProductGroup(productType);
      if (!matchedGroup || matchedGroup.type !== "LPRC / LDPRC") return;
      if (isSplitSubunitBagNumber(bagNumber)) return;
      if (isExcludedDonateSource(donateSourceRaw)) return;
      if (mapDonateSource(donateSourceRaw) !== "CNMI") return;

      const cleanDateText = normalizeAnyDate(dateStockIn);
      if (!cleanDateText) return;

      const cleanDate = parseYmdDate(cleanDateText);
      if (!cleanDate || cleanDate < startDate || cleanDate > endDate) return;

      const targetBloodGroup = matchedGroup.useBloodGroup ? bloodGroup : "ไม่แยกหมู่";
      const inUnit = Number(matchedGroup.unitMultiplier || 1);
      const key = cleanDateText + "||" + matchedGroup.type + "||" + targetBloodGroup;

      if (!bucket[key]) {
        bucket[key] = {
          dateStockIn: cleanDateText,
          type: matchedGroup.type,
          bloodGroup: targetBloodGroup,
          inUnit: 0
        };
      }

      bucket[key].inUnit += inUnit;
    });

    return Object.keys(bucket)
      .map(key => bucket[key])
      .sort((a, b) => a.dateStockIn.localeCompare(b.dateStockIn) || a.bloodGroup.localeCompare(b.bloodGroup));
  }

  function buildRawPreview(dataRows) {
    return dataRows.slice(0, 50).map(row => {
      const expireDate = row[EXCEL_COL.expireDate];
      const dateStockOut = row[EXCEL_COL.dateStockOut];
      return {
        bagNumber: row[EXCEL_COL.bagNumber] || "",
        productType: row[EXCEL_COL.productType] || "",
        bloodGroup: row[EXCEL_COL.bloodGroup] || "",
        rh: row[EXCEL_COL.rh] || "",
        location: row[EXCEL_COL.location] || "",
        sex: row[EXCEL_COL.sex] || "",
        donateSource: row[EXCEL_COL.donateSource] || "",
        collectDate: normalizeAnyDate(row[EXCEL_COL.collectDate]),
        expireDate: normalizeAnyDate(expireDate),
        status: row[EXCEL_COL.status] || "",
        dateStockIn: normalizeAnyDate(row[EXCEL_COL.dateStockIn]),
        dateStockOut: dateStockOut || "",
        cleanDateStockOut: normalizeDateStockOut(dateStockOut),
        destroyReason: row[EXCEL_COL.destroyReason] || ""
      };
    });
  }


  const OUTREACH_REQUIRED_HEADERS = [
    "BagNumber",
    "ProductType",
    "DonateSource",
    "DateStockIn",
    "DateStockOut",
    "Status",
    "DestroyReason"
  ];

  const OUTREACH_OPTIONAL_HEADERS = ["BloodGroup", "Rh"];

  function normalizeHeaderName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_\-()]+/g, "");
  }

  function buildHeaderMap(headers) {
    const map = {};
    (headers || []).forEach((header, index) => {
      const key = normalizeHeaderName(header);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function getHeaderIndex(headerMap, name) {
    const key = normalizeHeaderName(name);
    return headerMap[key] === undefined ? -1 : headerMap[key];
  }

  function getHeaderValue(row, headerMap, name) {
    const index = getHeaderIndex(headerMap, name);
    return index < 0 ? "" : row[index];
  }

  function normalizeAnyDateStrict(value) {
    if (value === null || value === undefined || value === "") return "";

    if (value instanceof Date && !isNaN(value)) {
      return formatYmd(value);
    }

    if (typeof value === "number" && isFinite(value)) {
      const d = excelSerialToDate(value);
      return isNaN(d) ? "" : formatYmd(d);
    }

    const text = String(value).trim();
    if (!text) return "";
    const dateOnly = text.split(/[ T]/)[0];
    const parts = dateOnly.split(/[\/\-]/);
    if (parts.length !== 3) return "";

    let d, m, y;
    if (String(parts[0]).length === 4) {
      y = Number(parts[0]);
      m = Number(parts[1]);
      d = Number(parts[2]);
    } else {
      d = Number(parts[0]);
      m = Number(parts[1]);
      y = Number(parts[2]);
    }

    if (![d, m, y].every(Number.isFinite)) return "";
    if (y > 2400) y -= 543;
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return "";

    const candidate = new Date(y, m - 1, d);
    if (
      isNaN(candidate) ||
      candidate.getFullYear() !== y ||
      candidate.getMonth() !== m - 1 ||
      candidate.getDate() !== d
    ) return "";

    return formatYmd(candidate);
  }

  const OUTREACH_SOURCE_GROUPS = {
    SELF_INHOUSE: "หาเอง – รับบริจาคในโรงพยาบาล",
    SELF_OUTREACH: "หาเอง – ออกหน่วย",
    TRC: "กาชาดไทย",
    OTHER_HOSPITAL: "รับจากโรงพยาบาลอื่น",
    REVIEW: "ไม่ระบุ/ต้องตรวจสอบ",
    EXCLUDED: "ตัดออกจากการวิเคราะห์"
  };

  const OUTREACH_OUTCOME = {
    USED: "used",
    DESTROYED: "destroyed",
    TRANSFORMED: "transformed",
    UNRESOLVED: "unresolved",
    CONFLICT: "conflict"
  };

  function isExcludedOutreachSource(value) {
    const text = String(value || "").trim();
    if (!text) return false;

    const exactExcluded = new Set([
      "ห้องรับบริจาคโลหิต รามาธิบดีจักรีนฤบดินทร์ (1B6)",
      "10062Q79877",
      "10067R02375",
      "External Quality Assessment (EQA)",
      "Test สอนแพทย์ พยาบาล"
    ]);
    if (exactExcluded.has(text)) return true;

    const lower = text.toLowerCase();
    if (/external quality assessment|\beqa\b|\btest\b|ทดสอบ|สอนแพทย์|สอนพยาบาล/i.test(lower)) return true;

    // DonateSource ที่มีหน้าตาเป็นเลขถุง เช่น 10067R02375 เป็นข้อมูลสมมติ/ทดสอบ ไม่ใช่สถานที่รับบริจาค
    if (/^\d{5,}[a-z]\d{3,}$/i.test(text.replace(/\s+/g, ""))) return true;

    return false;
  }

  function classifyOutreachSource(value) {
    const text = String(value || "").trim();
    if (!text) {
      return { group: OUTREACH_SOURCE_GROUPS.REVIEW, eligible: false, excluded: false, reason: "DonateSource ว่าง" };
    }
    if (isExcludedOutreachSource(text)) {
      return { group: OUTREACH_SOURCE_GROUPS.EXCLUDED, eligible: false, excluded: true, reason: "ข้อมูลสมมติ/ทดสอบ/สอน" };
    }
    if (text === "ศูนย์บริการโลหิตแห่งชาติ สภากาชาดไทย") {
      return { group: OUTREACH_SOURCE_GROUPS.TRC, eligible: true, excluded: false, reason: "" };
    }
    if (text === "โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์") {
      return { group: OUTREACH_SOURCE_GROUPS.SELF_INHOUSE, eligible: true, excluded: false, reason: "" };
    }
    if (text === "โรงพยาบาลรามาธิบดี" || text === "ศิริราชพยาบาล") {
      return { group: OUTREACH_SOURCE_GROUPS.OTHER_HOSPITAL, eligible: true, excluded: false, reason: "" };
    }
    // ถ้ามีโรงพยาบาลใหม่ที่ไม่เคย map มาก่อน ไม่เดาให้เอง
    if (text.includes("โรงพยาบาล")) {
      return { group: OUTREACH_SOURCE_GROUPS.REVIEW, eligible: false, excluded: false, reason: "พบชื่อโรงพยาบาลใหม่ ต้องตรวจสอบว่าเป็นยืม/แลกหรือออกหน่วย" };
    }

    // ตามกติกางานจริง: แหล่งอื่นที่ไม่ใช่กาชาด/รพ.อื่น/ข้อมูลทดสอบ ถือเป็นจุดออกหน่วยของ CNMI
    return { group: OUTREACH_SOURCE_GROUPS.SELF_OUTREACH, eligible: true, excluded: false, reason: "" };
  }

  function textContainsDestroySignal(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return false;
    const keywords = [
      "destroy", "destroyed", "discard", "discarded", "disposed", "disposal", "expired", "expire",
      "damage", "damaged", "reject", "rejected", "waste", "wasted",
      "ทิ้ง", "ทำลาย", "หมดอายุ", "เสีย", "ชำรุด", "ไม่ผ่านเกณฑ์", "ไม่ผ่าน"
    ];
    return keywords.some(keyword => text.includes(keyword));
  }

  function normalizeOutreachStatus(value) {
    return String(value || "").trim();
  }

  function isKnownOutreachStatus(value) {
    const status = normalizeOutreachStatus(value);
    if (!status) return false;
    const known = new Set([
      "Released",
      "Available",
      "Dedicated",
      "In Screening Process",
      "Quarantine",
      "ReadyToIssue",
      "Be Transformed",
      "Destroyed",
      "Discarded",
      "Disposed",
      "Expired",
      "Rejected"
    ]);
    return known.has(status) || textContainsDestroySignal(status);
  }

  function classifyOutreachOutcome(statusValue, destroyReasonValue) {
    const status = normalizeOutreachStatus(statusValue);
    const destroyReason = String(destroyReasonValue || "").trim();

    // v2.7.0: Status ใน LIS เป็นตัวหลัก เพราะ DestroyReason บางครั้งติดมากับ
    // component อื่นของ BagNumber เดียวกัน แม้รายการนี้จะ Released/Be Transformed แล้ว
    if (status === "Released" || status === "Dedicated") return OUTREACH_OUTCOME.USED;
    if (status === "Be Transformed") return OUTREACH_OUTCOME.TRANSFORMED;
    if (textContainsDestroySignal(status)) return OUTREACH_OUTCOME.DESTROYED;

    // ใช้ DestroyReason ช่วยตัดสินเฉพาะกรณี Status ไม่ได้บอกผลปลายทางชัดเจน
    if (destroyReason && textContainsDestroySignal(destroyReason)) return OUTREACH_OUTCOME.DESTROYED;
    return OUTREACH_OUTCOME.UNRESOLVED;
  }

  function normalizeDateTimeDisplay(value) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date && !isNaN(value)) {
      const ymd = formatYmd(value);
      const hh = String(value.getHours()).padStart(2, "0");
      const mm = String(value.getMinutes()).padStart(2, "0");
      return `${ymd} ${hh}:${mm}`;
    }
    if (typeof value === "number" && isFinite(value)) {
      const d = excelSerialToDate(value);
      if (!isNaN(d)) {
        const ymd = formatYmd(d);
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        return `${ymd} ${hh}:${mm}`;
      }
    }
    return String(value).trim();
  }

  function normalizeComponentKeyPart(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  function makeOutreachComponentKey(bagNumber, productType, dateStockIn, rowIndex) {
    const bag = normalizeBagKey(bagNumber);
    const product = normalizeComponentKeyPart(productType);
    const date = normalizeAnyDateStrict(dateStockIn);
    if (!bag || !product || !date) return `ROW_${rowIndex}`;
    return `${bag}||${product}||${date}`;
  }

  function parseCsvTextToRows(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (ch === '"') {
        if (inQuotes && input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }
      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && input[i + 1] === "\n") i += 1;
        row.push(field);
        field = "";
        if (row.some(cell => String(cell || "").length > 0)) rows.push(row);
        row = [];
        continue;
      }
      field += ch;
    }
    if (field.length || row.length) {
      row.push(field);
      if (row.some(cell => String(cell || "").length > 0)) rows.push(row);
    }
    return rows;
  }

  function parseLisReportDate(text) {
    const match = String(text || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return "";
    const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const d = Number(match[1]);
    const m = months[match[2].toLowerCase()];
    let y = Number(match[3]);
    if (!m || !d || !y) return "";
    if (y > 2400) y -= 543;
    const candidate = new Date(y, m - 1, d);
    if (isNaN(candidate) || candidate.getFullYear() !== y || candidate.getMonth() !== m - 1 || candidate.getDate() !== d) return "";
    return formatYmd(candidate);
  }

  function extractLisReportRange(values, headerRowIndex) {
    const lines = (values || []).slice(0, Math.max(0, headerRowIndex)).map(row => (row || []).join(" "));
    for (const line of lines) {
      const match = String(line || "").match(/ระหว่างวันที่\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+ถึง\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i);
      if (!match) continue;
      const startDate = parseLisReportDate(match[1]);
      const endDate = parseLisReportDate(match[2]);
      if (startDate && endDate) return { startDate, endDate, source: "lis-report-header" };
    }
    return { startDate: "", endDate: "", source: "" };
  }

  function subtractCalendarYears(ymd, years) {
    const parts = String(ymd || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(v => !Number.isFinite(v))) return "";
    const [y, m, d] = parts;
    const candidate = new Date(y - Number(years || 0), m - 1, d);
    // 29 Feb -> 28 Feb in non-leap year
    if (candidate.getMonth() !== m - 1) candidate.setDate(0);
    return formatYmd(candidate);
  }

  function daysBetweenYmd(a, b) {
    const da = new Date(String(a || "") + "T00:00:00");
    const db = new Date(String(b || "") + "T00:00:00");
    if (isNaN(da) || isNaN(db)) return NaN;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function validateLisUploadCoverage(reportRange, state = {}) {
    const baselineEstablished = Boolean(state?.baselineEstablished);
    const startDate = reportRange?.startDate || "";
    const endDate = reportRange?.endDate || "";

    if (!baselineEstablished) {
      return {
        ok: Boolean(startDate && endDate),
        mode: "baseline",
        startDate,
        endDate,
        message: startDate && endDate
          ? "ไฟล์นี้จะใช้สร้างฐานย้อนหลังครั้งแรก"
          : "ไม่พบช่วงวันที่จากหัวรายงาน LIS"
      };
    }

    if (!startDate || !endDate) {
      return {
        ok: false,
        mode: "rolling_2y",
        startDate,
        endDate,
        message: "หลังมีฐานข้อมูลแล้ว ต้อง Export CSV จาก LIS แบบย้อนหลัง 2 ปี และให้ไฟล์มีหัวรายงานช่วงวันที่"
      };
    }

    const expectedStart = subtractCalendarYears(endDate, 2);
    const startDiff = Math.abs(daysBetweenYmd(startDate, expectedStart));
    const endAge = daysBetweenYmd(endDate, todayYmd());
    const spanDays = daysBetweenYmd(startDate, endDate);
    const startOk = Number.isFinite(startDiff) && startDiff <= 7;
    const endOk = Number.isFinite(endAge) && endAge >= -1 && endAge <= 14;
    const spanOk = Number.isFinite(spanDays) && spanDays >= 720 && spanDays <= 745;
    const ok = startOk && endOk && spanOk;

    return {
      ok,
      mode: "rolling_2y",
      startDate,
      endDate,
      expectedStart,
      spanDays,
      message: ok
        ? `ช่วงไฟล์ถูกต้อง: ${startDate} ถึง ${endDate} (ย้อนหลังประมาณ 2 ปี)`
        : `ไฟล์อัปเดตต้องเป็นช่วงย้อนหลัง 2 ปีเท่านั้น โดยอิงวันสิ้นสุดของรายงาน (คาดว่าเริ่มประมาณ ${expectedStart || "-"} ถึง ${endDate || "วันนี้"})`
    };
  }

  async function readExcelSheet(file) {
    const lowerName = String(file?.name || "").toLowerCase();
    let values = [];

    if (lowerName.endsWith(".csv")) {
      // LIS ส่งออก CSV UTF-8 และมีหัวรายงาน 2 บรรทัดก่อน header จริง
      const text = await file.text();
      values = parseCsvTextToRows(text);
    } else {
      if (!window.XLSX) {
        throw new Error("โหลดไลบรารีอ่าน Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ CDN xlsx");
      }
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        raw: true
      });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("ไม่พบข้อมูลในไฟล์ Excel");
      const sheet = workbook.Sheets[firstSheetName];
      values = window.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: ""
      });
    }

    if (!values || values.length < 2) throw new Error("ไม่พบข้อมูลในไฟล์ Excel/CSV");

    // LIS CSV จริงมีหัวรายงาน 2 บรรทัดก่อน header จึงค้นหา BagNumber แทนการสมมติว่า header อยู่บรรทัดแรก
    const headerRowIndex = values.findIndex(row => Array.isArray(row) && row.some(cell => String(cell || "").trim() === "BagNumber"));
    if (headerRowIndex === -1) throw new Error("หาแถวหัวตาราง BagNumber ไม่เจอ");

    const headers = values[headerRowIndex].map(value => String(value || "").trim());
    const headerMap = buildHeaderMap(headers);
    const dataRows = values.slice(headerRowIndex + 1).filter(row => {
      return row && (row[EXCEL_COL.bagNumber] || row[EXCEL_COL.productType] || row[EXCEL_COL.status]);
    });

    const reportRange = extractLisReportRange(values, headerRowIndex);
    return { values, headerRowIndex, headers, headerMap, dataRows, reportRange };
  }

  function chooseUniqueText(values) {
    const unique = Array.from(new Set((values || []).map(v => String(v || "").trim()).filter(Boolean)));
    return { value: unique[0] || "", conflict: unique.length > 1, values: unique };
  }

  function analyzeOutreachData(dataRows, headerMap) {
    const missingHeaders = OUTREACH_REQUIRED_HEADERS.filter(name => getHeaderIndex(headerMap, name) < 0);
    if (missingHeaders.length) {
      return {
        rows: [],
        filterOptions: {},
        excludedComponentCount: 0,
        validation: {
          ok: false,
          blocking: true,
          missingHeaders,
          issueCount: missingHeaders.length,
          duplicateComponentCount: 0,
          multiProductBagCount: 0,
          invalidDateCount: 0,
          unknownStatusCount: 0,
          unknownSourceCount: 0,
          missingBagCount: 0,
          outcomeConflictCount: 0,
          sourceConflictCount: 0,
          excludedRawRowCount: 0,
          issues: missingHeaders.map(name => ({ type: "missing_header", bagNumber: "", message: `ไม่พบคอลัมน์ ${name}` }))
        }
      };
    }

    const issues = [];
    const componentGroups = new Map();
    const productsByBag = new Map();
    const unknownStatuses = new Map();
    const unknownSources = new Map();
    let invalidDateCount = 0;
    let missingBagCount = 0;
    let excludedRawRowCount = 0;

    dataRows.forEach((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      const bagRaw = getHeaderValue(row, headerMap, "BagNumber");
      const bagNumber = String(bagRaw || "").trim();
      const bagKey = normalizeBagKey(bagRaw);
      const productType = String(getHeaderValue(row, headerMap, "ProductType") || "").trim();
      const status = normalizeOutreachStatus(getHeaderValue(row, headerMap, "Status"));
      const donateSource = String(getHeaderValue(row, headerMap, "DonateSource") || "").trim();
      const dateStockInRaw = getHeaderValue(row, headerMap, "DateStockIn");
      const dateStockOutRaw = getHeaderValue(row, headerMap, "DateStockOut");
      const destroyReason = String(getHeaderValue(row, headerMap, "DestroyReason") || "").trim();
      const sourceInfo = classifyOutreachSource(donateSource);

      if (sourceInfo.excluded) excludedRawRowCount += 1;

      if (!bagKey) {
        missingBagCount += 1;
        issues.push({ type: "missing_bag", bagNumber: "", message: `แถวข้อมูล ${excelRow}: ไม่มี BagNumber` });
      }

      const dateStockIn = normalizeAnyDateStrict(dateStockInRaw);
      if (!dateStockInRaw || !dateStockIn) {
        invalidDateCount += 1;
        issues.push({ type: "invalid_date", bagNumber, message: `DateStockIn ไม่ถูกต้อง (แถวข้อมูล ${excelRow})` });
      }
      if (dateStockOutRaw && !normalizeAnyDateStrict(dateStockOutRaw)) {
        invalidDateCount += 1;
        issues.push({ type: "invalid_date", bagNumber, message: `DateStockOut ไม่ถูกต้อง (แถวข้อมูล ${excelRow})` });
      }

      if (!status || !isKnownOutreachStatus(status)) {
        const key = status || "(ว่าง)";
        unknownStatuses.set(key, (unknownStatuses.get(key) || 0) + 1);
      }

      if (!sourceInfo.excluded && !sourceInfo.eligible) {
        const key = donateSource || "(ว่าง)";
        unknownSources.set(key, (unknownSources.get(key) || 0) + 1);
      }

      const componentKey = makeOutreachComponentKey(bagRaw, productType, dateStockInRaw, rowIndex);
      if (!componentGroups.has(componentKey)) componentGroups.set(componentKey, []);
      componentGroups.get(componentKey).push({
        row,
        rowIndex,
        bagNumber,
        bagKey,
        productType,
        bloodGroup: String(getHeaderValue(row, headerMap, "BloodGroup") || "").trim(),
        rh: String(getHeaderValue(row, headerMap, "Rh") || "").trim(),
        donateSource,
        sourceInfo,
        dateStockIn,
        dateStockOut: normalizeDateTimeDisplay(dateStockOutRaw),
        status,
        destroyReason,
        outcomeCode: classifyOutreachOutcome(status, destroyReason)
      });

      if (bagKey) {
        if (!productsByBag.has(bagKey)) productsByBag.set(bagKey, new Set());
        if (productType) productsByBag.get(bagKey).add(productType);
      }
    });

    unknownStatuses.forEach((count, status) => {
      issues.push({ type: "unknown_status", bagNumber: "", message: `Status ที่ยังไม่รู้จัก: ${status} (${count} รายการ)` });
    });
    unknownSources.forEach((count, source) => {
      issues.push({ type: "unknown_source", bagNumber: "", message: `DonateSource ต้องตรวจสอบ: ${source} (${count} รายการ)` });
    });

    const rows = [];
    let excludedComponentCount = 0;
    let duplicateComponentCount = 0;
    let sourceConflictCount = 0;
    let outcomeConflictCount = 0;

    componentGroups.forEach((items, componentKey) => {
      if (items.length > 1) duplicateComponentCount += 1;

      const usableItems = items.filter(item => !item.sourceInfo.excluded);
      if (!usableItems.length) {
        excludedComponentCount += 1;
        return;
      }

      const bagNumber = chooseUniqueText(usableItems.map(item => item.bagNumber));
      const productType = chooseUniqueText(usableItems.map(item => item.productType));
      const bloodGroup = chooseUniqueText(usableItems.map(item => item.bloodGroup));
      const rh = chooseUniqueText(usableItems.map(item => item.rh));
      const source = chooseUniqueText(usableItems.map(item => item.donateSource));
      const sourceGroups = Array.from(new Set(usableItems.map(item => item.sourceInfo.group)));
      const statuses = chooseUniqueText(usableItems.map(item => item.status));
      const reasons = chooseUniqueText(usableItems.map(item => item.destroyReason));
      const outcomes = Array.from(new Set(usableItems.map(item => item.outcomeCode)));
      const dateStockIns = Array.from(new Set(usableItems.map(item => item.dateStockIn).filter(Boolean))).sort();
      const dateStockOuts = usableItems.map(item => item.dateStockOut).filter(Boolean);

      const sourceConflict = source.conflict || sourceGroups.length !== 1;
      if (sourceConflict) {
        sourceConflictCount += 1;
        issues.push({
          type: "source_conflict",
          bagNumber: bagNumber.value,
          message: `ผลิตภัณฑ์เดียวกันมี DonateSource มากกว่า 1 ค่า: ${source.values.join(" | ")}`
        });
      }

      let outcomeCode = outcomes.length === 1 ? outcomes[0] : OUTREACH_OUTCOME.CONFLICT;
      if (outcomeCode === OUTREACH_OUTCOME.CONFLICT || outcomes.length > 1) {
        outcomeConflictCount += 1;
        issues.push({
          type: "outcome_conflict",
          bagNumber: bagNumber.value,
          message: `Status / DestroyReason ให้ผลลัพธ์ขัดแย้งใน ${productType.value || "ผลิตภัณฑ์"}`
        });
      }

      const dateConflict = dateStockIns.length > 1;
      const fieldConflict = bagNumber.conflict || productType.conflict || bloodGroup.conflict || rh.conflict || dateConflict;
      if (fieldConflict) {
        issues.push({
          type: "field_conflict",
          bagNumber: bagNumber.value,
          message: "พบข้อมูล BloodGroup / Rh / ProductType / DateStockIn ขัดแย้งในผลิตภัณฑ์เดียวกัน"
        });
      }

      const dateStockIn = dateStockIns[0] || "";
      const sourceGroup = sourceConflict ? OUTREACH_SOURCE_GROUPS.REVIEW : (sourceGroups[0] || OUTREACH_SOURCE_GROUPS.REVIEW);
      const aggregateEligible = Boolean(
        dateStockIn &&
        !sourceConflict &&
        sourceGroup !== OUTREACH_SOURCE_GROUPS.REVIEW &&
        sourceGroup !== OUTREACH_SOURCE_GROUPS.EXCLUDED
      );

      rows.push({
        componentKey,
        bagNumber: bagNumber.value,
        productType: productType.value,
        bloodGroup: bloodGroup.value,
        rh: rh.value,
        donateSource: sourceConflict ? source.values.join(" | ") : source.value,
        sourceGroup,
        dateStockIn,
        dateStockOut: dateStockOuts[dateStockOuts.length - 1] || "",
        status: statuses.conflict ? statuses.values.join(" | ") : statuses.value,
        destroyReason: reasons.conflict ? reasons.values.join(" | ") : reasons.value,
        outcomeCode,
        aggregateEligible,
        duplicateCount: items.length,
        needsReview: Boolean(
          !aggregateEligible ||
          outcomeCode === OUTREACH_OUTCOME.CONFLICT ||
          sourceConflict ||
          fieldConflict ||
          !isKnownOutreachStatus(statuses.value)
        )
      });
    });

    rows.sort((a, b) =>
      String(b.dateStockIn || "").localeCompare(String(a.dateStockIn || "")) ||
      String(a.donateSource || "").localeCompare(String(b.donateSource || ""), "th") ||
      String(a.bagNumber || "").localeCompare(String(b.bagNumber || ""))
    );

    const multiProductBagCount = Array.from(productsByBag.values()).filter(set => set.size > 1).length;
    const eligibleRows = rows.filter(row => row.aggregateEligible);
    const validDates = eligibleRows.map(row => row.dateStockIn).filter(Boolean).sort();
    const unique = values => Array.from(new Set(values.map(v => String(v || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
    const filterOptions = {
      minDate: validDates[0] || "",
      maxDate: validDates[validDates.length - 1] || "",
      sourceGroups: unique(eligibleRows.map(row => row.sourceGroup)),
      sources: unique(eligibleRows.map(row => row.donateSource)),
      products: unique(eligibleRows.map(row => row.productType)),
      bloodGroups: unique(eligibleRows.map(row => row.bloodGroup)),
      rhs: unique(eligibleRows.map(row => row.rh))
    };

    const unknownStatusCount = Array.from(unknownStatuses.values()).reduce((a, b) => a + b, 0);
    const unknownSourceCount = Array.from(unknownSources.values()).reduce((a, b) => a + b, 0);
    const validation = {
      ok: true,
      blocking: false,
      missingHeaders: [],
      issueCount: issues.length,
      duplicateComponentCount,
      multiProductBagCount,
      invalidDateCount,
      unknownStatusCount,
      unknownSourceCount,
      missingBagCount,
      outcomeConflictCount,
      sourceConflictCount,
      excludedRawRowCount,
      issues: issues.slice(0, 500),
      issuesTruncated: issues.length > 500
    };

    return { rows, filterOptions, excludedComponentCount, validation };
  }

  function buildOutreachValidation(dataRows, headerMap) {
    return analyzeOutreachData(dataRows, headerMap).validation;
  }

  function buildOutreachAnalysis(dataRows, headerMap) {
    const analysis = analyzeOutreachData(dataRows, headerMap);
    if (analysis.validation.blocking) {
      throw new Error("ไฟล์ขาดคอลัมน์สำคัญ: " + analysis.validation.missingHeaders.join(", "));
    }

    return {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      requiredHeaders: OUTREACH_REQUIRED_HEADERS,
      optionalHeaders: OUTREACH_OPTIONAL_HEADERS,
      rawRowCount: dataRows.length,
      componentRowCount: analysis.rows.length,
      totalUniqueBags: new Set(analysis.rows.map(row => normalizeBagKey(row.bagNumber)).filter(Boolean)).size,
      eligibleComponentRows: analysis.rows.filter(row => row.aggregateEligible).length,
      excludedComponentCount: analysis.excludedComponentCount,
      validation: analysis.validation,
      filterOptions: analysis.filterOptions,
      rows: analysis.rows
    };
  }

  // v2.7.0 stores outreach history in a lifetime master table; snapshot keeps only a small pointer.
  // This function now returns only small metadata when a caller still expects outreach_analysis.
  function compactOutreachAnalysis(analysis, uploadId = "") {
    if (!analysis) return {};
    return {
      schemaVersion: 3,
      storage: "minimum_stock_outreach_master",
      uploadId: uploadId || "",
      generatedAt: analysis.generatedAt || "",
      rawRowCount: analysis.rawRowCount || 0,
      componentRowCount: analysis.componentRowCount || 0,
      totalUniqueBags: analysis.totalUniqueBags || 0,
      eligibleComponentRows: analysis.eligibleComponentRows || 0,
      excludedComponentCount: analysis.excludedComponentCount || 0
    };
  }

  function expandOutreachAnalysis(value) {
    return value && typeof value === "object" ? value : null;
  }

  async function preflightOutreachFile(file) {
    const sheetData = await readExcelSheet(file);
    const analysis = analyzeOutreachData(sheetData.dataRows, sheetData.headerMap);
    const state = isConfigured() ? await getLisDataState() : { baselineEstablished: false };
    const coverage = validateLisUploadCoverage(sheetData.reportRange, state);
    const validation = { ...analysis.validation };
    validation.uploadCoverage = coverage;
    if (!coverage.ok) {
      validation.blocking = true;
      validation.issueCount = Number(validation.issueCount || 0) + 1;
      validation.issues = [
        { type: "upload_range", bagNumber: "", message: coverage.message },
        ...(validation.issues || [])
      ];
    }
    return {
      ok: !validation.blocking,
      fileName: file.name,
      totalRows: sheetData.dataRows.length,
      componentRows: analysis.rows.length,
      validation,
      reportRange: sheetData.reportRange,
      uploadMode: coverage.mode,
      dataState: state
    };
  }

  async function parseExcelFile(file) {
    const sheetData = await readExcelSheet(file);
    const { dataRows, headerMap } = sheetData;

    let totalRows = 0;
    let releasedRows = 0;

    dataRows.forEach(row => {
      if (!row[EXCEL_COL.bagNumber] && !row[EXCEL_COL.productType] && !row[EXCEL_COL.status]) return;
      totalRows += 1;
      if (String(row[EXCEL_COL.status] || "").trim() === "Released") releasedRows += 1;
    });

    // Existing calculations are intentionally untouched.
    const calcResult = calculateMinimumStock(dataRows);
    const stockRows = buildLatestStockDetail(dataRows);
    const usageHistoryRows = buildLatestUsageHistory(dataRows);
    const inHistoryRows = buildLatestInHistory(dataRows);
    const outreachAnalysis = buildOutreachAnalysis(dataRows, headerMap);

    return {
      ok: true,
      message: "อัปโหลดและคำนวณสำเร็จ",
      fileName: file.name,
      totalRows,
      releasedRows,
      resultRows: calcResult.results.length,
      stockDetailRows: stockRows.length,
      startDate: calcResult.startDate,
      endDate: calcResult.endDate,
      calculatedAt: new Date().toISOString(),
      results: calcResult.results,
      stockRows,
      usageHistoryRows,
      inHistoryRows,
      rawPreview: buildRawPreview(dataRows),
      sourceReportRange: sheetData.reportRange || { startDate: "", endDate: "" },
      outreachAnalysis
    };
  }


  function getExpiryRule(type) {
    if (type === "LPRC / LDPRC") return { high: 7, medium: 14, watch: 21 };
    if (type === "LDPPC" || type === "SDP") return { high: 1, medium: 3, watch: 5 };
    if (type === "FFP" || type === "Cryo") return { high: 30, medium: 60, watch: 90 };
    return { high: 7, medium: 14, watch: 21 };
  }

  function classifyExpiryRisk(type, expireDateText, selectedDateText) {
    if (!expireDateText) {
      return { daysToExpire: "", expiryLevel: "UNKNOWN", expiryLabel: "ไม่พบวันหมดอายุ" };
    }

    const expireDate = parseYmdDate(expireDateText);
    const selectedDate = parseYmdDate(selectedDateText);

    if (!expireDate || !selectedDate) {
      return { daysToExpire: "", expiryLevel: "UNKNOWN", expiryLabel: "วันหมดอายุไม่ถูกต้อง" };
    }

    const diffDays = Math.ceil((expireDate.getTime() - selectedDate.getTime()) / 86400000);

    if (diffDays < 0) return { daysToExpire: diffDays, expiryLevel: "EXPIRED", expiryLabel: "หมดอายุแล้ว" };

    const rule = getExpiryRule(type);
    if (diffDays <= rule.high) return { daysToExpire: diffDays, expiryLevel: "HIGH", expiryLabel: "ใกล้หมดอายุสูง" };
    if (diffDays <= rule.medium) return { daysToExpire: diffDays, expiryLevel: "MEDIUM", expiryLabel: "ใกล้หมดอายุปานกลาง" };
    if (diffDays <= rule.watch) return { daysToExpire: diffDays, expiryLevel: "WATCH", expiryLabel: "เฝ้าระวัง" };
    return { daysToExpire: diffDays, expiryLevel: "SAFE", expiryLabel: "ยังปลอดภัย" };
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function addYears(date, years) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  function sumLastYearUsage(usageRows, bloodGroup, selectedDateText, planDays) {
    const selectedDate = parseYmdDate(selectedDateText);
    if (!selectedDate) return 0;

    const effectiveDays = Math.max(1, Number(planDays || 1));
    const lastYearStart = addYears(selectedDate, -1);
    const lastYearEnd = addDays(lastYearStart, effectiveDays - 1);

    return usageRows.reduce((total, r) => {
      if (r.type !== "LPRC / LDPRC") return total;
      if (String(r.bloodGroup || "") !== String(bloodGroup || "")) return total;
      const usedDate = parseYmdDate(r.dateStockOut);
      if (!usedDate) return total;
      if (usedDate >= lastYearStart && usedDate <= lastYearEnd) return total + Number(r.used || 0);
      return total;
    }, 0);
  }

  function sumLastYearCnmiIn(inRows, bloodGroup, selectedDateText, planDays) {
    const selectedDate = parseYmdDate(selectedDateText);
    if (!selectedDate) return 0;

    const effectiveDays = Math.max(1, Number(planDays || 1));
    const lastYearStart = addYears(selectedDate, -1);
    const lastYearEnd = addDays(lastYearStart, effectiveDays - 1);

    return inRows.reduce((total, r) => {
      if (r.type !== "LPRC / LDPRC") return total;
      if (String(r.bloodGroup || "") !== String(bloodGroup || "")) return total;
      const inDate = parseYmdDate(r.dateStockIn);
      if (!inDate) return total;
      if (inDate >= lastYearStart && inDate <= lastYearEnd) return total + Number(r.inUnit || 0);
      return total;
    }, 0);
  }

  function getForecastAdvice(row) {
    const needToCollect = Number(row.needToCollect || 0);
    const projectedBalance = Number(row.projectedBalance || 0);
    const trcRatio = Number(row.trcRatio || 0);
    const lastYearCnmiIn = Number(row.lastYearCnmiIn || 0);
    const expiringBeforePlan = Number(row.expiringBeforePlan || 0);

    if (needToCollect > 0 && trcRatio >= 30) {
      return `ควรวางแผนออกหน่วยเพิ่ม หลังหักเลือดที่จะหมดอายุ ${expiringBeforePlan} unit และมีสัดส่วน TRC สูง`;
    }

    if (needToCollect > 0) {
      return `ควรวางแผนออกหน่วยเพิ่ม หลังหักเลือดที่จะหมดอายุ ${expiringBeforePlan} unit`;
    }

    if (projectedBalance <= 3) {
      return `คาดว่ายังพอใช้ แต่เหลือน้อย หลังรวมการจัดหาเอง ${lastYearCnmiIn} unit และหัก expiry ${expiringBeforePlan} unit`;
    }

    if (trcRatio >= 30) {
      return "ยังพอใช้ แต่สัดส่วน TRC สูง ควรพิจารณาออกหน่วยเพื่อลดการพึ่ง TRC";
    }

    return "ยังไม่จำเป็นต้องออกหน่วยเพิ่ม โดยระบบหักเลือดที่จะหมดอายุก่อนวันออกหน่วยแล้ว";
  }

  function sumExpiringBeforePlan(stockRows, bloodGroup, planDays) {
    const effectivePlanDays = Math.max(1, Number(planDays || 1));

    return stockRows.reduce((sum, r) => {
      if (r.type !== "LPRC / LDPRC") return sum;
      if (String(r.bloodGroup || "") !== String(bloodGroup || "")) return sum;
      if (String(r.status || "") !== "Available") return sum;

      const daysToExpire = Number(r.daysToExpire);
      if (isNaN(daysToExpire)) return sum;
      return daysToExpire <= effectivePlanDays ? sum + 1 : sum;
    }, 0);
  }

  function buildMobilePlanningSummary(stockRows, minimumRows, usageHistoryRows, inHistoryRows, selectedDateText, planDays) {
    const byTypeGroup = {};
    const sourceSummary = {};
    const expirySummary = {};

    stockRows.forEach(r => {
      const key = r.type + "||" + r.bloodGroup;

      if (!byTypeGroup[key]) {
        byTypeGroup[key] = {
          type: r.type,
          bloodGroup: r.bloodGroup,
          totalStock: 0,
          cnmi: 0,
          trc: 0,
          other: 0,
          expired: 0,
          expiryHigh: 0,
          expiryMedium: 0,
          expiryWatch: 0,
          expirySafe: 0,
          expiryUnknown: 0
        };
      }

      byTypeGroup[key].totalStock++;

      if (r.sourceGroup === "CNMI") byTypeGroup[key].cnmi++;
      else if (r.sourceGroup === "TRC") byTypeGroup[key].trc++;
      else byTypeGroup[key].other++;

      if (r.expiryLevel === "EXPIRED") byTypeGroup[key].expired++;
      else if (r.expiryLevel === "HIGH") byTypeGroup[key].expiryHigh++;
      else if (r.expiryLevel === "MEDIUM") byTypeGroup[key].expiryMedium++;
      else if (r.expiryLevel === "WATCH") byTypeGroup[key].expiryWatch++;
      else if (r.expiryLevel === "SAFE") byTypeGroup[key].expirySafe++;
      else byTypeGroup[key].expiryUnknown++;

      sourceSummary[r.sourceGroup] = (sourceSummary[r.sourceGroup] || 0) + 1;
      expirySummary[r.expiryLevel] = (expirySummary[r.expiryLevel] || 0) + 1;
    });

    const minimumMap = {};
    minimumRows.forEach(r => {
      minimumMap[r.type + "||" + r.bloodGroup] = r;
    });

    const typeGroupRows = Object.keys(byTypeGroup).map(key => {
      const row = byTypeGroup[key];
      const min = minimumMap[key] || {};
      const minimumStock = Number(min.minimumStock || 0);
      const netAvailable = Number(min.netAvailable || 0);
      const gap = Number(min.gap ?? (netAvailable - minimumStock));
      const need = Math.max(0, minimumStock - netAvailable);
      const trcRatio = row.totalStock > 0 ? Number(((row.trc / row.totalStock) * 100).toFixed(1)) : 0;
      const avgDay = Number(min.avgDay || 0);
      const effectivePlanDays = Math.max(1, Number(planDays || 14));

      const currentAvgExpectedUse = row.type === "LPRC / LDPRC" ? Math.ceil(avgDay * effectivePlanDays) : 0;
      const lastYearUsed = row.type === "LPRC / LDPRC"
        ? sumLastYearUsage(usageHistoryRows, row.bloodGroup, selectedDateText, effectivePlanDays)
        : 0;
      const lastYearCnmiIn = row.type === "LPRC / LDPRC"
        ? sumLastYearCnmiIn(inHistoryRows, row.bloodGroup, selectedDateText, effectivePlanDays)
        : 0;
      const expiringBeforePlan = row.type === "LPRC / LDPRC"
        ? sumExpiringBeforePlan(stockRows, row.bloodGroup, effectivePlanDays)
        : 0;

      const netAvailableAfterExpiry = row.type === "LPRC / LDPRC" ? Math.max(0, netAvailable - expiringBeforePlan) : netAvailable;
      const forecastUse = row.type === "LPRC / LDPRC" ? Math.max(currentAvgExpectedUse, lastYearUsed) : 0;
      const projectedBalance = row.type === "LPRC / LDPRC" ? netAvailableAfterExpiry + lastYearCnmiIn - forecastUse : 0;
      const needToCollect = row.type === "LPRC / LDPRC" ? Math.max(0, forecastUse - netAvailableAfterExpiry - lastYearCnmiIn) : 0;

      const resultRow = {
        type: row.type,
        bloodGroup: row.bloodGroup,
        totalStock: row.totalStock,
        minimumStock,
        netAvailable,
        gap,
        need,
        cnmi: row.cnmi,
        trc: row.trc,
        other: row.other,
        trcRatio,
        expired: row.expired,
        expiryHigh: row.expiryHigh,
        expiryMedium: row.expiryMedium,
        expiryWatch: row.expiryWatch,
        expirySafe: row.expirySafe,
        expiryUnknown: row.expiryUnknown,
        planDays: effectivePlanDays,
        avgDay,
        currentAvgExpectedUse,
        lastYearUsed,
        lastYearCnmiIn,
        expiringBeforePlan,
        netAvailableAfterExpiry,
        forecastUse,
        projectedBalance,
        needToCollect
      };

      resultRow.forecastAdvice = getForecastAdvice(resultRow);
      return resultRow;
    });

    const prcRows = typeGroupRows.filter(r => r.type === "LPRC / LDPRC");
    const totalPrcNeed = prcRows.reduce((sum, r) => sum + Number(r.need || 0), 0);
    const totalPrcTrc = prcRows.reduce((sum, r) => sum + Number(r.trc || 0), 0);
    const totalPrcStock = prcRows.reduce((sum, r) => sum + Number(r.totalStock || 0), 0);
    const totalPrcExpiryHigh = prcRows.reduce((sum, r) => sum + Number(r.expiryHigh || 0) + Number(r.expired || 0), 0);
    const totalForecastUse = prcRows.reduce((sum, r) => sum + Number(r.forecastUse || 0), 0);
    const totalExpectedCnmiIn = prcRows.reduce((sum, r) => sum + Number(r.lastYearCnmiIn || 0), 0);
    const totalExpiringBeforePlan = prcRows.reduce((sum, r) => sum + Number(r.expiringBeforePlan || 0), 0);
    const totalNetAvailableAfterExpiry = prcRows.reduce((sum, r) => sum + Number(r.netAvailableAfterExpiry || 0), 0);
    const totalProjectedBalance = prcRows.reduce((sum, r) => sum + Number(r.projectedBalance || 0), 0);
    const totalNeedToCollect = prcRows.reduce((sum, r) => sum + Number(r.needToCollect || 0), 0);
    const riskGroups = prcRows.filter(r => Number(r.needToCollect || 0) > 0).map(r => r.bloodGroup);
    const prcTrcRatio = totalPrcStock > 0 ? Number(((totalPrcTrc / totalPrcStock) * 100).toFixed(1)) : 0;

    return {
      sourceSummary,
      expirySummary,
      typeGroupRows,
      decisionBase: {
        totalPrcNeed,
        totalPrcStock,
        totalPrcTrc,
        prcTrcRatio,
        totalPrcExpiryHigh,
        planDays: Number(planDays || 14),
        totalForecastUse,
        totalExpectedCnmiIn,
        totalExpiringBeforePlan,
        totalNetAvailableAfterExpiry,
        totalProjectedBalance,
        totalNeedToCollect,
        riskGroups
      }
    };
  }

  function buildMobilePlanningData(snapshot, selectedDate, planDays) {
    const selectedDateText = selectedDate || todayYmd();
    const selectedPlanDays = Number(planDays || 14);
    const stockRowsRaw = snapshot.stock_rows || snapshot.stockRows || [];
    const minimumRows = snapshot.results || [];
    const usageHistoryRows = snapshot.usage_history_rows || snapshot.usageHistoryRows || [];
    const inHistoryRows = snapshot.in_history_rows || snapshot.inHistoryRows || [];

    const stockWithExpiry = stockRowsRaw.map(r => {
      const risk = classifyExpiryRisk(r.type, r.expireDate, selectedDateText);
      return {
        bagNumber: r.bagNumber,
        type: r.type,
        bloodGroup: r.bloodGroup,
        rh: r.rh,
        status: r.status,
        sourceGroup: r.sourceGroup,
        donateSourceRaw: r.donateSourceRaw,
        expireDate: r.expireDate,
        daysToExpire: risk.daysToExpire,
        expiryLevel: risk.expiryLevel,
        expiryLabel: risk.expiryLabel
      };
    });

    return {
      ok: true,
      message: "โหลด Mobile Unit Planning สำเร็จ",
      selectedDate: selectedDateText,
      planDays: selectedPlanDays,
      expiryRules: {
        prc: "LPRC / LDPRC: 7 / 14 / 21 วัน",
        platelet: "LDPPC / SDP: 1 / 3 / 5 วัน",
        plasmaCryo: "FFP / Cryo: 30 / 60 / 90 วัน"
      },
      sourceMapping: {
        CNMI: "โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์",
        TRC: "ศูนย์บริการโลหิตแห่งชาติ สภากาชาดไทย",
        OTHER: "อื่น ๆ"
      },
      summary: buildMobilePlanningSummary(
        stockWithExpiry,
        minimumRows,
        usageHistoryRows,
        inHistoryRows,
        selectedDateText,
        selectedPlanDays
      ),
      stockRows: stockWithExpiry
    };
  }

  function toDashboard(snapshot) {
    if (!snapshot) {
      return { ok: true, message: "ยังไม่มีข้อมูล Minimum Stock", results: [] };
    }

    return {
      ok: true,
      message: "โหลด Dashboard สำเร็จ",
      fileName: snapshot.file_name || snapshot.fileName || "",
      calculatedAt: snapshot.calculated_at || snapshot.calculatedAt || snapshot.created_at || "",
      startDate: snapshot.start_date || snapshot.startDate || "",
      endDate: snapshot.end_date || snapshot.endDate || "",
      totalRows: snapshot.total_rows || snapshot.totalRows || 0,
      releasedRows: snapshot.released_rows || snapshot.releasedRows || 0,
      resultRows: snapshot.result_rows || snapshot.resultRows || 0,
      results: snapshot.results || []
    };
  }

  async function getLatestSnapshot(options = {}) {
    const full = Boolean(options.full);
    const forceRefresh = Boolean(options.forceRefresh);

    // ใช้หลังอัปโหลดเพื่อบังคับอ่าน snapshot ล่าสุดจาก Supabase จริง
    // ไม่คืนค่าจากตัวแปร cache ที่อาจยังเป็นข้อมูลรอบก่อนหน้า
    if (forceRefresh) clearCachedSnapshotState();

    if (!forceRefresh && full && cachedFullSnapshot) return cachedFullSnapshot;
    if (!forceRefresh && !full && cachedSummarySnapshot) return cachedSummarySnapshot;

    const client = getClient();
    if (!client) return null;

    // หน้า Dashboard ใช้แค่ข้อมูลสรุป จึงไม่ดึง stock_rows / history jsonb ก้อนใหญ่
    // ส่วน Mobile Unit Planning ค่อยดึงแบบ full เฉพาะตอนเปิดเมนูนั้น
    const { data, error } = await client
      .from(getTableName())
      .select(full ? FULL_SELECT : SUMMARY_SELECT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("โหลดข้อมูลจาก Supabase ไม่สำเร็จ: " + error.message);

    if (full) {
      cachedFullSnapshot = data;
      cachedSummarySnapshot = data ? toSummarySnapshot(data) : null;
      return cachedFullSnapshot;
    }

    cachedSummarySnapshot = data;
    return cachedSummarySnapshot;
  }

  function toSummarySnapshot(snapshot) {
    if (!snapshot) return null;
    return {
      id: snapshot.id,
      created_at: snapshot.created_at,
      file_name: snapshot.file_name,
      calculated_at: snapshot.calculated_at,
      total_rows: snapshot.total_rows,
      released_rows: snapshot.released_rows,
      result_rows: snapshot.result_rows,
      start_date: snapshot.start_date,
      end_date: snapshot.end_date,
      results: snapshot.results || []
    };
  }

  function emitOutreachProgress(options, stage, current, total, message) {
    if (typeof options?.onProgress !== "function") return;
    try {
      options.onProgress({ stage, current: Number(current || 0), total: Number(total || 0), message: String(message || "") });
    } catch (err) {
      console.warn("outreach progress callback failed", err);
    }
  }

  function toOutreachDbRow(batchId, row) {
    return {
      batch_id: batchId,
      component_key: row.componentKey || "",
      bag_number: row.bagNumber || "",
      product_type: row.productType || "",
      blood_group: row.bloodGroup || "",
      rh: row.rh || "",
      donate_source: row.donateSource || "",
      source_group: row.sourceGroup || OUTREACH_SOURCE_GROUPS.REVIEW,
      date_stock_in: row.dateStockIn || null,
      date_stock_out: row.dateStockOut || "",
      status: row.status || "",
      destroy_reason: row.destroyReason || "",
      outcome_code: row.outcomeCode || OUTREACH_OUTCOME.UNRESOLVED,
      aggregate_eligible: Boolean(row.aggregateEligible),
      needs_review: Boolean(row.needsReview),
      duplicate_count: Number(row.duplicateCount || 1)
    };
  }

  function fromOutreachDbRow(row) {
    return {
      id: row.id,
      componentKey: row.component_key || "",
      bagNumber: row.bag_number || "",
      productType: row.product_type || "",
      bloodGroup: row.blood_group || "",
      rh: row.rh || "",
      donateSource: row.donate_source || "",
      sourceGroup: row.source_group || OUTREACH_SOURCE_GROUPS.REVIEW,
      dateStockIn: row.date_stock_in || "",
      dateStockOut: row.date_stock_out || "",
      status: row.status || "",
      destroyReason: row.destroy_reason || "",
      outcomeCode: row.outcome_code || OUTREACH_OUTCOME.UNRESOLVED,
      aggregateEligible: Boolean(row.aggregate_eligible),
      needsReview: Boolean(row.needs_review),
      duplicateCount: Number(row.duplicate_count || 1)
    };
  }

  async function createOutreachBatch(parsed) {
    const client = getClient();
    const analysis = parsed.outreachAnalysis || {};
    const validation = analysis.validation || {};
    const filterOptions = analysis.filterOptions || {};

    const { data, error } = await client
      .from("minimum_stock_outreach_batches")
      .insert({
        file_name: parsed.fileName || "",
        calculated_at: parsed.calculatedAt || new Date().toISOString(),
        status: "processing",
        is_active: false,
        source_start_date: filterOptions.minDate || null,
        source_end_date: filterOptions.maxDate || null,
        raw_row_count: Number(analysis.rawRowCount || parsed.totalRows || 0),
        component_row_count: Number(analysis.componentRowCount || (analysis.rows || []).length || 0),
        unique_bag_count: Number(analysis.totalUniqueBags || 0),
        excluded_component_count: Number(analysis.excludedComponentCount || 0),
        validation,
        filter_options: filterOptions
      })
      .select("id")
      .single();

    if (error) throw new Error("สร้างชุดข้อมูลวิเคราะห์ออกหน่วยไม่สำเร็จ: " + error.message);
    return data.id;
  }

  async function stageOutreachRows(batchId, analysis, options = {}) {
    const client = getClient();
    const rows = analysis?.rows || [];
    const chunkSize = 750;
    emitOutreachProgress(options, "outreach-save", 0, rows.length, `กำลังบันทึกข้อมูลวิเคราะห์ 0/${rows.length.toLocaleString()} รายการ`);

    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize).map(row => toOutreachDbRow(batchId, row));
      const { error } = await client.from("minimum_stock_outreach_rows").insert(chunk);
      if (error) {
        throw new Error(`บันทึกข้อมูลวิเคราะห์ช่วง ${start + 1}-${Math.min(start + chunkSize, rows.length)} ไม่สำเร็จ: ${error.message}`);
      }
      const current = Math.min(start + chunkSize, rows.length);
      emitOutreachProgress(options, "outreach-save", current, rows.length, `กำลังบันทึกข้อมูลวิเคราะห์ ${current.toLocaleString()}/${rows.length.toLocaleString()} รายการ`);
    }

    const { error: readyError } = await client
      .from("minimum_stock_outreach_batches")
      .update({ status: "ready" })
      .eq("id", batchId);
    if (readyError) throw new Error("ยืนยันชุดข้อมูลวิเคราะห์ไม่สำเร็จ: " + readyError.message);
  }

  async function discardOutreachBatch(batchId) {
    if (!batchId) return;
    const client = getClient();
    try {
      await client.from("minimum_stock_outreach_batches").delete().eq("id", batchId);
    } catch (err) {
      console.warn("discard outreach batch failed", err);
    }
  }

  async function activateOutreachBatch(batchId) {
    const client = getClient();
    const { data, error } = await client.rpc("minimum_stock_outreach_activate_batch", { p_batch_id: batchId });
    if (error) throw new Error("เปิดใช้ชุดข้อมูลวิเคราะห์ล่าสุดไม่สำเร็จ: " + error.message);
    return data;
  }

  async function clearAllOutreachBatches() {
    if (!isConfigured()) return { ok: true, deleted_batches: 0 };
    const client = getClient();
    const { data, error } = await client.rpc("minimum_stock_outreach_clear_all");
    if (error) throw new Error("ล้างข้อมูลวิเคราะห์ออกหน่วยไม่สำเร็จ: " + error.message);
    cachedOutreachSnapshot = null;
    return data || { ok: true };
  }

  async function cleanupOldSnapshots(keepId) {
    const client = getClient();
    const { error } = await client.rpc("minimum_stock_delete_other_snapshots", { p_keep_id: keepId });
    if (error) throw new Error("ล้าง snapshot เก่าหลังบันทึกสำเร็จไม่ครบ: " + error.message);
  }

  async function saveSnapshot(parsed, options = {}) {
    const client = getClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase");

    const payload = {
      file_name: parsed.fileName,
      calculated_at: parsed.calculatedAt,
      total_rows: parsed.totalRows,
      released_rows: parsed.releasedRows,
      result_rows: parsed.resultRows,
      start_date: parsed.startDate || null,
      end_date: parsed.endDate || null,
      results: parsed.results || [],
      stock_rows: parsed.stockRows || [],
      usage_history_rows: parsed.usageHistoryRows || [],
      in_history_rows: parsed.inHistoryRows || [],
      raw_preview: parsed.rawPreview || [],
      outreach_analysis: compactOutreachAnalysis(parsed.outreachAnalysis, options.outreachBatchId || "")
    };

    const { data, error } = await client
      .from(getTableName())
      .insert(payload)
      .select(SUMMARY_SELECT)
      .single();

    if (error) {
      const message = String(error.message || "");
      if (message.includes("outreach_analysis")) {
        throw new Error("Supabase ยังไม่พร้อมสำหรับ v2.7.0 กรุณารันไฟล์ supabase-outreach-analysis-v2.7.0.sql ก่อน");
      }
      throw new Error("บันทึกลง Supabase ไม่สำเร็จ: " + message);
    }
    cachedSummarySnapshot = data;
    cachedFullSnapshot = null;
    return data;
  }

  async function getDashboard(options = {}) {
    if (!isConfigured()) return fallbackGetDashboard(options.gasWebAppUrl);

    const snapshot = await getLatestSnapshot({
      full: false,
      forceRefresh: Boolean(options.forceRefresh)
    });
    return toDashboard(snapshot);
  }

  async function getMobilePlanning(options = {}) {
    const selectedDate = options.selectedDate || todayYmd();
    const planDays = Number(options.planDays || 14);

    if (!isConfigured()) {
      return fallbackMobilePlanning(options.gasWebAppUrl, selectedDate, planDays);
    }

    const snapshot = await getLatestSnapshot({ full: true });
    if (!snapshot) {
      return { ok: true, selectedDate, planDays, planningRows: [], stockRows: [], message: "ยังไม่มีข้อมูล Mobile Unit Planning" };
    }
    return buildMobilePlanningData(snapshot, selectedDate, planDays);
  }

  async function ensureOutreachSchema() {
    if (!isConfigured()) {
      throw new Error("รายงานวิเคราะห์ผลถุงเลือดออกหน่วยต้องใช้ Supabase");
    }
    const client = getClient();
    const { error } = await client
      .from("minimum_stock_outreach_master")
      .select("component_key")
      .limit(1);
    if (error) {
      throw new Error("Supabase ยังไม่ได้ติดตั้งโครงสร้าง v2.7.0 กรุณารันไฟล์ supabase-outreach-analysis-v2.7.0.sql ใน SQL Editor ก่อน");
    }
    return { ok: true };
  }

  async function getLisDataState() {
    if (!isConfigured()) return { baselineEstablished: false, masterCount: 0, uniqueBags: 0, latestUpload: {} };
    const client = getClient();
    const { data, error } = await client.rpc("minimum_stock_lis_data_state");
    if (error) throw new Error("โหลดสถานะฐาน LIS ไม่สำเร็จ: " + error.message);
    return data || { baselineEstablished: false, masterCount: 0, uniqueBags: 0, latestUpload: {} };
  }

  function normalizeOutreachFilters(filters = {}) {
    return {
      dateFrom: filters.dateFrom || "",
      dateTo: filters.dateTo || "",
      sourceGroup: filters.sourceGroup || "",
      source: filters.source || "",
      productType: filters.productType || "",
      bloodGroup: filters.bloodGroup || "",
      rh: filters.rh || ""
    };
  }

  async function runOutreachReport(filters = {}) {
    const client = getClient();
    const f = normalizeOutreachFilters(filters);
    const { data, error } = await client.rpc("minimum_stock_outreach_master_report", {
      p_date_from: f.dateFrom || null,
      p_date_to: f.dateTo || null,
      p_source_group: f.sourceGroup || null,
      p_donate_source: f.source || null,
      p_product_type: f.productType || null,
      p_blood_group: f.bloodGroup || null,
      p_rh: f.rh || null
    });
    if (error) throw new Error("คำนวณรายงานวิเคราะห์ออกหน่วยไม่สำเร็จ: " + error.message);
    return data || { summary: {}, groups: [], sources: [] };
  }

  async function getOutreachFilterOptions() {
    const client = getClient();
    const { data, error } = await client.rpc("minimum_stock_outreach_filter_options");
    if (error) throw new Error("โหลดตัวกรองรายงานไม่สำเร็จ: " + error.message);
    return data || {};
  }

  async function getOutreachReviewRows(limit = 100) {
    const client = getClient();
    const { data, error } = await client
      .from("minimum_stock_outreach_master")
      .select("component_key,bag_number,product_type,blood_group,rh,donate_source,source_group,date_stock_in,date_stock_out,status,destroy_reason,outcome_code,aggregate_eligible,needs_review,duplicate_count")
      .eq("needs_review", true)
      .order("date_stock_in", { ascending: false, nullsFirst: false })
      .limit(Math.max(1, Math.min(500, Number(limit || 100))));
    if (error) throw new Error("โหลดรายการที่ต้องตรวจสอบไม่สำเร็จ: " + error.message);
    return (data || []).map(fromOutreachDbRow);
  }

  async function getLatestLisUpload() {
    const client = getClient();
    const { data, error } = await client
      .from("minimum_stock_lis_uploads")
      .select("id,created_at,file_name,upload_mode,source_start_date,source_end_date,raw_row_count,component_row_count,unique_bag_count,excluded_component_count,upserted_count,validation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("โหลดข้อมูลอัปเดต LIS ล่าสุดไม่สำเร็จ: " + error.message);
    return data || null;
  }

  async function getOutreachAnalysis(options = {}) {
    if (!isConfigured()) throw new Error("รายงานวิเคราะห์ผลถุงเลือดออกหน่วยต้องใช้ Supabase");
    if (options.forceRefresh) cachedOutreachSnapshot = null;

    const filters = normalizeOutreachFilters(options.filters || {});
    const hasFilters = Object.values(filters).some(Boolean);
    if (!hasFilters && !options.forceRefresh && cachedOutreachSnapshot) return cachedOutreachSnapshot;

    const [state, latestUpload, filterOptions, report] = await Promise.all([
      getLisDataState(),
      getLatestLisUpload(),
      getOutreachFilterOptions(),
      runOutreachReport(filters)
    ]);

    if (!state.baselineEstablished) {
      return { ok: true, message: "ยังไม่มีข้อมูลวิเคราะห์ผลถุงเลือดออกหน่วย", report: { summary: {}, groups: [], sources: [] }, filterOptions: {} };
    }

    let reviewRows = [];
    if (!hasFilters) reviewRows = await getOutreachReviewRows(100);

    const result = {
      ok: true,
      message: "โหลดรายงานวิเคราะห์ผลถุงเลือดออกหน่วยสำเร็จ",
      batchId: "master",
      fileName: latestUpload?.file_name || "",
      calculatedAt: latestUpload?.created_at || "",
      sourceStartDate: state.masterMinDate || filterOptions.minDate || "",
      sourceEndDate: state.masterMaxDate || filterOptions.maxDate || "",
      rawRowCount: Number(latestUpload?.raw_row_count || 0),
      componentRowCount: Number(state.masterCount || 0),
      totalUniqueBags: Number(state.uniqueBags || 0),
      excludedComponentCount: Number(latestUpload?.excluded_component_count || 0),
      validation: { ...(latestUpload?.validation || {}), masterReviewCount: Number(state.reviewCount || 0) },
      filterOptions,
      reviewRows,
      report,
      filters,
      dataState: state,
      latestUpload
    };

    if (!hasFilters) cachedOutreachSnapshot = result;
    return result;
  }

  function applyOutreachRowQueryFilters(query, filters = {}) {
    const f = normalizeOutreachFilters(filters);
    if (f.dateFrom) query = query.gte("date_stock_in", f.dateFrom);
    if (f.dateTo) query = query.lte("date_stock_in", f.dateTo);
    if (f.sourceGroup) query = query.eq("source_group", f.sourceGroup);
    if (f.source) query = query.eq("donate_source", f.source);
    if (f.productType) query = query.eq("product_type", f.productType);
    if (f.bloodGroup) query = query.eq("blood_group", f.bloodGroup);
    if (f.rh) query = query.eq("rh", f.rh);
    return query;
  }

  async function getOutreachRows(options = {}) {
    if (!isConfigured()) throw new Error("รายงานวิเคราะห์ออกหน่วยต้องใช้ Supabase");
    const client = getClient();
    const selectFields = "component_key,bag_number,product_type,blood_group,rh,donate_source,source_group,date_stock_in,date_stock_out,status,destroy_reason,outcome_code,aggregate_eligible,needs_review,duplicate_count";
    const perPage = Math.max(1, Math.min(1000, Number(options.perPage || 100)));
    const page = Math.max(1, Number(options.page || 1));
    const extraFilters = { ...(options.filters || {}) };
    if (options.sourceGroup) extraFilters.sourceGroup = options.sourceGroup;
    if (options.source) extraFilters.source = options.source;

    const buildQuery = (withCount = false) => {
      let query = client
        .from("minimum_stock_outreach_master")
        .select(selectFields, withCount ? { count: "exact" } : undefined);
      if (!options.includeIneligible) query = query.eq("aggregate_eligible", true);
      query = applyOutreachRowQueryFilters(query, extraFilters);
      return query.order("date_stock_in", { ascending: false, nullsFirst: false })
        .order("donate_source", { ascending: true })
        .order("bag_number", { ascending: true });
    };

    if (!options.all) {
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      const { data, error, count } = await buildQuery(true).range(from, to);
      if (error) throw new Error("โหลดรายละเอียดรายถุงไม่สำเร็จ: " + error.message);
      return { rows: (data || []).map(fromOutreachDbRow), count: Number(count || 0), page, perPage };
    }

    const rows = [];
    const chunk = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await buildQuery(false).range(from, from + chunk - 1);
      if (error) throw new Error("โหลดข้อมูลสำหรับส่งออกไม่สำเร็จ: " + error.message);
      const part = (data || []).map(fromOutreachDbRow);
      rows.push(...part);
      emitOutreachProgress(options, "outreach-export", rows.length, 0, `กำลังเตรียมข้อมูลส่งออก ${rows.length.toLocaleString()} รายการ`);
      if (part.length < chunk) break;
      from += chunk;
    }
    return { rows, count: rows.length, page: 1, perPage: rows.length };
  }

  async function mergeOutreachBatchToMaster(batchId, parsed, coverage) {
    const client = getClient();
    const analysis = parsed.outreachAnalysis || {};
    const { data, error } = await client.rpc("minimum_stock_outreach_merge_batch_to_master", {
      p_batch_id: batchId,
      p_file_name: parsed.fileName || "",
      p_upload_mode: coverage?.mode || "rolling_2y",
      p_source_start_date: coverage?.startDate || null,
      p_source_end_date: coverage?.endDate || null,
      p_raw_row_count: Number(analysis.rawRowCount || parsed.totalRows || 0),
      p_component_row_count: Number(analysis.componentRowCount || 0),
      p_unique_bag_count: Number(analysis.totalUniqueBags || 0),
      p_excluded_component_count: Number(analysis.excludedComponentCount || 0),
      p_validation: analysis.validation || {}
    });
    if (error) throw new Error("อัปเดตฐานประวัติ LIS ไม่สำเร็จ: " + error.message);
    return data || { ok: true };
  }

  async function clearAllOutreachBatches() {
    if (!isConfigured()) return { ok: true };
    const client = getClient();
    const { data, error } = await client.rpc("minimum_stock_outreach_clear_all_v270");
    if (error) throw new Error("ล้างฐานประวัติ LIS ไม่สำเร็จ: " + error.message);
    cachedOutreachSnapshot = null;
    return data || { ok: true };
  }

  async function uploadExcel(file, options = {}) {
    if (!isConfigured()) return fallbackUploadExcel(file, options.gasWebAppUrl);

    // v2.7.0:
    // - ฐานย้อนหลังเดิมอยู่ใน minimum_stock_outreach_master
    // - ไฟล์ประจำวันต้องย้อนหลัง 2 ปี และจะ UPSERT เฉพาะ component ที่อยู่ในไฟล์
    // - ประวัติเก่ากว่า 2 ปีไม่ถูกลบ
    const parsed = await parseExcelFile(file);
    const state = await getLisDataState();
    const coverage = validateLisUploadCoverage(parsed.sourceReportRange, state);
    if (!coverage.ok) throw new Error(coverage.message);

    let batchId = "";
    let merged = false;
    let snapshot = null;

    try {
      emitOutreachProgress(options, "outreach-batch", 0, parsed.outreachAnalysis?.componentRowCount || 0, "กำลังเตรียมข้อมูลอัปเดต LIS");
      batchId = await createOutreachBatch(parsed);
      await stageOutreachRows(batchId, parsed.outreachAnalysis, options);

      emitOutreachProgress(options, "outreach-merge", 0, parsed.outreachAnalysis?.componentRowCount || 0, "กำลังอัปเดตสถานะถุงในฐานย้อนหลัง");
      const mergeResult = await mergeOutreachBatchToMaster(batchId, parsed, coverage);
      merged = true;
      batchId = ""; // RPC ลบ staging batch แล้ว

      emitOutreachProgress(options, "snapshot", 0, 1, "กำลังอัปเดต Minimum Stock / ใกล้หมดอายุ / แผนออกหน่วย");
      snapshot = await saveSnapshot(parsed, { outreachBatchId: mergeResult.upload_id || "" });
      emitOutreachProgress(options, "snapshot", 1, 1, "อัปเดตข้อมูลล่าสุดสำเร็จ");

      try {
        await cleanupOldSnapshots(snapshot.id);
      } catch (cleanupErr) {
        console.warn("cleanup old snapshots failed", cleanupErr);
      }
      clearCachedSnapshotState();
      return toDashboard(snapshot);
    } catch (err) {
      if (batchId && !merged) await discardOutreachBatch(batchId);
      throw err;
    }
  }



  window.MinimumStockBackend = {
    uploadExcel,
    getDashboard,
    getMobilePlanning,
    getOutreachAnalysis,
    getOutreachRows,
    clearAllOutreachBatches,
    ensureOutreachSchema,
    getLisDataState,
    preflightOutreachFile,
    clearAllSnapshots,
    _internal: {
      parseExcelFile,
      calculateMinimumStock,
      buildLatestStockDetail,
      buildLatestUsageHistory,
      buildLatestInHistory,
      buildMobilePlanningData,
      isConfigured,
      clearAllSnapshots,
      matchProductGroup,
      collectUniqueCurrentStockRows,
      normalizeBagKey,
      normalizeCurrentStockLocation,
      isSplitSubunitBagNumber,
      classifyOutreachSource,
      classifyOutreachOutcome,
      buildOutreachAnalysis,
      buildOutreachValidation,
      analyzeOutreachData,
      parseCsvTextToRows,
      compactOutreachAnalysis,
      expandOutreachAnalysis,
      normalizeAnyDateStrict,
      validateLisUploadCoverage,
      extractLisReportRange
    }
  };
})();
