import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { uploadAttachment } from '../utils/storage.js';

export class RemitosModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'remitos', entidad: 'remitos', permisos });
  }

  getTitle() {
    return 'Remitos';
  }

  getFiltersTemplate() {
    return `
      <label>Estado
        <select id="remitoEstadoFilter">
          <option value="">Todos</option>
          <option value="registrado">Registrado</option>
          <option value="verificado">Verificado</option>
          <option value="auditado">Auditado</option>
          <option value="observado">Observado</option>
        </select>
      </label>
      <label>OC vinculada
        <input id="remitoOcFilter" placeholder="OC-000123">
      </label>
    `;
  }

  getTableHeaders() {
    return ['Número', 'OC', 'Estado', 'Verificado por', 'Actualizado'];
  }

  mapRow(record) {
    return [
      `<td>${record.numero}</td>`,
      `<td>${record.ocId ?? '-'}</td>`,
      `<td>${record.estado}</td>`,
      `<td>${record.verificado_por?.nombre ?? '-'}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  bindEvents() {
    this.container.querySelector('#remitoEstadoFilter')?.addEventListener('change', () => this.loadData());
    this.container.querySelector('#remitoOcFilter')?.addEventListener('input', () => this.loadData());
  }

  async fetchData() {
    const client = getRealtimeClient();
    const estado = this.container.querySelector('#remitoEstadoFilter')?.value;
    const ocId = this.container.querySelector('#remitoOcFilter')?.value?.toLowerCase();
    const data = await client.list('remitos');
    return data
      .filter(remito => (estado ? remito.estado === estado : true))
      .filter(remito => (ocId ? (remito.ocId ?? '').toLowerCase().includes(ocId) : true));
  }

  async registerAttachment(remitoId, file) {
    const client = getRealtimeClient();
    const attachment = await uploadAttachment('remitos', remitoId, file);
    await client.update(`remitos/${remitoId}`, {
      adjuntos: [{ ...attachment }],
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('remitos', remitoId, {
      entidad: 'remitos',
      id: remitoId,
      evento: 'adjunto_cargado',
      detalle: `Adjunto ${file.name}`,
      fecha: serverTimestamp()
    });
  }
}
