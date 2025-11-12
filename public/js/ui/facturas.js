import { BaseModule, formatDate, formatDateTime } from './base-module.js';
import { openTimeline } from './timeline.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { getDownloadURL, uploadAttachment } from '../utils/storage.js';

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
    return ['Número', 'Órdenes de compra', 'Proveedor', 'Importe', 'Vencimiento', 'Estado', 'Saldo', 'Acciones'];
  }

  mapRow(record) {
    const ocRefs = record.ocRefs?.length
      ? record.ocRefs.map(ref => ref.ocId).join('<br>')
      : record.ocId ?? '-';
    const acciones = [
      '<button type="button" class="btn btn--link" data-action="detalle">Detalle</button>',
      '<button type="button" class="btn btn--link" data-action="timeline">Historial</button>'
    ];
    return [
      `<td>${record.numero}</td>`,
      `<td>${ocRefs}</td>`,
      `<td>${record.proveedor_nombre ?? record.proveedor_id ?? '-'}</td>`,
      `<td>$ ${record.importe_total?.toLocaleString('es-AR')}</td>`,
      `<td>${formatDate(record.vencimiento)}</td>`,
      `<td>${record.estado}</td>`,
      `<td>$ ${(record.saldo ?? record.importe_total)?.toLocaleString('es-AR')}</td>`,
      `<td class="table__actions">${acciones.join('')}</td>`
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
      .filter(factura => (vencimiento ? factura.vencimiento <= vencimiento : true))
      .map(factura => ({
        ...factura,
        ocRefs: factura.ocRefs ?? (factura.ocId ? [{ ocId: factura.ocId }] : []),
        ordenes_pago: factura.ordenes_pago ?? []
      }));
  }

  openCreateModal() {
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva factura</h3>
      <label>Número<input name="numero" required></label>
      <label>Órdenes de compra vinculadas<input name="ocIds" placeholder="OC-0001, OC-0002"></label>
      <label>Importe total<input name="importe_total" type="number" required step="0.01"></label>
      <label>Vencimiento<input name="vencimiento" type="date" required></label>
      <label>Adjuntos<input name="adjunto" type="file" accept="application/pdf" multiple required></label>
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
    const rawOcIds = formData.get('ocIds');
    const ocIds = rawOcIds
      ? rawOcIds
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : [];
    const now = serverTimestamp();
    const ocRefs = ocIds.map(ocId => ({ ocId, agregado_por: this.currentUser, fecha: now }));
    const payload = {
      numero: formData.get('numero'),
      importe_total: Number(formData.get('importe_total')),
      vencimiento: formData.get('vencimiento'),
      estado: 'cargada',
      cargada_por: this.currentUser,
      saldo: Number(formData.get('importe_total')),
      ocRefs,
      ocId: ocIds[0],
      timestamps: { creado: now, actualizado: now }
    };
    const client = getRealtimeClient();
    const result = await client.create('facturas', payload);
    const key = result?.name;
    const files = formData.getAll('adjunto')?.filter(file => file && file.size) ?? [];
    const uploads = [];
    for (const file of files) {
      const upload = await uploadAttachment('facturas', key, file);
      uploads.push({ ...upload, cargado_por: this.currentUser });
    }
    if (uploads.length) {
      await client.update(`facturas/${key}`, { adjuntos: uploads });
    }
    await client.appendAudit('facturas', key, {
      entidad: 'facturas',
      id: key,
      evento: 'carga',
      usuario: this.currentUser,
      detalle: `Factura ${payload.numero} cargada${ocIds.length ? ` con ${ocIds.length} OC` : ''}`,
      fecha: serverTimestamp(),
      extras: ocIds.length ? { ocIds } : undefined
    });
    dialog.remove();
    await this.loadData();
  }

  renderRows(records) {
    this.tableBody.innerHTML = '';
    if (!records.length) {
      this.tableBody.innerHTML = '<tr><td colspan="8">Sin registros</td></tr>';
      return;
    }
    records.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = this.mapRow(record).join('');
      row.addEventListener('click', () => openTimeline('facturas', record.id));
      row.querySelector('[data-action="detalle"]')?.addEventListener('click', event => {
        event.stopPropagation();
        this.openDetailModal(record.id);
      });
      row.querySelector('[data-action="timeline"]')?.addEventListener('click', event => {
        event.stopPropagation();
        openTimeline('facturas', record.id);
      });
      this.tableBody.appendChild(row);
    });
  }

  openDetailModal(facturaId) {
    const container = document.createElement('section');
    container.className = 'card';
    container.innerHTML = '<h3>Factura</h3><p>Cargando detalle...</p>';
    const dialog = this.renderDialog(container);
    this.refreshDetailContent(facturaId, container, dialog);
  }

  async refreshDetailContent(facturaId, container, dialog) {
    const client = getRealtimeClient();
    const factura = await client.get(`facturas/${facturaId}`);
    if (!factura) {
      container.innerHTML = '<p>No se encontró la factura.</p>';
      return;
    }
    const detalle = document.createElement('section');
    detalle.className = 'factura-detalle';
    detalle.innerHTML = `
      <header style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
        <div>
          <h3 style="margin:0;">Factura ${factura.numero}</h3>
          <p style="margin:0;">Estado: <strong>${factura.estado}</strong></p>
          <p style="margin:0;">Vencimiento: ${formatDate(factura.vencimiento)}</p>
          <p style="margin:0;">Saldo: $ ${(factura.saldo ?? factura.importe_total)?.toLocaleString('es-AR')}</p>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn" data-action="ver-timeline">Ver historial</button>
          <button class="btn" data-action="cerrar">Cerrar</button>
        </div>
      </header>
      <section style="margin-top:1rem;">
        <h4>Órdenes de compra asociadas</h4>
        <ul class="factura-detalle__oc"></ul>
      </section>
      <section style="margin-top:1rem;">
        <h4>Adjuntos</h4>
        <ul class="factura-detalle__adjuntos"></ul>
      </section>
      <section style="margin-top:1rem;">
        <h4>Órdenes de pago vinculadas</h4>
        <ul class="factura-detalle__op"></ul>
      </section>
    `;
    container.innerHTML = '';
    container.appendChild(detalle);

    container.querySelector('[data-action="cerrar"]').addEventListener('click', () => dialog.remove());
    container.querySelector('[data-action="ver-timeline"]').addEventListener('click', () => openTimeline('facturas', facturaId));

    await this.renderOcList(factura, container, facturaId, dialog);
    await this.renderAdjuntos(factura, container, facturaId, dialog);
    this.renderOrdenesPago(factura, container);
  }

  async renderOcList(factura, container, facturaId, dialog) {
    const list = container.querySelector('.factura-detalle__oc');
    list.innerHTML = '';
    const refs = factura.ocRefs ?? (factura.ocId ? [{ ocId: factura.ocId }] : []);
    if (!refs.length) {
      list.innerHTML = '<li>No hay órdenes de compra asociadas.</li>';
    } else {
      refs.forEach(ref => {
        const item = document.createElement('li');
        const fecha = ref.fecha ? formatDateTime(ref.fecha) : '';
        const usuario = ref.agregado_por?.nombre ?? '';
        item.textContent = usuario || fecha
          ? `${ref.ocId} — ${usuario ? `por ${usuario}` : ''}${usuario && fecha ? ' · ' : ''}${fecha}`
          : ref.ocId;
        list.appendChild(item);
      });
    }

    if (this.permisos?.perm_factura_carga || this.permisos?.perm_factura_verificar) {
      const form = document.createElement('form');
      form.className = 'factura-detalle__oc-form';
      form.innerHTML = `
        <label style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;">
          <span>Agregar OC</span>
          <input name="oc" placeholder="OC-0001, OC-0002" style="flex:1;">
          <button class="btn btn--primary" type="submit">Asociar</button>
        </label>
      `;
      form.addEventListener('submit', event => {
        event.preventDefault();
        const ocValue = new FormData(form).get('oc');
        this.handleAssociateOc(facturaId, ocValue, container, dialog);
        form.reset();
      });
      container.querySelector('.factura-detalle__oc').parentElement.appendChild(form);
    }
  }

  async handleAssociateOc(facturaId, ocValue, container, dialog) {
    if (!ocValue) {
      return;
    }
    const ocIds = ocValue
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (!ocIds.length) {
      return;
    }
    const client = getRealtimeClient();
    const factura = await client.get(`facturas/${facturaId}`);
    const existentes = factura.ocRefs ?? (factura.ocId ? [{ ocId: factura.ocId }] : []);
    const existentesIds = new Set(existentes.map(ref => ref.ocId));
    const now = serverTimestamp();
    const nuevos = ocIds
      .filter(ocId => !existentesIds.has(ocId))
      .map(ocId => ({ ocId, agregado_por: this.currentUser, fecha: now }));
    if (!nuevos.length) {
      return;
    }
    const actualizados = [...existentes, ...nuevos];
    await client.update(`facturas/${facturaId}`, {
      ocRefs: actualizados,
      ocId: actualizados[0]?.ocId,
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', facturaId, {
      entidad: 'facturas',
      id: facturaId,
      evento: 'oc_asociada',
      usuario: this.currentUser,
      detalle: `Asociadas OC: ${nuevos.map(ref => ref.ocId).join(', ')}`,
      fecha: serverTimestamp()
    });
    await this.loadData();
    await this.refreshDetailContent(facturaId, container, dialog);
  }

  async renderAdjuntos(factura, container, facturaId, dialog) {
    const list = container.querySelector('.factura-detalle__adjuntos');
    list.innerHTML = '';
    const adjuntos = factura.adjuntos ?? [];
    if (!adjuntos.length) {
      list.innerHTML = '<li>No hay adjuntos cargados.</li>';
    } else {
      adjuntos.forEach(async adjunto => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = adjunto.nombre ?? adjunto.path.split('/').pop();
        link.target = '_blank';
        try {
          link.href = await getDownloadURL(adjunto.path);
        } catch (error) {
          console.error('No se pudo obtener el adjunto', error);
        }
        const detalles = [];
        if (adjunto.cargado_por?.nombre) {
          detalles.push(`por ${adjunto.cargado_por.nombre}`);
        }
        if (adjunto.uploadedAt) {
          detalles.push(formatDateTime(adjunto.uploadedAt));
        }
        const extra = detalles.length ? ` <small>(${detalles.join(' · ')})</small>` : '';
        item.appendChild(link);
        if (extra) {
          const span = document.createElement('span');
          span.innerHTML = extra;
          item.appendChild(span);
        }
        list.appendChild(item);
      });
    }

    if (this.permisos?.perm_factura_carga) {
      const form = document.createElement('form');
      form.className = 'factura-detalle__adjuntos-form';
      form.innerHTML = `
        <label style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem;">
          <span>Agregar adjuntos</span>
          <input type="file" name="adjuntos" accept="application/pdf" multiple>
          <button class="btn btn--primary" type="submit">Subir</button>
        </label>
      `;
      form.addEventListener('submit', event => {
        event.preventDefault();
        const files = form.querySelector('input[type="file"]').files;
        this.handleAttachmentsUpload(facturaId, files, container, dialog);
        form.reset();
      });
      container.querySelector('.factura-detalle__adjuntos').parentElement.appendChild(form);
    }
  }

  async handleAttachmentsUpload(facturaId, files, container, dialog) {
    if (!files?.length) {
      return;
    }
    const client = getRealtimeClient();
    const uploads = [];
    for (const file of Array.from(files)) {
      if (!file.size) continue;
      const upload = await uploadAttachment('facturas', facturaId, file);
      uploads.push({ ...upload, cargado_por: this.currentUser });
    }
    if (!uploads.length) {
      return;
    }
    const factura = await client.get(`facturas/${facturaId}`);
    const existentes = factura.adjuntos ?? [];
    await client.update(`facturas/${facturaId}`, {
      adjuntos: [...existentes, ...uploads],
      timestamps: { actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', facturaId, {
      entidad: 'facturas',
      id: facturaId,
      evento: 'adjuntos_agregados',
      usuario: this.currentUser,
      detalle: `Se agregaron ${uploads.length} adjunto(s)`,
      fecha: serverTimestamp()
    });
    await this.loadData();
    await this.refreshDetailContent(facturaId, container, dialog);
  }

  renderOrdenesPago(factura, container) {
    const list = container.querySelector('.factura-detalle__op');
    list.innerHTML = '';
    const ordenes = factura.ordenes_pago ?? [];
    if (!ordenes.length) {
      list.innerHTML = '<li>No hay órdenes de pago vinculadas.</li>';
      return;
    }
    ordenes
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .forEach(op => {
        const item = document.createElement('li');
        const monto = op.monto ? `$ ${Number(op.monto).toLocaleString('es-AR')}` : '';
        const fecha = op.fecha ? formatDateTime(op.fecha) : '';
        const usuario = op.generado_por?.nombre ?? '';
        item.textContent = [op.numero ?? op.opId, monto, fecha, usuario ? `por ${usuario}` : '']
          .filter(Boolean)
          .join(' · ');
        list.appendChild(item);
      });
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
