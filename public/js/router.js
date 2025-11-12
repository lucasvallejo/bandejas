const routes = new Map();

export function registerRoute(id, factory) {
  routes.set(id, factory);
}

export function navigate(id, context) {
  const target = routes.get(id);
  if (!target) {
    console.warn(`Ruta ${id} no registrada`);
    return;
  }
  context.currentModule = target(context.permisos);
  context.currentModule.currentUser = context.currentUser;
  context.currentModule.attach(context.mainContent);
}
