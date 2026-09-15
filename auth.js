(function () {
  "use strict";

  const backend = window.MinimumStockBackend;
  let currentAccess = null;
  let appStarted = false;
  let accessTimer = null;
  let recoveryMode = /[?&]recovery=1\b/i.test(window.location.search) || /type=recovery/i.test(window.location.hash);

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


    if (!currentAccess.active) {
      clearMinimumStockCaches();
      scrubProtectedData();
      if (app) app.style.display = "none";
      if (authShell) authShell.style.display = "grid";
      showAuthPanel("pending");
      if (el("authPendingMessage")) {
        const reason = String(currentAccess.reason || "");
        if (reason === "not_in_minimum_stock_directory") {
          el("authPendingMessage").textContent = `${currentAccess.authEmail || currentAccess.email || "บัญชีนี้"} ยังไม่ได้ผูกกับรายชื่อผู้ใช้ Minimum Stock`;
        } else if (reason === "wrong_app_identity") {
          el("authPendingMessage").textContent = `${currentAccess.email || "บัญชีนี้"} เป็นบัญชีของแอปอื่น ไม่ใช่ Minimum Stock`;
        } else {
          el("authPendingMessage").textContent = `${currentAccess.email || "บัญชีนี้"} ไม่มีสิทธิ์ Blood Stock หรือถูก Admin ปิดใช้งาน`;
        }
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
            if (role === "admin" || username === "parichat.ink") {
              setAuthMessage(`บัญชี Admin ของ Minimum Stock ยังไม่ถูกสร้าง
สร้างใน Supabase Authentication 1 ครั้งด้วยอีเมล:
minimum.${username}@auth.cnmiblood.com
จากนั้นกลับมา Login ด้วย Username ${username}`, false);
              return;
            }
            setAuthMessage(`บัญชี Minimum Stock นี้ยังไม่ถูกสร้าง
กรุณาให้ Admin ไปที่ “จัดการผู้ใช้งาน” แล้วตั้งรหัสชั่วคราวก่อน`, false);
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
    const username = normalizeUsername(el("forgotUsername")?.value || "");
    if (!validUsername(username)) return setAuthMessage("กรุณากรอก Username เช่น parichat.ink", false);
    setAuthMessage("Minimum Stock ใช้รหัสแยกจากแอปอื่น กรุณาติดต่อ Admin ให้รีเซ็ตรหัสจากเมนู “จัดการผู้ใช้งาน”", false);
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
      await backend.authUpdatePassword(password);
      if (wasFirstLogin) await backend.markPasswordChanged();
      const auditAction = wasFirstLogin ? "FIRST_PASSWORD_CHANGED" : (recoveryMode ? "PASSWORD_RESET" : "PASSWORD_CHANGED");
      try { await backend.logAudit(auditAction, { app: "minimum_stock" }); } catch (_) {}
      if (el("newPassword")) el("newPassword").value = "";
      if (el("confirmNewPassword")) el("confirmNewPassword").value = "";
      recoveryMode = false;
      if (history.replaceState) history.replaceState({}, document.title, window.location.pathname);
      await refreshAccess();
    } catch (err) {
      setAuthMessage(err.message, false);
    } finally {
      setBusy(button, false, "");
    }
  }

  function userStatusText(user) {
    if (!user.is_active) return '<span class="access-badge is-disabled">ปิดใช้งาน</span>';
    if (!user.user_id) return '<span class="access-badge is-never">ยังไม่ได้ตั้งรหัส</span>';
    if (user.must_change_password) return '<span class="access-badge is-pending">รอเปลี่ยนรหัสครั้งแรก</span>';
    return '<span class="access-badge is-active">ใช้งานได้</span>';
  }

  function auditActionLabel(action) {
    const labels = {
      LOGIN: "เข้าสู่ระบบ",
      LOGOUT: "ออกจากระบบ",
      ACCOUNT_REGISTER: "เปิดบัญชีกลางครั้งแรก",
      ACCOUNT_BOOTSTRAP: "เปิดบัญชีด้วยรหัสเริ่มต้น",
      INITIAL_PASSWORD_SET: "Admin ตั้ง/รีเซ็ตรหัส",
      FIRST_PASSWORD_CHANGED: "เปลี่ยนรหัสหลัง Login ครั้งแรก",
      ADMIN_FIRST_PASSWORD_SET: "Admin เปิดบัญชีและตั้งรหัสครั้งแรก",
      PASSWORD_RESET: "ตั้งรหัสผ่านใหม่",
      PASSWORD_CHANGED: "เปลี่ยนรหัสผ่าน",
      LIS_UPLOAD: "อัปเดตข้อมูล LIS",
      USER_CREATED: "เพิ่มผู้ใช้งาน",
      USER_PROFILE_UPDATED: "แก้ไขข้อมูลผู้ใช้งาน",
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
    if (log.action === "USER_CREATED") {
      return `${d.username || d.targetEmail || "ผู้ใช้"}${d.displayName ? ` · ${d.displayName}` : ""}`;
    }
    if (log.action === "USER_PROFILE_UPDATED") {
      return `${d.username || d.targetEmail || "ผู้ใช้"}${d.displayName ? ` · ${d.displayName}` : ""}`;
    }
    if (log.action === "USER_ACCESS_CHANGE") {
      return `${d.targetEmail || "ผู้ใช้"} · ${d.afterActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}`;
    }
    if (log.action === "INITIAL_PASSWORD_SET") {
      return `${d.targetEmail || "ผู้ใช้"} · กำหนดรหัสชั่วคราวแล้ว`;
    }
    if (log.action === "CLEAR_SNAPSHOTS") return `ลบ ${Number(d.deleted || 0).toLocaleString()} snapshot`;
    if (log.action === "CLEAR_LIS_MASTER") return `ลบ master ${Number(d.deletedMasterRows || 0).toLocaleString()} รายการ`;
    return "";
  }

  let adminUsersCache = [];

  async function loadAdminPanel() {
    if (currentAccess?.role !== "admin" || !currentAccess?.active) return;
    const usersBox = el("adminUsersList");
    const summaryBox = el("adminSummary");
    if (usersBox) usersBox.innerHTML = '<div class="small-muted">กำลังโหลดรายชื่อ...</div>';

    try {
      const users = await backend.adminListUsers();
      adminUsersCache = Array.isArray(users) ? users : [];

      const activeCount = adminUsersCache.filter(x => x.is_active).length;
      const disabledCount = adminUsersCache.filter(x => !x.is_active).length;
      const neverCount = adminUsersCache.filter(x => !x.user_id).length;
      const pendingPasswordCount = adminUsersCache.filter(x => x.user_id && x.must_change_password).length;
      if (summaryBox) {
        summaryBox.innerHTML = `
          <div class="admin-stat"><span>เปิดใช้งาน</span><strong>${activeCount}</strong></div>
          <div class="admin-stat"><span>ปิดใช้งาน</span><strong>${disabledCount}</strong></div>
          <div class="admin-stat"><span>ยังไม่ได้ตั้งรหัส</span><strong>${neverCount}</strong></div>
          <div class="admin-stat"><span>รอเปลี่ยนรหัสครั้งแรก</span><strong>${pendingPasswordCount}</strong></div>
        `;
      }

      if (usersBox) {
        usersBox.innerHTML = adminUsersCache.length ? adminUsersCache.map(user => {
          const isSelf = String(user.email || "").toLowerCase() === String(currentAccess.email || "").toLowerCase();
          const username = String(user.username || "");
          const safeUsername = escapeHtml(username);
          const title = `${user.display_name || username || "ผู้ใช้งาน"}${user.nickname ? ` (${user.nickname})` : ""}`;
          const loginMeta = user.last_login_at ? `Login ล่าสุด ${formatDateTime(user.last_login_at)}` : "ยังไม่เคย Login Minimum Stock";
          return `
            <div class="admin-user-row" data-username="${safeUsername}">
              <div class="admin-user-main">
                <div class="admin-user-title">${escapeHtml(title)}</div>
                <div class="admin-user-position">${escapeHtml(user.position || "ไม่ระบุตำแหน่ง")}</div>
                <div class="admin-user-meta">${escapeHtml(username)}@mahidol.ac.th · ${escapeHtml(loginMeta)}</div>
              </div>
              <div class="admin-user-status">${userStatusText(user)}</div>
              <div class="admin-user-role-fixed">${user.role === "admin" ? "Admin" : "Staff"}</div>
              <div class="admin-user-actions">
                <button class="btn btn-sm btn-light admin-edit-user" type="button">แก้ไข</button>
                ${user.is_active && !isSelf ? `<button class="btn btn-sm btn-light admin-init-password" type="button">${user.user_id ? "รีเซ็ตรหัส" : "ตั้งรหัสชั่วคราว"}</button>` : ""}
              </div>
              <label class="admin-switch-wrap ${isSelf ? "is-self" : ""}">
                <input class="form-check-input admin-active-toggle" type="checkbox" ${user.is_active ? "checked" : ""} ${isSelf ? "disabled" : ""}>
                <span>${isSelf ? "บัญชีของคุณ" : (user.is_active ? "เปิด" : "ปิด")}</span>
              </label>
            </div>
          `;
        }).join("") : '<div class="small-muted">ไม่พบรายชื่อผู้ใช้งาน</div>';

        usersBox.querySelectorAll(".admin-edit-user").forEach(btn => {
          btn.addEventListener("click", () => {
            const row = btn.closest(".admin-user-row");
            const username = row?.dataset.username || "";
            const user = adminUsersCache.find(item => String(item.username || "") === username);
            if (user) openAdminEditUserModal(user);
          });
        });

        usersBox.querySelectorAll(".admin-init-password").forEach(btn => {
          btn.addEventListener("click", () => {
            const row = btn.closest(".admin-user-row");
            const username = row?.dataset.username || "";
            const user = adminUsersCache.find(item => String(item.username || "") === username);
            if (!user) return;
            const title = `${user.display_name || user.username || "ผู้ใช้งาน"}${user.nickname ? ` (${user.nickname})` : ""}`;
            openAdminPasswordModal(user.email || `${username}@mahidol.ac.th`, title);
          });
        });

        usersBox.querySelectorAll(".admin-active-toggle").forEach(toggle => {
          toggle.addEventListener("change", async () => {
            const row = toggle.closest(".admin-user-row");
            const username = row?.dataset.username || "";
            const user = adminUsersCache.find(item => String(item.username || "") === username);
            if (!user) return;
            const active = Boolean(toggle.checked);
            toggle.disabled = true;
            const text = row?.querySelector(".admin-switch-wrap span");
            if (text) text.textContent = "กำลังบันทึก...";
            try {
              await backend.adminSetUserActive(user.email || `${username}@mahidol.ac.th`, active);
              await loadAdminPanel();
            } catch (err) {
              toggle.checked = !active;
              toggle.disabled = false;
              if (text) text.textContent = toggle.checked ? "เปิด" : "ปิด";
              if (window.showModal) window.showModal("error", "เปลี่ยนสถานะไม่สำเร็จ", err.message);
              else alert(err.message);
            }
          });
        });
      }
    } catch (err) {
      if (usersBox) usersBox.innerHTML = `<div class="auth-message is-bad">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadAuditPanel() {
    if (currentAccess?.role !== "admin" || !currentAccess?.active) return;
    const auditBox = el("adminAuditList");
    if (!auditBox) return;
    auditBox.innerHTML = '<div class="small-muted">กำลังโหลด Log...</div>';
    try {
      const logs = await backend.adminGetAuditLogs(200);
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
    } catch (err) {
      auditBox.innerHTML = `<div class="auth-message is-bad">${escapeHtml(err.message)}</div>`;
    }
  }

  async function handleAdminAddUser(event) {
    event.preventDefault();
    if (currentAccess?.role !== "admin") return;

    const button = el("adminAddUserSaveBtn");
    const username = normalizeUsername(el("adminNewUsername")?.value || "");
    const displayName = String(el("adminNewDisplayName")?.value || "").trim();
    const nickname = String(el("adminNewNickname")?.value || "").trim();
    const position = String(el("adminNewPosition")?.value || "").trim();
    const password = String(el("adminNewPassword")?.value || "");
    const confirm = String(el("adminNewPasswordConfirm")?.value || "");
    const isActive = Boolean(el("adminNewActive")?.checked);

    if (!validUsername(username)) {
      if (window.showModal) window.showModal("error", "Username ไม่ถูกต้อง", "กรอกเฉพาะ Username Mahidol เช่น somchai.jai");
      return;
    }
    if (!displayName) {
      if (window.showModal) window.showModal("error", "กรอกชื่อ - นามสกุล", "กรุณาระบุชื่อ - นามสกุลของผู้ใช้งาน");
      return;
    }
    if (password.length < 8) {
      if (window.showModal) window.showModal("error", "รหัสสั้นเกินไป", "รหัสชั่วคราวต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      if (window.showModal) window.showModal("error", "รหัสไม่ตรงกัน", "กรุณากรอกรหัสชั่วคราวและยืนยันให้ตรงกัน");
      return;
    }

    setBusy(button, true, "กำลังเพิ่มผู้ใช้...");
    let directoryCreated = false;
    try {
      await backend.adminCreateUser({
        username,
        displayName,
        nickname,
        position,
        isActive
      });
      directoryCreated = true;

      if (isActive) {
        await backend.adminSetInitialPassword(`${username}@mahidol.ac.th`, password);
      }

      try {
        await backend.logAudit("USER_CREATED", {
          username,
          targetEmail: `${username}@mahidol.ac.th`,
          displayName,
          nickname,
          position,
          isActive
        });
      } catch (_) {}
      if (isActive) {
        try { await backend.logAudit("INITIAL_PASSWORD_SET", { targetEmail: `${username}@mahidol.ac.th`, app: "minimum_stock" }); } catch (_) {}
      }

      event.currentTarget.reset();
      if (el("adminNewActive")) el("adminNewActive").checked = true;
      if (window.showModal) {
        window.showModal(
          "success",
          "เพิ่มผู้ใช้งานแล้ว",
          isActive
            ? `${displayName} ใช้ Username ${username} และรหัสชั่วคราวที่กำหนดเพื่อ Login ครั้งแรกได้เลย`
            : `${displayName} ถูกเพิ่มในรายชื่อแล้ว แต่ยังปิดใช้งานอยู่`
        );
      }
      await loadAdminPanel();
    } catch (err) {
      const message = directoryCreated
        ? `เพิ่มรายชื่อผู้ใช้แล้ว แต่ตั้งรหัสชั่วคราวไม่สำเร็จ: ${err.message}\nสามารถไปที่ “จัดการผู้ใช้” แล้วกดตั้งรหัสชั่วคราวได้`
        : err.message;
      if (window.showModal) window.showModal("error", "เพิ่มผู้ใช้งานไม่สำเร็จ", message);
      else alert(message);
      if (directoryCreated) await loadAdminPanel();
    } finally {
      setBusy(button, false, "");
    }
  }

  let adminEditUsername = "";

  function openAdminEditUserModal(user) {
    adminEditUsername = String(user?.username || "");
    if (!adminEditUsername) return;
    if (el("adminEditUserAccount")) el("adminEditUserAccount").textContent = `${adminEditUsername}@mahidol.ac.th`;
    if (el("adminEditDisplayName")) el("adminEditDisplayName").value = user?.display_name || "";
    if (el("adminEditNickname")) el("adminEditNickname").value = user?.nickname || "";
    if (el("adminEditPosition")) el("adminEditPosition").value = user?.position || "";
    if (el("adminEditUserOverlay")) el("adminEditUserOverlay").style.display = "flex";
    setTimeout(() => el("adminEditDisplayName")?.focus(), 20);
  }

  function closeAdminEditUserModal() {
    adminEditUsername = "";
    if (el("adminEditUserOverlay")) el("adminEditUserOverlay").style.display = "none";
  }

  async function handleAdminEditUser(event) {
    event.preventDefault();
    if (!adminEditUsername) return;
    const button = el("adminEditUserSaveBtn");
    const displayName = String(el("adminEditDisplayName")?.value || "").trim();
    const nickname = String(el("adminEditNickname")?.value || "").trim();
    const position = String(el("adminEditPosition")?.value || "").trim();
    if (!displayName) {
      if (window.showModal) window.showModal("error", "กรอกชื่อ - นามสกุล", "ชื่อ - นามสกุลต้องไม่ว่าง");
      return;
    }

    setBusy(button, true, "กำลังบันทึก...");
    const targetUsername = adminEditUsername;
    try {
      await backend.adminUpdateUser({
        username: targetUsername,
        displayName,
        nickname,
        position
      });
      try {
        await backend.logAudit("USER_PROFILE_UPDATED", {
          username: targetUsername,
          targetEmail: `${targetUsername}@mahidol.ac.th`,
          displayName,
          nickname,
          position
        });
      } catch (_) {}
      closeAdminEditUserModal();
      if (window.showModal) window.showModal("success", "บันทึกแล้ว", "อัปเดตชื่อและข้อมูลผู้ใช้งานเรียบร้อย");
      await loadAdminPanel();
      if (targetUsername === currentAccess?.username) await refreshAccess({ silent: true });
    } catch (err) {
      if (window.showModal) window.showModal("error", "บันทึกไม่สำเร็จ", err.message);
      else alert(err.message);
    } finally {
      setBusy(button, false, "");
    }
  }

  let adminPasswordTargetEmail = "";

  function openAdminPasswordModal(email, title) {
    adminPasswordTargetEmail = String(email || "").toLowerCase();
    if (el("adminPasswordTitle")) el("adminPasswordTitle").textContent = "ตั้ง / รีเซ็ตรหัส Minimum Stock";
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
      if (window.showModal) window.showModal("error", "รหัสสั้นเกินไป", "รหัสชั่วคราวต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      if (window.showModal) window.showModal("error", "รหัสไม่ตรงกัน", "กรุณากรอกรหัสชั่วคราวและยืนยันให้ตรงกัน");
      return;
    }
    setBusy(button, true, "กำลังบันทึก...");
    try {
      await backend.adminSetInitialPassword(adminPasswordTargetEmail, password);
      try { await backend.logAudit("INITIAL_PASSWORD_SET", { targetEmail: adminPasswordTargetEmail, app: "minimum_stock" }); } catch (_) {}
      closeAdminPasswordModal();
      if (window.showModal) window.showModal("success", "ตั้ง/รีเซ็ตรหัสแล้ว", "รหัสนี้ใช้เฉพาะ Minimum Stock เท่านั้น เมื่อ Staff Login ระบบจะบังคับตั้งรหัสใหม่");
      await loadAdminPanel();
    } catch (err) {
      if (window.showModal) window.showModal("error", "ตั้ง/รีเซ็ตรหัสไม่สำเร็จ", err.message);
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
    el("toggleAdminNewPasswordBtn")?.addEventListener("click", () => togglePasswordField("adminNewPassword", "toggleAdminNewPasswordBtn"));
    el("toggleAdminNewPasswordConfirmBtn")?.addEventListener("click", () => togglePasswordField("adminNewPasswordConfirm", "toggleAdminNewPasswordConfirmBtn"));

    el("forgotPasswordBtn")?.addEventListener("click", () => {
      const username = normalizeUsername(el("loginUsername")?.value || "");
      if (el("forgotUsername")) el("forgotUsername").value = username;
      showAuthPanel("forgot");
    });
    el("forgotBackBtn")?.addEventListener("click", () => showAuthPanel("login"));
    el("adminAddUserForm")?.addEventListener("submit", handleAdminAddUser);
    el("adminEditUserForm")?.addEventListener("submit", handleAdminEditUser);
    el("adminEditUserCancelBtn")?.addEventListener("click", closeAdminEditUserModal);
    el("adminEditUserOverlay")?.addEventListener("click", (event) => { if (event.target === el("adminEditUserOverlay")) closeAdminEditUserModal(); });
    el("adminPasswordForm")?.addEventListener("submit", handleAdminInitialPassword);
    el("adminPasswordCancelBtn")?.addEventListener("click", closeAdminPasswordModal);
    el("adminPasswordOverlay")?.addEventListener("click", (event) => { if (event.target === el("adminPasswordOverlay")) closeAdminPasswordModal(); });

    el("logoutBtn")?.addEventListener("click", doLogout);
    el("pendingLogoutBtn")?.addEventListener("click", doLogout);
    el("changePasswordLogoutBtn")?.addEventListener("click", doLogout);
    el("pendingRefreshBtn")?.addEventListener("click", () => refreshAccess());
    el("adminRefreshBtn")?.addEventListener("click", loadAdminPanel);
    el("adminAuditRefreshBtn")?.addEventListener("click", loadAuditPanel);
  }

  async function init() {
    if (!backend) {
      setAuthMessage("ไม่พบ MinimumStockBackend", false);
      return;
    }
    bindUI();
    showAuthPanel(recoveryMode ? "password" : "login");

    backend.onAuthStateChange?.((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
        setTimeout(() => refreshAccess({ silent: true }), 0);
      } else if (event === "SIGNED_OUT") {
        appStarted = false;
        recoveryMode = false;
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
    loadAuditPanel,
    refreshAccess,
    getCurrentAccess: () => currentAccess
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", () => {
    if (accessTimer) clearInterval(accessTimer);
  });
})();
