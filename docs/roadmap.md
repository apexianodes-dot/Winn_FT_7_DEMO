# Roadmap WINN FT 7

## Etapa 1 — Demo (este starter)
- Registro por teléfono + contraseña.
- OTP simulado solo en desarrollo.
- Saldo inicial de 10,000 créditos ficticios.
- Libro de movimientos inmutable a nivel de aplicación.
- Lobby responsive y juego de ronda demo sin premios monetarios.
- Panel administrativo básico de solo lectura.

## Etapa 2 — Producto demo robusto
- Persistencia de sesión segura (cookies HttpOnly/Secure/SameSite).
- Recuperación de contraseña mediante SMS real.
- Verificación de edad e identidad en entorno de pruebas.
- Auditoría, límites de sesión, autoexclusión y controles responsables.
- Pruebas unitarias, integración y carga.
- Gestión de roles y permisos administrativos.

## Etapa 3 — Revisión jurídica y operativa
Para México, obtener asesoría jurídica especializada y confirmar permisos/autorizaciones aplicables ante SEGOB/Dirección General de Juegos y Sorteos antes de ofrecer juegos con apuestas.
Evaluar obligaciones de KYC/AML, protección de datos, impuestos, publicidad, juego responsable y requisitos estatales/federales que correspondan.

## Etapa 4 — Integraciones reguladas
Solo después de validación jurídica y contractual:
- Integrar proveedores de juegos autorizados/certificados.
- Integrar PSP/adquirente que permita expresamente el giro.
- Diseñar ledger financiero separado y conciliable.
- Separar por completo demo y real mediante entornos, credenciales, bases de datos y controles de despliegue independientes.
- Auditoría externa y pruebas de penetración.

## Regla de arquitectura
No reutilizar el saldo demo como dinero real. La futura billetera real debe ser un subsistema separado, con doble registro contable, idempotencia, conciliación y trazabilidad.

## Preparación del hub híbrido (apagado)
- Contrato versionado y módulos de adaptadores en `docs/game-integration-hub.md`.
- Ningún juego actual está conectado al hub; sus rutas, UI y resultados siguen siendo los de DEMO.
- La billetera demo conserva un total de 10,000 créditos iniciales; el bucket de bono mantiene separado ese importe confirmado.
- vFair Games y el repositorio `open-rgs/open-rgs` permanecen deshabilitados; no hay integración externa activa.
- Antes de activar proveedores o migrar un juego: aprobación independiente, especificación contractual, seguridad de callbacks y conciliación.
