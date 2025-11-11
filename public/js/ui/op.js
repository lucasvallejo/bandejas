import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';

export class OrdenesPagoModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'op', entidad: 'op', permisos });
  }

  getTitle() {
    return 'Órdenes de Pago';
  }

  getHeaderActions() {
    return '<button id="opNueva" class="btn btn--primary">Emitir OP</button>';
  }

  getTableHeaders() {
    return ['Número', 'Estado', 'Facturas', 'Pagos', 'Actualizado'];
  }

  bindEvents() {
    this.container.querySelector('#opNueva')?.addEventListener('click', () => this.openCreateModal());
  }

  mapRow(record) {
    return [
      `<td>${record.numero}</td>`,
      `<td>${record.estado}</td>`,
      `<td>${record.facturas?.map(item => `${item.facturaId} ($${item.monto})`).join('<br>') ?? '-'}</td>`,
      `<td>${record.pagos?.map(pago => `${formatDateTime(pago.fecha)} - $${pago.monto}`).join('<br>') ?? '-'}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  async fetchData() {
    const client = getRealtimeClient();
    return client.list('op');
  }

  openCreateModal() {
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva Orden de Pago</h3>
      <label>Número<input name="numero" required></label>
      <label>Factura ID<input name="facturaId" required></label>
      <label>Monto<input name="monto" type="number" required></label>
      <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:flex-end;">
        <button class="btn" type="button" data-action="cancel">Cancelar</button>
        <button class="btn btn--primary" type="submit">Emitir</button>
      </div>
    `;
    const dialog = this.renderDialog(form);
    form.addEventListener('submit', event => this.handleCreate(event, dialog));
    form.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.remove());
  }

  renderDialog(content) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = '<div class="modal"></div>';
    backdrop.querySelector('.modal').appendChild(content);
    document.body.appendChild(backdrop);
    return backdrop;
  }

  async handleCreate(event, dialog) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = {
      numero: formData.get('numero'),
      condicion: 'A la orden del proveedor',
      estado: 'emitida',
      emitida_por: this.currentUser,
      facturas: [{ facturaId: formData.get('facturaId'), monto: Number(formData.get('monto')) }],
      timestamps: { creado: serverTimestamp(), actualizado: serverTimestamp() }
    };
    const client = getRealtimeClient();
    const result = await client.create('op', payload);
    const key = result?.name;
    await client.appendAudit('op', key, {
      entidad: 'op',
      id: key,
      evento: 'emision',
      usuario: this.currentUser,
      detalle: `OP ${payload.numero} emitida`,
      fecha: serverTimestamp()
    });
    dialog.remove();
    await this.loadData();
  }
}
