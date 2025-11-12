import { buildSidebar, permisosToRoles } from './utils/permisos.js';
import { navigate } from './router.js';
import { initFirebase } from './firebase.js';
import { ensureUserProfile, loadStoredProfile } from './ui/onboarding.js';
import './ui/timeline.js';

const loginForm = document.getElementById('loginForm');
const loginView = document.getElementById('loginView');
const appContainer = document.getElementById('app');
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const logoutBtn = document.getElementById('logoutBtn');

export async function bootstrapApp(routes) {
  initFirebase();
  Object.entries(routes).forEach(([id, factory]) => {
    factory.register(id);
  });
}

logoutBtn?.addEventListener('click', () => {
  sessionStorage.clear();
  window.location.reload();
});

if (loginForm) {
  loginForm.addEventListener('submit', login);
}

export async function login(event) {
  event?.preventDefault();

  const user = document.getElementById('userInput').value.trim();
  const pass = document.getElementById('passwordInput').value.trim();
  if (!user || !pass) return;

  try {
    const url = `https://auth.foodservice.com.ar/index_dev.php?type=login&user=${encodeURIComponent(user)}&access_token=1234567`;

    // ⚠️ Sin headers custom => evita el preflight
    const response = await axios.get(url);

    const row = Array.isArray(response.data) ? response.data[0] : null;
    if (!row) throw new Error('Respuesta inválida');

    // --- Validación de contraseña (igual a tu flujo histórico) ---
    let expectedPassword = row?.Password?.[0]?.contrasena ?? null;
    if (!expectedPassword) {
      // Si no tiene contraseña definida, usa fecha de nacimiento AAAA-MM-DD => DDMMYYYY
      const fecnac = row?.datos?.leg_fecnac; // "1982-07-01"
      if (!fecnac) throw new Error('No se pudo calcular contraseña por fecha de nacimiento');
      const [yyyy, mm, dd] = fecnac.split('-');
      expectedPassword = `${dd}${mm}${yyyy}`;
    }

    if (pass !== expectedPassword) {
      alert('Datos incorrectos. Verificá tus credenciales.');
      return;
    }

    // --- Persistencia de sesión (según JSON real) ---
    const userData = row.datos ?? {};
    const userPermisos = row.Permisos ?? [];
    const userId = row.id ?? String(userData?.leg_numero ?? '');
    const p_img = row.Perfil?.[0]?.imagen ?? '';
    const em = userData?.leg_numero ?? '';                 // tu "em"
    const manipulacion = row.Manipulador?.[0]?.link ?? '';

    sessionStorage.setItem('userData', JSON.stringify(userData));
    sessionStorage.setItem('userPermisos', JSON.stringify(userPermisos));
    sessionStorage.setItem('userId', userId);
    sessionStorage.setItem('p_img', p_img);
    sessionStorage.setItem('em', em);
    if (manipulacion) sessionStorage.setItem('manipulacion', manipulacion);

    const customProfile = await ensureUserProfile({
      userId,
      nombre: userData?.nombre ?? 'Usuario'
    });
    if (customProfile) {
      sessionStorage.setItem('userCustomProfile', JSON.stringify(customProfile));
    }

    postLogin();
  } catch (error) {
    console.error('Login failed', error);
    alert('Credenciales inválidas o servicio no disponible');
  }
}



export function postLogin() {
  const userId = sessionStorage.getItem('userId');
  const permisos = JSON.parse(sessionStorage.getItem('userPermisos') ?? 'null');
  if (!userId || !permisos) {
    sessionStorage.clear();
    loginView?.classList.remove('hidden');
    appContainer?.classList.add('hidden');
    return;
  }

  const userData = JSON.parse(sessionStorage.getItem('userData') ?? '{}');
  let customProfile = JSON.parse(sessionStorage.getItem('userCustomProfile') ?? 'null');
  if (!customProfile) {
    const stored = loadStoredProfile(userId);
    if (stored) {
      customProfile = stored;
      sessionStorage.setItem('userCustomProfile', JSON.stringify(stored));
    }
  }

  const currentUser = {
    uid: userId,
    nombre: userData?.nombre ?? 'Usuario',
    rol: customProfile?.nivel ?? permisosToRoles(permisos)[0] ?? 'Colaborador',
    sector: customProfile?.sectorNombre ?? ''
  };

  populateSessionHeader(currentUser);
  renderSidebar(permisos, currentUser);
  loginView?.classList.add('hidden');
  appContainer?.classList.remove('hidden');
  document.body.classList.add('app-loaded');

  const firstItem = sidebar?.querySelector('.sidebar__item');
  firstItem?.click();
}

function populateSessionHeader(currentUser) {
  document.getElementById('appUserName').textContent = currentUser.nombre;
  const avatar = document.getElementById('appUserAvatar');
  const url = sessionStorage.getItem('p_img');
  if (url) {
    avatar.src = url;
  } else {
    avatar.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.nombre);
  }

  const metaContainer = document.getElementById('appUserMeta');
  const roleTag = document.getElementById('appUserRole');
  const sectorTag = document.getElementById('appUserSector');

  if (roleTag) {
    roleTag.textContent = currentUser.rol ?? '';
    roleTag.classList.toggle('hidden', !currentUser.rol);
  }

  if (sectorTag) {
    sectorTag.textContent = currentUser.sector ?? '';
    sectorTag.classList.toggle('hidden', !currentUser.sector);
  }

  if (metaContainer) {
    const hasMeta = Boolean(currentUser.rol || currentUser.sector);
    metaContainer.classList.toggle('hidden', !hasMeta);
  }
}

function renderSidebar(permisos, currentUser) {
  const items = buildSidebar(permisos);
  sidebar.innerHTML = '';
  items.forEach(item => {
    const button = document.createElement('button');
    button.className = 'sidebar__item';
    button.textContent = item.label;
    button.dataset.id = item.id;
    button.addEventListener('click', () => {
      document.querySelectorAll('.sidebar__item').forEach(node => node.classList.remove('active'));
      button.classList.add('active');
      navigate(item.id, { permisos, currentUser, mainContent });
    });
    sidebar.appendChild(button);
  });
}

if (sessionStorage.getItem('userId') && sessionStorage.getItem('userPermisos')) {
  postLogin();
}
