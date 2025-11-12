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
      `<td>${
        record.facturas?.length
          ? record.facturas
              .map(item => {
                const label = item.facturaNumero ?? item.facturaId;
                const amount = Number(item.monto ?? 0).toLocaleString('es-AR');
                return `${label} ($${amount})`;
              })
              .join('<br>')
          : '-'
      }</td>`,
      `<td>${record.pagos?.map(pago => `${formatDateTime(pago.fecha)} - $${pago.monto}`).join('<br>') ?? '-'}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  async fetchData() {
    const client = getRealtimeClient();
    return client.list('op');
  }

  async openCreateModal() {
    const client = getRealtimeClient();
    const facturas = await client.list('facturas');
    const disponibles = facturas
      .map(factura => ({
        ...factura,
        saldo: Number(factura.saldo ?? factura.importe_total ?? 0)
      }))
      .filter(factura => factura.estado !== 'pagada_total' && factura.saldo > 0);
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva Orden de Pago</h3>
      <label>Número<input name="numero" required></label>
      <label>Factura a cancelar
        <select name="facturaId" required>
          <option value="">Seleccioná una factura</option>
          ${disponibles
            .map(
              factura =>
                `<option value="${factura.id}">Factura ${factura.numero ?? factura.id} · ${
                  factura.proveedor_nombre ?? factura.proveedor_id ?? 'Proveedor sin nombre'
                } · Saldo $${Number(factura.saldo ?? factura.importe_total ?? 0).toLocaleString('es-AR')}</option>`
            )
            .join('')}
        </select>
      </label>
      <label>Monto<input name="monto" type="number" required step="0.01"></label>
      <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:flex-end;">
        <button class="btn" type="button" data-action="cancel">Cancelar</button>
        <button class="btn btn--primary" type="submit">Emitir</button>
      </div>
    `;
    const dialog = this.renderDialog(form);
    const facturaSelect = form.querySelector('select[name="facturaId"]');
    const montoInput = form.querySelector('input[name="monto"]');
    facturaSelect?.addEventListener('change', () => {
      const selected = disponibles.find(factura => factura.id === facturaSelect.value);
      if (selected) {
        montoInput.value = selected.saldo;
      }
    });
    if (!disponibles.length) {
      facturaSelect.disabled = true;
      montoInput.disabled = true;
      form.querySelector('button[type="submit"]').disabled = true;
      const helper = document.createElement('p');
      helper.className = 'form-helper';
      helper.textContent = 'No hay facturas pendientes con saldo para asociar.';
      facturaSelect.parentElement.appendChild(helper);
    }
    form.addEventListener('submit', event => this.handleCreate(event, dialog, disponibles));
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

  async handleCreate(event, dialog, facturasCatalog = []) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const facturaId = formData.get('facturaId');
    const monto = Number(formData.get('monto'));
    const facturaInfo = facturasCatalog.find(item => item.id === facturaId);
    if (!facturaInfo) {
      alert('La factura seleccionada no está disponible.');
      return;
    }
    const payload = {
      numero: formData.get('numero'),
      condicion: 'A la orden del proveedor',
      estado: 'emitida',
      emitida_por: this.currentUser,
      facturas: [
        {
          facturaId,
          facturaNumero: facturaInfo.numero ?? facturaId,
          proveedor: facturaInfo.proveedor_nombre ?? facturaInfo.proveedor_id ?? '',
          monto
        }
      ],
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
    const facturaActual = await client.get(`facturas/${facturaId}`);
    const saldoAnterior = Number(facturaActual?.saldo ?? facturaActual?.importe_total ?? monto);
    const nuevoSaldo = Math.max(0, saldoAnterior - monto);
    const ordenesPago = Array.isArray(facturaActual?.ordenesPago)
      ? facturaActual.ordenesPago
      : Array.isArray(facturaActual?.ordenes_pago)
      ? facturaActual.ordenes_pago
      : [];
    const registroPago = {
      opId: key,
      opNumero: payload.numero,
      monto,
      fecha: serverTimestamp()
    };
    const nuevoEstado =
      nuevoSaldo === 0
        ? 'pagada_total'
        : nuevoSaldo < saldoAnterior
        ? 'pagada_parcial'
        : facturaActual?.estado ?? 'cargada';
    await client.update(`facturas/${facturaId}`, {
      ordenesPago: [...ordenesPago, registroPago],
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      timestamps: { ...(facturaActual?.timestamps ?? {}), actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', facturaId, {
      entidad: 'facturas',
      id: facturaId,
      evento: 'op_asociada',
      usuario: this.currentUser,
      detalle: `OP ${payload.numero} emitida por $${monto.toLocaleString('es-AR')}`,
      fecha: serverTimestamp(),
      extras: { opId: key }
    });
    dialog.remove();
    await this.loadData();
  }
}
