import { BaseModule, formatDate, formatDateTime } from './base-module.js';
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
      `<td>${record.facturas?.map(item => {
        const identificador = item.numero ?? item.facturaId;
        const monto = item.monto ? `$ ${Number(item.monto).toLocaleString('es-AR')}` : '';
        return `${identificador}${monto ? ` (${monto})` : ''}`;
      }).join('<br>') ?? '-'}</td>`,
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
      <label>Factura a pagar
        <select name="facturaId" required>
          <option value="">Seleccionar factura</option>
        </select>
      </label>
      <label>Monto<input name="monto" type="number" step="0.01" required></label>
      <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:flex-end;">
        <button class="btn" type="button" data-action="cancel">Cancelar</button>
        <button class="btn btn--primary" type="submit">Emitir</button>
      </div>
    `;
    const dialog = this.renderDialog(form);
    this.populateFacturaOptions(form);
    form.querySelector('select[name="facturaId"]')?.addEventListener('change', event => {
      const option = event.target.selectedOptions?.[0];
      if (!option) return;
      const saldo = option.dataset.saldo ? Number(option.dataset.saldo) : 0;
      if (saldo > 0) {
        const montoInput = form.querySelector('input[name="monto"]');
        if (montoInput && !montoInput.value) {
          montoInput.value = saldo;
        }
      }
    });
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
    const facturaId = formData.get('facturaId');
    const monto = Number(formData.get('monto'));
    const select = event.target.querySelector('select[name="facturaId"]');
    const facturaNumero = select?.selectedOptions?.[0]?.dataset?.numero;
    const timestamp = serverTimestamp();
    const payload = {
      numero: formData.get('numero'),
      condicion: 'A la orden del proveedor',
      estado: 'emitida',
      emitida_por: this.currentUser,
      facturas: [{ facturaId, monto, numero: facturaNumero }],
      timestamps: { creado: timestamp, actualizado: timestamp }
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
      fecha: timestamp
    });
    if (facturaId) {
      await this.vincularFacturaConOp({
        facturaId,
        opId: key,
        numero: payload.numero,
        monto,
        fecha: timestamp
      });
    }
    dialog.remove();
    await this.loadData();
  }

  async populateFacturaOptions(form) {
    const select = form.querySelector('select[name="facturaId"]');
    if (!select) {
      return;
    }
    select.innerHTML = '<option value="">Cargando facturas...</option>';
    try {
      const client = getRealtimeClient();
      const facturas = await client.list('facturas');
      const disponibles = facturas.filter(factura =>
        ['aprobada', 'auditada', 'en_propuesta', 'programada_pago', 'pagada_parcial'].includes(factura.estado ?? '')
      );
      if (!disponibles.length) {
        select.innerHTML = '<option value="">No hay facturas disponibles</option>';
        return;
      }
      select.innerHTML = '<option value="">Seleccionar factura</option>';
      disponibles
        .sort((a, b) => new Date(a.vencimiento ?? 0) - new Date(b.vencimiento ?? 0))
        .forEach(factura => {
          const option = document.createElement('option');
          option.value = factura.id;
          const saldo = factura.saldo ?? factura.importe_total ?? 0;
          option.dataset.saldo = saldo;
          option.dataset.numero = factura.numero ?? factura.id;
          const proveedor = factura.proveedor_nombre ?? factura.proveedor_id ?? '';
          const vencimiento = factura.vencimiento ? ` · vence ${formatDate(factura.vencimiento)}` : '';
          option.textContent = `${factura.numero ?? factura.id}${proveedor ? ` · ${proveedor}` : ''} · $ ${Number(saldo).toLocaleString('es-AR')}${vencimiento}`;
          select.appendChild(option);
        });
    } catch (error) {
      console.error('No se pudieron cargar las facturas', error);
      select.innerHTML = '<option value="">Error al cargar facturas</option>';
    }
  }

  async vincularFacturaConOp({ facturaId, opId, numero, monto, fecha }) {
    const client = getRealtimeClient();
    const factura = await client.get(`facturas/${facturaId}`);
    if (!factura) {
      return;
    }
    const ordenesPago = factura.ordenes_pago ?? [];
    const saldoActual = factura.saldo ?? factura.importe_total ?? 0;
    const nuevoSaldo = Math.max(0, saldoActual - (monto ?? 0));
    let nuevoEstado = factura.estado ?? 'cargada';
    if (monto) {
      if (nuevoSaldo <= 0) {
        nuevoEstado = 'pagada_total';
      } else if (nuevoSaldo < saldoActual) {
        nuevoEstado = 'pagada_parcial';
      } else if (!['pagada_total', 'pagada_parcial'].includes(nuevoEstado)) {
        nuevoEstado = 'programada_pago';
      }
    }
    const opInfo = {
      opId,
      numero,
      monto,
      fecha,
      generado_por: this.currentUser
    };
    await client.update(`facturas/${facturaId}`, {
      ordenes_pago: [...ordenesPago, opInfo],
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', facturaId, {
      entidad: 'facturas',
      id: facturaId,
      evento: 'op_asociada',
      usuario: this.currentUser,
      detalle: `Asociada OP ${numero} por $ ${Number(monto ?? 0).toLocaleString('es-AR')}`,
      fecha: serverTimestamp(),
      extras: { opId }
    });
  }
}
