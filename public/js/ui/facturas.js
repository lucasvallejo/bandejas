import { BaseModule, formatDate, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { uploadAttachment } from '../utils/storage.js';

export class FacturasModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'facturas', entidad: 'facturas', permisos });
  }

  getTitle() {
    return 'Facturas';
  }

  getFiltersTemplate() {
    return `
      <label>Estado
        <select id="facturaEstadoFilter">
          <option value="">Todos</option>
          <option value="cargada">Cargada</option>
          <option value="verificada">Verificada</option>
          <option value="aprobada">Aprobada</option>
          <option value="auditada">Auditada</option>
          <option value="en_propuesta">En propuesta</option>
          <option value="programada_pago">Programada</option>
          <option value="pagada_parcial">Pagada parcial</option>
          <option value="pagada_total">Pagada total</option>
        </select>
      </label>
      <label>Vencimiento hasta
        <input type="date" id="facturaVencimientoFilter">
      </label>
    `;
  }

  getHeaderActions() {
    if (this.permisos?.perm_factura_carga) {
      return '<button id="facturaNueva" class="btn btn--primary">Cargar factura</button>';
    }
    return '';
  }

  getTableHeaders() {
    return ['Número', 'OC', 'Proveedor', 'Importe', 'Vencimiento', 'Estado', 'Saldo'];
  }

  mapRow(record) {
    return [
      `<td>${record.numero}</td>`,
      `<td>${record.ocId ?? '-'}</td>`,
      `<td>${record.proveedor_nombre ?? record.proveedor_id ?? '-'}</td>`,
      `<td>$ ${record.importe_total?.toLocaleString('es-AR')}</td>`,
      `<td>${formatDate(record.vencimiento)}</td>`,
      `<td>${record.estado}</td>`,
      `<td>$ ${(record.saldo ?? record.importe_total)?.toLocaleString('es-AR')}</td>`
    ];
  }

  bindEvents() {
    this.container.querySelector('#facturaEstadoFilter')?.addEventListener('change', () => this.loadData());
    this.container.querySelector('#facturaVencimientoFilter')?.addEventListener('change', () => this.loadData());
    this.container.querySelector('#facturaNueva')?.addEventListener('click', () => this.openCreateModal());
  }

  async fetchData() {
    const client = getRealtimeClient();
    const estado = this.container.querySelector('#facturaEstadoFilter')?.value;
    const vencimiento = this.container.querySelector('#facturaVencimientoFilter')?.value;
    const data = await client.list('facturas');
    return data
      .filter(factura => (estado ? factura.estado === estado : true))
      .filter(factura => (vencimiento ? factura.vencimiento <= vencimiento : true));
  }

  openCreateModal() {
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva factura</h3>
      <label>Número<input name="numero" required></label>
      <label>OC vinculada<input name="ocId" required></label>
      <label>Importe total<input name="importe_total" type="number" required step="0.01"></label>
      <label>Vencimiento<input name="vencimiento" type="date" required></label>
      <label>Adjunto PDF<input name="adjunto" type="file" accept="application/pdf" required></label>
      <div style="display:flex;gap:1rem;margin-top:1rem;justify-content:flex-end;">
        <button type="button" class="btn" data-action="cancel">Cancelar</button>
        <button type="submit" class="btn btn--primary">Guardar</button>
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
      ocId: formData.get('ocId'),
      importe_total: Number(formData.get('importe_total')),
      vencimiento: formData.get('vencimiento'),
      estado: 'cargada',
      cargada_por: this.currentUser,
      saldo: Number(formData.get('importe_total')),
      timestamps: { creado: serverTimestamp(), actualizado: serverTimestamp() }
    };
    const client = getRealtimeClient();
    const result = await client.create('facturas', payload);
    const key = result?.name;
    const file = formData.get('adjunto');
    const attachment = await uploadAttachment('facturas', key, file);
    await client.update(`facturas/${key}`, { adjuntos: [attachment] });
    await client.appendAudit('facturas', key, {
      entidad: 'facturas',
      id: key,
      evento: 'carga',
      usuario: this.currentUser,
      detalle: `Factura ${payload.numero} cargada`,
      fecha: serverTimestamp()
    });
    dialog.remove();
    await this.loadData();
  }

  async registrarBas(facturaId, transactionId) {
    const client = getRealtimeClient();
    await client.update(`facturas/${facturaId}`, {
      bas: { ok: true, transaction_id: transactionId, fecha: serverTimestamp() },
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', facturaId, {
      entidad: 'facturas',
      id: facturaId,
      evento: 'bas_ok',
      detalle: `BAS confirmado (${transactionId})`,
      fecha: serverTimestamp(),
      extras: { transaction_id: transactionId }
    });
  }
}
