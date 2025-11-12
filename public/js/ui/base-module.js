import { openTimeline } from './timeline.js';
import { formatDate, formatDateTime } from '../utils/dates.js';

export class BaseModule {
  constructor({ id, entidad, permisos }) {
    this.id = id;
    this.entidad = entidad;
    this.permisos = permisos;
    this.container = document.createElement('section');
    this.container.className = 'grid';
  }

  getFiltersTemplate() {
    return '';
  }

  getTableHeaders() {
    return [];
  }

  mapRow() {
    return [];
  }

  buildLayout() {
    this.container.innerHTML = `
      <section class="card">
        <header class="module__header">
          <h2>${this.getTitle()}</h2>
          <div class="module__actions">${this.getHeaderActions() ?? ''}</div>
        </header>
        <section class="filters">${this.getFiltersTemplate()}</section>
        <section>
          <table class="table">
            <thead><tr>${this.getTableHeaders().map(text => `<th>${text}</th>`).join('')}</tr></thead>
            <tbody class="module__tbody"></tbody>
          </table>
        </section>
      </section>
    `;
    this.tableBody = this.container.querySelector('.module__tbody');
  }

  getTitle() {
    return 'Módulo';
  }

  getHeaderActions() {
    return '';
  }

  attach(container) {
    this.buildLayout();
    container.innerHTML = '';
    container.appendChild(this.container);
    this.bindEvents();
    this.loadData();
  }

  bindEvents() {}

  async loadData() {
    const records = await this.fetchData();
    this.renderRows(records);
  }

  async fetchData() {
    return [];
  }

  renderRows(records) {
    this.tableBody.innerHTML = '';
    if (!records.length) {
      this.tableBody.innerHTML = '<tr><td colspan="6">Sin registros</td></tr>';
      return;
    }
    records.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = this.mapRow(record).join('');
      row.addEventListener('click', () => openTimeline(this.entidad, record.id));
      this.tableBody.appendChild(row);
    });
  }
}

export function formatStateBadge(state, palette = {}) {
  const color = palette[state] ?? 'badge';
  return `<span class="badge ${color}">${state}</span>`;
}

export { formatDate, formatDateTime };
