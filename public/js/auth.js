import { buildSidebar, permisosToRoles } from './utils/permisos.js';
import { navigate } from './router.js';
import { initFirebase } from './firebase.js';
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
  const password = document.getElementById('passwordInput').value.trim();
  if (!user || !password) return;
  try {
    const response = await axios.get(`https://auth.foodservice.com.ar/?type=login&user=${encodeURIComponent(user)}&access_token=1234567`, {
      headers: { 'X-Password': password }
    });
    const { userData, userPermisos, userId, p_img, em, manipulacion } = response.data;
    sessionStorage.setItem('userData', JSON.stringify(userData));
    sessionStorage.setItem('userPermisos', JSON.stringify(userPermisos));
    sessionStorage.setItem('userId', userId);
    sessionStorage.setItem('p_img', p_img ?? '');
    sessionStorage.setItem('em', em ?? '');
    if (manipulacion) {
      sessionStorage.setItem('manipulacion', manipulacion);
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
  const currentUser = {
    uid: userId,
    nombre: userData?.nombre ?? 'Usuario',
    rol: permisosToRoles(permisos)[0] ?? 'Colaborador'
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
  document.getElementById('appUserRole').textContent = currentUser.rol;
  const avatar = document.getElementById('appUserAvatar');
  const url = sessionStorage.getItem('p_img');
  if (url) {
    avatar.src = url;
  } else {
    avatar.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.nombre);
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
