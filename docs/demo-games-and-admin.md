# WINN FT 7 — Sprint demo v0.3

## Entregado
- Lobby responsive con identidad corporativa WINN FT 7: negro/morado, violeta y oro.
- Navegación móvil inferior y páginas de Inicio, Juegos, Billetera, Bonos y Mi cuenta.
- Tragamonedas visual con símbolos originales, ruleta de práctica y mano de blackjack simulada.
- Resultados servidos por la API y sin premios, multiplicadores ni conversión a dinero.
- Historial de los últimos 50 movimientos de créditos demo.
- Vista administrativa de solo lectura para cuentas con rol `admin`.
- Se conserva el registro transaccional de créditos y el bloqueo de saldo negativo.

## Endpoints añadidos
- `GET /api/demo/history` — historial propio autenticado.
- `POST /api/demo/round` — descuenta créditos demo y devuelve el resultado visual de práctica.

## Pendiente para el siguiente sprint
- Pruebas automatizadas API/frontend y paginación administrativa.
- Sesiones seguras mediante cookies HttpOnly/Secure/SameSite y cierre de sesión del lado servidor.
- Recuperación de contraseña con proveedor SMS real, hash OTP, expiración y límites de intentos.
- Auditoría administrativa, MFA y controles de juego responsable en el entorno de prueba.
- Revisión jurídica y operativa antes de cualquier oferta pública.

## Restricciones
Esta versión es exclusivamente demostrativa. No ofrece depósitos, retiros, apuestas con dinero real, premios, canje ni conversión de créditos.
