// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Vasos de expansão
// vasos.js — Vaso de expansão fechado de membrana
// Método clássico (folha de fabricante ~1999, validado)
// = EN 12828, com reserva de água e margens modernas:
//   ΔV = Va · e(Tmáx)
//   Vn = (ΔV + Vreserva) · (Pf+1)/(Pf−Pi)
//   Pi = estática + 0,3 bar · Pf = Pvs − 0,5 bar
// Arrefecida: dimensiona-se à temperatura de paragem
// no verão (40 °C), não à de funcionamento.
// ═══════════════════════════════════════════════════

// ─── Densidade da água (kg/m³) — expansão desde 10 °C ───
const VAS_RHO = [
  [10, 999.7], [20, 998.2], [30, 995.7], [40, 992.2],
  [50, 988.0], [60, 983.2], [70, 977.8], [80, 971.8],
  [90, 965.3], [100, 958.4], [110, 950.6],
];

function vasCoefExp(tMax) {
  const T = VAS_RHO;
  let rho;
  if (tMax <= T[0][0]) rho = T[0][1];
  else if (tMax >= T[T.length - 1][0]) rho = T[T.length - 1][1];
  else {
    for (let i = 0; i < T.length - 1; i++) {
      if (tMax >= T[i][0] && tMax <= T[i + 1][0]) {
        const f = (tMax - T[i][0]) / (T[i + 1][0] - T[i][0]);
        rho = T[i][1] + f * (T[i + 1][1] - T[i][1]);
        break;
      }
    }
  }
  return 999.7 / rho - 1; // expansão volumétrica desde 10 °C (enchimento)
}

// ─── Tipos de sistema: l/kW de estimativa + T máx sugerida ───
const VAS_TIPOS = {
  radiadores: { nome: 'Aquecimento — radiadores', lkw: 11, tSug: 80 },
  pavimento:  { nome: 'Aquecimento — pavimento radiante', lkw: 18, tSug: 45 },
  fcu:        { nome: 'FCUs / ventiloconvectores', lkw: 8, tSug: 45 },
  uta:        { nome: 'Baterias de UTA', lkw: 5, tSug: 45 },
  arrefecida: { nome: 'Água arrefecida', lkw: 8, tSug: 40 },
};

// ─── Calibres comerciais de válvulas de segurança (bar) ───
const VAS_VALVULAS = [3, 4, 6, 8, 10];
function vasSugerirValvula(alturaM, margem) {
  const alvo = alturaM / 10 + margem;
  return VAS_VALVULAS.find(v => v >= alvo) || VAS_VALVULAS[VAS_VALVULAS.length - 1];
}

// ─── Volumes comerciais (l) ───
const VAS_COMERCIAIS = [8, 12, 18, 24, 35, 50, 80, 105, 150, 200, 300, 400, 500, 600, 800, 1000];

// ─── Regras da casa ───
const VAS_MARGEM_PI = 0.3;  // bar acima da estática
const VAS_MARGEM_PF = 0.5;  // bar abaixo da válvula de segurança
const VAS_RESERVA_PCT = 0.005; // 0,5 % do volume da instalação
const VAS_RESERVA_MIN = 3;  // l

// ─── State ───
let estadoVas = { fase: 0, tipo: null, va: null, potencia: null, tMax: null, altura: null, pvs: null };

// ─── Registo ───
registerTool('avac', {
  id: 'vaso_expansao',
  icon: '🛢️',
  name: 'Vaso de expansão',
  desc: 'Vaso fechado de membrana — EN 12828 / método clássico',
  launch: iniciarVas
});

inputHandlers['vas'] = function(val) { enviarVas(val); };

// ═══ Fluxo ═══
function iniciarVas() {
  modo = 'vas';
  setupChat(); setProgress(10); setSub('AVAC — Vaso de expansão');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarVas }]);
  estadoVas = { fase: 0, tipo: null, va: null, potencia: null, tMax: null, altura: null, pvs: null };
  addBot('Qual o <strong>tipo de sistema</strong>?');
  addPills(Object.keys(VAS_TIPOS).map(k => ({ label: VAS_TIPOS[k].nome, action: () => vasEscolherTipo(k) })));
}

function vasEscolherTipo(k) {
  estadoVas.tipo = k;
  setProgress(25);
  addBot('Sabe o <strong>conteúdo de água</strong> da instalação?');
  addPills([
    { label: 'Sim, sei o volume (L)', action: () => vasModoVolume('vol') },
    { label: `Estimar pela potência (${VAS_TIPOS[k].lkw} l/kW)`, action: () => vasModoVolume('pot') }
  ]);
}

function vasModoVolume(m) {
  if (m === 'vol') {
    estadoVas.fase = 1;
    addBot('Qual o <strong>volume de água</strong> da instalação em litros?');
    enableInput('Volume em litros...');
  } else {
    estadoVas.fase = 2;
    addBot(`Qual a <strong>potência</strong> do sistema em kW? <span style="font-size:11px;color:#5a7aaa;">(estimativa: ${VAS_TIPOS[estadoVas.tipo].lkw} l/kW — ${VAS_TIPOS[estadoVas.tipo].nome.toLowerCase()})</span>`);
    enableInput('Potência em kW...');
  }
}

function enviarVas(val) {
  const num = parseFloat(val.replace(',', '.')); disableInput();
  if (isNaN(num) || num <= 0) { addUser(val); addBot('Valor inválido. Indique um número positivo.'); enableInput(); return; }
  addUser(val);
  const tipo = VAS_TIPOS[estadoVas.tipo];

  switch (estadoVas.fase) {
    case 1: // volume conhecido
      estadoVas.va = num;
      vasPedirTMax();
      break;
    case 2: // potência → volume estimado
      estadoVas.potencia = num;
      estadoVas.va = num * tipo.lkw;
      addBot(`Volume estimado: <strong>${Math.round(estadoVas.va)} litros</strong> (${num} kW × ${tipo.lkw} l/kW)`);
      vasPedirTMax();
      break;
    case 3: // T máx
      estadoVas.tMax = num;
      estadoVas.fase = 4; setProgress(60);
      addBot('Qual a <strong>altura estática</strong> da instalação em metros? <span style="font-size:11px;color:#5a7aaa;">(do vaso ao ponto mais alto do circuito)</span>');
      enableInput('Altura em metros...');
      break;
    case 4: // altura
      estadoVas.altura = num;
      estadoVas.fase = 5; setProgress(80);
      {
        const sugMin = vasSugerirValvula(num, 1.5);
        const sugConf = vasSugerirValvula(num, 2.0);
        const sugTxt = sugMin === sugConf ? `sugestão: ${sugMin} bar` : `sugestão: ${sugMin} bar (mín) a ${sugConf} bar (confortável)`;
        addBot(`Qual a pressão da <strong>válvula de segurança</strong> em bar? <span style="font-size:11px;color:#5a7aaa;">(regra: estática + 1,5 a 2 bar → ${sugTxt}. Confirme o limite do equipamento mais fraco — caldeiras murais são 3 bar máx)</span>`);
        enableInput(`Pressão em bar — ex: ${sugMin}...`);
      }
      break;
    case 5: { // Pvs → calcular
      estadoVas.pvs = num;
      setProgress(100);
      const res = calcularVas();
      projectLog.push({
        tool: 'vaso_expansao',
        input: { tipo: estadoVas.tipo, va: estadoVas.va, potencia: estadoVas.potencia, tMax: estadoVas.tMax, altura: estadoVas.altura, pvs: estadoVas.pvs },
        result: res, ts: new Date().toISOString()
      });
      saveProject();
      addResultVas(res);
      vasNavFinal();
      break;
    }
  }
}

function vasPedirTMax() {
  const tipo = VAS_TIPOS[estadoVas.tipo];
  estadoVas.fase = 3; setProgress(45);
  const nota = estadoVas.tipo === 'arrefecida'
    ? `(instalação parada no verão: ${tipo.tSug} °C — o vaso da arrefecida dimensiona-se à paragem, não ao funcionamento)`
    : `(sugestão para ${tipo.nome.toLowerCase()}: ${tipo.tSug} °C)`;
  addBot(`Qual a <strong>temperatura máxima</strong> que a água pode atingir, em °C? <span style="font-size:11px;color:#5a7aaa;">${nota}</span>`);
  enableInput(`T máx em °C — ex: ${tipo.tSug}...`);
}

// ═══ Cálculo ═══
function calcularVas() {
  const e = vasCoefExp(estadoVas.tMax);
  const dV = estadoVas.va * e;
  const vReserva = Math.max(estadoVas.va * VAS_RESERVA_PCT, VAS_RESERVA_MIN);
  const pi = estadoVas.altura / 10 + VAS_MARGEM_PI; // bar (rel.)
  const pf = estadoVas.pvs - VAS_MARGEM_PF;          // bar (rel.)
  const invalido = pf <= pi;
  let rendimento = null, vn = null, comercial = null, foraGama = false;
  if (!invalido) {
    rendimento = (pf - pi) / (pf + 1); // = (Pabs.f − Pabs.i)/Pabs.f
    vn = (dV + vReserva) / rendimento;
    comercial = VAS_COMERCIAIS.find(v => v >= vn);
    if (!comercial) { comercial = VAS_COMERCIAIS[VAS_COMERCIAIS.length - 1]; foraGama = true; }
  }
  return { e, dV, vReserva, pi, pf, rendimento, vn, comercial, invalido, foraGama };
}

function addResultVas(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const tipo = VAS_TIPOS[estadoVas.tipo];

  let html = '';
  if (r.invalido) {
    html = `<div class="rlabel" style="color:#ef4444;">⚠️ Pressão final (${r.pf.toFixed(1)} bar = válvula ${estadoVas.pvs} − ${VAS_MARGEM_PF}) não fica acima da pré-carga (${r.pi.toFixed(1)} bar = estática ${(estadoVas.altura / 10).toFixed(1)} + ${VAS_MARGEM_PI}). A válvula de segurança é baixa demais para esta altura estática — suba a válvula ou reveja a instalação.</div>`;
  } else {
    html = `
      <div class="rlabel">${tipo.nome} · ${estadoVas.tMax} °C · Va = ${Math.round(estadoVas.va)} l</div>
      <div class="metrics">
        <div class="mc"><div class="ml">Vaso comercial</div><div class="mv">${r.comercial}</div><div class="mu">litros (calc: ${r.vn.toFixed(1)} l)</div></div>
        <div class="mc"><div class="ml">Expansão ΔV</div><div class="mv">${r.dV.toFixed(1)}</div><div class="mu">l (e = ${(r.e * 100).toFixed(2)} %)</div></div>
        <div class="mc"><div class="ml">Reserva</div><div class="mv">${r.vReserva.toFixed(1)}</div><div class="mu">l (0,5 % · mín 3)</div></div>
        <div class="mc"><div class="ml">Rendimento</div><div class="mv">${(r.rendimento * 100).toFixed(0)} %</div><div class="mu">Pi ${r.pi.toFixed(1)} · Pf ${r.pf.toFixed(1)} bar</div></div>
      </div>`;
    if (r.rendimento < 0.15) {
      const sug = vasSugerirValvula(estadoVas.altura, 2.0);
      html += `<div class="rlabel" style="color:#f59e0b;">⚠️ Rendimento muito baixo (${(r.rendimento * 100).toFixed(0)} %) — a válvula de ${estadoVas.pvs} bar está encostada à estática de ${(estadoVas.altura / 10).toFixed(1)} bar e o vaso sai inflacionado. Com válvula de ${sug} bar o vaso encolhe drasticamente (se os equipamentos aguentarem; senão, separar o circuito com permutador).</div>`;
    }
    if (r.foraGama) {
      html += `<div class="rlabel" style="color:#f59e0b;">⚠️ Cálculo pede ${r.vn.toFixed(0)} l — acima do maior da tabela. Considere dois vasos em paralelo.</div>`;
    }
    html += `<div style="font-size:10px;color:#5a7aaa;margin-top:6px;">Vn = (ΔV + reserva) × (Pf+1)/(Pf−Pi) · EN 12828 · expansão desde 10 °C · pré-carga = estática + ${VAS_MARGEM_PI} bar · Pf = válvula − ${VAS_MARGEM_PF} bar. Afinar a pré-carga do vaso em obra para ${r.pi.toFixed(1)} bar (vaso isolado, circuito frio).</div>`;
  }

  bubble.innerHTML = html;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function vasNavFinal() {
  setTimeout(() => {
    setProgress(40);
    addBot('Novo cálculo?');
    const pills = [
      { label: 'Sim, mesmo tipo de sistema', action: () => vasEscolherTipo(estadoVas.tipo) },
      { label: 'Mudar tipo', action: iniciarVas },
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
