# Tablero de riel DIN, estilo «réplica JW» (19/11): proporciones de equipo real (4 px/mm),
# contorno oscuro de 3 px, zona de bornes más oscura que el frente, tornillos grandes,
# rótulos de borne en negrita con relieve blanco, un solo dato grande, un módulo por polo,
# colores de estado vivos y la franja JW como única marca. Sin degradados.
import kit, math
from kit import rect,circ,path,text,g,hit,soot,tag
from kit import svg
OL='#1f2328'; BODY='#e1e4e8'; HOOD='#c4c9cf'; FACE='#eceef1'; INK='#1e2226'; MUT='#5d6670'
ON='#ff2d20'; OFF='#12c41a'; BLUE='#1f6fd1'; BLK='#16191d'
def scr(x,y,r=13):
    d=r*0.55
    return (circ(x,y,r,'#fbfbfc',OL,2.4)+circ(x,y,r-3.2,'none','#a3aab2',1.2)
            +path(f'M{x-d:.1f} {y}h{2*d:.1f} M{x} {y-d:.1f}v{2*d:.1f}',stroke='#2a2e33',sw=3.4,stroke_linecap='round'))
def lab(x,y,s,size=15,fill=INK,anchor='middle'):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="800" fill="{fill}" text-anchor="{anchor}" '
            f'stroke="#ffffff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">{s}</text>')
def T(t,x,y,r=13,side=None): return scr(x,y,r)+hit(t,x,y,r+1,side=side)
def brand(x,y,w,datum='',h=22):
    s=rect(x,y,w,h,'#15181c',0,OL,1.5)
    s+=text(x+7,y+h-6,'JW',14,'#fff',900,'start')+path(f'M{x+30} {y+h-7} l4 -7 l4 7',stroke='#7cb342',sw=2.4,stroke_linecap='round',stroke_linejoin='round')
    if datum: s+=text(x+w-7,y+h-6,datum,12,'#f1f3f5',800,'end')
    return s

# ---------------- termomagnético: 80 px (20 mm) por polo, 360 de alto (90 mm)
def mcb(name,poles,tt,bb,net=None):
    W=80*poles; H=360
    b=rect(1.5,1.5,W-3,H-3,BODY,3,OL,3)
    b+=rect(1.5,1.5,W-3,86,HOOD,3,OL,2)+rect(1.5,272,W-3,86.5,HOOD,3,OL,2)
    for i in range(poles):
        x=40+80*i
        if tt: b+=T(tt[i],x,32)+lab(x,72,tt[i],18)
        else: b+=rect(x-12,10,24,44,'#3a3f46',3,OL,2)+rect(x-5,0,10,12,'#3a3f46',0,OL,1.6)  # acometida de la red
        b+=T(bb[i],x,326,side='b')+lab(x,300,bb[i],18)
    b+=brand(1.5,90,W-3)
    if net: b+=text(W/2,140,net,20 if poles>2 else 17,INK,900)
    else: b+=f'<text x="{W/2}" y="142" font-size="24" font-weight="900" fill="{INK}" text-anchor="middle" data-text="out.rating">C16</text>'
    for i in range(poles):
        x=40+80*i
        b+=rect(x-15,154,30,14,'#2a2e33',2,OL,1.5)
        b+=rect(x-13,156,26,10,OFF,1,'none',0,data_show='!out.on')+rect(x-13,156,26,10,ON,1,'none',0,data_show='out.on')
        b+=rect(x-24,178,48,88,'#454b53',4,OL,2)
        if i: b+=path(f'M{80*i} 2 V358',stroke=OL,sw=2)
    def lev(y,ch):
        s=''
        for i in range(poles):
            x=40+80*i
            s+=rect(x-19,y,38,40,BLK,3,OL,2)+rect(x-19,y,38,9,'#30353c',3,'none',0)+text(x,y+31,ch,15,'#f1f3f5',900)
        if poles>1: s+=rect(20,y+16,W-40,8,BLK,2,OL,1.5)+''.join(text(40+80*i,y+31,ch,15,'#f1f3f5',900) for i in range(poles))
        return s
    lever=g(lev(182,'I'),data_show='out.on')+g(lev(222,'O'),data_show='!out.on')
    if net: b+=lever
    else:
        b+=g(lever,data_action='lever',data_kind='toggle',style='cursor:pointer')
        b+=tag(W/2,134,'DISPARÓ',ON,show='out.tripped',size=11)
    svg(name,W,H,b)
mcb('breaker',1,['1'],['2'])
mcb('breaker__2p',2,['1','3'],['2','4'])
mcb('breaker__3p',3,['1','3','5'],['2','4','6'])
mcb('power-230vac',2,None,['L','N'],'230 V')
mcb('power-3ph',3,None,['L1','L2','L3'],'3×380 V')

# ---------------- contactor 200 x 320 (45 mm de ancho, bornes de fuerza alineados con el térmico)
def contactor(name,aux_t,aux_b,auxlbl):
    b=rect(6,26,188,268,BODY,4,OL,3)
    b+=rect(6,44,188,54,HOOD,0,OL,2)+rect(6,222,188,54,HOOD,0,OL,2)
    for t,x,l in [('1',40,'1/L1'),('3',80,'3/L2'),('5',120,'5/L3'),(aux_t,160,aux_t+' '+auxlbl)]:
        b+=T(t,x,66)+lab(x,93,l,12.5)
    for t,x,l in [('2',40,'2/T1'),('4',80,'4/T2'),('6',120,'6/T3'),(aux_b,160,aux_b+' '+auxlbl)]:
        b+=T(t,x,254,side='b')+lab(x,237,l,12.5)
    # orejas de bobina
    b+=rect(2,1.5,36,46,HOOD,3,OL,2.4)+T('A1',20,16,11)+lab(20,42,'A1',12.5)
    b+=rect(162,272.5,36,46,HOOD,3,OL,2.4)+T('A2',180,304,11,side='b')+lab(180,286,'A2',12.5)
    b+=brand(6,100,188,'9 A')
    # símbolo impreso de los contactos
    sym=''
    for i in range(3):
        x=22+12*i; sym+=f'M{x} 134 V148 L{x-7} 160 M{x} 164 V180 '
    b+=path(sym,stroke='#4b525a',sw=1.8,stroke_linecap='round')+path('M15 154 H44',stroke='#4b525a',sw=1.4,stroke_dasharray='3 2')
    # ventana del indicador del portacontactos
    b+=rect(58,130,76,58,'#1b1f24',4,OL,2)
    b+=g(rect(68,136,56,22,OFF,3,'none',0)+text(96,152,'O',15,'#fff',900),data_show='!out.closed')
    b+=g(rect(68,160,56,22,ON,3,'none',0)+text(96,176,'I',15,'#fff',900),data_show='out.closed')
    # placa de bobina: el único dato
    b+=rect(142,130,46,58,'#ffffff',3,OL,1.6)+text(165,148,'bobina',9,MUT,700)
    b+=f'<text x="165" y="172" font-size="11" font-weight="900" fill="{INK}" text-anchor="middle" data-text="param.coil">24VDC</text>'
    b+=soot(100,160,70,40)
    svg(name,200,320,b)
contactor('contactor','13','14','NO')
contactor('contactor__01','21','22','NC')

# ---------------- relé térmico 200 x 280 (va bajo el contactor)
b=rect(4,24,192,254,BODY,4,OL,3)
for t,x in [('1',40),('3',80),('5',120)]:
    b+=rect(x-8,0,16,32,'#c98a4b',2,OL,2)+rect(x-8,0,5,32,'#e0a56b',0,'none',0)+hit(t,x,12,9)
b+=brand(4,32,192,'térmico')
b+=circ(46,106,26,BLUE,OL,2.4)
for i in range(7):
    ang=-150+50*i; x1=46+29*math.sin(math.radians(ang)); y1=106-29*math.cos(math.radians(ang)); x2=46+34*math.sin(math.radians(ang)); y2=106-34*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=INK,sw=1.8)
b+=g(rect(43,84,6,26,'#ffffff',2,'none',0)+circ(46,106,7,'#164f96','none',0),data_rotate='out.ajusteRel:0:1:-150:150:46:106')
b+=f'<text x="134" y="88" font-size="13" font-weight="900" fill="{INK}" text-anchor="middle" data-show="!out.tripped" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>'
b+=tag(134,83,'DISPARÓ',ON,show='out.tripped',size=11)
b+=g(rect(88,96,92,20,'#ff9d00',3,OL,1.4)+text(134,110,'FALTA DE FASE',10,'#2b1a00',900),data_show='out.faltaFase')
b+=g(rect(16,140,34,20,'#f7f8f9',3,OL,1.8)+rect(19,143,12,14,'#2a2e33',2,'none',0)+rect(33,143,14,14,'#ffb000',2,'none',0,data_show='out.test')+text(33,174,'TEST',10,INK,800),
     data_action='test',data_kind='momentary',style='cursor:pointer')
b+=g(rect(86,136,28,28,'#e3262b',3,OL,2)+rect(86,136,28,28,'#000','none',0,opacity='.3',data_show='out.stop')+text(100,178,'STOP',10,INK,800),data_action='stop',data_kind='momentary',style='cursor:pointer')
rs=circ(156,150,14,BLUE,OL,2)+g(rect(154,139,4,22,'#fff',1,'none',0),data_show='param.rearme=manual (H)',transform='rotate(-30 156 150)')+g(rect(154,139,4,22,'#fff',1,'none',0),data_show='param.rearme=automático (A)',transform='rotate(30 156 150)')
rs+=circ(156,150,18,'none','#ffb000',3.5,data_show='out.tripped')+text(156,178,'RESET',10,INK,800)+text(134,134,'H',10,MUT,800)+text(178,134,'A',10,MUT,800)
b+=g(rs,data_action='reset',data_kind='momentary',style='cursor:pointer')
b+=rect(4,182,192,96,HOOD,0,OL,2)
for t,x in [('98',20),('97',80),('96',120),('95',180)]:
    b+=T(t,x,194,10,side='b')+lab(x,220,t,12)
b+=text(50,198,'NO',9,MUT,800)+text(150,198,'NC',9,MUT,800)
for t,x,l in [('2',40,'2/T1'),('4',100,'4/T2'),('6',160,'6/T3')]:
    b+=T(t,x,240,side='b')+lab(x,272,l,13)
svg('overload-relay',200,280,b)

# ---------------- guardamotor 240 x 360 (45 mm + bloque auxiliar lateral)
b=rect(2,2,176,356,BODY,4,OL,3)+rect(182,30,56,300,BODY,4,OL,3)
b+=rect(2,2,176,64,HOOD,4,OL,2)+rect(2,294,176,64,HOOD,4,OL,2)
for t,x,l in [('1',40,'1/L1'),('3',80,'3/L2'),('5',120,'5/L3')]: b+=T(t,x,28)+lab(x,58,l,13)
for t,x,l in [('2',40,'2/T1'),('4',80,'4/T2'),('6',120,'6/T3')]: b+=T(t,x,330,side='b')+lab(x,310,l,13)
b+=rect(182,30,56,62,HOOD,4,OL,2)+rect(182,268,56,62,HOOD,4,OL,2)
for t,x in [('13',200),('21',220)]: b+=T(t,x,52,8.5)+lab(x,82,t,10)
for t,x in [('14',200),('22',220)]: b+=T(t,x,308,8.5,side='b')+lab(x,284,t,10)
b+=text(210,170,'NO',10,MUT,800)+text(210,184,'NC',10,MUT,800)
b+=brand(2,70,176,'guardamotor')
b+=circ(132,126,24,BLUE,OL,2.4)
for i in range(7):
    ang=-120+40*i; x1=132+27*math.sin(math.radians(ang)); y1=126-27*math.cos(math.radians(ang)); x2=132+32*math.sin(math.radians(ang)); y2=126-32*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=INK,sw=1.8)
b+=g(rect(129,104,6,24,'#fff',2,'none',0)+circ(132,126,7,'#164f96','none',0),data_rotate='out.ajusteRel:0:1:-120:120:132:126')
b+=f'<text x="132" y="172" font-size="12" font-weight="900" fill="{INK}" text-anchor="middle" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>'
b+=g(rect(18,112,46,26,'#f7f8f9',3,OL,1.8)+text(41,130,'TEST',11,INK,900),data_action='test',data_kind='momentary',style='cursor:pointer')
b+=text(40,214,'O',16,INK,900)+text(90,194,'TRIP',11,'#d97a00',900)+text(140,214,'I',16,INK,900)
b+=circ(90,246,40,'#2b3036',OL,2.4)
b+=g(g(rect(80,198,20,96,BLK,6,OL,2)+rect(86,204,8,30,'#ffffff',2,'none',0),data_rotate='out.knob:0:1:-60:60:90:246'),data_action='knob',data_kind='toggle',style='cursor:pointer')
b+=tag(132,282,'DISPARADO',ON,show='out.tripped',size=11)
svg('motor-protector',240,360,b)

# ---------------- utilidades del resto del tablero
LED_OFF='#3d434b'; GREEN='#22d33a'; AMB='#ffae00'; LCD='#0c1a10'; LCDT='#7dff5a'
def led(x,y,expr,col=GREEN,r=5):
    return circ(x,y,r,LED_OFF,OL,1.6)+g(circ(x,y,r+4,col,'none',0,opacity='.3')+circ(x,y,r,col,OL,1.6),data_show=expr)
def hood(x,y,w,h,fill=HOOD): return rect(x,y,w,h,fill,0,OL,2)
def mono(x,y,s,size,fill,anchor='middle',expr=None,w=700):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" '
            f'font-family="Consolas,DejaVu Sans Mono,monospace"'+(f' data-text="{expr}"' if expr else '')+f'>{s}</text>')
def dtext(x,y,expr,s,size,fill=INK,w=900,anchor='middle'):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" data-text="{expr}">{s}</text>'

# ---------------- fuentes 24 V: MDR (plástico), HDR (escalonada), NDR (metálica con aletas)
def psu(name,W,H,top,bot,bot_y,watts,kind):
    face={'mdr':'#e6e8eb','hdr':'#e6e8eb','ndr':'#cfd4da'}[kind]
    b=rect(1.5,1.5,W-3,H-3,face,3,OL,3)
    b+=hood(1.5,1.5,W-3,56)+hood(1.5,bot_y-36,W-3,H-bot_y+34.5)
    for t,x in top:
        l={'+V1':'+V','+V2':'+V','-V1':'−V','-V2':'−V','DCOK1':'OK','DCOK2':'OK'}[t]
        b+=T(t,x,22,8.5)+lab(x,50,l,10.5)
    for t,x in bot:
        l={'PE':'⏚','N':'N','L':'L'}[t]
        b+=T(t,x,bot_y,8.5,side='b')+lab(x,bot_y-16,l,11)
    if kind=='hdr': b+=rect(12,84,W-24,bot_y-128,'#f1f2f4',3,OL,2)
    b+=brand(1.5,60,W-3,'24 V')
    b+=text(W/2,118,watts,26,INK,900)
    b+=led(26,140,'out.on')+text(38,144.5,'DC OK',11,INK,800,'start')
    b+=circ(W-28,140,9,'#fbfbfc',OL,2)+path(f'M{W-33} {145} l10 -10',stroke='#2a2e33',sw=2.6,stroke_linecap='round')+text(W-28,164,'ADJ',9,MUT,800)
    y0,y1=176,bot_y-52
    if kind=='ndr':
        for x in range(24,W-20,14): b+=rect(x,y0,6,y1-y0,'#b3bac2',2,OL,1)
    else:
        y=y0
        while y<y1: b+=rect(22,y,W-44,6,'#9aa2ab',3,'none',0); y+=14
    b+=tag(W/2,166,'SOBRECARGA',ON,show='tripped',size=11)
    svg(name,W,H,b)
psu('power-24vdc__mdr60',180,360,[('+V1',40),('+V2',60),('-V1',80),('-V2',100),('DCOK1',120),('DCOK2',140)],[('PE',60),('N',80),('L',100)],340,'60 W','mdr')
psu('power-24vdc__hdr60',220,360,[('-V1',80),('-V2',100),('+V1',120),('+V2',140)],[('N',100),('L',120)],338,'60 W','hdr')
psu('power-24vdc__ndr120',160,500,[('-V1',40),('-V2',60),('+V1',80),('+V2',100)],[('PE',60),('N',80),('L',100)],477,'120 W','ndr')

# ---------------- relés modulares 120 x 380 (temporizador y nivel)
def relay_base(top,bot,datum):
    b=rect(1.5,1.5,117,377,BODY,3,OL,3)+hood(1.5,1.5,117,56)+hood(1.5,322,117,56.5)
    for t,x in top: b+=T(t,x,22,8.5)+lab(x,50,t,10.5)
    for t,x in bot: b+=T(t,x,358,8.5,side='b')+lab(x,338,t,10.5)
    b+=brand(1.5,60,117,datum)
    b+=led(22,98,'out.energized')+text(32,102.5,'U',12,INK,900,'start')
    b+=led(72,98,'out.closed',AMB)+text(82,102.5,'R',12,INK,900,'start')
    return b
b=relay_base([('A1',20),('15',60),('25',100)],[('A2',20),('16',40),('18',60),('26',80),('28',100)],'tempor.')
b+=dtext(60,126,'param.mode','retardo a la conexión',9.5,INK,800)
b+=circ(60,196,44,'#fbfbfc',OL,2.4)
for i in range(11):
    ang=-135+27*i; r2=40 if i%5 else 36
    x1=60+30*math.sin(math.radians(ang)); y1=196-30*math.cos(math.radians(ang)); x2=60+r2*math.sin(math.radians(ang))*1.1; y2=196-r2*math.cos(math.radians(ang))*1.1
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=INK,sw=2 if i%5==0 else 1.4)
b+=g(path('M60 196 L60 162',stroke='#3f9a4c',sw=4,stroke_linecap='round')+circ(60,196,7,'#2a2e33',OL,1.6),data_rotate='out.progress:0:1:-135:135:60:196')
b+=dtext(60,266,'out.timeTxt','5 s',18)
b+=dtext(60,286,'param.coil','24VDC',11,MUT,800)
b+=text(60,310,'15-18 · 25-28 NA',9,MUT,800)
svg('timer-relay',120,380,b)

b=relay_base([('A1',20),('E1',60),('E2',100)],[('A2',20),('E3',40),('11',60),('12',80),('14',100)],'nivel')
b+=dtext(60,128,'param.modo','llenado',12,INK,900)
b+=rect(22,140,76,112,'#fbfbfc',3,OL,2.4)+text(60,266,'E1 · E2 · E3',10,MUT,800)
b+=g(rect(24,158,72,92,'#2f8ee0',0,'none',0),data_show='out.nivel=alto')
b+=g(rect(24,198,72,52,'#2f8ee0',0,'none',0),data_show='out.nivel=medio')
b+=g(rect(24,232,72,18,'#2f8ee0',0,'none',0),data_show='out.nivel=bajo')
for x,y2,l in [(40,176,'E1'),(60,212,'E2'),(80,242,'E3')]:
    b+=path(f'M{x} 136 V{y2}',stroke=INK,sw=3)
b+=dtext(60,282,'param.coil','24VDC',11,MUT,800)
b+=text(60,306,'11-14 NA · 11-12 NC',9,MUT,800)
svg('level-relay',120,380,b)

# ---------------- relé de estado sólido 180 x 260 (cuerpo negro, placa blanca)
b=rect(8,4,164,252,'#2b2f35',4,OL,3)
b+=hood(8,4,164,60,'#41474f')+hood(8,196,164,60,'#41474f')
WT='#f1f3f5'
b+=T('1',40,30)+text(40,58,'1 ~',12,WT,900)+T('2',140,30)+text(140,58,'2 ~',12,WT,900)
b+=T('3',40,230,side='b')+text(40,210,'3 +',12,WT,900)+T('4',140,230,side='b')+text(140,210,'4 −',12,WT,900)
b+=brand(8,66,164,'40 A')
b+=rect(30,96,120,72,'#f4f5f7',3,OL,2)+text(90,114,'CARGA 24-380 VAC',10,INK,900)
b+=path('M62 138 H80 M80 128 V148 M80 138 L96 128 V148 Z M96 138 H118',stroke=INK,sw=2,stroke_linejoin='round')
b+=text(90,162,'opto · cruce por cero',8.5,MUT,800)
b+=led(64,182,'out.input','#ff3b30')+text(76,186.5,'IN 3-32 VDC',10,WT,800,'start')
svg('ssr',180,260,b)

# ---------------- E/S remotas 8DI/8DO (280 x 300)
b=rect(1.5,1.5,277,297,BODY,3,OL,3)+hood(1.5,1.5,277,52)+hood(1.5,246,277,52.5)
for t,x in [('+',20),('-',40),('A',60),('B',80),('DC',100)]+[(f'DI{i}',100+20*i) for i in range(1,9)]:
    b+=T(t,x,20,8.5)+lab(x,46,t.replace('DI','') if t.startswith('DI') else {'-':'−'}.get(t,t),10)
for t,x in [('C1',40)]+[(f'DO{i}',40+20*i) for i in range(1,5)]+[('C2',140)]+[(f'DO{i}',80+20*i) for i in range(5,9)]:
    b+=T(t,x,280,8.5,side='b')+lab(x,260,t.replace('DO','') if t.startswith('DO') else t,10)
b+=brand(1.5,56,277,'E/S 8DI · 8DO')
b+=led(24,96,'out.powered')+text(36,100.5,'PWR',11,INK,900,'start')
b+=text(198,100.5,'dir.',11,MUT,800,'end')+rect(204,84,50,24,LCD,3,OL,2)+mono(229,102,'3',15,LCDT,expr='param.address',w=800)
b+=rect(14,116,252,124,'#f7f8f9',3,OL,2)
for i in range(1,9):
    x=30+(i-1)*30
    b+=led(x,138,f'out.di{i}')+text(x,158,f'I{i}',10,INK,900)
    b+=led(x,184,f'out.do{i}',AMB)+text(x,204,f'Q{i}',10,INK,900)
b+=text(140,228,'RS-485 · Modbus RTU',10,MUT,800)
svg('remote-io',280,300,b)

# ---------------- medidor de energía con TC (240 x 260)
b=rect(1.5,30,237,228.5,BODY,3,OL,3)+hood(1.5,198,237,60.5)
b+=T('CT1',40,14,8)+T('CT2',200,14,8)
b+=path('M40 22 V44 Q40 52 48 52 H96 M200 22 V44 Q200 52 192 52 H144',stroke='#2a2e33',sw=4)
b+=circ(120,52,24,'#2b3036',OL,2.4)+circ(120,52,12,BODY,OL,2)+text(120,92-12,'',1)
b+=lab(64,40,'CT1',10)+lab(176,40,'CT2',10)
b+=brand(1.5,82,237,'medidor RS-485')
b+=rect(18,112,204,66,LCD,4,OL,2.4)
b+=g(circ(208,122,3.5,LCDT,'none',0),data_show='out.powered')
b+=mono(120,138,'sin tensión',13,LCDT,expr='out.lectura')
b+=mono(120,166,'0,000 kWh',18,LCDT,expr='out.kwh:d3:kWh',w=800)
b+=text(120,192,'fase por el TC',10,MUT,800)
for t,x in [('L',40),('N',80),('A',160),('B',200)]: b+=T(t,x,234,12,side='b')+lab(x,214,t,12)
svg('energy-meter',240,260,b)

# ---------------- conversor USB a RS-485 (120 x 340)
b=rect(10,4,100,322,'#2563b0',8,OL,3)
b+=rect(16,8,88,36,'#2f9a4c',3,OL,2)
for t,x,l in [('A',40,'A+'),('B',60,'B−'),('GND',80,'GND')]: b+=T(t,x,24,8)+text(x,60,l,10,'#ffffff',900)
b+=brand(10,66,100,'')
b+=rect(22,96,76,34,'#1b4a87',3,OL,1.6)+text(60,118,'RS-485',13,'#ffffff',900)
b+=circ(36,148,4.5,LED_OFF,OL,1.4)+text(46,152,'TX',10,'#e6eefa',900,'start')+circ(76,148,4.5,LED_OFF,OL,1.4)+text(86,152,'RX',10,'#e6eefa',900,'start')
b+=tag(60,172,'ECO',AMB,show='param.eco',fg='#2b1a00',size=10)
b+=tag(60,190,'A ⇄ B',ON,show='param.abInvertidos',size=10)
b+=tag(60,208,'sin 120 Ω',AMB,show='param.sinTerminacion',fg='#2b1a00',size=10)
b+=rect(22,226,76,40,'#fbfbfc',3,OL,1.6)+text(60,240,'puerto',9,MUT,800)
b+=dtext(60,258,'param.com','COM20',14)
b+=rect(34,322,52,18,'#b9c0c8',2,OL,2)+rect(42,327,36,7,'#6f7882',1,'none',0)
svg('usb-rs485',120,340,b)

# ---------------- controlador de temperatura 48 × 48 (200 x 300)
b=rect(1.5,1.5,197,297,'#2b2f35',3,OL,3)+hood(1.5,1.5,197,52,'#41474f')+hood(1.5,248,197,50.5,'#41474f')
for t,x in [('L',20),('N',40),('A',80),('B',100),('11',140),('14',160)]: b+=T(t,x,20,8.5)+text(x,46,t,10,WT,900)
for t,x in [('R1',40),('R2',60),('R3',80),('21',140),('24',160)]: b+=T(t,x,280,8.5,side='b')+text(x,262,t,10,WT,900)
b+=brand(1.5,56,197,'TC 48 × 48')
b+=rect(14,84,172,158,'#15181c',4,OL,2.4)
b+=rect(24,92,152,52,'#060708',2,'none',0)+text(32,106,'PV',10,'#ff8a80',900,'start')
b+=mono(168,134,'25.0',32,'#ff3b30','end','out.pvTxt',800)
b+=rect(24,150,152,40,'#060708',2,'none',0)+text(32,163,'SV',10,'#9be37e',900,'start')
b+=mono(168,184,'40.0',26,LCDT,'end','out.svTxt',800)
b+=led(36,204,'out.salida','#ff3b30',4.5)+text(46,208,'OUT',10,WT,900,'start')
b+=led(106,204,'out.alarma',AMB,4.5)+text(116,208,'AL1',10,WT,900,'start')
for i,s_ in enumerate(['SET','◄','▼','▲']): b+=rect(26+i*38,216,32,20,'#4a5058',3,OL,1.6)+text(42+i*38,230,s_,10,'#f1f3f5',900)
svg('temp-controller',200,300,b)
print('tablero ok')
