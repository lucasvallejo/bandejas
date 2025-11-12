import { getRealtimeClient } from '../firebase.js';
import { mapToTimelineEvents } from '../utils/firebase-utils.js';
import { formatDateTime } from '../utils/dates.js';

const timelineDock = document.getElementById('timelineDock');
const timelineContent = document.getElementById('timelineContent');
const timelineClose = document.getElementById('timelineClose');

if (timelineClose) {
  timelineClose.addEventListener('click', () => timelineDock.classList.add('hidden'));
}

export async function openTimeline(entidad, id) {
  const client = getRealtimeClient();
  const data = await client._request(`auditoria/${entidad}/${id}`);
  const events = data ? mapToTimelineEvents(Object.entries(data)) : [];
  renderTimeline(events);
  timelineDock.classList.remove('hidden');
}

function renderTimeline(events) {
  timelineContent.innerHTML = '';
  if (!events.length) {
    timelineContent.innerHTML = '<p>No hay eventos registrados.</p>';
    return;
  }
  events.forEach(event => {
    const node = buildTimelineItem(event);
    timelineContent.appendChild(node);
  });
}

function buildTimelineItem(event) {
  const template = document.getElementById('timelineItemTemplate');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.timeline-item__event').textContent = event.evento ?? event.tipo ?? 'Evento';
  clone.querySelector('.timeline-item__time').textContent = formatDateTime(event.fecha);
  clone.querySelector('.timeline-item__details').textContent = event.detalle ?? '';
  clone.querySelector('.timeline-item__user').textContent = event.usuario
    ? `${event.usuario.nombre} (${event.usuario.rol ?? ''})`
    : 'Sistema';
  const actions = clone.querySelector('.timeline-item__actions');
  if (event.extras?.transaction_id) {
    const button = document.createElement('button');
    button.className = 'btn btn--icon';
    button.textContent = '🔗';
    button.title = `Transaction ID: ${event.extras.transaction_id}`;
    button.addEventListener('click', () => navigator.clipboard.writeText(event.extras.transaction_id));
    actions.appendChild(button);
  }
  return clone;
}
