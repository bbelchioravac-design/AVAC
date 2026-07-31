// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Comportamento Térmico
// termica.js — Soluções construtivas da envolvente opaca
//
// Lógica: construtor de soluções por camadas (ext → int),
// cálculo de U (EN ISO 6946), espessura e massa superficial
// (do isolamento para dentro), verificação de Umáx segundo a
// Portaria n.º 138-I/2021 (Tabelas 1 e 4, Continente) e
// geração automática do texto descritivo da solução.
//
// Convenções (validadas com a folha da casa):
//  - Rsi: parede 0,13 | cobertura 0,10 | pavimento 0,17
//  - Rse: 0,04 (exterior); elementos interiores: Rsi dos
//    dois lados; contacto com o solo: sem Rse
//  - Elementos em contacto com o solo: sem requisito Umáx
//  - PTP exterior: Umáx = 0,90 W/(m².°C)
//  - Massa superficial: só camadas do isolamento para o
//    interior (sem isolamento: todas)
//  - Alvenarias: peso em kg/m² (directo); restantes
//    materiais: kg/m³ × espessura
// ═══════════════════════════════════════════════════

// ─── Base de dados de materiais ───
// lambda: W/(m.ºC) | R: (m².ºC)/W fixo | peso: kg/m³ (ou kg/m² se pesoM2)
// espDef: espessura por defeito em m | nomeTexto: nome usado no texto descritivo
const TM_MATERIAIS = [
  { cat: 'Isolamentos', mats: [
    { id: 'celbar',            nome: 'celbar',                          lambda: 0.031, peso: 60 },
    { id: 'cortica',           nome: 'cortiça',                         lambda: 0.042, peso: 110 },
    { id: 'la_rocha',          nome: 'lã de rocha',                     lambda: 0.042, peso: 40 },
    { id: 'la_mineral',        nome: 'lã mineral',                      lambda: 0.040, peso: 57.5 },
    { id: 'eps',               nome: 'poliestireno expandido (EPS)',    lambda: 0.040, peso: 15 },
    { id: 'xps',               nome: 'poliestireno extrudido (XPS)',    lambda: 0.037, peso: 25 },
    { id: 'pur_placas',        nome: 'poliuretano em placas',           lambda: 0.040, peso: 20 },
    { id: 'pur_proj',          nome: 'poliuretano projetado',           lambda: 0.042, peso: 20 },
  ]},
  { cat: 'Alvenarias', mats: [
    { id: 'bb10',  nome: 'blocos de betão 10', nomeTexto: 'blocos de betão', R: 0.16, peso: 199.6, pesoM2: true, espDef: 0.10 },
    { id: 'bb15',  nome: 'blocos de betão 15', nomeTexto: 'blocos de betão', R: 0.20, peso: 196.4, pesoM2: true, espDef: 0.15 },
    { id: 'bb20',  nome: 'blocos de betão 20', nomeTexto: 'blocos de betão', R: 0.30, peso: 198.1, pesoM2: true, espDef: 0.20 },
    { id: 'bb25',  nome: 'blocos de betão 25', nomeTexto: 'blocos de betão', R: 0.33, peso: 198.7, pesoM2: true, espDef: 0.25 },
    { id: 'bb28',  nome: 'blocos de betão 28', nomeTexto: 'blocos de betão', R: 0.37, peso: 244.3, pesoM2: true, espDef: 0.28 },
    { id: 'tc4',   nome: 'tijolo cerâmico furado 4',  nomeTexto: 'tijolo cerâmico', R: 0.10, peso: 78.13,  pesoM2: true, espDef: 0.04 },
    { id: 'tc7',   nome: 'tijolo cerâmico furado 7',  nomeTexto: 'tijolo cerâmico', R: 0.19, peso: 102.71, pesoM2: true, espDef: 0.07 },
    { id: 'tc9',   nome: 'tijolo cerâmico furado 9',  nomeTexto: 'tijolo cerâmico', R: 0.23, peso: 119.10, pesoM2: true, espDef: 0.09 },
    { id: 'tc11',  nome: 'tijolo cerâmico furado 11', nomeTexto: 'tijolo cerâmico', R: 0.27, peso: 135.49, pesoM2: true, espDef: 0.11 },
    { id: 'tc15',  nome: 'tijolo cerâmico furado 15', nomeTexto: 'tijolo cerâmico', R: 0.39, peso: 166.07, pesoM2: true, espDef: 0.15 },
    { id: 'tc22',  nome: 'tijolo cerâmico furado 22', nomeTexto: 'tijolo cerâmico', R: 0.52, peso: 214.84, pesoM2: true, espDef: 0.22 },
    { id: 'tt14',  nome: 'tijolo térmico 14', nomeTexto: 'tijolo térmico', R: 0.79, peso: 130.9,  pesoM2: true, espDef: 0.14 },
    { id: 'tt19',  nome: 'tijolo térmico 19', nomeTexto: 'tijolo térmico', R: 0.90, peso: 172.33, pesoM2: true, espDef: 0.19 },
    { id: 'tt24',  nome: 'tijolo térmico 24', nomeTexto: 'tijolo térmico', R: 1.07, peso: 206.4,  pesoM2: true, espDef: 0.24 },
    { id: 'tt29',  nome: 'tijolo térmico 29', nomeTexto: 'tijolo térmico', R: 1.40, peso: 249.4,  pesoM2: true, espDef: 0.29 },
    { id: 'tta15', nome: 'tijolo térmico de argila expandida 15', nomeTexto: 'tijolo térmico de argila expandida', R: 0.8333, peso: 84,  pesoM2: true, espDef: 0.15 },
    { id: 'tta20', nome: 'tijolo térmico de argila expandida 20', nomeTexto: 'tijolo térmico de argila expandida', R: 0.8696, peso: 140, pesoM2: true, espDef: 0.20 },
    { id: 'tta25', nome: 'tijolo térmico de argila expandida 25', nomeTexto: 'tijolo térmico de argila expandida', R: 0.9346, peso: 145, pesoM2: true, espDef: 0.25 },
    { id: 'tta30', nome: 'tijolo térmico de argila expandida 30', nomeTexto: 'tijolo térmico de argila expandida', R: 0.9901, peso: 160, pesoM2: true, espDef: 0.30 },
  ]},
  { cat: 'Estrutura', mats: [
    { id: 'aco',        nome: 'aço',                        lambda: 50,   peso: 7800 },
    { id: 'aluminio',   nome: 'alumínio',                   lambda: 230,  peso: 2700 },
    { id: 'betao_arm',  nome: 'betão armado',               lambda: 2.0,  peso: 2300 },
    { id: 'betao_cel',  nome: 'betão celular',              lambda: 0.2,  peso: 750 },
    { id: 'betao_leve', nome: 'betão leve',                 lambda: 1.89, peso: null },
    { id: 'leca_uno',   nome: 'betão leve Leca Uno',        lambda: 0.32, peso: 1000 },
    { id: 'betonilha',  nome: 'betonilha de regularização', lambda: 1.8,  peso: 2300 },
  ]},
  { cat: 'Revestimentos', mats: [
    { id: 'etic',       nome: 'acabamento Etic',              lambda: 0.30, peso: 1250 },
    { id: 'ceramico',   nome: 'cerâmico',                     lambda: 1.30, peso: 2300 },
    { id: 'zinco',      nome: 'chapa de zinco',               lambda: 110,  peso: 7200 },
    { id: 'est_proj',   nome: 'estuque projetado',            lambda: 0.43, peso: 1200 },
    { id: 'est_trad',   nome: 'estuque tradicional',          lambda: 0.57, peso: 1000 },
    { id: 'pav_flut',   nome: 'pavimento flutuante',          lambda: null, peso: null },
    { id: 'gesso_cart', nome: 'placas de gesso cartonado',    lambda: 0.25, peso: 750 },
    { id: 'reb_term',   nome: 'reboco térmico projetado',     lambda: 0.045, peso: 360, nota: 'Diathonite Evolution' },
    { id: 'reb_trad',   nome: 'reboco tradicional',           lambda: 1.30, peso: 1800 },
    { id: 'membranas',  nome: 'membranas impermeabilizantes', lambda: 0.23, peso: 1000 },
    { id: 'seixo',      nome: 'seixo rolado',                 lambda: 2.0,  peso: 1700 },
    { id: 'rev_pedra',  nome: 'revestimento em pedra',        lambda: 3.5,  peso: 2400 },
  ]},
  { cat: 'Madeiras', mats: [
    { id: 'mdf',   nome: 'painéis MDF',   lambda: 0.07, peso: 250 },
    { id: 'osb',   nome: 'painéis OSB',   lambda: 0.13, peso: 650 },
    { id: 'viroc', nome: 'painéis Viroc', lambda: 0.22, peso: 1350 },
    { id: 'pinho', nome: 'pinho nórdico', lambda: 0.15, peso: 435 },
  ]},
  { cat: 'Pedra natural', mats: [
    { id: 'basalto',    nome: 'basalto',                    lambda: 1.1,   peso: 2700 },
    { id: 'cantaria',   nome: 'cantaria e alvenaria aparelhada', lambda: null, peso: null },
    { id: 'gneisse',    nome: 'gneisse',                    lambda: 3.5,   peso: 2400 },
    { id: 'granito',    nome: 'granito',                    lambda: 2.8,   peso: 2500 },
    { id: 'gres_calc',  nome: 'grés calcário',              lambda: 1.9,   peso: 2000 },
    { id: 'gres_quart', nome: 'grés quartzoso',             lambda: 2.6,   peso: 2600 },
    { id: 'gres_sil',   nome: 'grés silicioso',             lambda: 2.3,   peso: 2200 },
    { id: 'marmore',    nome: 'mármore',                    lambda: 3.5,   peso: 2600 },
    { id: 'calc_dura',  nome: 'pedra calcária dura',        lambda: 1.7,   peso: 2200 },
    { id: 'calc_densa', nome: 'pedra calcária densa',       lambda: 1.4,   peso: 1800 },
    { id: 'calc_macia', nome: 'pedra calcária macia',       lambda: 1.1,   peso: 1600 },
    { id: 'calc_mdura', nome: 'pedra calcária muito dura',  lambda: 2.3,   peso: 2600 },
    { id: 'calc_mmacia',nome: 'pedra calcária muito macia', lambda: 0.85,  peso: 1590 },
    { id: 'lioz',       nome: 'pedra de lióz',              lambda: 2.3,   peso: 2395 },
    { id: 'pomes',      nome: 'pedra-pomes',                lambda: 0.12,  peso: 400 },
    { id: 'porosas',    nome: 'rochas porosas',             lambda: 0.565, peso: 1600 },
    { id: 'silex',      nome: 'sílex',                      lambda: 2.6,   peso: 2600 },
    { id: 'traquito',   nome: 'traquito, andesito',         lambda: 1.1,   peso: 2000 },
    { id: 'xisto',      nome: 'xisto, ardósia',             lambda: 2.2,   peso: 2000 },
  ]},
  { cat: 'Outros', mats: [
    { id: 'caixa_ar',   nome: 'caixa de ar',      rAuto: true, peso: 0, espDef: 0.03 },
    { id: 'laje_alig',  nome: 'laje aligeirada',  lambda: null, peso: null },
  ]},
];

function tmMat(id) {
  for (const g of TM_MATERIAIS) {
    const m = g.mats.find(x => x.id === id);
    if (m) return { ...m, cat: g.cat };
  }
  return null;
}

// R da caixa de ar não ventilada — ITE 50, Quadro I.4
// (por sentido do fluxo de calor; interpolação linear entre pontos)
// fluxo: 'h' = horizontal (paredes) | 'asc' = ascendente (coberturas)
//        | 'desc' = descendente (pavimentos)
const TM_CAIXA_AR = {
  h:    [[0.005, 0.11], [0.010, 0.15], [0.015, 0.17], [0.025, 0.18]], // 25–300mm: 0,18
  asc:  [[0.005, 0.11], [0.010, 0.15], [0.015, 0.16]],                 // 15–300mm: 0,16
  desc: [[0.005, 0.11], [0.010, 0.15], [0.015, 0.17], [0.025, 0.19], [0.050, 0.21], [0.100, 0.22], [0.300, 0.23]],
};
function tmRCaixaAr(e, fluxo) {
  const tab = TM_CAIXA_AR[fluxo] || TM_CAIXA_AR.h;
  if (e < tab[0][0]) return 0;                       // < 5mm → 0,00
  const last = tab[tab.length - 1];
  if (e >= last[0]) return last[1];                  // acima do último ponto: constante
  for (let i = 1; i < tab.length; i++) {
    if (e <= tab[i][0]) {
      const [e0, r0] = tab[i - 1], [e1, r1] = tab[i];
      return r0 + (r1 - r0) * (e - e0) / (e1 - e0); // interpolação linear
    }
  }
  return last[1];
}

// ─── Tipos de elemento ───
// orient: V|H | front: ext|int|solo | rsi/rse: resistências superficiais
const TM_TIPOS = {
  PDE:  { nome: 'Parede Exterior',     texto: 'parede exterior',     orient: 'V', front: 'ext',  rsi: 0.13, rse: 0.04, fluxo: 'h' },
  PDI:  { nome: 'Parede Interior',     texto: 'parede interior',     orient: 'V', front: 'int',  rsi: 0.13, rse: 0.13, fluxo: 'h' },
  PDET: { nome: 'Parede Enterrada',    texto: 'parede enterrada',    orient: 'V', front: 'solo', rsi: 0.13, rse: 0,    fluxo: 'h' },
  CBE:  { nome: 'Cobertura Exterior',  texto: 'cobertura exterior',  orient: 'H', front: 'ext',  rsi: 0.10, rse: 0.04, fluxo: 'asc' },
  CBI:  { nome: 'Cobertura Interior',  texto: 'cobertura interior',  orient: 'H', front: 'int',  rsi: 0.10, rse: 0.10, fluxo: 'asc' },
  PVE:  { nome: 'Pavimento Exterior',  texto: 'pavimento exterior',  orient: 'H', front: 'ext',  rsi: 0.17, rse: 0.04, fluxo: 'desc' },
  PVI:  { nome: 'Pavimento Interior',  texto: 'pavimento interior',  orient: 'H', front: 'int',  rsi: 0.17, rse: 0.17, fluxo: 'desc' },
  PVT:  { nome: 'Pavimento Térreo',    texto: 'pavimento térreo',    orient: 'H', front: 'solo', rsi: 0.17, rse: 0,    fluxo: 'desc' },
  PVET: { nome: 'Pavimento Enterrado', texto: 'pavimento enterrado', orient: 'H', front: 'solo', rsi: 0.17, rse: 0,    fluxo: 'desc' },
};

const TM_PTP_SUBTIPOS = ['pilar', 'viga', 'talão de viga', 'caixa de estore', 'outro'];

// ─── Umáx — Portaria n.º 138-I/2021 (Continente) ───
// Habitação: Tabela 1 | Comércio e serviços: Tabela 4
// zi: índice da zona (I1=0, I2=1, I3=2)
function tmUmax(sol, zona, tipoEd) {
  const t = TM_TIPOS[sol.tipo];
  const zi = { I1: 0, I2: 1, I3: 2 }[zona];
  if (t.front === 'solo') return { valor: null, label: 'Sem requisito (contacto com o solo)' };

  const V = t.orient === 'V';
  const interior = t.front === 'int';
  const btrAlto = !interior || sol.btr !== 'baixo'; // exterior conta como btr>0,7

  if (tipoEd === 'serv') {
    if (sol.ptp) {
      if (!interior) return { valor: 0.90, label: 'PTP exterior' };
      if (btrAlto) return { valor: V ? [1.75, 1.60, 1.45][zi] : [1.25, 1.00, 0.90][zi], label: 'PTP interior, btr > 0,7' };
      return { valor: null, label: 'Sem requisito (Tabela 4)' };
    }
    if (btrAlto) return { valor: V ? [0.70, 0.60, 0.50][zi] : [0.50, 0.45, 0.40][zi], label: interior ? 'Zona corrente, interior btr > 0,7' : 'Zona corrente, exterior' };
    return { valor: null, label: 'Sem requisito (Tabela 4)' };
  }

  // Habitação — Tabela 1
  if (sol.ptp) {
    if (!interior) return { valor: 0.90, label: 'PTP exterior' };
    if (btrAlto) return { valor: V ? [1.75, 1.60, 1.45][zi] : [1.25, 1.00, 0.90][zi], label: 'PTP interior, btr > 0,7' };
    return { valor: V ? [2.00, 2.00, 1.90][zi] : [1.65, 1.30, 1.20][zi], label: 'PTP interior, btr ≤ 0,7' };
  }
  if (btrAlto) return { valor: V ? [0.50, 0.40, 0.35][zi] : [0.40, 0.35, 0.30][zi], label: interior ? 'Zona corrente, interior btr > 0,7' : 'Zona corrente, exterior' };
  return { valor: V ? [2.00, 2.00, 1.90][zi] : [1.65, 1.30, 1.20][zi], label: 'Zona corrente, interior btr ≤ 0,7' };
}

// ─── Cálculo de uma camada ───
// Devolve {R, massa, usaLambda, lambda, Rval, peso, nomeTexto, nome, nota}
function tmCalcCamada(c, fluxo) {
  let m, semDados = false;
  if (c.custom) {
    m = { nome: c.custom.nome, nomeTexto: c.custom.nome, lambda: c.custom.lambda ?? null, R: c.custom.R ?? null, peso: c.custom.peso ?? null, pesoM2: !!c.custom.pesoM2, cat: c.custom.cat || 'Personalizado' };
  } else {
    m = tmMat(c.matId);
    if (!m) return null;
    semDados = m.lambda == null && m.R == null && !m.rAuto;
    // valores manuais por camada (materiais sem dados na BD)
    if (c.Rman != null) m = { ...m, R: c.Rman, lambda: null };
    if (c.lambdaMan != null) m = { ...m, lambda: c.lambdaMan };
    if (c.pesoMan != null) m = { ...m, peso: c.pesoMan, pesoM2: true }; // manual = kg/m² directo
  }
  const e = c.e || 0;
  let R = null, usaLambda = false;
  if (m.rAuto) { R = tmRCaixaAr(e, fluxo); }
  else if (m.R != null) { R = m.R; }
  else if (m.lambda != null && m.lambda > 0) { R = e / m.lambda; usaLambda = true; }
  const massa = m.peso == null ? 0 : (m.pesoM2 ? m.peso : m.peso * e);
  return {
    R, massa, usaLambda, e, semDados,
    lambda: m.lambda, Rval: m.rAuto ? R : m.R, peso: m.peso, pesoM2: !!m.pesoM2,
    nome: m.nome, nomeTexto: m.nomeTexto || m.nome, cat: m.cat, nota: m.nota,
    isolamento: m.cat === 'Isolamentos',
    incompleto: R == null,
  };
}

// ─── Cálculo da solução ───
function tmCalcular(sol, zona, tipoEd) {
  const t = TM_TIPOS[sol.tipo];
  const camadas = (sol.camadas || []).map(c => tmCalcCamada(c, t.fluxo)).filter(Boolean);
  const incompleto = camadas.some(c => c.incompleto);
  let somaR = 0, esp = 0;
  camadas.forEach(c => { somaR += c.R || 0; esp += c.e; });
  const Rtotal = t.rsi + somaR + t.rse;
  const U = Rtotal > 0 ? 1 / Rtotal : null;

  // Massa: da última camada de isolamento (ordem ext→int) para dentro
  let lastIso = -1;
  camadas.forEach((c, i) => { if (c.isolamento) lastIso = i; });
  let massa = 0;
  camadas.forEach((c, i) => { if (i > lastIso) massa += c.massa; });

  const umax = tmUmax(sol, zona, tipoEd);
  let cumpre = null;
  if (umax.valor != null && U != null && !incompleto) cumpre = U <= umax.valor + 1e-9;

  return { camadas, U, esp, massa, Rtotal, umax, cumpre, incompleto, rsi: t.rsi, rse: t.rse };
}

// ─── Formatação PT ───
function tmFmt(x, dec) {
  if (x == null || isNaN(x)) return '—';
  return x.toFixed(dec).replace('.', ',');
}
function tmFmtCm(m) {
  const cm = m * 100;
  const s = (Math.round(cm * 10) / 10).toString().replace('.', ',');
  return s.endsWith(',0') ? s.slice(0, -2) : s;
}

// ─── Texto descritivo ───
function tmTexto(sol, calc) {
  const t = TM_TIPOS[sol.tipo];
  const elemento = sol.ptp
    ? `ponte térmica plana (${sol.ptpSubtipo || 'pilar'}) ${t.front === 'int' ? 'interior' : 'exterior'}`
    : t.texto;
  const frases = calc.camadas.map(c => {
    const cm = tmFmtCm(c.e);
    if (c.usaLambda) {
      const peso = String(c.peso).replace('.', ',');
      return `${c.nomeTexto} com ${cm}cm de espessura, ${peso}kg/m3 de massa volúmica e com um coeficiente de condutibilidade térmica de ${tmFmt(c.lambda, 3)}W/(mºC)`;
    }
    if (c.R != null) {
      return `${c.nomeTexto} com ${cm}cm de espessura e ${tmFmt(c.R, 3)}(m2ºC)/W de resistência térmica`;
    }
    return `${c.nomeTexto} com ${cm}cm de espessura`;
  });
  let lista = '';
  frases.forEach((f, i) => {
    if (i === 0) lista = f;
    else if (i === frases.length - 1) lista += ` e ${f}`;
    else lista += `; ${f}`;
  });
  return `Solução de ${elemento} constituída por: ${lista}. ` +
    `A espessura total da solução é de ${tmFmtCm(calc.esp)}cm e o seu coeficiente de transmissão térmica é de ${tmFmt(calc.U, 2)}W/(m2ºC).`;
}

// ─── Estado e persistência ───
const TM_LS_KEY = 'alios_termica_semprojecto';
let tmState = null;
let tmEditIdx = null; // índice da solução em edição

function tmLoad() {
  if (currentProject) {
    if (!currentProject.termica) currentProject.termica = { zona: 'I1', tipoEd: 'hab', solucoes: [] };
    tmState = currentProject.termica;
  } else {
    try { tmState = JSON.parse(localStorage.getItem(TM_LS_KEY)); } catch (e) { tmState = null; }
    if (!tmState) tmState = { zona: 'I1', tipoEd: 'hab', solucoes: [] };
  }
}

function tmSave() {
  if (currentProject) { currentProject.termica = tmState; saveProject(); }
  else localStorage.setItem(TM_LS_KEY, JSON.stringify(tmState));
}

// Código automático: prefixo + próximo número livre
function tmProximoCodigo(tipo, ptp) {
  const prefixo = ptp ? 'PTP' + tipo : tipo;
  let n = 1;
  const usados = new Set(tmState.solucoes.map(s => s.codigo));
  while (usados.has(prefixo + n)) n++;
  return prefixo + n;
}

// ─── CSS ───
function tmCSS() {
  if (document.getElementById('termica-css')) return;
  const st = document.createElement('style');
  st.id = 'termica-css';
  st.textContent = `
  .tm-wrap { max-width: 860px; margin: 0 auto; padding: 16px; }
  .tm-top { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-bottom: 18px;
    background: linear-gradient(135deg,#0f1729,#131d33); border: 1px solid #1a2744; border-radius: 12px; padding: 12px 16px; }
  .tm-top-label { font-size: 11px; color: #5a7aaa; text-transform: uppercase; letter-spacing: .5px; margin-right: 6px; }
  .tm-seg { display: inline-flex; border: 1px solid #2a3450; border-radius: 8px; overflow: hidden; }
  .tm-seg button { background: #0a0f1e; color: #8090b0; border: none; padding: 6px 14px; cursor: pointer; font-size: 13px; }
  .tm-seg button.on { background: #1E8AFF; color: #fff; font-weight: 600; }
  .tm-sol-card { display: flex; align-items: center; gap: 12px; background: #0f1729; border: 1px solid #1a2744;
    border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; cursor: pointer; }
  .tm-sol-card:hover { border-color: #1E8AFF55; background: #131d33; }
  .tm-sol-cod { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #1E8AFF; min-width: 84px; }
  .tm-sol-info { flex: 1; min-width: 0; }
  .tm-sol-nome { font-size: 13px; color: #d0d6e8; }
  .tm-sol-meta { font-size: 11px; color: #5a7aaa; }
  .tm-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .tm-ok  { background: rgba(16,185,129,.15); color: #10b981; }
  .tm-nok { background: rgba(239,68,68,.15); color: #ef4444; }
  .tm-nr  { background: rgba(90,122,170,.15); color: #8090b0; }
  .tm-del { background: none; border: none; color: #5a7aaa; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 4px; }
  .tm-del:hover { color: #ef4444; background: rgba(239,68,68,.1); }
  .tm-add { display: block; width: 100%; padding: 12px; background: none; border: 1px dashed #2a3450;
    border-radius: 10px; color: #1E8AFF; font-size: 13px; cursor: pointer; margin-top: 8px; }
  .tm-add:hover { border-color: #1E8AFF; background: rgba(30,138,255,.05); }
  .tm-ed { background: #0f1729; border: 1px solid #1a2744; border-radius: 12px; padding: 16px 20px; }
  .tm-ed-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 14px; }
  .tm-field label { display: block; font-size: 11px; color: #5a7aaa; margin-bottom: 4px; }
  .tm-field input, .tm-field select { background: #0a0f1e; border: 1px solid #2a3450; border-radius: 6px;
    color: #e0e6f0; font-size: 13px; padding: 7px 10px; }
  .tm-field input:focus, .tm-field select:focus { border-color: #1E8AFF; outline: none; }
  .tm-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  .tm-table th { text-align: left; font-size: 11px; color: #5a7aaa; font-weight: 500; padding: 4px 8px;
    border-bottom: 1px solid #1a2744; }
  .tm-table td { padding: 5px 8px; border-bottom: 1px solid #131d33; color: #d0d6e8; vertical-align: middle; }
  .tm-table td.num { font-family: 'JetBrains Mono', monospace; font-size: 12px; white-space: nowrap; }
  .tm-table input.tm-e { width: 64px; background: #0a0f1e; border: 1px solid #2a3450; border-radius: 5px;
    color: #e0e6f0; font-size: 12px; padding: 4px 6px; font-family: 'JetBrains Mono', monospace; }
  .tm-table input.tm-man { width: 72px; background: #0a0f1e; border: 1px solid #8a6d3b; border-radius: 5px;
    color: #e0e6f0; font-size: 12px; padding: 4px 6px; font-family: 'JetBrains Mono', monospace; }
  .tm-mv { background: none; border: none; color: #5a7aaa; cursor: pointer; font-size: 12px; padding: 2px 4px; }
  .tm-mv:hover { color: #1E8AFF; }
  .tm-iso-tag { font-size: 10px; color: #10b981; }
  .tm-res { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0; }
  .tm-res-box { background: #0a0f1e; border: 1px solid #1a2744; border-radius: 8px; padding: 10px 12px; }
  .tm-res-label { font-size: 10px; color: #5a7aaa; text-transform: uppercase; letter-spacing: .5px; }
  .tm-res-val { font-family: 'JetBrains Mono', monospace; font-size: 17px; color: #d0d6e8; margin-top: 2px; }
  .tm-res-sub { font-size: 10px; color: #5a7aaa; margin-top: 2px; }
  .tm-texto { width: 100%; min-height: 110px; background: #0a0f1e; border: 1px solid #2a3450; border-radius: 8px;
    color: #d0d6e8; font-size: 13px; line-height: 1.5; padding: 10px 12px; box-sizing: border-box; resize: vertical; }
  .tm-btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .tm-btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; font-weight: 500; }
  .tm-btn-pri { background: #1E8AFF; color: #fff; }
  .tm-btn-pri:hover { background: #3d9dff; }
  .tm-btn-sec { background: #1a2744; color: #8090b0; }
  .tm-btn-sec:hover { background: #243352; }
  .tm-aviso { font-size: 12px; color: #f59e0b; margin: 8px 0; }
  .tm-titulo { font-size: 15px; font-weight: 600; color: #d0d6e8; margin: 0 0 12px; }
  .tm-sub { font-size: 12px; color: #5a7aaa; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .5px; }
  `;
  document.head.appendChild(st);
}

// ─── Vista: lista de soluções ───
function tmShowLista() {
  tmEditIdx = null;
  tmCSS();
  setSub('Comportamento Térmico — Soluções Construtivas');
  setProgress(0);
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(AREAS.find(a => a.id === 'termica')) }]);
  const m = mainEl(); m.innerHTML = '';
  const w = document.createElement('div');
  w.className = 'tm-wrap';

  // Selectores de contexto
  const zonas = ['I1', 'I2', 'I3'].map(z =>
    `<button class="${tmState.zona === z ? 'on' : ''}" onclick="tmSetZona('${z}')">${z}</button>`).join('');
  const tipos = [['hab', 'Habitação'], ['serv', 'Comércio e serviços']].map(([v, l]) =>
    `<button class="${tmState.tipoEd === v ? 'on' : ''}" onclick="tmSetTipoEd('${v}')">${l}</button>`).join('');
  w.innerHTML = `
    <div class="tm-top">
      <span><span class="tm-top-label">Zona climática de Inverno</span><span class="tm-seg">${zonas}</span></span>
      <span><span class="tm-top-label">Edifício</span><span class="tm-seg">${tipos}</span></span>
      <span style="flex:1"></span>
      <button class="tm-btn tm-btn-sec" onclick="tmImprimirCaderno()">🖨 Caderno (PDF)</button>
      <span style="font-size:11px;color:#5a7aaa">Umáx: Portaria n.º 138-I/2021</span>
    </div>`;

  if (tmState.solucoes.length === 0) {
    w.innerHTML += `<div style="color:#4a5a78;font-size:13px;padding:16px 4px">Ainda não há soluções construtivas. Crie a primeira.</div>`;
  } else {
    tmState.solucoes.forEach((s, i) => {
      const calc = tmCalcular(s, tmState.zona, tmState.tipoEd);
      const t = TM_TIPOS[s.tipo];
      let badge;
      if (calc.incompleto) badge = '<span class="tm-badge tm-nok">dados em falta</span>';
      else if (calc.cumpre === true) badge = '<span class="tm-badge tm-ok">✓ Cumpre</span>';
      else if (calc.cumpre === false) badge = '<span class="tm-badge tm-nok">✗ Não cumpre</span>';
      else badge = '<span class="tm-badge tm-nr">sem requisito</span>';
      const nome = s.ptp ? `Ponte Térmica Plana, tipo ${s.ptpSubtipo || 'pilar'}` : t.nome;
      const card = document.createElement('div');
      card.className = 'tm-sol-card';
      card.innerHTML = `
        <span class="tm-sol-cod">${s.codigo}</span>
        <span class="tm-sol-info">
          <div class="tm-sol-nome">${nome}</div>
          <div class="tm-sol-meta">${calc.camadas.length} camada${calc.camadas.length !== 1 ? 's' : ''} · e=${tmFmtCm(calc.esp)}cm · U=${tmFmt(calc.U, 2)} W/(m²·°C)${calc.umax.valor != null ? ' · Umáx=' + tmFmt(calc.umax.valor, 2) : ''}</div>
        </span>
        ${badge}
        <button class="tm-del" title="Apagar solução" onclick="event.stopPropagation();tmApagar(${i})">✕</button>`;
      card.onclick = () => tmShowEditor(i);
      w.appendChild(card);
    });
  }

  const add = document.createElement('button');
  add.className = 'tm-add';
  add.textContent = '+ Nova solução construtiva';
  add.onclick = tmNovaSolucao;
  w.appendChild(add);
  m.appendChild(w);
}

function tmSetZona(z) { tmState.zona = z; tmSave(); tmEditIdx == null ? tmShowLista() : tmShowEditor(tmEditIdx); }
function tmSetTipoEd(t) { tmState.tipoEd = t; tmSave(); tmEditIdx == null ? tmShowLista() : tmShowEditor(tmEditIdx); }

function tmApagar(i) {
  const s = tmState.solucoes[i];
  if (!confirm(`Apagar a solução ${s.codigo}?`)) return;
  tmState.solucoes.splice(i, 1);
  tmSave();
  tmShowLista();
}

function tmNovaSolucao() {
  const s = {
    tipo: 'PDE', ptp: false, ptpSubtipo: 'pilar', btr: 'alto',
    codigo: tmProximoCodigo('PDE', false),
    camadas: [],
  };
  tmState.solucoes.push(s);
  tmSave();
  tmShowEditor(tmState.solucoes.length - 1);
}

// ─── Vista: editor de solução ───
function tmShowEditor(idx) {
  tmEditIdx = idx;
  tmCSS();
  const s = tmState.solucoes[idx];
  const calc = tmCalcular(s, tmState.zona, tmState.tipoEd);
  const t = TM_TIPOS[s.tipo];
  setSub(`Soluções Construtivas — ${s.codigo}`);
  setHeaderBtns([{ label: '← Soluções', action: tmShowLista }]);
  const m = mainEl(); m.innerHTML = '';
  const w = document.createElement('div');
  w.className = 'tm-wrap';

  const tiposOpts = Object.entries(TM_TIPOS).map(([k, v]) =>
    `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${v.nome}</option>`).join('');
  const subOpts = TM_PTP_SUBTIPOS.map(x =>
    `<option value="${x}" ${s.ptpSubtipo === x ? 'selected' : ''}>${x}</option>`).join('');

  // Cabeçalho da solução
  let head = `
    <div class="tm-ed">
    <div class="tm-ed-head">
      <span class="tm-field"><label>Código</label><input id="tm-cod" value="${s.codigo}" style="width:110px;font-family:'JetBrains Mono',monospace" onchange="tmSetCodigo(this.value)"/></span>
      <span class="tm-field"><label>Tipo de elemento</label><select onchange="tmSetTipo(this.value)">${tiposOpts}</select></span>
      <span class="tm-field"><label>Ponte térmica plana?</label><select onchange="tmSetPtp(this.value)">
        <option value="nao" ${!s.ptp ? 'selected' : ''}>Não — zona corrente</option>
        <option value="sim" ${s.ptp ? 'selected' : ''}>Sim — PTP</option></select></span>
      ${s.ptp ? `<span class="tm-field"><label>Tipo de PTP</label><select onchange="tmSetPtpSub(this.value)">${subOpts}</select></span>` : ''}
      ${t.front === 'int' ? `<span class="tm-field"><label>btr do espaço adjacente</label><select onchange="tmSetBtr(this.value)">
        <option value="alto" ${s.btr !== 'baixo' ? 'selected' : ''}>btr &gt; 0,7</option>
        <option value="baixo" ${s.btr === 'baixo' ? 'selected' : ''}>btr ≤ 0,7</option></select></span>` : ''}
    </div>`;

  // Tabela de camadas
  head += `<div class="tm-sub">Camadas (do exterior${t.front === 'int' ? '/espaço não útil' : ''} para o interior)</div>
    <table class="tm-table"><thead><tr>
      <th></th><th>Material</th><th>e (cm)</th><th>λ [W/(m·°C)]</th><th>R [(m²·°C)/W]</th><th>Massa (kg/m²)</th><th></th>
    </tr></thead><tbody>`;
  head += `<tr><td></td><td style="color:#5a7aaa">Rse — resistência superficial exterior</td><td></td><td></td><td class="num">${t.rse > 0 ? tmFmt(t.rse, 2) : '— (solo)'}</td><td></td><td></td></tr>`;

  calc.camadas.forEach((c, i) => {
    const orig = s.camadas[i];
    head += `<tr>
      <td class="num">${i + 1}</td>
      <td>${c.nome}${c.isolamento ? ' <span class="tm-iso-tag">● isolamento</span>' : ''}${c.nota ? ` <span style="font-size:10px;color:#5a7aaa">(${c.nota})</span>` : ''}</td>
      <td><input class="tm-e" value="${tmFmtCm(c.e)}" onchange="tmSetE(${i}, this.value)"/></td>
      <td class="num">${c.usaLambda ? tmFmt(c.lambda, 3) : '—'}</td>
      <td class="num">${c.semDados
        ? `<input class="tm-man" placeholder="R manual" value="${orig.Rman != null ? String(orig.Rman).replace('.', ',') : ''}" onchange="tmSetRman(${i}, this.value)"/>`
        : tmFmt(c.R, 3)}</td>
      <td class="num">${c.semDados
        ? `<input class="tm-man" placeholder="kg/m²" value="${orig.pesoMan != null ? String(orig.pesoMan).replace('.', ',') : ''}" onchange="tmSetPesoman(${i}, this.value)"/>`
        : tmFmt(c.massa, 1)}</td>
      <td style="white-space:nowrap">
        <button class="tm-mv" title="Subir" onclick="tmMove(${i},-1)">▲</button>
        <button class="tm-mv" title="Descer" onclick="tmMove(${i},1)">▼</button>
        <button class="tm-del" title="Remover" onclick="tmRemCamada(${i})">✕</button>
      </td></tr>`;
  });
  head += `<tr><td></td><td style="color:#5a7aaa">Rsi — resistência superficial interior</td><td></td><td></td><td class="num">${tmFmt(t.rsi, 2)}</td><td></td><td></td></tr>`;
  head += `</tbody></table>`;

  // Adicionar camada
  const grupos = TM_MATERIAIS.map(g =>
    `<optgroup label="${g.cat}">${g.mats.map(mm => `<option value="${mm.id}">${mm.nome}</option>`).join('')}</optgroup>`).join('');
  head += `
    <div class="tm-btns" style="align-items:center">
      <span class="tm-field"><select id="tm-novomat">${grupos}</select></span>
      <button class="tm-btn tm-btn-sec" onclick="tmAddCamada()">+ Adicionar camada</button>
      <button class="tm-btn tm-btn-sec" onclick="tmAddCustom()">+ Material personalizado</button>
    </div>`;

  // Resultados
  const umaxTxt = calc.umax.valor != null ? tmFmt(calc.umax.valor, 2) : '—';
  let cumpreHtml;
  if (calc.incompleto) cumpreHtml = '<span class="tm-badge tm-nok">dados em falta</span>';
  else if (calc.cumpre === true) cumpreHtml = '<span class="tm-badge tm-ok">✓ SIM</span>';
  else if (calc.cumpre === false) cumpreHtml = '<span class="tm-badge tm-nok">✗ NÃO</span>';
  else cumpreHtml = `<span class="tm-badge tm-nr">${calc.umax.label}</span>`;
  head += `
    <div class="tm-res">
      <div class="tm-res-box"><div class="tm-res-label">U</div><div class="tm-res-val">${tmFmt(calc.U, 2)}</div><div class="tm-res-sub">W/(m²·°C) · R<sub>t</sub>=${tmFmt(calc.Rtotal, 3)}</div></div>
      <div class="tm-res-box"><div class="tm-res-label">Espessura total</div><div class="tm-res-val">${tmFmtCm(calc.esp)}</div><div class="tm-res-sub">cm</div></div>
      <div class="tm-res-box"><div class="tm-res-label">Massa superficial</div><div class="tm-res-val">${tmFmt(calc.massa, 1)}</div><div class="tm-res-sub">kg/m² (do isolamento p/ dentro)</div></div>
      <div class="tm-res-box"><div class="tm-res-label">Umáx (${tmState.zona})</div><div class="tm-res-val">${umaxTxt}</div><div class="tm-res-sub">${calc.umax.label}</div></div>
      <div class="tm-res-box"><div class="tm-res-label">Cumpre?</div><div class="tm-res-val">${cumpreHtml}</div></div>
    </div>`;

  if (calc.incompleto) head += `<div class="tm-aviso">⚠️ Há camadas sem λ/R definido — preenche o R manual (caixa a âmbar) para o cálculo ficar completo.</div>`;
  if (t.front === 'solo') head += `<div class="tm-aviso" style="color:#5a7aaa">ℹ️ Elemento em contacto com o solo: U calculado sem Rse; sem requisito de Umáx (o cálculo pelo terreno é feito na folha, EN 13370).</div>`;

  // Pormenor (corte)
  if (calc.camadas.length) {
    head += `<div class="tm-sub">Pormenor (corte)</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:0 1 480px">${tmSVG(s, calc, 'ed')}</div>
        <div style="flex:1;min-width:200px;color:#d0d6e8">
          <div style="font-size:11px;color:#5a7aaa;text-transform:uppercase;letter-spacing:.5px">Legenda</div>
          ${tmLegenda(calc)}
          <div class="tm-btns"><button class="tm-btn tm-btn-sec" onclick="tmDownloadSVG()">⬇ Descarregar SVG</button></div>
        </div>
      </div>`;
  }

  // Texto descritivo
  head += `<div class="tm-sub">Texto descritivo</div>
    <textarea class="tm-texto" id="tm-texto" readonly>${calc.camadas.length ? tmTexto(s, calc) : ''}</textarea>
    <div class="tm-btns">
      <button class="tm-btn tm-btn-pri" onclick="tmCopiarTexto()">📋 Copiar texto</button>
      <button class="tm-btn tm-btn-sec" onclick="tmShowLista()">← Voltar às soluções</button>
    </div>
    </div>`;

  w.innerHTML = head;
  m.appendChild(w);
}

// ─── Acções do editor ───
function tmSol() { return tmState.solucoes[tmEditIdx]; }

function tmSetCodigo(v) { tmSol().codigo = v.trim() || tmSol().codigo; tmSave(); tmShowEditor(tmEditIdx); }

function tmSetTipo(v) {
  const s = tmSol();
  s.tipo = v;
  s.codigo = tmProximoCodigo(v, s.ptp);
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmSetPtp(v) {
  const s = tmSol();
  s.ptp = v === 'sim';
  s.codigo = tmProximoCodigo(s.tipo, s.ptp);
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmSetPtpSub(v) { tmSol().ptpSubtipo = v; tmSave(); tmShowEditor(tmEditIdx); }
function tmSetBtr(v) { tmSol().btr = v; tmSave(); tmShowEditor(tmEditIdx); }

function tmParseNum(v) {
  const x = parseFloat(String(v).replace(',', '.'));
  return isNaN(x) ? null : x;
}

function tmSetE(i, v) {
  const cm = tmParseNum(v);
  if (cm != null && cm >= 0) tmSol().camadas[i].e = cm / 100;
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmSetRman(i, v) {
  const x = tmParseNum(v);
  tmSol().camadas[i].Rman = x != null && x > 0 ? x : null;
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmSetPesoman(i, v) {
  const x = tmParseNum(v);
  tmSol().camadas[i].pesoMan = x != null && x >= 0 ? x : null; // kg/m² directo
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmAddCamada() {
  const sel = document.getElementById('tm-novomat');
  const m = tmMat(sel.value);
  if (!m) return;
  tmSol().camadas.push({ matId: m.id, e: m.espDef || 0.02 });
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmAddCustom() {
  const nome = prompt('Nome do material (como deve aparecer no texto):');
  if (!nome) return;
  const modo = prompt('Tem condutibilidade (λ) ou resistência fixa (R)? Escreve "L" ou "R":', 'L');
  if (!modo) return;
  const c = { custom: { nome: nome.trim() }, e: 0.02 };
  if (modo.trim().toUpperCase() === 'R') {
    const R = tmParseNum(prompt('R [(m²·°C)/W]:'));
    if (R == null || R <= 0) { alert('R inválido.'); return; }
    c.custom.R = R;
    const p = tmParseNum(prompt('Peso em kg/m² (directo; vazio = não conta para a massa):') || '');
    if (p != null) { c.custom.peso = p; c.custom.pesoM2 = true; }
  } else {
    const L = tmParseNum(prompt('λ [W/(m·°C)]:'));
    if (L == null || L <= 0) { alert('λ inválido.'); return; }
    c.custom.lambda = L;
    const p = tmParseNum(prompt('Massa volúmica em kg/m³ (vazio = não conta para a massa):') || '');
    if (p != null) c.custom.peso = p;
  }
  const iso = confirm('É camada de isolamento? (define onde começa a contagem da massa)');
  if (iso) c.custom.cat = 'Isolamentos';
  tmSol().camadas.push(c);
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmRemCamada(i) {
  tmSol().camadas.splice(i, 1);
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmMove(i, d) {
  const cs = tmSol().camadas;
  const j = i + d;
  if (j < 0 || j >= cs.length) return;
  [cs[i], cs[j]] = [cs[j], cs[i]];
  tmSave(); tmShowEditor(tmEditIdx);
}

function tmCopiarTexto() {
  const ta = document.getElementById('tm-texto');
  if (!ta.value) return;
  navigator.clipboard.writeText(ta.value).then(
    () => { const b = event.target; const o = b.textContent; b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = o, 1500); },
    () => { ta.select(); document.execCommand('copy'); }
  );
}

// ═══════════════════════════════════════════════════
// DESENHO DE PORMENOR (SVG)
// ═══════════════════════════════════════════════════

// Tramas por material — devolve {defs, fill} para um dado uid único
// (uid evita colisões de ids quando há vários SVG na mesma página)
function tmTrama(c, uid, n) {
  const id = `tm${uid}p${n}`;
  const cat = c.cat || '';
  const nome = (c.nome || '').toLowerCase();

  // tijolo (cerâmico / térmico): aparelho de tijolo laranja
  if (nome.includes('tijolo')) {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="22" height="14" patternUnits="userSpaceOnUse">
      <rect width="22" height="14" fill="#E2794A"/>
      <path d="M0 0 H22 M0 7 H22 M0 14 H22" stroke="#fff" stroke-width="1.6"/>
      <path d="M6 0 V7 M17 7 V14" stroke="#fff" stroke-width="1.6"/></pattern>` };
  }
  // blocos de betão: blocos cinza
  if (nome.includes('blocos')) {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="26" height="16" patternUnits="userSpaceOnUse">
      <rect width="26" height="16" fill="#C9CDD1"/>
      <path d="M0 0 H26 M0 8 H26 M0 16 H26" stroke="#fff" stroke-width="1.6"/>
      <path d="M8 0 V8 M20 8 V16" stroke="#fff" stroke-width="1.6"/></pattern>` };
  }
  // isolamentos: quadrícula azul (estilo XPS)
  if (cat === 'Isolamentos' || nome.includes('reboco térmico')) {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#9FD8F5"/>
      <path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6" stroke="#2E9FD8" stroke-width="1"/>
      <path d="M0 0 L8 8 M-2 6 L2 10 M6 -2 L10 2" stroke="#2E9FD8" stroke-width="1"/></pattern>` };
  }
  // betão armado / betonilha / betões: salpico
  if (nome.includes('betão') || nome.includes('betonilha') || nome.includes('laje')) {
    const dots = '<circle cx="6" cy="8" r="1.1"/><circle cx="20" cy="22" r="1.1"/><circle cx="30" cy="6" r="1.1"/><circle cx="12" cy="30" r="1.1"/><circle cx="33" cy="33" r="1.1"/><circle cx="24" cy="14" r="0.8"/><circle cx="3" cy="24" r="0.8"/>';
    const tris = '<path d="M14 4 l3 4 h-6 z"/><path d="M28 26 l3 4 h-6 z"/>';
    const voids = nome.includes('aligeirada') ? '<circle cx="10" cy="18" r="5" fill="#fff" stroke="#8a8a8a" stroke-width="0.8"/><circle cx="28" cy="18" r="5" fill="#fff" stroke="#8a8a8a" stroke-width="0.8"/>' : '';
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="38" height="38" patternUnits="userSpaceOnUse">
      <rect width="38" height="38" fill="#DCDCDC"/><g fill="#8a8a8a">${dots}${tris}</g>${voids}</pattern>` };
  }
  // madeiras: veios
  if (cat === 'Madeiras') {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="30" height="12" patternUnits="userSpaceOnUse">
      <rect width="30" height="12" fill="#D9A86C"/>
      <path d="M0 3 Q8 1.5 15 3 T30 3 M0 8 Q10 6.5 18 8 T30 8" stroke="#A87B45" stroke-width="0.9" fill="none"/></pattern>` };
  }
  // pedra natural / revestimento em pedra / cantaria: diagonal
  if (cat === 'Pedra natural' || nome.includes('pedra') || nome.includes('cantaria')) {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse">
      <rect width="9" height="9" fill="#CFCFC7"/>
      <path d="M0 9 L9 0 M-2 2 L2 -2 M7 11 L11 7" stroke="#84847C" stroke-width="1"/></pattern>` };
  }
  // caixa de ar: vazio
  if (nome.includes('caixa de ar')) return { fill: '#FFFFFF', defs: '' };
  // metais
  if (nome.includes('aço') || nome.includes('alumínio') || nome.includes('zinco')) {
    return { fill: '#B8BEC6', defs: '' };
  }
  // membranas: escuro
  if (nome.includes('membrana')) return { fill: '#4A4A4A', defs: '' };
  // seixo: bolinhas
  if (nome.includes('seixo')) {
    return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="16" height="12" patternUnits="userSpaceOnUse">
      <rect width="16" height="12" fill="#E8E4DA"/>
      <ellipse cx="4" cy="4" rx="2.6" ry="1.9" fill="none" stroke="#9A948A" stroke-width="0.9"/>
      <ellipse cx="12" cy="9" rx="2.6" ry="1.9" fill="none" stroke="#9A948A" stroke-width="0.9"/></pattern>` };
  }
  // cerâmico (revestimento)
  if (nome.includes('cerâmico')) return { fill: '#B0522D', defs: '' };
  // gesso cartonado
  if (nome.includes('gesso')) return { fill: '#F0E2C8', defs: '' };
  // rebocos / estuques / etic
  if (nome.includes('reboco') || nome.includes('estuque') || nome.includes('etic') || nome.includes('flutuante')) {
    return { fill: '#EFE9DC', defs: '' };
  }
  // por defeito: cinza claro com diagonal suave
  return { fill: `url(#${id})`, defs: `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse">
    <rect width="10" height="10" fill="#E4E4E4"/>
    <path d="M0 10 L10 0" stroke="#B0B0B0" stroke-width="0.8"/></pattern>` };
}

// Gera o SVG do corte de uma solução
// Paredes: corte horizontal (exterior à esquerda) | coberturas: ext em cima | pavimentos: ext em baixo
function tmSVG(sol, calc, uid) {
  const t = TM_TIPOS[sol.tipo];
  if (!calc.camadas.length) return '';
  const V = t.orient === 'V';
  const ALVO = V ? 380 : 300;          // extensão total do corte em px
  const MIN = 9;                        // espessura mínima visível de uma camada
  const SEC = V ? 190 : 320;            // dimensão transversal da secção

  // larguras proporcionais com mínimo
  const esc = ALVO / (calc.esp || 0.01);
  const dims = calc.camadas.map(c => Math.max(c.e * esc, MIN));
  const total = dims.reduce((a, b) => a + b, 0);

  let defs = '', corpo = '', numeros = '', cotas = '';
  const M = { l: 56, r: 56, t: 34, b: 46 };  // margens
  let pos = 0;

  calc.camadas.forEach((c, i) => {
    const tr = tmTrama(c, uid, i);
    defs += tr.defs;
    const d = dims[i];
    if (V) {
      const x = M.l + pos;
      corpo += `<rect x="${x}" y="${M.t}" width="${d}" height="${SEC}" fill="${tr.fill}" stroke="#3a3a3a" stroke-width="1"/>`;
      // número no topo
      const cx = x + d / 2;
      numeros += `<line x1="${cx}" y1="${M.t - 6}" x2="${cx}" y2="${M.t}" stroke="#666" stroke-width="0.8"/>
        <circle cx="${cx}" cy="${M.t - 15}" r="8.5" fill="#fff" stroke="#333" stroke-width="1"/>
        <text x="${cx}" y="${M.t - 11.5}" text-anchor="middle" font-size="10" font-family="DM Sans, sans-serif" fill="#111">${i + 1}</text>`;
      // cota da camada
      const cy = M.t + SEC + 14;
      cotas += `<line x1="${x}" y1="${cy}" x2="${x + d}" y2="${cy}" stroke="#666" stroke-width="0.8"/>
        <line x1="${x}" y1="${cy - 3}" x2="${x}" y2="${cy + 3}" stroke="#666" stroke-width="0.8"/>
        <line x1="${x + d}" y1="${cy - 3}" x2="${x + d}" y2="${cy + 3}" stroke="#666" stroke-width="0.8"/>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" font-family="DM Sans, sans-serif" fill="#444">${tmFmtCm(c.e)}</text>`;
      pos += d;
    } else {
      // empilhado: cobertura ext em cima (ordem dada), pavimento ext em baixo (inverter posição)
      const idxPos = sol.tipo.startsWith('PV') ? (total - pos - dims[i]) : pos;
      const y = M.t + idxPos;
      corpo += `<rect x="${M.l}" y="${y}" width="${SEC}" height="${d}" fill="${tr.fill}" stroke="#3a3a3a" stroke-width="1"/>`;
      const cy = y + d / 2;
      numeros += `<line x1="${M.l - 6}" y1="${cy}" x2="${M.l}" y2="${cy}" stroke="#666" stroke-width="0.8"/>
        <circle cx="${M.l - 16}" cy="${cy}" r="8.5" fill="#fff" stroke="#333" stroke-width="1"/>
        <text x="${M.l - 16}" y="${cy + 3.5}" text-anchor="middle" font-size="10" font-family="DM Sans, sans-serif" fill="#111">${i + 1}</text>`;
      const cx2 = M.l + SEC + 14;
      cotas += `<line x1="${cx2}" y1="${y}" x2="${cx2}" y2="${y + d}" stroke="#666" stroke-width="0.8"/>
        <line x1="${cx2 - 3}" y1="${y}" x2="${cx2 + 3}" y2="${y}" stroke="#666" stroke-width="0.8"/>
        <line x1="${cx2 - 3}" y1="${y + d}" x2="${cx2 + 3}" y2="${y + d}" stroke="#666" stroke-width="0.8"/>
        <text x="${cx2 + 8}" y="${cy + 3}" font-size="9" font-family="DM Sans, sans-serif" fill="#444">${tmFmtCm(c.e)}</text>`;
      pos += d;
    }
  });

  let rotulos = '', W, H;
  if (V) {
    W = M.l + total + M.r; H = M.t + SEC + M.b;
    const my = M.t + SEC / 2;
    rotulos = `<text x="${M.l - 10}" y="${my}" text-anchor="end" font-size="11" font-style="italic" font-family="DM Sans, sans-serif" fill="#555">${t.front === 'int' ? 'enu' : 'exterior'}</text>
      <text x="${M.l + total + 10}" y="${my}" font-size="11" font-style="italic" font-family="DM Sans, sans-serif" fill="#555">interior</text>
      <text x="${M.l + total / 2}" y="${M.t + SEC + 40}" text-anchor="middle" font-size="10" font-family="DM Sans, sans-serif" fill="#333">espessura total: ${tmFmtCm(calc.esp)} cm</text>`;
  } else {
    W = M.l + SEC + M.r + 10; H = M.t + total + M.b;
    const extCima = !sol.tipo.startsWith('PV');
    const labExt = t.front === 'int' ? 'enu' : 'exterior';
    rotulos = `<text x="${M.l + SEC / 2}" y="${M.t - 10}" text-anchor="middle" font-size="11" font-style="italic" font-family="DM Sans, sans-serif" fill="#555">${extCima ? labExt : 'interior'}</text>
      <text x="${M.l + SEC / 2}" y="${M.t + total + 18}" text-anchor="middle" font-size="11" font-style="italic" font-family="DM Sans, sans-serif" fill="#555">${extCima ? 'interior' : labExt}</text>
      <text x="${M.l + SEC / 2}" y="${M.t + total + 36}" text-anchor="middle" font-size="10" font-family="DM Sans, sans-serif" fill="#333">espessura total: ${tmFmtCm(calc.esp)} cm</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;background:#fff;border-radius:8px">
    <defs>${defs}</defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
    ${corpo}${numeros}${cotas}${rotulos}</svg>`;
}

// Legenda numerada (HTML) para acompanhar o desenho
function tmLegenda(calc) {
  return '<ol style="margin:8px 0 0;padding-left:22px;font-size:12px;line-height:1.6">' +
    calc.camadas.map(c => `<li>${c.nome} — ${tmFmtCm(c.e)} cm</li>`).join('') + '</ol>';
}

// Descarregar o SVG da solução em edição
function tmDownloadSVG() {
  const s = tmSol();
  const calc = tmCalcular(s, tmState.zona, tmState.tipoEd);
  const svg = tmSVG(s, calc, 'dl');
  if (!svg) return;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${s.codigo}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Caderno de soluções (imprimir / PDF) ───
function tmImprimirCaderno() {
  if (!tmState.solucoes.length) { alert('Não há soluções para imprimir.'); return; }
  const proj = currentProject ? currentProject.nome : '';
  let corpo = '';
  tmState.solucoes.forEach((s, i) => {
    const calc = tmCalcular(s, tmState.zona, tmState.tipoEd);
    const t = TM_TIPOS[s.tipo];
    const nome = s.ptp ? `Ponte Térmica Plana ${t.front === 'int' ? 'Interior' : 'Exterior'}, tipo ${s.ptpSubtipo || 'pilar'}` : t.nome;
    const linhas = calc.camadas.map((c, j) => `<tr>
      <td>${j + 1}</td><td>${c.nome}</td><td class="n">${tmFmtCm(c.e)}</td>
      <td class="n">${c.usaLambda ? tmFmt(c.lambda, 3) : '—'}</td>
      <td class="n">${tmFmt(c.R, 3)}</td><td class="n">${tmFmt(c.massa, 1)}</td></tr>`).join('');
    let cumpre;
    if (calc.incompleto) cumpre = 'dados em falta';
    else if (calc.cumpre === true) cumpre = 'SIM';
    else if (calc.cumpre === false) cumpre = 'NÃO';
    else cumpre = '—';
    corpo += `
    <section class="sol">
      <h2>${s.codigo} — ${nome}</h2>
      <div class="linha-fig">
        <div class="fig">${tmSVG(s, calc, 'pr' + i)}</div>
        <div class="leg"><div class="leg-t">Constituição (do ${t.front === 'int' ? 'ENU' : 'exterior'} para o interior)</div>${tmLegenda(calc)}</div>
      </div>
      <table class="tab">
        <thead><tr><th></th><th>Material</th><th>e (cm)</th><th>λ [W/(m·°C)]</th><th>R [(m²·°C)/W]</th><th>Massa (kg/m²)</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <table class="res">
        <tr><td>Coeficiente de transmissão térmica, U</td><td class="n">${tmFmt(calc.U, 2)} W/(m²·°C)</td>
            <td>Espessura total</td><td class="n">${tmFmtCm(calc.esp)} cm</td></tr>
        <tr><td>U<sub>máx</sub> (zona ${tmState.zona} — ${calc.umax.label})</td><td class="n">${calc.umax.valor != null ? tmFmt(calc.umax.valor, 2) + ' W/(m²·°C)' : '—'}</td>
            <td>Massa superficial útil</td><td class="n">${tmFmt(calc.massa, 1)} kg/m²</td></tr>
        <tr><td>Cumpre o requisito?</td><td class="n"><strong>${cumpre}</strong></td><td></td><td></td></tr>
      </table>
      <p class="txt">${calc.camadas.length ? tmTexto(s, calc) : ''}</p>
    </section>`;
  });

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
  <title>Soluções Construtivas${proj ? ' — ' + proj : ''}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Calibri, sans-serif; color: #1a1a1a; margin: 0; padding: 24px 34px; font-size: 12px; }
    header.doc { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1E8AFF; padding-bottom: 8px; margin-bottom: 6px; }
    header.doc .t1 { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
    header.doc .t1 span { color: #1E8AFF; }
    header.doc .t2 { font-size: 11px; color: #555; }
    .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
    section.sol { page-break-inside: avoid; margin-bottom: 26px; border: 1px solid #ccc; border-radius: 6px; padding: 14px 18px; }
    h2 { font-size: 14px; margin: 0 0 10px; color: #0a2a52; }
    .linha-fig { display: table; width: 100%; margin-bottom: 10px; }
    .fig { display: table-cell; width: 58%; vertical-align: top; padding-right: 16px; }
    .fig svg { width: 100%; height: auto; border: 1px solid #ddd; }
    .leg { display: table-cell; vertical-align: top; }
    .leg-t { font-size: 11px; font-weight: 600; color: #555; margin-bottom: 2px; }
    table.tab { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.tab th { text-align: left; font-size: 10px; color: #555; border-bottom: 1px solid #999; padding: 3px 6px; }
    table.tab td { padding: 3px 6px; border-bottom: 1px solid #e0e0e0; }
    table.res { width: 100%; border-collapse: collapse; margin-bottom: 8px; background: #f4f7fb; }
    table.res td { padding: 4px 8px; font-size: 11px; }
    td.n { font-family: Consolas, monospace; white-space: nowrap; }
    p.txt { font-size: 11px; line-height: 1.55; text-align: justify; background: #fafafa; border-left: 3px solid #1E8AFF; padding: 8px 12px; margin: 0; }
    svg, .fig, section.sol { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 0; } /* margem 0 = o browser não imprime URL/data/página */
    @media print { body { padding: 14mm 16mm; } section.sol { border-color: #bbb; } }
  </style></head><body>
  <header class="doc">
    <div class="t1">ALIOS <span>ONE</span> — Soluções Construtivas</div>
    <div class="t2">Portaria n.º 138-I/2021 · Zona climática ${tmState.zona} · ${tmState.tipoEd === 'hab' ? 'Habitação' : 'Comércio e serviços'}</div>
  </header>
  <div class="meta">${proj ? 'Projecto: <strong>' + proj + '</strong> · ' : ''}${new Date().toLocaleDateString('pt-PT')}</div>
  ${corpo}
  <script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('O browser bloqueou a janela. Permite pop-ups para imprimir.'); return; }
  w.document.write(html);
  w.document.close();
}

// ─── Registo da ferramenta ───
registerTool('termica', {
  icon: '🧱',
  name: 'Soluções Construtivas',
  desc: 'Envolvente opaca por camadas: U, verificação Umáx (Portaria 138-I/2021) e texto descritivo',
  launch: () => { modo = null; tmLoad(); tmShowLista(); },
});
