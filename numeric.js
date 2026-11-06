/* SIMULA FÁCIL IA — rotinas numéricas (Brent, Nelder-Mead, Thomas, RK45, Euler implícito, Newton multivariável) */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};

  function brent(f, a, b, tol, maxIter) {
    tol = tol || 1e-10; maxIter = maxIter || 200;
    let fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb)) throw new Error('Brent: função não finita no intervalo');
    if (fa * fb > 0) throw new Error('Brent: raiz não isolada no intervalo');
    if (fa === 0) return a;
    if (fb === 0) return b;
    let c = a, fc = fa, d = b - a, e = d;
    for (let it = 0; it < maxIter; it++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tol1 = 2 * 1e-15 * Math.abs(b) + 0.5 * tol;
      const xm = 0.5 * (c - b);
      if (Math.abs(xm) <= tol1 || fb === 0) return b;
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        let s = fb / fa, p, q;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          const qq = fa / fc, r = fb / fc;
          p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
          q = (qq - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q; p = Math.abs(p);
        if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
        else { d = xm; e = d; }
      } else { d = xm; e = d; }
      a = b; fa = fb;
      b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
      fb = f(b);
    }
    return b;
  }

  /* Encontra um intervalo com troca de sinal partindo de [a,b] e expandindo. */
  function bracket(f, a, b, lo, hi, maxExp) {
    maxExp = maxExp || 60;
    let fa = f(a), fb = f(b);
    for (let i = 0; i < maxExp && fa * fb > 0; i++) {
      if (Math.abs(fa) < Math.abs(fb)) { a = Math.max(lo, a - 1.6 * (b - a)); fa = f(a); }
      else { b = Math.min(hi, b + 1.6 * (b - a)); fb = f(b); }
      if (a <= lo && b >= hi && fa * fb > 0) break;
    }
    if (fa * fb > 0) return null;
    return [a, b];
  }

  function nelderMead(f, x0, opts) {
    opts = opts || {};
    const n = x0.length, maxIter = opts.maxIter || 400, tol = opts.tol || 1e-10;
    const step = opts.step || x0.map(v => (Math.abs(v) > 1e-3 ? 0.2 * Math.abs(v) : 0.25));
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; simplex.push(p); }
    let vals = simplex.map(f);
    for (let it = 0; it < maxIter; it++) {
      const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      simplex = idx.map(i => simplex[i]); vals = idx.map(i => vals[i]);
      if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) break;
      const cen = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;
      const xr = cen.map((c, j) => c + (c - simplex[n][j])), fr = f(xr);
      if (fr < vals[0]) {
        const xe = cen.map((c, j) => c + 2 * (c - simplex[n][j])), fe = f(xe);
        if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
      } else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
      else {
        const xc = cen.map((c, j) => c + 0.5 * (simplex[n][j] - c)), fc = f(xc);
        if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; }
        else {
          for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); vals[i] = f(simplex[i]); }
        }
      }
    }
    let best = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[best]) best = i;
    return { x: simplex[best], f: vals[best] };
  }

  /* Resolve sistema tridiagonal: a (sub), b (diag), c (super), d (rhs) */
  function thomas(a, b, c, d) {
    const n = b.length, cp = new Array(n), dp = new Array(n), x = new Array(n);
    cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
    for (let i = 1; i < n; i++) {
      const m = b[i] - a[i] * cp[i - 1];
      cp[i] = i < n - 1 ? c[i] / m : 0;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    return x;
  }

  /* Eliminação de Gauss com pivotamento parcial */
  function solveLinear(A, bvec) {
    const n = bvec.length, M = A.map((r, i) => r.slice().concat([bvec[i]]));
    for (let k = 0; k < n; k++) {
      let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      if (Math.abs(M[p][k]) < 1e-300) throw new Error('Matriz singular');
      if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; }
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k]; if (f === 0) continue;
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }

  function numJac(F, x, f0) {
    const n = x.length; f0 = f0 || F(x);
    const J = []; for (let i = 0; i < f0.length; i++) J.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(x[j])), xp = x.slice(); xp[j] += h;
      const fp = F(xp);
      for (let i = 0; i < f0.length; i++) J[i][j] = (fp[i] - f0[i]) / h;
    }
    return J;
  }

  /* Newton multivariável amortecido */
  function newtonSystem(F, x0, opts) {
    opts = opts || {};
    const maxIter = opts.maxIter || 100, tol = opts.tol || 1e-9, lower = opts.lower;
    let x = x0.slice(), f = F(x), nrm = Math.sqrt(f.reduce((s, v) => s + v * v, 0));
    for (let it = 0; it < maxIter; it++) {
      if (nrm < tol) return { x, converged: true, iter: it };
      const J = numJac(F, x, f);
      let dx; try { dx = solveLinear(J, f.map(v => -v)); } catch (e) { return { x, converged: false, iter: it }; }
      let lam = 1, xn, fn, nn;
      for (let k = 0; k < 30; k++) {
        xn = x.map((v, i) => { let w = v + lam * dx[i]; if (lower) w = Math.max(lower[i], w); return w; });
        fn = F(xn); nn = Math.sqrt(fn.reduce((s, v) => s + v * v, 0));
        if (isFinite(nn) && nn < (1 - 1e-4 * lam) * nrm) break;
        lam *= 0.5;
      }
      x = xn; f = fn; nrm = nn;
    }
    return { x, converged: nrm < tol * 100, iter: maxIter };
  }

  /* Integrador Dormand-Prince RK45 adaptativo; retorna pontos em tOut */
  function rk45(fun, t0, y0, tEnd, opts) {
    opts = opts || {};
    const rtol = opts.rtol || 1e-6, atol = opts.atol || 1e-9, maxSteps = opts.maxSteps || 200000;
    const nOut = opts.nOut || 200;
    const tOut = []; for (let i = 0; i <= nOut; i++) tOut.push(t0 + (tEnd - t0) * i / nOut);
    const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
    const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
      [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
    const b5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
    const b4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
    const n = y0.length; let t = t0, y = y0.slice();
    let h = opts.h0 || (tEnd - t0) / 1000;
    const T = [t0], Y = [y.slice()]; let iOut = 1, steps = 0;
    while (t < tEnd && steps < maxSteps) {
      if (t + h > tEnd) h = tEnd - t;
      const k = [];
      for (let s = 0; s < 7; s++) {
        const ys = y.slice();
        for (let j = 0; j < s; j++) { const a = A[s][j]; if (a) for (let i = 0; i < n; i++) ys[i] += h * a * k[j][i]; }
        k.push(fun(t + c[s] * h, ys));
      }
      const y5 = y.slice(), y4 = y.slice();
      for (let s = 0; s < 7; s++) for (let i = 0; i < n; i++) { y5[i] += h * b5[s] * k[s][i]; y4[i] += h * b4[s] * k[s][i]; }
      let err = 0;
      for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i])); err = Math.max(err, Math.abs(y5[i] - y4[i]) / sc); }
      steps++;
      if (!isFinite(err)) { h *= 0.25; if (h < 1e-14 * (tEnd - t0)) throw new Error('RK45: passo muito pequeno'); continue; }
      if (err <= 1) {
        const tNew = t + h;
        while (iOut < tOut.length && tOut[iOut] <= tNew + 1e-12 * Math.abs(tEnd)) {
          const th = (tOut[iOut] - t) / h; // interpolação linear
          T.push(tOut[iOut]); Y.push(y.map((v, i) => v + th * (y5[i] - v))); iOut++;
        }
        t = tNew; y = y5;
      }
      h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(err, 1e-10), -0.2)));
    }
    if (steps >= maxSteps) return null; // sinaliza rigidez
    while (iOut < tOut.length) { T.push(tOut[iOut]); Y.push(y.slice()); iOut++; }
    return { t: T, y: Y, steps };
  }

  /* Euler implícito (BDF1) com Newton e Jacobiano numérico — para sistemas rígidos */
  function implicitEuler(fun, t0, y0, tEnd, opts) {
    opts = opts || {};
    const nOut = opts.nOut || 200, sub = opts.substeps || 10;
    const T = [t0], Y = [y0.slice()];
    let y = y0.slice(), t = t0; const dtOut = (tEnd - t0) / nOut;
    for (let k = 0; k < nOut; k++) {
      const h = dtOut / sub;
      for (let s = 0; s < sub; s++) {
        const yOld = y.slice(), tn = t + h;
        const G = (z) => { const f = fun(tn, z); return z.map((v, i) => v - yOld[i] - h * f[i]); };
        const r = newtonSystem(G, yOld, { tol: 1e-10, maxIter: 30 });
        y = r.x; t = tn;
      }
      T.push(t); Y.push(y.slice());
    }
    return { t: T, y: Y };
  }

  function integrate(fun, t0, y0, tEnd, opts) {
    const r = rk45(fun, t0, y0, tEnd, Object.assign({ maxSteps: 60000 }, opts || {}));
    if (r) return r;
    return implicitEuler(fun, t0, y0, tEnd, opts);
  }

  function linspace(a, b, n) { const r = []; for (let i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1)); return r; }
  const sum = a => a.reduce((s, v) => s + v, 0);
  const normalize = a => { const s = sum(a); return s > 0 ? a.map(v => v / s) : a.slice(); };

  SF.num = { brent, bracket, nelderMead, thomas, solveLinear, newtonSystem, numJac, rk45, implicitEuler, integrate, linspace, sum, normalize };
})(typeof window !== 'undefined' ? window : globalThis);
