import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';

export class AuditoriaModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'auditoria', entidad: 'auditoria', permisos });
  }

  getTitle() {
    return 'Auditoría integral';
  }

  getFiltersTemplate() {
    return `
      <label>Entidad
        <select id="auditoriaEntidad">
          <option value="facturas">Facturas</option>
          <option value="oc">Órdenes de compra</option>
          <option value="remitos">Remitos</option>
          <option value="op">Órdenes de pago</option>
          <option value="legajos">Legajos</option>
        </select>
      </label>
      <label>ID entidad
        <input id="auditoriaId" placeholder="facturaId" required>
      </label>
      <button type="button" id="auditoriaBuscar" class="btn btn--primary">Buscar</button>
    `;
  }

  getTableHeaders() {
    return ['Evento', 'Desde', 'Hacia', 'Usuario', 'Fecha', 'Detalle'];
  }

  bindEvents() {
    this.container.querySelector('#auditoriaBuscar')?.addEventListener('click', () => this.loadData());
  }

  async fetchData() {
    const entidad = this.container.querySelector('#auditoriaEntidad')?.value ?? 'facturas';
    const id = this.container.querySelector('#auditoriaId')?.value;
    if (!id) {
      return [];
    }
    const client = getRealtimeClient();
    const data = await client._request(`auditoria/${entidad}/${id}`);
    if (!data) return [];
    return Object.entries(data).map(([eventId, payload]) => ({ id: eventId, ...payload, entidad }));
  }

  renderRows(records) {
    this.tableBody.innerHTML = '';
    if (!records.length) {
      this.tableBody.innerHTML = '<tr><td colspan="6">Sin eventos</td></tr>';
      return;
    }
    const sorted = records.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    sorted.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = [
        `<td>${record.evento ?? record.tipo ?? 'evento'}</td>`,
        `<td>${record.desde ?? '-'}</td>`,
        `<td>${record.hacia ?? '-'}</td>`,
        `<td>${record.usuario ? `${record.usuario.nombre} (${record.usuario.rol ?? ''})` : 'Sistema'}</td>`,
        `<td>${formatDateTime(record.fecha)}</td>`,
        `<td>${record.detalle ?? ''}</td>`
      ].join('');
      this.tableBody.appendChild(row);
    });
  }
}
