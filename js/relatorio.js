// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Relatório SCIE
// relatorio.js — Geração de relatório Word (.docx)
// ═══════════════════════════════════════════════════

async function gerarRelatorioWord() {
  if (!currentProject) { alert('Crie um projecto primeiro.'); return; }
  if (projectLog.length === 0) { alert('Faça pelo menos um cálculo primeiro.'); return; }

  if (typeof docx === 'undefined') {
    alert('A carregar biblioteca de documentos. Tente novamente em alguns segundos.');
    return;
  }

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, AlignmentType, BorderStyle, WidthType,
    HeadingLevel, PageBreak, TabStopPosition, TabStopType,
    ShadingType, VerticalAlign, TableLayoutType
  } = docx;

  // ─── Estilos reutilizáveis ───
  const COR_AZUL = '1E8AFF';
  const COR_CINZA = '666666';
  const COR_HEADER_BG = 'E8F0FE';
  const FONT = 'Calibri';
  const FONT_TITLE = 'Calibri';

  function txt(text, opts = {}) {
    return new TextRun({
      text,
      font: opts.font || FONT,
      size: opts.size || 22, // 11pt
      bold: opts.bold || false,
      italics: opts.italics || false,
      color: opts.color || '333333',
      ...opts
    });
  }

  function para(children, opts = {}) {
    if (typeof children === 'string') children = [txt(children)];
    return new Paragraph({
      children,
      spacing: { after: opts.after !== undefined ? opts.after : 120 },
      alignment: opts.alignment || AlignmentType.LEFT,
      heading: opts.heading,
      indent: opts.indent,
      ...opts
    });
  }

  function cellP(text, opts = {}) {
    return new TableCell({
      children: [para(typeof text === 'string' ? [txt(text, opts.textOpts || {})] : text, {
        after: 40,
        alignment: opts.alignment || AlignmentType.LEFT
      })],
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
      verticalAlign: VerticalAlign.CENTER
    });
  }

  // ─── Header / Footer ───
  const headerSection = new Header({
    children: [
      para([
        txt('[ Insira aqui o logótipo da empresa ]', { color: '999999', size: 18, italics: true }),
        txt('\t'),
        txt('ALIOS ONE — Cálculos de Engenharia', { color: COR_AZUL, size: 16, italics: true })
      ], { alignment: AlignmentType.JUSTIFIED, after: 0 })
    ]
  });

  const footerSection = new Footer({
    children: [
      para([
        txt('[ Nome da empresa ] | [ Morada ] | [ Telefone ] | [ Email ]', {
          color: '999999', size: 16, italics: true
        })
      ], { alignment: AlignmentType.CENTER, after: 0 })
    ]
  });

  // ─── Capa ───
  const dataFormatada = new Date(currentProject.criado).toLocaleDateString('pt-PT', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const capa = [
    para('', { after: 2000 }),
    para('', { after: 2000 }),
    para([txt('[ Insira aqui o logótipo da empresa ]', {
      color: '999999', size: 28, italics: true
    })], { alignment: AlignmentType.CENTER, after: 600 }),
    para('', { after: 1200 }),
    para([txt('RELATÓRIO DE CÁLCULO', {
      font: FONT_TITLE, size: 40, bold: true, color: COR_AZUL
    })], { alignment: AlignmentType.CENTER, after: 120 }),
    para([txt('Segurança Contra Incêndio em Edifícios', {
      font: FONT_TITLE, size: 28, color: COR_CINZA
    })], { alignment: AlignmentType.CENTER, after: 800 }),
    para('', { after: 400 }),
    para([txt(currentProject.nome, {
      font: FONT_TITLE, size: 32, bold: true, color: '222222'
    })], { alignment: AlignmentType.CENTER, after: 200 }),
  ];

  if (currentProject.morada) {
    capa.push(para([txt(currentProject.morada, {
      size: 24, color: COR_CINZA
    })], { alignment: AlignmentType.CENTER, after: 120 }));
  }

  if (currentProject.requerente) {
    capa.push(para([txt('Requerente: ' + currentProject.requerente, {
      size: 24, color: COR_CINZA
    })], { alignment: AlignmentType.CENTER, after: 120 }));
  }

  capa.push(
    para('', { after: 1600 }),
    para([txt(dataFormatada, { size: 22, color: COR_CINZA })], {
      alignment: AlignmentType.CENTER, after: 120
    }),
    para([txt('Calculado com ALIOS ONE — Cálculos de Engenharia', {
      size: 18, italics: true, color: COR_AZUL
    })], { alignment: AlignmentType.CENTER, after: 0 }),
    para('', { after: 0 }) // page break handled by next section
  );

  // ─── Capítulo: Carga de Incêndio ───
  const incendioLogs = projectLog.filter(l => l.tool === 'carga_incendio');
  const capitulo = [];

  if (incendioLogs.length > 0) {
    const lastCalc = incendioLogs[incendioLogs.length - 1];
    const res = lastCalc.result;

    // Título
    capitulo.push(
      para([txt('CARGA DE INCÊNDIO MODIFICADA', {
        font: FONT_TITLE, size: 28, bold: true, color: COR_AZUL
      })], { after: 300 })
    );

    // 1. Enquadramento
    capitulo.push(
      para([txt('1. Enquadramento regulamentar', {
        size: 24, bold: true, color: '222222'
      })], { after: 120 }),
      para('O presente cálculo tem por objectivo a determinação da densidade de carga de incêndio modificada, nos termos do Despacho n.º 8954/2020, de 18 de setembro (que procede à primeira alteração ao Despacho n.º 2074/2009, de 15 de janeiro), para efeitos de classificação da categoria de risco da utilização-tipo, conforme o disposto no artigo 12.º do Decreto-Lei n.º 220/2008, de 12 de novembro, na redação dada pela Lei n.º 123/2019, de 18 de outubro.'),
      para('O cálculo é aplicável às utilizações-tipo XI (Bibliotecas e Arquivos) e XII (Industriais, Oficinas e Armazéns).')
    );

    // 2. Método
    capitulo.push(
      para([txt('2. Método de cálculo', {
        size: 24, bold: true, color: '222222'
      })], { after: 120 }),
      para('Foi utilizado o método de cálculo probabilístico, previsto no n.º 2 do artigo 3.º do referido Despacho, baseado nos valores estatísticos da densidade de carga de incêndio (qsi) e da carga de incêndio por unidade de volume (qvi) constantes do Quadro II anexo ao Despacho.')
    );

    // 3. Fórmulas
    capitulo.push(
      para([txt('3. Expressões de cálculo', {
        size: 24, bold: true, color: '222222'
      })], { after: 120 }),
      para([txt('Para as actividades inerentes às UT XI e XII, excepto armazenamento:', {
        italics: true
      })]),
      para([txt('qs = Σ(qsi × Si × Ci × Rai) / S   [MJ/m²]', {
        font: 'Consolas', size: 20, bold: true
      })], { after: 200 }),
      para([txt('Para as actividades de armazenamento:', { italics: true })]),
      para([txt('qs = Σ(qvi × hi × Si × Ci × Rai) / S   [MJ/m²]', {
        font: 'Consolas', size: 20, bold: true
      })], { after: 200 }),
      para([txt('Para a totalidade da utilização-tipo:', { italics: true })]),
      para([txt('q = Σ(qSk × Sk) / Σ(Sk)   [MJ/m²]', {
        font: 'Consolas', size: 20, bold: true
      })], { after: 200 }),
      para([txt('Em que:', { bold: true })]),
      para([txt('qsi', { bold: true, italics: true }), txt(' — valor estatístico da densidade de carga de incêndio relativa ao tipo de actividade (i), em MJ/m²')]),
      para([txt('qvi', { bold: true, italics: true }), txt(' — valor estatístico da carga de incêndio por unidade de volume relativa à zona de armazenamento (i), em MJ/m³')]),
      para([txt('hi', { bold: true, italics: true }), txt(' — altura de armazenagem da zona de armazenamento (i), em m')]),
      para([txt('Si', { bold: true, italics: true }), txt(' — área afecta à zona de actividade (i), em m²')]),
      para([txt('Ci', { bold: true, italics: true }), txt(' — coeficiente adimensional de combustibilidade do constituinte combustível de maior risco de combustibilidade presente na zona de actividade (i)')]),
      para([txt('Rai', { bold: true, italics: true }), txt(' — coeficiente adimensional de activação do constituinte combustível (i), em função do tipo de actividade')]),
      para([txt('S', { bold: true, italics: true }), txt(' — área útil do compartimento corta-fogo, em m²')])
    );

    // 4. Classificação
    capitulo.push(
      para([txt('4. Categorias de risco', {
        size: 24, bold: true, color: '222222'
      })], { after: 120 }),
      para('A classificação da categoria de risco para as UT XI e XII, em função da densidade de carga de incêndio modificada, é a seguinte:')
    );

    // Tabela de categorias
    const catHeaders = ['Categoria', 'Nível de risco', 'qs (MJ/m²)'];
    const catData = [
      ['1.ª', 'Reduzido', '≤ 500'],
      ['2.ª', 'Moderado', '≤ 5 000'],
      ['3.ª', 'Elevado', '≤ 15 000'],
      ['4.ª', 'Muito elevado', '> 15 000']
    ];

    capitulo.push(new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: catHeaders.map(h => cellP(h, {
            shading: COR_AZUL,
            textOpts: { bold: true, color: 'FFFFFF', size: 20 }
          }))
        }),
        ...catData.map(row => new TableRow({
          children: row.map(cell => cellP(cell, {
            textOpts: { size: 20 },
            alignment: AlignmentType.CENTER
          }))
        }))
      ]
    }));

    capitulo.push(para('', { after: 200 }));

    // 5. Cálculos por compartimento
    capitulo.push(
      para([txt('5. Cálculo por compartimento corta-fogo', {
        size: 24, bold: true, color: '222222'
      })], { after: 120 })
    );

    const comps = res.compartimentos;
    comps.forEach((comp, idx) => {
      capitulo.push(
        para([txt(`5.${idx + 1}. ${comp.nome} — ${comp.area} m²`, {
          size: 22, bold: true
        })], { after: 120 })
      );

      // Tabela de actividades
      const actHeaders = ['Actividade', 'Modo', 'qs parcial (MJ/m²)'];
      capitulo.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: actHeaders.map(h => cellP(h, {
              shading: COR_HEADER_BG,
              textOpts: { bold: true, size: 20, color: '333333' }
            }))
          }),
          ...comp.linhas.map(l => new TableRow({
            children: [
              cellP(l.nome, { textOpts: { size: 20 } }),
              cellP(l.modo, { textOpts: { size: 20 } }),
              cellP(l.contribuicao.toFixed(1), {
                textOpts: { size: 20 },
                alignment: AlignmentType.RIGHT
              })
            ]
          }))
        ]
      }));

      // Resultado do compartimento
      capitulo.push(
        para(''),
        para([
          txt('Densidade de carga de incêndio modificada: ', { bold: true }),
          txt(`${comp.qs.toFixed(1)} MJ/m²`, { bold: true, color: COR_AZUL })
        ]),
        para([
          txt('Categoria de risco: ', { bold: true }),
          txt(`${comp.categoria.cat} Categoria — ${comp.categoria.nivel}`, {
            bold: true,
            color: comp.categoria.cat === '1ª' ? '22C55E' : comp.categoria.cat === '2ª' ? 'F59E0B' : 'EF4444'
          })
        ]),
        para('')
      );
    });

    // 6. Resultado global
    if (comps.length > 1) {
      capitulo.push(
        para([txt('6. Resultado global da utilização-tipo', {
          size: 24, bold: true, color: '222222'
        })], { after: 120 })
      );

      // Tabela resumo de compartimentos
      capitulo.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['Compartimento', 'Área (m²)', 'qs (MJ/m²)', 'Categoria'].map(h =>
              cellP(h, { shading: COR_HEADER_BG, textOpts: { bold: true, size: 20, color: '333333' } })
            )
          }),
          ...comps.map(c => new TableRow({
            children: [
              cellP(c.nome, { textOpts: { size: 20 } }),
              cellP(c.area.toString(), { textOpts: { size: 20 }, alignment: AlignmentType.RIGHT }),
              cellP(c.qs.toFixed(1), { textOpts: { size: 20 }, alignment: AlignmentType.RIGHT }),
              cellP(c.categoria.cat, { textOpts: { size: 20, bold: true }, alignment: AlignmentType.CENTER })
            ]
          }))
        ]
      }));

      capitulo.push(para(''));
    }

    // Resultado final
    const secNum = comps.length > 1 ? '6' : '5';
    if (comps.length <= 1) {
      capitulo.push(
        para([txt(`${secNum}. Resultado`, {
          size: 24, bold: true, color: '222222'
        })], { after: 120 })
      );
    }

    capitulo.push(
      para([
        txt(`Densidade de carga de incêndio modificada da UT: `, { bold: true, size: 24 }),
        txt(`${res.q_total.toFixed(1)} MJ/m²`, { bold: true, size: 28, color: COR_AZUL })
      ], { after: 60 }),
      para([
        txt('Categoria de risco: ', { bold: true, size: 24 }),
        txt(`${res.categoria.cat} Categoria — ${res.categoria.nivel}`, {
          bold: true, size: 28,
          color: res.categoria.cat === '1ª' ? '22C55E' : res.categoria.cat === '2ª' ? 'F59E0B' : 'EF4444'
        })
      ])
    );

    if (res.q_class !== res.q_total) {
      capitulo.push(
        para([txt(`Nota: Para efeitos de classificação, considerou-se qs ÷ 10 = ${res.q_class.toFixed(1)} MJ/m² (armazenamento).`, {
          italics: true, color: COR_CINZA, size: 20
        })])
      );
    }
  }

  // ─── Montar documento ───
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        headers: { default: headerSection },
        footers: { default: footerSection },
        children: [
          ...capa,
          new Paragraph({ children: [], pageBreakBefore: true }),
          ...capitulo
        ]
      }
    ]
  });

  // ─── Gerar e download ───
  try {
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nomeFile = currentProject.nome.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').trim();
    a.download = `${nomeFile} - Relatório SCIE.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Erro ao gerar relatório:', e);
    alert('Erro ao gerar o relatório. Verifique a consola para mais detalhes.');
  }
}
