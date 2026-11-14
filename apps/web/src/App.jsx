import React, { useEffect, useMemo, useState } from "react";
import {
  Home, Gamepad2, Wallet, Gift, UserRound, Crown, LogOut, ShieldCheck,
  Menu, Bell, Plus, ChevronRight, History, Settings, Headphones, Trophy,
  Star, CircleHelp, Sparkles, RotateCw, Spade, Coins, X
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const nav = [["Inicio",Home],["Juegos",Gamepad2],["Billetera",Wallet],["Bonos",Gift],["Mi cuenta",UserRound]];
const games = [
  {id:"slots_demo",name:"Tragamonedas",subtitle:"Símbolos originales",icon:"🎰",tag:"POPULAR"},
  {id:"roulette_demo",name:"Ruleta",subtitle:"Gira y descubre el resultado",icon:"🎡",tag:"CLÁSICO"},
  {id:"blackjack_demo",name:"Blackjack",subtitle:"Practica contra el dealer",icon:"🃏",tag:"ESTRATEGIA"}
];

export default function App() {
  const [page,setPage]=useState("Acceso"), [authMode,setAuthMode]=useState("login");
  const [phone,setPhone]=useState("+52"), [password,setPassword]=useState(""), [displayName,setDisplayName]=useState("JugadorFT7");
  const [accepted,setAccepted]=useState(false), [userId,setUserId]=useState(""), [otp,setOtp]=useState(""), [demoCode,setDemoCode]=useState("");
  const [token,setToken]=useState(""), [user,setUser]=useState(null), [balance,setBalance]=useState(10000);
  const [notice,setNotice]=useState("Estás en una experiencia de demostración. Los créditos no tienen valor monetario.");
  const [game,setGame]=useState("slots_demo"), [stake,setStake]=useState(100), [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null), [history,setHistory]=useState([]), [admin,setAdmin]=useState(null), [adminUsers,setAdminUsers]=useState([]);
  const [mobileMenu,setMobileMenu]=useState(false);

  async function request(path,body,auth=false,method) {
    const response=await fetch(`${API}${path}`,{method:method || (body?"POST":"GET"),headers:{"Content-Type":"application/json",...(auth?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"No se pudo completar la solicitud");
    return data;
  }
  async function loadAccount(t) {
    const r=await fetch(`${API}/api/me`,{headers:{Authorization:`Bearer ${t}`}});
    const me=await r.json(); if(!r.ok) throw new Error(me.error||"No se pudo cargar la cuenta");
    setBalance(Number(me.balance)); return me;
  }
  async function register(e){e.preventDefault();setBusy(true);try{
    const d=await request("/api/auth/register",{phone,password,displayName});
    setUserId(d.userId);setDemoCode(d.demoVerificationCode||"");setOtp("");setAuthMode("verify");setNotice("Cuenta creada. Completa la verificación de prueba.");
  }catch(e){setNotice(e.message)}finally{setBusy(false)}}
  async function verify(e){e.preventDefault();setBusy(true);try{
    const d=await request("/api/auth/verify-demo",{userId,code:otp});setToken(d.token);setUser(d.user);await loadAccount(d.token);setPage("Inicio");setNotice("¡Bienvenido a WINN FT 7!");
  }catch(e){setNotice(e.message)}finally{setBusy(false)}}
  async function login(e){e.preventDefault();setBusy(true);try{
    const d=await request("/api/auth/login",{phone,password});setToken(d.token);setUser(d.user);await loadAccount(d.token);setPage("Inicio");setNotice("Sesión iniciada correctamente.");
  }catch(e){setNotice(e.message)}finally{setBusy(false)}}
  async function play(){setBusy(true);setResult(null);try{
    const d=await request("/api/demo/round",{game,credits:stake},true);setBalance(Number(d.balance));setResult(d.outcome);setNotice("Ronda de práctica completada. No hay premios ni valor monetario.");
    const h=await request("/api/demo/history",null,true);setHistory(h.entries||[]);
  }catch(e){setNotice(e.message)}finally{setBusy(false)}}
  async function openPage(p){setPage(p);setMobileMenu(false);if(p==="Billetera"&&token){try{const d=await request("/api/demo/history",null,true);setHistory(d.entries||[])}catch(e){setNotice(e.message)}}
    if(p==="Administración"&&token&&user?.role==="admin"){try{const [a,u]=await Promise.all([request("/api/admin/overview",null,true),request("/api/admin/users",null,true)]);setAdmin(a);setAdminUsers(u.users||[])}catch(e){setNotice(e.message)}}
  }
  function logout(){setToken("");setUser(null);setResult(null);setPage("Acceso");setAuthMode("login");setPassword("");setNotice("Sesión cerrada.");}
  const money=useMemo(()=>balance.toLocaleString("es-MX"),[balance]);

  return <main className="app-shell">
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Menú">{mobileMenu?<X/>:<Menu/>}</button>
      <button className="brand" onClick={()=>openPage(token?"Inicio":"Acceso")}><span className="brand-crown"><Crown size={25}/></span><span className="brand-name">WINN <b>FT 7</b><small>YOUR GAME. YOUR WIN.</small></span></button>
      <div className="top-actions">{token&&<><span className="demo-pill"><i/> DEMO ACTIVA</span><div className="top-balance"><Coins size={16}/><b>{money}</b><small>CR</small></div><button className="icon-btn" onClick={()=>setNotice("No tienes notificaciones nuevas.")}><Bell size={18}/></button></>}</div>
    </header>

    {!token ? <section className="auth-layout">
      <div className="auth-art"><div className="art-orbit">♛</div><div className="auth-logo"><Crown/><h1>WINN <b>FT 7</b></h1><p>YOUR GAME. YOUR WIN.</p></div><div className="floating-chip chip-one">♠</div><div className="floating-chip chip-two">♦</div><div className="auth-tagline">EL UNIVERSO DEL ENTRETENIMIENTO<br/><strong>COMIENZA AQUÍ</strong></div></div>
      <section className="auth-card">
        <div className="mobile-brand"><Crown/><strong>WINN <b>FT 7</b></strong></div>
        {authMode==="verify"?<form onSubmit={verify}>
          <span className="eyebrow">SEGURIDAD DE CUENTA</span><h2>Verifica tu celular</h2><p className="muted">Introduce el código de seis dígitos para activar tu cuenta demo.</p>
          {demoCode&&<div className="dev-code">Código de prueba: <b>{demoCode}</b></div>}
          <label>Código de verificación<input value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="000000" required/></label>
          <button className="gold-btn" disabled={otp.length!==6||busy}>{busy?"VERIFICANDO...":"VERIFICAR CUENTA"}</button>
          <button type="button" className="text-btn" onClick={()=>setAuthMode("register")}>Volver al registro</button>
        </form>:authMode==="register"?<form onSubmit={register}>
          <span className="eyebrow">ÚNETE A LA EXPERIENCIA</span><h2>Crea tu cuenta</h2><p className="muted">Regístrate para explorar nuestros juegos de práctica.</p>
          <label>Nombre de usuario<input value={displayName} onChange={e=>setDisplayName(e.target.value)} minLength="2" maxLength="40" required/></label>
          <label>Celular mexicano<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+521234567890" pattern="\+52[0-9]{10}" required/></label>
          <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="10" maxLength="72" required placeholder="Mínimo 10 caracteres"/></label>
          <label className="check-row"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Acepto los términos de la experiencia demo.</label>
          <button className="gold-btn" disabled={!accepted||busy}>{busy?"CREANDO CUENTA...":"CREAR CUENTA"}</button>
          <button type="button" className="text-btn" onClick={()=>setAuthMode("login")}>¿Ya tienes cuenta? Inicia sesión</button>
        </form>:<form onSubmit={login}>
          <span className="eyebrow">BIENVENIDO DE NUEVO</span><h2>Inicia sesión</h2><p className="muted">Ingresa a tu espacio WINN FT 7.</p>
          <label>Celular<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+521234567890" required/></label>
          <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Tu contraseña"/></label>
          <button className="gold-btn" disabled={busy}>{busy?"INGRESANDO...":"INICIAR SESIÓN"}</button>
          <button type="button" className="text-btn" onClick={()=>setNotice("La recuperación por SMS se integrará en una siguiente etapa.")}>¿Olvidaste tu contraseña?</button>
          <div className="auth-divider"><span/> O <span/></div>
          <button type="button" className="outline-btn" onClick={()=>setAuthMode("register")}>＋ REGISTRARME</button>
        </form>}
        <p className="notice"><ShieldCheck size={15}/>{notice}</p>
        <p className="legal-note">ENTORNO DE PRUEBA · CRÉDITOS FICTICIOS SIN VALOR MONETARIO</p>
      </section>
    </section>:<>
      {mobileMenu&&<div className="mobile-menu">{nav.map(([n,I])=><button key={n} onClick={()=>openPage(n)}><I size={18}/>{n}</button>)}{user?.role==="admin"&&<button onClick={()=>openPage("Administración")}><ShieldCheck size={18}/>Administración</button>}</div>}
      <section className="welcome-banner">
        <div className="welcome-copy"><span className="eyebrow">BIENVENIDO, {user?.display_name||"JUGADOR"}</span><h1>Tu juego. Tu experiencia.</h1><p>Descubre el universo de entretenimiento WINN FT 7.</p><button className="gold-btn compact" onClick={()=>openPage("Juegos")}>EXPLORAR JUEGOS <ChevronRight size={16}/></button></div>
        <div className="welcome-wallet"><span>SALDO DISPONIBLE</span><strong>{money}</strong><small>CRÉDITOS DEMO</small><div className="wallet-glow"><Coins size={42}/></div></div>
        <div className="banner-crown"><Crown size={104}/></div>
      </section>

      <main className="main-content">
        {page==="Inicio"&&<>
          <div className="section-heading"><div><span className="eyebrow">DESCUBRE WINN FT 7</span><h2>Juegos destacados</h2></div><button className="link-btn" onClick={()=>openPage("Juegos")}>Ver todos <ChevronRight size={16}/></button></div>
          <div className="game-grid">{games.map((g,i)=><button className={`game-tile game-${i}`} key={g.id} onClick={()=>{setGame(g.id);setResult(null);openPage("Juegos")}}><span className="game-tag">{g.tag}</span><span className="game-emoji">{g.icon}</span><strong>{g.name}</strong><small>{g.subtitle}</small><span className="tile-arrow"><ChevronRight size={16}/></span></button>)}</div>
          <div className="promo-banner"><div className="promo-icon"><Gift size={42}/></div><div><span className="eyebrow">BONO DE BIENVENIDA DEMO</span><h2>¡Tu aventura comienza con 10,000 créditos!</h2><p>Créditos de práctica para conocer la plataforma. No canjeables.</p></div><button className="gold-btn compact" onClick={()=>openPage("Bonos")}>VER BONOS</button></div>
          <div className="trust-row"><div><ShieldCheck/><b>Entorno de prueba</b><small>Experiencia segura de demostración</small></div><div><Star/><b>Juegos originales</b><small>Diseñados para WINN FT 7</small></div><div><Headphones/><b>Centro de ayuda</b><small>Estamos para orientarte</small></div></div>
        </>}
        {page==="Juegos"&&<><div className="section-heading"><div><span className="eyebrow">ZONA DE ENTRETENIMIENTO</span><h2>Juegos de práctica</h2></div><span className="demo-pill">SOLO DEMO</span></div><div className="game-grid">{games.map((g,i)=><button className={`game-tile game-${i} ${game===g.id?"selected":""}`} key={g.id} onClick={()=>{setGame(g.id);setResult(null)}}><span className="game-tag">{g.tag}</span><span className="game-emoji">{g.icon}</span><strong>{g.name}</strong><small>{g.subtitle}</small></button>)}</div>
          <section className="play-panel"><div className="play-title"><div><span className="eyebrow">MESA DE PRÁCTICA</span><h2>{games.find(g=>g.id===game)?.name}</h2></div><span className="demo-pill">CRÉDITOS FICTICIOS</span></div>
            <div className={`game-stage stage-${game}`}><div className="stage-decoration">✦</div>{result?<><div className="result-label">RESULTADO DE LA RONDA</div><div className="result-visual">{result.visual}</div><h3>{result.title}</h3><p>{result.description}</p></>:<><div className="stage-symbol">{games.find(g=>g.id===game)?.icon}</div><h3>¿Listo para jugar?</h3><p>Esta simulación no entrega premios ni dinero.</p></>}</div>
            <div className="play-controls"><label>Créditos por ronda<select value={stake} onChange={e=>setStake(Number(e.target.value))}>{[50,100,250,500].map(n=><option key={n} value={n}>{n} créditos</option>)}</select></label><button className="gold-btn" onClick={play} disabled={busy||balance<stake}>{busy?<><RotateCw className="spin"/> PROCESANDO...</>:<>JUGAR RONDA DEMO <ChevronRight size={17}/></>}</button></div>
            <p className="fine-print"><ShieldCheck size={14}/> Cada ronda consume créditos ficticios. No existen premios, retiros ni conversión a dinero.</p>
          </section>
        </>}
        {page==="Billetera"&&<><div className="section-heading"><div><span className="eyebrow">TU CUENTA</span><h2>Billetera demo</h2></div></div><section className="wallet-card"><span>SALDO DE CRÉDITOS</span><strong>{money} <small>CR</small></strong><p>Créditos ficticios para utilizar dentro de la experiencia de prueba.</p><div className="wallet-actions"><button className="outline-btn" onClick={()=>setNotice("Los depósitos y retiros están deshabilitados en esta demo.")}>＋ Depositar <small>Deshabilitado</small></button><button className="outline-btn" onClick={()=>setNotice("Los retiros están deshabilitados en esta demo.")}>↗ Retirar <small>Deshabilitado</small></button></div></section><div className="section-heading subhead"><h2><History size={19}/> Historial de movimientos</h2></div><div className="history-list">{history.length?history.map((h,i)=><div className="history-row" key={h.id||i}><span className="history-icon"><Coins/></span><div><b>{h.reason==="signup_demo"?"Bono inicial":h.reason==="slots_demo"?"Tragamonedas demo":h.reason==="roulette_demo"?"Ruleta demo":h.reason==="blackjack_demo"?"Blackjack demo":h.reason}</b><small>{new Date(h.created_at).toLocaleString("es-MX")}</small></div><strong className={Number(h.delta)>0?"positive":"negative"}>{Number(h.delta)>0?"+":""}{Number(h.delta).toLocaleString("es-MX")} CR</strong></div>):<p className="empty-state">Aún no hay movimientos registrados.</p>}</div></>}
        {page==="Bonos"&&<><div className="section-heading"><div><span className="eyebrow">PROMOCIONES DE PRUEBA</span><h2>Bonos y beneficios</h2></div></div><div className="bonus-card"><div className="bonus-art">🎁</div><div><span className="eyebrow">BONO DE BIENVENIDA</span><h2>10,000 créditos demo</h2><p>Se acreditan al crear tu cuenta. No son canjeables ni tienen valor monetario.</p><span className="bonus-status">✓ ACREDITADO AL REGISTRO</span></div></div><p className="fine-print"><ShieldCheck size={14}/> Las promociones mostradas son ilustrativas y exclusivas del entorno de demostración.</p></>}
        {page==="Mi cuenta"&&<><div className="section-heading"><div><span className="eyebrow">PERFIL DE JUGADOR</span><h2>Mi cuenta</h2></div></div><div className="profile-card"><div className="avatar"><UserRound size={35}/></div><div><h2>{user?.display_name}</h2><span className="demo-pill">CUENTA DEMO</span></div></div><div className="settings-list"><div><UserRound/>Información de perfil<ChevronRight/></div><div><ShieldCheck/>Seguridad de cuenta<ChevronRight/></div><div><CircleHelp/>Centro de ayuda<ChevronRight/></div>{user?.role==="admin"&&<button onClick={()=>openPage("Administración")}><ShieldCheck/>Panel de administración<ChevronRight/></button>}<button onClick={logout}><LogOut/>Cerrar sesión<ChevronRight/></button></div></>}
        {page==="Administración"&&user?.role==="admin"&&<><div className="section-heading"><div><span className="eyebrow">CONTROL INTERNO</span><h2>Panel administrativo</h2></div><span className="demo-pill">ADMIN</span></div><div className="admin-stats">{[["Usuarios",admin?.users??"—"],["Verificados",admin?.verifiedUsers??"—"],["Créditos en circulación",Number(admin?.demoCreditsInCirculation||0).toLocaleString("es-MX")]].map(([k,v])=><div><small>{k}</small><strong>{v}</strong></div>)}</div><h3>Usuarios recientes</h3><div className="history-list">{adminUsers.map(u=><div className="history-row" key={u.id}><div><b>{u.display_name}</b><small>{u.phone_e164} · {u.status}</small></div><strong>{Number(u.balance).toLocaleString("es-MX")} CR</strong></div>)}</div></>}
        <p className="notice"><ShieldCheck size={15}/>{notice}</p>
      </main>
      <nav className="bottom-nav">{nav.map(([n,I])=><button key={n} className={page===n?"active":""} onClick={()=>openPage(n)}><I size={20}/><small>{n}</small></button>)}</nav>
    </>}
    <footer><span>♛ WINN FT 7</span> · YOUR GAME. YOUR WIN. · PROTOTIPO DEMO · CRÉDITOS FICTICIOS</footer>
  </main>;
}
