(function () {
  'use strict';

  const cfg = window.MINIMUM_STOCK_CONFIG || {};
  let client = null;
  let handlingBootstrap = false;
  let adminListLoaded = false;

  const $ = (id) => document.getElementById(id);

  function getClient() {
    if (client) return client;
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('ยังไม่ได้ตั้งค่า Supabase');
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  function normalizeUsername(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/@mahidol\.ac\.th$/i, '');
  }

  function showAuthMessage(message, isError) {
    const box = $('authMessage');
    if (!box) {
      if (message) alert(message);
      return;
    }
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
    box.className = 'auth-message ' + (isError ? 'is-error' : 'is-info');
  }

  function setStatus(message, isError) {
    const el = $('adminInitialPasswordStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = (isError ? 'text-danger' : 'small-muted') + ' mt-2';
  }

  async function interceptFirstLogin(event) {
    if (handlingBootstrap) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const usernameInput = $('loginUsername');
    const passwordInput = $('loginPassword');
    if (!usernameInput || !passwordInput) return;

    const username = normalizeUsername(usernameInput.value);
    const password = passwordInput.value || '';
    if (!username || password.length < 8) return; // ให้ auth.js เดิมจัด validation

    handlingBootstrap = true;
    try {
      const sb = getClient();
      const { data: info, error: infoError } = await sb.rpc('minimum_stock_can_bootstrap_user', {
        p_username: username
      });
      if (infoError) throw infoError;

      // บัญชีเปิดแล้ว: ให้ auth.js เดิม Login ตามปกติ
      if (info && info.hasAccount) return;

      // ตั้งแต่ตรงนี้ต้องหยุด flow เดิมที่เคยบังคับ password=username
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!info || !info.allowed) {
        showAuthMessage('Username นี้ไม่มีสิทธิ์ใช้งาน หรือถูกปิดบัญชี', true);
        return;
      }

      const { data: verify, error: verifyError } = await sb.rpc('minimum_stock_verify_initial_password', {
        p_username: username,
        p_password: password
      });
      if (verifyError) throw verifyError;

      if (!verify || !verify.passwordConfigured) {
        showAuthMessage('Admin ยังไม่ได้กำหนดรหัสผ่านเริ่มต้นให้บัญชีนี้', true);
        return;
      }
      if (!verify.matched) {
        showAuthMessage('รหัสผ่านเริ่มต้นไม่ถูกต้อง กรุณาตรวจสอบกับ Admin', true);
        return;
      }

      showAuthMessage('กำลังเปิดบัญชีครั้งแรก...', false);
      const email = username + '@mahidol.ac.th';
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { minimum_stock_first_login: true } }
      });
      if (error) throw error;

      if (data && data.session) {
        // ให้ auth.js เดิมรับ session แล้วพาไปหน้าเปลี่ยนรหัส
        window.location.reload();
        return;
      }

      passwordInput.value = '';
      showAuthMessage('สร้างบัญชีแล้ว กรุณายืนยันอีเมล Mahidol จากนั้นกลับมา Login อีกครั้งด้วยรหัสเริ่มต้นที่ Admin กำหนด', false);
    } catch (err) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.error(err);
      const msg = String(err && err.message ? err.message : err);
      if (/already registered|already been registered|user already/i.test(msg)) {
        showAuthMessage('บัญชีถูกสร้างแล้ว กรุณา Login ด้วยรหัสผ่านของบัญชี', true);
      } else {
        showAuthMessage('เปิดบัญชีครั้งแรกไม่สำเร็จ: ' + msg, true);
      }
    } finally {
      handlingBootstrap = false;
    }
  }

  async function loadAdminInitialPasswordUsers(force) {
    const select = $('adminInitialPasswordUser');
    if (!select) return;
    if (adminListLoaded && !force) return;

    setStatus('กำลังโหลดรายชื่อ...', false);
    try {
      const { data, error } = await getClient().rpc('minimum_stock_admin_list_users_v2');
      if (error) throw error;
      const users = (data || []).filter((u) => u.role !== 'admin');
      select.innerHTML = '<option value="">เลือกผู้ใช้งาน</option>' + users.map((u) => {
        const created = Boolean(u.user_id);
        const disabled = created || !u.is_active;
        let state = '';
        if (!u.is_active) state = ' — ปิดใช้งาน';
        else if (created) state = ' — เปิดบัญชีแล้ว';
        else if (u.has_initial_password) state = ' — มีรหัสเริ่มต้นแล้ว';
        else state = ' — ยังไม่ได้ตั้งรหัส';
        return '<option value="' + escapeHtml(u.email) + '" ' + (disabled ? 'disabled' : '') + '>' +
          escapeHtml(u.username + ' · ' + u.nickname + state) + '</option>';
      }).join('');
      adminListLoaded = true;
      setStatus('เลือกเจ้าหน้าที่ที่ยังไม่เคยเปิดบัญชี แล้วกำหนดรหัสเริ่มต้นอย่างน้อย 8 ตัวอักษร', false);
    } catch (err) {
      console.error(err);
      select.innerHTML = '<option value="">โหลดรายชื่อไม่สำเร็จ</option>';
      setStatus('โหลดรายชื่อไม่สำเร็จ: ' + (err.message || err), true);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function saveInitialPassword() {
    const select = $('adminInitialPasswordUser');
    const input = $('adminInitialPasswordValue');
    const btn = $('adminInitialPasswordSaveBtn');
    const email = select ? select.value : '';
    const password = input ? input.value : '';

    if (!email) return setStatus('กรุณาเลือกผู้ใช้งาน', true);
    if (password.length < 8) return setStatus('รหัสเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร', true);

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'กำลังบันทึก...';
    try {
      const { error } = await getClient().rpc('minimum_stock_admin_set_initial_password', {
        p_email: email,
        p_password: password
      });
      if (error) throw error;
      input.value = '';
      select.value = '';
      adminListLoaded = false;
      setStatus('บันทึกรหัสเริ่มต้นแล้ว กรุณาแจ้งเจ้าของบัญชีโดยตรง', false);
      await loadAdminInitialPasswordUsers(true);
    } catch (err) {
      console.error(err);
      setStatus('บันทึกไม่สำเร็จ: ' + (err.message || err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function wire() {
    const form = $('loginForm');
    if (form) {
      // capture phase เพื่อให้ตรวจ first-login ก่อน auth.js เดิม
      form.addEventListener('submit', interceptFirstLogin, true);
    }

    const saveBtn = $('adminInitialPasswordSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveInitialPassword);

    const adminBtn = $('adminUsersBtn');
    if (adminBtn) adminBtn.addEventListener('click', () => setTimeout(() => loadAdminInitialPasswordUsers(true), 50));

    const refreshBtn = $('adminRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      adminListLoaded = false;
      setTimeout(() => loadAdminInitialPasswordUsers(true), 50);
    });

    if (typeof window.showDashboardPage === 'function' && !window.showDashboardPage.__v282Wrapped) {
      const original = window.showDashboardPage;
      const wrapped = function (page) {
        const out = original.apply(this, arguments);
        if (page === 'admin') setTimeout(() => loadAdminInitialPasswordUsers(true), 50);
        return out;
      };
      wrapped.__v282Wrapped = true;
      window.showDashboardPage = wrapped;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
