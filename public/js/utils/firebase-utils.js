export function serverTimestamp() {
  return new Date().toISOString();
}

export function appendAuditEvent(event) {
  return {
    ...event,
    fecha: event.fecha ?? serverTimestamp(),
    eventId: event.eventId ?? crypto.randomUUID()
  };
}

export function mapToTimelineEvents(events = []) {
  return events
    .map(([eventId, payload]) => ({ id: eventId, ...payload }))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}
