(function () {
  "use strict";

  const backend = window.MinimumStockBackend;
  let currentAccess = null;
  let appStarted = false;
  let accessTimer = null;
  let recoveryMode = /[?&]recovery=1\b/i.test(window.location.search) || /type=recovery/i.test(window.location.hash);
  let adminFirstLoginMode = /[?&]adminFirstLogin=1\b/i.test(window.location.search);

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/@mahidol\.ac\.th$/i, "");
  }

  function validUsername(username) {
    return /^[a-z0-9._-]+$/i.test(username || "");
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
      forgot: el("authForgotPanel"),
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

  function togglePasswordField(inputId, buttonId) {
    const input = el(inputId);
    const button = el(buttonId);
    if (!input || !button) return;
    const nextType = input.type === "password" ? "text" : "password";
    input.type = nextType;
    button.textContent = nextType === "password" ? "ดู" : "ซ่อน";
    button.setAttribute("aria-pressed", nextType === "text" ? "true" : "false");
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
    currentAccess = access || { authenticated: false, active: false, role: "" };
    window.MinimumStockAccess = currentAccess;

    const authShell = el("authShell");
    const app = el("protectedApp");

    if (!currentAccess.authenticated) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      if (!recoveryMode) showAuthPanel("login");
      toggleAdminUI(false);
      return;
    }

    if (adminFirstLoginMode) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      if (el("changePasswordHelp")) {
        el("changePasswordHelp").textContent = "ยืนยันอีเมล Admin สำเร็จแล้ว กรุณาตั้งรหัสผ่านของคุณอย่างน้อย 8 ตัวอักษร ก่อนเข้าใช้งานระบบ";
      }
      showAuthPanel("password");
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
        el("authPendingMessage").textContent = `${currentAccess.email || "บัญชีนี้"} ไม่มีสิทธิ์ Blood Stock หรือถูก Admin ปิดใช้งาน`;
      }
      toggleAdminUI(false);
      return;
    }

    if (currentAccess.mustChangePassword) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      if (el("changePasswordHelp")) {
        el("changePasswordHelp").textContent = "เข้าสู่ระบบครั้งแรกสำเร็จ กรุณาตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษรก่อนใช้งาน";
      }
      showAuthPanel("password");
      toggleAdminUI(false);
      return;
    }

    if (recoveryMode) {
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      if (el("changePasswordHelp")) {
        el("changePasswordHelp").textContent = "ตั้งรหัสใหม่อย่างน้อย 8 ตัวอักษร";
      }
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
        await applyAccess({ authenticated: false, active: false, role: "" });
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
      recoveryMode = false;
      adminFirstLoginMode = false;
      currentAccess = null;
      window.MinimumStockAccess = null;
      await applyAccess({ authenticated: false, active: false, role: "" });
    } catch (err) {
      setAuthMessage(err.message, false);
    } finally {
      buttons.forEach(btn => setBusy(btn, false, ""));
    }
  }

  function friendlyLoginError(err) {
    const text = String(err?.message || err || "");
    if (/email not confirmed/i.test(text)) return "กรุณายืนยันอีเมล Mahidol ก่อน แล้วกลับมา Login อีกครั้ง";
    if (/invalid login credentials/i.test(text)) return "Username หรือรหัสผ่านไม่ถูกต้อง หากจำรหัสไม่ได้ให้กด “ลืมรหัสผ่าน”";
    return text;
  }

  async function handleLogin(event) {
    event.preventDefault();
    const button = el("loginBtn");
    const username = normalizeUsername(el("loginUsername")?.value || "");
    const password = String(el("loginPassword")?.value || "");

    if (!validUsername(username)) {
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
      await backend.authSignIn(username, password);
      try { await backend.logAudit("LOGIN", { device: navigator.userAgent.slice(0, 180) }); } catch (_) {}
      await refreshAccess();
    } catch (err) {
      const raw = String(err?.message || err || "");
      if (/invalid login credentials/i.test(raw)) {
        try {
          const info = await backend.authRegistrationStatus(username);
          if (info?.allowed && !info?.hasAccount) {
            const role = String(info?.role || info?.userRole || info?.user_role || "").toLowerCase();
            const isFirstAdmin = role === "admin" || username === "parichat.ink";
            if (isFirstAdmin) {
              const result = await backend.authStartAdminFirstLogin(username);
              setAuthMessage(`ส่งลิงก์เปิดบัญชี Admin ไปที่ ${result?.email || username + "@mahidol.ac.th"} แล้ว\nเปิดอีเมล Mahidol แล้วกดลิงก์จากอุปกรณ์นี้ ระบบจะพาไปตั้งรหัสผ่านใหม่ทันที`, true);
              return;
            }
            if (info.passwordConfigured === false || info.hasInitialPassword === false) {
              setAuthMessage("บัญชีนี้ยังไม่มีรหัสเริ่มต้นจาก Admin\nกรุณาให้ Admin ไปที่ “จัดการผู้ใช้งาน” แล้วกดตั้งรหัสเริ่มต้นก่อน", false);
              return;
            }
            const result = await backend.authBootstrapWithInitialPassword(username, password);
            if (result?.session) {
              try { await backend.logAudit("ACCOUNT_BOOTSTRAP", { source: "admin-initial-password" }); } catch (_) {}
              await refreshAccess();
            } else {
              setAuthMessage("เปิดบัญชีจากรหัสเริ่มต้นแล้ว กรุณายืนยันอีเมล Mahidol 1 ครั้ง จากนั้น Login ด้วยรหัสเริ่มต้น ระบบจะพาเปลี่ยนรหัสทันที", true);
            }
            return;
          }
        } catch (bootstrapErr) {
          setAuthMessage(String(bootstrapErr?.message || bootstrapErr), false);
          return;
        }
      }
      setAuthMessage(friendlyLoginError(err), false);
    } finally {
      setBusy(button, false, "");
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const button = el("forgotSendBtn");
    const username = normalizeUsername(el("forgotUsername")?.value || "");
    if (!validUsername(username)) return setAuthMessage("กรุณากรอก Username เช่น parichat.ink", false);

    setBusy(button, true, "กำลังส่งอีเมล...");
    setAuthMessage("", true);
    try {
      await backend.authSendPasswordReset(username);
      setAuthMessage("ส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมล Mahidol แล้ว กรุณาเปิดอีเมลและกดลิงก์จากอุปกรณ์นี้", true);
    } catch (err) {
      setAuthMessage(String(err?.message || err), false);
    } finally {
      setBusy(button, false, "");
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    const button = el("changePasswordBtn");
    const password = String(el("newPassword")?.value || "");
    const confirm = String(el("confirmNewPassword")?.value || "");

    if (password.length < 8) return setAuthMessage("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", false);
    if (password !== confirm) return setAuthMessage("ยืนยันรหัสผ่านไม่ตรงกัน", false);

    setBusy(button, true, "กำลังบันทึก...");
    setAuthMessage("", true);
    try {
      const wasFirstLogin = Boolean(currentAccess?.mustChangePassword);
      const wasAdminFirstLogin = Boolean(adminFirstLoginMode);
      await backend.authUpdatePassword(password);
      if (wasFirstLogin) await backend.markPasswordChanged();
      const auditAction = wasAdminFirstLogin ? "ADMIN_FIRST_PASSWORD_SET" : (wasFirstLogin ? "FIRST_PASSWORD_CHANGED" : (recoveryMode ? "PASSWORD_RESET" : "PASSWORD_CHANGED"));
      try { await backend.logAudit(auditAction, { sharedAuth: true }); } catch (_) {}
      if (el("newPassword")) el("newPassword").value = "";
      if (el("confirmNewPassword")) el("confirmNewPassword").value = "";
      recoveryMode = false;
      adminFirstLoginMode = false;
      if (history.replaceState) history.replaceState({}, document.title, window.location.pathname);
      await refreshAccess();
    } catch (err) {
      setAuthMessage(err.message, false);
    } finally {
      setBusy(button, false, "");
    }
  }

  function userStatusText(user) {
    if (!user.is_active) return '<span class="access-badge is-disabled">ปิดสิทธิ์ Blood Stock</span>';
    if (!user.user_id && user.has_initial_password) return '<span class="access-badge is-pending">รหัสเริ่มต้นพร้อม</span>';
    if (!user.user_id) return '<span class="access-badge is-never">รอตั้งรหัสเริ่มต้น</span>';
    if (user.must_change_password) return '<span class="access-badge is-pending">รอเปลี่ยนรหัสครั้งแรก</span>';
    return '<span class="access-badge is-active">ใช้งานได้</span>';
  }

  function auditActionLabel(action) {
    const labels = {
      LOGIN: "เข้าสู่ระบบ",
      LOGOUT: "ออกจากระบบ",
      ACCOUNT_REGISTER: "เปิดบัญชีกลางครั้งแรก",
      ACCOUNT_BOOTSTRAP: "เปิดบัญชีด้วยรหัสเริ่มต้น",
      INITIAL_PASSWORD_SET: "Admin ตั้งรหัสเริ่มต้น",
      FIRST_PASSWORD_CHANGED: "เปลี่ยนรหัสหลัง Login ครั้งแรก",
      ADMIN_FIRST_PASSWORD_SET: "Admin เปิดบัญชีและตั้งรหัสครั้งแรก",
      PASSWORD_RESET: "ตั้งรหัสผ่านใหม่",
      PASSWORD_CHANGED: "เปลี่ยนรหัสผ่าน",
      LIS_UPLOAD: "อัปเดตข้อมูล LIS",
      USER_ACCESS_CHANGE: "เปิด/ปิดสิทธิ์ Blood Stock",
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
    if (log.action === "INITIAL_PASSWORD_SET") {
      return `${d.targetEmail || "ผู้ใช้"} · กำหนดรหัสเริ่มต้นแล้ว`;
    }
    if (log.action === "CLEAR_SNAPSHOTS") return `ลบ ${Number(d.deleted || 0).toLocaleString()} snapshot`;
    if (log.action === "CLEAR_LIS_MASTER") return `ลบ master ${Number(d.deletedMasterRows || 0).toLocaleString()} รายการ`;
    return "";
  }

  async function loadAdminPanel() {
    if (currentAccess?.role !== "admin" || !currentAccess?.active) return;
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
      const readyInitialCount = users.filter(x => !x.user_id && x.has_initial_password).length;
      const adminCount = users.filter(x => x.role === "admin").length;
      if (summaryBox) {
        summaryBox.innerHTML = `
          <div class="admin-stat"><span>มีสิทธิ์ Blood Stock</span><strong>${activeCount}</strong></div>
          <div class="admin-stat"><span>ปิดสิทธิ์</span><strong>${disabledCount}</strong></div>
          <div class="admin-stat"><span>ยังไม่มีบัญชีกลาง</span><strong>${neverCount}</strong></div>
          <div class="admin-stat"><span>รหัสเริ่มต้นพร้อม</span><strong>${readyInitialCount}</strong></div>
        `;
      }

      if (usersBox) {
        usersBox.innerHTML = users.length ? users.map(user => {
          const isSelf = String(user.email || "").toLowerCase() === String(currentAccess.email || "").toLowerCase();
          const safeEmail = escapeHtml(user.email || "");
          const title = `${user.display_name || user.username || "ผู้ใช้งาน"}${user.nickname ? ` (${user.nickname})` : ""}`;
          const loginMeta = user.last_login_at ? ` · Login ล่าสุด ${formatDateTime(user.last_login_at)}` : " · ยังไม่เคย Login Blood Stock";
          return `
            <div class="admin-user-row" data-email="${safeEmail}">
              <div class="admin-user-main">
                <div class="admin-user-title">${escapeHtml(title)}</div>
                <div class="admin-user-position">${escapeHtml(user.position || "")}</div>
                <div class="admin-user-meta">${escapeHtml(user.username || "")}@mahidol.ac.th${escapeHtml(loginMeta)}</div>
              </div>
              <div class="admin-user-status">${userStatusText(user)}</div>
              <div class="admin-user-role-fixed">${user.role === "admin" ? "Admin" : "Staff BB"}</div>
              <div class="admin-password-cell">
                ${!user.user_id && user.is_active ? `<button class="btn btn-sm btn-light admin-init-password" type="button">${user.has_initial_password ? "ตั้งรหัสใหม่" : "ตั้งรหัสเริ่มต้น"}</button>` : `<span class="admin-password-state">${user.user_id ? "บัญชีกลางแล้ว" : "-"}</span>`}
              </div>
              <label class="admin-switch-wrap">
                <input class="form-check-input admin-active-toggle" type="checkbox" ${user.is_active ? "checked" : ""} ${isSelf ? "disabled" : ""}>
                <span>${user.is_active ? "เปิด" : "ปิด"}</span>
              </label>
              <button class="btn btn-sm btn-main admin-save-user" type="button" ${isSelf ? "disabled" : ""}>บันทึก</button>
            </div>
          `;
        }).join("") : '<div class="small-muted">ไม่พบรายชื่อผู้ใช้งาน</div>';

        usersBox.querySelectorAll(".admin-init-password").forEach(btn => {
          btn.addEventListener("click", () => {
            const row = btn.closest(".admin-user-row");
            const email = row?.dataset.email;
            const title = row?.querySelector(".admin-user-title")?.textContent || email || "ผู้ใช้งาน";
            if (email) openAdminPasswordModal(email, title);
          });
        });

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

  let adminPasswordTargetEmail = "";

  function openAdminPasswordModal(email, title) {
    adminPasswordTargetEmail = String(email || "").toLowerCase();
    if (el("adminPasswordTarget")) el("adminPasswordTarget").textContent = `${title} · ${adminPasswordTargetEmail}`;
    if (el("adminInitialPassword")) el("adminInitialPassword").value = "";
    if (el("adminInitialPasswordConfirm")) el("adminInitialPasswordConfirm").value = "";
    if (el("adminPasswordOverlay")) el("adminPasswordOverlay").style.display = "flex";
    setTimeout(() => el("adminInitialPassword")?.focus(), 20);
  }

  function closeAdminPasswordModal() {
    adminPasswordTargetEmail = "";
    if (el("adminPasswordOverlay")) el("adminPasswordOverlay").style.display = "none";
  }

  async function handleAdminInitialPassword(event) {
    event.preventDefault();
    const button = el("adminPasswordSaveBtn");
    const password = String(el("adminInitialPassword")?.value || "");
    const confirm = String(el("adminInitialPasswordConfirm")?.value || "");
    if (!adminPasswordTargetEmail) return;
    if (password.length < 8) {
      if (window.showModal) window.showModal("error", "รหัสสั้นเกินไป", "รหัสเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      if (window.showModal) window.showModal("error", "รหัสไม่ตรงกัน", "กรุณากรอกรหัสเริ่มต้นและยืนยันให้ตรงกัน");
      return;
    }
    setBusy(button, true, "กำลังบันทึก...");
    try {
      await backend.adminSetInitialPassword(adminPasswordTargetEmail, password);
      closeAdminPasswordModal();
      if (window.showModal) window.showModal("success", "ตั้งรหัสเริ่มต้นแล้ว", "แจ้ง Username และรหัสเริ่มต้นให้เจ้าหน้าที่ได้เลย เมื่อ Login ครั้งแรกระบบจะบังคับเปลี่ยนรหัสใหม่");
      await loadAdminPanel();
    } catch (err) {
      if (window.showModal) window.showModal("error", "ตั้งรหัสไม่สำเร็จ", err.message);
      else alert(err.message);
    } finally {
      setBusy(button, false, "");
    }
  }

  function bindUI() {
    el("loginForm")?.addEventListener("submit", handleLogin);
    el("forgotPasswordForm")?.addEventListener("submit", handleForgotPassword);
    el("changePasswordForm")?.addEventListener("submit", handleChangePassword);

    el("toggleLoginPasswordBtn")?.addEventListener("click", () => togglePasswordField("loginPassword", "toggleLoginPasswordBtn"));
    el("toggleNewPasswordBtn")?.addEventListener("click", () => togglePasswordField("newPassword", "toggleNewPasswordBtn"));
    el("toggleConfirmPasswordBtn")?.addEventListener("click", () => togglePasswordField("confirmNewPassword", "toggleConfirmPasswordBtn"));

    el("forgotPasswordBtn")?.addEventListener("click", () => {
      const username = normalizeUsername(el("loginUsername")?.value || "");
      if (el("forgotUsername")) el("forgotUsername").value = username;
      showAuthPanel("forgot");
    });
    el("forgotBackBtn")?.addEventListener("click", () => showAuthPanel("login"));
    el("adminPasswordForm")?.addEventListener("submit", handleAdminInitialPassword);
    el("adminPasswordCancelBtn")?.addEventListener("click", closeAdminPasswordModal);
    el("adminPasswordOverlay")?.addEventListener("click", (event) => { if (event.target === el("adminPasswordOverlay")) closeAdminPasswordModal(); });

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
    showAuthPanel((recoveryMode || adminFirstLoginMode) ? "password" : "login");

    backend.onAuthStateChange?.((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
        setTimeout(() => refreshAccess({ silent: true }), 0);
      } else if (event === "SIGNED_OUT") {
        appStarted = false;
        recoveryMode = false;
        adminFirstLoginMode = false;
        applyAccess({ authenticated: false, active: false, role: "" });
      }
    });

    await refreshAccess({ silent: true });
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
