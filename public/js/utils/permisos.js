export const PERMISO_ROL_MAP = {
  perm_oc_alta: 'Jefe de Sector',
  perm_oc_autorizar: 'Gerente de Sector',
  perm_auditoria: 'Auditor',
  perm_factura_carga: 'Myrian Deportes',
  perm_factura_verificar: 'Myrian Perez',
  perm_finanzas: 'Finanzas',
  perm_legajo_control: 'Control Final',
  perm_excepcion_firma: 'Director'
};

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
