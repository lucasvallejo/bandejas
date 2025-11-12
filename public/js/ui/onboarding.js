const STORAGE_PREFIX = 'foodservice:userProfile:';
const API_URL = 'https://auth.foodservice.com.ar/index_dev.php?type=sectores_operaciones&access_token=1234567';
const AUTH_LEVEL_OPTIONS = [
  'Colaborador/a',
  'Supervisor/a',
  'Jefe/a',
  'Gerente',
  'Director/a',
  'C-Level / Comité Ejecutivo'
];

const overlay = document.getElementById('onboardingOverlay');
const form = document.getElementById('onboardingForm');
const nameTarget = document.getElementById('onboardingName');
const levelSelect = document.getElementById('authLevelSelect');
const sectorSelect = document.getElementById('sectorSelect');
const submitBtn = document.getElementById('onboardingSubmit');
const retryBtn = document.getElementById('onboardingRetry');
const loadingLayer = document.getElementById('onboardingLoading');
const errorBox = document.getElementById('onboardingError');

let resolver = null;
let activeUserId = null;
let cachedSectors = null;

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadStoredProfile(userId) {
  if (!userId) return null;
  try {
    const stored = localStorage.getItem(storageKey(userId));
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('No se pudo leer la configuración almacenada', error);
    return null;
  }
}

function persistProfile(userId, profile) {
  if (!userId || !profile) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(profile));
  } catch (error) {
    console.warn('No se pudo guardar la configuración personalizada', error);
  }
}

function toggleOverlay(visible) {
  if (!overlay) return;
  overlay.classList.toggle('hidden', !visible);
  overlay.setAttribute('aria-hidden', String(!visible));
  document.body.classList.toggle('modal-open', visible);
}

function setLoading(isLoading) {
  if (!loadingLayer || !submitBtn || !sectorSelect) return;
  loadingLayer.classList.toggle('hidden', !isLoading);
  if (isLoading) {
    submitBtn.disabled = true;
  } else {
    updateSubmitState();
  }
  sectorSelect.disabled = isLoading || !(cachedSectors && cachedSectors.length);
}

function showError(message) {
  if (!errorBox) return;
  errorBox.textContent = message ?? '';
  errorBox.classList.toggle('hidden', !message);
  retryBtn?.classList.toggle('hidden', !message);
}

function populateLevels() {
  if (!levelSelect || levelSelect.dataset.populated === 'true') return;
  const fragment = document.createDocumentFragment();
  AUTH_LEVEL_OPTIONS.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    fragment.appendChild(opt);
  });
  levelSelect.appendChild(fragment);
  levelSelect.dataset.populated = 'true';
}

function populateSectors(sectors) {
  if (!sectorSelect) return;
  sectorSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seleccioná tu operación';
  placeholder.disabled = true;
  placeholder.selected = true;
  sectorSelect.appendChild(placeholder);

  sectors.forEach(sector => {
    const opt = document.createElement('option');
    opt.value = sector.id;
    opt.textContent = sector.operacion;
    opt.dataset.operacion = sector.operacion;
    opt.dataset.email = sector.email ?? '';
    opt.dataset.empresaId = sector.id_empresa ?? '';
    sectorSelect.appendChild(opt);
  });

  sectorSelect.disabled = false;
}

async function fetchSectors() {
  if (cachedSectors) return cachedSectors;
  try {
    const response = await axios.get(API_URL, { headers: { Accept: 'application/json' } });
    const rows = Array.isArray(response.data) ? response.data : [];
    const normalized = rows
      .map(row => ({
        id: row?.id ?? row?.id_empresa ?? '',
        operacion: row?.operacion ?? row?.empresa ?? '',
        email: row?.email ?? row?.mail ?? '',
        id_empresa: row?.id_empresa ?? '',
        estado: row?.estado ?? ''
      }))
      .filter(row => row.id && row.operacion)
      .sort((a, b) => a.operacion.localeCompare(b.operacion));
    cachedSectors = normalized;
    return normalized;
  } catch (error) {
    console.error('No se pudieron obtener los sectores', error);
    throw new Error('No pudimos conectar con el servicio de sectores.');
  }
}

function collectCurrentSelection() {
  if (!levelSelect || !sectorSelect) return null;
  const nivel = levelSelect.value.trim();
  const sectorId = sectorSelect.value.trim();
  if (!nivel || !sectorId) return null;
  const selectedOption = sectorSelect.options[sectorSelect.selectedIndex];
  return {
    nivel,
    sectorId,
    sectorNombre: selectedOption.dataset.operacion ?? selectedOption.textContent,
    empresaId: selectedOption.dataset.empresaId ?? '',
    contacto: selectedOption.dataset.email ?? '',
    updatedAt: new Date().toISOString()
  };
}

function updateSubmitState() {
  if (!submitBtn) return;
  submitBtn.disabled = !collectCurrentSelection();
}

function resetOnboardingForm() {
  if (levelSelect) {
    levelSelect.selectedIndex = 0;
  }
  if (sectorSelect) {
    sectorSelect.innerHTML = '<option value="" disabled selected>Sincronizando sectores...</option>';
    sectorSelect.disabled = true;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
  }
  showError('');
}

async function prepareSectors() {
  showError('');
  setLoading(true);
  try {
    const sectors = await fetchSectors();
    populateSectors(sectors);
  } catch (error) {
    showError(error.message || 'Ocurrió un error inesperado.');
  } finally {
    setLoading(false);
    updateSubmitState();
  }
}

if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    prepareSectors();
  });
}

if (form) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!resolver || !activeUserId) return;
    const profile = collectCurrentSelection();
    if (!profile) {
      showError('Completá los campos para continuar.');
      return;
    }

    persistProfile(activeUserId, profile);
    toggleOverlay(false);
    resolver(profile);
    resolver = null;
    activeUserId = null;
  });
}

[levelSelect, sectorSelect].forEach(control => {
  control?.addEventListener('change', () => {
    showError('');
    updateSubmitState();
  });
});

export async function ensureUserProfile({ userId, nombre }) {
  if (!userId) return null;

  const stored = loadStoredProfile(userId);
  if (stored || !overlay || !form) {
    return stored;
  }

  populateLevels();
  if (nameTarget) {
    nameTarget.textContent = nombre || 'equipo FoodService';
  }
  resetOnboardingForm();
  toggleOverlay(true);
  await prepareSectors();

  return new Promise(resolve => {
    resolver = resolve;
    activeUserId = userId;
  });
}

window.addEventListener('keydown', event => {
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
  }
});

export function clearStoredProfile(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch (error) {
    console.warn('No se pudo limpiar la configuración personalizada', error);
  }
}
