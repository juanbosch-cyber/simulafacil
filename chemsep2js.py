# Converte o banco ChemSep (Artistic License 2.0, via DWSIM) para js/chemsep.js no formato do SIMULA FÁCIL IA
import xml.etree.ElementTree as ET, json, math, re, sys
import numpy as np
BASE='/tmp/dl/dwsim/DWSIM.Thermodynamics/Assets/'
BUILTIN_CAS={'water':'7732-18-5','methanol':'67-56-1','ethanol':'64-17-5','1-propanol':'71-23-8','isopropanol':'67-63-0','1-butanol':'71-36-3','ethylene-glycol':'107-21-1',
 'acetone':'67-64-1','acetic-acid':'64-19-7','diisopropyl-ether':'108-20-3','ethyl-acetate':'141-78-6','benzene':'71-43-2','toluene':'108-88-3','p-xylene':'106-42-3',
 'ethylbenzene':'100-41-4','styrene':'100-42-5','cyclohexane':'110-82-7','n-pentane':'109-66-0','n-hexane':'110-54-3','n-heptane':'142-82-5','n-octane':'111-65-9',
 'methane':'74-82-8','ethane':'74-84-0','propane':'74-98-6','n-butane':'106-97-8','isobutane':'75-28-5','ethylene':'74-85-1','propylene':'115-07-1','hydrogen':'1333-74-0',
 'nitrogen':'7727-37-9','nitric-acid':'7697-37-2','no':'10102-43-9','no2':'10102-44-0','n2o4':'10544-72-6','oxygen':'7782-44-7','co2':'124-38-9','co':'630-08-0',
 'ammonia':'7664-41-7','sucrose':'57-50-1','nacl':'7647-14-5','kno3':'7757-79-1','soy-oil':'122-32-7'}
CAS2BUILT={v:k for k,v in BUILTIN_CAS.items()}
UNIFAC={1:'CH3',2:'CH2',3:'CH',4:'C',5:'CH2=CH',10:'ACH',11:'AC',12:'ACCH3',13:'ACCH2',15:'OH',16:'CH3OH',17:'H2O',19:'CH3CO',22:'CH3COO',43:'COOH'}
def val(c,tag):
    e=c.find(tag); 
    if e is None: return None
    try: return float(e.get('value'))
    except: return None
def eqp(c,tag):
    e=c.find(tag)
    if e is None or e.find('eqno') is None: return None
    d={'eq':int(e.find('eqno').get('value'))}
    for k in 'ABCDE':
        x=e.find(k); d[k]=float(x.get('value')) if x is not None else 0.0
    for k in ('Tmin','Tmax'):
        x=e.find(k); d[k]=float(x.get('value')) if x is not None else None
    return d
def evaleq(d,T,Tc=None):
    eq=d['eq'];A,B,C,D,E=d['A'],d['B'],d['C'],d['D'],d['E']
    if eq==100: return A+B*T+C*T**2+D*T**3+E*T**4
    if eq==16: return A+math.exp(B/T+C+D*T+E*T*T)
    if eq==107: x=C/T; y=E/T; return A+B*(x/math.sinh(x))**2+D*(y/math.cosh(y))**2
    if eq==4: return A+B*T+C*T**2+D*T**3+E/T**2
    if eq==5: return A+B*T+C*T**2+D*T**3+E*T**4
    if eq==105: return A/B**(1+(1-T/C)**D)
    if eq==106: Tr=T/Tc; return A*(1-Tr)**(B+C*Tr+D*Tr**2+E*Tr**3)
    if eq==101: return math.exp(A+B/T+C*math.log(T)+D*T**E)
    if eq==10: return math.exp(A-B/(C+T))
    raise ValueError(eq)
def slug(s):
    s=s.lower(); s=re.sub(r'[^a-z0-9]+','-',s).strip('-'); return s[:40]
comps=[]; seen=set(); skipped=[]; dup=[]; casmap={}
for f in ['chemsep1.xml','chemsep2.xml']:
    for c in ET.parse(BASE+'Databases/'+f).getroot().findall('compound'):
        name=c.find('CompoundID').get('value'); cas=c.find('CAS').get('value') if c.find('CAS') is not None else ''
        mw,tc,pc,w,tb=[val(c,t) for t in ('MolecularWeight','CriticalTemperature','CriticalPressure','AcentricityFactor','NormalBoilingPointTemperature')]
        if cas in CAS2BUILT: dup.append((name,CAS2BUILT[cas])); casmap[cas]=CAS2BUILT[cas]; continue
        if None in (mw,tc,pc,tb) or w is None: skipped.append((name,'crít')); continue
        cpd=eqp(c,'IdealGasHeatCapacityCp')
        if not cpd: skipped.append((name,'cp')); continue
        T1=max(250.0,cpd['Tmin'] or 250); T2=min(900.0,cpd['Tmax'] or 900)
        if T2-T1<100: T1,T2=max(150,T1-50),T2+100
        Ts=np.linspace(T1,T2,40)
        try: cps=np.array([evaleq(cpd,T)/1000 for T in Ts])
        except Exception as e: skipped.append((name,'cp eq')); continue
        p=np.polyfit(Ts,cps,3,w=1/cps)[::-1]; err=np.max(np.abs(np.polyval(p[::-1],Ts)-cps)/np.maximum(cps,1))
        rho=None; ld=eqp(c,'LiquidDensity')
        if ld and ld['eq']==105:
            for T in (298.15,tb):
                if (ld['Tmin'] or 0)-1<=T<=(ld['Tmax'] or 1e9)+1 and T<tc:
                    try: rho=evaleq(ld,T)*mw; break
                    except: pass
        if rho is None:
            vb=val(c,'LiquidVolumeAtNormalBoilingPoint'); rho=mw/vb if vb else 800.0
        hv=eqp(c,'HeatOfVaporization'); dhv=None
        if hv and hv['eq']==106 and tb<tc:
            try: dhv=evaleq(hv,tb,tc)/1000
            except: dhv=None
        if not dhv or dhv<=0:
            Tbr=tb/tc; dhv=1.092*8.314462618*tb*(math.log(pc/1e5)-1.013)/(0.930-Tbr)
        d={'id':'cs-'+slug(name),'name':name,'formula':(c.find('StructureFormula').get('value') if c.find('StructureFormula') is not None else ''),'cas':cas,
           'mw':round(mw,5),'tc':round(tc,3),'pc':round(pc,1),'w':round(w,5),'tb':round(tb,3),'rho':round(rho,2),
           'cp':[float('%.6g'%x) for x in p],'dhv':round(dhv,1)}
        vp=eqp(c,'VaporPressure')
        if vp and vp['eq']==101: d['vp']=[float('%.8g'%vp[k]) for k in 'ABCDE']+[vp['Tmin'],vp['Tmax']]
        else:
            an=eqp(c,'AntoineVaporPressure')
            if an and an['eq']==10: d['ant']=[round(an['A']/math.log(10)-math.log10(133.322368),6),round(an['B']/math.log(10),4),round(an['C']+273.15,4)]
        u=c.find('UnifacVLE')
        if u is not None:
            g={}; ok=True
            for gr in u:
                gid=int(gr.get('id')); n=int(float(gr.get('value')))
                if gid not in UNIFAC: ok=False; break
                g[UNIFAC[gid]]=g.get(UNIFAC[gid],0)+n
            if ok and g: d['g']=g
        r_,q_=val(c,'UniquacR'),val(c,'UniquacQ')
        if r_ and q_: d['rq']=[r_,q_]
        hf,gf=val(c,'HeatOfFormation'),val(c,'GibbsEnergyOfFormation')
        if hf is not None and gf is not None: d['hf']=round(hf/1000,1); d['gf']=round(gf/1000,1)
        if err>0.02: d['cpNote']=round(float(err),3)
        while d['id'] in seen: d['id']+='-2'
        seen.add(d['id']); casmap[cas]=d['id']; comps.append(d)
def ipd(fn,ncols):
    out={}
    for line in open(BASE+'ChemSepIPD/'+fn,encoding='latin-1'):
        if not re.match(r'^\s*\d+-\d+-\d+\s+\d+-\d+-\d+',line): continue
        t=line.split()
        try: nums=[float(x) for x in t[2:2+ncols]]
        except: continue
        a,b=t[0],t[1]
        if a not in casmap or b not in casmap: continue
        k=tuple(sorted((casmap[a],casmap[b])))
        if k in out: continue
        out[k]=(casmap[a],casmap[b],nums,' '.join(t[2+ncols:])[:60])
    return out
nrtl=[]
for k,(i,j,(A12,A21,al),cmt) in ipd('nrtl.ipd',3).items():
    b12,b21=A12/1.98721,A21/1.98721
    if i>j: i,j,b12,b21=j,i,b21,b12
    nrtl.append([i,j,round(b12,3),round(b21,3),round(al,4)])
kij=[]
for k,(i,j,(kv,),cmt) in ipd('pr.ipd',1).items():
    a,b=sorted((i,j)); kij.append([a,b,kv])
uq=[]
for k,(i,j,(A12,A21),cmt) in ipd('uniquac.ipd',2).items():
    b12,b21=-A12/1.98721,-A21/1.98721
    if i>j: i,j,b12,b21=j,i,b21,b12
    uq.append([i,j,round(b12,3),round(b21,3)])
print('compostos', len(comps), 'duplicados com embutidos', len(dup), 'pulados', len(skipped), skipped[:8])
print('NRTL', len(nrtl), 'PR kij', len(kij), 'UNIQUAC', len(uq))
print('com UNIFAC', sum(1 for d in comps if 'g' in d), 'com vp101', sum(1 for d in comps if 'vp' in d), 'com ant', sum(1 for d in comps if 'ant' in d), 'cp fit >3%', sum(1 for d in comps if 'cpNote' in d), 'max', max([d.get('cpNote',0) for d in comps]))
lic=open('/tmp/dl/dwsim/PlatformFiles/Common/data/licenses/chemsep_database.txt',encoding='latin-1').read()
js=("/* Banco de componentes ChemSep v8.3 (pure component data e parâmetros de interação DECHEMA), Copyright (c) Harry Kooijman e Ross Taylor,\n"
    "   distribuído sob a Artistic License 2.0 (http://www.perlfoundation.org/artistic_license_2_0), obtido no repositório do DWSIM.\n"
    "   Convertido para o SIMULA FÁCIL IA: Cp de gás ideal ajustado a um polinômio cúbico (250–900 K), densidade do líquido a 25 °C (ou no ponto de ebulição),\n"
    "   calor de vaporização no ponto de ebulição, pressão de vapor pela equação 101 do DIPPR (ou Antoine), grupos UNIFAC quando todos estão no simulador,\n"
    "   NRTL (τ = b/T, b = A/R com A em cal/mol), UNIQUAC e kij de Peng-Robinson pelos números CAS. */\n"
    "(function (root) {\n  const SF = root.SF = root.SF || {};\n  SF.CHEMSEP = " +
    json.dumps({'version':'ChemSep v8.3 (DWSIM)','license':'Artistic License 2.0','builtinCas':BUILTIN_CAS,'compounds':comps,'nrtl':nrtl,'uniquac':uq,'kij':kij},ensure_ascii=False,separators=(',',':')) +
    ";\n})(typeof window !== 'undefined' ? window : globalThis);\n")
open('/home/claude/simulafacil/js/chemsep.js','w',encoding='utf-8').write(js)
print('tamanho', len(js.encode()))
print([d for d in comps if d['name'] in ('Acetonitrile','Chloroform','Phenol')][:2])
