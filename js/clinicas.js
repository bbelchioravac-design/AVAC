// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Ar novo em CLÍNICAS
// clinicas.js — Balanço aerólico (insuflação / extracção
// limpos / extracção sujos) com requisitos das Portarias
// de licenciamento de unidades de saúde (redacção em
// vigor, Out-2025) intersectados com a Portaria 138-I/2021
// (regra do MAIOR requisito).
//
// Regimes:
//  '92'  — Portaria 92/2024 (328/2025) — clínicas médicas
//          (dentárias e veterinárias por ANALOGIA — critério
//          do projectista, a lei remete para o regime geral)
//  '88'  — Portaria 88/2024 (326/2025) — fisioterapia/MFR
//  '97'  — Portaria 97/2024 (330/2025) — cirurgia ambulatório
//
// Critérios do projectista (documentados no anexo):
//  - eficácia de ventilação: 0.8 (editável)
//  - sobrepressão por espaço: extracção ≈ 90% da insuflação
//  - sobrepressão global: Σinsuflação ≥ 1.1 × Σextracção,
//    diferença insuflada em corredor (make-up)
// ═══════════════════════════════════════════════════

// ─── Catálogo de espaços ───
// arNovo.t: 'p'=m³/h.pessoa | 'm2'=m³/h.m² | 'renh'=ren/h |
//           'fixo'=m³/h | 'geral'=só 138-I | 'is'=Tabela 13 |
//           'p_ou_renh'=maior dos dois
// press: 'sobre' | 'sub' | 'eq'
// rede: coluna de extracção por defeito ('limpos'|'sujos')
// soExtr: espaço só com extracção (sem insuflação própria)
const CL_COMUNS = [
  { id: 'gabinete', nome: 'Gabinete de consulta', arNovo: { t: 'p', v: 35 }, fonte: 'Prática da casa (mín. legal: 138-I, 24 m³/h·p)', press: 'sobre', rede: 'limpos' },
  { id: 'espera', nome: 'Sala de espera / recepção', arNovo: { t: 'p', v: 20 }, fonte: '138-I Tab.11 (Descanso)', press: 'sobre', rede: 'limpos', atv: 1 },
  { id: 'tratamentos', nome: 'Sala de observações/tratamentos', arNovo: { t: 'geral' }, fonte: 'Portaria: legislação em vigor; SUBPRESSÃO + extracção forçada', press: 'sub', rede: 'sujos' },
  { id: 'is_priv_cont', nome: 'IS privada (extracção contínua)', arNovo: { t: 'is', modo: 'priv_cont' }, fonte: '138-I Tab.13: Máx(45; 10×Área)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'is_priv', nome: 'IS privada (não contínua)', arNovo: { t: 'is', modo: 'priv' }, fonte: '138-I Tab.13: Máx(90; 10×Área)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'is_pub', nome: 'IS pública / balneário (normal)', arNovo: { t: 'is', modo: 'pub' }, fonte: '138-I Tab.13: Máx(90×equip.; 10×Área)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'is_pub_int', nome: 'IS pública (func. intensivo)', arNovo: { t: 'is', modo: 'pub_int' }, fonte: '138-I Tab.13: Máx(125×equip.; 10×Área)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'sujos', nome: 'Sala de sujos e despejos', arNovo: { t: 'renh', v: 10 }, fonte: 'Portaria: extracção 10 ren/h, rede de sujos independente', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'corredor', nome: 'Corredor / circulação (make-up)', arNovo: { t: 'geral' }, fonte: 'Make-up de ar para equilíbrio global', press: 'sobre', rede: 'limpos', makeup: true },
  { id: 'copa', nome: 'Copa', arNovo: { t: 'renh', v: 10 }, fonte: 'ET 06/2008 (ACSS): 10 Ren/h — referência técnica adoptada pelo projectista', press: 'sub', rede: 'sujos' },
  { id: 'cozinha', nome: 'Cozinha (confeção própria)', arNovo: { t: 'renh', v: 12 }, fonte: 'ET 06/2008 (ACSS): 12 Ren/h + apanha-fumos c/ extracção privativa (Port. 97/2024)', press: 'sub', rede: 'sujos', aviso: '⚠️ Com confeção própria, a Portaria 97/2024 exige apanha-fumos com sistema PRIVATIVO de extracção — a hotte é rede própria, fora deste balanço.' },
  { id: 'vestiario', nome: 'Vestiário de pessoal', arNovo: { t: 'm2', v: 10 }, fonte: 'ET 06/2008 (ACSS): 10 m³/h·m² — se tiver duches, verificar também 138-I Tab.13 (IS pública)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'lavandaria', nome: 'Lavandaria', arNovo: { t: 'renh', v: 15 }, fonte: 'ET 06/2008 (ACSS): 15 Ren/h', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'zona_tecnica', nome: 'Zona técnica / central térmica', arNovo: { t: 'renh', v: 8 }, fonte: 'ET 06/2008 (ACSS): centrais técnicas 6-8 Ren/h (adopta-se 8)', press: 'eq', rede: 'limpos', soExtr: true },
  { id: 'pt', nome: 'Posto de transformação', arNovo: { t: 'renh', v: 5 }, fonte: 'ET 06/2008 (ACSS): 5 Ren/h', press: 'eq', rede: 'limpos', soExtr: true },
  { id: 'elevadores', nome: 'Casa de máquinas (elevadores)', arNovo: { t: 'renh', v: 12 }, fonte: 'ET 06/2008 (ACSS): 12 Ren/h', press: 'eq', rede: 'limpos', soExtr: true },
  { id: 'arquivo', nome: 'Arquivo / arrumos / armazém', arNovo: { t: 'renh', v: 2 }, fonte: 'Por analogia: armazém 2 ren/h (Port. 97/2024)', press: 'eq', rede: 'limpos' },
];

const CL_92 = [
  { id: 'endoscopia92', nome: 'Sala de exames endoscópicos', arNovo: { t: 'm2', v: 100 }, fonte: 'Port. 328/2025: 100 m³/h·m² — H13 terminal, UTA privativa, 6 Rec/h', press: 'sobre', rede: 'limpos', aviso: '⚠️ A 328/2025 diz 100 m³/h·m² mas a versão 2024 dizia 100 m³/h·PESSOA e a Portaria 97/2024 (endoscopia) mantém m³/h·pessoa — suspeita de gralha do DR. O valor por m² é o texto EM VIGOR (e o mais exigente). Decisão do projectista.' },
  { id: 'recuperacao92', nome: 'Sala de preparação/recuperação', arNovo: { t: 'm2', v: 35 }, fonte: 'Port. 328/2025: 35 m³/h·m²', press: 'sobre', rede: 'limpos', aviso: '⚠️ Mesma dúvida de unidade (pessoa vs m²) da endoscopia.' },
  { id: 'reproc_limpa92', nome: 'Reprocessamento — zona limpa', arNovo: { t: 'renh', v: 10 }, fonte: 'Port. 328/2025: 10 ren/h (se esterilização/desinf. de alto nível)', press: 'sobre', rede: 'limpos' },
  { id: 'reproc_suja92', nome: 'Reprocessamento — descontaminação', arNovo: { t: 'renh', v: 10 }, fonte: 'Port. 328/2025: 10 ren/h, SUBPRESSÃO', press: 'sub', rede: 'sujos' },
  { id: 'peq_cirurgia92', nome: 'Sala de pequena cirurgia', arNovo: { t: 'p_ou_renh', v: 100, v2: 5 }, fonte: 'Port. 328/2025: 100 m³/h·pessoa ou 5 Ren/h (maior) — H13, vapor, 20 Rec/h', press: 'sobre', rede: 'limpos', pa: '15 ± 5 Pa' },
  { id: 'prova_esforco92', nome: 'Sala de prova de esforço', arNovo: { t: 'renh', v: 2 }, fonte: 'Port. 328/2025: 2 ren/h, equilíbrio', press: 'eq', rede: 'limpos' },
];

const CL_88 = [
  { id: 'proteses88', nome: 'Sala de provas de próteses', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa, extracção forçada', press: 'eq', rede: 'sujos' },
  { id: 'trat88', nome: 'Sala de tratamentos (fisio/TF/TO/electro)', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa, SUBPRESSÃO', press: 'sub', rede: 'sujos' },
  { id: 'aerossois88', nome: 'Sala de tratamentos com aerossóis', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa, extracção forçada', press: 'sub', rede: 'sujos' },
  { id: 'box88', nome: 'Box de tratamento / gabinete de consulta', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa, SUBPRESSÃO, extracção forçada', press: 'sub', rede: 'sujos' },
  { id: 'ginasio88', nome: 'Ginásio terapêutico / exercício clínico', arNovo: { t: 'm2', v: 15 }, fonte: 'Port. 326/2025: 15 m³/h·m², SUBPRESSÃO', press: 'sub', rede: 'sujos' },
  { id: 'cinesi88', nome: 'Cinesiterapia / terapia da fala', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa', press: 'eq', rede: 'sujos' },
  { id: 'parafina88', nome: 'Parafina, parafango, calor húmido (inaloterapia)', arNovo: { t: 'm2', v: 15 }, fonte: 'Port. 326/2025: 15 m³/h·m², SUBPRESSÃO, extracção forçada', press: 'sub', rede: 'sujos' },
  { id: 'piscina88', nome: 'Hidroterapia — piscina / tanque de marcha', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa — desumidificação c/ reaquecimento, 30-32°C, 60% HR', press: 'sub', rede: 'sujos', aviso: '⚠️ Hidroterapia exige desumidificação com bateria de reaquecimento e 60% HR todo o ano — o caudal aqui é só o AR NOVO; o dimensionamento da desumidificação é cálculo próprio.' },
  { id: 'repouso88', nome: 'Hidroterapia — sala de repouso', arNovo: { t: 'p', v: 30 }, fonte: 'Port. 326/2025: 30 m³/h·pessoa', press: 'eq', rede: 'limpos' },
];

const CL_97 = [
  { id: 'trat97', nome: 'Sala de observação/tratamentos (SAP)', arNovo: { t: 'geral' }, fonte: 'Port. 330/2025: legislação em vigor; SUBPRESSÃO + extr. forçada', press: 'sub', rede: 'sujos' },
  { id: 'inalo97', nome: 'Zona de inaloterapia', arNovo: { t: 'geral' }, fonte: 'Port. 330/2025: legislação em vigor; extr. forçada', press: 'eq', rede: 'sujos' },
  { id: 'recupSAP97', nome: 'Sala de observação/recuperação (SAP)', arNovo: { t: 'geral' }, fonte: 'Port. 330/2025: legislação em vigor', press: 'eq', rede: 'limpos' },
  { id: 'prova97', nome: 'Sala de prova de esforço', arNovo: { t: 'renh', v: 4 }, fonte: 'Port. 330/2025: 4 ren/h, SUBPRESSÃO', press: 'sub', rede: 'sujos' },
  { id: 'peq_cirurgia97', nome: 'Sala de pequena cirurgia', arNovo: { t: 'p_ou_renh', v: 100, v2: 5 }, fonte: 'Port. 330/2025: 100 m³/h·pessoa ou 5 Ren/h (maior) — H13, vapor, 20 rec/h', press: 'sobre', rede: 'limpos', pa: '15 ± 5 Pa' },
  { id: 'endoscopia97', nome: 'Sala de exames endoscópicos', arNovo: { t: 'p', v: 100 }, fonte: 'Port. 330/2025: 100 m³/h·pessoa — H13, UTA privativa, 6 rec/h', press: 'sobre', rede: 'limpos' },
  { id: 'prep_endo97', nome: 'Preparação/recuperação (endoscopia)', arNovo: { t: 'm2', v: 35 }, fonte: 'Port. 330/2025: 35 m³/h·m²', press: 'sobre', rede: 'limpos' },
  { id: 'reproc_desc97', nome: 'Reprocessamento — descontaminação', arNovo: { t: 'renh', v: 10 }, fonte: 'Port. 330/2025: 10 ren/h, SUBPRESSÃO', press: 'sub', rede: 'sujos' },
  { id: 'reproc_limpa97', nome: 'Reprocessamento — sala limpa', arNovo: { t: 'renh', v: 10 }, fonte: 'Port. 330/2025: 10 ren/h, sobrepressão', press: 'sobre', rede: 'limpos' },
  { id: 'bo_a97', nome: 'Sala de operações — classe A', arNovo: { t: 'fixo', v: 600 }, fonte: 'Port. 330/2025: mín. 600 m³/h — H14 terminal, vapor, 20 rec/h, cascata', press: 'sobre', rede: 'limpos', pa: '15 Pa (cascata, nota 5)' },
  { id: 'bo_bc97', nome: 'Sala de operações — classe B/C', arNovo: { t: 'fixo', v: 800 }, fonte: 'Port. 165/2025: mín. 800 m³/h — H14, vapor, 20 rec/h', press: 'sobre', rede: 'limpos', pa: '15 Pa (cascata)', aviso: '⚠️ A alteração de Abr-2025 subiu o ar novo da classe B/C de 50 m³/h·pessoa para 800 m³/h fixos. UTAs dimensionadas pela versão 2024 podem estar curtas.' },
  { id: 'ucpa97', nome: 'UCPA / sala de recuperação (integrada)', arNovo: { t: 'p', v: 50 }, fonte: 'Port. 330/2025: 50 m³/h·pessoa — H13, vapor, 10 rec/h', press: 'sobre', rede: 'limpos' },
  { id: 'urdmum_desc97', nome: 'URDMUM — descontaminação', arNovo: { t: 'renh', v: 8 }, fonte: 'Port. 330/2025: 8 ren/h, SUBPRESSÃO, SEM recirculação', press: 'sub', rede: 'sujos' },
  { id: 'urdmum_limpa97', nome: 'URDMUM — áreas limpas', arNovo: { t: 'm2', v: 10 }, fonte: 'Port. 330/2025: 10 m³/h·m², sobrepressão, H13, 8 rec/h', press: 'sobre', rede: 'limpos' },
  { id: 'autoclave97', nome: 'Autoclave óxido de etileno (extracção)', arNovo: { t: 'renh', v: 15 }, fonte: 'Port. 330/2025: extr. forçada 10-15 ren/h antideflagrante (adopta-se 15)', press: 'sub', rede: 'sujos', soExtr: true },
  { id: 'farmacia97', nome: 'Farmácia / armazém geral', arNovo: { t: 'renh', v: 2 }, fonte: 'Port. 330/2025: 2 ren/h', press: 'eq', rede: 'limpos' },
  { id: 'inflamaveis97', nome: 'Compartimento de inflamáveis (extracção)', arNovo: { t: 'renh', v: 15 }, fonte: 'Port. 330/2025: extr. 10-15 ren/h, antideflagrante, grelhas alta+baixa', press: 'sub', rede: 'sujos', soExtr: true },
];

const CL_REGIMES = {
  medica: { nome: 'Clínica / consultório médico', portaria: 'Portaria n.º 92/2024/1 (redação da Portaria n.º 328/2025/1)', catalogo: [...CL_92, ...CL_COMUNS], analogia: false },
  dentaria: { nome: 'Clínica / consultório dentário', portaria: 'Portaria n.º 99/2024/1 (remete para o regime geral); requisitos clínicos por analogia com a Portaria n.º 92/2024/1 (red. 328/2025/1)', catalogo: [...CL_92, ...CL_COMUNS], analogia: true },
  veterinaria: { nome: 'Clínica veterinária', portaria: 'Sem legislação específica; requisitos clínicos por analogia com a Portaria n.º 92/2024/1 (red. 328/2025/1)', catalogo: [...CL_92, ...CL_COMUNS], analogia: true },
  fisio: { nome: 'Fisioterapia / MFR / terapias', portaria: 'Portaria n.º 88/2024/1 (redação da Portaria n.º 326/2025/1)', catalogo: [...CL_88, ...CL_COMUNS], analogia: false },
  cirurgia: { nome: 'Cirurgia de ambulatório', portaria: 'Portaria n.º 97/2024/1 (redação da Portaria n.º 330/2025/1)', catalogo: [...CL_97, ...CL_COMUNS], analogia: false },
};

const CL_EV_DEFAULT = 0.8;      // prática da casa
const CL_SOBRE_FRAC = 0.9;      // extracção = 90% da insuflação (sobrepressão)
const CL_GLOBAL_FACTOR = 1.1;   // Σinsuf ≥ 1.1 × Σextr (critério do projectista)

// ─── State ───
let clState = { regime: null, espacos: [], currentForm: null };

// ─── Cálculo ───
function clArredonda5(v) { return Math.ceil(v / 5) * 5; }

function clQPortaria(cat, e) {
  const a = cat.arNovo;
  switch (a.t) {
    case 'p': return e.nOcup * a.v;
    case 'm2': return e.area * a.v;
    case 'renh': return e.area * e.pd * a.v;
    case 'fixo': return a.v;
    case 'p_ou_renh': return Math.max(e.nOcup * a.v, e.area * e.pd * a.v2);
    case 'is': {
      const A10 = 10 * e.area;
      if (a.modo === 'priv_cont') return Math.max(45, A10);
      if (a.modo === 'priv') return Math.max(90, A10);
      if (a.modo === 'pub') return Math.max(90 * (e.nEquip || 1), A10);
      return Math.max(125 * (e.nEquip || 1), A10); // pub_int
    }
    case 'geral': default: return 0;
  }
}

function clQ138I(cat, e) {
  // Prescritivo geral: max(ocupação, edifício). IS e só-extracção ficam fora.
  if (cat.arNovo.t === 'is' || cat.soExtr) return 0;
  const atvIdx = cat.atv !== undefined ? cat.atv : 2; // default Sedentária (24)
  const qOc = e.nOcup * AN_TIPOS_ESPACO[atvIdx].qOc;
  const qEd = e.area * 3; // Tabela 12: sem poluentes específicos
  return Math.max(qOc, qEd);
}

function clSugestao(cat, e) {
  const qPort = clQPortaria(cat, e);
  const q138 = clQ138I(cat, e);
  const requisito = Math.max(qPort, q138);
  const dominante = qPort >= q138 ? 'portaria' : '138-I';
  let insuf = 0, extr = 0;
  if (cat.soExtr) {
    extr = clArredonda5(qPort);
  } else if (cat.makeup) {
    insuf = 0; extr = 0;
  } else {
    insuf = clArredonda5(requisito / e.ev);
    if (cat.press === 'sobre') extr = Math.max(0, Math.round(insuf * CL_SOBRE_FRAC / 5) * 5);
    else if (cat.press === 'sub') extr = clArredonda5(insuf * 1.1);
    else extr = insuf;
  }
  return { qPort, q138, requisito, dominante, insuf, extr };
}

// ─── UI ───
function clIniciar() {
  setProgress(15);
  addBot('Tipo de unidade de saúde?<br><span style="font-size:11px;color:var(--tx-dim)">Dentárias e veterinárias: a lei remete para o regime geral — aplicam-se os requisitos das clínicas médicas por analogia (critério do projectista, documentado no anexo).</span>');
  addPills(Object.keys(CL_REGIMES).map(k => ({
    label: CL_REGIMES[k].nome,
    action: () => { clState = { regime: k, espacos: [], currentForm: null }; clFormEspaco(); }
  })));
}

function clFormEspaco() {
  setProgress(30 + Math.min(clState.espacos.length * 5, 55));
  document.querySelectorAll('.input-form').forEach(f => {
    f.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    f.style.opacity = '0.4';
  });

  const reg = CL_REGIMES[clState.regime];
  const n = clState.espacos.length + 1;
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';

  form.innerHTML = `
    <div style="font-size:13px;color:#d0d6e8;margin-bottom:10px;"><strong>Espaço ${n}</strong> — ${reg.nome} <span style="font-size:11px;color:#5a7aaa">(ordem da planta, como na folha A4)</span></div>
    <div class="form-row">
      <div class="form-field" style="flex:2"><label>Designação</label><input type="text" id="cl-nome" placeholder="ex: Gabinete 1"/></div>
      <div class="form-field" style="flex:3"><label>Tipo de espaço (requisitos)</label>
        <select id="cl-tipo" onchange="clTipoChange()">${reg.catalogo.map((c, i) => `<option value="${i}">${c.nome}</option>`).join('')}</select>
      </div>
    </div>
    <div id="cl-fonte" style="font-size:11px;color:#5a7aaa;margin:2px 0 8px;"></div>
    <div class="form-row">
      <div class="form-field"><label>Área (m²)</label><input type="number" id="cl-area" placeholder="15" min="0.1" step="0.1"/></div>
      <div class="form-field"><label>Pé-direito (m)</label><input type="number" id="cl-pd" value="2.7" min="1" step="0.01"/></div>
      <div class="form-field"><label>Ocupantes</label><input type="number" id="cl-nocup" placeholder="3" min="0" step="1"/></div>
      <div class="form-field" id="cl-equip-wrap" style="display:none"><label>Equip. sanitários</label><input type="number" id="cl-nequip" value="1" min="1" step="1"/></div>
      <div class="form-field"><label>Eficácia (ev)</label><input type="number" id="cl-ev" value="${CL_EV_DEFAULT}" min="0.1" max="1.5" step="0.05"/></div>
    </div>
    <div class="form-row">
      <button class="add-btn" onclick="clSugerir()">Sugerir caudais</button>
    </div>
    <div id="cl-sugestao" style="display:none;background:#0a0f1e;border:1px solid #2a3450;border-radius:8px;padding:10px;margin:8px 0;">
      <div id="cl-sug-info" style="font-size:11px;color:#8090b0;margin-bottom:8px;"></div>
      <div class="form-row">
        <div class="form-field"><label>Insuflação (m³/h)</label><input type="number" id="cl-insuf" step="5" min="0"/></div>
        <div class="form-field"><label>Extr. limpos (m³/h)</label><input type="number" id="cl-extr-l" step="5" min="0"/></div>
        <div class="form-field"><label>Extr. sujos (m³/h)</label><input type="number" id="cl-extr-s" step="5" min="0"/></div>
        <button class="add-btn" onclick="clAddEspaco()">+ Adicionar</button>
      </div>
      <div id="cl-aviso" style="font-size:11px;color:#f59e0b;margin-top:4px;"></div>
    </div>
    <div class="items-list" id="cl-list"></div>
    <div class="form-actions">
      <button class="continuar-btn" onclick="clFecharBalanco()">Fechar balanço →</button>
    </div>`;

  clState.currentForm = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
  clTipoChange();
  clRenderLista();
}

function clTipoChange() {
  const f = clState.currentForm;
  if (!f) return;
  const cat = CL_REGIMES[clState.regime].catalogo[parseInt(f.querySelector('#cl-tipo').value)];
  f.querySelector('#cl-fonte').textContent = '📖 ' + cat.fonte + (cat.pa ? ' · Pressão: ' + cat.pa : '');
  f.querySelector('#cl-equip-wrap').style.display = cat.arNovo.t === 'is' ? 'flex' : 'none';
  f.querySelector('#cl-sugestao').style.display = 'none';
}

function clSugerir() {
  const f = clState.currentForm;
  const cat = CL_REGIMES[clState.regime].catalogo[parseInt(f.querySelector('#cl-tipo').value)];
  const area = parseFloat(f.querySelector('#cl-area').value);
  const pd = parseFloat(f.querySelector('#cl-pd').value);
  const nOcup = parseInt(f.querySelector('#cl-nocup').value) || 0;
  const nEquip = parseInt(f.querySelector('#cl-nequip').value) || 1;
  const ev = parseFloat(f.querySelector('#cl-ev').value) || CL_EV_DEFAULT;
  if (!area || area <= 0) { alert('Indique a área.'); return; }
  if (!pd || pd <= 0) { alert('Indique o pé-direito.'); return; }
  if ((cat.arNovo.t === 'p' || cat.arNovo.t === 'p_ou_renh') && nOcup <= 0) { alert('Este tipo de espaço precisa do n.º de ocupantes.'); return; }

  const e = { area, pd, nOcup, nEquip, ev };
  const s = clSugestao(cat, e);

  const sug = f.querySelector('#cl-sugestao');
  sug.style.display = 'block';
  let info = `Requisito: portaria ${s.qPort.toFixed(0)} m³/h vs 138-I ${s.q138.toFixed(0)} m³/h → vence ${s.dominante} (${s.requisito.toFixed(0)} m³/h)`;
  if (!cat.soExtr && !cat.makeup) info += ` ÷ ev ${ev} = insuflação sugerida ${s.insuf} m³/h`;
  if (cat.press === 'sobre') info += ' · sobrepressão: extr. ≈ 90% da insuf.';
  if (cat.press === 'sub') info += ' · subpressão: extr. ≥ 110% da insuf.';
  f.querySelector('#cl-sug-info').textContent = info;
  f.querySelector('#cl-insuf').value = s.insuf;
  f.querySelector('#cl-extr-l').value = cat.rede === 'limpos' ? s.extr : 0;
  f.querySelector('#cl-extr-s').value = cat.rede === 'sujos' ? s.extr : 0;
  f.querySelector('#cl-aviso').textContent = cat.aviso || '';
  scroll();
}

function clAddEspaco() {
  const f = clState.currentForm;
  if (f.querySelector('#cl-sugestao').style.display === 'none') { alert('Primeiro "Sugerir caudais".'); return; }
  const cat = CL_REGIMES[clState.regime].catalogo[parseInt(f.querySelector('#cl-tipo').value)];
  const nome = f.querySelector('#cl-nome').value.trim();
  if (!nome) { alert('Indique a designação do espaço.'); return; }
  const area = parseFloat(f.querySelector('#cl-area').value);
  const pd = parseFloat(f.querySelector('#cl-pd').value);
  const nOcup = parseInt(f.querySelector('#cl-nocup').value) || 0;
  const nEquip = parseInt(f.querySelector('#cl-nequip').value) || 1;
  const ev = parseFloat(f.querySelector('#cl-ev').value) || CL_EV_DEFAULT;
  const insuf = parseFloat(f.querySelector('#cl-insuf').value) || 0;
  const extrL = parseFloat(f.querySelector('#cl-extr-l').value) || 0;
  const extrS = parseFloat(f.querySelector('#cl-extr-s').value) || 0;

  const e = { nome, catId: cat.id, catNome: cat.nome, fonte: cat.fonte, press: cat.press, pa: cat.pa || null, aviso: cat.aviso || null, area, pd, nOcup, nEquip, ev, insuf, extrL, extrS };
  const s = clSugestao(cat, { area, pd, nOcup, nEquip, ev });
  e.qPort = s.qPort; e.q138 = s.q138; e.requisito = s.requisito; e.dominante = s.dominante;

  // Coerência de pressões e mínimo legal — avisa, ela decide
  const extrTotal = extrL + extrS;
  if (cat.press === 'sobre' && !cat.soExtr && extrTotal >= insuf) {
    if (!confirm(`"${nome}" devia ficar em SOBREPRESSÃO mas a extracção (${extrTotal}) ≥ insuflação (${insuf}).\nAdicionar na mesma?`)) return;
    e.incoerente = 'devia estar em sobrepressão';
  }
  if (cat.press === 'sub' && insuf > 0 && insuf >= extrTotal) {
    if (!confirm(`"${nome}" devia ficar em SUBPRESSÃO mas a insuflação (${insuf}) ≥ extracção (${extrTotal}).\nAdicionar na mesma?`)) return;
    e.incoerente = 'devia estar em subpressão';
  }
  if (!cat.soExtr && !cat.makeup && e.requisito > 0 && insuf * ev < e.requisito - 0.5) {
    if (!confirm(`"${nome}": insuflação ${insuf} × ev ${ev} = ${(insuf * ev).toFixed(0)} m³/h — ABAIXO do requisito legal (${e.requisito.toFixed(0)} m³/h).\nAdicionar na mesma?`)) return;
    e.abaixoLegal = true;
  }

  clState.espacos.push(e);
  clRenderLista();
  f.querySelector('#cl-nome').value = '';
  f.querySelector('#cl-area').value = '';
  f.querySelector('#cl-nocup').value = '';
  f.querySelector('#cl-sugestao').style.display = 'none';
}

function clRenderLista() {
  const f = clState.currentForm;
  if (!f) return;
  const list = f.querySelector('#cl-list');
  if (!list) return;
  list.innerHTML = '';
  clState.espacos.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'item-tag';
    d.innerHTML = `<span>${e.nome} — I:${e.insuf} / EL:${e.extrL} / ES:${e.extrS}${e.incoerente ? ' ⚠️' : ''}${e.abaixoLegal ? ' 🔻' : ''}</span><button class="del-btn" onclick="clDelEspaco(${i})">✕</button>`;
    list.appendChild(d);
  });
  scroll();
}

function clDelEspaco(i) { clState.espacos.splice(i, 1); clRenderLista(); }

function clFecharBalanco() {
  if (!clState.espacos.length) { alert('Adicione pelo menos um espaço.'); return; }
  addUser('Fechar balanço →');
  setProgress(100);

  const reg = CL_REGIMES[clState.regime];
  const totI = clState.espacos.reduce((s, e) => s + e.insuf, 0);
  const totL = clState.espacos.reduce((s, e) => s + e.extrL, 0);
  const totS = clState.espacos.reduce((s, e) => s + e.extrS, 0);
  const totExtr = totL + totS;
  const alvo = totExtr * CL_GLOBAL_FACTOR;
  const deficit = Math.max(0, clArredonda5(alvo - totI));

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';

  const avisos = clState.espacos.filter(e => e.incoerente || e.abaixoLegal);
  bubble.innerHTML = `
    <div class="rlabel">Balanço aerólico — ${reg.nome}</div>
    <table class="res-table">
      <thead><tr><th>Espaço</th><th>Tipo</th><th style="text-align:right">Insuflação</th><th style="text-align:right">Extr. limpos</th><th style="text-align:right">Extr. sujos</th><th>Pressão</th></tr></thead>
      <tbody>
        ${clState.espacos.map(e => `<tr>
          <td>${e.nome}${e.incoerente ? ' ⚠️' : ''}${e.abaixoLegal ? ' 🔻' : ''}</td>
          <td style="font-size:11px;color:#8090b0">${e.catNome}</td>
          <td style="text-align:right">${e.insuf || '—'}</td>
          <td style="text-align:right">${e.extrL || '—'}</td>
          <td style="text-align:right">${e.extrS || '—'}</td>
          <td style="font-size:11px">${e.press === 'sobre' ? '⊕ sobre' : e.press === 'sub' ? '⊖ sub' : '= eq'}${e.pa ? ' (' + e.pa + ')' : ''}</td>
        </tr>`).join('')}
        <tr style="font-weight:bold;border-top:2px solid #2a3450">
          <td>TOTAIS</td><td></td>
          <td style="text-align:right">${totI}</td>
          <td style="text-align:right">${totL}</td>
          <td style="text-align:right">${totS}</td><td></td>
        </tr>
      </tbody>
    </table>
    <div class="total-row">
      <div class="total-card"><div class="total-label">Σ Extracção × ${CL_GLOBAL_FACTOR}</div><div class="total-value">${Math.round(alvo)}</div><div class="total-unit">m³/h (alvo de insuflação)</div></div>
      <div class="total-card"><div class="total-label">${deficit > 0 ? 'Défice → make-up no corredor' : 'Excedente de insuflação'}</div><div class="total-value">${deficit > 0 ? deficit : Math.round(totI - alvo)}</div><div class="total-unit">m³/h</div></div>
    </div>
    ${avisos.length ? `<div class="rlabel" style="color:#f59e0b;margin-top:8px;">⚠️ Espaços com avisos: ${avisos.map(e => e.nome + ' (' + (e.incoerente || 'abaixo do requisito legal') + ')').join('; ')}</div>` : ''}
    ${deficit > 0 ? `<div class="rlabel" style="margin-top:6px;color:#8090b0;">Sugestão: insuflar ${deficit} m³/h em corredor/circulação (make-up) para garantir a sobrepressão global de ${Math.round((CL_GLOBAL_FACTOR - 1) * 100)}% (critério do projectista).</div>` : ''}`;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();

  projectLog.push({
    tool: 'ar_novo_clinica',
    input: { regime: clState.regime, espacos: clState.espacos },
    result: { regime: clState.regime, regimeNome: reg.nome, portaria: reg.portaria, analogia: reg.analogia, espacos: clState.espacos.slice(), totI, totL, totS, alvo, deficit },
    ts: new Date().toISOString()
  });
  saveProject();

  setTimeout(() => {
    addBot('E agora?');
    const pills = [];
    if (deficit > 0) {
      pills.push({ label: `+ Make-up ${deficit} m³/h no corredor`, action: () => clAddMakeup(deficit) });
    }
    pills.push({ label: 'Continuar a adicionar espaços', action: clFormEspaco });
    if (currentProject) pills.push({ label: '📄 Gerar Anexo Word (MD)', action: gerarAnexoClinica });
    pills.push({ label: 'Novo cálculo', action: iniciarArNovo });
    pills.push({ label: '← Ferramentas', action: () => showToolMenu(currentArea) });
    addPills(pills);
  }, 400);
}

function clAddMakeup(deficit) {
  clState.espacos.push({
    nome: 'Corredor (make-up)', catId: 'corredor', catNome: 'Corredor / circulação (make-up)',
    fonte: 'Make-up de ar — critério do projectista (sobrepressão global)',
    press: 'sobre', pa: null, aviso: null, area: 0, pd: 0, nOcup: 0, nEquip: 0, ev: 1,
    insuf: deficit, extrL: 0, extrS: 0, qPort: 0, q138: 0, requisito: 0, dominante: '—'
  });
  addBot(`✓ Make-up de ${deficit} m³/h adicionado ao corredor. A refechar o balanço...`);
  setTimeout(clFecharBalanco, 300);
}

// ═══ Anexo Word — clínicas ═══
async function gerarAnexoClinica() {
  if (!currentProject) { alert('Crie um projecto primeiro.'); return; }
  const logs = projectLog.filter(l => l.tool === 'ar_novo_clinica');
  if (!logs.length) { alert('Não há balanços de clínica no projecto.'); return; }
  if (typeof docx === 'undefined') { alert('A carregar biblioteca de documentos. Tente novamente.'); return; }
  if (logs.length > 1) {
    const dataUltimo = new Date(logs[logs.length - 1].ts).toLocaleString('pt-PT');
    if (!confirm(`Este projecto tem ${logs.length} balanços de clínica.\nO anexo inclui apenas o MAIS RECENTE (${dataUltimo}).\n\nContinuar?`)) return;
  }
  const res = logs[logs.length - 1].result;

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, WidthType, ShadingType, VerticalAlign } = docx;
  const COR_AZUL = '1E8AFF', COR_CINZA = '666666', COR_HEADER_BG = 'E8F0FE';

  function txt(text, opts = {}) { return new TextRun({ text, font: 'Calibri', size: opts.size || 22, bold: opts.bold || false, italics: opts.italics || false, color: opts.color || '333333', ...opts }); }
  function para(children, opts = {}) {
    if (typeof children === 'string') children = [txt(children)];
    return new Paragraph({ children, spacing: { after: opts.after !== undefined ? opts.after : 120 }, alignment: opts.alignment || AlignmentType.LEFT, ...opts });
  }
  function cellP(text, opts = {}) {
    return new TableCell({
      children: [para(typeof text === 'string' ? [txt(text, opts.textOpts || {})] : text, { after: 40, alignment: opts.alignment || AlignmentType.LEFT })],
      shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
      verticalAlign: VerticalAlign.CENTER
    });
  }

  const corpo = [];
  corpo.push(para([txt('ANEXO — VENTILAÇÃO E BALANÇO AERÓLICO', { size: 28, bold: true, color: COR_AZUL })], { after: 60 }));
  corpo.push(para([txt(res.regimeNome, { size: 24, color: COR_CINZA })], { after: 300 }));

  corpo.push(
    para([txt('1. Enquadramento regulamentar', { size: 24, bold: true, color: '222222' })], { after: 120 }),
    para(`Os requisitos de ventilação foram determinados de acordo com: (i) ${res.portaria}; (ii) Decreto-Lei n.º 101-D/2020, de 7 de dezembro, e Portaria n.º 138-I/2021, de 1 de julho (regime geral de ventilação e qualidade do ar interior). Nos termos do anexo AVAC da portaria de licenciamento, foi verificado, para cada espaço, o maior dos requisitos resultantes da interseção entre a portaria e o regime geral.`)
  );
  if (res.analogia) {
    corpo.push(para([txt('Nota: A legislação aplicável a esta tipologia de unidade remete os requisitos de ventilação para o regime geral, sem matriz própria. Por opção do projectista, e como boa prática, adotaram-se por analogia os requisitos da Portaria n.º 92/2024/1 (redação da Portaria n.º 328/2025/1) para os espaços clínicos.', { italics: true, color: COR_CINZA, size: 20 })]));
  }

  corpo.push(
    para([txt('2. Critérios de projeto', { size: 24, bold: true, color: '222222' })], { after: 120 }),
    para('Aos caudais mínimos de ar novo foi aplicada a eficácia de remoção de poluentes (ev) da configuração de ventilação adotada (Manual SCE): Qinsuflar = QAN / ev.'),
    para('Estratégia de pressurização: os espaços clínicos limpos são mantidos em sobrepressão (extração ≈ 90 % da insuflação) e os espaços poluídos/sujos em subpressão (extração superior à insuflação), com rede de extração de sujos independente da rede de limpos. As instalações sanitárias são mantidas em depressão com exaustão independente (Portaria n.º 138-I/2021).'),
    para(`Critério do projectista: a insuflação total da unidade cobre ${Math.round(CL_GLOBAL_FACTOR * 100)} % da extração total (sobrepressão global), sendo o acerto do balanço efetuado por insuflação de compensação (make-up) nas zonas de circulação.`)
  );

  corpo.push(para([txt('3. Balanço aerólico', { size: 24, bold: true, color: '222222' })], { after: 120 }));
  const headers = ['Espaço', 'Tipo (requisito)', 'Área (m²)', 'Ocup.', 'Requisito legal (m³/h)', 'Insuflação (m³/h)', 'Extr. limpos (m³/h)', 'Extr. sujos (m³/h)', 'Pressão'];
  const rows = [
    new TableRow({ children: headers.map(h => cellP(h, { shading: COR_HEADER_BG, textOpts: { bold: true, size: 16, color: '333333' } })) }),
    ...res.espacos.map(e => new TableRow({
      children: [
        cellP(e.nome, { textOpts: { size: 16 } }),
        cellP(e.catNome, { textOpts: { size: 16 } }),
        cellP(e.area ? e.area.toString() : '—', { textOpts: { size: 16 }, alignment: AlignmentType.RIGHT }),
        cellP(e.nOcup ? e.nOcup.toString() : '—', { textOpts: { size: 16 }, alignment: AlignmentType.RIGHT }),
        cellP(e.requisito ? e.requisito.toFixed(0) : '—', { textOpts: { size: 16 }, alignment: AlignmentType.RIGHT }),
        cellP(e.insuf ? e.insuf.toString() : '—', { textOpts: { size: 16, bold: true }, alignment: AlignmentType.RIGHT }),
        cellP(e.extrL ? e.extrL.toString() : '—', { textOpts: { size: 16 }, alignment: AlignmentType.RIGHT }),
        cellP(e.extrS ? e.extrS.toString() : '—', { textOpts: { size: 16 }, alignment: AlignmentType.RIGHT }),
        cellP(e.press === 'sobre' ? 'Sobrepressão' + (e.pa ? ' ' + e.pa : '') : e.press === 'sub' ? 'Subpressão' : 'Equilíbrio', { textOpts: { size: 16 } }),
      ]
    })),
    new TableRow({
      children: [
        cellP('TOTAIS', { textOpts: { size: 16, bold: true }, shading: COR_HEADER_BG }),
        cellP('', { shading: COR_HEADER_BG }), cellP('', { shading: COR_HEADER_BG }), cellP('', { shading: COR_HEADER_BG }), cellP('', { shading: COR_HEADER_BG }),
        cellP(res.totI.toString(), { textOpts: { size: 16, bold: true }, alignment: AlignmentType.RIGHT, shading: COR_HEADER_BG }),
        cellP(res.totL.toString(), { textOpts: { size: 16, bold: true }, alignment: AlignmentType.RIGHT, shading: COR_HEADER_BG }),
        cellP(res.totS.toString(), { textOpts: { size: 16, bold: true }, alignment: AlignmentType.RIGHT, shading: COR_HEADER_BG }),
        cellP('', { shading: COR_HEADER_BG }),
      ]
    })
  ];
  corpo.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));

  corpo.push(
    para(''),
    para([txt('Extração total: ', { bold: true }), txt(`${res.totL + res.totS} m³/h`, { bold: true, color: COR_AZUL }),
      txt(`   ·   Alvo de insuflação (×${CL_GLOBAL_FACTOR}): `, { bold: true }), txt(`${Math.round(res.alvo)} m³/h`, { bold: true, color: COR_AZUL }),
      txt('   ·   Insuflação total: ', { bold: true }), txt(`${res.totI} m³/h`, { bold: true, color: COR_AZUL })])
  );

  corpo.push(para([txt('4. Requisitos regulamentares aplicados', { size: 24, bold: true, color: '222222' })], { after: 120 }));
  const vistos = new Set();
  res.espacos.forEach(e => {
    if (vistos.has(e.catId)) return;
    vistos.add(e.catId);
    corpo.push(para([txt(`${e.catNome}: `, { bold: true, size: 20 }), txt(e.fonte, { size: 20, color: COR_CINZA })], { after: 60 }));
  });

  const avisos = [...new Set(res.espacos.filter(e => e.aviso).map(e => e.aviso))];
  const incoerentes = res.espacos.filter(e => e.incoerente || e.abaixoLegal);
  if (avisos.length || incoerentes.length) {
    corpo.push(para([txt('5. Reservas e notas do projectista', { size: 24, bold: true, color: '222222' })], { after: 120 }));
    avisos.forEach(a => corpo.push(para([txt(a.replace('⚠️ ', ''), { size: 20, color: COR_CINZA, italics: true })], { after: 60 })));
    incoerentes.forEach(e => corpo.push(para([txt(`${e.nome}: valores adotados por decisão do projectista (${e.incoerente || 'abaixo do requisito tabelado'}) — justificação a documentar.`, { size: 20, color: 'B45309', italics: true })], { after: 60 })));
  }

  corpo.push(para(''), para([txt('Calculado com ALIOS ONE — Cálculos de Engenharia', { size: 18, italics: true, color: COR_AZUL })]));

  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: corpo }]
  });

  try {
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nomeFile = currentProject.nome.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').trim();
    a.download = `${nomeFile} - Anexo Ventilação Clínica.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Erro ao gerar anexo:', e);
    alert('Erro ao gerar o anexo. Verifique a consola.');
  }
}
