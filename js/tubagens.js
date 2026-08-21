// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Tubagens de água
// tubagens.js — Diâmetro, velocidade e perda de carga
// Materiais: ferro preto (DIN 2440/2448), multicamada,
// cobre EN 1057. (Solar: ferramenta própria, futura.)
// Física: Darcy-Weisbach + Swamee-Jain (Colebrook
// explícito); laminar f=64/Re. Propriedades da água
// por temperatura média da gama indicada.
// ═══════════════════════════════════════════════════

// ─── Tabelas de diâmetros (interior em mm) ───
const TUB_MATERIAIS = {
  aco: {
    nome: 'Ferro preto (DIN 2440)',
    rug: 0.045, // mm — aço comercial
    tubos: [
      { label: 'DN 15 (½")', di: 16.0 },
      { label: 'DN 20 (¾")', di: 21.6 },
      { label: 'DN 25 (1")', di: 27.2 },
      { label: 'DN 32 (1¼")', di: 35.9 },
      { label: 'DN 40 (1½")', di: 41.8 },
      { label: 'DN 50 (2")', di: 53.0 },
      { label: 'DN 65 (2½")', di: 68.8 },
      { label: 'DN 80 (3")', di: 80.8 },
      { label: 'DN 100 (4")', di: 105.3 },
      { label: 'DN 125 (5")', di: 130.0 },
      { label: 'DN 150 (6")', di: 155.4 },
      { label: 'DN 200 (DIN 2448)', di: 206.5 },
    ]
  },
  multi: {
    nome: 'Multicamada (PEX-AL-PEX)',
    rug: 0.007,
    tubos: [
      { label: '16×2', di: 12 },
      { label: '20×2', di: 16 },
      { label: '25×2,5', di: 20 },
      { label: '32×3', di: 26 },
      { label: '40×3,5', di: 33 },
      { label: '50×4', di: 42 },
      { label: '63×4,5', di: 54 },
      { label: '75×5', di: 65 },
    ]
  },
  cobre: {
    nome: 'Cobre (EN 1057)',
    rug: 0.0015,
    tubos: [
      { label: '12×1', di: 10 },
      { label: '15×1', di: 13 },
      { label: '18×1', di: 16 },
      { label: '22×1', di: 20 },
      { label: '28×1,5', di: 25 },
      { label: '35×1,5', di: 32 },
      { label: '42×1,5', di: 39 },
      { label: '54×2', di: 50 },
      { label: '76,1×2', di: 72.1 },
      { label: '88,9×2', di: 84.9 },
      { label: '108×2,5', di: 103 },
    ]
  }
};

// ─── Propriedades da água por temperatura (interpolação linear) ───
// t (°C) | rho (kg/m³) | mu (mPa·s)
const TUB_AGUA = [
  [5, 1000.0, 1.519], [10, 999.7, 1.307], [20, 998.2, 1.002],
  [30, 995.7, 0.798], [40, 992.2, 0.653], [50, 988.0, 0.547],
  [60, 983.2, 0.467], [70, 977.8, 0.404], [80, 971.8, 0.355],
];
const TUB_CP_AGUA = 4.19; // kJ/(kg·K)

function tubPropsAgua(t) {
  const T = TUB_AGUA;
  if (t <= T[0][0]) return { rho: T[0][1], mu: T[0][2] / 1000 };
  if (t >= T[T.length - 1][0]) { const u = T[T.length - 1]; return { rho: u[1], mu: u[2] / 1000 }; }
  for (let i = 0; i < T.length - 1; i++) {
    if (t >= T[i][0] && t <= T[i + 1][0]) {
      const f = (t - T[i][0]) / (T[i + 1][0] - T[i][0]);
      return {
        rho: T[i][1] + f * (T[i + 1][1] - T[i][1]),
        mu: (T[i][2] + f * (T[i + 1][2] - T[i][2])) / 1000
      };
    }
  }
  return { rho: 998, mu: 0.001 };
}

// ─── Regime: sempre definido pelo utilizador (ida/retorno) ───
// (solar térmico sai desta ferramenta — terá ferramenta própria,
// com cobre e água-glicol assumidos e as regras solares da casa)
const TUB_REGIMES = {}; // preenchido em runtime com a gama indicada

// ─── State ───
let estadoTub = {
  fase: 0, regime: null, material: null, modoCaudal: null,
  potencia: null, dT: null,
  caudal_m3h: null, criterio: null, unidade: 'mmca', alvo: null
};

// ─── Registo ───
registerTool('avac', {
  id: 'dim_tubagens',
  icon: '🚰',
  name: 'Tubagens de água',
  desc: 'Diâmetro, velocidade e perda de carga — ferro, multicamada, cobre',
  launch: iniciarTub
});

inputHandlers['tub'] = function(val) { enviarTub(val); };

// ═══ Fluxo ═══
function iniciarTub() {
  modo = 'tub';
  setupChat(); setProgress(10); setSub('AVAC — Tubagens de água');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarTub }]);
  estadoTub = { fase: 0, regime: null, material: null, modoCaudal: null, potencia: null, dT: null, caudal_m3h: null, criterio: null, unidade: 'mmca', alvo: null };
  estadoTub.fase = 7;
  addBot('Qual a <strong>gama de temperaturas</strong> do circuito? Indique <strong>ida/retorno</strong> em °C — ex: <strong>7/12</strong>, <strong>45/40</strong>, <strong>80/60</strong> — ou escolha AQS.');
  addPills([{ label: 'AQS 60 °C', action: tubEscolherAQS }]);
  enableInput('ida/retorno — ex: 7/12...');
}

function tubEscolherAQS() {
  disableInput();
  TUB_REGIMES.custom = { nome: 'AQS 60 °C', tMed: 60, dT: null, cp: TUB_CP_AGUA };
  estadoTub.fase = 0;
  tubEscolherRegime('custom');
}

function tubEscolherRegime(k) {
  estadoTub.regime = k;
  setProgress(25);
  addBot('Qual o <strong>material</strong> da tubagem?');
  addPills(Object.keys(TUB_MATERIAIS).map(m => ({ label: TUB_MATERIAIS[m].nome, action: () => tubEscolherMaterial(m) })));
}

function tubEscolherMaterial(m) {
  estadoTub.material = m;
  setProgress(40);
  const reg = TUB_REGIMES[estadoTub.regime];
  addBot('Como quer indicar o <strong>caudal</strong>?');
  const pills = [];
  if (reg.dT !== null) pills.push({ label: 'Potência térmica (kW)', action: () => tubModoCaudal('pot') });
  pills.push({ label: 'Caudal em m³/h', action: () => tubModoCaudal('m3h') });
  pills.push({ label: 'Caudal em l/s', action: () => tubModoCaudal('ls') });
  addPills(pills);
}

function tubModoCaudal(mc) {
  estadoTub.modoCaudal = mc;
  const reg = TUB_REGIMES[estadoTub.regime];
  if (mc === 'pot') {
    estadoTub.fase = 1;
    addBot(`Qual a <strong>potência</strong> em kW? <span style="font-size:11px;color:#5a7aaa;">(caudal calculado com o ΔT da gama: ${reg.dT} K)</span>`);
    enableInput('Potência em kW...');
  } else {
    estadoTub.fase = 5;
    addBot(`Qual o <strong>caudal</strong> em ${mc === 'm3h' ? 'm³/h' : 'l/s'}?`);
    enableInput(mc === 'm3h' ? 'Caudal em m³/h...' : 'Caudal em l/s...');
  }
}

function enviarTub(val) {
  disableInput();
  if (estadoTub.fase === 7) { // gama à medida "ida/retorno"
    const m = val.replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) { addUser(val); addBot('Formato inválido. Escreva ida/retorno, ex: <strong>60/40</strong>.'); enableInput(); return; }
    const tIda = parseFloat(m[1]), tRet = parseFloat(m[2]);
    const dT = Math.abs(tIda - tRet);
    if (dT === 0) { addUser(val); addBot('Ida e retorno iguais — ΔT zero não dá caudal. Verifique.'); enableInput(); return; }
    addUser(val);
    TUB_REGIMES.custom = { nome: `Água ${tIda}/${tRet} °C`, tMed: (tIda + tRet) / 2, dT, cp: TUB_CP_AGUA };
    estadoTub.fase = 0;
    tubEscolherRegime('custom');
    return;
  }
  const num = parseFloat(val.replace(',', '.'));
  if (isNaN(num) || num <= 0) { addUser(val); addBot('Valor inválido. Indique um número positivo.'); enableInput(); return; }
  addUser(val);
  const reg = TUB_REGIMES[estadoTub.regime];

  switch (estadoTub.fase) {
    case 1: { // potência → caudal (ΔT da gama)
      estadoTub.potencia = num;
      estadoTub.dT = reg.dT;
      const fl = tubFluido();
      const Q_m3s = estadoTub.potencia / (fl.rho * fl.cp * reg.dT); // kW / (kg/m³ · kJ/kgK · K) = m³/s
      estadoTub.caudal_m3h = Q_m3s * 3600;
      addBot(`Caudal calculado: <strong>${estadoTub.caudal_m3h.toFixed(2)} m³/h</strong> (${(Q_m3s * 1000).toFixed(2)} l/s)`);
      tubPedirCriterio();
      break;
    }
    case 5: // caudal directo
      estadoTub.caudal_m3h = estadoTub.modoCaudal === 'ls' ? num * 3.6 : num;
      tubPedirCriterio();
      break;
    case 6: // alvo do critério → calcular
      estadoTub.alvo = num;
      setProgress(100);
      {
        const res = calcularTub();
        projectLog.push({
          tool: 'dim_tubagens',
          input: { regime: estadoTub.regime, material: estadoTub.material, caudal_m3h: estadoTub.caudal_m3h, potencia: estadoTub.potencia, dT: estadoTub.dT, criterio: estadoTub.criterio, unidade: estadoTub.unidade, alvo: num },
          result: res, ts: new Date().toISOString()
        });
        saveProject();
        addResultTub(res);
        tubNavFinal();
      }
      break;
  }
}

function tubPedirCriterio() {
  estadoTub.fase = 0; setProgress(65);
  addBot('Qual o <strong>critério</strong> de dimensionamento?');
  addPills([
    { label: 'PED máx (mmca/m)', action: () => tubCriterio('ped', 'mmca') },
    { label: 'PED máx (Pa/m)', action: () => tubCriterio('ped', 'pa') },
    { label: 'Velocidade máx (m/s)', action: () => tubCriterio('vel', 'ms') }
  ]);
}

function tubCriterio(c, un) {
  estadoTub.criterio = c; estadoTub.unidade = un; estadoTub.fase = 6;
  const lbl = c === 'vel' ? 'velocidade máxima em m/s' : `perda de carga máxima em ${un === 'pa' ? 'Pa/m' : 'mmca/m'}`;
  const sug = c === 'vel' ? '(prática: 1,2 até DN50; 2,0 acima)' : (un === 'pa' ? '(prática: 250; nunca acima de 400)' : '(prática: 25; nunca acima de 40)');
  addBot(`Qual a <strong>${lbl}</strong>? <span style="font-size:11px;color:#5a7aaa;">${sug}</span>`);
  enableInput(c === 'vel' ? 'm/s...' : (un === 'pa' ? 'Pa/m...' : 'mmca/m...'));
}

// ═══ Física ═══
function tubFluido() {
  const reg = TUB_REGIMES[estadoTub.regime];
  const p = tubPropsAgua(reg.tMed);
  return { rho: p.rho, mu: p.mu, cp: reg.cp };
}

function tubCalcTubo(di_mm, Q_m3h, fl, rug_mm) {
  const D = di_mm / 1000, Q = Q_m3h / 3600;
  const A = Math.PI * D * D / 4;
  const v = Q / A;
  const Re = fl.rho * v * D / fl.mu;
  let f;
  if (Re < 2300) f = 64 / Re;
  else {
    const x = rug_mm / 1000 / (3.7 * D) + 5.74 / Math.pow(Re, 0.9);
    f = 0.25 / Math.pow(Math.log10(x), 2);
  }
  const dP = f * fl.rho * v * v / (2 * D); // Pa/m
  return { v, Re, dP_Pa: dP, dP_mmca: dP / 9.81 };
}

function calcularTub() {
  const mat = TUB_MATERIAIS[estadoTub.material];
  const fl = tubFluido();
  const alvoPa = estadoTub.criterio === 'ped'
    ? (estadoTub.unidade === 'pa' ? estadoTub.alvo : estadoTub.alvo * 9.81)
    : null;

  const linhas = mat.tubos.map(t => {
    const c = tubCalcTubo(t.di, estadoTub.caudal_m3h, fl, mat.rug);
    const cumpre = estadoTub.criterio === 'ped' ? c.dP_Pa <= alvoPa : c.v <= estadoTub.alvo;
    return { ...t, ...c, cumpre };
  });

  let idx = linhas.findIndex(l => l.cumpre);
  let foraGama = false;
  if (idx === -1) { idx = linhas.length - 1; foraGama = true; }

  // vizinhos: 2 abaixo + escolhido + 1 acima
  const ini = Math.max(0, idx - 2), fim = Math.min(linhas.length, idx + 2);
  return { escolhido: linhas[idx], idx, vizinhos: linhas.slice(ini, fim), foraGama, fl };
}

function addResultTub(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const mat = TUB_MATERIAIS[estadoTub.material];
  const reg = TUB_REGIMES[estadoTub.regime];
  const isPa = estadoTub.unidade === 'pa';
  const e = r.escolhido;

  let htmlAviso = '';
  if (r.foraGama) {
    htmlAviso = `<div class="rlabel" style="color:#ef4444;">⚠️ Nenhum diâmetro de ${mat.nome} cumpre o critério pedido para este caudal. Mostra-se o maior da tabela — considere outro material, dois ramais em paralelo, ou rever o critério.</div>`;
  }

  const pedPri = isPa || estadoTub.criterio === 'vel'
    ? `${e.dP_Pa.toFixed(1)} Pa/m` : `${e.dP_mmca.toFixed(2)} mmca/m`;
  const pedSec = isPa || estadoTub.criterio === 'vel'
    ? `${e.dP_mmca.toFixed(2)} mmca/m` : `${e.dP_Pa.toFixed(1)} Pa/m`;

  const htmlPrincipal = `
    <div class="rlabel">${mat.nome} · ${reg.nome}</div>
    <div class="metrics">
      <div class="mc"><div class="ml">Tubo</div><div class="mv">${e.label}</div><div class="mu">Øint ${e.di.toFixed(1)} mm</div></div>
      <div class="mc"><div class="ml">Velocidade</div><div class="mv">${e.v.toFixed(2)}</div><div class="mu">m/s</div></div>
      <div class="mc"><div class="ml">Perda linear</div><div class="mv">${pedPri}</div><div class="mu">${pedSec}</div></div>
      <div class="mc"><div class="ml">Caudal</div><div class="mv">${estadoTub.caudal_m3h.toFixed(2)}</div><div class="mu">m³/h (${(estadoTub.caudal_m3h / 3.6).toFixed(2)} l/s)</div></div>
    </div>`;

  let htmlViz = `<div class="rlabel">Diâmetros vizinhos</div>`;
  htmlViz += r.vizinhos.map(t => {
    const isEsc = t.label === e.label;
    let badgeClass, badgeLabel;
    if (isEsc && !r.foraGama) { badgeClass = 'bok'; badgeLabel = 'escolhido'; }
    else if (t.cumpre) { badgeClass = 'bok'; badgeLabel = 'cumpre'; }
    else { badgeClass = 'bbad'; badgeLabel = 'excede'; }
    return `<div class="rect-row"><div class="rdims">${t.label}</div><div class="rratio">Øint ${t.di.toFixed(1)} · v=${t.v.toFixed(2)} m/s · ${t.dP_mmca.toFixed(2)} mmca/m (${t.dP_Pa.toFixed(0)} Pa/m)</div><span class="badge ${badgeClass}">${badgeLabel}</span></div>`;
  }).join('');

  const htmlNota = `<div style="font-size:10px;color:#5a7aaa;margin-top:6px;">Darcy-Weisbach · Swamee-Jain · ρ=${r.fl.rho.toFixed(0)} kg/m³ · μ=${(r.fl.mu * 1000).toFixed(2)} mPa·s · Re=${Math.round(e.Re).toLocaleString('pt-PT')} · rugosidade ${mat.rug} mm</div>`;

  bubble.innerHTML = htmlAviso + htmlPrincipal + htmlViz + htmlNota;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function tubNavFinal() {
  setTimeout(() => {
    setProgress(40);
    addBot('Novo cálculo?');
    const pills = [
      { label: 'Sim, mesma gama e material', action: () => {
        const reg = TUB_REGIMES[estadoTub.regime];
        addBot('Como quer indicar o <strong>caudal</strong>?');
        const p2 = [];
        if (reg.dT !== null) p2.push({ label: 'Potência térmica (kW)', action: () => tubModoCaudal('pot') });
        p2.push({ label: 'Caudal em m³/h', action: () => tubModoCaudal('m3h') });
        p2.push({ label: 'Caudal em l/s', action: () => tubModoCaudal('ls') });
        addPills(p2);
      }},
      { label: 'Mudar material', action: () => tubEscolherRegime(estadoTub.regime) },
      { label: 'Mudar gama', action: iniciarTub },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
    ];
    if (currentProject) {
      if (projectLog.some(l => l.incluirRelatorio)) {
        pills.unshift({ label: '📊 Exportar Excel', action: exportarExcel });
      }
      pills.unshift({ label: '📄 Juntar ao relatório', action: () => { juntarAoRelatorio(); } });
    }
    addPills(pills);
  }, 400);
}
