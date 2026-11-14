# WINN FT 7 — Hub de integración de juegos v1

## Estado y límites

La implementación de esta base es únicamente DEMO y está apagada para uso
desde la aplicación: `server.js` no monta `createGameHubRouter`. No cambia la
navegación ni redirige Slots, Ruleta o Blackjack al hub. Los adaptadores de
vFair Games y Open RGS están deshabilitados y no necesitan credenciales,
servicios ni dependencias externas.

Solo el proceso de la API de WINN puede acceder a PostgreSQL. Los adaptadores
reciben contratos y servicios, no un `Pool`, una conexión, credenciales SQL ni
filas de billetera. El adaptador interno es una fixture de lanzamiento sin
URL de juego; no expone los juegos existentes.

## Estado actual de los juegos y fondos

- `POST /api/demo/round` sigue ejecutando la ronda actual y generando el mismo
  resultado visual. Cada ronda solo consume créditos ficticios; no paga
  premios.
- `demo_wallets.balance` sigue siendo el total compatible con la API y la UI.
  `cash_balance` y `bonus_balance` suman ese total.
- La interpretación confirmada para esta demo es 10,000 créditos iniciales en
  total, asignados al bucket de bono: saldo base 0 + bono 10,000. Los balances
  existentes se distribuyen al bucket de bono conservando su total.
- Las apuestas consumen primero bono y luego saldo base. En la base demo, los
  importes de ganancias se acreditan al bono. Los reembolsos restauran los
  buckets exactos usados por la apuesta.
- El movimiento existente `signup_demo`, la bitácora, el saldo total visible y
  el comportamiento de las rondas se conservan.

## Contrato WINN v1

El contrato de servidor está en `apps/api/src/game-hub/contract.js`. Montar las
rutas es un cambio posterior, no parte de esta preparación. La ruta propuesta
es `/api/game-hub/v1`.

Todos los importes son enteros positivos de hasta 500 `DEMO_CREDIT` por
operación. No se aceptan decimales, códigos de divisa real ni modo de entorno
en el cuerpo del proveedor. El servidor fuerza `environment: "DEMO"`.

### Operaciones

| Operación | Entrada principal | Resultado |
|---|---|---|
| `launchSession` | `playerId` de la autenticación WINN, `providerId`, `gameId`, `locale` | ID de sesión, token firmado DEMO de 10 minutos, vencimiento y URL de lanzamiento si el adaptador está disponible. |
| `getBalance` | token de sesión | saldo base, bono, total y unidad, leídos de la billetera WINN. |
| `placeBet` | sesión, `roundId`, `amount`, `idempotencyKey`, referencia externa opcional | transacción de débito y desglose de los buckets consumidos. |
| `settleWin` | sesión, `betTransactionId`, `amount`, `idempotencyKey` | una liquidación ligada a una apuesta; se acredita al bucket DEMO de bono. |
| `refundBet` | sesión, `betTransactionId`, `idempotencyKey` | reembolso de la apuesta original en los mismos buckets que debitó. No permite reembolsar una apuesta liquidada. |
| `getTransaction` | sesión y `transactionId` WINN | estado y recibo de una transacción propia. |
| `closeSession` | token de sesión | cierra la sesión y bloquea operaciones posteriores. |

### Idempotencia y estado

La clave se guarda con unicidad por proveedor, operación y clave. El hash de la
solicitud impide reutilizarla con un importe o referencia diferente. La clave,
el movimiento de billetera, el asiento de `demo_ledger` y el recibo se confirman
en la misma transacción PostgreSQL. Las filas de sesión se bloquean durante
las operaciones de saldo; la billetera conserva su bloqueo de fila.

Una apuesta solo admite una liquidación y un reembolso. Estados persistidos:
`committed`, `settled`, `refunded` y `reconciliation_required`. Si no puede
confirmarse el resultado de una llamada externa, la operación debe quedar
pendiente de conciliación; nunca se reintenta un movimiento de saldo
desconocido a ciegas.

## Firmas, tokens y callbacks

- Los tokens de sesión son JWT distintos del token de autenticación del
  jugador. Incluyen emisor y audiencia del hub, ID de jugador, proveedor,
  juego, sesión, entorno DEMO, ID único y expiración corta. La clave de firma
  se deriva con separación de dominio de la clave de servidor existente.
- Para callbacks, `signatures.js` define la cadena canónica:
  timestamp, nonce, método, ruta y SHA-256 del cuerpo sin modificar.
  Verifica HMAC-SHA256 con comparación de tiempo constante y tolerancia de
  reloj de cinco minutos.
- Los nonces se registran en `demo_game_hub.callback_nonces`; un nonce
  repetido se rechaza. El cuerpo debe leerse como bytes originales al montar
  los callbacks; no se debe firmar JSON reserializado.
- La tabla guarda hashes de solicitud y referencias de idempotencia, no el
  secreto del proveedor ni el token de sesión sin proteger.
- Los endpoints de callback aún no se montan. Cada proveedor requerirá su
  propio formato de firma, validación de origen, política de rotación de
  claves y conector con configuración segura antes de habilitarse.

## Adaptadores

- **`internal-demo`**: fixture de servidor; prepara una sesión pero no lanza
  ni modifica Slots, Ruleta o Blackjack.
- **`vfair-games`**: adaptador presente y apagado. El repositorio público
  confirma una integración de billetera del operador y comunicación de juegos
  en tiempo real, pero no se infieren rutas ni cuerpos de callback que no
  estén en una especificación de partner confirmada. Solicitar esa
  especificación antes de implementar el transporte. Su repositorio es un
  monorepo independiente con NestJS/Nx y servicios auxiliares; no se instala
  ni se ejecuta dentro de esta aplicación.
- **`open-rgs`**: adaptador presente y apagado para el repositorio
  `open-rgs/open-rgs`. Su `PlatformAdapter` usa `openSession`,
  `settleSimple`, `openComplex`, `updateComplex` y `closeComplex`. La
  operación `settleSimple` no se equipara a `placeBet` + `settleWin`, porque
  perdería su garantía atómica; esa capacidad se rechaza hasta acordar un
  contrato compatible. Open RGS requiere su propio runtime Bun y no se
  instala ni se inicia en este proyecto.
- **Comerciales futuros**: un adaptador nuevo por proveedor, sin compartir
  credenciales, protocolo específico ni acceso a base de datos.

## Persistencia DEMO

La migración aditiva `db/migrations/20261114_game_hub_demo.sql` crea el
esquema separado `demo_game_hub` con sesiones, transacciones y nonces. Las
sesiones tienen `environment='DEMO'`; las tablas no representan ni aceptan
dinero real. La aplicación no ejecuta DDL al arrancar.

La separación por esquema no sustituye la separación futura de operación:
antes de cualquier producto real se requerirían otra base, credenciales,
secretos, despliegue, billetera y revisión legal/operativa independientes.
No existen rutas, credenciales, depósitos, retiros ni apuestas reales en esta
base.

## Verificación

`npm --prefix apps/api test` verifica contratos, límites de adaptador, firma y
replay de callbacks, idempotencia concurrente, liquidación, reembolso,
conciliación, aislamiento por sesión y buckets. Los registros de prueba son
temporales y se eliminan al terminar la prueba.

En la vista previa de Replit, las solicitudes API también generan el aviso de
`express-rate-limit` porque llega `X-Forwarded-For` mientras Express mantiene
la configuración predeterminada de proxy desactivada. Antes de habilitar
callbacks externos se debe configurar y verificar la cadena de proxies
confiables; no confiar en todos los encabezados reenviados.

## Referencias de protocolo revisadas

- [vFair Games: repositorio y guía pública de integración](https://github.com/vfairgames/vfair-games)
- [Open RGS: repositorio](https://github.com/open-rgs/open-rgs)
- [Open RGS: contratos públicos](https://github.com/open-rgs/open-rgs/blob/main/specs/01-public-contracts.md)

Estas referencias no equivalen a credenciales ni a una autorización para
conectar o activar un proveedor.
