# Vinculación cuenta ↔ ficha de personal

Permitir que una cuenta de acceso `PERSONAL_CAMPO` quede asociada a una ficha de personal, que es lo
que hoy determina si «Mis servicios» tiene algo que mostrar. Sigue el molde del CRM: se gestiona en el
módulo dueño del registro y el otro lado advierte.

## Specs

- **S1 — El contrato ya existe y no se amplía.** `PUT /api/personal/{id}/cuenta` con cuerpo
  `{ "idUsuario": number | null }`, donde `null` desvincula. Permiso `PERSONAL_ACTUALIZAR`, que en el
  seed tienen `ADMINISTRADOR` y `ADMINISTRATIVO`. El servicio ya exige que la cuenta tenga rol
  `PERSONAL_CAMPO`, rechaza una cuenta ya vinculada a otra ficha y permite desvincular. Errores:
  400 (rol incorrecto), 403 (permiso), 404 (persona o cuenta inexistente), 409 (cuenta ya vinculada).
  No se agregan endpoints, campos, permisos ni migraciones.

- **S2 — La ficha muestra el estado real de la cuenta.** Con `idUsuario` nulo, la ficha dice «Sin cuenta
  de acceso» y ofrece vincular. Con `idUsuario` presente, dice «Cuenta vinculada» y ofrece desvincular.
  La ficha no inventa el correo de la cuenta: el contrato solo expone el identificador, y no se modifica
  el backend para mostrarlo.

- **S3 — Vincular exige elegir una cuenta real.** El selector lista cuentas activas con rol
  `PERSONAL_CAMPO` y muestra nombre y correo; una cuenta que ya tiene ficha aparece como no disponible
  con su motivo. Nunca se escribe un identificador a mano ni se inventa una cuenta inexistente.

- **S4 — Desvincular es explícito y advierte la consecuencia.** La confirmación nombra la persona y la
  cuenta y dice que dejará de ver sus servicios y que las asignaciones permanecen en la ficha. No
  promete cerrar sesiones abiertas ni desactivar la cuenta: el backend no lo hace.

- **S5 — Mismas reglas de escritura que el resto del CRM.** El pendiente bloquea doble envío y
  Cancelar/Escape/click afuera; un fallo se muestra inline conservando la elección; solo un éxito
  confirmado avisa y refresca la ficha una vez. Nunca se optimiza el estado ni se reintenta solo.

- **S6 — El lado IAM advierte, no gestiona.** En el alta de un usuario con rol `PERSONAL_CAMPO` aparece
  el aviso de que la cuenta debe vincularse a una ficha en RRHH para ver sus servicios, con el mismo
  tono que el aviso de `CLIENTE`. La relación se administra en la ficha, igual que en el CRM.

- **S7 — Un solo correo en todo el sistema.** El correo de una ficha de personal es único contra
  `personal_campo`, `cliente` y `usuario`, incluso entre registros inactivos, con la misma normalización
  del CRM (recortado y en minúsculas; vacío no reserva). Se apoya en la garantía que ya existe para
  cliente y usuario en lugar de inventar otra: una migración agrega `correo_normalizado` con restricción
  única en `personal_campo` y el validador cruzado se extiende para incluirla. Crear o editar una ficha
  con un correo ya tomado falla con un error tipado, nunca con un duplicado silencioso.

- **S8 — La ficha manda y la cuenta la sigue.** La ficha de personal es la descripción autoritativa del
  empleado. Al vincular, nombre y correo se copian de la ficha a la cuenta, validando antes que el correo
  esté libre; editar la ficha de una persona vinculada vuelve a sincronizar nombre y correo a su cuenta en
  la misma transacción. Editar la cuenta desde IAM no puede hacerla divergir: al guardar una cuenta
  vinculada, nombre y correo se re-sincronizan desde la ficha. Teléfono, documento, tipo y estado siguen
  siendo independientes. El correo es la credencial de inicio de sesión, así que la pantalla lo advierte y
  la sincronización nunca cambia la contraseña.

- **S9 — La ficha muestra la cuenta real.** `PersonalResponse` expone `correoUsuario` (nullable) resuelto
  en lote para las listas, sin una consulta por fila. La sección «Cuenta de acceso» deja de imprimir el
  identificador y muestra el correo de la cuenta vinculada.

## Tasks

| ID  | Tarea                                                                                          | Specs  | Repo     | Estado                |
| --- | ---------------------------------------------------------------------------------------------- | ------ | -------- | --------------------- |
| T1  | `linkStaffAccount` deja de ser UNSUPPORTED: validador, `PUT`, wire del repositorio y use case  | S1, S5 | frontend | **hecho** — `3c1eae8` |
| T2  | Sección «Cuenta de acceso» en la ficha: estado, vincular con selector y desvincular confirmado | S2-S5  | frontend | **hecho** — `3c1eae8` |
| T3  | Aviso de vinculación en el alta de usuario `PERSONAL_CAMPO`                                    | S6     | frontend | **hecho** — `b91ccd6` |

## Log

- **L1 (usuario, verbatim):** «Bueno ahora tenemos que hacer la pantalla de vinculación, y culminar con
  esta tarea, cualquier pregunta que tengas hazla»
- **L2 (usuario, decisión):** la relación se ve desde ambos lados «como está relacionado en el crm de
  clientes y usuario», desvincular sí «con las reglas que establecimos antes», y las cuentas elegibles
  son solo `PERSONAL_CAMPO`. Esto revierte la instrucción previa de no construir esta pantalla.
- **L3 (evidencia backend):** `PUT /api/personal/{id}/cuenta` con `VincularCuentaRequest.idUsuario`
  ya existe (`PersonalController.java:74-79`), con las reglas de rol, duplicado y desvinculación en
  `PersonalService.java:151-179`. `PersonalResponse` expone `idUsuario` pero no su correo
  (`PersonalDtos.java:73-76`). `PERSONAL_ACTUALIZAR` está en `ADMINISTRADOR` y `ADMINISTRATIVO`.
- **L4 (evidencia CRM):** el CRM no vincula cuentas existentes: crea la cuenta con el cliente o la
  retira, y el alta de usuario `CLIENTE` solo advierte. Por eso la gestión vive en la ficha y el lado
  IAM solo advierte. En la base hay 1 cuenta `PERSONAL_CAMPO` y 11 fichas libres.
- **L5 (cierre de implementación):** los tres slices están commiteados (`3c1eae8`, `b91ccd6`). Suite completa 4351/4351
  en 238 archivos, `tsc` app y spec en 0, formato limpio. El literal del rol se unificó: el editor de usuarios importa
  `FIELD_STAFF_ROLE_NAME` del routing de audiencias en lugar de repetirlo.
- **L6 (revisión nativa, no preparada):** con la base ya movida a `f09d2b1` el candidato son 18 archivos, pero `START`
  volvió a fallar con `candidate-owner-preparation-failed`/`ETIMEDOUT` sin crear lineage ni mutar nada. El defecto es
  intermitente del provider y no depende del tamaño del candidato. No se reintentó.
- **L7 (pendiente de aceptación):** prueba en vivo de desvincular y revincular desde la ficha, backend real/CORS,
  redacción entre fichas y navegadores. El marcado de cuentas ocupadas puede quedarse corto por diseño; el 409 del
  servidor sigue siendo la autoridad.
