((raiz) => {
  const ANCHO = 64, ALTO = 48;
  const identidad = () => ({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0, fiable: true });
  function resolver(m, v) {
    const a = m.map((r, i) => [...r, v[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (Math.abs(a[p][c]) < 1e-7) return null;
      [a[c], a[p]] = [a[p], a[c]];
      const factor = a[c][c]; for (let j = c; j < 4; j++) a[c][j] /= factor;
      for (let r = 0; r < 3; r++) if (r !== c) { const k = a[r][c]; for (let j = c; j < 4; j++) a[r][j] -= k * a[c][j]; }
    }
    return a.map((r) => r[3]);
  }
  function ajustar(puntos) {
    const m = Array.from({ length: 3 }, () => [0, 0, 0]), vx = [0, 0, 0], vy = [0, 0, 0];
    for (const p of puntos) {
      const v = [p.x, p.y, 1];
      for (let i = 0; i < 3; i++) { vx[i] += v[i] * p.nx; vy[i] += v[i] * p.ny; for (let j = 0; j < 3; j++) m[i][j] += v[i] * v[j]; }
    }
    const x = resolver(m, vx), y = resolver(m, vy);
    if (!x || !y) return null;
    const [a, b, c] = x, [d, e, f] = y, area = a * e - b * d;
    return area > .6 && area < 1.6 && a > .5 && e > .5 && Math.abs(b) < .65 && Math.abs(d) < .65 ? { a, b, c, d, e, f } : null;
  }
  function transformarCaja(caja, t) {
    const puntos = [[caja.x, caja.y], [caja.x + caja.w, caja.y], [caja.x, caja.y + caja.h], [caja.x + caja.w, caja.y + caja.h]].map(([x, y]) => [t.a * x + t.b * y + t.c, t.d * x + t.e * y + t.f]);
    const x = Math.min(...puntos.map((p) => p[0])), y = Math.min(...puntos.map((p) => p[1]));
    return { x, y, w: Math.max(...puntos.map((p) => p[0])) - x, h: Math.max(...puntos.map((p) => p[1])) - y };
  }
  function estimar(actual, previa, diferencia, luz, luzAnterior, mascaras = []) {
    if (!previa) return { ...identidad(), fiable: false };
    if (diferencia < .003) return identidad();
    const puntos = [];
    for (let y = 4; y < ALTO - 4; y += 6) for (let x = 4; x < ANCHO - 4; x += 6) {
      if (mascaras.some((c) => x / ANCHO > c.x - .02 && x / ANCHO < c.x + c.w + .02 && y / ALTO > c.y - .02 && y / ALTO < c.y + c.h + .02)) continue;
      let gx2 = 0, gy2 = 0, gxy = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const k = (y + j) * ANCHO + x + i, gx = previa[k + 1] - previa[k - 1], gy = previa[k + ANCHO] - previa[k - ANCHO];
        gx2 += gx * gx; gy2 += gy * gy; gxy += gx * gy;
      }
      if ((gx2 + gy2 - Math.sqrt((gx2 - gy2) ** 2 + 4 * gxy * gxy)) / 2 < 150) continue;
      const candidatos = [];
      for (let dy = -8; dy <= 8; dy++) for (let dx = -10; dx <= 10; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 2 || nx >= ANCHO - 2 || ny < 2 || ny >= ALTO - 2) continue;
        let error = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) error += Math.abs((previa[(y + j) * ANCHO + x + i] - luzAnterior) - (actual[(ny + j) * ANCHO + nx + i] - luz));
        candidatos.push({ nx, ny, error: error / 25 });
      }
      candidatos.sort((a, b) => a.error - b.error);
      const mejor = candidatos[0], otro = candidatos.find((c) => Math.abs(c.nx - mejor.nx) + Math.abs(c.ny - mejor.ny) > 3);
      if (!mejor || mejor.error > 30 || !otro || otro.error < mejor.error * 1.15 + 2) continue;
      puntos.push({ x: x / ANCHO, y: y / ALTO, nx: mejor.nx / ANCHO, ny: mejor.ny / ALTO });
    }
    let elegidos = [];
    let intentos = 0;
    for (let i = 0; i < puntos.length - 2 && intentos < 150; i++) for (let j = i + 1; j < puntos.length - 1 && intentos < 150; j += 2) for (let k = j + 1; k < puntos.length && intentos < 150; k += 3) {
      intentos++;
      const t = ajustar([puntos[i], puntos[j], puntos[k]]); if (!t) continue;
      const grupo = puntos.filter((p) => Math.hypot(t.a * p.x + t.b * p.y + t.c - p.nx, t.d * p.x + t.e * p.y + t.f - p.ny) < .035);
      if (grupo.length > elegidos.length) elegidos = grupo;
    }
    const extension = (clave) => elegidos.length ? Math.max(...elegidos.map((p) => p[clave])) - Math.min(...elegidos.map((p) => p[clave])) : 0;
    const ajuste = elegidos.length >= 7 && elegidos.length >= puntos.length * .55 && extension('x') > .4 && extension('y') > .35 ? ajustar(elegidos) : null;
    return ajuste ? { ...ajuste, fiable: true, puntos: elegidos.length } : { ...identidad(), fiable: false };
  }
  const espera = (ms, movimiento = 0) => Math.max(16, (movimiento > .06 ? 200 : 250) - Math.max(0, Number(ms) || 0));
  raiz.GrietaMovimiento = { ANCHO, ALTO, identidad, transformarCaja, estimar, espera };
})(globalThis);
