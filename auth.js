(function () {
  "use strict";

  const backend = window.MinimumStockBackend;
  let currentAccess = null;
  let appStarted = false;
  let accessTimer = null;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/@mahidol\.ac\.th$/i, "");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(d);
    } catch (_) {
      return d.toLocaleString("th-TH");
    }
  }

  function scrubProtectedData() {
    ["topDashboard", "expiryRiskDashboard", "mobilePlanningDashboard", "outreachOutcomeDashboard", "dashboard", "adminUsersList", "adminAuditList", "adminSummary"].forEach(id => {
      const node = el(id);
      if (node) node.innerHTML = "";
    });
  }

  function clearMinimumStockCaches() {
    try {
      const remove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("minimumStock.") || key.startsWith("minstock.") || key.includes("minimum_stock"))) {
          if (key !== "minimumStock.__appVersion") remove.push(key);
        }
      }
      remove.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  }

  function setAuthMessage(message, good) {
    const box = el("authMessage");
    if (!box) return;
    if (!message) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.style.display = "block";
    box.classList.toggle("is-good", Boolean(good));
    box.classList.toggle("is-bad", !good);
    box.textContent = message;
  }

  function showAuthPanel(mode) {
    const panels = {
      login: el("authLoginPanel"),
      password: el("authChangePasswordPanel"),
      pending: el("authPendingPanel")
    };
    Object.entries(panels).forEach(([key, node]) => {
      if (node) node.style.display = key === mode ? "block" : "none";
    });
    setAuthMessage("", true);
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? text : button.dataset.originalText;
  }

  function toggleAdminUI(isAdmin) {
    document.querySelectorAll(".admin-only").forEach(node => {
      node.style.display = isAdmin ? "" : "none";
    });
  }

  function renderUserIdentity(access) {
    const name = access?.nickname || access?.displayName || access?.username || "ผู้ใช้งาน";
    if (el("currentUserName")) el("currentUserName").textContent = name;
    if (el("currentUserEmail")) el("currentUserEmail").textContent = access?.email || "";
    if (el("currentUserRole")) el("currentUserRole").textContent = access?.role === "admin" ? "Admin" : "Staff BB";
  }

  function startProtectedAppOnce() {
    if (appStarted) return;
    appStarted = true;
    window.dispatchEvent(new CustomEvent("minimumStockAuthReady", { detail: currentAccess || {} }));
  }

  async function applyAccess(access) {
    currentAccess = access || { authenticated: false, active: false, role: "", mustChangePassword: false };
    window.MinimumStockAccess = currentAccess;

    const authShell = el("authShell");
    const app = el("protectedApp");

    if (!currentAccess.authenticated) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      showAuthPanel("login");
      toggleAdminUI(false);
      return;
    }

    if (!currentAccess.active) {
      clearMinimumStockCaches();
      scrubProtectedData();
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      showAuthPanel("pending");
      if (el("authPendingMessage")) {
        el("authPendingMessage").textContent = `${currentAccess.email || "บัญชีนี้"} ถูกปิดใช้งาน หรือไม่ได้อยู่ในรายชื่อ Blood Bank กรุณาติดต่อ Admin`;
      }
      toggleAdminUI(false);
      return;
    }

    if (currentAccess.mustChangePassword) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      showAuthPanel("password");
      toggleAdminUI(false);
      return;
    }

    if (authShell) authShell.style.display = "none";
    if (app) app.style.display = "block";
    renderUserIdentity(currentAccess);
    toggleAdminUI(currentAccess.role === "admin");
    startProtectedAppOnce();
  }

  async function refreshAccess(options = {}) {
    try {
      const access = await backend.getCurrentUserAccess();
      await applyAccess(access);
      return access;
    } catch (err) {
      const session = await backend.authGetSession().catch(() => ({ session: null }));
      if (session?.session) {
        if (el("authShell")) el("authShell").style.display = "grid";
        if (el("protectedApp")) el("protectedApp").style.display = "none";
        showAuthPanel("pending");
        if (el("authPendingMessage")) el("authPendingMessage").textContent = err.message;
      } else {
        await applyAccess({ authenticated: false, active: false, role: "", mustChangePassword: false });
        setAuthMessage(err.message, false);
      }
      if (!options.silent) console.error(err);
      return null;
    }
  }

  async function doLogout() {
    const buttons = [el("logoutBtn"), el("pendingLogoutBtn"), el("changePasswordLogoutBtn")].filter(Boolean);
    buttons.forEach(btn => setBusy(btn, true, "กำลังออกจากระบบ..."));
    try {
      try { await backend.logAudit("LOGOUT", { page: location.pathname }); } catch (_) {}
      await backend.authSignOut();
      clearMinimumStockCaches();
      scrubProtectedData();
      appStarted = false;
      currentAccess = null;
      window.MinimumStockAccess = null;
      await applyAccess({ authenticated: false, active: false, role: "", mustChangePassword: false });
    } catch (err) {
      setAuthMessage(err.message, false);
    } finally {
      buttons.forEach(btn => setBusy(btn, false, ""));
    }
  }

  function friendlyLoginError(err) {
    const text = String(err?.message || err || "");
    if (/email not confirmed/i.test(text)) return "บัญชีถูกสร้างแล้ว กรุณายืนยันอีเมล Mahidol ก่อน แล้วกลับมา Login อีกครั้ง";
    if (/invalid login credentials/i.test(text)) return "Username หรือรหัสผ่านไม่ถูกต้อง";
    return text;
  }

  async function handleLogin(event) {
    event.preventDefault();
    const button = el("loginBtn");
    const username = normalizeUsername(el("loginUsername")?.value || "");
    const password = String(el("loginPassword")?.value || "");

    if (!/^[a-z0-9._-]+$/i.test(username)) {
      setAuthMessage("กรุณากรอกเฉพาะ Username เช่น parichat.ink", false);
      return;
    }
    if (password.length < 8) {
      setAuthMessage("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร", false);
      return;
    }

    setBusy(button, true, "กำลังเข้าสู่ระบบ...");
    setAuthMessage("", true);
    try {
      try {
        await backend.authSignIn(username, password);
      } catch (signInErr) {
        if (password !== username) throw signInErr;
        const bootstrap = await backend.authBootstrapFirstLogin(username, password);
        if (!bootstrap?.session) {
          setAuthMessage("เปิดบัญชีครั้งแรกแล้ว กรุณายืนยันอีเมล Mahidol จากนั้นกลับมา Login ด้วยรหัสเริ่มต้นอีกครั้ง", true);
          return;
        }
      }

      try { await backend.logAudit("LOGIN", { device: navigator.userAgent.slice(0, 180) }); } catch (_) {}
      await refreshAccess();
    } catch (err) {
      setAuthMessage(friendlyLoginError(err), false);
    } finally {
      setBusy(button, false, "");
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    const button = el("changePasswordBtn");
    const password = String(el("newPassword")?.value || "");
    const confirm = String(el("confirmNewPassword")?.value || "");
    const username = normalizeUsername(currentAccess?.username || currentAccess?.email || "");

    if (password.length < 8) {
      setAuthMessage("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", false);
      return;
    }
    if (password !== confirm) {
      setAuthMessage("ยืนยันรหัสผ่านไม่ตรงกัน", false);
      return;
    }
    if (password.toLowerCase() === username.toLowerCase()) {
      setAuthMessage("กรุณาตั้งรหัสใหม่ที่ไม่เหมือนรหัสเริ่มต้น", false);
      return;
    }

    setBusy(button, true, "กำลังบันทึก...");
    setAuthMessage("", true);
    try {
      await backend.authUpdatePassword(password);
      await backend.markPasswordChanged();
      if (el("newPassword")) el("newPassword").value = "";
      if (el("confirmNewPassword")) el("confirmNewPassword").value = "";
      await refreshAccess();
    } catch (err) {
      setAuthMessage(err.message, false);
    } finally {
      setBusy(button, false, "");
    }
  }

  function userStatusText(user) {
    if (!user.is_active) return '<span class="access-badge is-disabled">ปิดใช้งาน</span>';
    if (!user.user_id) return '<span class="access-badge is-never">ยังไม่เคยเข้า</span>';
    if (user.must_change_password) return '<span class="access-badge is-pending">รอเปลี่ยนรหัสครั้งแรก</span>';
    return '<span class="access-badge is-active">ใช้งานได้</span>';
  }

  function auditActionLabel(action) {
    const labels = {
      LOGIN: "เข้าสู่ระบบ",
      LOGOUT: "ออกจากระบบ",
      PASSWORD_CHANGED: "เปลี่ยนรหัสผ่านครั้งแรก",
      LIS_UPLOAD: "อัปเดตข้อมูล LIS",
      USER_ACCESS_CHANGE: "เปิด/ปิดบัญชี",
      CLEAR_SNAPSHOTS: "ล้าง Dashboard",
      CLEAR_LIS_MASTER: "ล้างฐานประวัติ LIS"
    };
    return labels[action] || action || "-";
  }

  function auditDetailText(log) {
    const d = log?.detail || {};
    if (log.action === "LIS_UPLOAD") {
      return `${d.fileName || "ไฟล์ LIS"}${d.upserted != null ? ` · ${Number(d.upserted).toLocaleString()} รายการ` : ""}`;
    }
    if (log.action === "USER_ACCESS_CHANGE") {
      return `${d.targetEmail || "ผู้ใช้"} · ${d.afterActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}`;
    }
    if (log.action === "CLEAR_SNAPSHOTS") return `ลบ ${Number(d.deleted || 0).toLocaleString()} snapshot`;
    if (log.action === "CLEAR_LIS_MASTER") return `ลบ master ${Number(d.deletedMasterRows || 0).toLocaleString()} รายการ`;
    return "";
  }

  async function loadAdminPanel() {
    if (currentAccess?.role !== "admin" || !currentAccess?.active || currentAccess?.mustChangePassword) return;
    const usersBox = el("adminUsersList");
    const auditBox = el("adminAuditList");
    const summaryBox = el("adminSummary");
    if (usersBox) usersBox.innerHTML = '<div class="small-muted">กำลังโหลดรายชื่อ...</div>';
    if (auditBox) auditBox.innerHTML = '<div class="small-muted">กำลังโหลด Log...</div>';

    try {
      const [users, logs] = await Promise.all([
        backend.adminListUsers(),
        backend.adminGetAuditLogs(120)
      ]);

      const activeCount = users.filter(x => x.is_active).length;
      const disabledCount = users.filter(x => !x.is_active).length;
      const neverCount = users.filter(x => !x.user_id).length;
      const adminCount = users.filter(x => x.role === "admin").length;
      if (summaryBox) {
        summaryBox.innerHTML = `
          <div class="admin-stat"><span>เปิดใช้งาน</span><strong>${activeCount}</strong></div>
          <div class="admin-stat"><span>ปิดใช้งาน</span><strong>${disabledCount}</strong></div>
          <div class="admin-stat"><span>ยังไม่เคย Login</span><strong>${neverCount}</strong></div>
          <div class="admin-stat"><span>Admin</span><strong>${adminCount}</strong></div>
        `;
      }

      if (usersBox) {
        usersBox.innerHTML = users.length ? users.map(user => {
          const isSelf = String(user.email || "").toLowerCase() === String(currentAccess.email || "").toLowerCase();
          const safeEmail = escapeHtml(user.email || "");
          const title = `${user.display_name || user.username || "ผู้ใช้งาน"}${user.nickname ? ` (${user.nickname})` : ""}`;
          const loginMeta = user.last_login_at ? ` · Login ล่าสุด ${formatDateTime(user.last_login_at)}` : " · ยังไม่เคย Login";
          return `
            <div class="admin-user-row" data-email="${safeEmail}">
              <div class="admin-user-main">
                <div class="admin-user-title">${escapeHtml(title)}</div>
                <div class="admin-user-position">${escapeHtml(user.position || "")}</div>
                <div class="admin-user-meta">${escapeHtml(user.username || "")}@mahidol.ac.th${escapeHtml(loginMeta)}</div>
              </div>
              <div class="admin-user-status">${userStatusText(user)}</div>
              <div class="admin-user-role-fixed">${user.role === "admin" ? "Admin" : "Staff BB"}</div>
              <label class="admin-switch-wrap">
                <input class="form-check-input admin-active-toggle" type="checkbox" ${user.is_active ? "checked" : ""} ${isSelf ? "disabled" : ""}>
                <span>${user.is_active ? "เปิด" : "ปิด"}</span>
              </label>
              <button class="btn btn-sm btn-main admin-save-user" type="button" ${isSelf ? "disabled" : ""}>บันทึก</button>
            </div>
          `;
        }).join("") : '<div class="small-muted">ไม่พบรายชื่อผู้ใช้งาน</div>';

        usersBox.querySelectorAll(".admin-save-user").forEach(btn => {
          btn.addEventListener("click", async () => {
            const row = btn.closest(".admin-user-row");
            const email = row?.dataset.email;
            const active = Boolean(row?.querySelector(".admin-active-toggle")?.checked);
            if (!email) return;
            setBusy(btn, true, "กำลังบันทึก...");
            try {
              await backend.adminSetUserActive(email, active);
              await loadAdminPanel();
            } catch (err) {
              if (window.showModal) window.showModal("error", "เปลี่ยนสถานะไม่สำเร็จ", err.message);
              else alert(err.message);
              setBusy(btn, false, "");
            }
          });
        });
      }

      if (auditBox) {
        auditBox.innerHTML = logs.length ? logs.map(log => `
          <div class="audit-row">
            <div class="audit-dot"></div>
            <div class="audit-main">
              <div class="audit-title">${escapeHtml(auditActionLabel(log.action))}</div>
              <div class="audit-meta">${escapeHtml(log.email || "-")} · ${formatDateTime(log.created_at)}</div>
              ${auditDetailText(log) ? `<div class="audit-detail">${escapeHtml(auditDetailText(log))}</div>` : ""}
            </div>
          </div>
        `).join("") : '<div class="small-muted">ยังไม่มี Audit Log</div>';
      }
    } catch (err) {
      if (usersBox) usersBox.innerHTML = `<div class="auth-message is-bad">${escapeHtml(err.message)}</div>`;
      if (auditBox) auditBox.innerHTML = "";
    }
  }

  function bindUI() {
    el("loginForm")?.addEventListener("submit", handleLogin);
    el("changePasswordForm")?.addEventListener("submit", handleChangePassword);
    el("logoutBtn")?.addEventListener("click", doLogout);
    el("pendingLogoutBtn")?.addEventListener("click", doLogout);
    el("changePasswordLogoutBtn")?.addEventListener("click", doLogout);
    el("pendingRefreshBtn")?.addEventListener("click", () => refreshAccess());
    el("adminRefreshBtn")?.addEventListener("click", loadAdminPanel);
  }

  async function init() {
    if (!backend) {
      setAuthMessage("ไม่พบ MinimumStockBackend", false);
      return;
    }
    bindUI();
    showAuthPanel("login");
    await refreshAccess({ silent: true });

    backend.onAuthStateChange?.((event) => {
      if (event === "SIGNED_OUT") {
        appStarted = false;
        applyAccess({ authenticated: false, active: false, role: "", mustChangePassword: false });
      }
    });

    accessTimer = window.setInterval(() => refreshAccess({ silent: true }), 60000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshAccess({ silent: true });
    });
  }

  window.MinimumStockAuthUI = {
    loadAdminPanel,
    refreshAccess,
    getCurrentAccess: () => currentAccess
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", () => {
    if (accessTimer) clearInterval(accessTimer);
  });
})();
