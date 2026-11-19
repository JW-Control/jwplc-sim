# Tablero de riel DIN: térmicos, redes, fuentes, contactores, relés, SSR, E/S remotas, medidor, conversor, controlador.
from kit import *
import math
DEFS='''<linearGradient id="jwt-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2128"/><stop offset="1" stop-color="#2b323b"/></linearGradient>'''

def module(x,w,h,top=0,ears=True):
    """Módulo DIN: cuerpo claro, hombros más angostos arriba y abajo."""
    return rect(x+2,top+2,w-4,h-4,BODY,5)
def lbl(x,y,s,size=8.5,fill=TXT,anchor='middle',w=700):
    return text(x,y,s,size,fill,w,anchor)

# ------------------------------------------------ termomagnéticos y redes (80 px por polo, 340 alto)
def mcb(name,poles,terms_top,terms_bot,datum,rating=True,action=True,net=None):
    W=80*poles
    b=rect(2,2,W-4,336,BODY,5)
    b+=band(2,8,W-4,48)+band(2,282,W-4,48)
    for i in range(poles):
        x=40+80*i
        if terms_top: b+=term(x,32,terms_top[i],lab='none')+lbl(x,52,terms_top[i] if not net else '',8.5)
        else: b+=rect(x-12,22,24,20,'#c9cfd6',3,LINE,1)+lbl(x,52,'',8.5)
        b+=term(x,305,terms_bot[i],side='b',lab='none')+lbl(x,291,terms_bot[i],9)
        # ventana de estado por polo
        b+=rect(x-1,123,14,10,'#2b3138',2,LINE,1)
        b+=rect(x+1,125,10,6,'#3fae54',1,'none',0,data_show='!out.on')
        b+=rect(x+1,125,10,6,RED,1,'none',0,data_show='out.on')
        if i: b+=path(f'M{80*i} 60 V278',stroke='#c4cad1',sw=1.2)
    b+=jw(2,60,W-4,'' )
    b+=f'<text x="{W-7}" y="70" font-size="9" font-weight="700" fill="#e9edf1" text-anchor="end">{datum}</text>'
    if rating:
        b+=f'<text x="9" y="132" font-size="12" font-weight="800" fill="{TXT}" text-anchor="start" data-text="out.rating">C6</text>'
    elif net:
        b+=text(9,132,net,10,TXT,800,'start')
    # palanca (la barra une los polos)
    leverbox=rect(14,150,W-28,86,'#cfd4da',4,LINE,1)
    up=(rect(W/2-max(26,W/2-22),160,2*max(26,W/2-22),26,'#2f62a0',4,LINE,1)+lbl(W/2,177,'I',11,'#fff')+rect(W/2-8,186,16,26,'#244c7c',2,LINE,1))
    dn=(rect(W/2-8,176,16,26,'#244c7c',2,LINE,1)+rect(W/2-max(26,W/2-22),202,2*max(26,W/2-22),26,'#2f62a0',4,LINE,1)+lbl(W/2,219,'O',11,'#fff'))
    lever=leverbox+g(up,data_show='out.on')+g(dn,data_show='!out.on')
    if action: b+=g(lever,data_action='lever',data_kind='toggle',style='cursor:pointer')
    else: b+=lever
    b+=lbl(W/2,256,'ON ▲  OFF ▼',8,MUTED,600)
    if action:
        b+=tag(W/2,104,'DISPARÓ',RED,show='out.tripped')
    svg(name,W,340,b,DEFS)

mcb('breaker',1,['1'],['2'],'1P')
mcb('breaker__2p',2,['1','3'],['2','4'],'2P')
mcb('breaker__3p',3,['1','3','5'],['2','4','6'],'3P')
mcb('power-230vac',2,None,['L','N'],'230 VAC',rating=False,action=False,net='RED')
mcb('power-3ph',3,None,['L1','L2','L3'],'3 × 380 VAC',rating=False,action=False,net='RED 3~')

# ------------------------------------------------ fuentes 24 VDC
def psu(name,W,H,top,bot,bot_y,watts):
    b=rect(2,2,W-4,H-4,BODY,5)
    b+=band(2,4,W-4,44)+band(2,H-48,W-4,44)
    for t,x in top:
        lab={'+V1':'+V','+V2':'+V','-V1':'−V','-V2':'−V','DCOK1':'OK','DCOK2':'OK'}[t]
        b+=term(x,22,t,lab='none',r=7.5)+lbl(x,43,lab,7.5)
    for t,x in bot:
        lab={'PE':'⏚','N':'N','L':'L'}[t]
        b+=term(x,bot_y,t,side='b',lab='none',r=7.5)+lbl(x,bot_y-12,lab,8)
    b+=jw(2,52,W-4,'24 VDC')
    b+=text(W/2,90,watts,14,TXT,800)
    b+=led(24,112,'out.on',4.5)+text(34,115.5,'DC OK',8.5,MUTED,600,'start')
    b+=circ(W-26,112,8,'#f4f6f8')+path(f'M{W-30} {116} l8 -8',stroke='#39414b',sw=1.8)+lbl(W-26,132,'ADJ',7.5,MUTED,600)
    n=int((H-48-150)/12)
    for i in range(min(n,10)): b+=rect(20,150+i*12,W-40,4,'#cdd3da',2,'none',0)
    b+=tag(W/2,140,'SOBRECARGA',RED,show='tripped')
    svg(name,W,H,b,DEFS)
psu('power-24vdc__mdr60',180,360,[('+V1',40),('+V2',60),('-V1',80),('-V2',100),('DCOK1',120),('DCOK2',140)],[('PE',60),('N',80),('L',100)],340,'60 W')
psu('power-24vdc__hdr60',220,360,[('-V1',80),('-V2',100),('+V1',120),('+V2',140)],[('N',100),('L',120)],338,'60 W')
psu('power-24vdc__ndr120',160,500,[('-V1',40),('-V2',60),('+V1',80),('+V2',100)],[('PE',60),('N',80),('L',100)],477,'120 W')

# ------------------------------------------------ contactor (200 x 320)
def contactor(name,aux_t,aux_b,auxlbl):
    b=rect(6,30,188,262,BODY,6)
    # orejas de bobina
    b+=rect(4,2,34,34,BAND,4)+term(20,14,'A1',lab='none',r=7.5)+lbl(20,32,'A1',7.5)
    b+=rect(162,284,34,34,BAND,4)+term(180,306,'A2',side='b',lab='none',r=7.5)+lbl(180,293,'A2',7.5)
    b+=band(6,46,188,40)+band(6,234,188,40)
    for t,x in [('1',40),('3',80),('5',120),(aux_t,160)]:
        b+=term(x,66,t,lab='none')+lbl(x+(0),82,t if t not in('13','21') else t,7.5)
    for t,x in [('2',40),('4',80),('6',120),(aux_b,160)]:
        b+=term(x,254,t,side='b',lab='none')+lbl(x,246,t,7.5)
    b+=jw(6,90,188,'KM · 9 A')
    # ventana del indicador
    b+=rect(70,112,60,64,'url(#jwt-win)',5,LINE,1)
    b+=g(rect(82,120,36,22,'#3fae54',3,'none',0)+lbl(100,135,'O',12,'#fff'),data_show='!out.closed')
    b+=g(rect(82,146,36,22,RED,3,'none',0)+lbl(100,161,'I',12,'#fff'),data_show='out.closed')
    b+=lbl(40,140,'L1 L2 L3',7.5,MUTED,600)
    b+=lbl(160,132,auxlbl,8.5,TXT,800)+lbl(160,144,'aux.',7.5,MUTED,600)
    b+=rect(56,196,88,26,'#f4f6f8',3,LINE,1)+lbl(100,206,'bobina',7,MUTED,600)
    b+=f'<text x="100" y="218" font-size="10" font-weight="800" fill="{TXT}" text-anchor="middle" data-text="param.coil">24VDC</text>'
    b+=soot(100,150,70,40)
    svg(name,200,320,b,DEFS)
contactor('contactor','13','14','NA')
contactor('contactor__01','21','22','NC')

# ------------------------------------------------ relé térmico (200 x 280), va bajo el contactor
b=rect(6,22,188,254,BODY,6)
for t,x in [('1',40),('3',80),('5',120)]:
    b+=rect(x-7,0,14,26,'#b88a3e',2,LINE,1)+hit(t,x,12,8)
b+=lbl(150,16,'1 · 3 · 5',8,MUTED,600)
b+=jw(6,26,188,'térmico')
# dial
b+=circ(46,104,24,'#2f62a0',LINE)
for i in range(7):
    ang=-150+50*i; x1=46+26*math.sin(math.radians(ang)); y1=104-26*math.cos(math.radians(ang)); x2=46+30*math.sin(math.radians(ang)); y2=104-30*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=TXT,sw=1.2)
b+=g(rect(43,82,6,24,'#f4f6f8',2,'none',0)+circ(46,104,6,'#244c7c','none',0),data_rotate='out.ajusteRel:0:1:-150:150:46:104')
b+=f'<text x="132" y="98" font-size="10" font-weight="800" fill="{TXT}" text-anchor="middle" data-show="!out.tripped" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>'
b+=tag(132,94,'DISPARÓ',RED,show='out.tripped')
b+=g(rect(86,104,92,20,'#f39a2b',3,'none',0)+lbl(132,118,'FALTA DE FASE',8.5,'#2b1a00',800),data_show='out.faltaFase')
# TEST, STOP, RESET
b+=g(rect(20,140,26,20,'#f4f6f8',3,LINE,1)+lbl(33,154,'TEST',7.5)+rect(22,142,22,16,AMBER,3,'none',0,data_show='out.test'),data_action='test',data_kind='momentary',style='cursor:pointer')
b+=g(circ(100,150,12,RED,LINE)+circ(100,151,10,'#000','none',0,opacity='.25',data_show='out.stop')+lbl(100,174,'STOP',7.5),data_action='stop',data_kind='momentary',style='cursor:pointer')
rs=circ(150,150,12,'#2f7fe0',LINE)+g(rect(148,140,4,20,'#f4f6f8',1,'none',0),data_show='param.rearme=manual (H)',transform='rotate(-30 150 150)')+g(rect(148,140,4,20,'#f4f6f8',1,'none',0),data_show='param.rearme=automático (A)',transform='rotate(30 150 150)')
rs+=circ(150,150,15,'none',AMBER,3,data_show='out.tripped')+lbl(150,174,'RESET',7.5)+lbl(132,143,'H',7,MUTED)+lbl(168,143,'A',7,MUTED)
b+=g(rs,data_action='reset',data_kind='momentary',style='cursor:pointer')
b+=band(6,182,188,92)
for t,x,y,l in [('98',20,193.6,'98'),('97',80,193.6,'97'),('96',120,193.6,'96'),('95',180,193.6,'95')]:
    b+=term(x,y,t,side='b',lab='none',r=7.5)+lbl(x,y+18,l,7.5)
b+=lbl(50,213,'NA',7,MUTED,600)+lbl(150,213,'NC',7,MUTED,600)
for t,x in [('2',40),('4',100),('6',160)]:
    b+=term(x,237.6,t,side='b',lab='none')+lbl(x,262,{'2':'2/T1','4':'4/T2','6':'6/T3'}[t],7.5)
svg('overload-relay',200,280,b,DEFS)

# ------------------------------------------------ guardamotor (240 x 360)
b=rect(2,2,176,356,BODY,6)+rect(184,30,52,300,BODY2,5)
b+=band(2,8,176,46)+band(2,306,176,46)
for t,x in [('1',40),('3',80),('5',120)]: b+=term(x,30,t,lab='none')+lbl(x,50,t,7.5)
for t,x in [('2',40),('4',80),('6',120)]: b+=term(x,330,t,side='b',lab='none')+lbl(x,314,t,7.5)
b+=band(184,40,52,40)+band(184,280,52,40)
for t,x in [('13',200),('21',220)]: b+=term(x,58,t,lab='none',r=7)+lbl(x,77,t,7)
for t,x in [('14',200),('22',220)]: b+=term(x,302,t,side='b',lab='none',r=7)+lbl(x,288,t,7)
b+=lbl(210,150,'NA',8,MUTED)+lbl(210,162,'NC',8,MUTED)+lbl(210,176,'aux.',7,MUTED,600)
b+=jw(2,58,176,'guardamotor')
b+=circ(128,104,24,'#2f62a0',LINE)
for i in range(7):
    ang=-120+40*i; x1=128+26*math.sin(math.radians(ang)); y1=104-26*math.cos(math.radians(ang)); x2=128+30*math.sin(math.radians(ang)); y2=104-30*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=TXT,sw=1.2)
b+=g(rect(125,82,6,24,'#f4f6f8',2,'none',0)+circ(128,104,6,'#244c7c','none',0),data_rotate='out.ajusteRel:0:1:-120:120:128:104')
b+=f'<text x="128" y="148" font-size="9.5" font-weight="800" fill="{TXT}" text-anchor="middle" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>'
b+=g(rect(26,92,40,22,'#f4f6f8',3,LINE,1)+lbl(46,107,'TEST',8),data_action='test',data_kind='test' and 'momentary',style='cursor:pointer')
# perilla O - TRIP - I
b+=lbl(52,180,'O',10,TXT,800)+lbl(92,166,'TRIP',8,AMBER,800)+lbl(132,180,'I',10,TXT,800)
b+=circ(92,214,34,'#2b3138',LINE)
b+=g(g(rect(84,174,16,80,'#3a414b',5,LINE,1)+rect(89,178,6,22,'#f4f6f8',2,'none',0),data_rotate='out.knob:0:1:-60:60:92:214'),data_action='knob',data_kind='toggle',style='cursor:pointer')
b+=tag(92,276,'DISPARADO',RED,show='out.tripped')
svg('motor-protector',240,360,b,DEFS)

# ------------------------------------------------ relés de riel 120 x 380 (temporizador y nivel)
def relay_base(top,bot,datum):
    b=rect(2,2,116,376,BODY,6)+band(2,4,116,44)+band(2,332,116,44)
    for t,x in top: b+=term(x,22,t,lab='none',r=7.5)+lbl(x,43,t,7.5)
    for t,x in bot: b+=term(x,358,t,side='b',lab='none',r=7.5)+lbl(x,340,t,7.5)
    b+=jw(2,52,116,datum)
    b+=led(22,80,'out.energized',4.5)+lbl(32,83.5,'U',8.5,MUTED,'start')
    b+=led(70,80,'out.closed',4.5,AMBER)+lbl(80,83.5,'R',8.5,MUTED,'start')
    return b
b=relay_base([('A1',20),('15',60),('25',100)],[('A2',20),('16',40),('18',60),('26',80),('28',100)],'temporizador')
b+=f'<text x="60" y="112" font-size="9" font-weight="700" fill="{TXT}" text-anchor="middle" data-text="param.mode">retardo a la conexión</text>'
b+=circ(60,196,40,'#f4f6f8')
for i in range(11):
    ang=-135+27*i; x1=60+33*math.sin(math.radians(ang)); y1=196-33*math.cos(math.radians(ang)); x2=60+38*math.sin(math.radians(ang)); y2=196-38*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=TXT,sw=1.2)
b+=g(path('M60 196 L60 164',stroke=JWG2,sw=3,stroke_linecap='round')+circ(60,196,5,DARK,'none',0),data_rotate='out.progress:0:1:-135:135:60:196')
b+=f'<text x="60" y="258" font-size="12" font-weight="800" fill="{TXT}" text-anchor="middle" data-text="out.timeTxt">5 s</text>'
b+=f'<text x="60" y="274" font-size="9" font-weight="700" fill="{MUTED}" text-anchor="middle" data-text="param.coil">24VDC</text>'
b+=lbl(60,300,'15-18 · 25-28 NA',7.5,MUTED,600)+lbl(60,312,'15-16 · 25-26 NC',7.5,MUTED,600)
svg('timer-relay',120,380,b,DEFS)

b=relay_base([('A1',20),('E1',60),('E2',100)],[('A2',20),('E3',40),('11',60),('12',80),('14',100)],'relé de nivel')
b+=f'<text x="60" y="112" font-size="9.5" font-weight="700" fill="{TXT}" text-anchor="middle" data-text="param.modo">llenado</text>'
# tanque esquemático con los tres electrodos
b+=rect(24,132,72,110,'#f4f6f8',4)
b+=g(rect(25,150,70,91,WATER,0,'none',0,opacity='.85'),data_show='out.nivel=alto')
b+=g(rect(25,192,70,49,WATER,0,'none',0,opacity='.85'),data_show='out.nivel=medio')
b+=g(rect(25,226,70,15,WATER,0,'none',0,opacity='.85'),data_show='out.nivel=bajo')
for x,y2,l in [(42,170,'E1'),(60,206,'E2'),(78,236,'E3')]:
    b+=path(f'M{x} 126 V{y2}',stroke=TXT,sw=2.4)+lbl(x,124,l,7.5)
b+=f'<text x="60" y="270" font-size="9" font-weight="700" fill="{MUTED}" text-anchor="middle" data-text="param.coil">24VDC</text>'
b+=lbl(60,300,'11-14 NA · 11-12 NC',7.5,MUTED,600)
svg('level-relay',120,380,b,DEFS)

# ------------------------------------------------ SSR (180 x 260)
b=rect(10,6,160,248,'#3a414b',6)
b+=rect(10,6,160,52,BAND,6)+rect(10,202,160,52,BAND,6)
b+=term(40,32,'1',lab='none')+lbl(40,52,'1  ~',8)+term(140,32,'2',lab='none')+lbl(140,52,'2  ~',8)
b+=term(40,228,'3',side='b',lab='none')+lbl(40,212,'3  +',8)+term(140,228,'4',side='b',lab='none')+lbl(140,212,'4  −',8)
b+=jw(10,62,160,'SSR 40 A')
b+=lbl(90,108,'CARGA 24-380 VAC',8.5,LIGHT,700)
b+=rect(54,120,72,48,'#2b3138',4,'#4a525c',1)+lbl(90,138,'→|←',13,'#9aa3ad',700)+lbl(90,158,'opto',8,'#9aa3ad',600)
b+=led(90,186,'out.input',5,'#ff5a4e')+lbl(104,189,'IN',8,'#cfd5dc',700,'start')
b+=lbl(90,198,'CONTROL 3-32 VDC',7.5,'#cfd5dc',700)
svg('ssr',180,260,b,DEFS)

# ------------------------------------------------ E/S remotas 8DI/8DO (280 x 300)
b=rect(2,2,276,296,BODY,6)+band(2,4,276,44)+band(2,252,276,44)
for t,x in [('+',20),('-',40),('A',60),('B',80),('DC',100)]+[(f'DI{i}',100+20*i) for i in range(1,9)]:
    b+=term(x,20,t,lab='none',r=7.5)+lbl(x,40,t.replace('DI','') if t.startswith('DI') else {'-':'−'}.get(t,t),7.5)
for t,x in [('C1',40)]+[(f'DO{i}',40+20*i) for i in range(1,5)]+[('C2',140)]+[(f'DO{i}',80+20*i) for i in range(5,9)]:
    b+=term(x,280,t,side='b',lab='none',r=7.5)+lbl(x,265,t.replace('DO','') if t.startswith('DO') else t,7.5)
b+=lbl(170,58,'DI 1 … 8',7.5,MUTED,600,'middle')
b+=jw(2,62,276,'E/S remotas 8DI · 8DO')
b+=led(24,98,'out.powered',4.5)+lbl(34,101.5,'PWR',8,MUTED,700,'start')
b+=lbl(196,101.5,'dir.',8,MUTED,700,'end')+rect(204,88,46,22,'#2b3138',3)+f'<text x="227" y="104" font-size="12" font-weight="800" fill="{LEDON}" text-anchor="middle" data-text="param.address">3</text>'
b+=rect(16,120,248,116,'#f4f6f8',4)
for i in range(1,9):
    x=24+(i-1)*30
    b+=led(x+6,142,f'out.di{i}',5)+lbl(x+6,160,f'I{i}',8,TXT,700)
    b+=led(x+6,190,f'out.do{i}',5,AMBER)+lbl(x+6,208,f'Q{i}',8,TXT,700)
b+=lbl(140,228,'RS-485 · Modbus RTU',8,MUTED,600)
svg('remote-io',280,300,b,DEFS)

# ------------------------------------------------ medidor de energía (240 x 260)
b=rect(2,30,236,226,BODY,6)+band(2,206,236,48)
b+=term(40,14,'CT1',lab='none',r=7.5)+term(200,14,'CT2',lab='none',r=7.5)
b+=path('M40 22 V44 Q40 52 48 52 H96 M200 22 V44 Q200 52 192 52 H144',stroke=DARK,sw=3)
b+=circ(120,52,24,'#2b3138',LINE)+circ(120,52,13,BODY,LINE,1)+lbl(120,30,'TC',7.5,LIGHT)
b+=lbl(40,32,'CT1',7.5)+lbl(200,32,'CT2',7.5)
b+=jw(2,82,236,'medidor RS-485')
b+=rect(20,102,200,66,'#0b1a10',4,'#2a3a2e',1)
b+=g(circ(206,112,3,LEDON,'none',0),data_show='out.powered')
b+=f'<text x="120" y="130" font-size="12" font-weight="700" fill="{LEDON}" text-anchor="middle" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.lectura">sin tensión</text>'
b+=f'<text x="120" y="156" font-size="15" font-weight="800" fill="{LEDON}" text-anchor="middle" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.kwh:d3:kWh">0,000 kWh</text>'
b+=lbl(120,190,'fase por el TC',8,MUTED,600)
for t,x in [('L',40),('N',80),('A',160),('B',200)]: b+=term(x,232,t,side='b',lab='none')+lbl(x,218,t,8)
svg('energy-meter',240,260,b,DEFS)

# ------------------------------------------------ conversor USB a RS-485 (120 x 340)
b=rect(10,6,100,320,'#2f62a0',8)+band(10,6,100,44)
for t,x,l in [('A',40,'A+'),('B',60,'B−'),('GND',80,'GND')]: b+=term(x,24,t,lab='none',r=7.5)+lbl(x,45,l,7.5)
b+=jw(10,54,100,'USB-485')
b+=rect(24,82,72,36,'#244c7c',3,'none',0)+lbl(60,104,'RS-485',10,'#eaf1fb',800)
b+=circ(36,138,4,'#4a5058',LINE,1)+lbl(46,141,'TX',8,'#cfe0f5',700,'start')+circ(76,138,4,'#4a5058',LINE,1)+lbl(86,141,'RX',8,'#cfe0f5',700,'start')
b+=rect(24,208,72,36,'#f4f6f8',3)+lbl(60,221,'puerto',7,MUTED,600)
b+=f'<text x="60" y="237" font-size="12" font-weight="800" fill="{TXT}" text-anchor="middle" data-text="param.com">COM20</text>'
b+=tag(60,164,'ECO',AMBER,show='param.eco',fg='#2b1a00')
b+=tag(60,182,'A ⇄ B',RED,show='param.abInvertidos')
b+=tag(60,200,'sin 120 Ω',AMBER,show='param.sinTerminacion',fg='#2b1a00')
b+=rect(36,326,48,14,STEEL,2)+rect(42,330,36,6,'#7c858f',1,'none',0)
svg('usb-rs485',120,340,b,DEFS)

# ------------------------------------------------ controlador de temperatura 48 x 48 (200 x 300)
b=rect(2,2,196,296,'#3a414b',6)+band(2,4,196,40)+band(2,256,196,40)
for t,x in [('L',20),('N',40),('A',80),('B',100),('11',140),('14',160)]: b+=term(x,20,t,lab='none',r=7.5)+lbl(x,40,t,7.5)
for t,x in [('R1',40),('R2',60),('R3',80),('21',140),('24',160)]: b+=term(x,280,t,side='b',lab='none',r=7.5)+lbl(x,265,t,7.5)
b+=jw(2,48,196,'TC 48 × 48')
b+=rect(16,70,168,170,'#20252c',6,'#4a525c',1)
b+=rect(26,82,148,48,'#0d0f12',3,'none',0)+lbl(36,98,'PV',8,'#ff8a80',800,'start')
b+=f'<text x="166" y="122" font-size="28" font-weight="700" fill="#ff5a4e" text-anchor="end" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.pvTxt">25.0</text>'
b+=rect(26,138,148,42,'#0d0f12',3,'none',0)+lbl(36,152,'SV',8,'#9be37e',800,'start')
b+=f'<text x="166" y="174" font-size="24" font-weight="700" fill="{LEDON}" text-anchor="end" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.svTxt">40.0</text>'
b+=led(40,196,'out.salida',4.5,'#ff5a4e')+lbl(50,199.5,'OUT',8,'#cfd5dc',700,'start')
b+=led(110,196,'out.alarma',4.5,AMBER)+lbl(120,199.5,'AL1',8,'#cfd5dc',700,'start')
for i,s in enumerate(['SET','◄','▼','▲']): b+=rect(30+i*36,212,30,18,'#4a525c',3,'#22272e',1)+lbl(45+i*36,225,s,8,'#e6e9ee',700)
svg('temp-controller',200,300,b,DEFS)
print('tablero ok')
