// ═══════════════════════════════════════════════════
// ALIOS ONE — qe_dxf.js (v0.6)
// Conversor SVG→DXF R12 para os esquemas do QE-AVAC.
// Traduz o subconjunto de SVG que os geradores emitem
// (line, circle, rect, text, path M/L/Z, g translate+scale)
// para ENTITIES: LINE, CIRCLE, POLYLINE, TEXT.
// 1 px SVG = 1 unidade DXF; eixo Y invertido (CAD é y-para-cima).
// [BB + Vasco, 09/09/2026 — "sabes o que era bom? descarregar em dxf!"]
// ═══════════════════════════════════════════════════

function qeSVGparaDXF(svg) {
  const H = parseFloat((svg.match(/height="([\d.]+)"/) || [0, 400])[1]);
  const Y = y => (H - y).toFixed(3);           // inverter eixo
  const N = x => (+x).toFixed(3);
  const e = [];                                 // linhas do DXF

  const line = (x1, y1, x2, y2) => e.push('0','LINE','8','QE-AVAC','10',N(x1),'20',Y(y1),'11',N(x2),'21',Y(y2));
  const circ = (cx, cy, r) => e.push('0','CIRCLE','8','QE-AVAC','10',N(cx),'20',Y(cy),'40',N(r));
  const poly = (pts, fechada) => {
    e.push('0','POLYLINE','8','QE-AVAC','66','1','70', fechada ? '1' : '0');
    pts.forEach(([x, y]) => e.push('0','VERTEX','8','QE-AVAC','10',N(x),'20',Y(y)));
    e.push('0','SEQEND');
  };
  const text = (x, y, t, h, anc) => {
    t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const j = anc === 'middle' ? '1' : (anc === 'end' ? '2' : '0');
    e.push('0','TEXT','8','QE-AVAC-TXT','10',N(x),'20',Y(y),'40',N(h),'1',t);
    if (j !== '0') e.push('72',j,'11',N(x),'21',Y(y));
  };

  // transformação corrente (dos <g> dos símbolos): p' = (tx + k*px, ty - k*py)
  const aplicar = (T, px, py) => T ? [T.tx + T.k * px, T.ty - T.k * py] : [px, py];

  // varrer elementos por ordem, com estado de grupo (os g nunca aninham)
  const re = /<g transform="translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+),[-\d.]+\)"[^>]*>|<\/g>|<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*\/?>|<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"[^>]*\/?>|<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"[^>]*\/?>|<path d="([^"]+)"[^>]*\/?>|<text x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)" text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g;
  let T = null, m;
  while ((m = re.exec(svg)) !== null) {
    if (m[0].startsWith('<g ')) { T = { tx: +m[1], ty: +m[2], k: +m[3] }; continue; }
    if (m[0] === '</g>') { T = null; continue; }
    if (m[4] !== undefined) {            // line
      const [a, b] = aplicar(T, +m[4], +m[5]), [c, d] = aplicar(T, +m[6], +m[7]);
      line(a, b, c, d);
    } else if (m[8] !== undefined) {     // circle
      const [cx, cy] = aplicar(T, +m[8], +m[9]);
      circ(cx, cy, (T ? T.k : 1) * +m[10]);
    } else if (m[11] !== undefined) {    // rect (ignorar o fundo branco da folha)
      const x = +m[11], y = +m[12], w = +m[13], h = +m[14];
      if (!(x === 0 && y === 0 && w >= H)) {
        const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => aplicar(T, p[0], p[1]));
        poly(pts, true);
      }
    } else if (m[15] !== undefined) {    // path M/L/Z → polyline
      const toks = m[15].match(/[MLZ]|[-\d.]+/g) || [];
      let pts = [], fechada = false;
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] === 'M' || toks[i] === 'L') { pts.push(aplicar(T, +toks[i + 1], +toks[i + 2])); i += 2; }
        else if (toks[i] === 'Z') fechada = true;
      }
      if (pts.length > 1) poly(pts, fechada);
    } else if (m[16] !== undefined) {    // text
      text(+m[16], +m[17], m[20], +m[18] * 0.8, m[19]);
    }
  }

  return ['0','SECTION','2','ENTITIES', ...e, '0','ENDSEC','0','EOF',''].join('\n');
}

function qeDescarregarDXF(svgFn, nome) {
  const dxf = qeSVGparaDXF(svgFn());
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
}
