# Banco ampliado do SIMULA FÁCIL IA: milhares de compostos a partir dos dados abertos reunidos na biblioteca
# "chemicals" (Caleb Bell, licença MIT; fontes: IUPAC, CRC Handbook, Yaws, Landolt-Börnstein, Poling, Perry/DIPPR,
# VDI, TRC, NIST WebBook, JANAF, ATcT, API, Joback, Wilson-Jasperson, PubChem). Saída no formato do ChemSep do simulador:
#   {id, name, formula, cas, mw, tc, pc, w, tb, rho, cp[4], dhv, vp[7]?, hf?, gf?, q}
# q = qualidade: 'A' (críticas e pressão de vapor experimentais), 'B' (críticas experimentais), 'C' (propriedades estimadas)
import csv, json, math, os, re, sys, gzip
import numpy as np

BASE = '/tmp/dl2/chemicals/chemicals/'
R = 8.314462618
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/dbbuild/out'
os.makedirs(OUT, exist_ok=True)
csv.field_size_limit(10**8)

def cas_of_int(s):
    s = str(s).strip()
    if '-' in s: return s
    if not s.isdigit() or len(s) < 5: return None
    return s[:-3] + '-' + s[-3:-1] + '-' + s[-1]

def fnum(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except Exception:
        return None

def tsv(path, key='CAS', sep='\t'):
    rows = {}
    with open(BASE + path, encoding='utf-8', errors='replace') as f:
        rd = csv.DictReader(f, delimiter=sep)
        for r in rd:
            c = cas_of_int((r.get(key) or '').strip())
            if c and c not in rows: rows[c] = r
    return rows

# ------------------------------------------------------------------ identificadores (fórmula, massa molar, nomes)
ident = {}
for fn in ['Identifiers/chemical identifiers pubchem small.tsv', 'Identifiers/chemical identifiers pubchem large.tsv', 'Identifiers/Inorganic db.tsv']:
    with open(BASE + fn, encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 9: continue
            cas = p[1].strip()
            if not re.match(r'^\d{2,7}-\d\d-\d$', cas) or cas in ident: continue
            mw = fnum(p[3])
            if not mw: continue
            ident[cas] = {'formula': p[2], 'mw': mw, 'smiles': p[4], 'iupac': p[7], 'common': p[8], 'syn': p[9:14]}
AMASS = {}
for r in csv.DictReader(open(BASE + 'Misc/Element data.csv', encoding='utf-8')):
    if r.get('element symbol') and fnum(r.get('atomic mass')): AMASS[r['element symbol'].strip()] = fnum(r['atomic mass'])
def mw_of(fm):
    if not re.match(r'^([A-Z][a-z]?\d*)+$', fm or ''): return None
    m = 0.0
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', fm):
        if el not in AMASS: return None
        m += AMASS[el] * (int(n) if n else 1)
    return m
extra = 0
for path, col, ncol in [('Phase Change/CRC Handbook Heat of Vaporization.tsv', 'Formula', 'Chemical'), ('Phase Change/CRC Handbook Heat of Fusion.tsv', 'Formula', 'Chemical'),
                        ('Reactions/JANAF_1998.tsv', 'formula', 'Chemical'), ('Reactions/ATcT 1.112 (g).tsv', 'Formula', 'Chemical')]:
    for cas, r in tsv(path).items():
        if cas in ident: continue
        fm = re.sub(r'\s*\(.*\)\s*$', '', (r.get(col) or '').strip()); m = mw_of(fm)
        if m: ident[cas] = {'formula': fm, 'mw': m, 'smiles': '', 'iupac': '', 'common': (r.get(ncol) or '').strip(), 'syn': []}; extra += 1
print('identificadores', len(ident), '(+%d de outras fontes)' % extra)

# ------------------------------------------------------------------ propriedades críticas
crit_exp = {}   # cas -> dict(tc, pc, vc, w, src, name)
def add_crit(path, src, wcol=None, name='Chemical'):
    for cas, r in tsv(path).items():
        tc, pc = fnum(r.get('Tc')), fnum(r.get('Pc'))
        d = crit_exp.setdefault(cas, {})
        if tc and pc and 'tc' not in d: d.update(tc=tc, pc=pc, src=src)
        vc = fnum(r.get('Vc'))
        if vc and 'vc' not in d: d['vc'] = vc
        if wcol and fnum(r.get(wcol)) is not None and 'w' not in d: d['w'] = fnum(r.get(wcol))
        if r.get(name) and 'name' not in d: d['name'] = r.get(name).strip()
        if not d: crit_exp.pop(cas)
add_crit('Critical Properties/IUPACOrganicCriticalProps.tsv', 'IUPAC')
add_crit('Critical Properties/CRCCriticalOrganics.tsv', 'CRC')
add_crit('Critical Properties/Mathews1972InorganicCriticalProps.tsv', 'Mathews')
add_crit('Critical Properties/PassutDanner1973.tsv', 'Passut-Danner', 'omega')
add_crit('Critical Properties/Yaws Collection.tsv', 'Yaws', 'omega')
add_crit('Critical Properties/Appendix to PSRK Revision 4.tsv', 'PSRK', 'omega')
add_crit('Critical Properties/DIPPRPinaMartines.tsv', 'DIPPR')
add_crit('Misc/heos_constants.tsv', 'CoolProp', 'omega', 'name')
crit_est = {cas: (fnum(r['Tc']), fnum(r['Pc'])) for cas, r in tsv('Critical Properties/wilson_jasperson_Tc_Pc_predictions.tsv').items()}
w_est = {cas: fnum(r['omega']) for cas, r in tsv('Critical Properties/omega_Psat_Tc_predictions.tsv').items()}
print('críticas experimentais', sum(1 for d in crit_exp.values() if 'tc' in d), 'estimadas', len(crit_est))

# ------------------------------------------------------------------ ebulição normal
tb_exp = {}
for path, col in [('Phase Change/Yaws Boiling Points.tsv', 'Tb'), ('Misc/Physical Constants of Organic Compounds.csv', 'Tb'),
                  ('Misc/Physical Constants of Inorganic Compounds.csv', 'Tb'), ('Misc/webbook_constants.tsv', 'Tb'),
                  ('Misc/common_chemistry_data.tsv', 'Tb'), ('Misc/wikidata_properties.tsv', 'Tb')]:
    for cas, r in tsv(path).items():
        v = fnum(r.get(col))
        if v and v > 4 and cas not in tb_exp: tb_exp[cas] = v
names_crc = {cas: r['Name'].strip() for cas, r in tsv('Misc/Physical Constants of Organic Compounds.csv').items() if r.get('Name')}
names_crc.update({cas: r['Chemical'].strip() for cas, r in tsv('Misc/Physical Constants of Inorganic Compounds.csv').items() if r.get('Chemical') and cas not in names_crc})
joback = tsv('Misc/joback_predictions.tsv')
print('Tb experimentais', len(tb_exp), 'Joback', len(joback))

# ------------------------------------------------------------------ pressão de vapor: funções ln P(T) [Pa] com faixa
vpfun = {}   # cas -> (callable lnP(T), Tmin, Tmax, src)
for cas, r in tsv('Vapor Pressure/Table 2-8 Vapor Pressure of Inorganic and Organic Liquids.tsv').items():
    C = [fnum(r['C%d' % i]) for i in range(1, 6)]; a, b = fnum(r['Tmin']), fnum(r['Tmax'])
    if None in C or not a or not b: continue
    vpfun[cas] = (lambda T, C=C: C[0] + C[1] / T + C[2] * math.log(T) + C[3] * T ** C[4], a, b, 'Perry/DIPPR')
for cas, r in tsv('Vapor Pressure/Wagner Original McGarry.tsv').items():
    if cas in vpfun: continue
    A, B, C, D, Pc, Tc, a = [fnum(r[k]) for k in ('A', 'B', 'C', 'D', 'Pc', 'Tc', 'Tmin')]
    if None in (A, B, C, D, Pc, Tc): continue
    vpfun[cas] = (lambda T, A=A, B=B, C=C, D=D, Pc=Pc, Tc=Tc: math.log(Pc) + (A * (1 - T / Tc) + B * (1 - T / Tc) ** 1.5 + C * (1 - T / Tc) ** 3 + D * (1 - T / Tc) ** 6) / (T / Tc), a or 0.5 * Tc, Tc, 'Wagner (McGarry)')
for cas, r in tsv('Vapor Pressure/Wagner Collection Poling.tsv').items():
    if cas in vpfun: continue
    A, B, C, D, Tc, Pc, a, b = [fnum(r[k]) for k in ('A', 'B', 'C', 'D', 'Tc', 'Pc', 'Tmin', 'Tmax')]
    if None in (A, B, C, D, Pc, Tc): continue
    vpfun[cas] = (lambda T, A=A, B=B, C=C, D=D, Pc=Pc, Tc=Tc: math.log(Pc) + (A * (1 - T / Tc) + B * (1 - T / Tc) ** 1.5 + C * (1 - T / Tc) ** 2.5 + D * (1 - T / Tc) ** 5) / (T / Tc), a or 0.5 * Tc, b or Tc, 'Wagner (Poling)')
for cas, r in tsv('Vapor Pressure/VDI PPDS Boiling temperatures at different pressures.tsv').items():
    if cas in vpfun: continue
    A, B, C, D, Tc, Pc, Tm = [fnum(r[k]) for k in ('A', 'B', 'C', 'D', 'Tc', 'Pc', 'Tm')]
    if None in (A, B, C, D, Pc, Tc): continue
    vpfun[cas] = (lambda T, A=A, B=B, C=C, D=D, Pc=Pc, Tc=Tc: math.log(Pc) + (A * (1 - T / Tc) + B * (1 - T / Tc) ** 1.5 + C * (1 - T / Tc) ** 2.5 + D * (1 - T / Tc) ** 5) / (T / Tc), Tm or 0.5 * Tc, Tc, 'VDI PPDS')
for cas, r in tsv('Vapor Pressure/Antoine Collection Poling.tsv').items():
    if cas in vpfun: continue
    A, B, C, a, b = [fnum(r[k]) for k in ('A', 'B', 'C', 'Tmin', 'Tmax')]
    if None in (A, B, C, a, b): continue
    vpfun[cas] = (lambda T, A=A, B=B, C=C: (A - B / (T + C)) * math.log(10), a, b, 'Antoine (Poling)')
for cas, r in tsv('Vapor Pressure/Landolt_antoine_V20.tsv').items():
    if cas in vpfun: continue
    A, B, C, a, b = [fnum(r[k]) for k in ('A', 'B', 'C', 'Tmin', 'Tmax')]
    if None in (A, B, C, a, b) or b <= a: continue
    vpfun[cas] = (lambda T, A=A, B=B, C=C: A - B / (T + C), a, b, 'Antoine (Landolt-Börnstein)')
names_landolt = {cas: r['Name'].strip() for cas, r in tsv('Vapor Pressure/Landolt_antoine_V20.tsv').items() if r.get('Name')}
print('pressão de vapor', len(vpfun))

# ------------------------------------------------------------------ Cp de gás ideal (J/(mol·K)) como função de T
cpfun = {}
def trc(T, a):
    a0, a1, a2, a3, a4, a5, a6, a7 = a
    y = 0.0 if T <= a7 else (T - a7) / (T + a6)
    return R * (a0 + (a1 / T ** 2) * math.exp(-a2 / T) + a3 * y * y + (a4 - a5 / (T - a7) ** 2) * y ** 8)
for cas, r in tsv('Heat Capacity/TRC Thermodynamics of Organic Compounds in the Gas State.tsv').items():
    a = [fnum(r['a%d' % i]) for i in range(8)]
    if None in a: continue
    cpfun[cas] = (lambda T, a=a: trc(T, a), max(fnum(r['Tmin']) or 200, 200), min(fnum(r['Tmax']) or 1500, 1500), 'TRC')
for cas, r in tsv('Heat Capacity/PolingDatabank.tsv').items():
    if cas in cpfun: continue
    a = [fnum(r['a%d' % i]) for i in range(5)]
    if None in a: continue
    cpfun[cas] = (lambda T, a=a: R * (a[0] + a[1] * T + a[2] * T ** 2 + a[3] * T ** 3 + a[4] * T ** 4), max(fnum(r['Tmin']) or 200, 200), min(fnum(r['Tmax']) or 1000, 1500), 'Poling')
shom = json.load(open(BASE + 'Heat Capacity/webbook_shomate_coefficients.json'))
for cas, segs in shom.items():
    if cas in cpfun or not segs or not segs[0]: continue
    sg = [s[0] if isinstance(s, list) and s and isinstance(s[0], list) else s for s in segs if s]
    sg = [s for s in sg if s and len(s) >= 7]
    if not sg: continue
    def f(T, sg=sg):
        for s in sg:
            if s[0] <= T <= s[1] or s is sg[-1]:
                t = T / 1000.0; return s[2] + s[3] * t + s[4] * t * t + s[5] * t ** 3 + s[6] / (t * t)
        return None
    cpfun[cas] = (f, max(sg[0][0], 200), min(sg[-1][1], 1500), 'NIST WebBook (Shomate)')
for cas, r in joback.items():
    if cas in cpfun: continue
    a = [fnum(r['Cpg%d' % i]) for i in range(4)]
    if None in a: continue
    cpfun[cas] = (lambda T, a=a: a[0] + a[1] * T + a[2] * T * T + a[3] * T ** 3, 280, 1100, 'Joback (estimado)')
print('Cp de gás ideal', len(cpfun))

# ------------------------------------------------------------------ densidade do líquido, calor de vaporização, formação
perry105 = tsv('Density/Perry Parameters 105.tsv'); vdi_rho = tsv('Density/VDI PPDS Density of Saturated Liquids.tsv')
crc_rho = {cas: fnum(r['rho']) for cas, r in tsv('Misc/Physical Constants of Organic Compounds.csv').items() if fnum(r.get('rho'))}
cost = tsv('Density/COSTALD Parameters.tsv')
perry150 = tsv('Phase Change/Table 2-150 Heats of Vaporization of Inorganic and Organic Liquids.tsv')
crc_hv = tsv('Phase Change/CRC Handbook Heat of Vaporization.tsv'); vdi_hv = tsv('Phase Change/VDI PPDS Enthalpies of vaporization.tsv')
hf_src = {}
for path, col in [('Reactions/ATcT 1.112 (g).tsv', 'Hfg'), ('Reactions/JANAF_1998.tsv', 'Hfg'), ('Reactions/API TDB Albahri Hf (g).tsv', 'Hfg'),
                  ('Reactions/Yaws Hf S0 (g).tsv', 'Hfg'), ('Heat Capacity/TRC Thermodynamics of Organic Compounds in the Gas State.tsv', 'Hfg'),
                  ('Heat Capacity/CRC Standard Thermodynamic Properties of Chemical Substances.tsv', 'Hfg'), ('Misc/webbook_constants.tsv', 'Hfg')]:
    for cas, r in tsv(path).items():
        v = fnum(r.get(col))
        if v is not None and cas not in hf_src: hf_src[cas] = v
gf_src = {}
for path in ['Reactions/JANAF_1998.tsv', 'Heat Capacity/CRC Standard Thermodynamic Properties of Chemical Substances.tsv']:
    for cas, r in tsv(path).items():
        v = fnum(r.get('Gfg'))
        if v is not None and cas not in gf_src: gf_src[cas] = v
s0g = {cas: fnum(r['S0g']) for cas, r in tsv('Reactions/Yaws Hf S0 (g).tsv').items() if fnum(r.get('S0g'))}
# entropias padrão dos elementos (J/(mol·K), por átomo, estado de referência a 298,15 K)
S_EL = {'C': 5.74, 'H': 130.68 / 2, 'O': 205.15 / 2, 'N': 191.61 / 2, 'Cl': 223.08 / 2, 'F': 202.79 / 2, 'Br': 152.21 / 2, 'I': 116.14 / 2,
        'S': 32.05, 'Si': 18.81, 'P': 41.09, 'B': 5.90, 'Se': 42.44, 'Sn': 51.18, 'Ge': 31.09, 'Al': 28.30, 'Hg': 75.90, 'Pb': 64.80}
def parse_formula(fm):
    if not re.match(r'^([A-Z][a-z]?\d*)+$', fm or ''): return None
    d = {}
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', fm): d[el] = d.get(el, 0) + (int(n) if n else 1)
    return d

# ------------------------------------------------------------------ montagem
def lk(Tr, w):  # Lee-Kesler: ln(Psat/Pc)
    f0 = 5.92714 - 6.09648 / Tr - 1.28862 * math.log(Tr) + 0.169347 * Tr ** 6
    f1 = 15.2518 - 15.6875 / Tr - 13.4721 * math.log(Tr) + 0.43577 * Tr ** 6
    return f0 + w * f1
def w_from_tb(tb, tc, pc):
    Tr = tb / tc
    f0 = 5.92714 - 6.09648 / Tr - 1.28862 * math.log(Tr) + 0.169347 * Tr ** 6
    f1 = 15.2518 - 15.6875 / Tr - 13.4721 * math.log(Tr) + 0.43577 * Tr ** 6
    return (math.log(101325 / pc) - f0) / f1

def fit_vp(fun, a, b, tc, pc):
    """ajusta ln P = A + B/T + C ln T + D T^6 aos pontos da correlação (faixa válida) e ao ponto crítico"""
    lo, hi = max(a, 0.3 * tc), min(b, tc)
    if hi <= lo * 1.02: return None
    Ts = list(np.linspace(lo, hi, 24)); ys = []
    for T in Ts:
        try: ys.append(fun(T))
        except Exception: return None
    W = [1.0] * len(Ts)
    if hi < 0.995 * tc:   # ancora no ponto crítico
        Ts.append(tc); ys.append(math.log(pc)); W.append(2.0)
    T = np.array(Ts); y = np.array(ys); w = np.array(W)
    t = T / tc   # variáveis reduzidas: matriz bem condicionada
    M = np.vstack([np.ones_like(t), 1 / t, np.log(t), t ** 6]).T
    try: a0, b0, c0, d0 = np.linalg.lstsq(M * w[:, None], y * w, rcond=None)[0]
    except Exception: return None
    A, B, C, D = a0 - c0 * math.log(tc), b0 * tc, c0, d0 / tc ** 6
    f = lambda t: A + B / t + C * math.log(t) + D * t ** 6
    # validação: erro na faixa da correlação, monotonia até Tc e valor no ponto crítico
    err = max(abs(math.exp(f(t) - fun(t)) - 1) for t in np.linspace(lo, hi, 40))
    grid = np.linspace(max(0.35 * tc, lo * 0.9), tc, 80); vals = [f(t) for t in grid]
    mono = all(vals[i + 1] > vals[i] for i in range(len(vals) - 1))
    if err > 0.03 or not mono or abs(f(tc) - math.log(pc)) > 0.25: return None
    return [float('%.7g' % A), float('%.7g' % B), float('%.7g' % C), float('%.7g' % D), 6, round(lo, 2), round(tc, 2)]

def fit_cp(fun, a, b):
    Ts = np.linspace(max(a, 200), min(b, 1500), 40); ys = []
    for T in Ts:
        v = fun(T)
        if v is None or not math.isfinite(v): return None
        ys.append(v)
    if len(ys) < 10: return None
    M = np.vstack([np.ones_like(Ts), Ts, Ts ** 2, Ts ** 3]).T
    c = np.linalg.lstsq(M, np.array(ys), rcond=None)[0]
    fit = M @ c
    if np.max(np.abs(fit / np.array(ys) - 1)) > 0.05: return None
    if c[0] + c[1] * 298.15 + c[2] * 298.15 ** 2 + c[3] * 298.15 ** 3 <= 0: return None
    return [float('%.6g' % x) for x in c]

def cap(x):
    x = re.sub(r'\s+', ' ', x.replace('\u2009', ' ')).strip()
    return x[0].upper() + x[1:] if x and 'a' <= x[0] <= 'z' else x
def ok_name(c):
    c = (c or '').strip()
    return 3 <= len(c) <= 60 and re.search(r'[a-z]{3}', c) and not re.match(r'^[a-z]{2,6}[- ]?\d', c) and not re.search(r'\d{4,}', c) and not c.startswith(('nsc', 'cid', 'unii', 'einecs', 'ccris', 'hsdb', 'ai3-', 'brn', 'dtxsid', 'schembl', 'mfcd', 'zinc', 'agn-', 'akos', 'ks-', 'ac1', 'ls-', 'bdbm', 'chembl', 'cas-', 'ncgc', 'smr', 'mls', 'spectrum', 'oprea', 'ctk', 'ec ')) and not re.match(r'^[a-z]{1,4}-?[a-z]{0,3}-?\d', c)
def nice_name(cas, idd):
    if idd.get('common') and ok_name(idd['common']): return cap(idd['common'])
    for src in (crit_exp.get(cas, {}).get('name'), names_crc.get(cas), names_landolt.get(cas)):
        if src and len(src) < 70 and not re.match(r'^[A-Z]{2,}\d', src): return cap(src)
    for c in idd.get('syn', []) + [idd.get('iupac')]:
        if ok_name(c): return cap(c)
    return cap(idd.get('iupac') or idd.get('common') or cas)

existing = set(l.strip() for l in open('/home/claude/dbbuild/existing_cas.txt') if l.strip())
stats = {'total': 0, 'A': 0, 'B': 0, 'C': 0}; out = []; reasons = {}
def skip(k): reasons[k] = reasons.get(k, 0) + 1
cands = set(crit_exp) | set(crit_est) | set(joback)
for cas in sorted(cands):
    idd = ident.get(cas)
    if not idd: skip('sem fórmula'); continue
    if cas in existing: skip('já no banco'); continue
    fm = idd['formula']
    if not re.match(r'^[A-Za-z0-9]+$', fm) or '.' in idd['smiles'] or '+' in idd['smiles'] or '-]' in idd['smiles']: skip('íon ou mistura'); continue
    mw = idd['mw']
    if mw > 1200: skip('massa molar alta'); continue
    ce = crit_exp.get(cas, {}); jb = joback.get(cas, {})
    if 'tc' in ce: tc, pc, crit_src = ce['tc'], ce['pc'], 'exp'
    elif cas in crit_est and crit_est[cas][0] and crit_est[cas][1]: tc, pc, crit_src = crit_est[cas][0], crit_est[cas][1], 'est'
    elif fnum(jb.get('Tc')) and fnum(jb.get('Pc')): tc, pc, crit_src = fnum(jb['Tc']), fnum(jb['Pc']), 'est'
    else: skip('sem Tc/Pc'); continue
    tb, tb_src = tb_exp.get(cas), 'exp'
    if not tb: tb, tb_src = fnum(jb.get('Tb')), 'est'
    if not tb: skip('sem Tb'); continue
    if not (0.3 < tb / tc < 0.97 and 2e5 < pc < 1.5e8 and tc > 5): skip('críticas incoerentes'); continue
    # pressão de vapor
    vp = None; vsrc = None
    if cas in vpfun:
        f, a, b, s = vpfun[cas]
        vp = fit_vp(f, a, b, tc, pc)
        if vp: vsrc = s
    # fator acêntrico
    if vp and tb_src == 'exp':   # a correlação precisa reproduzir a ebulição normal experimental
        A, B, C, D, E = vp[:5]; rTb = math.exp(A + B / tb + C * math.log(tb) + D * tb ** 6) / 101325
        if not (0.85 < rTb < 1.18): vp = None; vsrc = None
    if vp:
        A, B, C, D, E = vp[:5]; P07 = math.exp(A + B / (0.7 * tc) + C * math.log(0.7 * tc) + D * (0.7 * tc) ** 6)
        w = -math.log10(P07 / pc) - 1
    else:
        w = w_from_tb(tb, tc, pc)      # Lee-Kesler pela ebulição normal: reproduz Tb
        if not (-0.45 < w < 2.2): w = ce.get('w', w_est.get(cas))
    if w is None or not (-0.45 < w < 2.2): skip('ω fora da faixa'); continue
    # Cp
    cp = None; cpsrc = None
    if cas in cpfun:
        f, a, b, s = cpfun[cas]; cp = fit_cp(f, a, b); cpsrc = s
    if not cp:
        a = [fnum(jb.get('Cpg%d' % i)) for i in range(4)]
        if None not in a and a[0] + a[1] * 298 + a[2] * 298 ** 2 + a[3] * 298 ** 3 > 0: cp = [float('%.6g' % x) for x in a]; cpsrc = 'Joback (estimado)'
    if not cp: skip('sem Cp'); continue
    # densidade do líquido a 298,15 K (ou na ebulição, se Tc < 298 K)
    Tr_ = 298.15 if tc > 310 else tb
    rho = None
    if cas in perry105:
        r = perry105[cas]; C1, C2, C3, C4 = [fnum(r[k]) for k in ('C1', 'C2', 'C3', 'C4')]
        if None not in (C1, C2, C3, C4) and Tr_ < C3: rho = C1 / C2 ** (1 + (1 - Tr_ / C3) ** C4) * mw / 1000
    if not rho and cas in crc_rho: rho = crc_rho[cas]
    if not rho:
        Zra = 0.29056 - 0.08775 * w; Tr = min(Tr_ / tc, 0.99)
        Vm = R * tc / pc * Zra ** (1 + (1 - Tr) ** (2 / 7)); rho = mw / 1000 / Vm
    if not (100 < rho < 4000): skip('densidade incoerente'); continue
    # calor de vaporização na ebulição normal (J/mol)
    dhv = None
    if cas in perry150:
        r = perry150[cas]; C1, C2, C3, C4, Tcx = [fnum(r[k]) for k in ('C1', 'C2', 'C3', 'C4', 'Tc')]
        if None not in (C1, C2, C3, C4, Tcx) and tb < Tcx: Tr = tb / Tcx; dhv = C1 * (1 - Tr) ** (C2 + C3 * Tr + C4 * Tr * Tr)
    if not dhv and cas in crc_hv: dhv = fnum(crc_hv[cas].get('HvapTb'))
    if not dhv:
        Tbr = tb / tc; dhv = 1.093 * R * tc * Tbr * (math.log(pc / 1e5) - 1.013) / (0.930 - Tbr)   # Riedel
    if not dhv or dhv <= 0: skip('ΔHvap'); continue
    rec = {'id': 'x-' + cas, 'name': nice_name(cas, idd), 'formula': fm, 'cas': cas, 'mw': round(mw, 4), 'tc': round(tc, 2), 'pc': round(pc), 'w': round(w, 4),
           'tb': round(tb, 2), 'rho': round(rho, 1), 'cp': cp, 'dhv': round(dhv, 1)}
    if vp: rec['vp'] = vp
    hf = hf_src.get(cas)
    if hf is None and fnum(jb.get('Hfg')) is not None: hf = fnum(jb['Hfg'])
    if hf is not None:
        rec['hf'] = round(hf, 1)
        gf = gf_src.get(cas)
        if gf is None and cas in s0g:
            el = parse_formula(fm)
            if el and all(k in S_EL for k in el): gf = hf - 298.15 * (s0g[cas] - sum(S_EL[k] * n for k, n in el.items()))
        if gf is not None: rec['gf'] = round(gf, 1)
    q = 'A' if (crit_src == 'exp' and vp) else 'B' if (crit_src == 'exp' or vp) else 'C'
    rec['q'] = q; rec['src'] = ';'.join([{'exp': ce.get('src', 'exp'), 'est': 'Wilson-Jasperson/Joback (estimado)'}[crit_src], vsrc or ('Lee-Kesler (Tb exp.)' if tb_src == 'exp' else 'Lee-Kesler (estimado)'), cpsrc])
    stats[q] += 1; stats['total'] += 1; out.append(rec)
print('incluídos', stats, 'descartados', reasons)
json.dump(out, open(OUT + '/all.json', 'w'), ensure_ascii=False, separators=(',', ':'))
SRC = []
def code(s):
    if s not in SRC: SRC.append(s)
    return SRC.index(s)
NSH = 4
def shard(cas): return int(cas.replace('-', '')) % NSH
index = []; parts = [[] for _ in range(NSH)]
g = lambda v, d=6: float(('%.' + str(d) + 'g') % v) if v is not None else None
for r in sorted(out, key=lambda r: r['name'].lower()):
    index.append([r['cas'], r['name'], r['formula'], round(r['tb'], 1), r['q']])
    s3 = r['src'].split(';')
    parts[shard(r['cas'])].append([r['cas'], r['mw'], r['tc'], r['pc'], r['w'], r['tb'], r['rho'], [g(x, 5) for x in r['cp']], r['dhv'], r.get('vp'), r.get('hf'), r.get('gf'), [code(x) for x in s3]])
meta = {'versao': '1.0', 'gerado': '2026-11', 'n': len(out), 'partes': NSH, 'qualidade': {'A': 'propriedades críticas e pressão de vapor experimentais', 'B': 'propriedades críticas ou pressão de vapor experimentais', 'C': 'propriedades estimadas (Wilson-Jasperson, Joback, Lee-Kesler)'},
        'campos_indice': ['CAS', 'nome', 'fórmula', 'Teb (K)', 'qualidade'], 'campos': ['CAS', 'M', 'Tc', 'Pc', 'ω', 'Teb', 'ρ_L', 'cp[4]', 'ΔHvap(Teb)', 'vp DIPPR101 [A,B,C,D,E,Tmin,Tmax]', 'ΔHf (gás)', 'ΔGf (gás)', 'fontes'],
        'fontes': SRC, 'licenca': 'Dados compilados da biblioteca chemicals (Caleb Bell, licença MIT) e das fontes originais nela citadas; PubChem para nomes e fórmulas.'}
os.makedirs(OUT + '/db', exist_ok=True)
json.dump({'meta': meta, 'c': index}, open(OUT + '/db/indice.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for k in range(NSH): json.dump(parts[k], open(OUT + '/db/parte%d.json' % k, 'w'), ensure_ascii=False, separators=(',', ':'))
print('fontes', SRC)
