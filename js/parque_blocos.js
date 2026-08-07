// ═══════════════════════════════════════════════════
// ALIOS ONE — Parque de Máquinas: BLOCOS v0.1
// parque_blocos.js — a biblioteca de blocos partilhada
// (irmão do gtc_regras.js; fonte: parque_maquinas/)
//
// Arquitectura (da Beatriz, 07/08/2026): a ferramenta é um
// índice; as perguntas puxam blocos escritos à parte. Cada
// bloco serve QE + GTC + caderno. Uma fonte de verdade.
// Etiquetas: [PRATICA] [ESCOLA] [LEI] [REGRA-BB] [DOUTRINA]
// ═══════════════════════════════════════════════════

// A escada "quem manda na máquina" (6 degraus)
const PARQUE_QUEM_MANDA = {
  1: { id: 'manual', nome: 'Manual', desc: 'comutador M/0/A e um humano' },
  2: { id: 'relogio', nome: 'Relógio', desc: 'interruptor horário no QE — c/ reserva de marcha [REGRA-BB]' },
  3: { id: 'sonda', nome: 'Sonda', desc: 'termóstato/pressóstato/sonda a comutar directo' },
  4: { id: 'rele_prog', nome: 'Relé programável', desc: 'Zelio/mini-PLC no quadro [ESCOLA Malha34: SR2B201B]' },
  5: { id: 'fabricante', nome: 'Controlador do fabricante', desc: 'VRF, UTA c/ controlo integrado, Carel' },
  6: { id: 'gtc', nome: 'GTC', desc: 'DDC/GTC da casa' },
};

// ─── Árvore de perguntas v0.1 ───
const PARQUE_PERGUNTAS = [
  { id: 'P0', texto: 'Potência térmica nominal global do edifício (PC)? <span class="dim">(decide contagens, sinalização no quadro e obrigação de GTC — 138-I)</span>',
    opcoes: [
      { v: 'b30', label: '≤ 30 kW', parametriza: { pc: 'b30' } },
      { v: 'b100', label: '31–100 kW', parametriza: { pc: 'b100' } },
      { v: 'b289', label: '101–289 kW', parametriza: { pc: 'b289' } },
      { v: 'b290', label: '≥ 290 kW', parametriza: { pc: 'b290' } },
    ] },
  { id: 'P1', texto: 'O sistema é a <b>água</b>, <b>expansão directa</b>, ou <b>misto</b>?',
    opcoes: [
      { v: 'agua', label: 'Água', puxa: ['bc_reversivel', 'malha_agua'] },
      { v: 'ed', label: 'Expansão directa', puxa: ['vrf'] },
      { v: 'misto', label: 'Misto', puxa: ['vrf', 'bc_reversivel', 'malha_agua'] },
    ] },
  { id: 'P2', texto: 'Tem <b>UTAs / UTANs</b>?',
    opcoes: [
      { v: 'sim', label: 'Sim', puxa: ['uta'] },
      { v: 'nao', label: 'Não', puxa: [] },
    ] },
  { id: 'P3', texto: 'Tem <b>ventiladores de extracção</b> (IS, gerais, arrecadações)?',
    opcoes: [
      { v: 'sim', label: 'Sim', puxa: ['ve'] },
      { v: 'nao', label: 'Não', puxa: [] },
    ] },
  { id: 'P4', texto: 'Tem <b>solar térmico</b> com apoio?',
    opcoes: [
      { v: 'sim', label: 'Sim', puxa: ['solar_termico'] },
      { v: 'nao', label: 'Não', puxa: [] },
    ] },
  { id: 'P5', texto: 'Rede a <b>2 tubos</b> ou <b>4 tubos</b>? <span class="dim">(2 tubos moradias / 4 tubos clínicas [PRATICA])</span>',
    so_se: 'malha_agua', // só pergunta se a malha de água foi puxada
    opcoes: [
      { v: '2t', label: '2 tubos', parametriza: { malha_agua: '2 tubos' } },
      { v: '4t', label: '4 tubos', parametriza: { malha_agua: '4 tubos' } },
    ] },
];

// ─── Blocos de equipamento v0.1 ───
const PARQUE_BLOCOS = {

  vrf: {
    nome: 'VRF/VRV (UE + UIs)',
    icone: '❄️',
    familia: 'expansao_directa',
    quem_manda: 5,
    parque: {
      campos: ['Pn UE (kW)', 'nº UIs', 'gás refrigerante', 'nível de integração'],
      avisos: ['Integração «nenhuma» + ≥50 kW → repensar (armadilha do gtc_regras)'],
    },
    qe: {
      alimentacao: 'UE trifásica dedicada; UIs em circuitos próprios por grupos. Cabo XZ1 (frt, zh). [ESCOLA]',
      arranque: 'Do fabricante (inverter interno) — zero comando no QE.',
      proteccao: 'Disjuntor + diferencial por saída. Contagem eléctrica se el. >12 kW (Tab. 18). [LEI 138-I]',
      comando: 'NENHUM — o quadro só alimenta. [ESCOLA Lopes: até o rótulo era «?VRV»]',
      sinalizacao: 'Nenhuma no QE; estado vem da central do fabricante.',
    },
    gtc: { resumo: '0 pontos físicos + gateway Modbus/BACnet da central do fabricante. [DOUTRINA]' },
    caderno: 'Central do fabricante com nível de integração declarado na compra. Regulação SÓ SE PEDIDA na encomenda. [REGRA-BB]',
  },

  uta: {
    nome: 'UTA / UTAN',
    icone: '🌀',
    familia: 'ar',
    quem_manda: 5,
    parque: {
      campos: ['caudal (m³/h)', 'tudo-ar ou ar novo', 'recuperador', 'baterias (água/DX/eléctrica)', 'humidificador', 'filtros ISO 16890'],
      regras_lei: [
        '[LEI Ecodesign 1253/2014, pág. 11] recuperação 73%/68% + BYPASS obrigatório',
        '[LEI 138-I, 1.2 e) iii] pressóstato de colmatação obrigatório',
        '[LEI] filtros rotulados ISO 16890 — EN 779 (G4/F7) está morta',
        '[LEI] free-cooling só TUDO-AR >10.000 m³/h; UTAN temperada NÃO é tudo-ar [REGRA-BB]',
      ],
    },
    qe: {
      alimentacao: '1 alimentação por UTA, ao quadro DA UTA. EXCEPÇÃO: lança de vapor Carel = circuito próprio. [REGRA-BB]',
      arranque: 'No quadro do fabricante (VFD interno nos ventiladores; variação 0-10V à moda QGT-2023).',
      proteccao: 'Disjuntor + diferencial na saída do QE; o resto é do fabricante.',
      comando: 'NENHUM no QE-AVAC — controlo integrado obrigatório. [REGRA-BB 06/08]',
      sinalizacao: 'SEM lâmpadas no QE (o controlo é do fabricante — lâmpada no QE só diria "tem tensão"). Contactos secos Estado + Avaria da UTA (ESPECIFICAR NA COMPRA) → bornes p/ GTC — POR máquina, NUNCA agrupado. Sem GTC: repetir Avaria em lâmpada. [REGRA-BB 07/08: lâmpada segue o comando, borne segue a máquina]',
    },
    gtc: { resumo: 'Integrada: Modbus (tudo). Não integrada: ED estado/avaria + colmatação POR FILTRO + EA T/H insuflação. Registos motorizados c/ EA+SA (comando E prova de retorno). [ESCOLA QGT-2023]' },
    caderno: 'UTA com controlo integrado e quadro incorporado; regulação especificada na COMPRA. [REGRA-BB]',
  },

  ve: {
    nome: 'Ventilador de extracção',
    icone: '💨',
    familia: 'ar',
    quem_manda: 2,
    parque: {
      campos: ['Pn (kW)', 'caudal (m³/h)', 'mono/tri', 'EC ou AC', 'serviço (contínuo/horário)'],
      avisos: ['[ESCOLA Malha34-2020] extracções IS/cozinha em cobertura já eram EC — considerar EC por defeito'],
    },
    qe: {
      alimentacao: 'Circuito próprio com diferencial dedicado por motor. [ESCOLA Lopes]',
      arranque: 'Directo: guarda-motor DM + contactor KM. Motores EC: alimentação simples (electrónica interna).',
      proteccao: 'Guarda-motor magnetotérmico regulado à In do motor. [ESCOLA]',
      comando: 'Comutador Man/0/Aut; em Aut, relógio IH → relé KH → contactos por circuito (o relógio NUNCA comanda contactores directamente). Relógio COM RESERVA DE MARCHA. [ESCOLA Lopes + REGRA-BB 07/08]',
      sinalizacao: 'AC: verde Estado (KM 13-14) + vermelho Avaria (DM 21-22) por motor + bornes de telesinalização. EC: SEM lâmpadas no QE (a lâmpada seguiria a tensão, não a máquina) — relé de alarme do fabricante (ESPECIFICAR NA COMPRA) → borne GTC; sem GTC, justifica-se repetir a Avaria em lâmpada. [ESCOLA Lopes + REGRA-BB 07/08: lâmpada segue o comando, borne segue a máquina]',
    },
    gtc: { resumo: 'Com GTC: SD comando + ED estado + ED avaria. Sem GTC: os bornes ficam à espera (a régua avant la lettre do Lopes).' },
    caderno: 'Extracção com comando horário; serviços exigentes: 2 velocidades ou EC modulante.',
  },

  bc_reversivel: {
    nome: 'Bomba de calor (chiller reversível c/ módulo hidráulico)',
    icone: '♨️',
    familia: 'agua',
    quem_manda: 5,
    parque: {
      campos: ['Pn frio (kW)', 'Pn quente (kW)', 'módulo hidráulico', 'bombas internas', 'gás'],
      regras_lei: [
        '[LEI 138-I, Tab. 27/28] ≥290 kW → GTC classe A desde 01-01-2025',
        '[LEI] recuperação obrigatória se rejeição >80 kW → ≥50%',
        '[PRATICA→LEI] bombas ANTES do chiller (na aspiração)',
      ],
    },
    qe: {
      alimentacao: 'Saída dedicada de calibre gordo (ref. NCH: chiller 100A / BC 80A), cabo XZ1 R5G. [ESCOLA NCH]',
      arranque: 'Do fabricante (compressores em cascata interna) — o QE não arranca nada.',
      proteccao: 'Disjuntor + diferencial c/ IMUNIDADE a disparos intempestivos (VFD interno). [ESCOLA Malha34 — nota de folha]',
      comando: 'Fluxostato/encravamentos são do fabricante; QE pode levar ON/OFF remoto por contacto seco.',
      sinalizacao: 'Estado + Avaria em bornes p/ GTC. [PRATICA: 3-5 pontos físicos + gateway]',
    },
    gtc: { resumo: 'ED estado + ED avaria + SD permissão + gateway Modbus. GTC NUNCA sequencia chillers — excepção única: N+1 hospitalar c/ sequenciador. [DOUTRINA]' },
    caderno: 'Chiller reversível com módulo hidráulico; arranque e protecções internas do fabricante; QE fornece potência + permissão.',
  },

  solar_termico: {
    nome: 'Solar térmico c/ apoio (AQS)',
    icone: '☀️',
    familia: 'agua_quente',
    quem_manda: 3,
    parque: {
      campos: ['área colectores (m²)', 'depósito (L)', 'apoio (resistência/caldeira/BC)', 'bomba solar'],
      regras_lei: [
        '[LEI] serpentina solar EM BAIXO / resistência EM CIMA — é lei, não opção',
        '[LEI] apoio por efeito de Joule ≤5% / 25 kW',
        '[LEI] BC de AQS aspira de espaços NÃO úteis',
      ],
    },
    qe: {
      alimentacao: 'Resistência de apoio: circuito próprio c/ contactor. Bomba solar: circuito pequeno.',
      arranque: 'Bomba solar: directo (controlador solar comuta). Resistência: contactor.',
      proteccao: 'Resistência c/ guarda-motor + termóstato de segurança de rearme manual (do equipamento).',
      comando: 'Resistência SÓ arranca DE NOITE: relógio no QE em série c/ termóstato — relógio = prioridade no TEMPO, estratificação = prioridade no ESPAÇO. Relógio COM RESERVA DE MARCHA. SEM posição MANUAL (Man = queimar dinheiro + mata o diagnóstico; p/ manutenção há o disjuntor). [REGRA-BB 07/08]',
      sinalizacao: 'Estado da resistência = o detector de mentiras do solar (a trabalhar em Agosto à noite → solar morto). [PRATICA: avarias silenciosas]',
    },
    gtc: { resumo: 'ED estado resistência (diagnóstico!) + EA T depósito se houver GTC; contador de água de reposição denuncia fuga+corrosão. [PRATICA]' },
    caderno: 'Solar com apoio nocturno por relógio; serpentina em baixo, resistência em cima (lei); monitorização do apoio como diagnóstico.',
  },
};

// ─── Blocos de sistema (compõem equipamentos) ───
const PARQUE_BLOCOS_SISTEMA = {
  malha_agua: {
    nome: 'Malha de água fechada',
    icone: '🔁',
    compoe: ['bc_reversivel', 'bomba_primaria', 'garrafa', 'bomba_secundaria_vfd', 'fcu'],
    regras: [
      '[PRATICA] chiller → primária → garrafa → secundária c/ VFD → sonda Δp a 2/3 da rede → FCU 2 vias → 3 vias SÓ no fim de linha (caudal mínimo)',
      '[DOUTRINA] primária caudal constante / secundária variável + lei do cubo',
      '[REGRA-BB] radiante = SÓ aquecimento (nunca arrefecer pelo pavimento)',
      '[DOUTRINA] guarda do ponto de orvalho: regra escrita para nunca disparar',
    ],
    pendentes: ['bomba_primaria', 'garrafa', 'bomba_secundaria_vfd', 'fcu'], // blocos da leva 2 (c/ a lição do VFD)
  },
};
