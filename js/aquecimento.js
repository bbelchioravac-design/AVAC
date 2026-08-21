// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Potência de aquecimento
// aquecimento.js — Aquecer um volume de água em X tempo
//   Energia = V·ρ·cp·ΔT  →  P = Energia / tempo
// Dois modos: potência necessária (dado o tempo) ou
// tempo de aquecimento (dada a potência da máquina).
// Sem perdas do depósito — juntar margem prática.
// ═══════════════════════════════════════════════════

const AQC_CP = 4.19;   // kJ/(kg·K)
const AQC_RHO = 992;   // kg/m³ (média da gama típica 10→60 °C)

// ─── State ───
let estadoAqc = { fase: 0, modoAqc: null, volume: null, tIni: null, tFim: null, valor: null };

// ─── Registo ───
registerTool('avac', {
  id: 'pot_aquecimento',
  icon: '♨️',
  name: 'Potência de aquecimento',
  desc: 'Aquecer um volume de água em X tempo — BC, resistências, AQS',
  launch: iniciarAqc
});

inputHandlers['aqc'] = function(val) { enviarAqc(val); };

// ═══ Fluxo ═══
function iniciarAqc() {
  modo = 'aqc';
  setupChat(); setProgress(10); setSub('AVAC — Potência de aquecimento');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarAqc }]);
  estadoAqc = { fase: 0, modoAqc: null, volume: null, tIni: null, tFim: null, valor: null };
  addBot('O que quer calcular?');
  addPills([
    { label: 'Potência necessária (sei o tempo)', action: () => aqcModo('pot') },
    { label: 'Tempo de aquecimento (sei a potência)', action: () => aqcModo('tempo') }
  ]);
}

function aqcModo(m) {
  estadoAqc.modoAqc = m;
  estadoAqc.fase = 1; setProgress(30);
  addBot('Qual o <strong>volume de água</strong> em litros?');
  enableInput('Volume em litros — ex: 300...');
}

function enviarAqc(val) {
  const num = parseFloat(val.replace(',', '.')); disableInput();
  if (isNaN(num)) { addUser(val); addBot('Valor inválido. Indique um número.'); enableInput(); return; }
  addUser(val);

  switch (estadoAqc.fase) {
    case 1: // volume
      if (num <= 0) { addBot('O volume tem de ser positivo.'); enableInput(); return; }
      estadoAqc.volume = num;
      estadoAqc.fase = 2; setProgress(45);
      addBot('Qual a <strong>temperatura inicial</strong> da água em °C? <span style="font-size:11px;color:#5a7aaa;">(água da rede: 10–15 °C)</span>');
      enableInput('T inicial em °C — ex: 10...');
      break;
    case 2: // T inicial
      estadoAqc.tIni = num;
      estadoAqc.fase = 3; setProgress(60);
      addBot('Qual a <strong>temperatura final</strong> pretendida em °C?');
      enableInput('T final em °C — ex: 55...');
      break;
    case 3: // T final
      if (num <= estadoAqc.tIni) { addBot(`A temperatura final tem de ser superior à inicial (${estadoAqc.tIni} °C).`); enableInput(); return; }
      estadoAqc.tFim = num;
      estadoAqc.fase = 4; setProgress(80);
      if (estadoAqc.modoAqc === 'pot') {
        addBot('Em quanto <strong>tempo</strong> quer aquecer, em horas? <span style="font-size:11px;color:#5a7aaa;">(aceita decimais: 1,5 = 1h30)</span>');
        enableInput('Tempo em horas — ex: 2...');
      } else {
        addBot('Qual a <strong>potência</strong> disponível em kW? <span style="font-size:11px;color:#5a7aaa;">(BC: potência TÉRMICA, não eléctrica)</span>');
        enableInput('Potência em kW...');
      }
      break;
    case 4: { // tempo ou potência → calcular
      if (num <= 0) { addBot('O valor tem de ser positivo.'); enableInput(); return; }
      estadoAqc.valor = num;
      setProgress(100);
      const res = calcularAqc();
      projectLog.push({
        tool: 'pot_aquecimento',
        input: { modo: estadoAqc.modoAqc, volume: estadoAqc.volume, tIni: estadoAqc.tIni, tFim: estadoAqc.tFim, valor: num },
        result: res, ts: new Date().toISOString()
      });
      saveProject();
      addResultAqc(res);
      aqcNavFinal();
      break;
    }
  }
}

// ═══ Cálculo ═══
function calcularAqc() {
  const dT = estadoAqc.tFim - estadoAqc.tIni;
  const massa = estadoAqc.volume / 1000 * AQC_RHO;       // kg
  const energia_kWh = massa * AQC_CP * dT / 3600;         // kJ → kWh
  let potencia, tempo_h;
  if (estadoAqc.modoAqc === 'pot') {
    tempo_h = estadoAqc.valor;
    potencia = energia_kWh / tempo_h;
  } else {
    potencia = estadoAqc.valor;
    tempo_h = energia_kWh / potencia;
  }
  return { dT, energia_kWh, potencia, tempo_h };
}

function aqcFormatTempo(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) return `${hh + 1}h00`;
  return `${hh}h${String(mm).padStart(2, '0')}`;
}

function addResultAqc(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const isPot = estadoAqc.modoAqc === 'pot';

  const html = `
    <div class="rlabel">${estadoAqc.volume} l · ${estadoAqc.tIni} → ${estadoAqc.tFim} °C (ΔT = ${r.dT} K)</div>
    <div class="metrics">
      <div class="mc"><div class="ml">${isPot ? 'Potência necessária' : 'Tempo de aquecimento'}</div><div class="mv">${isPot ? r.potencia.toFixed(1) : aqcFormatTempo(r.tempo_h)}</div><div class="mu">${isPot ? 'kW (térmicos)' : `(${r.tempo_h.toFixed(2)} h)`}</div></div>
      <div class="mc"><div class="ml">Energia</div><div class="mv">${r.energia_kWh.toFixed(1)}</div><div class="mu">kWh</div></div>
      <div class="mc"><div class="ml">${isPot ? 'Tempo' : 'Potência'}</div><div class="mv">${isPot ? aqcFormatTempo(r.tempo_h) : r.potencia.toFixed(1)}</div><div class="mu">${isPot ? '' : 'kW (térmicos)'}</div></div>
    </div>
    <div style="font-size:10px;color:#5a7aaa;margin-top:6px;">E = V·ρ·cp·ΔT (ρ=${AQC_RHO} kg/m³ · cp=${AQC_CP} kJ/kg·K) · sem perdas do depósito nem degradação da BC a alta temperatura — juntar margem prática de 10–20 %. BC: usar a potência térmica à temperatura de trabalho (a do catálogo a A7/W35 é maior do que a W55 real).</div>`;

  bubble.innerHTML = html;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function aqcNavFinal() {
  setTimeout(() => {
    setProgress(30);
    addBot('Novo cálculo?');
    const pills = [
      { label: 'Sim', action: () => aqcModo(estadoAqc.modoAqc) },
      { label: 'Mudar modo', action: iniciarAqc },
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
