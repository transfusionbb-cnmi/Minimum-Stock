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

  const FULL_SELECT = "*";

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
        if (locationCategory === "BLOOD_BANK") {
          item.readyToIssue += 1;
        } else {
          item.excludedOtherLocation += 1;
        }
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

  async function parseExcelFile(file) {
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
    if (!firstSheetName) throw new Error("ไม่พบชีตในไฟล์ Excel");

    const sheet = workbook.Sheets[firstSheetName];
    const values = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: ""
    });

    if (!values || values.length < 3) throw new Error("ไม่พบข้อมูลในไฟล์ Excel");

    const headerRowIndex = values.findIndex(row => String(row[0] || "").trim() === "BagNumber");
    if (headerRowIndex === -1) throw new Error("หาแถวหัวตาราง BagNumber ไม่เจอ");

    const dataRows = values.slice(headerRowIndex + 1).filter(row => {
      return row && (row[EXCEL_COL.bagNumber] || row[EXCEL_COL.productType] || row[EXCEL_COL.status]);
    });

    let totalRows = 0;
    let releasedRows = 0;

    dataRows.forEach(row => {
      if (!row[EXCEL_COL.bagNumber] && !row[EXCEL_COL.productType] && !row[EXCEL_COL.status]) return;
      totalRows += 1;
      if (String(row[EXCEL_COL.status] || "").trim() === "Released") releasedRows += 1;
    });

    const calcResult = calculateMinimumStock(dataRows);
    const stockRows = buildLatestStockDetail(dataRows);
    const usageHistoryRows = buildLatestUsageHistory(dataRows);
    const inHistoryRows = buildLatestInHistory(dataRows);

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
      rawPreview: buildRawPreview(dataRows)
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

    if (full && cachedFullSnapshot) return cachedFullSnapshot;
    if (!full && cachedSummarySnapshot) return cachedSummarySnapshot;

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

  async function saveSnapshot(parsed, options = {}) {
    const client = getClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase");

    // ปกติ uploadExcel จะล้าง snapshot เดิมก่อนอ่านไฟล์แล้ว
    // เผื่อมีการเรียก saveSnapshot ตรง ๆ จากภายนอก ให้ยังล้างได้ถ้าไม่ได้สั่งข้าม
    if (!options.skipClearBeforeSave) {
      await clearAllSnapshots({ beforeUpload: true });
    }

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
      raw_preview: parsed.rawPreview || []
    };

    const { data, error } = await client
      .from(getTableName())
      .insert(payload)
      .select(SUMMARY_SELECT)
      .single();

    if (error) throw new Error("บันทึกลง Supabase ไม่สำเร็จ: " + error.message);
    cachedSummarySnapshot = data;
    cachedFullSnapshot = null;
    return data;
  }

  async function getDashboard(options = {}) {
    if (!isConfigured()) return fallbackGetDashboard(options.gasWebAppUrl);

    const snapshot = await getLatestSnapshot({ full: false });
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

  async function uploadExcel(file, options = {}) {
    if (!isConfigured()) return fallbackUploadExcel(file, options.gasWebAppUrl);

    // โหมด Supabase only: ถ้าตั้งค่า Supabase แล้ว ให้คำนวณและบันทึกลง Supabase เท่านั้น
    // ไม่ fallback ไป Google Sheet/Apps Script เพื่อไม่ให้ช้าและไม่ให้มีข้อมูลซ้ำ
    if (!options.skipClearBeforeUpload) {
      await clearAllSnapshots({ beforeUpload: true });
    }
    const parsed = await parseExcelFile(file);
    await saveSnapshot(parsed, { skipClearBeforeSave: true });
    return toDashboard({
      file_name: parsed.fileName,
      calculated_at: parsed.calculatedAt,
      total_rows: parsed.totalRows,
      released_rows: parsed.releasedRows,
      result_rows: parsed.resultRows,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      results: parsed.results
    });
  }

  window.MinimumStockBackend = {
    uploadExcel,
    getDashboard,
    getMobilePlanning,
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
      isSplitSubunitBagNumber
    }
  };
})();
