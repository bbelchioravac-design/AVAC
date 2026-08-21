// ═══════════════════════════════════════════════════
// ALIOS ONE — Motor Rph (Aplicação LNEC Ventilação REH)
// rph_vent.js — réplica da folha de A. Pinto (LNEC, 2021),
// citada no Cap. 9 do Manual SCE (DL 101-D/2020).
// Modelo: balanço de pressões (vento + efeito chaminé)
// resolvido por bissecção na pressão interior
// (= o GoalSeek da macro "correr" da folha).
// Dados geográficos em rph_dados.js (RPH_REGIOES/MUNICIPIOS).
// ═══════════════════════════════════════════════════

// Cp por (zona da fachada | protecção):
// [barlavento, sotavento, cobertura <10°, 10-30°, >30°]
const RPH_CP = {
  'Inferior|Desprotegido': [0.5, -0.7, -0.7, -0.6, -0.2],
  'Inferior|Normal':       [0.25, -0.5, -0.6, -0.5, -0.2],
  'Inferior|Protegido':    [0.05, -0.3, -0.5, -0.4, -0.2],
  'Média|Desprotegido':    [0.65, -0.7, -0.7, -0.6, -0.2],
  'Média|Normal':          [0.45, -0.5, -0.6, -0.5, -0.2],
  'Média|Protegido':       [0.25, -0.3, -0.5, -0.4, -0.2],
  'Superior|Desprotegido': [0.8, -0.7, -0.7, -0.6, -0.2],
};

// factor de permeabilidade das janelas por classe (ref: /100^0.67)
// flagM=0 no cálculo do requisito (novos): ignora sem classif., cl.1 e cl.2
function rphFactorJanela(classe, flagM) {
  if (classe === 'sem') return 100 * flagM;
  if (classe === 1) return 50 * flagM;
  if (classe === 2) return 27 * flagM;
  if (classe === 3) return 9;
  if (classe === 4) return 3;
  return 0;
}

// C das condutas de ventilação natural (m³/h a 1 Pa) por perda de carga e altura
function rphCConduta(perda, H) {
  const h = Math.abs(H);
  if (perda === 'baixa') return 113 / Math.pow(2.03 + 0.14 * h, 0.5);
  if (perda === 'media') return 44.2 / Math.pow(1.93 + 0.14 * h, 0.5);
  return 28.3 / Math.pow(3.46 + 0.21 * h, 0.5); // alta
}

// grelha auto-regulável: caudal normalizado vs ΔP (setpoint 2/10/20 Pa)
function rphAutoReg(dp, sp) {
  const a = Math.abs(dp);
  if (a < sp) return Math.pow(a, 0.5) / Math.pow(sp, 0.5);
  return 1 + (a - sp) * 0.5 / (100 - sp);
}

// ─── preparação do cenário ───
function rphPreparar(inp) {
  const nuts = RPH_MUNICIPIOS[inp.municipio];
  const g = RPH_REGIOES[nuts];
  const text = Math.round((g.text + g.grad * (inp.altitude - g.zref) / 1000) * 10) / 10;
  const RHO_REF = 1.22, T_REF = 283.15, T_INT = 18;
  const rhoInt = RHO_REF * T_REF / (273.15 + T_INT);
  const rhoExt = RHO_REF * T_REF / (273.15 + text);

  // vento (perfil de potência da rugosidade, mínimo REH 3,6 m/s)
  const Zu = inp.rugosidade === 'III' ? 400 : (inp.rugosidade === 'II' ? 480 : 550);
  const ex = inp.rugosidade === 'III' ? 0.2 : (inp.rugosidade === 'II' ? 0.3 : 0.4);
  let vento;
  if (inp.ventoOpcao === 'user') {
    const vuUser = inp.u10user / Math.pow(10 / Zu, ex);
    vento = Math.max(vuUser * Math.pow(inp.hedif / Zu, ex), inp.u10user);
  } else {
    const vu = inp.regiao === 'A' ? 11.5 : 12.6;
    vento = Math.max(vu * Math.pow(inp.hedif / Zu, ex), 3.6);
  }

  // zona da fachada (altura da fracção) e protecção ao vento
  const zona = inp.hfa <= 15 ? 'Inferior' : (inp.hfa > 50 ? 'Superior' : 'Média');
  let protecao = 'Desprotegido';
  if (inp.obstaculos && zona !== 'Superior') {
    const k5 = 0.5 * Math.min(inp.hedif, 15);
    const k6 = 0.5 * Math.min(inp.hedif - 15, 35) + 15;
    const protegidoHobs = zona === 'Inferior' ? inp.hobs >= k5 : inp.hobs >= k6;
    if (protegidoHobs) {
      const ratio = inp.dobs / inp.hobs;
      protecao = ratio < 1.5 ? 'Protegido' : (ratio > 4 ? 'Desprotegido' : 'Normal');
    }
  }
  const cp = RPH_CP[zona + '|' + protecao] || RPH_CP['Superior|Desprotegido'];

  return { text, rhoInt, rhoExt, vento, zona, protecao, cp, vol: inp.au * inp.pd, nfac: inp.nfach === 2 ? 2 : 1 };
}

// ─── coeficientes de fuga (por meia-fachada) ───
function rphCoefs(inp, prep, flagM) {
  const nfac = prep.nfac;
  const usaN50 = inp.n50medido ? 1 : 0;
  let cjan = 0, cxb = 0, cxa = 0;
  for (const v of (inp.vaos || [])) {
    if (!v || !v.area) continue;
    cjan += v.area * rphFactorJanela(v.classe, flagM);
    if (v.cxestore === 'baixa') cxb += v.area * 0.7;
    if (v.cxestore === 'alta') cxa += v.area * 0.7 * 10;
  }
  cjan = cjan * (usaN50 ? 0 : 1) / Math.pow(100, 0.67);
  cxb = cxb * (usaN50 ? 0 : 1) * flagM;
  cxa = cxa * (usaN50 ? 0 : 1) * flagM;
  const cn50 = usaN50 ? inp.n50 * prep.vol / Math.pow(50, 0.67) : 0;
  const ok = inp.temAberturas;
  return {
    cJanCxb: (cjan + cxb) / nfac / 2,   // expoente 0.67
    cn50: cn50 / nfac / 2,               // expoente 0.67
    cCxAlta: cxa / nfac / 2,             // expoente 0.5
    cFixa: (ok ? inp.abFixa || 0 : 0) / nfac * 0.28350238094238295 / 2, // cm²→m³/h·Pa^-0.5
    a2: (ok ? inp.ab2Pa || 0 : 0) / nfac / 2,
    a10: (ok ? inp.ab10Pa || 0 : 0) / nfac / 2,
    a20: (ok ? inp.ab20Pa || 0 : 0) / nfac / 2,
  };
}

// caudal de uma meia-fachada a dado ΔP
function rphQFachada(dp, c) {
  const a = Math.abs(dp), s = dp > 0 ? 1 : -1;
  let q = (c.cn50 + c.cJanCxb) * Math.pow(a, 0.67);
  q += (c.cCxAlta + c.cFixa) * Math.pow(a, 0.5);
  q += rphAutoReg(dp, 2) * c.a2 + rphAutoReg(dp, 10) * c.a10 + rphAutoReg(dp, 20) * c.a20;
  return q * s;
}

// ─── balanço de massa a dada pressão interior ───
function rphBalanco(pint, inp, prep, c, mecOn) {
  const g = 9.81, meiaRhoU2 = 0.5 * prep.rhoExt * prep.vento * prep.vento;
  const dRho = prep.rhoExt - prep.rhoInt;
  const zAlto = 0.75 * inp.pd * inp.npisos, zBaixo = 0.25 * inp.pd * inp.npisos;

  const condutas = (inp.condutas || []).filter(cd => cd && cd.ativa).map(cd => {
    const H = cd.escoamento === 'ex' ? (inp.hedif - inp.hfa + 3) : -Math.max(inp.hfa - inp.pd * inp.npisos - 3, 0);
    const z = H > 0 ? inp.pd * inp.npisos + H : H;
    return { ...cd, H, z };
  });
  const zmax = Math.max(zAlto, zBaixo, ...condutas.map(cd => cd.z), 0);
  const pst = z => -(z - zmax) * dRho * g;

  let sum = 0, admitido = 0;
  const add = q => { sum += q; if (q > 0) admitido += q; };

  // fachadas: barlavento sempre; sotavento só com 2 fachadas
  const lados = prep.nfac === 2 ? [prep.cp[0], prep.cp[1]] : [prep.cp[0]];
  for (const cpL of lados) {
    const pw = cpL * meiaRhoU2;
    add(rphQFachada(pw - pint + pst(zAlto), c));
    add(rphQFachada(pw - pint + pst(zBaixo), c));
  }

  // condutas
  for (const cd of condutas) {
    const cpC = cd.H < 0 ? (prep.cp[0] + prep.cp[1]) / 2
      : (cd.cobertura === 'terraco' ? prep.cp[2] : (cd.cobertura === '10a30' ? prep.cp[3] : prep.cp[4]));
    const dp = cpC * meiaRhoU2 - pint + pst(cd.z);
    const C = rphCConduta(cd.perda, cd.H) * (cd.n || 1);
    add(C * Math.pow(Math.abs(dp), 0.5) * (dp > 0 ? 1 : -1));
  }

  // mecânico / híbrido (caudais impostos; híbrido só conta sem mecânico)
  if (mecOn) {
    let ext = 0, ins = 0;
    if (inp.mec && inp.mec.existe) for (const r of inp.mec.ramos || []) {
      if (r.escoamento === 'ex') ext += r.caudal || 0; else ins += r.caudal || 0;
    } else if (inp.hib && inp.hib.existe) for (const r of inp.hib.ramos || []) {
      if (r.escoamento === 'ex') ext += r.caudal || 0; else ins += r.caudal || 0;
    }
    add(-ext); add(ins);
  }
  return { sum, admitido };
}

// ─── solve: bissecção na pressão interior (o GoalSeek) ───
function rphSolve(inp, prep, flagM, mecOn) {
  const c = rphCoefs(inp, prep, flagM);
  let lo = -500, hi = 500;
  const f = p => rphBalanco(p, inp, prep, c, mecOn).sum;
  let flo = f(lo);
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if ((flo > 0) === (fm > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  const pint = (lo + hi) / 2;
  const bal = rphBalanco(pint, inp, prep, c, mecOn);
  return { pint, admitido: bal.admitido, rph: Math.round(bal.admitido / prep.vol * 100) / 100 };
}

// ─── cálculo completo (replica a macro "correr") ───
function rphCalcular(inp) {
  const prep = rphPreparar(inp);
  const reqSolve = rphSolve(inp, prep, 0, true);   // requisito: sem estores/janelas fracas
  const nomSolve = rphSolve(inp, prep, 1, true);   // nominal
  const rphReq = Math.min(reqSolve.rph, 2);
  const rphNom = nomSolve.rph;
  const rphI = Math.min(Math.max(rphNom, 0.5), 2);
  const rphV = Math.max(rphI, 0.6);

  // energia dos ventiladores + recuperação de calor
  let wvm = 0, insufTotal = 0, recFluxo = 0, extTotal = 0;
  const ramos = [];
  if (inp.mec && inp.mec.existe) ramos.push(...(inp.mec.ramos || []).map(r => ({ ...r, hib: false })));
  else if (inp.hib && inp.hib.existe) ramos.push(...(inp.hib.ramos || []).map(r => ({ ...r, hib: true })));
  for (const r of ramos) {
    const q = r.caudal || 0;
    if (!q) continue;
    if (r.conhecePressao) wvm += q / 3600 * (r.pressao || 0) / ((r.rend || 100) / 100) * 8760 / 1000;
    else wvm += (r.hib ? 0.03 : 0.3) * q * 8760 / 1000;
    if (r.escoamento === 'ad') {
      insufTotal += q;
      if (r.rec) recFluxo += Math.round((r.recRend || 0) * 10) / 10 / 100 * q;
    } else extTotal += q;
  }
  const recFrac = insufTotal > 0 ? recFluxo / insufTotal : 0;
  const bveI = Math.round((1 - recFrac * insufTotal / (prep.vol * rphI)) * 1000) / 1000;
  const bveV = inp.bypassVerao ? 1 : bveI;

  return {
    prep, rphReq, rphNom, rphI, rphV, bveI, bveV,
    wvm: Math.round(wvm * 10) / 10,
    requisito: 0.5,
    criterio: rphReq >= 0.5 ? 'Satisfatório' : 'Não regulamentar Rph min',
    caudalNominal: Math.round(rphNom * prep.vol),
    mecLigada: extTotal + insufTotal > 0,
    insufTotal, extTotal,
    infiltracoes: Math.round(Math.max(rphNom * prep.vol - insufTotal, 0)),
  };
}

if (typeof module !== 'undefined') module.exports = { rphCalcular, rphPreparar };
