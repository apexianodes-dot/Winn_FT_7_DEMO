# WINN FT 7 — Demo Starter v0.3

Starter de desarrollo para una plataforma de entretenimiento tipo casino en modo DEMO.
**No procesa dinero real, depósitos, retiros ni apuestas monetarias.** Los créditos son ficticios y no convertibles.

## Actualización v0.3
- Lobby renovado con identidad visual morado, violeta y oro.
- Navegación móvil inferior y secciones de Inicio, Juegos, Billetera, Bonos y Mi cuenta.
- Juegos de práctica con resultados visuales originales: tragamonedas, ruleta y blackjack simulado.
- Historial de movimientos demo y vista administrativa para cuentas con rol `admin`.
- Validación corregida del teléfono mexicano y del código OTP en el frontend.

## Arquitectura
- `apps/web`: React + Vite, interfaz responsive y PWA básica.
- `apps/api`: Node.js + Express, autenticación demo y API de créditos.
- `db/schema.sql`: esquema PostgreSQL con libro de movimientos.
- `docs/roadmap.md`: fases de desarrollo y controles para una eventual operación autorizada.

## Requisitos
- Node.js 20+
- PostgreSQL 15+
- npm

## Inicio rápido
1. Crea una base de datos PostgreSQL llamada `winnft7`.
2. Ejecuta `db/schema.sql`.
3. Copia `apps/api/.env.example` a `apps/api/.env` y configura `DATABASE_URL` y `JWT_SECRET`.
4. En una terminal:
   ```bash
   cd apps/api
   npm install
   npm run dev
   ```
5. En otra terminal:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
6. Abre la URL que indique Vite (normalmente `http://localhost:5173`).

## Cuenta demo
La API permite registrar una cuenta con teléfono mexicano y contraseña. La verificación SMS está simulada:
- El endpoint de registro devuelve `demoVerificationCode: "123456"` solo en `NODE_ENV=development`.
- En producción, no se debe devolver un OTP en la respuesta; se debe integrar un proveedor SMS y almacenar el código como hash con expiración y límites de intentos.

## Seguridad antes de desplegar
- Cambia `JWT_SECRET` por un secreto aleatorio fuerte.
- Configura HTTPS, CORS restringido, rate limiting, backups y monitoreo.
- Usa un proveedor de SMS; no envíes OTP por logs.
- Añade pruebas automatizadas, revisión de seguridad y política de privacidad.
- No habilites dinero real ni integraciones de pago con este starter. Los resultados de los juegos son simulaciones de entretenimiento y no entregan premios.


## Habilitar un administrador local de pruebas
Después de registrar y verificar tu cuenta demo, localiza tu teléfono en PostgreSQL y asigna el rol manualmente:

```sql
UPDATE users SET role = 'admin' WHERE phone_e164 = '+52XXXXXXXXXX';
```

Cierra sesión e inicia sesión nuevamente para obtener un token con el nuevo rol.
**No uses este procedimiento como mecanismo de producción.** En producción, los roles deben asignarse mediante un flujo administrativo auditado, con MFA y mínimo privilegio.
