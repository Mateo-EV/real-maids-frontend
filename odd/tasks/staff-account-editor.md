# Editor de empleado con cuenta de acceso

Replicar para `personal_campo` el ciclo de vida que el CRM ya tiene entre `cliente` y `usuario`: el
empleado y su cuenta nacen juntos, se editan juntos y la cuenta se retira desactivándola.

## Specs

- **S1 — El alta crea empleado y cuenta juntos.** `POST /api/personal` acepta `crearCuenta` y `password`
  opcionales, con las mismas validaciones que el cliente: contraseña de 8–64 con mayúscula, minúscula y
  dígito, correo obligatorio cuando `crearCuenta` es verdadero, contraseña rechazada si el flag está
  ausente o falso. La cuenta se crea en la misma transacción con rol `PERSONAL_CAMPO`, nombre y correo de
  la ficha, y cambio de contraseña obligatorio en el primer ingreso. Un empleado sin cuenta es válido. Si
  falla la cuenta, no queda empleado a medias. El teléfono y el documento no se copian.

- **S2 — Editar mantiene una sola identidad.** Nombre y correo se sincronizan en los dos sentidos: editar
  la ficha actualiza su cuenta, y editar la cuenta desde IAM actualiza la ficha. Teléfono, documento,
  idioma, fecha de ingreso y estado de la ficha siguen siendo independientes de la cuenta. La contraseña
  nunca se sincroniza ni se muestra.

- **S3 — Retirar el acceso es la intención; desactivar es la implementación.** Sin la restricción de
  auditoría la cuenta se eliminaría, que es el comportamiento esperado: la persona deja de tener acceso.
  Por auditoría, desmarcar la cuenta **no** elimina la fila: deja `usuario.activo = false` y conserva el
  vínculo. La interfaz habla de **dar de baja el acceso**, nunca de conservar el registro ni de
  desactivar por conveniencia. A nivel lógico la ficha queda sin cuenta: la
  interfaz muestra «sin cuenta de acceso» y `correoUsuario` viaja nulo, aunque el identificador siga
  apuntando. Volver a marcarla reactiva esa misma cuenta actualizándole nombre y correo desde la ficha;
  nunca se crea una segunda cuenta para la misma ficha.

- **S4 — Un correo, un dueño.** Se mantiene la unicidad global entre `personal_campo`, `cliente` y
  `usuario`, incluso para cuentas desactivadas. Una cuenta desactivada sigue reservando su correo.

- **S5 — El editor es un espejo del de cliente.** Formulario de empleado con Signal Forms —nombre,
  documento, teléfono, correo, idioma, fecha de ingreso— y una sección «Cuenta de acceso» con checkbox y
  contraseña, con la misma jerarquía, el mismo tono y las mismas confirmaciones que el editor de cliente.
  El pendiente bloquea doble envío y toda forma de cierre; un fallo conserva los datos para reintentar;
  solo un éxito confirmado avisa y refresca la ficha y la lista.

- **S6 — La pantalla de vincular cuenta existente se retira.** El modelo del CRM no elige cuentas
  existentes: crea la propia. Se eliminan el selector, los diálogos de vincular y desvincular y el
  endpoint de vinculación deja de usarse desde la interfaz.

## Tasks

| ID  | Tarea                                                                                              | Specs  | Repo     | Estado    |
| --- | -------------------------------------------------------------------------------------------------- | ------ | -------- | --------- |
| T7  | Backend: `crearCuenta`/`password`, alta de cuenta y ciclo de vida de retiro por desactivación      | S1-S4  | backend  | pendiente |
| T8  | Backend: `correoUsuario` solo para cuenta activa y sincronización bidireccional de nombre y correo | S2-S4  | backend  | pendiente |
| T9  | Frontend: editor de empleado (alta y edición) con la sección de cuenta                             | S1, S5 | frontend | pendiente |
| T10 | Frontend: retirar la pantalla de vincular y ajustar la ficha a «sin cuenta» lógica                 | S3, S6 | frontend | pendiente |

## Log

- **L1 (usuario, corrección del modelo):** «el hecho de vincular como tal no era asi en crm, la idea era
  como estaba crm, se crea un empleado y a la vez su cuenta, se edita ya sea en rrhh o iam sus datos se
  actualizan en ambas tablan, vivian juntos, lo que se podia hacer era desactivar cuenta quera como
  desvincularlo por ejemplo al momento de editar el cliente en crm».
- **L2 (usuario, aclaración clave):** «como en la mayoria de casos por auditoria no se puede eliminar una
  cuenta de usuario, solo se desactiva a nivel fisico, pero a nivel logico no existia ya es como si el
  idUsuario de cliente fuera nulo aunque no lo es». Por eso el retiro es siempre desactivación.
- **L3 (usuario, alcance):** eligió el editor completo de empleado (alta y edición), no solo una sección.
- **L4 (evidencia CRM, backend):** `ClienteRequest` lleva `crearCuenta`/`password` y `ClienteService`
  crea la cuenta en la misma transacción (`ClienteService.java:125-154`); `CuentaClienteService` sincroniza
  el correo en ambos sentidos y retira con `estadoDeseado=false` (`CuentaClienteService.java:91-200`);
  `UsuarioService.actualizar` propaga el correo al cliente (`UsuarioService.java:182-200`).
- **L5 (estado previo descartado):** la pantalla de vinculación de cuenta existente (`3c1eae8`) respondía
  a un modelo equivocado y se retira en T10; la unicidad global (`V12`) y la sincronización de nombre y
  correo se conservan y se extienden a las reglas de este documento.
- **L6 (usuario, matiz de negocio):** «sino fuera por eso se eliminaria al usuario, que seria el
  comportamiento incial o esperado». La baja del acceso es la intención de negocio; la desactivación es
  solo el medio que impone la auditoría. El copy de la pantalla debe hablar de retirar el acceso.
- **L7 (usuario, reactivación):** «al momento de vincular o activar la cuenta se vuelve a crear el usuario,
  pero como en la mayoria de casos ese usuario solo está desactivado solo se vuelve a activar y queda».
  Confirmado: activar reutiliza la fila existente, nunca crea una segunda cuenta para la misma ficha.
- **L8 (revisión nativa, tercer intento fallido):** con el candidato del editor (33 archivos desde
  `f09d2b1`), `inspect` ofreció `review.start` y `START` volvió a fallar con
  `candidate-owner-preparation-failed`/`ETIMEDOUT`, sin crear lineage ni mutar nada. Es el tercer fallo
  consecutivo del proveedor (antes: `ETIMEDOUT`, `lens_context_budget_exceeded`, `ETIMEDOUT`), con
  candidatos de tamaños distintos, así que no depende del volumen. No se reintentó. El paquete queda con
  verificación propia y sin vista nativa; la aceptación en vivo sigue siendo la fuente de verdad.
