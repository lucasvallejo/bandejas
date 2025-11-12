import { BaseModule, formatDateTime } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { exportToExcel } from '../utils/excel.js';
import { getCurrentIsoWeek } from '../utils/dates.js';

export class PropuestasModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'propuestas', entidad: 'propuestas', permisos });
  }

  getTitle() {
    return 'Propuesta semanal de pagos';
  }

  getHeaderActions() {
    return '<button id="propuestaNueva" class="btn btn--primary">Generar propuesta</button>';
  }

  getTableHeaders() {
    return ['Semana', 'Estado', 'Facturas', 'Monto total', 'Actualizado'];
  }

  bindEvents() {
    this.container.querySelector('#propuestaNueva')?.addEventListener('click', () => this.generatePropuesta());
  }

  mapRow(record) {
    const total = record.facturas?.reduce((acc, item) => acc + (item.importe ?? 0), 0) ?? 0;
    return [
      `<td>${record.semana}</td>`,
      `<td>${record.estado}</td>`,
      `<td>${record.facturas?.length ?? 0}</td>`,
      `<td>$ ${total.toLocaleString('es-AR')}</td>`,
      `<td>${formatDateTime(record.timestamps?.actualizado)}</td>`
    ];
  }

  async fetchData() {
    const client = getRealtimeClient();
    return client.list('propuestas');
  }

  async generatePropuesta() {
    const client = getRealtimeClient();
    const facturas = await client.list('facturas');
    const aprobadas = facturas.filter(factura => ['aprobada', 'auditada'].includes(factura.estado));
    const semana = getCurrentIsoWeek();
    const payload = {
      semana,
      estado: 'borrador',
      facturas: aprobadas.map(factura => ({
        facturaId: factura.id,
        importe: factura.saldo ?? factura.importe_total,
        vencimiento: factura.vencimiento,
        proveedor_id: factura.proveedor_id
      })),
      generada_por: this.currentUser,
      timestamps: { creado: serverTimestamp(), actualizado: serverTimestamp() }
    };
    const result = await client.create('propuestas', payload);
    const key = result?.name;
    await client.appendAudit('propuestas', key, {
      entidad: 'propuestas',
      id: key,
      evento: 'generacion',
      usuario: this.currentUser,
      detalle: `Propuesta ${semana} generada con ${payload.facturas.length} facturas`,
      fecha: serverTimestamp()
    });
    await this.loadData();
  }

  async exportar(propuesta) {
    const rows = propuesta.facturas?.map(item => ({
      factura: item.facturaId,
      importe: item.importe,
      vencimiento: item.vencimiento,
      proveedor: item.proveedor_id
    })) ?? [];
    await exportToExcel(`propuesta_${propuesta.semana}`, rows);
  }
}
