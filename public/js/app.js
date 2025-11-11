import { registerRoute, navigate } from './router.js';
import { OrdenesCompraModule } from './ui/oc.js';
import { RemitosModule } from './ui/remitos.js';
import { FacturasModule } from './ui/facturas.js';
import { PropuestasModule } from './ui/propuestas.js';
import { OrdenesPagoModule } from './ui/op.js';
import { LegajosModule } from './ui/legajos.js';
import { AuditoriaModule } from './ui/auditoria.js';
import { postLogin } from './auth.js';

const modules = {
  oc: permisos => new OrdenesCompraModule(permisos),
  remitos: permisos => new RemitosModule(permisos),
  facturas: permisos => new FacturasModule(permisos),
  propuestas: permisos => new PropuestasModule(permisos),
  op: permisos => new OrdenesPagoModule(permisos),
  legajos: permisos => new LegajosModule(permisos),
  auditoria: permisos => new AuditoriaModule(permisos)
};

Object.entries(modules).forEach(([id, factory]) => {
  registerRoute(id, permisos => factory(permisos));
});

if (sessionStorage.getItem('userId') && sessionStorage.getItem('userPermisos')) {
  postLogin();
}
