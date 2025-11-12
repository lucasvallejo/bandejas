import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { uploadAttachment } from '../utils/storage.js';

export class OrdenesCompraModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'oc', entidad: 'oc', permisos });
  }

  getTitle() {
    return 'Órdenes de Compra';
  }

  getFiltersTemplate() {
    return `
      <label>Estado
        <select id="ocEstadoFilter">
          <option value="">Todos</option>
          <option value="borrador">Borrador</option>
          <option value="pendiente_autorizacion">Pendiente autorización</option>
          <option value="autorizada">Autorizada</option>
          <option value="auditada">Auditada</option>
          <option value="observada">Observada</option>
        </select>
      </label>
      <label>Proveedor
        <input id="ocProveedorFilter" placeholder="Nombre o CUIT">
      </label>
    `;
  }

  getHeaderActions() {
    if (this.permisos?.perm_oc_alta) {
      return '<button id="ocNueva" class="btn btn--primary">Nueva OC</button>';
    }
    return '';
  }

  getTableHeaders() {
    return ['Número', 'Proveedor', 'Sector', 'Monto total', 'Estado', 'Actualizado'];
  }

  mapRow(record) {
    return [
      `<td>${record.numero}</td>`,
      `<td>${record.proveedor_nombre}</td>`,
      `<td>${record.sector}</td>`,
      `<td>$ ${record.monto_total?.toLocaleString('es-AR')}</td>`,
      `<td>${record.estado}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  bindEvents() {
    const nuevaBtn = this.container.querySelector('#ocNueva');
    nuevaBtn?.addEventListener('click', () => this.openCreateModal());
    this.container.querySelector('#ocEstadoFilter')?.addEventListener('change', () => this.loadData());
    this.container.querySelector('#ocProveedorFilter')?.addEventListener('input', () => this.loadData());
  }

  async fetchData() {
    const client = getRealtimeClient();
    const estado = this.container.querySelector('#ocEstadoFilter')?.value;
    const proveedor = this.container.querySelector('#ocProveedorFilter')?.value?.toLowerCase();
    const data = await client.list('oc');
    return data
      .filter(oc => (estado ? oc.estado === estado : true))
      .filter(oc => (proveedor ? oc.proveedor_nombre?.toLowerCase().includes(proveedor) : true))
      .map(oc => ({ ...oc, timestamps: oc.timestamps ?? {} }));
  }

  openCreateModal() {
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva Orden de Compra</h3>
      <label>Número<input name="numero" required></label>
      <label>Sector<input name="sector" required></label>
      <label>Proveedor<input name="proveedor_nombre" required></label>
      <label>Monto total<input name="monto_total" type="number" required></label>
      <label>Adjunto PDF<input name="adjunto" type="file" accept="application/pdf"></label>
      <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:flex-end;">
        <button class="btn" type="button" data-action="cancel">Cancelar</button>
        <button class="btn btn--primary" type="submit">Guardar</button>
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
      sector: formData.get('sector'),
      proveedor_nombre: formData.get('proveedor_nombre'),
      monto_total: Number(formData.get('monto_total')),
      estado: 'pendiente_autorizacion',
      timestamps: { creado: serverTimestamp(), actualizado: serverTimestamp() }
    };
    const client = getRealtimeClient();
    const result = await client.create('oc', payload);
    const key = result?.name;
    const file = formData.get('adjunto');
    if (file && file.size) {
      const attachment = await uploadAttachment('oc', key, file);
      await client.update(`oc/${key}`, { adjuntos: [attachment] });
    }
    await client.appendAudit('oc', key, {
      entidad: 'oc',
      id: key,
      evento: 'creacion',
      usuario: this.currentUser,
      detalle: `OC ${payload.numero} creada`,
      fecha: serverTimestamp()
    });
    dialog.remove();
    await this.loadData();
  }
}
