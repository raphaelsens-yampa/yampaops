import { useEffect, useState } from "react";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Layout } from "@/components/Layout";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);
ChartJS.defaults.color = "#7A95A8";
ChartJS.defaults.font.size = 10;
ChartJS.defaults.borderColor = "#19293a";

const C = { bg:"#0B1824", card:"#132336", line:"#23415c", blue:"#0A84FF", green:"#22D3A0", red:"#FF4E6A", amber:"#FFB020", mute:"#7A95A8", sec:"#B0C4D0", white:"#E8F0F5", purple:"#B36BFF" };

const D: any = {"mrr_daily_lbl": ["05/17", "05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "mrr_daily": [318532, 317442, 317345, 316732, 318571, 318289, 318289, 317850, 317977, 319610, 321593, 322546, 323001, 321919, 320906, 322953, 324271, 324227, 324545, 325718, 325845, 324823, 326000, 326404, 326348, 327252, 327512, 325590, 324894, 325155, 326023], "mb": [30875, 31265, 31590, 31655, 31915, 31915, 31915, 32110, 32045, 32045, 31980, 32435, 32305, 32305, 32305, 32500, 33020, 32825, 33020, 33020, 32760, 33085, 33150, 33085, 33605, 33800, 33605, 33475, 33735, 33930], "my": [286567, 286080, 285142, 286916, 286374, 286374, 285935, 285867, 287565, 289548, 290566, 290566, 289614, 288601, 290648, 291771, 291207, 291720, 292698, 292825, 292063, 292915, 293254, 293263, 293647, 293712, 291985, 291419, 291420, 292093], "my_lbl": ["05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "ativos": [2222, 2227, 2227, 2235, 2237, 2237, 2234, 2237, 2240, 2248, 2250, 2254, 2245, 2240, 2246, 2255, 2264, 2262, 2269, 2270, 2263, 2270, 2272, 2272, 2283, 2287, 2274, 2268, 2272, 2279], "ativos_lbl": ["05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "ativos4b": [475, 481, 486, 487, 491, 491, 491, 494, 493, 493, 492, 499, 497, 497, 497, 500, 508, 505, 508, 508, 504, 509, 510, 509, 517, 520, 517, 515, 519, 522], "trials": [629, 656, 683, 726, 760, 798, 830, 888, 942, 991, 1029, 1079, 1116, 1123, 1136, 1166, 1151, 1162, 1158, 1151, 1151, 1157, 1145, 1118, 1102, 1087, 1059, 1039, 1062, 1082], "trials_lbl": ["05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "novos": [81, 87, 86, 91, 94, 94, 88, 90, 95, 94, 97, 100, 95, 95, 95, 104, 112, 111, 113, 113, 105, 111, 114, 111, 119, 123, 119, 117, 122, 130], "novos_lbl": ["05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "churn_abs": [142, 142, 143, 143, 138, 141, 139, 140, 129, 123, 115, 114, 119, 123, 128, 119, 115, 119, 123, 125, 125, 125, 123, 120, 121, 120, 121, 127, 129, 128, 125], "churn_lbl": ["05/17", "05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "conv": [21, 22, 21, 23, 25, 25, 25, 25, 28, 28, 30, 29, 29, 29, 30, 32, 33, 33, 32, 34, 29, 31, 32, 31, 33, 34, 33, 34, 35, 36], "conv_lbl": ["05/18", "05/19", "05/20", "05/21", "05/22", "05/23", "05/24", "05/25", "05/26", "05/27", "05/28", "05/29", "05/30", "05/31", "06/01", "06/02", "06/03", "06/04", "06/05", "06/06", "06/07", "06/08", "06/09", "06/10", "06/11", "06/12", "06/13", "06/14", "06/15", "06/16"], "meses": ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"], "mrr_m": [332202, 331630, 329858, 322534, 320906, 326023], "mrr_meta": [373520, 379123, 394810, 400732, 417743, 424009], "at_m": [2303, 2284, 2261, 2253, 2240, 2279], "at_meta": [2583, 2622, 2730, 2771, 2889, 2932], "saldo": [-4466, -573, -1771, -7324, -1628, 5117], "ating": [58.08, 77.7, 78.11, 75.07, 86.68, 87.16], "ft": [180, 196, 300, 240, 1143, 448], "ltvcac": [6.94, 1.12, 4.71, 10.29, 1.43, 4.12], "cpft": [14.66, 26.8, 26.97, 27.37, 12.24, 12.44], "donut": [818, 141, 206, 1758]};

const LINE_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}},y:{beginAtZero:false}} };
const LEG_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,labels:{boxWidth:10}}}, scales:{y:{beginAtZero:false}} };
const BAR_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} };
const BAR_PCT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,max:100}} };
const ds = (label: string, data: number[], color: string, extra: any = {}) => ({ label, data, borderColor: color, tension:.3, pointRadius:0, borderWidth:2, ...extra });
const vc = (cls?: string) => cls==="up"?C.green: cls==="down"?C.red: cls==="amber"?C.amber: C.sec;

function Card({ children, className="" }: any) {
  return <div className={"rounded-[10px] min-w-0 "+className} style={{background:C.card,padding:"10px 12px"}}>{children}</div>;
}
function Mini({ children }: any) {
  return <h4 className="text-[11px] uppercase tracking-wide mb-2" style={{color:C.mute}}>{children}</h4>;
}
function Kpi({ k }: any) {
  const [lbl,big,sub,vr,cls]=k;
  return <Card><div className="text-[10px] uppercase tracking-wide mb-1.5" style={{color:C.mute}}>{lbl}</div>
    <div className="text-[30px] font-extrabold leading-none">{big}</div>
    {sub && <div className="text-[11px] mt-1.5" style={{color:C.mute}}>{sub}</div>}
    {vr && <div className="text-[12px] font-bold mt-1" style={{color:vc(cls)}}>{vr}</div>}</Card>;
}
function ChartBox({ title, children, h="h-[180px]" }: any) {
  return <Card><Mini>{title}</Mini><div className={"relative "+h}>{children}</div></Card>;
}
function Bars({ title, rows }: any) {
  return <Card><Mini>{title}</Mini>{rows.map((r:any,i:number)=>(
    <div key={i}><div className="flex justify-between text-[12px] mt-[7px] mb-[3px]"><span>{r[0]}</span><b>{r[1].toFixed(1).replace(".",",")}%</b></div>
    <div className="h-2 rounded-[5px] overflow-hidden" style={{background:"#0d1a26"}}><div className="h-full rounded-[5px]" style={{width:Math.min(r[1],100)+"%",background:r[2]}}/></div></div>))}</Card>;
}
function List({ items }: any) {
  return <ul>{items.map((it:any,i:number)=>(<li key={i} className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}><span dangerouslySetInnerHTML={{__html:it[0]}}/><b style={it[2]?{color:it[2]}:undefined} dangerouslySetInnerHTML={{__html:it[1]}}/></li>))}</ul>;
}
function Tag({ children, t }: any) {
  const map: any = { doing:["#1a3a5c","#5fb0ff"], back:["#2a2f3a","#9aa7b8"], go:["#143a30",C.green] };
  const [bg,fg]=map[t]||map.back;
  return <span className="text-[10px] font-bold px-[7px] py-[2px] rounded" style={{background:bg,color:fg}}>{children}</span>;
}
const G = { g4:"grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4", g3:"grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", g2:"grid gap-3 grid-cols-1 lg:grid-cols-2", g6:"grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" };

function Page({ id, ttl, meta, children }: any) {
  return <section id={id} className="scroll-mt-14 mb-3">
    <div className="flex justify-between items-baseline flex-wrap gap-2 pb-1.5 mb-2">
      <h2 className="text-[18px] font-extrabold tracking-tight uppercase" style={{color:C.white}}>{ttl}</h2>
      <div className="text-[11px]" style={{color:C.mute}}>{meta}</div>
    </div>
    {children}
  </section>;
}

const MESES = D.meses;
const NAV = [["p1","One Page",C.blue],["p2","Financeiro",C.blue],["p3","Plano de Metas",C.green],["p4","Revenue",C.green],["p5","Marketing",C.amber],["p6","Produto",C.purple]];

export default function OnePageDiretoria() {
  const [active,setActive]=useState("p1");
  useEffect(()=>{
    const obs=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting)setActive((e.target as HTMLElement).id);});},{rootMargin:"-45% 0px -50% 0px"});
    NAV.forEach(([id])=>{const el=document.getElementById(id as string);if(el)obs.observe(el);});
    return ()=>obs.disconnect();
  },[]);
  const go=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"});

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-full" style={{color:C.white,background:C.bg,fontFamily:"-apple-system,Segoe UI,Roboto,Calibri,sans-serif"}}>
        <div
          className="sticky top-0 z-30 flex gap-0.5 overflow-x-auto px-2 lg:px-3 py-1.5 backdrop-blur"
          style={{background:C.bg}}
        >
          {NAV.map(([id,label,col])=>{
            const isActive = active===id;
            return (
              <button
                key={id as string}
                onClick={()=>go(id as string)}
                className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors"
                style={{color:isActive?"#fff":C.sec,background:isActive?"#16283b":"transparent",border:"1px solid transparent"}}
              >
                <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{background:col as string}}/>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <main className="flex-1 px-2 lg:px-3 py-2 overflow-auto">

            <Page id="p1" ttl="One Page · Gestão Executiva" meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g4}>{[
                ["MRR Atual","R$326,0k","jun 16, 2026","▲ +2,35% vs mai","up"],
                ["Saldo MRR","R$7,5k","Net MRR D-1","▲ +211,88% vs mai","up"],
                ["Ativos Pagantes","2.279","jun 16, 2026","▲ +2,24% vs mai","up"],
                ["Churn Atual","5,5%","jun/26","▼ -13,37% vs mai","up"],
                ["Invest. Total Mkt","R$4,3k","Junho (parcial)","→ mês vigente","flat"],
                ["LTV/CAC Geral","4,12x","todos os canais","▼ abaixo meta 6x","down"],
                ["Ating. Metas","87,16%","jun 16, 2026","↑ +0,48% vs mai","up"],
                ["NPS Atual","59,00%","jun 2026","↓ -17,59% vs jun/25","down"],
              ].map((k,i)=><Kpi key={i} k={k}/>)}</div>

              <div className={G.g3+" mt-2"}>
                <Bars title="Estrutura de Resultado — Jun/26" rows={[["Margem de Contribuição",92.1,C.green],["Despesas Fixas",74.0,C.red],["% Investimentos",9.1,C.amber],["% Lucro Operacional",9.0,C.green]]}/>
                <Card><Mini>Movimentação Base — Mai (mês fechado)</Mini>
                  <div className="flex justify-around text-center gap-2.5">
                    <div><div className="text-[26px] font-extrabold" style={{color:C.red}}>-33</div><div className="text-[10px] uppercase" style={{color:C.mute}}>Net</div></div>
                    <div><div className="text-[26px] font-extrabold" style={{color:C.green}}>+95</div><div className="text-[10px] uppercase" style={{color:C.mute}}>Novos</div></div>
                    <div><div className="text-[26px] font-extrabold" style={{color:C.red}}>-128</div><div className="text-[10px] uppercase" style={{color:C.mute}}>Churns</div></div>
                  </div>
                  <List items={[["Conv. Freetrial (jun/26)","3,35%"],["Pré-Churn (em risco)","146"],["ARPA Atual","R$143,06"],["MRR FT Convertidos","R$2,8k"]]}/>
                  <div className="text-[11px] mt-2" style={{color:C.mute}}>690 churns YTD · ~75% involuntários · ~25% voluntários</div></Card>
                <Card><Mini>Campanhas — Geral (Junho)</Mini><List items={[["Free Trials Total","348"],["CP-FT (custo/trial)","R$12,44"],["Trials Convertidos (D+15)","5"],["Conversão Final","1,44%"],["CAC geral","R$866"],["LTV/CAC","4,12x",C.amber]]}/></Card>
              </div>

              <div className={G.g4+" mt-2"}>
                <ChartBox title="MRR Diário — D-30"><Line data={{labels:D.mrr_daily_lbl,datasets:[ds("MRR",D.mrr_daily,C.blue,{fill:true,backgroundColor:"rgba(10,132,255,.12)",tension:.35})]}} options={LINE_OPT}/></ChartBox>
                <ChartBox title="Quadrimestre · MRR mensal × Meta"><Line data={{labels:MESES,datasets:[ds("MRR",D.mrr_m,C.blue,{pointRadius:2}),ds("Meta",D.mrr_meta,C.red,{borderDash:[5,4]})]}} options={LEG_OPT}/></ChartBox>
                <ChartBox title="Free Trials por mês"><Bar data={{labels:MESES,datasets:[{label:"Trials",data:D.ft,backgroundColor:C.amber}]}} options={BAR_OPT}/></ChartBox>
                <ChartBox title="Evolução Ativos Pagantes (D-30)"><Line data={{labels:D.ativos_lbl,datasets:[ds("Ativos",D.ativos,C.purple)]}} options={LINE_OPT}/></ChartBox>
              </div>

              <div className={G.g3+" mt-2"}>
                <ChartBox title="Saúde da Base — 60,1% em risco de churn" h="h-[210px]"><Doughnut data={{labels:["Alto","Engajado","Baixo","Desengajado"],datasets:[{data:D.donut,backgroundColor:[C.green,"#1C7293",C.amber,C.red],borderColor:"#132336",borderWidth:2}]}} options={{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"right",labels:{boxWidth:10,font:{size:11}}}}}}/></ChartBox>
                <ChartBox title="Atingimento Metas 2026 (Jan→Jun)"><Bar data={{labels:MESES,datasets:[{label:"Atingimento %",data:D.ating,backgroundColor:[C.red,C.amber,C.amber,C.amber,C.green,C.green]}]}} options={BAR_PCT}/></ChartBox>
                <Card><Mini>Roadmap Q2 & Riscos</Mini>
                  <ul>
                    <li className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}>Ajuste de Bugs Gerais<Tag t="doing">DOING</Tag></li>
                    <li className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}>Conciliação / OFX / Metas<Tag t="doing">DOING</Tag></li>
                    <li className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}>Onboarding + Tooltips<Tag t="back">BACKLOG</Tag></li>
                    <li className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}>Tombamento Base 2.0<Tag t="back">BACKLOG</Tag></li>
                    <li className="flex justify-between py-1.5 text-[12.5px]" style={{borderBottom:"1px solid #19293a"}}>YamPay – Gateway Fase 1<Tag t="go">06/06 ▶</Tag></li>
                  </ul>
                  <div className="text-[11px] leading-relaxed mt-2" style={{color:C.mute}}><b style={{color:C.red}}>Riscos:</b> Volume de bugs alto · Instabilidade sandbox fornecedor · Conciliação bancária (41 retrocessos)</div></Card>
              </div>

              <div className={G.g3+" mt-2"}>
                <Card><Mini>Saúde da Base & Unit Economics</Mini><List items={[["LTV médio (ARPA / churn total)","R$2.214"],["ARPA do Churn (ticket perdido)","R$147,15"],["Payback","7,52 meses"],["Lifetime (churn total / voluntário)","~15,6m / ~62m"],["Origem Fechamentos 4Blue","56%"]]}/></Card>
                <Card><Mini>Produto</Mini><List items={[["Adoção YampaFin","~26%"],["Retorno ao legado (&lt;1 dia)","74,5%"],["Must Have (uso crítico)","66,3%"],["Impacto em empregos","9.116"],["Dados da Jornada","em breve",C.sec]]}/></Card>
                <Card><Mini>Quadrimestre 2025×2026 + Projeção</Mini><List items={[["Retração Receita","-4,38%",C.red],["Desempenho vs LY","-88%",C.red],["Peso Despesas Fixas","74,0%"],["Projeção jun/26","R$326–330k",C.amber]]}/></Card>
              </div>
              <div className="mt-2.5 rounded-lg text-[12px] font-semibold" style={{background:"#2a1f10",border:"1px solid #5c4a1a",color:C.amber,padding:"9px 12px"}}>⚑ Cancelar Meta Ads se LTV/CAC &lt; 6 até Jun/26</div>
            </Page>

            <Page id="p2" ttl="Financeiro · Visão Detalhada" meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g6}>{[
                ["MRR Atual","R$326,0k","jun 16","▲ +2,35% vs mai","up"],
                ["Saldo MRR","R$7,5k","Net D-1","▲ +211,88%","up"],
                ["Receita Geral","R$323,1k","Jun/26","→ estável","flat"],
                ["Lucro Operac.","9,0%","recup.","▲ recuperação","up"],
                ["ARPA Atual","R$143,06","jun 16","→ estável","flat"],
                ["Churn MRR","R$17,7k","receita perd.","▼ -17,15% vs mai","up"],
              ].map((k,i)=><Kpi key={i} k={k}/>)}</div>
              <div className={G.g2+" mt-2"}>
                <ChartBox title="MRR Diário D-30 · 4Blue × Yampa" h="h-[210px]"><Line data={{labels:D.my_lbl,datasets:[ds("Yampa",D.my,C.green),ds("4Blue",D.mb,C.blue)]}} options={LEG_OPT}/></ChartBox>
                <ChartBox title="Saldo MRR mensal 2026" h="h-[210px]"><Bar data={{labels:MESES,datasets:[{label:"Saldo",data:D.saldo,backgroundColor:D.saldo.map((v:number)=>v>=0?C.green:C.red)}]}} options={BAR_OPT}/></ChartBox>
              </div>
              <div className={G.g3+" mt-2"}>
                <Bars title="Estrutura de Resultado — Jun/26" rows={[["Margem de Contribuição",92.1,C.green],["Despesas Fixas",74.0,C.red],["% Investimentos",9.1,C.amber],["% Lucro Operacional",9.0,C.green]]}/>
                <Card><Mini>Estrutura de Custos & Decisões</Mini><List items={[["Regime tributário","Lucro Real"],["Alíquota IR mínima","~8–9%"],["Econ. IA design","-R$20k/mês",C.green],["Econ. CTO→Tech Lead","-R$5k/mês",C.green],["Projeção jun/26","R$326–330k",C.amber],["Meta MRR Dez/26","R$512k"]]}/></Card>
                <Card><Mini>Quadrimestre</Mini><List items={[["Retração Receita","-4,38%",C.red],["Desempenho vs LY","-88%",C.red],["Peso Despesas Fixas","74,0%"]]}/><div className="text-[11px] mt-2" style={{color:C.mute}}>Share Inadimplência: ~20% historicamente estável (dez/23 – jun/26)</div></Card>
              </div>
            </Page>

            <Page id="p3" ttl="Plano de Metas · Cresc. 40% a.a." meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g6}>{[
                ["MRR Atual vs Meta","R$326,0k","Meta R$371,2k","87,8% atingido","amber"],
                ["Net MRR (Cresc.)","R$7,5k","Meta R$5,5k","136,6% atingido","up"],
                ["New MRR","R$9,6k","Meta R$16,6k","57,9% atingido","down"],
                ["Recuperado MRR","R$4,5k","Meta R$8,0k","56,1% atingido","down"],
                ["Churn MRR","-R$10,3k","Meta -R$20,1k","51,2% (bom)","up"],
                ["Upsell MRR","R$0,6k","Meta R$2,0k","30,3% atingido","down"],
              ].map((k,i)=><Kpi key={i} k={k}/>)}</div>
              <Card className="mt-3.5"><Mini>Metas vs Realizado · Mês vigente (Jun/26)</Mini>
                <table className="w-full text-[12.5px]" style={{borderCollapse:"collapse"}}>
                  <thead><tr style={{color:C.mute}}>
                    <th className="text-left text-[10px] uppercase tracking-wide py-2 px-1.5" style={{borderBottom:"1px solid "+C.line}}>Métrica</th>
                    <th className="text-right text-[10px] uppercase tracking-wide py-2 px-1.5" style={{borderBottom:"1px solid "+C.line}}>Meta</th>
                    <th className="text-right text-[10px] uppercase tracking-wide py-2 px-1.5" style={{borderBottom:"1px solid "+C.line}}>Realizado</th>
                    <th className="text-right text-[10px] uppercase tracking-wide py-2 px-1.5" style={{borderBottom:"1px solid "+C.line}}>Atingimento</th>
                  </tr></thead>
                  <tbody>{[
                    ["MRR Meta Q1-26","R$408,8k","R$326,0k","79,7%","amber",0],
                    ["MRR Revisada Q2-26","R$371,2k","R$326,0k","87,8%","amber",0],
                    ["Meta Crescimento (Net MRR)","R$5,5k","R$7,5k","136,6%","up",0],
                    ["METAS SALES","R$26,6k","R$14,7k","55,3%","down",1],
                    ["New MRR","R$16,6k","R$9,6k","57,9%","down",0],
                    ["Upsell MRR","R$2,0k","R$0,6k","30,3%","down",0],
                    ["Recuperado MRR","R$8,0k","R$4,5k","56,1%","down",0],
                    ["Campanhas Mkt/Sales","R$0","R$0","—","flat",0],
                    ["METAS CS","-R$21,1k","-R$10,5k","49,7%","up",1],
                    ["Churn MRR","-R$20,1k","-R$10,3k","51,2%","up",0],
                    ["Downsell MRR","-R$1,0k","-R$0,2k","18,6%","up",0],
                  ].map((r:any,i:number)=>(
                    <tr key={i} style={r[5]?{background:"#16283b",color:C.blue,fontWeight:700}:undefined}>
                      <td className="py-2 px-1.5" style={{borderBottom:"1px solid #19293a"}}>{r[0]}</td>
                      <td className="py-2 px-1.5 text-right" style={{borderBottom:"1px solid #19293a"}}>{r[1]}</td>
                      <td className="py-2 px-1.5 text-right font-bold" style={{borderBottom:"1px solid #19293a"}}>{r[2]}</td>
                      <td className="py-2 px-1.5 text-right font-bold" style={{borderBottom:"1px solid #19293a",color:r[5]?undefined:vc(r[4])}}>{r[3]}</td>
                    </tr>))}</tbody>
                </table>
                <div className="text-[11px] mt-2" style={{color:C.mute}}>Realizado via Metabase (MRR Atual, Saldo MRR, mrr_classificacao, churn_mrr_inicio_mes). Metas: planilha Plano de Metas 2026 (40% a.a.). Jun é mês parcial (D-1=16/06).</div>
              </Card>
            </Page>

            <Page id="p4" ttl="Revenue · Visão Detalhada" meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g6}>{[
                ["Ativos Pagantes","2.279","jun 16","▲ +2,24% vs mai","up"],
                ["MRR Atual","R$326,0k","jun 16","▲ +2,35%","up"],
                ["Saldo MRR","R$7,5k","Net D-1","▲ +211,88%","up"],
                ["Churn Atual","5,5%","jun/26","▼ -13,37%","up"],
                ["ARPA Atual","R$143,06","jun 16","→ estável","flat"],
                ["Pré-Churn (risco)","146","em risco","▼ -9,32% vs mai","up"],
              ].map((k,i)=><Kpi key={i} k={k}/>)}</div>
              <div className={G.g2+" mt-2"}>
                <ChartBox title="Ativos Pagantes — Evolução D-30 (Total × 4Blue)" h="h-[210px]"><Line data={{labels:D.ativos_lbl,datasets:[ds("Total",D.ativos,C.green),ds("4Blue",D.ativos4b,C.blue)]}} options={LEG_OPT}/></ChartBox>
                <ChartBox title="Distribuição por tier de engajamento (D-30)" h="h-[210px]"><Doughnut data={{labels:["Alto","Engajado","Baixo","Desengajado"],datasets:[{data:D.donut,backgroundColor:[C.green,"#1C7293",C.amber,C.red],borderColor:"#132336",borderWidth:2}]}} options={{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"right",labels:{boxWidth:10,font:{size:11}}}}}}/></ChartBox>
              </div>
              <div className={G.g3+" mt-2"}>
                <ChartBox title="Trials acumulados — D-30"><Line data={{labels:D.trials_lbl,datasets:[ds("Trials",D.trials,C.green,{fill:true,backgroundColor:"rgba(34,211,160,.12)",tension:.35})]}} options={LINE_OPT}/></ChartBox>
                <ChartBox title="Novos pagantes / dia — D-30"><Line data={{labels:D.novos_lbl,datasets:[ds("Novos",D.novos,C.red)]}} options={LINE_OPT}/></ChartBox>
                <ChartBox title="Churn diário — D-30"><Line data={{labels:D.churn_lbl,datasets:[ds("Churn",D.churn_abs,C.amber)]}} options={LINE_OPT}/></ChartBox>
              </div>
              <div className={G.g3+" mt-2"}>
                <ChartBox title="Status Conversões — D-30"><Line data={{labels:D.conv_lbl,datasets:[ds("Conversões",D.conv,C.blue,{fill:true,backgroundColor:"rgba(10,132,255,.12)",tension:.35})]}} options={LINE_OPT}/></ChartBox>
                <Card><Mini>LTV/CAC — Visão dupla & Unit economics</Mini><List items={[["LTV/CAC Real (Produto —)","4,12x"],["Lifetime (churn total)","~15,6 meses"],["Lifetime (churn voluntário)","~62 meses"],["ARPA do Churn","R$147,15"],["LTV médio","R$2.214"],["Payback","7,52 meses"]]}/></Card>
                <Card><Mini>Atingimento de Metas — Junho</Mini><List items={[["Atingimento Geral","87,2%",C.amber],["Ativos Pagantes (meta 2.932)","77,7%",C.amber],["Novos Pagantes (meta 126)","65,1%",C.red],["Churn (meta 145)","190,8%",C.green],["Engajamento: risco churn","60,1%"],["Inativo 1.758 · Alto 818",""]]}/></Card>
              </div>
            </Page>

            <Page id="p5" ttl="Marketing · Visão Detalhada" meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g3}>{[
                ["Geral — Todos os Canais",C.blue,["R$4,3k","348","187","156","5","1,44%","R$12,44","R$866","4,12x"]],
                ["YampaFin c/ Branding",C.amber,["R$1,9k","139","84","50","5","3,60%","R$13,45","R$374","10,66x"]],
                ["Sem Branding (YampaFin puro)",C.purple,["R$2,5k","209","103","106","0","0,00%","R$11,77","R$0","0,00x"]],
              ].map((m:any,i:number)=>{const L=["Invest.","Trials","Andamento","Concluídos","Convertidos","Conv. %","CP-FT","CAC","LTV/CAC"];return (
                <Card key={i}><h4 className="text-[11px] uppercase tracking-wide mb-2 font-bold" style={{color:m[1]}}>{m[0]}</h4>
                  <div className="grid grid-cols-3 gap-1.5">{m[2].map((v:string,j:number)=>(<div key={j}><div className="text-[9px] uppercase" style={{color:C.mute}}>{L[j]}</div><b className="text-[13px]" style={j===8?{color:C.amber}:undefined}>{v}</b></div>))}</div></Card>);})}</div>
              <div className={G.g2+" mt-2"}>
                <Card><Mini>Top Campanhas — Junho/2026</Mini>
                  <table className="w-full text-[12px]" style={{borderCollapse:"collapse"}}><thead><tr style={{color:C.mute}}>{["Campanha","Obj.","Invest.","Trials","Conv.","CAC","LTV/CAC"].map((h,i)=>(<th key={i} className={(i>1?"text-right ":"text-left ")+"text-[9px] uppercase py-1.5 px-1"} style={{borderBottom:"1px solid "+C.line}}>{h}</th>))}</tr></thead>
                  <tbody>{[
                    ["GA - Branding Rede Pesquisa","freetrial","R$1.870","139","5","R$374","10,66"],
                    ["MB - Campanha yampaFin Geral","freetrial","R$313","70","0","R$0","0"],
                    ["GA - KW/PLANILHAS","freetrial","R$754","48","0","R$0","0"],
                    ["GA - yampaFin Meio de Funil PLANILHA","freetrial","R$453","46","0","R$0","0"],
                    ["GA - yampaFin Meio de Funil","freetrial","R$750","38","0","R$0","0"],
                    ["MB - yampaFin MEI","freetrial","R$187","7","0","R$0","0"],
                    ["TOTAL GERAL","—","R$4.328","348","5","R$866","4,12x"],
                  ].map((r:any,i:number)=>{const tot=i===6;return (<tr key={i} style={tot?{background:"#16283b",color:C.blue,fontWeight:700}:undefined}>{r.map((c:string,j:number)=>(<td key={j} className={(j>1?"text-right ":"")+"py-1.5 px-1"} style={{borderBottom:"1px solid #19293a",color:(j===6&&!tot&&c!=="0")?C.amber:undefined}}>{c}</td>))}</tr>);})}</tbody></table></Card>
                <ChartBox title="Free Trials por mês + Investimento"><Bar data={{labels:MESES,datasets:[{label:"Trials",data:D.ft,backgroundColor:C.amber}]}} options={BAR_OPT}/></ChartBox>
              </div>
              <div className={G.g2+" mt-2"}>
                <ChartBox title="LTV/CAC por mês — Geral"><Line data={{labels:MESES,datasets:[ds("LTV/CAC",D.ltvcac,C.amber,{pointRadius:3,tension:.35})]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}/></ChartBox>
                <ChartBox title="CP-FT por mês"><Bar data={{labels:MESES,datasets:[{label:"CP-FT",data:D.cpft,backgroundColor:C.blue}]}} options={BAR_OPT}/></ChartBox>
              </div>
              <div className={G.g4+" mt-2"}>{[
                ["Iniciativa 1","YampaFin Google Ads","ATIVO","go"],
                ["Iniciativa 2","Facebook Ads (retomada)","PLANEJA.","back"],
                ["Iniciativa 3","Curso c/ onboarding","08/05 ▶","doing"],
                ["Iniciativa 4","Live Aniversário Yampa","13/07","doing"],
              ].map((it:any,i:number)=>(<Card key={i}><Mini>{it[0]}</Mini><div className="text-[13px] font-semibold">{it[1]}</div><div className="mt-1.5"><Tag t={it[3]}>{it[2]}</Tag></div></Card>))}</div>
              <div className="mt-2.5 rounded-lg text-[12px] font-semibold" style={{background:"#2a1f10",border:"1px solid #5c4a1a",color:C.amber,padding:"9px 12px"}}>⚑ LTV/CAC meta = 6x · Cancelar Meta Ads recorrente se não atingido até Jun/26</div>
              <div className="text-[11px] mt-2" style={{color:C.mute}}>Marketing filtrado exclusivamente ao mês vigente (Junho/2026) no Looker. Junho é mês parcial (D-1=16/06).</div>
            </Page>

            <Page id="p6" ttl="Produto · Visão Detalhada" meta="Jan–Jun 2026 · Dados até 16/06/2026">
              <div className={G.g6}>{[
                ["Ating. Geral Metas","87,16%","jun 16","↑ +0,48% vs mai","up"],
                ["Ativos Pagantes","2.279","jun 16","▲ +2,24%","up"],
                ["Meta Ativos Junho","2.932","ating. 77,7%","▼ -653 abaixo","down"],
                ["NPS Atual","59,00%","jun 2026","↓ -17,59% vs jun/25","down"],
                ["Adoção YampaFin","~26%","empresas ativas","→ pós-lançamento","flat"],
                ["Must Have","66,3%","uso crítico","↑ positivo","up"],
              ].map((k,i)=><Kpi key={i} k={k}/>)}</div>
              <div className={G.g3+" mt-2"}>
                <ChartBox title="Atingimento Metas anual 2026"><Bar data={{labels:MESES,datasets:[{label:"Atingimento %",data:D.ating,backgroundColor:C.purple}]}} options={BAR_PCT}/></ChartBox>
                <ChartBox title="Ativos Pagantes — mensal × Meta"><Line data={{labels:MESES,datasets:[ds("Resultado",D.at_m,C.blue,{pointRadius:2}),ds("Meta",D.at_meta,"#9aa7b8",{borderDash:[5,4]})]}} options={LEG_OPT}/></ChartBox>
                <ChartBox title="MRR Resultado × Meta"><Line data={{labels:MESES,datasets:[ds("Resultado",D.mrr_m,C.green,{pointRadius:2}),ds("Meta",D.mrr_meta,"#9aa7b8",{borderDash:[5,4]})]}} options={LEG_OPT}/></ChartBox>
              </div>
              <div className={G.g3+" mt-2"}>
                <Card><Mini>Bloqueadores de Adoção</Mini><List items={[["Conciliação bancária — 41 retrocederam",""],["Funcionalidades removidas (estorno parcial)",""],["UX sobrecarregada — scroll/colunas",""],["Instabilidade sandbox do fornecedor",""]]}/></Card>
                <Card><Mini>Positivos</Mini><List items={[["Time dedicado ao YampaFin","",C.green],["Dados de produto disponíveis","",C.green],["Velocidade de entrega melhorando","",C.green]]}/><div className="text-[11px] mt-2" style={{color:C.mute}}>74,5% dos que migraram retornam ao legado em &lt; 1 dia</div></Card>
                <Card><Mini>Metas Anuais 2026 (otimistas) & Impacto</Mini><List items={[["MRR Meta Dez","R$512k"],["Ativos Meta Dez","3.540"],["Novos Pag. Dez","165/mês"],["Churn Dez","175/mês"],["Trials Meta Dez","1.467"],["Impacto em empregos","9.116"]]}/></Card>
              </div>
              <div className={G.g3+" mt-2"}>
                <Card><Mini>NPS — detalhe</Mini><div className="text-[34px] font-extrabold" style={{color:C.green}}>59,00%</div><div className="text-[11px] mt-1.5" style={{color:C.mute}}>↓ -17,59% vs jun/2025 · ↓ -5,48% vs mês anterior</div></Card>
                <Card><Mini>Must Have (produto crítico p/ usuário)</Mini><List items={[["Must Have (todos os valores)","66,3%"],["Classificação","13,53%",C.amber],["Outras visões (indif. / muito frust.)","21,33% / 98,84%"]]}/></Card>
                <Card><Mini>Adoção & Jornada</Mini><List items={[["Adoção YampaFin","~26%"],["Retorno ao legado (&lt;1 dia)","74,5%"],["Base full","9%"]]}/><div className="text-[11px] mt-1.5" style={{color:C.mute}}>Dados da Jornada — em breve (onboarding, ativação, retenção)</div></Card>
              </div>
            </Page>

            <footer className="text-center text-[10px] pt-3 mt-2" style={{color:C.mute}}>
              Uso restrito — Sócios Yampa / 4blue · Dados até 16/06/2026 · Fonte: Metabase + Looker + Planilha de Metas
            </footer>
        </main>
      </div>
    </Layout>
  );
}
