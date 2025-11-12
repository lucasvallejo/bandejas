import { BaseModule, formatDate } from './base-module.js';
import { getRealtimeClient } from '../firebase.js';
import { serverTimestamp } from '../utils/firebase-utils.js';
import { uploadAttachment, getDownloadURL } from '../utils/storage.js';
import { openTimeline } from './timeline.js';

export class FacturasModule extends BaseModule {
  constructor(permisos) {
    super({ id: 'facturas', entidad: 'facturas', permisos });
    this.ocCache = null;
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
    return [
      'Número',
      'Proveedor',
      'Importe',
      'OC asociadas',
      'OP asociadas',
      'Vencimiento',
      'Estado',
      'Saldo',
      'Adjuntos',
      'Acciones'
    ];
  }

  mapRow(record) {
    const ocSummary = record.ocRefs?.length
      ? record.ocRefs.map(ref => ref.numero ?? ref.ocId).join('<br>')
      : '-';
    const opSummary = record.ordenesPago?.length
      ? record.ordenesPago
          .map(op => `${op.opNumero ?? op.opId} ($${Number(op.monto ?? 0).toLocaleString('es-AR')})`)
          .join('<br>')
      : '-';
    const adjuntosBadge = record.adjuntos?.length
      ? `<span class="badge badge--neutral">${record.adjuntos.length}</span>`
      : '-';
    return [
      `<td>${record.numero}</td>`,
      `<td>${record.proveedor_nombre ?? record.proveedor_id ?? '-'}</td>`,
      `<td>$ ${Number(record.importe_total ?? 0).toLocaleString('es-AR')}</td>`,
      `<td>${ocSummary}</td>`,
      `<td>${opSummary}</td>`,
      `<td>${formatDate(record.vencimiento)}</td>`,
      `<td>${record.estado}</td>`,
      `<td>$ ${Number(record.saldo ?? record.importe_total ?? 0).toLocaleString('es-AR')}</td>`,
      `<td>${adjuntosBadge}</td>`,
      '<td><button class="btn btn--ghost btn--small" data-action="manage">Gestionar</button></td>'
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
      .map(factura => this.decorateFactura(factura));
  }

  async openCreateModal() {
    const ocs = await this.loadOcs();
    const form = document.createElement('form');
    form.className = 'card';
    form.innerHTML = `
      <h3>Nueva factura</h3>
      <label>Número<input name="numero" required></label>
      <label>OC vinculada (opcional)
        <select name="ocId">
          <option value="">Sin vincular</option>
          ${ocs
            .map(
              oc =>
                `<option value="${oc.id}">${oc.numero ?? oc.id} · ${oc.proveedor_nombre ?? oc.sector ?? ''}</option>`
            )
            .join('')}
        </select>
      </label>
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
    const ocSelected = (formData.get('ocId') ?? '').toString().trim();
    const ocInfo = ocSelected
      ? await this.resolveOcReference(ocSelected)
      : null;
    const payload = {
      numero: formData.get('numero'),
      ocId: ocInfo?.ocId ?? null,
      ocRefs: ocInfo ? [ocInfo] : [],
      importe_total: Number(formData.get('importe_total')),
      vencimiento: formData.get('vencimiento'),
      estado: 'cargada',
      cargada_por: this.currentUser,
      saldo: Number(formData.get('importe_total')),
      ordenesPago: [],
      adjuntos: [],
      timestamps: { creado: serverTimestamp(), actualizado: serverTimestamp() }
    };
    const client = getRealtimeClient();
    const result = await client.create('facturas', payload);
    const key = result?.name;
    const file = formData.get('adjunto');
    const attachment = await uploadAttachment('facturas', key, file);
    await client.update(`facturas/${key}`, {
      adjuntos: [attachment],
      timestamps: { creado: payload.timestamps.creado, actualizado: serverTimestamp() }
    });
    await client.appendAudit('facturas', key, {
      entidad: 'facturas',
      id: key,
      evento: 'carga',
      usuario: this.currentUser,
      detalle: `Factura ${payload.numero} cargada`,
      fecha: serverTimestamp()
    });
    if (ocInfo) {
      await client.appendAudit('facturas', key, {
        entidad: 'facturas',
        id: key,
        evento: 'oc_asociada',
        usuario: this.currentUser,
        detalle: `OC ${ocInfo.numero ?? ocInfo.ocId} vinculada al momento de la carga`,
        fecha: serverTimestamp(),
        extras: { ocId: ocInfo.ocId }
      });
      await client.appendAudit('oc', ocInfo.ocId, {
        entidad: 'oc',
        id: ocInfo.ocId,
        evento: 'factura_vinculada',
        usuario: this.currentUser,
        detalle: `Factura ${payload.numero} vinculada`,
        fecha: serverTimestamp(),
        extras: { facturaId: key }
      });
    }
    dialog.remove();
    await this.loadData();
  }

  renderRows(records) {
    this.tableBody.innerHTML = '';
    if (!records.length) {
      this.tableBody.innerHTML = '<tr><td colspan="10">Sin registros</td></tr>';
      return;
    }
    records.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = this.mapRow(record).join('');
      row.addEventListener('click', event => {
        if (event.target.closest('button[data-action="manage"]')) {
          return;
        }
        openTimeline('facturas', record.id);
      });
      row.querySelector('[data-action="manage"]').addEventListener('click', event => {
        event.stopPropagation();
        this.openManageModal(record);
      });
      this.tableBody.appendChild(row);
    });
  }

  decorateFactura(factura) {
    const ocRefs = Array.isArray(factura.ocRefs)
      ? factura.ocRefs
          .map(ref => ({
            ocId: ref.ocId ?? ref.id ?? ref,
            numero: ref.numero ?? ref.ocNumero ?? ref.ocId ?? ref,
            proveedor: ref.proveedor ?? ref.proveedor_nombre ?? ref.proveedorNombre ?? ''
          }))
          .filter(ref => Boolean(ref.ocId))
      : factura.ocId
      ? [
          {
            ocId: factura.ocId,
            numero: factura.ocNumero ?? factura.ocId,
            proveedor: factura.proveedor_nombre ?? factura.proveedor_id ?? ''
          }
        ]
      : [];
    const ordenesPago = Array.isArray(factura.ordenesPago)
      ? factura.ordenesPago
      : Array.isArray(factura.ordenes_pago)
      ? factura.ordenes_pago
      : [];
    return {
      ...factura,
      ocRefs,
      ordenesPago,
      adjuntos: factura.adjuntos ?? []
    };
  }

  async openManageModal(record) {
    const client = getRealtimeClient();
    const facturaRaw = await client.get(`facturas/${record.id}`);
    if (!facturaRaw) {
      alert('No se pudo cargar la factura seleccionada.');
      return;
    }
    const factura = this.decorateFactura({ id: record.id, ...facturaRaw });
    const ocs = await this.loadOcs();

    const form = document.createElement('form');
    form.className = 'card factura-manage';
    form.innerHTML = `
      <header class="factura-manage__header">
        <div>
          <h3>Factura ${factura.numero}</h3>
          <p class="factura-manage__meta">Proveedor: <strong>${
            factura.proveedor_nombre ?? factura.proveedor_id ?? '-'
          }</strong> · Estado: <strong>${factura.estado}</strong></p>
        </div>
      </header>
      <section class="factura-manage__section">
        <h4>Adjuntos</h4>
        <ul class="factura-manage__attachments" data-role="attachments"></ul>
        ${
          this.permisos?.perm_factura_carga
            ? '<label class="btn btn--ghost factura-manage__upload"><input type="file" accept="application/pdf,image/*" hidden id="facturaAdjuntoInput">Agregar adjunto</label>'
            : ''
        }
      </section>
      <section class="factura-manage__section">
        <h4>Órdenes de compra vinculadas</h4>
        <div class="factura-manage__oc-list" data-role="ocList"></div>
        <div class="factura-manage__actions">
          <select id="facturaOcSelect">
            <option value="">Seleccioná una OC</option>
            ${ocs
              .map(
                oc =>
                  `<option value="${oc.id}">${oc.numero ?? oc.id} · ${oc.proveedor_nombre ?? oc.sector ?? ''}</option>`
              )
              .join('')}
          </select>
          <button type="button" class="btn" id="facturaOcAdd">Agregar</button>
        </div>
      </section>
      <footer class="factura-manage__footer">
        <button type="button" class="btn" data-action="close">Cerrar</button>
        <button type="submit" class="btn btn--primary">Guardar asociaciones</button>
      </footer>
    `;

    const dialog = this.renderDialog(form);
    const selectedOcs = [...factura.ocRefs];
    const ocList = form.querySelector('[data-role="ocList"]');
    const attachmentsList = form.querySelector('[data-role="attachments"]');
    const addOcBtn = form.querySelector('#facturaOcAdd');
    const ocSelect = form.querySelector('#facturaOcSelect');
    const closeBtn = form.querySelector('[data-action="close"]');
    const fileInput = form.querySelector('#facturaAdjuntoInput');
    if (!ocs.length) {
      ocSelect.disabled = true;
      addOcBtn.disabled = true;
      const helper = document.createElement('p');
      helper.className = 'factura-manage__empty';
      helper.textContent = 'No hay órdenes de compra disponibles para vincular.';
      form.querySelector('.factura-manage__actions').appendChild(helper);
    }

    const renderSelectedOcs = () => {
      ocList.innerHTML = '';
      if (!selectedOcs.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Sin órdenes de compra vinculadas.';
        empty.className = 'factura-manage__empty';
        ocList.appendChild(empty);
        return;
      }
      selectedOcs.forEach(ref => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `<strong>${ref.numero ?? ref.ocId}</strong> ${ref.proveedor ? '· ' + ref.proveedor : ''}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chip__remove';
        remove.title = 'Quitar vínculo';
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          const index = selectedOcs.findIndex(item => item.ocId === ref.ocId);
          if (index >= 0) {
            selectedOcs.splice(index, 1);
            renderSelectedOcs();
          }
        });
        chip.appendChild(remove);
        ocList.appendChild(chip);
      });
    };

    const renderAttachments = () => {
      attachmentsList.innerHTML = '';
      if (!factura.adjuntos?.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Sin adjuntos cargados.';
        empty.className = 'factura-manage__empty';
        attachmentsList.appendChild(empty);
        return;
      }
      factura.adjuntos.forEach((adjunto, index) => {
        const item = document.createElement('li');
        item.className = 'factura-manage__attachment-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'factura-manage__attachment-link';
        button.textContent = adjunto.fileName ?? `Adjunto ${index + 1}`;
        button.addEventListener('click', async () => {
          try {
            const url = await getDownloadURL(adjunto.path);
            window.open(url, '_blank', 'noopener');
          } catch (error) {
            console.error('No se pudo obtener el adjunto', error);
            alert('No se pudo descargar el adjunto.');
          }
        });
        item.appendChild(button);
        attachmentsList.appendChild(item);
      });
    };

    addOcBtn.addEventListener('click', async () => {
      const value = ocSelect.value;
      if (!value) {
        alert('Seleccioná una orden de compra.');
        return;
      }
      if (selectedOcs.some(ref => ref.ocId === value)) {
        alert('La orden de compra ya está vinculada.');
        return;
      }
      const ocInfo = await this.resolveOcReference(value);
      if (!ocInfo) {
        alert('No se pudo identificar la orden de compra seleccionada.');
        return;
      }
      selectedOcs.push(ocInfo);
      renderSelectedOcs();
      ocSelect.value = '';
    });

    fileInput?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        addOcBtn.disabled = true;
        ocSelect.disabled = true;
        fileInput.disabled = true;
        const attachment = await uploadAttachment('facturas', factura.id, file);
        const updatedAdjuntos = [...(factura.adjuntos ?? []), attachment];
        await client.update(`facturas/${factura.id}`, {
          adjuntos: updatedAdjuntos,
          timestamps: { ...(factura.timestamps ?? {}), actualizado: serverTimestamp() }
        });
        factura.adjuntos = updatedAdjuntos;
        await client.appendAudit('facturas', factura.id, {
          entidad: 'facturas',
          id: factura.id,
          evento: 'adjunto_agregado',
          usuario: this.currentUser,
          detalle: `Adjunto ${attachment.fileName ?? file.name} agregado`,
          fecha: serverTimestamp()
        });
        renderAttachments();
      } catch (error) {
        console.error('Error al subir adjunto', error);
        alert('No se pudo subir el adjunto.');
      } finally {
        addOcBtn.disabled = false;
        ocSelect.disabled = false;
        fileInput.disabled = false;
        event.target.value = '';
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await this.persistOcAssociations(factura, selectedOcs);
        dialog.remove();
        await this.loadData();
      } catch (error) {
        console.error('No se pudieron guardar las asociaciones', error);
        alert('No se pudieron guardar los cambios.');
      }
    });

    closeBtn.addEventListener('click', () => dialog.remove());

    renderSelectedOcs();
    renderAttachments();
  }

  async resolveOcReference(value) {
    const ocs = await this.loadOcs();
    const match = ocs.find(oc => oc.id === value || oc.numero === value);
    if (!match) {
      return null;
    }
    return {
      ocId: match.id,
      numero: match.numero ?? match.id,
      proveedor: match.proveedor_nombre ?? match.sector ?? ''
    };
  }

  async persistOcAssociations(factura, selectedOcs) {
    const client = getRealtimeClient();
    const previous = factura.ocRefs ?? [];
    const payload = {
      ocRefs: selectedOcs,
      ocId: selectedOcs[0]?.ocId ?? null,
      timestamps: { ...(factura.timestamps ?? {}), actualizado: serverTimestamp() }
    };
    await client.update(`facturas/${factura.id}`, payload);

    const previousIds = new Set(previous.map(ref => ref.ocId));
    const newIds = new Set(selectedOcs.map(ref => ref.ocId));

    for (const ref of selectedOcs) {
      if (!previousIds.has(ref.ocId)) {
        await client.appendAudit('facturas', factura.id, {
          entidad: 'facturas',
          id: factura.id,
          evento: 'oc_asociada',
          usuario: this.currentUser,
          detalle: `OC ${ref.numero ?? ref.ocId} vinculada`,
          fecha: serverTimestamp(),
          extras: { ocId: ref.ocId }
        });
        await client.appendAudit('oc', ref.ocId, {
          entidad: 'oc',
          id: ref.ocId,
          evento: 'factura_vinculada',
          usuario: this.currentUser,
          detalle: `Factura ${factura.numero ?? factura.id} vinculada`,
          fecha: serverTimestamp(),
          extras: { facturaId: factura.id }
        });
      }
    }

    for (const ref of previous) {
      if (!newIds.has(ref.ocId)) {
        await client.appendAudit('facturas', factura.id, {
          entidad: 'facturas',
          id: factura.id,
          evento: 'oc_desvinculada',
          usuario: this.currentUser,
          detalle: `OC ${ref.numero ?? ref.ocId} desvinculada`,
          fecha: serverTimestamp(),
          extras: { ocId: ref.ocId }
        });
      }
    }
  }

  async loadOcs() {
    if (this.ocCache) {
      return this.ocCache;
    }
    const client = getRealtimeClient();
    this.ocCache = await client.list('oc');
    return this.ocCache;
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
