# Readable catalog labels and usable lead dialogs

Delivery target: primary frontend main (explicit user authorization). Strategy: coherent local commits below about400 authored lines each; no push/PR. Existing presentation changes only.
Checks: Angular official Vitest target, production SSR build, existing browser tooling where applicable.

## Specs

S1: "En la lista de prospectos has puesto el id de origen y id de estapa, perodeberia verse un badge en que estpa u origen está, no el ide."
S2: "El modal de crear y editar prospecto, está mu largo, no sale el boton crear en mi pantalla."
S3: "Hay varios selects, que deberian limitarse al mostara solo su elemnto no el id"
S4: "ok hazles commits a todos y ponlos en main y ya"

## Tasks

T1 | S1 | delegated | done | commit00880ea062939eebb7a1e2e2b4d3d6832248622b; focused21/21, typecheck and Prettier passed; resolve catalog names in desktop/mobile badges with honest unavailable/loading/error states and existing caller-owned read cancellation.
T2 | S2-S3 | inline (writer admission unavailable) | done | commitsad4a08474d13198f5c4924c4fcec75c756cc6dc3,c953cc45fa7190ffbb08a638b16ec73d9901cebd; RED5failed/78pass and RED4expected assertion failures/114pass plus corrected actor test selector; synthetic Chrome1561440x768/390x640 passed; viewport-bounded lead editor and readable existing select labels, preserving IDs as values and all lifecycle/write guards.
T3 | S1-S3 | inline | dropped (user explicitly deferred remaining timeout/native proof; not passed) | historical full-suite3267/3268 with a5000ms timeout in unchanged lead-conversion spec; production SSR exit0/one prerender/668.57kB vs500warning; no retry/timeouts weakened; integration, formatting, tests/build/browser checks and documentation.

T4 | S4 | inline | done | Reconcile all26 pending paths, format/check touched files and retain existing verification limitations. No new behavior or deferred test retries.
T5 | S1-S4 | inline | done | All26 pending paths committed on primary main as00880ea,ad4a084,c953cc4; source hashes preserved and commit path sets checked. No push.
T6 | S4 | inline | done | Verified primary main and clean worktree/index atc953cc4 after all three units; final documentation-only closure records these observed results. No push.

## Log

L1: necesito que en los modulos que hemos hecho desde wp1 a wp7, hay algunos cambios que debemos hacer:

- En la lista de prospectos has puesto el id de origen y id de estapa, perodeberia verse un badge en que estpa u origen está, no el ide.
- El modal de crear y editar prospecto, está mu largo, no sale el boton crear en mi pantalla.
- Hay varios selects, que deberian limitarse al mostara solo su elemnto no el id
  Por ahora esos cambios

L2: Keep changes in presentation; use existing root catalogs/TTL/session scope and unchanged dialog lifecycle. Unknown catalog references must remain explicit without invented names. No backend, auth, shared helpers, or global overlay changes. Spartan info succeeded; native review switch is on. Existing historical Auth failures are not authorized for repair.

L3: T1 worker observed RED3 expected behavior failures then GREEN21/21; app typecheck and Prettier passed. Parent focused test target over12 affected consumer specs passed378/378 after aligning old raw-ID and no-catalog expectations, keeping public numeric-value/payload assertions. Initial parent GREEN hit intermediate worker compile errors (corrected by worker), then legacy expectations (corrected). Full suite and production SSR run once at integration.

L4: node tmp/readable-labels-browser.cjs passed Chrome156.0.8078.80 at1440x768 and390x640 with synthetic API only: actual catalog badges, create/edit, viewport bounds, visible non-scrolling actions, scrolling body, focus containment and numeric payload IDs. Initial probe saw1px entrance-animation drift; waiting actual animation completion fixed the probe without relaxing geometry assertions. Angular MCP devserver_wait_for_build timed out; the started server nevertheless served the passing browser check. Edge/Firefox/live API/CORS/permission acceptance not executed.

L5: Native ASSESS after staging intended tracker reports medium,26paths/608changed lines, reviewDue:false, reviewDueReason:under_budget, writerSelfVerification:true, independentVerifier:false. No native review started and no approval claimed. Existing preference record label and audit applied-filter chip helper outputs are preserved; only additive option-specific labels are used by selects. No shared auth/store/parser/HTTP helper changed. Risk: none.

L6: Integration full target npx ng test --watch=false exited1:3267passed/1failed across173files(3268). Unchanged lead-conversion.spec.ts:165 timed out5000ms; focused suite had passed this case. Cause is unknown; no retry, runner/timeouts/assertions/dependency/Auth modifications. Production npx ng build --configuration production exited0, prerendered1route, initial668.57kB vs500kB warning. T3 awaits human choice: investigate the timeout or explicitly leave full-suite proof deferred. No commits/push/PR/merge performed. If preparing commits after proof is resolved, current authored scope~608lines exceeds400: obtain the required delivery-shape choice before the next commit rather than inventing publication authority. Local dev server remains at http://localhost:4200 for inspection; synthetic browser proof is not live backend/Edge/Firefox acceptance.

L7: User: "ok hazles commits a todos y ponlos en main y ya". This now authorizes all26 previously preserved dirty/staged frontend paths, not only email work. Main is active in the principal worktree at8b1cd3d. Backend delivery is unchanged (mateo=f32f783, backend main intact). Commit in coherent local units, no push; preserve historical failed/deferred global and native proof without retry or claiming approval. Later email integration already tested these same working-tree code bytes: customers/interceptor655/655, synthetic Chrome156 desktop/mobile and SSR exit0; final global3277/3278 had an unchanged follow-up timeout, explicitly deferred by the user. These are recorded observations, not checks rerun for this delivery.

L8: Observed fresh delivery checks: workspace-local Prettier --write then --check passed for all26 authorized paths; git diff --check passed. Planned units are inbox catalog badges (3paths/242authored lines), lead-dialog viewport/labels (7paths/324lines), remaining selectors/tests/docs (16paths/~165lines). These preserve previously verified behavior and leave full/native proof explicitly deferred. Commit directly on the user's requested primary main checkout; no push.

L9: Completed three local commits on the primary main checkout:00880ea062939eebb7a1e2e2b4d3d6832248622b (inbox badges),ad4a08474d13198f5c4924c4fcec75c756cc6dc3 (lead dialog viewport/labels),c953cc45fa7190ffbb08a638b16ec73d9901cebd (remaining selects/tests/docs). Each commit's path set was checked against its intended unit, original working-file hashes remained identical across commits, and final git status --porcelain was empty. Main remains active in the principal worktree. A documentation-only closure commit records this evidence; no push, PR, backend changes, timeout retry or native approval. Deferred global/native/live/browser-matrix proof remains deferred.
