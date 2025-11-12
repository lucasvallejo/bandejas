import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';

export class LegajosModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'legajos', entidad: 'legajos', permisos });
  }

  getTitle() {
    return 'Legajos';
  }

  getTableHeaders() {
    return ['ID', 'OC', 'Remitos', 'Facturas', 'OP', 'Estado', 'Actualizado'];
  }

  mapRow(record) {
    return [
      `<td>${record.id}</td>`,
      `<td>${record.ocId ?? '-'}</td>`,
      `<td>${record.remitos?.length ?? 0}</td>`,
      `<td>${record.facturas?.length ?? 0}</td>`,
      `<td>${record.op?.length ?? 0}</td>`,
      `<td>${record.estado}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  async fetchData() {
    const client = getRealtimeClient();
    return client.list('legajos');
  }

  async marcarEstado(legajoId, estado, obs) {
    const client = getRealtimeClient();
    await client.update(`legajos/${legajoId}`, {
      estado,
      control_final: { ...this.currentUser, fecha: serverTimestamp(), obs },
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('legajos', legajoId, {
      entidad: 'legajos',
      id: legajoId,
      evento: 'control_final',
      usuario: this.currentUser,
      detalle: `Legajo marcado como ${estado}`,
      fecha: serverTimestamp()
    });
  }
}
