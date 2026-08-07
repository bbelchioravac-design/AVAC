// ═══════════════════════════════════════════════════
// ALIOS ONE — GTC: base de regras de listas de pontos
// gtc_regras.js — templates de equipamento (v0.1, QA pendente)
//
// Cada ponto: { desc, funcao, tipo, sinal, origem }
//   tipo: ED | SD | EAa | EAp | SA | IMP | COM
//     (ED/SD = entrada/saída digital; EAa = entrada analógica
//      activa 0-10V/4-20mA; EAp = passiva Ni1000; IMP = impulsos;
//      COM = integração por protocolo — conta como tag, não I/O)
//   protocolo (só COM): Modbus | M-Bus | BACnet | DALI | KNX
//   tags (só COM): nº de variáveis integradas
//   origem: 'legal: …' (Portaria 138-I/2021) | 'norma: …'
//           (EN 15232 / ISO 52120) | 'prática'
//
// Convenções adoptadas (fontes no levantamento 2026-08-06):
//  - Arranque de motor: comando SD + estado ED + avaria ED
//    + comutador Manual/Auto/Deslig. na porta do QE = 1 ED
//  - Variador: velocidade SA + feedback EAa + avaria ED
//  - Registo ON/OFF: comando SD + 2 ED (fins de curso)
//  - Registo modulante: comando SA + feedback EAa
//  - Válvula modulante: comando SA (+ feedback EAa se pedido)
//  - Contador de entalpia: COM M-Bus, 6 tags
//  - Analisador de energia: COM Modbus, 20 tags
//    (obrigatório p/ equip. eléctrico >12 kW — legal 6.2 b iii 3)
//  - Reserva: 10% por tipo e por quadro (mín. 2) — configurável 20%
// ═══════════════════════════════════════════════════

'use strict';

// ─── helpers de pontos recorrentes ───
function arranqueMotor(nome, cfg) {
  const pts = [
    { desc: `${nome} — comando marcha/paragem`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática' },
    { desc: `${nome} — estado de funcionamento`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
    { desc: `${nome} — avaria (térmico/disjuntor)`, funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
  ];
  if (cfg.comutadores !== false)
    pts.push({ desc: `${nome} — posição comutador Man/Auto/Desl (QE)`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
  return pts;
}

function variador(nome) {
  return [
    { desc: `${nome} — variador: referência de velocidade`, funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'norma: 52120 4.5 (caudal/pressão UTA) / 1.4-3.4 (bombas)' },
    { desc: `${nome} — variador: feedback velocidade/corrente`, funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', origem: 'prática' },
    { desc: `${nome} — variador: avaria`, funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
  ];
}

function registoOnOff(nome) {
  return [
    { desc: `${nome} — comando abrir/fechar`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática' },
    { desc: `${nome} — fim de curso aberto`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
    { desc: `${nome} — fim de curso fechado`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
  ];
}

function registoModulante(nome, origem) {
  return [
    { desc: `${nome} — comando modulante`, funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: origem || 'prática' },
    { desc: `${nome} — feedback de posição`, funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', origem: 'prática' },
  ];
}

function contadorEntalpia(nome) {
  return [{ desc: `${nome} — contador de entalpia (energia, potência, caudal, T ida, T ret, ΔT)`, funcao: 'Contagem', tipo: 'COM', protocolo: 'M-Bus', tags: 6, sinal: 'M-Bus', origem: 'legal: 138-I 6.2 b iii 4/6 (rendimento >70 kW; desagregação por função)' }];
}

function analisadorEnergia(nome, motivo) {
  return [{ desc: `${nome} — analisador de energia eléctrica`, funcao: 'Contagem', tipo: 'COM', protocolo: 'Modbus', tags: 20, sinal: 'Modbus RTU', origem: motivo || 'legal: 138-I 6.2 b iii 3 (contagem individual >12 kW)' }];
}

// ─── TEMPLATES ───
const GTC_TEMPLATES = {

  // ═══ 1. UTA ═══
  uta: {
    nome: 'UTA — Unidade de Tratamento de Ar',
    perguntas: [
      { id: 'pot_kw', texto: 'Potência térmica da UTA (kW)', def: 30 },
      { id: 'vent_ret', texto: 'Tem ventilador de retorno/extracção?', def: true },
      { id: 'vfd', texto: 'Ventiladores com variador?', def: true },
      { id: 'mistura', texto: 'Tem caixa de mistura (registos AN/ret/ext modulantes)?', def: false },
      { id: 'reg_modulantes', texto: 'Registos modulantes (senão ON/OFF)?', def: true },
      { id: 'bat_aq', texto: 'Bateria de água quente?', def: true },
      { id: 'bat_af', texto: 'Bateria de água fria?', def: true },
      { id: 'bat_el_kw', texto: 'Bateria eléctrica? (potência kW, 0 = não tem)', def: 0 },
      { id: 'bat_dx', texto: 'Bateria de expansão directa (unidade condensadora)?', def: 'não', ops: ['não', 'on-off', 'inverter'] },
      { id: 'recuperador', texto: 'Recuperador de calor?', def: 'roda', ops: ['nenhum', 'placas', 'roda'] },
      { id: 'n_filtros', texto: 'Nº de estágios de filtragem', def: 3 },
      { id: 'co2', texto: 'Sonda de qualidade do ar (T/H/CO2) ambiente/retorno?', def: true },
      { id: 'vav', texto: 'Caudal variável por pressão (VAV)?', def: false },
      { id: 'entalpia', texto: 'Contador de entalpia nas baterias? (QA 2026-08-06: normalmente NÃO — a contagem faz-se nos circuitos principais)', def: false },
      { id: 'sondas_agua', texto: 'Sondas de água ida/retorno nas baterias (Ni1000)?', def: true },
    ],
    pontos(c, cfg) {
      let p = [];
      // ventiladores
      p.push(...arranqueMotor('Ventilador de insuflação', cfg));
      if (!c.vfd) p.push({ desc: 'Ventilador insuflação — prova de caudal (pressostato dif.)', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      if (c.vfd) p.push(...variador('Ventilador de insuflação'));
      if (c.vent_ret) {
        p.push(...arranqueMotor('Ventilador de retorno/extracção', cfg));
        if (c.vfd) p.push(...variador('Ventilador de retorno/extracção'));
        else p.push({ desc: 'Ventilador retorno/extracção — prova de caudal (pressostato dif.)', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      }
      // filtros — legal: 1.5 d) alerta de colmatação + Tabela 18
      for (let i = 1; i <= c.n_filtros; i++)
        p.push({ desc: `Filtro estágio ${i} — colmatação (pressostato diferencial)`, funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'legal: 138-I 1.5 d + Tabela 18 (estado de colmatagem)' });
      // registos
      const mkReg = (nome, origem) => c.reg_modulantes ? registoModulante(nome, origem) : registoOnOff(nome);
      p.push(...mkReg('Registo de ar novo', 'norma: 52120 4.4 (fracção de ar novo) / 4.8 (free cooling)'));
      if (c.mistura) {
        p.push(...mkReg('Registo de mistura/retorno'));
        p.push(...mkReg('Registo de extracção'));
      }
      // baterias de água
      const bat = (nome) => {
        p.push({ desc: `${nome} — válvula modulante`, funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'norma: 52120 4.9 (T insuflação por setpoint variável)' });
        if (c.sondas_agua) {
          p.push({ desc: `${nome} — T água ida (Ni1000 bainha)`, funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'prática' });
          p.push({ desc: `${nome} — T água retorno (Ni1000 bainha)`, funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'prática' });
        }
        if (c.entalpia) p.push(...contadorEntalpia(nome));
      };
      if (c.bat_aq) bat('Bateria de água quente');
      if (c.bat_af) bat('Bateria de água fria');
      // bateria de expansão directa (o teu caso UTAN+DX)
      if (c.bat_dx && c.bat_dx !== 'não') {
        p.push({ desc: 'Unidade condensadora DX — autorização de funcionamento (enable)', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática (encravada c/ o ventilador de insuflação)' });
        p.push({ desc: 'Unidade condensadora DX — estado de funcionamento', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
        p.push({ desc: 'Unidade condensadora DX — avaria geral', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (a unidade protege-se a si própria)' });
        if (c.bat_dx === 'inverter')
          p.push({ desc: 'Unidade condensadora DX — pedido de capacidade (0-10V)', funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'norma: 52120 4.9 (T de insuflação por setpoint) + 1.8 (controlo variável da capacidade da unidade exterior)' });
      }
      // bateria eléctrica
      if (c.bat_el_kw > 0) {
        p.push({ desc: 'Bateria eléctrica — comando (por escalão ou SSR)', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática' });
        p.push({ desc: 'Bateria eléctrica — termóstato de segurança', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
        if (c.bat_el_kw > 12) p.push(...analisadorEnergia('Bateria eléctrica'));
      }
      // recuperador
      if (c.recuperador === 'roda') {
        p.push({ desc: 'Recuperador (roda) — comando', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática (se a soma de rejeição do edifício >80 kW, a recuperação é obrigação legal — ver secção de obrigações)' });
        p.push({ desc: 'Recuperador (roda) — estado', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
        p.push({ desc: 'Recuperador (roda) — avaria', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
        p.push({ desc: 'Recuperador (roda) — velocidade', funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'norma: 52120 4.7 (prevenção sobreaquecimento)' });
        p.push({ desc: 'Recuperador — protecção anti-gelo (pressostato/sonda)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'norma: 52120 4.6 (anti-gelo)' });
      } else if (c.recuperador === 'placas') {
        p.push(...registoModulante('Recuperador (placas) — registo de bypass', 'norma: 52120 4.7'));
        p.push({ desc: 'Recuperador — protecção anti-gelo (pressostato/sonda)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'norma: 52120 4.6 (anti-gelo)' });
      }
      // sondas de ar — legal Tabela 18: T insuflação e retorno das UTAs
      p.push({ desc: 'Sonda T/H ar novo (conduta)', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: 2, origem: 'prática' });
      p.push({ desc: 'Sonda T/H insuflação (conduta)', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: 2, origem: 'legal: 138-I Tabela 18 (T insuflação UTA)' });
      p.push({ desc: 'Sonda T/H retorno/extracção (conduta)', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: 2, origem: 'legal: 138-I Tabela 18 (T retorno UTA)' });
      if (c.co2)
        p.push({ desc: 'Sonda T/H/CO2 ambiente ou retorno', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: 3, origem: 'legal: 138-I 1.5 b (caudal variável por CO2, se PC>100 kW e ocup.<50%)' });
      if (c.vav)
        p.push({ desc: 'Sonda de pressão estática na conduta', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', origem: 'norma: 52120 4.5 var. 3/4 (controlo de pressão c/ reset)' });
      // segurança
      p.push({ desc: 'Interligação SADI (paragem por incêndio)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      return p;
    }
  },

  // ═══ 2. VENTILADOR ═══
  ventilador: {
    nome: 'Ventilador de extracção/insuflação',
    perguntas: [
      { id: 'vfd', texto: 'Com variador?', def: false },
      { id: 'pot_kw', texto: 'Potência eléctrica (kW)', def: 1.5 },
      { id: 'prova', texto: 'Prova de caudal por pressostato?', def: true },
    ],
    pontos(c, cfg) {
      let p = [...arranqueMotor('Ventilador', cfg)];
      if (c.prova) p.push({ desc: 'Ventilador — prova de caudal (pressostato dif.)', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      if (c.vfd) p.push(...variador('Ventilador'));
      if (c.pot_kw > 12) p.push(...analisadorEnergia('Ventilador'));
      else if (c.pot_kw > 1) p.push({ desc: 'Ventilador — acessório p/ integração de contagem (motor >1 kW)', funcao: 'Nota', tipo: 'COM', protocolo: 'Modbus', tags: 0, sinal: '—', origem: 'legal: 138-I Tabela 18 (motores >1 kW: coluna A — acessório)' });
      p.push({ desc: 'Horas de funcionamento (totalizador)', funcao: 'Software', tipo: 'COM', protocolo: '—', tags: 1, sinal: 'soft', origem: 'legal: 138-I 6.2 b iv 4 (tempos de funcionamento de motores)' });
      return p;
    }
  },

  // ═══ 3. GRUPO DE BOMBAGEM ═══
  bombas: {
    nome: 'Grupo de bombagem (circuito hidráulico)',
    perguntas: [
      { id: 'n_bombas', texto: 'Nº de bombas (2 = dupla duty/standby)', def: 2 },
      { id: 'vfd', texto: 'Com variador?', def: true },
      { id: 'pot_kw', texto: 'Potência eléctrica unitária (kW)', def: 4 },
      { id: 'p_colector', texto: 'Sonda de pressão no colector?', def: true },
      { id: 'caudal', texto: 'Medição de caudal do circuito?', def: false },
      { id: 'filtro', texto: 'Pressostato ΔP no filtro (colmatação)?', def: true },
      { id: 'entalpia', texto: 'Contador de entalpia no circuito?', def: true },
      { id: 'sondas_agua', texto: 'Sondas T ida/retorno do circuito (Ni1000)?', def: true },
    ],
    pontos(c, cfg) {
      let p = [];
      for (let i = 1; i <= c.n_bombas; i++) {
        p.push(...arranqueMotor(`Bomba ${i}`, cfg));
        if (c.vfd) p.push(...variador(`Bomba ${i}`));
      }
      if (c.n_bombas > 1)
        p.push({ desc: 'Rotação duty/standby por horas de funcionamento', funcao: 'Software', tipo: 'COM', protocolo: '—', tags: 1, sinal: 'soft', origem: 'prática' });
      if (c.p_colector) p.push({ desc: 'Pressão no colector', funcao: 'Leitura', tipo: 'EAa', sinal: '4-20 mA', origem: 'norma: 52120 1.4/3.4 (bombas Δp)' });
      if (c.caudal) p.push({ desc: 'Caudal do circuito (transdutor)', funcao: 'Leitura', tipo: 'EAa', sinal: '4-20 mA', origem: 'prática' });
      if (c.filtro) p.push({ desc: 'Filtro do circuito — colmatação (pressostato ΔP água)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      if (c.sondas_agua) {
        p.push({ desc: 'T água ida do circuito (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18 (T circuitos primários ida/retorno)' });
        p.push({ desc: 'T água retorno do circuito (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18 (T circuitos primários ida/retorno)' });
      }
      if (c.entalpia) p.push(...contadorEntalpia('Circuito'));
      if (c.pot_kw * c.n_bombas > 12) p.push(...analisadorEnergia('Grupo de bombagem'));
      return p;
    }
  },

  // ═══ 4. CHILLER / BOMBA DE CALOR ═══
  chiller: {
    nome: 'Chiller / Bomba de calor (produção)',
    perguntas: [
      { id: 'pot_kw', texto: 'Potência térmica nominal (kW)', def: 300 },
      { id: 'gateway', texto: 'Integração por gateway?', def: 'Modbus', ops: ['Modbus', 'BACnet', 'nenhum'] },
      { id: 'tags_gw', texto: 'Nº de tags do gateway (mapa do fabricante)', def: 80 },
      { id: 'valvulas', texto: 'Válvulas motorizadas ON/OFF de seccionamento (ida+retorno)?', def: true },
      { id: 'reset', texto: 'Reset de setpoint por sinal analógico (redundante c/ gateway)?', def: false },
    ],
    pontos(c, cfg) {
      let p = [
        // físicos — mantêm-se MESMO com gateway (arbitragem hardwired, prática Trane)
        { desc: 'Chiller — autorização de funcionamento (enable)', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática (hardwired mesmo c/ gateway)' },
        { desc: 'Chiller — estado de funcionamento', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Chiller — avaria geral', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Fluxóstato no evaporador (presença de caudal)', funcao: 'Segurança', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (encravamento hardwired)' },
        { desc: 'T água ida (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I 6.2 b iv 6 (T água saída de geradores)' },
        { desc: 'T água retorno (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18' },
      ];
      if (c.valvulas) {
        p.push(...registoOnOff('Válvula motorizada de ida'));
        p.push(...registoOnOff('Válvula motorizada de retorno'));
      }
      if (c.reset) p.push({ desc: 'Reset de setpoint (analógico)', funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'norma: 52120 3.7 (T variável c/ carga)' });
      if (c.gateway !== 'nenhum') {
        p.push({ desc: `Gateway ${c.gateway} — MONITORIZAÇÃO (só leitura: estados, pressões, temperaturas, diagnósticos, capacidade, kW; dump p/ serviço técnico do fornecedor)`, funcao: 'Monitorização', tipo: 'COM', protocolo: c.gateway, tags: c.tags_gw, sinal: c.gateway, origem: 'prática + legal: 138-I 2.6 c/d (≥50 kW integrável, protocolo normalizado)' });
        p.push({ desc: `Gateway ${c.gateway} — ESCRITA limitada (setpoint, demand limit; a máquina comanda-se a si própria)`, funcao: 'Comando', tipo: 'COM', protocolo: c.gateway, tags: 3, sinal: c.gateway, origem: 'prática (arbitragem fabricante — escrita mínima, garantia intocada)' });
      }
      // rendimento — legal >70 kW: entalpia + eléctrica p/ EER/COP
      if (c.pot_kw > 70) {
        p.push(...contadorEntalpia('Chiller (produção)'));
        p.push(...analisadorEnergia('Chiller', 'legal: 138-I 6.2 b iii 4 (rendimento de geradores >70 kW) + 2.5 d 7 (EER/COP via SACE)'));
      }
      return p;
    }
  },

  // ═══ 5. TRANSVERSAIS — contagem e monitorização do edifício ═══
  transversais: {
    nome: 'Contagem e monitorização geral (edifício)',
    perguntas: [
      { id: 'n_qe', texto: 'Nº de quadros eléctricos com analisador', def: 2 },
      { id: 'n_zonas', texto: 'Nº de zonas com sonda ambiente (T ou T/H)', def: 4 },
      { id: 'gas', texto: 'Contagem de gás (impulsos)?', def: false },
      { id: 'agua', texto: 'Contagem de água (impulsos)?', def: false },
    ],
    pontos(c, cfg) {
      let p = [];
      for (let i = 1; i <= c.n_qe; i++)
        p.push(...analisadorEnergia(`QE ${i}`, 'legal: 138-I 6.2 b iii 1/7/8 (contagem por sistema e gerais por fonte)'));
      p.push({ desc: `Sondas de T ambiente por zona (${c.n_zonas} zonas)`, funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: c.n_zonas, origem: 'legal: 138-I 6.2 b iv 3 + Tabela 18 (T média interior por zona — TODAS as bandas de potência)' });
      if (c.gas) p.push({ desc: 'Contador de gás (impulsos ≥20 ms)', funcao: 'Contagem', tipo: 'IMP', sinal: 'impulsos', origem: 'legal: 138-I 6.2 b iii 5 (combustível por gerador >100 kW)' });
      if (c.agua) p.push({ desc: 'Contador de água (impulsos ≥20 ms)', funcao: 'Contagem', tipo: 'IMP', sinal: 'impulsos', origem: 'prática' });
      return p;
    }
  },

  // ═══ REGISTOS DE CONDUTA (avulsos, fora das máquinas) ═══
  registos: {
    nome: 'Registos de conduta (corta-fogo e zonamento)',
    perguntas: [
      { id: 'n_cf_monit', texto: 'Registos corta-fogo SÓ monitorizados (fusível térmico + fins de curso)', def: 4 },
      { id: 'n_cf_motor', texto: 'Registos corta-fogo MOTORIZADOS (rearme à distância)', def: 0 },
      { id: 'n_onoff', texto: 'Registos de zonamento ON/OFF (comando + fins de curso)', def: 0 },
      { id: 'n_mod', texto: 'Registos de zonamento MODULANTES (comando + feedback)', def: 0 },
    ],
    pontos(c, cfg) {
      const p = [];
      if (c.n_cf_monit > 0) {
        p.push({ desc: `Registos corta-fogo (×${c.n_cf_monit}) — fim de curso ABERTO`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_cf_monit, origem: 'legal: 138-I Tabela 18 (estado dos corta-fogo: TODAS as bandas, incl. ≤30 kW)' });
        p.push({ desc: `Registos corta-fogo (×${c.n_cf_monit}) — fim de curso FECHADO`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_cf_monit, origem: 'legal: 138-I Tabela 18' });
      }
      if (c.n_cf_motor > 0) {
        p.push({ desc: `Registos corta-fogo motorizados (×${c.n_cf_motor}) — comando (rearme)`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: c.n_cf_motor, origem: 'prática' });
        p.push({ desc: `Registos corta-fogo motorizados (×${c.n_cf_motor}) — fim de curso ABERTO`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_cf_motor, origem: 'legal: 138-I Tabela 18' });
        p.push({ desc: `Registos corta-fogo motorizados (×${c.n_cf_motor}) — fim de curso FECHADO`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_cf_motor, origem: 'legal: 138-I Tabela 18' });
      }
      if (c.n_onoff > 0) {
        p.push({ desc: `Registos de zonamento ON/OFF (×${c.n_onoff}) — comando`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: c.n_onoff, origem: 'prática (zonamento de ventilação)' });
        p.push({ desc: `Registos de zonamento ON/OFF (×${c.n_onoff}) — fim de curso aberto`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_onoff, origem: 'prática' });
        p.push({ desc: `Registos de zonamento ON/OFF (×${c.n_onoff}) — fim de curso fechado`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_onoff, origem: 'prática' });
      }
      if (c.n_mod > 0) {
        p.push({ desc: `Registos de zonamento modulantes (×${c.n_mod}) — comando`, funcao: 'Comando', tipo: 'SA', sinal: '0-10V', qtd: c.n_mod, origem: 'norma: 52120 4.1 (caudal ao nível do espaço)' });
        p.push({ desc: `Registos de zonamento modulantes (×${c.n_mod}) — feedback de posição`, funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: c.n_mod, origem: 'prática' });
      }
      return p;
    }
  },

  // ═══ ESTAÇÃO METEOROLÓGICA (à Tomás, com certidões) ═══
  meteo: {
    nome: 'Estação meteorológica',
    perguntas: [
      { id: 'th', texto: 'Sonda T/H exterior?', def: true },
      { id: 'luminosidade', texto: 'Sensor de luminosidade (controlo de iluminação/estores)?', def: true },
      { id: 'piranometro', texto: 'Piranómetro (radiação solar — se há solar térmico/PV)?', def: false },
      { id: 'vento', texto: 'Anemómetro + direcção do vento (protecção de estores exteriores)?', def: false },
      { id: 'chuva', texto: 'Sensor de chuva?', def: false },
    ],
    pontos(c, cfg) {
      const p = [];
      if (c.th) p.push({ desc: 'Sonda T/H exterior', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: 2, origem: 'legal: 138-I 6.2 b iv 2 (T e HR do ar exterior no arquivo histórico)' });
      if (c.luminosidade) p.push({ desc: 'Sensor de luminosidade exterior', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', origem: 'norma: 52120 5.2 (daylight control) + 6.1 (estores — controlo combinado = classe A)' });
      if (c.piranometro) p.push({ desc: 'Piranómetro (radiação solar)', funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', origem: 'legal: 138-I 3.6 g (monitorização da produção solar) + prática' });
      if (c.vento) {
        p.push({ desc: 'Anemómetro (velocidade do vento)', funcao: 'Leitura', tipo: 'EAa', sinal: '4-20 mA', origem: 'prática (protecção de estores/toldos exteriores)' });
        p.push({ desc: 'Direcção do vento', funcao: 'Leitura', tipo: 'EAa', sinal: '4-20 mA', origem: 'prática' });
      }
      if (c.chuva) p.push({ desc: 'Sensor de chuva', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (fecho de janelas/clarabóias motorizadas)' });
      return p;
    }
  },

  // ═══ 6. VRF ═══
  vrf: {
    nome: 'Sistema VRF/VRV (gateway)',
    perguntas: [
      { id: 'pot_kw', texto: 'Potência térmica nominal total das unidades exteriores (kW)', def: 50 },
      { id: 'n_grupos', texto: 'Nº de grupos/zonas de unidades interiores (≈ nº de comandos de parede)', def: 10 },
      { id: 'central', texto: 'Central de controlo do fabricante (Daikin ITM, Mitsubishi AE-200, ...)?', def: true },
      { id: 'nivel', texto: 'Integração na GTC?', def: 'monitorização básica', ops: ['monitorização básica', 'completa', 'nenhuma'] },
      { id: 'protocolo', texto: 'Protocolo do gateway de integração?', def: 'BACnet', ops: ['BACnet', 'Modbus'] },
      { id: 'alarme_fisico', texto: 'Alarme geral físico (contacto seco da unidade exterior)?', def: true },
    ],
    pontos(c, cfg) {
      // tags por grupo conforme o nível (o integrador afina depois):
      // básica = on/off, setpoint, T ambiente, avaria+código, filtro ≈ 8
      // completa = mapa alargado do gateway ≈ 18
      const tagsGrupo = c.nivel === 'completa' ? 18 : (c.nivel === 'monitorização básica' ? 8 : 0);
      const p = [];
      if (c.central)
        p.push({ desc: 'Central de controlo do fabricante (ITM/AE-200) — fornecida com o VRF; o gateway de integração liga-se a esta central', funcao: 'Nota', tipo: 'COM', protocolo: '—', tags: 0, sinal: '—', origem: 'prática' });
      if (tagsGrupo > 0)
        p.push({ desc: `Gateway VRF — ${c.n_grupos} grupos × ${tagsGrupo} variáveis (${c.nivel}; dimensiona a licença do supervisor; unidade comanda-se a si própria — GTC agenda, monitoriza, bloqueia comando local)`, funcao: 'Integração', tipo: 'COM', protocolo: c.protocolo, tags: c.n_grupos * tagsGrupo, sinal: c.protocolo, origem: 'prática (Daikin DMS502/Mitsubishi BAC-HD150) + legal: 138-I 2.6 c/d se ≥50 kW' });
      else if ((c.pot_kw || 0) >= 50)
        p.push({ desc: '⚠ SEM integração na GTC escolhida, MAS ≥50 kW: a Portaria EXIGE que o sistema seja integrável em GT com protocolo normalizado — rever a opção ou justificar', funcao: 'Nota', tipo: 'COM', protocolo: '—', tags: 0, sinal: '—', origem: 'legal: 138-I 2.6 c/d' });
      if (c.alarme_fisico)
        p.push({ desc: 'Unidade exterior VRF — alarme geral (contacto seco)', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (avaria visível mesmo com gateway em baixo)' });
      if ((c.pot_kw || 0) / 3 > 12)  // eléctrica estimada ≈ térmica/3 (COP~3)
        p.push(...analisadorEnergia('Unidade exterior VRF', 'legal: 138-I Tabela 18 (consumo de unidades de climatização c/ potência ELÉCTRICA >12 kW: monitorização permanente, bandas ≥30)'));
      return p;
    }
  },

  // ═══ 7. VENTILOCONVECTORES ═══
  fcu: {
    nome: 'Ventiloconvectores (FCU)',
    perguntas: [
      { id: 'modo', texto: 'Controlo dos FCUs?', def: 'bus', ops: ['bus', 'fisico'] },
      { id: 'n', texto: 'Quantidade de unidades', def: 10 },
      { id: 'tags_un', texto: '(modo bus) Tags por unidade no barramento RS485', def: 8 },
      { id: 'n_tubos', texto: 'Sistema a 2 ou 4 tubos?', def: '4', ops: ['2', '4'] },
      { id: 'valv_mod', texto: '(modo físico) Válvulas modulantes (senão ON/OFF)?', def: false },
    ],
    pontos(c, cfg) {
      if (c.modo === 'bus')
        return [{ desc: `FCUs c/ controlador dedicado — ${c.n} unidades × ${c.tags_un} tags em RS485 (setpoint, velocidade, válvulas, T ambiente, modo)`, funcao: 'Integração', tipo: 'COM', protocolo: 'Modbus', tags: c.n * c.tags_un, sinal: 'RS485', origem: 'prática (controlador de zona; norma: 52120 1.1/3.1 var. 3 — comunicação sala↔BACS = classe B+)' }];
      const nv = c.n_tubos === '4' ? 2 : 1;
      const p = [
        { desc: `FCU (×${c.n}) — sonda de temperatura ambiente`, funcao: 'Leitura', tipo: 'EAa', sinal: '0-10V', qtd: c.n, origem: 'norma: 52120 1.1/3.1 (controlo individual por espaço = classe C mínima)' },
        { desc: `FCU (×${c.n}) — comando de velocidades (3 estágios)`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: 3 * c.n, origem: 'prática' },
      ];
      if (c.valv_mod)
        p.push({ desc: `FCU (×${c.n}) — válvula(s) modulante(s) ${c.n_tubos === '4' ? 'AQ+AF' : ''}`, funcao: 'Comando', tipo: 'SA', sinal: '0-10V', qtd: nv * c.n, origem: 'prática' });
      else
        p.push({ desc: `FCU (×${c.n}) — válvula(s) ON/OFF ${c.n_tubos === '4' ? 'AQ+AF' : ''}`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: nv * c.n, origem: 'prática' });
      return p;
    }
  },

  // ═══ 8. CALDEIRA ═══
  caldeira: {
    nome: 'Caldeira (produção de calor)',
    perguntas: [
      { id: 'pot_kw', texto: 'Potência térmica nominal (kW)', def: 150 },
      { id: 'combustivel', texto: 'Combustível?', def: 'gás', ops: ['gás', 'gasóleo', 'biomassa'] },
      { id: 'gateway', texto: 'Integração por gateway (caldeiras modernas)?', def: 'Modbus', ops: ['Modbus', 'nenhum'] },
      { id: 'tags_gw', texto: 'Nº de tags do gateway', def: 30 },
      { id: 'deteccao_gas', texto: 'Detecção de fuga de gás na central (alarme + corte)?', def: true },
    ],
    pontos(c, cfg) {
      const p = [
        { desc: 'Caldeira — autorização de funcionamento (enable)', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática (hardwired)' },
        { desc: 'Caldeira — estado de funcionamento', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Caldeira — avaria geral (bloqueio do queimador)', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'T água ida (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I 6.2 b iv 6 (T água saída de geradores)' },
        { desc: 'T água retorno (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18' },
        { desc: 'Fluxóstato (presença de caudal)', funcao: 'Segurança', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (encravamento hardwired)' },
        { desc: 'Gases de combustão — acessório p/ equipamento de monitorização', funcao: 'Nota', tipo: 'COM', protocolo: '—', tags: 0, sinal: '—', origem: 'legal: 138-I Tabela 18 (gases de combustão: coluna A, bandas ≥30 kW)' },
      ];
      if (c.deteccao_gas && c.combustivel === 'gás') {
        p.push({ desc: 'Central de detecção de gás — alarme de fuga', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (segurança da central térmica)' });
        p.push({ desc: 'Electroválvula de corte de gás — estado', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      }
      if (c.gateway !== 'nenhum')
        p.push({ desc: `Gateway ${c.gateway} — monitorização (modulação, T fumos, diagnósticos; escrita limitada a setpoint)`, funcao: 'Monitorização', tipo: 'COM', protocolo: c.gateway, tags: c.tags_gw, sinal: c.gateway, origem: 'prática + legal: 138-I 2.6 c/d se ≥50 kW' });
      if (c.pot_kw > 70) {
        p.push(...contadorEntalpia('Caldeira (produção)'));
        p.push(...analisadorEnergia('Caldeira (auxiliares)', 'legal: 138-I 6.2 b iii 4 (rendimento de geradores >70 kW)'));
      }
      if (c.pot_kw > 100 && c.combustivel !== 'biomassa')
        p.push({ desc: `Contador de ${c.combustivel} (impulsos ≥20 ms)`, funcao: 'Contagem', tipo: 'IMP', sinal: 'impulsos', origem: 'legal: 138-I 6.2 b iii 5 (combustível por gerador >100 kW)' });
      return p;
    }
  },

  // ═══ 9. TORRE DE ARREFECIMENTO ═══
  torre: {
    nome: 'Torre de arrefecimento',
    perguntas: [
      { id: 'vfd', texto: 'Ventilador com variador?', def: true },
      { id: 'pot_kw', texto: 'Potência eléctrica do ventilador (kW)', def: 11 },
      { id: 'condutividade', texto: 'Controlo de condutividade (purga)?', def: 'medição', ops: ['medição', 'relé', 'não'] },
      { id: 'vibracao', texto: 'Sensor de vibração no ventilador?', def: false },
    ],
    pontos(c, cfg) {
      const p = [...arranqueMotor('Ventilador da torre', cfg)];
      if (c.vfd) p.push(...variador('Ventilador da torre'));
      p.push(
        { desc: 'T água ida à torre (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18 (T circuitos primários)' },
        { desc: 'T água retorno da torre (Ni1000 bainha)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I Tabela 18' },
        { desc: 'T água da bacia (Ni1000)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'prática (protecção anti-gelo/legionela)' },
        { desc: 'Nível da bacia — alto', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Nível da bacia — baixo', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Válvula de enchimento — comando', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Válvula de purga/descarga — comando', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática' },
      );
      if (c.condutividade === 'medição')
        p.push({ desc: 'Condutividade da água (medição contínua)', funcao: 'Leitura', tipo: 'EAa', sinal: '4-20 mA', origem: 'prática (gestão da purga)' });
      else if (c.condutividade === 'relé')
        p.push({ desc: 'Condutivímetro — setpoint excedido (relé)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
      if (c.vibracao)
        p.push({ desc: 'Vibração do ventilador — alarme', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (Cornell: fan vibration)' });
      if (c.pot_kw > 12) p.push(...analisadorEnergia('Torre'));
      return p;
    }
  },

  // ═══ 10. AQS ═══
  aqs: {
    nome: 'AQS — depósitos, circulação e solar',
    perguntas: [
      { id: 'n_sondas_dep', texto: 'Nº de sondas de T no(s) depósito(s)', def: 2 },
      { id: 'bomba_circ', texto: 'Bomba de circulação/retorno de AQS?', def: true },
      { id: 'entalpia', texto: 'Contador de entalpia na produção de AQS?', def: true },
      { id: 'solar_m2', texto: 'Área de solar térmico (m², 0 = não tem)', def: 0 },
      { id: 'valv_mist', texto: 'Válvula misturadora termostática motorizada?', def: false },
    ],
    pontos(c, cfg) {
      const p = [
        { desc: `T depósito(s) AQS — ${c.n_sondas_dep} sonda(s) (Ni1000 bainha)`, funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', qtd: c.n_sondas_dep, origem: 'legal: 138-I Tabela 24 (T água de depósitos: TODAS as bandas) + norma: 52120 2.1/2.2 (gestão multi-sensor = classe A)' },
      ];
      if (c.bomba_circ) {
        p.push(...arranqueMotor('Bomba de circulação AQS', cfg));
        p.push({ desc: 'Circulação AQS — controlo horário (programa)', funcao: 'Software', tipo: 'COM', protocolo: '—', tags: 1, sinal: 'soft', origem: 'legal: 138-I 3.6 e/f (controlo horário obrigatório salvo AQS 24h) + norma: 52120 2.4' });
      }
      if (c.entalpia) p.push(...contadorEntalpia('Produção AQS'));
      if (c.solar_m2 > 0) {
        p.push({ desc: 'T colector solar (Ni1000 alta temperatura)', funcao: 'Leitura', tipo: 'EAp', sinal: 'Ni1000', origem: 'legal: 138-I 3.6 g v (leitura T colector e depósito + diferencial)' });
        p.push(...arranqueMotor('Bomba do circuito solar', cfg));
        if (c.solar_m2 > 15)
          p.push(...contadorEntalpia('Produção solar').map(x => ({ ...x, origem: 'legal: 138-I 3.6 g i (solar >15 m²: monitorização e registo da produção OBRIGATÓRIOS)' })));
      }
      if (c.valv_mist)
        p.push({ desc: 'Válvula misturadora AQS — comando modulante', funcao: 'Comando', tipo: 'SA', sinal: '0-10V', origem: 'prática (protecção anti-queimadura/legionela)' });
      return p;
    }
  },

  // ═══ 11. DESENFUMAGEM ═══
  desenfumagem: {
    nome: 'Desenfumagem (monitorização — o SADI comanda)',
    perguntas: [
      { id: 'n_vent', texto: 'Nº de ventiladores de desenfumagem', def: 2 },
      { id: 'n_registos', texto: 'Nº de registos corta-fumo motorizados', def: 4 },
    ],
    pontos(c, cfg) {
      const p = [];
      for (let i = 1; i <= c.n_vent; i++) {
        p.push({ desc: `Ventilador desenfumagem ${i} — estado de funcionamento`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (GTC monitoriza; comando é do SADI)' });
        p.push({ desc: `Ventilador desenfumagem ${i} — avaria`, funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' });
        p.push({ desc: `Ventilador desenfumagem ${i} — prova de funcionamento (pressostato)`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (Alerton/Belimo smoke control)' });
      }
      for (let i = 1; i <= c.n_registos; i++) {
        p.push({ desc: `Registo corta-fumo ${i} — fim de curso aberto`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'legal: 138-I Tabela 18 (registos corta-fogo: TODAS as bandas)' });
        p.push({ desc: `Registo corta-fumo ${i} — fim de curso fechado`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'legal: 138-I Tabela 18' });
      }
      p.push({ desc: 'Modo fogo activo (sinal do SADI)', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática (a GTC regista o evento; a matriz de fumos é do SADI)' });
      return p;
    }
  },

  // ═══ 12. ROOFTOP / UNIDADE AUTÓNOMA ═══
  rooftop: {
    nome: 'Rooftop / unidade autónoma',
    perguntas: [
      { id: 'pot_kw', texto: 'Potência térmica nominal (kW)', def: 60 },
      { id: 'gateway', texto: 'Integração por gateway?', def: 'Modbus', ops: ['Modbus', 'BACnet', 'nenhum'] },
      { id: 'tags_gw', texto: 'Nº de tags do gateway', def: 40 },
    ],
    pontos(c, cfg) {
      const p = [
        { desc: 'Rooftop — autorização de funcionamento (enable)', funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', origem: 'prática (hardwired)' },
        { desc: 'Rooftop — estado de funcionamento', funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Rooftop — avaria geral', funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', origem: 'prática' },
        { desc: 'Filtros — colmatação (pressostato diferencial)', funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', origem: 'legal: 138-I 1.5 d + Tabela 18' },
      ];
      if (c.gateway !== 'nenhum')
        p.push({ desc: `Gateway ${c.gateway} — monitorização (a máquina comanda-se a si própria; escrita limitada a setpoint/modo)`, funcao: 'Monitorização', tipo: 'COM', protocolo: c.gateway, tags: c.tags_gw, sinal: c.gateway, origem: 'prática + legal: 138-I 2.6 c/d se ≥50 kW' });
      if (c.pot_kw >= 50)
        p.push({ desc: 'NOTA: ≥50 kW — integração em GT obrigatória, protocolo normalizado', funcao: 'Nota', tipo: 'COM', protocolo: '—', tags: 0, sinal: '—', origem: 'legal: 138-I 2.6 c/d' });
      if ((c.pot_kw || 0) / 3 > 12)
        p.push(...analisadorEnergia('Rooftop', 'legal: 138-I Tabela 18 (potência eléctrica >12 kW: monitorização permanente)'));
      return p;
    }
  },

  // ═══ 13. CORTINA DE AR / PEQUENOS EQUIPAMENTOS ═══
  cortina: {
    nome: 'Cortina de ar / pequeno equipamento de ventilação',
    perguntas: [
      { id: 'n', texto: 'Quantidade', def: 2 },
      { id: 'bat_electrica', texto: 'Com bateria eléctrica?', def: true },
    ],
    pontos(c, cfg) {
      const p = [
        { desc: `Cortina de ar (×${c.n}) — comando marcha/paragem`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: c.n, origem: 'prática' },
        { desc: `Cortina de ar (×${c.n}) — estado`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n, origem: 'prática' },
        { desc: `Cortina de ar (×${c.n}) — avaria`, funcao: 'Avaria', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n, origem: 'prática' },
      ];
      if (c.bat_electrica)
        p.push({ desc: `Cortina de ar (×${c.n}) — termóstato de segurança da bateria`, funcao: 'Alarme', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n, origem: 'prática' });
      return p;
    }
  },

  // ═══ ILUMINAÇÃO (obrigatória na GTC ≥290 kW) ═══
  iluminacao: {
    nome: 'Iluminação (integração na GTC)',
    perguntas: [
      { id: 'modo', texto: 'Sistema de controlo?', def: 'DALI', ops: ['DALI', 'KNX', 'DALI+KNX', 'contactores'] },
      { id: 'n_tags_dali', texto: '(DALI) Nº de dispositivos/grupos endereçáveis', def: 64 },
      { id: 'n_tags_knx', texto: '(KNX) Nº de objectos no barramento', def: 0 },
      { id: 'n_zonas_cont', texto: '(contactores) Nº de zonas comandadas por contactor', def: 0 },
      { id: 'contagem', texto: 'Analisador dedicado ao circuito de iluminação?', def: true },
      { id: 'sensores_ext', texto: 'Sensores de presença/luminosidade ligados directamente à GTC (fora do bus)?', def: 0 },
    ],
    pontos(c, cfg) {
      const p = [];
      if (c.modo.includes('DALI') && c.n_tags_dali > 0)
        p.push({ desc: `Barramento DALI — ${c.n_tags_dali} dispositivos/grupos (comando, dimming, estado, avaria de driver)`, funcao: 'Integração', tipo: 'COM', protocolo: 'DALI', tags: c.n_tags_dali, sinal: 'DALI', origem: 'legal: 138-I 4.5 b/d (drivers endereçáveis digitais + PROTOCOLO ABERTO obrigatório) + Tabela 26 (funções mínimas por espaço)' });
      if ((c.modo.includes('KNX')) && c.n_tags_knx > 0)
        p.push({ desc: `Barramento KNX — ${c.n_tags_knx} objectos (cenários, sensores, actuadores)`, funcao: 'Integração', tipo: 'COM', protocolo: 'KNX', tags: c.n_tags_knx, sinal: 'KNX', origem: 'legal: 138-I 4.5 d (protocolo normalizado aberto)' });
      if (c.modo === 'contactores' && c.n_zonas_cont > 0) {
        p.push({ desc: `Iluminação por contactores (×${c.n_zonas_cont} zonas) — comando`, funcao: 'Comando', tipo: 'SD', sinal: 'ON/OFF', qtd: c.n_zonas_cont, origem: 'legal: 138-I 4.5 a (segregação de circuitos por zona) + Tabela 26' });
        p.push({ desc: `Iluminação por contactores (×${c.n_zonas_cont} zonas) — estado`, funcao: 'Estado', tipo: 'ED', sinal: 'ON/OFF', qtd: c.n_zonas_cont, origem: 'prática' });
      }
      if (c.contagem)
        p.push(...analisadorEnergia('Circuito de iluminação', 'legal: 138-I 6.2 b iii 7 (contagem GERAL de iluminação por fonte de energia — obrigatória na GTC)'));
      if (c.sensores_ext > 0)
        p.push({ desc: `Sensores de presença/luminosidade (×${c.sensores_ext}) ligados à GTC`, funcao: 'Leitura', tipo: 'ED', sinal: 'ON/OFF', qtd: c.sensores_ext, origem: 'norma: 52120 5.1 (occupancy control) + legal: Tabela 26' });
      return p;
    }
  },
};

// ─── MODO MANUAL (<100 kW): mínimos por equipamento ───
// "Ninguém faz GTC até 100 kW" — mas os requisitos individuais
// mantêm-se (6.1 b). Isto é o manual do que cada equipamento TEM de ter.
const GTC_MINIMOS = {
  uta: (c) => {
    const m = [
      { t: 'Controlo automático: paragem/arranque por HORÁRIO ou por ocupação — pelo menos uma das duas funções', o: 'legal: 138-I 2.6 a' },
      { t: 'Pressostatos diferenciais nos filtros com alerta de colmatação (no mínimo, lâmpada no QE AVAC)', o: 'legal: 138-I 1.5 d + Tabela 18' },
      { t: 'Sinalização de funcionamento e avaria dos ventiladores no QE AVAC (lâmpadas ou DDC)', o: 'prática' },
      { t: 'Paragem por sinal do SADI (interligação de incêndio)', o: 'prática' },
    ];
    if (c.recuperador && c.recuperador !== 'nenhum')
      m.push({ t: 'Protecção anti-gelo do recuperador', o: 'norma: 52120 4.6' });
    if (c.bat_dx && c.bat_dx !== 'não')
      m.push({ t: 'Encravamento da unidade condensadora DX com o ventilador de insuflação', o: 'prática' });
    if ((c.bat_el_kw || 0) > 12)
      m.push({ t: 'Bateria eléctrica >12 kW: CONTADOR de energia obrigatório (lâmpada não conta kWh)', o: 'legal: 138-I Tabela 18' });
    m.push({ t: 'Se o caudal da UTA ≥3.000 m³/h: tem de ser INTEGRÁVEL em GT (contactos/protocolo disponíveis), mesmo sem GTC no edifício', o: 'legal: 138-I 1.5 c' });
    return m;
  },
  ventilador: (c) => {
    const m = [
      { t: 'Sinalização de funcionamento e avaria no QE AVAC (lâmpadas ou DDC)', o: 'prática' },
      { t: 'Comando automático por horário (relógio no QE) ou por presença/necessidade', o: 'legal: 138-I 2.6 a (por analogia) + prática' },
    ];
    if ((c.pot_kw || 0) > 12)
      m.push({ t: '>12 kW: CONTADOR de energia obrigatório', o: 'legal: 138-I Tabela 18' });
    else if ((c.pot_kw || 0) > 1)
      m.push({ t: '>1 kW: prever ACESSÓRIO que permita integrar contagem de energia (não precisa de estar instalada — precisa de ser possível)', o: 'legal: 138-I Tabela 18 (coluna A)' });
    if (c.prova) m.push({ t: 'Prova de caudal (pressostato) nos ventiladores críticos', o: 'prática' });
    return m;
  },
  bombas: (c) => {
    const m = [
      { t: 'Sinalização de funcionamento e avaria no QE (lâmpadas ou DDC)', o: 'prática' },
      { t: 'Paragem automática quando não há necessidade (horário, termóstato ou pressostato) — bomba a rodar 24/7 sem carga é dinheiro na parede', o: 'norma: 52120 1.4/3.4' },
    ];
    if (c.n_bombas > 1) m.push({ t: 'Grupo duplo: alternância periódica duty/standby (manual com registo, ou automática se houver controlador)', o: 'prática' });
    if ((c.pot_kw || 0) * (c.n_bombas || 1) > 12)
      m.push({ t: 'Grupo >12 kW: CONTADOR de energia obrigatório', o: 'legal: 138-I Tabela 18' });
    return m;
  },
  chiller: (c) => {
    const m = [
      { t: 'Controlador próprio da máquina; encravamento por fluxóstato no evaporador', o: 'prática' },
      { t: 'T de saída de água visível permanentemente (display do controlador serve)', o: 'legal: 138-I Tabela 18' },
    ];
    if ((c.pot_kw || 0) >= 50)
      m.push({ t: '≥50 kW: o equipamento TEM de ser integrável em gestão técnica (interface/protocolo disponível) — escrever na MD como é cumprido', o: 'legal: 138-I 2.6 c/d' });
    if ((c.pot_kw || 0) / 3 > 12)
      m.push({ t: 'Potência eléctrica >12 kW: CONTADOR de energia obrigatório', o: 'legal: 138-I Tabela 18' });
    return m;
  },
  vrf: (c) => {
    const m = [
      { t: 'Central de controlo do fabricante = controlo individual por espaço (cumpre o mínimo da norma) E monitorização de T por zona (cumpre a Tabela 18) — ESCREVER NA MD que estes requisitos são assegurados pela central', o: 'norma: 52120 1.1/3.1 + legal: Tabela 18' },
      { t: 'Alarme geral da unidade exterior no QE (contacto seco + lâmpada) — avaria visível sem ir ao terraço', o: 'prática' },
    ];
    if ((c.pot_kw || 0) / 3 > 12)
      m.push({ t: 'Potência eléctrica >12 kW (típico acima de ~40 kW térmicos): CONTADOR de energia da unidade exterior OBRIGATÓRIO — o "às vezes meto contador" passa a "meto sempre"', o: 'legal: 138-I Tabela 18' });
    if ((c.pot_kw || 0) >= 50)
      m.push({ t: '≥50 kW: sistema tem de ser INTEGRÁVEL em GT — o gateway existir no mercado cumpre; indicar o modelo na MD', o: 'legal: 138-I 2.6 c/d' });
    return m;
  },
  rooftop: (c) => GTC_MINIMOS.vrf(c),
  caldeira: (c) => {
    return [
      { t: 'Controlador próprio com T de saída visível', o: 'legal: 138-I Tabela 18' },
      { t: 'Central térmica a gás: detecção de fuga com corte automático (electroválvula)', o: 'prática (segurança)' },
      { t: 'Sinalização de avaria/bloqueio do queimador no QE', o: 'prática' },
    ];
  },
  torre: () => [
    { t: 'Sinalização de funcionamento e avaria no QE', o: 'prática' },
    { t: 'Níveis da bacia com alarme visível (mín. lâmpada); reposição automática de água', o: 'prática' },
    { t: 'Purga por temporizador ou condutividade — e plano de legionela em dia', o: 'prática' },
  ],
  aqs: (c) => {
    const m = [
      { t: 'Circulação de AQS com CONTROLO HORÁRIO (relógio) — obrigatório, excepto utilização 24h', o: 'legal: 138-I 3.6 e/f' },
      { t: 'T do depósito visível permanentemente (termómetro ou display do controlador)', o: 'legal: 138-I Tabela 24 (todas as bandas)' },
    ];
    if ((c.solar_m2 || 0) > 0)
      m.push({ t: 'Solar forçado: controlador diferencial com leitura de T do colector E do depósito', o: 'legal: 138-I 3.6 g v' });
    if ((c.solar_m2 || 0) > 15)
      m.push({ t: 'Solar >15 m²: monitorização E REGISTO da produção obrigatórios (contador de entalpia no circuito solar)', o: 'legal: 138-I 3.6 g i' });
    return m;
  },
  fcu: () => [
    { t: 'Termóstato individual por espaço (ou grupo pequeno) — é o mínimo de controlo por compartimento da norma', o: 'norma: 52120 1.1/3.1 (classe C)' },
    { t: 'Fecho de válvulas/paragem por horário ou não-ocupação', o: 'legal: 138-I 2.6 a' },
  ],
  iluminacao: () => [
    { t: 'As funções mínimas da Tabela 26 por tipo de espaço aplicam-se MESMO SEM GTC (presença, movimento, horário, regulação — conforme o espaço)', o: 'legal: 138-I 4.5 c + Tabela 26' },
    { t: 'Segregação de circuitos por zona/fachada/filas junto às janelas', o: 'legal: 138-I 4.5 a' },
  ],
  registos: () => [
    { t: 'Estado dos registos corta-fogo: exigido em TODAS as bandas de potência — no mínimo, sinalização na central SADI', o: 'legal: 138-I Tabela 18' },
  ],
  desenfumagem: () => [
    { t: 'Comando e matriz de fumos no SADI; a eventual GTC apenas monitoriza', o: 'prática' },
  ],
  cortina: () => [
    { t: 'Comando por horário ou contacto de porta; termóstato de segurança na bateria eléctrica', o: 'prática' },
  ],
  transversais: (c) => [
    { t: 'T interior por zona: visível permanentemente (termóstatos/central de sistema servem) — exigida em todas as bandas', o: 'legal: 138-I Tabela 18' },
  ],
  meteo: () => [],
};

function gerarMinimos(equipamentos) {
  const out = [];
  for (const eq of equipamentos) {
    const t = GTC_TEMPLATES[eq.template];
    if (!t) continue;
    const c = {};
    t.perguntas.forEach(q => { c[q.id] = (eq.opcoes && q.id in eq.opcoes) ? eq.opcoes[q.id] : q.def; });
    const fn = GTC_MINIMOS[eq.template];
    const itens = fn ? fn(c) : [{ t: 'Requisitos de controlo adequado individuais do sistema', o: 'legal: DL 101-D 6.º/4 b v + 138-I 6.1 b' }];
    out.push({ equipamento: eq.nome || t.nome, template: t.nome, itens });
  }
  return out;
}

// ─── motor: gerar lista + totais ───
function gerarLista(equipamentos, cfg) {
  cfg = cfg || {};
  const linhas = [];
  for (const eq of equipamentos) {
    const t = GTC_TEMPLATES[eq.template];
    if (!t) continue;
    const c = {};
    t.perguntas.forEach(q => { c[q.id] = (eq.opcoes && q.id in eq.opcoes) ? eq.opcoes[q.id] : q.def; });
    const pts = t.pontos(c, cfg).map(pt => ({ equipamento: eq.nome || t.nome, quadro: eq.quadro || 'QGTC.1', ...pt, qtd: pt.qtd || 1 }));
    linhas.push(...pts);
  }
  return linhas;
}

// ─── VERIFICAÇÃO LEGAL: as regras de limiar da 138-I ───
// dados: { pc_global, caudal_tudo_ar, pot_rejeicao, ocup_menor_50,
//          caudal_ar_novo, area_solar, multi_fraccao, ges,
//          equipamentos: [{nome, pot_kw (térmica), pot_el_kw, caudal_m3h}] }
function verificarLegal(d) {
  const R = [];
  const add = (aplicavel, texto, origem) => R.push({ aplicavel, texto, origem });
  // GT/GTC por potência global
  if (d.pc_global >= 290)
    add(true, `PC ${d.pc_global} kW ≥290 → SGTC obrigatória, CLASSE A (EN 15232) desde 01-01-2025; contagens 6.2 b iii completas + arquivo 6 anos a 15 min`, '138-I Tabelas 27/28 + 6.2');
  else if (d.pc_global >= 100)
    add(true, `PC ${d.pc_global} kW em [100;290[ → Sistema de Gestão Técnica (SGT) obrigatório`, '138-I Tabela 27');
  else
    add(true, `PC ${d.pc_global} kW <100 → sem SACE obrigatório, MAS requisitos de controlo adequado por sistema individual mantêm-se`, '138-I 6.1 b');
  // iluminação — entra na GTC no escalão de cima
  add(d.pc_global >= 290,
    'ILUMINAÇÃO na GTC: contagem geral por fonte de energia obrigatória + controlo em protocolo normalizado ABERTO integrado no SACE + funções mínimas da Tabela 26 por tipo de espaço', '138-I 6.2 b iii 7 + 4.5 c/d');
  add(d.pc_global >= 290,
    'AVISO FUTURO: EPBD 2024 — controlos automáticos de iluminação por zonas c/ detecção de ocupação até 31-12-2027 (>290 kW); transposição PT pendente', 'Directiva (UE) 2024/1275 art. 13.º/12 a');
  // CO2 — a "regra de merda" clássica
  add(d.pc_global > 100 && d.ocup_menor_50,
    'Caudal de ar novo VARIÁVEL por CO2 e/ou presença OBRIGATÓRIO (PC>100 kW + espaços c/ ocupação média <50% da máxima)', '138-I 1.5 b');
  // free-cooling
  add((d.caudal_tudo_ar || 0) > 10000,
    `Free-cooling obrigatório (Σ caudais insuflação "tudo-ar" ${d.caudal_tudo_ar} m³/h >10.000)`, '138-I 2.3 b');
  // recuperação
  add((d.pot_rejeicao || 0) > 80,
    `Recuperação de calor ≥50% no ar de rejeição obrigatória (Σ rejeição ${d.pot_rejeicao} kW >80)`, '138-I 2.3 c');
  // integração em GT por equipamento
  for (const e of (d.equipamentos || [])) {
    if ((e.pot_kw || 0) >= 50)
      add(true, `${e.nome}: ≥50 kW → integração em GT obrigatória, protocolo normalizado/aberto`, '138-I 2.6 c/d (clima) · 3.6 b (AQS)');
    if ((e.pot_el_kw || 0) > 12)
      add(true, `${e.nome}: >12 kW eléctricos → contagem individualizada obrigatória`, '138-I 6.2 b iii 3');
    if ((e.pot_kw || 0) > 70)
      add(true, `${e.nome}: gerador >70 kW → contagens p/ RENDIMENTO (térmica+eléctrica, EER/COP em 6 janelas via SACE)`, '138-I 6.2 b iii 4 + 2.5 d 7');
    if ((e.pot_kw || 0) > 100 && e.combustivel)
      add(true, `${e.nome}: gerador a combustível >100 kW → contagem individual de combustível`, '138-I 6.2 b iii 5');
  }
  add((d.caudal_ar_novo || 0) >= 3000,
    `Ar novo mecânico ${d.caudal_ar_novo} m³/h ≥3.000 → integrável em GT + alerta de colmatação de filtros parametrizável`, '138-I 1.5 c/d');
  add((d.area_solar || 0) > 15,
    `Solar térmico ${d.area_solar} m² >15 → monitorização e registo da produção obrigatórios`, '138-I 3.6 g i');
  add(!!d.multi_fraccao,
    'Sistema centralizado multi-fracção → contagem de energia POR FRACÇÃO nas redes de AQ e água refrigerada', '138-I 2.6 e + 3.6 d');
  add(!!d.ges,
    'GES (≥1.000 m² / 500 m² comercial) → monitorização ANUAL de consumos reportada ao Portal SCE; carregadores VE integráveis em GT', 'DL 101-D art. 12.º/4 + 138-I 8.4 c');
  // o que vem (EPBD 2024/1275 — transposição pendente)
  add(d.pc_global > 70 && d.pc_global < 290,
    `AVISO FUTURO: EPBD 2024 baixa o limiar BACS para 70 kW até 31-12-2029 (transposição PT pendente) — este edifício (${d.pc_global} kW) VAI ficar abrangido; prever espaço/arquitectura já`, 'Directiva (UE) 2024/1275 art. 13.º/9 b');
  return R;
}

function totais(linhas, reservaPct) {
  const tipos = ['ED', 'SD', 'EAa', 'EAp', 'SA', 'IMP'];
  const porQuadro = {};
  let tagsCom = 0;
  for (const l of linhas) {
    if (!porQuadro[l.quadro]) porQuadro[l.quadro] = { ED: 0, SD: 0, EAa: 0, EAp: 0, SA: 0, IMP: 0 };
    if (tipos.includes(l.tipo)) porQuadro[l.quadro][l.tipo] += l.qtd;
    if (l.tipo === 'COM') tagsCom += (l.tags || 0);
  }
  const reserva = {};
  for (const q in porQuadro) {
    reserva[q] = {};
    for (const t of tipos) {
      const n = porQuadro[q][t];
      reserva[q][t] = n > 0 ? Math.max(2, Math.ceil(n * (reservaPct || 20) / 100)) : 0;
    }
  }
  const io = Object.values(porQuadro).reduce((s, q) => s + tipos.reduce((a, t) => a + q[t], 0), 0);
  return { porQuadro, reserva, totalIO: io, tagsCom, totalTags: io + tagsCom };
}

if (typeof module !== 'undefined') module.exports = { GTC_TEMPLATES, gerarLista, totais, verificarLegal, GTC_MINIMOS, gerarMinimos };
