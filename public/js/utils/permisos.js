export const PERMISO_ROL_MAP = {
  perm_oc_alta: 'Jefe de Sector',
  perm_oc_autorizar: 'Gerente de Sector',
  perm_auditoria: 'Auditor',
  perm_factura_carga: 'Responsable de facturación',
  perm_factura_verificar: 'Verificador de facturas',
  perm_finanzas: 'Finanzas',
  perm_legajo_control: 'Control Final',
  perm_excepcion_firma: 'Director'
};

const PERMISO_KEY_CANDIDATES = ['id', 'permiso', 'codigo', 'nombre', 'clave', 'key', 'slug'];

export function normalizePermisos(rawPermisos, profile) {
  const normalized = {};
  if (Array.isArray(rawPermisos)) {
    rawPermisos.forEach(entry => {
      if (!entry) return;
      if (typeof entry === 'string') {
        normalized[entry] = true;
        return;
      }
      if (typeof entry === 'object') {
        let key = '';
        for (const candidate of PERMISO_KEY_CANDIDATES) {
          const value = entry?.[candidate];
          if (typeof value === 'string' && value.trim()) {
            key = value.trim();
            break;
          }
        }
        if (!key && typeof entry?.nombre_permiso === 'string') {
          key = entry.nombre_permiso.trim();
        }
        if (!key && typeof entry?.permiso_nombre === 'string') {
          key = entry.permiso_nombre.trim();
        }
        if (key) {
          normalized[key] = true;
        }
      }
    });
  } else if (rawPermisos && typeof rawPermisos === 'object') {
    Object.entries(rawPermisos).forEach(([key, value]) => {
      if (!key) return;
      if (typeof value === 'boolean') {
        normalized[key] = value;
      } else if (value === 1 || value === '1') {
        normalized[key] = true;
      }
    });
  }

  const nivel = profile?.nivel?.toLowerCase?.() ?? '';
  if (nivel.includes('jefe')) {
    normalized.perm_oc_alta = true;
    normalized.perm_factura_carga = true;
  }
  if (nivel.includes('supervisor')) {
    normalized.perm_factura_verificar = true;
  }
  if (nivel.includes('gerente')) {
    normalized.perm_oc_autorizar = true;
  }

  return normalized;
}

export function permisosToRoles(permisos = {}) {
  const roles = new Set();
  Object.entries(permisos).forEach(([permiso, enabled]) => {
    if (enabled && PERMISO_ROL_MAP[permiso]) {
      roles.add(PERMISO_ROL_MAP[permiso]);
    }
  });
  return [...roles];
}

export function hasPermiso(permisos, permiso) {
  return Boolean(permisos?.[permiso]);
}

export function buildSidebar(permisos) {
  const items = [];
  if (hasPermiso(permisos, 'perm_oc_alta') || hasPermiso(permisos, 'perm_oc_autorizar')) {
    items.push({ id: 'oc', label: 'Órdenes de Compra' });
  }
  if (hasPermiso(permisos, 'perm_oc_alta') || hasPermiso(permisos, 'perm_factura_carga')) {
    items.push({ id: 'remitos', label: 'Remitos' });
  }
  if (hasPermiso(permisos, 'perm_factura_carga') || hasPermiso(permisos, 'perm_factura_verificar')) {
    items.push({ id: 'facturas', label: 'Facturas' });
  }
  if (hasPermiso(permisos, 'perm_finanzas')) {
    items.push({ id: 'propuestas', label: 'Propuestas' });
    items.push({ id: 'op', label: 'Órdenes de Pago' });
  }
  if (hasPermiso(permisos, 'perm_legajo_control')) {
    items.push({ id: 'legajos', label: 'Legajos' });
  }
  if (hasPermiso(permisos, 'perm_auditoria')) {
    items.push({ id: 'auditoria', label: 'Auditoría' });
  }
  return items;
}
