import { supabase } from './supabase.js';
import { showToast, $ } from './utils.js';

let currentUser = null;
let onLoginSuccessCallback = null;

/**
 * Initialize Auth module
 */
export function initAuth(onLoginSuccess) {
  onLoginSuccessCallback = onLoginSuccess;

  // Listen to auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      hideAuthModal();
      if (onLoginSuccessCallback) onLoginSuccessCallback(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthModal();
    }
  });

  // Check initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      currentUser = session.user;
      hideAuthModal();
      if (onLoginSuccessCallback) onLoginSuccessCallback(session.user);
    } else {
      showAuthModal();
    }
  });
}

export function getCurrentUser() {
  return currentUser;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Error al cerrar sesión: ' + error.message, 'error');
  } else {
    showToast('Sesión cerrada con éxito', 'success');
  }
}

function showAuthModal() {
  // Prevent duplicate modals
  if ($('#auth-overlay')) return;

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.className = 'modal-overlay active';
  overlay.style.cssText = `
    z-index: 1000;
    backdrop-filter: blur(24px);
    background: rgba(4, 6, 15, 0.85);
  `;

  // Draw card
  overlay.innerHTML = `
    <div class="modal auth-modal" style="max-width: 420px; border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); overflow: hidden; border: 1px solid var(--border-default); transform: scale(1) translateY(0);">
      <div class="modal-header" style="text-align: center; display: block; border-bottom: none; padding: 32px 32px 10px;">
        <div style="width: 52px; height: 52px; border-radius: 12px; background: var(--accent-gradient); display: flex; align-items: center; justify-content: center; color: white; margin: 0 auto 16px; box-shadow: var(--shadow-glow-accent);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 style="font-size: 1.6rem; color: var(--text-primary); font-weight: 800; letter-spacing: -0.03em;" id="auth-title">Iniciar Sesión</h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 6px;" id="auth-subtitle">Gestiona tu flujo de caja de forma segura en la nube</p>
      </div>

      <div class="form-body" style="padding: 24px 32px 32px;">
        <!-- Email Input -->
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="auth-email">Correo Electrónico</label>
          <input type="email" id="auth-email" placeholder="ejemplo@correo.com" required style="height: 42px;" />
        </div>

        <!-- Password Input -->
        <div class="form-group" style="margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <label for="auth-password" style="margin: 0;">Contraseña</label>
            <a href="#" id="auth-forgot-link" style="font-size: 0.78rem; color: var(--accent-hover); text-decoration: none; font-weight: 600;">¿Olvidaste tu contraseña?</a>
          </div>
          <div style="position: relative; display: flex; align-items: center;">
            <input type="password" id="auth-password" placeholder="••••••••" required style="height: 42px; width: 100%; padding-right: 40px;" />
            <button type="button" id="auth-toggle-password" style="position: absolute; right: 12px; background: none; border: none; padding: 0; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; height: 100%; width: 24px;">
              <svg class="eye-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <svg class="eye-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Action Button -->
        <button id="auth-submit-btn" class="btn-primary" style="width: 100%; height: 44px; justify-content: center; font-size: 0.95rem; border-radius: var(--radius-md); background: var(--accent-gradient); box-shadow: var(--shadow-glow-accent); font-weight: 700;">
          Ingresar
        </button>

        <!-- Toggle Auth Type Link -->
        <div style="text-align: center; margin-top: 20px; font-size: 0.85rem; color: var(--text-muted);">
          <span id="auth-toggle-desc">¿No tienes una cuenta aún?</span>
          <a href="#" id="auth-toggle-link" style="color: var(--accent-hover); text-decoration: none; font-weight: 700; margin-left: 4px;">Regístrate</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Bind auth elements
  const emailInput = $('#auth-email');
  const passwordInput = $('#auth-password');
  const submitBtn = $('#auth-submit-btn');
  const toggleLink = $('#auth-toggle-link');
  const forgotLink = $('#auth-forgot-link');
  const authTitle = $('#auth-title');
  const authSubtitle = $('#auth-subtitle');
  const authToggleDesc = $('#auth-toggle-desc');
  const togglePasswordBtn = $('#auth-toggle-password');

  if (togglePasswordBtn) {
    const eyeShow = togglePasswordBtn.querySelector('.eye-show');
    const eyeHide = togglePasswordBtn.querySelector('.eye-hide');
    togglePasswordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeShow.style.display = 'none';
        eyeHide.style.display = 'inline-block';
      } else {
        passwordInput.type = 'password';
        eyeShow.style.display = 'inline-block';
        eyeHide.style.display = 'none';
      }
    });
  }

  let mode = 'login'; // 'login' | 'signup'

  // Toggle mode
  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (mode === 'login') {
      mode = 'signup';
      authTitle.textContent = 'Crear Cuenta';
      authSubtitle.textContent = 'Regístrate para asegurar tu información en la nube';
      submitBtn.textContent = 'Registrar Cuenta';
      authToggleDesc.textContent = '¿Ya tienes una cuenta?';
      toggleLink.textContent = 'Inicia Sesión';
      forgotLink.style.display = 'none';
    } else {
      mode = 'login';
      authTitle.textContent = 'Iniciar Sesión';
      authSubtitle.textContent = 'Gestiona tu flujo de caja de forma segura en la nube';
      submitBtn.textContent = 'Ingresar';
      authToggleDesc.textContent = '¿No tienes una cuenta aún?';
      toggleLink.textContent = 'Regístrate';
      forgotLink.style.display = 'inline-block';
    }
  });

  // Forgot password handler
  forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      showToast('Por favor escribe tu correo electrónico primero', 'error');
      emailInput.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando correo...';
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/cash-flow/'
    });

    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Ingresar' : 'Registrar Cuenta';

    if (error) {
      showToast('Error: ' + error.message, 'error');
    } else {
      showToast('Correo de recuperación enviado con éxito', 'success');
    }
  });

  // Submit handler
  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showToast('Por favor completa todos los campos requeridos', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'Ingresando...' : 'Registrando...';

    if (mode === 'login') {
      // Login
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast('Error al ingresar: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ingresar';
      } else {
        showToast('¡Sesión iniciada con éxito!', 'success');
      }
    } else {
      // Signup
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) {
        showToast('Error al registrar: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Cuenta';
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Cuenta';
        
        if (data?.user?.identities?.length === 0) {
          showToast('El correo electrónico ya está registrado', 'error');
        } else {
          showToast('Registro exitoso. Revisa tu correo de confirmación', 'success');
          // Switch back to login
          toggleLink.click();
        }
      }
    }
  });
}

function hideAuthModal() {
  const overlay = $('#auth-overlay');
  if (overlay) {
    overlay.remove();
  }
}
