import { initStore, store, MODO } from "./store.js";
import { CHECKLIST } from "./checklist-template.js";
import { APP_INFO, SEGMENTOS_PADRAO, CONSTRUTORA_POR_PACOTE, CONSTRUTORAS, PACOTES_UNIFICADOS } from "./config.js";

// ---------------------------------------------------------------------
//  Constantes e utilidades
// ---------------------------------------------------------------------
const ELAB = ["Pendente", "Em andamento", "Concluído"];
const ANAL = ["Aguardando Conclusão", "Aprovado", "Reprovado", "Não se Aplica"];
const RESP = ["Construtora", "Projetista"];
const OK_ANAL = new Set(["Aprovado", "Não se Aplica"]);
const key = id => "i" + id.replaceAll(".", "_");
const unkey = k => k.slice(1).replaceAll("_", ".");
const ITEMS = CHECKLIST.flatMap(s => s.itens.map(it => ({ ...it, sec: s.id, key: key(it.id) })));
const ALL_KEYS = ITEMS.map(i => i.key);
const SEC_KEYS = Object.fromEntries(CHECKLIST.map(s => [s.id, s.itens.map(i => key(i.id))]));
const ITEM_BY_KEY = Object.fromEntries(ITEMS.map(i => [i.key, i]));

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = v => Math.max(0, Math.min(100, (v || 0) * 100));
const fmt = v => pct(v).toFixed(1).replace(".", ",") + "%";
const fmtDT = iso => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtD = d => d ? d.split("-").reverse().join("/") : "—";
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const uniq = a => [...new Set(a.filter(Boolean))];
const hexA = (h, a) => { const n = h.replace("#", ""); return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`; };
const constDe = p => S.construtoras[p] || "—";
const constSeg = s => constDe(s.pacotes[0]);
const corEmp = e => CONSTRUTORAS[e]?.cor || "#718096";
const corPac = p => corEmp(constDe(p));
const txtEmp = e => { const h = corEmp(e).replace("#", ""); const l = (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255; return l > 0.7 ? "#8a6d00" : corEmp(e); };
const empChip = e => { const lg = CONSTRUTORAS[e]?.logo; return `<span class="company-chip" style="background:${hexA(corEmp(e), .16)};border-left-color:${corEmp(e)}">${lg ? `<img src="${lg}" alt="">` : ""}<b style="color:${txtEmp(e)}">${esc(e)}</b></span>`; };
const pacChip = p => `<span class="pac-chip">${esc(p)}</span>`;
const normSegs = l => (l || []).map(s => ({ ...s, pacotes: uniq((s.pacotes || []).map(p => PACOTES_UNIFICADOS[p] || p)) }));
const normConst = c => { const o = { ...CONSTRUTORA_POR_PACOTE, ...(c || {}) }; Object.keys(PACOTES_UNIFICADOS).forEach(k => delete o[k]); return o; };
const stClass = v => v >= 0.999 ? "status-good" : v >= 0.5 ? "status-mid" : "status-low";
const selClass = v => ({ "Aprovado": "s-Aprovado", "Reprovado": "s-Reprovado", "Não se Aplica": "s-NA", "Aguardando Conclusão": "s-Aguardando", "Concluído": "s-Concluido", "Em andamento": "s-Andamento", "Pendente": "s-Pendente" }[v] || "");
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), ms); }

// Cálculos (mesma lógica da planilha)
// Elaboração = (Concluído + 0,5 × Em andamento) / nº itens
// Análise    = (Aprovado + Não se Aplica) / nº itens
function calc(a, keys = ALL_KEYS) {
  let e = 0, an = 0; const counts = { "Aprovado": 0, "Não se Aplica": 0, "Reprovado": 0, "Aguardando Conclusão": 0 };
  keys.forEach(k => {
    const it = a?.itens?.[k] || {};
    const el = it.elab || "Pendente", st = it.anal || "Aguardando Conclusão";
    if (el === "Concluído") e += 1; else if (el === "Em andamento") e += 0.5;
    if (OK_ANAL.has(st)) an++;
    counts[st] = (counts[st] || 0) + 1;
  });
  const n = keys.length || 1;
  return { elab: e / n, anal: an / n, counts };
}
function statusDoc(a) {
  const c = calc(a);
  if (c.anal >= 0.999) return "Aprovado";
  if (c.counts["Reprovado"] > 0) return "Com pendências";
  return "Em análise";
}
function novosItens() {
  const o = {};
  ITEMS.forEach(i => o[i.key] = { resp: i.resp || "Construtora", elab: "Pendente", anal: "Aguardando Conclusão", obs: "" });
  return o;
}

// ---------------------------------------------------------------------
//  Estado
// ---------------------------------------------------------------------
const S = { user: null, segmentos: [], construtoras: normConst(), analises: [], unsub: [], ck: null, focusKey: null, ckFiltro: "todos", pend: 0, charts: {} };

function porSegmento(cod) {
  return S.analises.filter(a => a.segmento === cod).sort((x, y) => (x.criadoEm || "").localeCompare(y.criadoEm || ""));
}
function vigente(cod) { const l = porSegmento(cod); return l[l.length - 1] || null; }
function pacotesTodos() { return uniq(S.segmentos.flatMap(s => s.pacotes)); }

// Envolve escritas para mostrar "Salvando…"
async function W(fn) {
  S.pend++; syncBadge();
  try { return await fn(); }
  catch (e) { console.error(e); alert("Não foi possível salvar: " + e.message); }
  finally { S.pend--; syncBadge(); }
}
function syncBadge() {
  const b = $("syncBadge");
  if (!navigator.onLine) { b.className = "sync off"; b.textContent = "Offline — alterações serão enviadas ao reconectar"; return; }
  if (S.pend > 0) { b.className = "sync saving"; b.textContent = "Salvando…"; return; }
  b.className = "sync"; b.textContent = MODO === "firebase" ? "Sincronizado com a equipe" : "Modo local (somente este navegador)";
}
addEventListener("online", syncBadge); addEventListener("offline", syncBadge);

// ---------------------------------------------------------------------
//  Inicialização / login
// ---------------------------------------------------------------------
Chart.register(ChartDataLabels);
Chart.defaults.font.family = '"Segoe UI",Arial,sans-serif';

(async function boot() {
  try { await initStore(); }
  catch (e) { document.body.innerHTML = `<div class="empty">Erro ao conectar ao Firebase: ${esc(e.message)}<br>Verifique o arquivo js/config.js.</div>`; return; }
  $("topTitle").textContent = APP_INFO.titulo; $("topSub").textContent = APP_INFO.subtitulo;
  if (MODO === "local") {
    $("modeBanner").style.display = "block";
    $("modeBanner").innerHTML = "<b>Modo local de teste:</b> os dados ficam apenas neste navegador. Configure o Firebase em <code>js/config.js</code> para compartilhar com a equipe (veja o README).";
    $("lblSenha").style.display = "none"; $("resetBtn").style.display = "none";
    $("loginHint").textContent = "Modo local de teste — informe qualquer e-mail para entrar.";
  }
  store.onAuth(u => {
    S.user = u;
    if (!u) { stopAll(); $("appView").style.display = "none"; $("loginView").style.display = "grid"; return; }
    $("loginView").style.display = "none"; $("appView").style.display = "flex";
    $("userName").textContent = u.nome; $("userEmail").textContent = u.email;
    if (!u.temNome) pedirNome();
    startData();
  });
})();

$("loginForm").onsubmit = async e => {
  e.preventDefault(); $("loginMsg").textContent = "";
  try { await store.login($("loginEmail").value.trim(), $("loginSenha").value); }
  catch (err) { $("loginMsg").textContent = /invalid|wrong|not-found|credential/i.test(err.code || err.message) ? "E-mail ou senha incorretos." : err.message; }
};
$("resetBtn").onclick = async () => {
  const email = $("loginEmail").value.trim();
  if (!email) { $("loginMsg").textContent = "Informe o e-mail acima."; return; }
  try { await store.resetSenha(email); $("loginMsg").style.color = "var(--green)"; $("loginMsg").textContent = "Enviamos um link de redefinição para o e-mail."; }
  catch (err) { $("loginMsg").textContent = err.message; }
};
$("logoutBtn").onclick = () => store.logout();
$("renameBtn").onclick = () => pedirNome(true);
$("menuBtn").onclick = () => {
  if (innerWidth <= 800) $("sidebar").classList.toggle("open");
  else { $("sidebar").classList.toggle("collapsed"); $("main").classList.toggle("expanded"); }
};

function pedirNome(forcar) {
  modal(`<h3>Como você quer ser identificado?</h3>
    <p class="muted" style="font-size:13px;margin-top:0">Seu nome aparece no histórico de alterações das análises.</p>
    <div class="row">Nome<input type="text" id="mNome" value="${esc(forcar ? S.user.nome : "")}" placeholder="Ex.: Bruno Pereira"></div>
    <div class="actions"><button class="btn btn-primary" id="mOk">Salvar</button></div>`);
  $("mNome").focus();
  $("mOk").onclick = async () => {
    const n = $("mNome").value.trim(); if (!n) return;
    await store.setNome(n); S.user = store.user(); $("userName").textContent = S.user.nome; closeModal();
  };
}

function stopAll() { S.unsub.forEach(f => f && f()); S.unsub = []; stopChecklist(); }
function startData() {
  stopAll(); syncBadge();
  S.unsub.push(store.watchSegmentos((l, c) => { S.segmentos = normSegs(l); S.construtoras = normConst(c); setupFilters(); route(true); }));
  S.unsub.push(store.watchAnalises(l => { S.analises = l; route(true); }));
  route();
}

// ---------------------------------------------------------------------
//  Rotas
// ---------------------------------------------------------------------
addEventListener("hashchange", () => route());
function route(dataUpdate) {
  if (!S.user) return;
  const h = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [r, arg] = h.split("/");
  const views = ["dashboard", "segmentos", "checklist", "config"];
  const v = views.includes(r) ? r : "dashboard";
  views.forEach(x => $("view-" + x).style.display = x === v ? "block" : "none");
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === (v === "checklist" ? "segmentos" : v)));
  $("filtersSection").style.display = v === "dashboard" ? "" : "none";
  if (innerWidth <= 800 && !dataUpdate) $("sidebar").classList.remove("open");
  if (v !== "checklist") stopChecklist();
  if (v === "dashboard") renderDashboard();
  if (v === "segmentos") renderSegmentos();
  if (v === "config" && !dataUpdate) renderConfig();
  if (v === "checklist") openChecklist(decodeURIComponent(arg || ""));
  if (!dataUpdate) scrollTo(0, 0);
}

// ---------------------------------------------------------------------
//  DASHBOARD
// ---------------------------------------------------------------------
function setupFilters() {
  const fe = $("fConstrutora"), fd = $("fDisciplina"), ce = fe.value;
  fe.innerHTML = '<option value="all">Todas</option>' + uniq(pacotesTodos().map(constDe)).map(e => `<option>${esc(e)}</option>`).join("");
  if ([...fe.options].some(o => o.value === ce)) fe.value = ce;
  fillPacFilter();
  if (!fd.options.length) fd.innerHTML = '<option value="all">Todas (status geral)</option>' + CHECKLIST.map(s => `<option value="${s.id}">${s.id}. ${esc(s.titulo)}</option>`).join("");
  fillSegFilter();
}
function fillPacFilter() {
  const fp = $("fPacote"), e = $("fConstrutora").value, cur = fp.value;
  fp.innerHTML = '<option value="all">Todos</option>' + pacotesTodos().filter(p => e === "all" || constDe(p) === e).map(p => `<option value="${esc(p)}">${esc(p)} — ${esc(constDe(p))}</option>`).join("");
  fp.value = [...fp.options].some(o => o.value === cur) ? cur : "all";
}
function fillSegFilter() {
  const fs = $("fSegmento"), p = $("fPacote").value, e = $("fConstrutora").value, cur = fs.value;
  const l = S.segmentos.filter(s => p === "all" || s.pacotes.includes(p)).filter(s => e === "all" || constSeg(s) === e);
  fs.innerHTML = '<option value="all">Todos</option>' + l.map(s => `<option>${esc(s.codigo)}</option>`).join("");
  fs.value = [...fs.options].some(o => o.value === cur) ? cur : "all";
}
$("fConstrutora").onchange = () => { fillPacFilter(); fillSegFilter(); renderDashboard(); };
$("fPacote").onchange = () => { fillSegFilter(); renderDashboard(); };
["fSegmento", "fDisciplina", "fIndicador", "fFaixa"].forEach(id => $(id).onchange = renderDashboard);
$("clearFilters").onclick = () => { ["fConstrutora", "fDisciplina", "fFaixa"].forEach(id => $(id).value = "all"); $("fIndicador").value = "anal"; fillPacFilter(); fillSegFilter(); renderDashboard(); };

function dashData() {
  const e = $("fConstrutora").value, p = $("fPacote").value, sg = $("fSegmento").value, d = $("fDisciplina").value, ind = $("fIndicador").value, fx = $("fFaixa").value;
  const keys = d === "all" ? ALL_KEYS : SEC_KEYS[d];
  let segs = S.segmentos.filter(s => e === "all" || constSeg(s) === e).filter(s => p === "all" || s.pacotes.includes(p)).filter(s => sg === "all" || s.codigo === sg)
    .map(s => { const a = vigente(s.codigo); return { ...s, a, v: a ? calc(a, keys)[ind] : 0 }; });
  if (fx !== "all") {
    const m = +fx;
    segs = segs.filter(s => m === 0 ? s.v === 0 : m === 100 ? s.v >= 0.999 : s.v * 100 >= m && s.v * 100 < (m === 1 ? 50 : 100) && s.v > 0);
  }
  const secs = d === "all" ? CHECKLIST : CHECKLIST.filter(s => s.id === d);
  return { segs, keys, ind, secs, p };
}

function renderDashboard() {
  if ($("view-dashboard").style.display === "none") return;
  const { segs, keys, ind, secs, p } = dashData();
  const media = avg(segs.map(s => s.v));
  $("kpiLabel").textContent = ind === "anal" ? "STATUS MÉDIO DA ANÁLISE" : "AVANÇO MÉDIO DA ELABORAÇÃO";
  $("kpiAvanco").textContent = fmt(media);
  $("kpiPend").textContent = fmt(segs.length ? 1 - media : 0);
  const comA = segs.filter(s => s.a);
  $("kpiSeg").textContent = `${comA.length}/${segs.length}`;
  let rep = 0; const dist = { "Aprovado": 0, "Não se Aplica": 0, "Reprovado": 0, "Aguardando Conclusão": 0 };
  segs.forEach(s => { if (!s.a) { dist["Aguardando Conclusão"] += keys.length; return; } const c = calc(s.a, keys).counts; rep += c["Reprovado"]; Object.keys(dist).forEach(k => dist[k] += c[k] || 0); });
  $("kpiRep").textContent = rep;
  const last = S.analises.map(a => a.atualizadoEm).filter(Boolean).sort().pop();
  const lastA = S.analises.find(a => a.atualizadoEm === last);
  $("dashLast").textContent = last ? `${fmtDT(last)} — ${lastA?.atualizadoPor || ""}` : "Nenhuma análise registrada";

  const colorOf = s => corEmp(constSeg(s));
  const lbl = { anchor: "end", align: "end", offset: 2, clamp: true, color: "#243447", font: c => ({ weight: "700", size: c.chart.data.labels.length > 14 ? 9 : 11 }),
    rotation: c => c.chart.options.indexAxis === "x" && c.chart.data.labels.length > 14 ? -90 : 0,
    formatter: v => v > 0 ? v.toFixed(1).replace(".", ",") + "%" : "" };
  const barOpts = (horiz) => ({
    responsive: true, maintainAspectRatio: false, indexAxis: horiz ? "y" : "x",
    layout: { padding: horiz ? { right: 48 } : { top: 44 } },
    plugins: { legend: { display: false }, datalabels: lbl, tooltip: { callbacks: { label: c => c.parsed[horiz ? "x" : "y"].toFixed(1).replace(".", ",") + "%" } } },
    scales: { [horiz ? "x" : "y"]: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" } }, [horiz ? "y" : "x"]: { grid: { display: false } } }
  });
  const draw = (id, cfg) => { S.charts[id]?.destroy(); S.charts[id] = new Chart($(id), cfg); };

  draw("segmentChart", { type: "bar", data: { labels: segs.map(s => s.codigo), datasets: [{ data: segs.map(s => +(s.v * 100).toFixed(2)), backgroundColor: segs.map(colorOf), borderRadius: 7 }] },
    options: { ...barOpts(false), onClick: (e, el) => { if (el[0]) abrirSegmento(segs[el[0].index].codigo); } } });
  $("segmentLegend").innerHTML = uniq(segs.map(constSeg))
    .map(x => `<span class="legend-item"><span class="legend-dot" style="background:${corEmp(x)}"></span>${esc(x)}</span>`).join("");

  const discVals = CHECKLIST.filter(s => secs.includes(s)).map(sec => avg(segs.map(s => s.a ? calc(s.a, SEC_KEYS[sec.id])[ind] : 0)));
  draw("disciplineChart", { type: "bar", data: { labels: secs.map(s => s.titulo), datasets: [{ data: discVals.map(v => +(v * 100).toFixed(2)), backgroundColor: "#2f78b9", borderRadius: 6 }] }, options: barOpts(true) });

  const pacs = uniq(segs.flatMap(s => p !== "all" ? [p] : s.pacotes));
  const pacVals = pacs.map(pc => avg(segs.filter(s => s.pacotes.includes(pc)).map(s => s.v)));
  draw("pacoteChart", { type: "bar", data: { labels: pacs.map(pc => [pc, constDe(pc)]), datasets: [{ data: pacVals.map(v => +(v * 100).toFixed(2)), backgroundColor: pacs.map(corPac), borderRadius: 7 }] }, options: barOpts(false) });

  const dl = Object.keys(dist), dc = ["#20a464", "#94a3b8", "#dc5a5a", "#f5a021"];
  const tot = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  draw("itensChart", { type: "doughnut", data: { labels: dl, datasets: [{ data: dl.map(k => dist[k]), backgroundColor: dc, borderWidth: 2, borderColor: "#fff" }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { weight: "600" } } },
      datalabels: { color: "#fff", font: { weight: "700", size: 11 }, formatter: v => v / tot >= 0.04 ? v : "" } } } });

  // Matriz
  $("matrixCount").textContent = `${secs.length} disciplinas × ${segs.length} segmentos`;
  let h = "<thead><tr><th>#</th><th>Disciplina</th>" + segs.map(s => `<th class="num"><a href="#" data-seg="${esc(s.codigo)}">${esc(s.codigo)}</a><br>${empChip(constSeg(s))}<br>${s.pacotes.map(pacChip).join("")}<br><small style="font-weight:500;text-transform:none">${s.a ? "Rev. " + esc(s.a.revisao || "—") : "sem análise"}</small></th>`).join("") + '<th class="num">Média</th></tr></thead><tbody>';
  const row = (id, nome, ks, bold) => {
    const vals = segs.map(s => s.a ? calc(s.a, ks)[ind] : null);
    const m = avg(vals.map(v => v || 0));
    return `<tr${bold ? ' style="background:#f8fafc"' : ""}><td>${id}</td><td><b>${esc(nome)}</b></td>` + vals.map(v => v === null ? '<td class="num muted">—</td>' :
      `<td class="num"><span class="pct">${fmt(v)}</span><div class="progress ${ind === "elab" ? "elab" : ""}"><span style="width:${pct(v)}%"></span></div></td>`).join("") +
      `<td class="num"><span class="status-pill ${stClass(m)}">${fmt(m)}</span></td></tr>`;
  };
  secs.forEach(sec => h += row(sec.id, sec.titulo, SEC_KEYS[sec.id]));
  if (secs.length > 1) h += row("", "STATUS GERAL", ALL_KEYS, true);
  $("matrixTable").innerHTML = h + "</tbody>";
  $("matrixTable").querySelectorAll("[data-seg]").forEach(a => a.onclick = e => { e.preventDefault(); abrirSegmento(a.dataset.seg); });
}
$("exportDashBtn").onclick = () => {
  const { segs, ind, secs } = dashData();
  const rows = [["ID", "DISCIPLINA", ...segs.map(s => s.codigo)], ["", "PACOTE", ...segs.map(s => s.pacotes.join(" / "))], ["", "CONSTRUTORA", ...segs.map(constSeg)], ["", "REVISÃO", ...segs.map(s => s.a?.revisao || "—")]];
  secs.forEach(sec => rows.push([+sec.id, sec.titulo, ...segs.map(s => s.a ? +calc(s.a, SEC_KEYS[sec.id])[ind].toFixed(4) : 0)]));
  rows.push(["", "Status", ...segs.map(s => s.a ? +calc(s.a)[ind].toFixed(4) : 0)]);
  rows.push(["", "Pendente", ...segs.map(s => s.a ? +(1 - calc(s.a)[ind]).toFixed(4) : 1)]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 4; r < rows.length; r++) for (let c = 2; c < rows[0].length; c++) { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref]) ws[ref].z = "0.0%"; }
  ws["!cols"] = [{ wch: 5 }, { wch: 30 }, ...segs.map(() => ({ wch: 10 }))];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "PAINEL");
  XLSX.writeFile(wb, `PAINEL AS BUILT - GEOMETRIA - ${today()}.xlsx`);
};

// ---------------------------------------------------------------------
//  SEGMENTOS
// ---------------------------------------------------------------------
$("segSearch").oninput = () => renderSegmentos();
function renderSegmentos() {
  if ($("view-segmentos").style.display === "none") return;
  const q = $("segSearch").value.trim().toLowerCase();
  const match = s => { if (!q) return true; const a = vigente(s.codigo); return [s.codigo, ...s.pacotes, constSeg(s), a?.documento, a?.empresa, a?.analista].some(x => String(x || "").toLowerCase().includes(q)); };
  const pacs = pacotesTodos();
  let html = "";
  pacs.forEach(p => {
    const segs = S.segmentos.filter(s => s.pacotes[0] === p || (s.pacotes.includes(p) && !pacs.includes(s.pacotes[0]))).filter(match);
    const extra = S.segmentos.filter(s => s.pacotes.includes(p) && s.pacotes[0] !== p).filter(match);
    if (!segs.length && !extra.length) return;
    html += `<div class="pac-group"><div class="pac-title"><span class="bar" style="background:${corPac(p)}"></span>${esc(p)} ${empChip(constDe(p))}<span class="muted" style="font-weight:500;font-size:12px">${extra.length ? "· também inclui " + extra.map(s => esc(s.codigo)).join(", ") : ""}</span></div><div class="seg-cards">`;
    segs.forEach(s => {
      const a = vigente(s.codigo), n = porSegmento(s.codigo).length;
      const c = a ? calc(a) : { elab: 0, anal: 0, counts: {} };
      const pill = !a ? '<span class="status-pill st-none">Sem análise</span>' : `<span class="status-pill ${stClass(c.anal)}">${statusDoc(a)}</span>`;
      html += `<div class="seg-card" data-seg="${esc(s.codigo)}" style="border-top-color:${corPac(p)}">
        <div class="top"><div class="code">${esc(s.codigo)}</div>${pill}</div>
        <div class="meta">${a ? `${esc(a.documento || "Documento não informado")} · Rev. ${esc(a.revisao || "—")}${n > 1 ? ` (${n} revisões)` : ""}<br>Atualizado ${fmtDT(a.atualizadoEm)} por ${esc(a.atualizadoPor || "—")}` : "Clique para iniciar a análise"}</div>
        <div class="bars">
          <div><span>Análise</span><div class="progress"><span style="width:${pct(c.anal)}%"></span></div><b>${fmt(c.anal).replace(",0%", "%")}</b></div>
          <div><span>Elaboração</span><div class="progress elab"><span style="width:${pct(c.elab)}%"></span></div><b>${fmt(c.elab).replace(",0%", "%")}</b></div>
        </div>${c.counts["Reprovado"] ? `<div style="margin-top:8px;font-size:11px;color:var(--red);font-weight:700">${c.counts["Reprovado"]} item(ns) reprovado(s)</div>` : ""}
      </div>`;
    });
    html += "</div></div>";
  });
  // análises de segmentos removidos da configuração
  const orf = uniq(S.analises.map(a => a.segmento)).filter(c => !S.segmentos.some(s => s.codigo === c));
  if (orf.length) html += `<div class="pac-group"><div class="pac-title">Segmentos fora da configuração</div><div class="seg-cards">${orf.map(c => `<div class="seg-card" data-seg="${esc(c)}"><div class="code">${esc(c)}</div><div class="meta">Análises existentes para segmento que não está mais na lista.</div></div>`).join("")}</div></div>`;
  $("segGrid").innerHTML = html || '<div class="empty">Nenhum segmento encontrado.</div>';
  $("segGrid").querySelectorAll(".seg-card").forEach(c => c.onclick = () => abrirSegmento(c.dataset.seg));
}

function abrirSegmento(cod) {
  const a = vigente(cod);
  if (a) location.hash = "#/checklist/" + encodeURIComponent(a.id);
  else novaAnalise(cod);
}

function novaAnalise(cod, base) {
  const ant = base || null;
  modal(`<h3>${ant ? "Nova revisão" : "Nova análise"} — Segmento ${esc(cod)}</h3>
    <div class="row">Documento (nº)<input type="text" id="mDoc" value="${esc(ant?.documento || "")}" placeholder="Nº do documento As Built"></div>
    <div class="btn-row">
      <div class="row">Revisão<input type="text" id="mRev" value="${esc(ant ? proxRev(ant.revisao) : "0")}"></div>
      <div class="row">Data da análise<input type="date" id="mData" value="${today()}"></div>
    </div>
    <div class="row">Empresa<input type="text" id="mEmp" value="${esc(ant?.empresa || constSeg(S.segmentos.find(s => s.codigo === cod) || { pacotes: [] }))}" placeholder="Construtora"></div>
    ${ant ? `<label class="row" style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="mCopy" checked> Copiar status, responsáveis e observações da Rev. ${esc(ant.revisao)}</label>
    <label class="row" style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="mReabrir" checked> Reabrir itens reprovados (voltam para "Aguardando Conclusão")</label>` : ""}
    <div class="actions"><button class="btn btn-light" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mOk">Criar e abrir checklist</button></div>`);
  $("mCancel").onclick = closeModal;
  $("mOk").onclick = () => W(async () => {
    let itens = novosItens();
    if (ant && $("mCopy").checked) {
      itens = JSON.parse(JSON.stringify(ant.itens));
      Object.values(itens).forEach(it => { delete it.por; delete it.em; if ($("mReabrir").checked && it.anal === "Reprovado") it.anal = "Aguardando Conclusão"; });
    }
    const id = await store.createAnalise({
      segmento: cod, disciplina: APP_INFO.disciplina, documento: $("mDoc").value.trim(), revisao: $("mRev").value.trim() || "0",
      dataAnalise: $("mData").value, empresa: $("mEmp").value.trim(), analista: S.user.nome, itens, revAnterior: ant?.id || null
    });
    closeModal(); location.hash = "#/checklist/" + encodeURIComponent(id); toast("Análise criada");
  });
}
function proxRev(r) { const n = parseInt(r, 10); if (!isNaN(n) && String(n) === String(r).trim()) return String(n + 1); if (/^[A-Y]$/i.test(r)) return String.fromCharCode(r.toUpperCase().charCodeAt(0) + 1); return ""; }

// ---------------------------------------------------------------------
//  CHECKLIST
// ---------------------------------------------------------------------
function stopChecklist() { if (S.ck) { S.ck.unsub.forEach(f => f()); S.ck = null; } }

function openChecklist(id) {
  if (S.ck?.id === id) { renderRevTabs(); return; }
  stopChecklist();
  S.ck = { id, a: null, imgs: [], unsub: [], built: false };
  $("checklistRoot").innerHTML = '<div class="empty">Carregando análise…</div>';
  S.ck.unsub.push(store.watchAnalise(id, a => {
    if (!S.ck || S.ck.id !== id) return;
    if (!a) { $("checklistRoot").innerHTML = '<div class="empty">Análise não encontrada (pode ter sido excluída). <a href="#/segmentos">Voltar aos segmentos</a></div>'; S.ck.built = false; return; }
    S.ck.a = a;
    if (!S.ck.built) buildChecklist(a);
    updateChecklist(a);
  }));
  S.ck.unsub.push(store.watchImagens(id, imgs => { if (!S.ck) return; S.ck.imgs = imgs; renderImgs(); }));
}

function buildChecklist(a) {
  S.ck.built = true;
  const sel = (opts, cls, k, campo) => `<select class="${cls}" data-k="${k}" data-c="${campo}">${opts.map(o => `<option>${o}</option>`).join("")}</select>`;
  let h = `
  <div class="hero" style="margin-bottom:12px">
    <div><div class="rev-tabs" id="revTabs"></div>
      <h1 style="margin-top:8px">Segmento ${esc(a.segmento)} <span id="ckPacs"></span></h1>
      <p>Checklist de análise — As Built ${esc(a.disciplina || APP_INFO.disciplina)}</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-light" id="ckHist">Histórico</button>
      <button class="btn btn-light" id="ckXlsx">Exportar XLSX</button>
      <button class="btn btn-orange" id="ckNovaRev">+ Nova revisão</button>
      <button class="btn btn-danger" id="ckDel">Excluir</button>
    </div>
  </div>
  <div class="panel" style="margin-bottom:12px">
    <div class="ck-head">
      <label>Disciplina<div class="ro">${esc(a.disciplina || APP_INFO.disciplina)}</div></label>
      <label>Documento<input type="text" data-h="documento"></label>
      <label>Revisão<input type="text" data-h="revisao"></label>
      <label>Data da última análise<input type="date" data-h="dataAnalise"></label>
      <label>Empresa<input type="text" data-h="empresa"></label>
      <label>Analista<input type="text" data-h="analista"></label>
      <label>Segmento<div class="ro">${esc(a.segmento)}</div></label>
      <label>Status do documento<div class="ro" id="ckStatus"></div></label>
    </div>
    <div class="ck-progress">
      <div><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>ELABORAÇÃO</span><span class="big" id="ckElab"></span></div><div class="progress elab"><span id="ckElabBar"></span></div></div>
      <div><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>ANÁLISE</span><span class="big" id="ckAnal"></span></div><div class="progress"><span id="ckAnalBar"></span></div></div>
      <div class="muted" style="font-size:11px;line-height:1.5" id="ckMeta"></div>
    </div>
  </div>
  <div class="ck-tools">
    <div class="seg" id="ckFiltro">
      <button data-f="todos">Todos</button><button data-f="pend">Aguardando</button><button data-f="rep">Reprovados</button><button data-f="obs">Com observação</button>
    </div>
    <button class="btn btn-light btn-sm" id="ckExp">Expandir tudo</button>
    <button class="btn btn-light btn-sm" id="ckCol">Recolher tudo</button>
    <span class="muted" style="font-size:11px;margin-left:auto">Dica: clique em um item e use <b>Ctrl+V</b> para colar um print.</span>
  </div>`;
  CHECKLIST.forEach(sec => {
    h += `<div class="panel sec" data-sec="${sec.id}">
      <div class="sec-head"><span class="chev">▾</span><span class="num">${sec.id}</span><span class="t">${esc(sec.titulo)}</span>
        <select class="btn-sm sec-bulk" data-sec="${sec.id}" style="width:auto;font-size:11px" onclick="event.stopPropagation()">
          <option value="">Aplicar à seção…</option>
          <option value="anal|Aprovado">Análise: Aprovado</option><option value="anal|Não se Aplica">Análise: Não se Aplica</option>
          <option value="anal|Aguardando Conclusão">Análise: Aguardando Conclusão</option>
          <option value="elab|Concluído">Elaboração: Concluído</option><option value="elab|Em andamento">Elaboração: Em andamento</option>
        </select>
        <span class="p"><span class="progress"><span data-secbar="${sec.id}"></span></span><span data-secpct="${sec.id}"></span></span></div>
      <div class="sec-body">${sec.nota ? `<div class="sec-note">ℹ ${esc(sec.nota)}</div>` : ""}
      <div class="item-h"><span>Item</span><span>Descrição</span><span>Responsável</span><span>Status elaboração</span><span>Status análise</span><span>Observações / imagens</span></div>`;
    let sub = null;
    sec.itens.forEach(it => {
      if (it.sub && it.sub !== sub) { sub = it.sub; h += `<div class="sub-title">${esc(it.id.split(".").slice(0, 2).join("."))} — ${esc(sub)}</div>`; }
      const k = key(it.id);
      h += `<div class="item" data-item="${k}">
        <div class="id">${esc(it.id)}</div>
        <div class="desc">${esc(it.desc)}<div class="who" data-who="${k}"></div></div>
        <div class="c-resp">${sel(RESP, "", k, "resp")}</div>
        <div>${sel(ELAB, "", k, "elab")}</div>
        <div>${sel(ANAL, "", k, "anal")}</div>
        <div class="c-obs"><textarea rows="2" data-k="${k}" data-c="obs" placeholder="Observações…"></textarea>
          <div class="imgs" data-imgs="${k}"></div></div>
      </div>`;
    });
    h += "</div></div>";
  });
  $("checklistRoot").innerHTML = h;
  const root = $("checklistRoot");

  // Cabeçalho
  root.querySelectorAll("[data-h]").forEach(inp => inp.onchange = () => {
    const campo = inp.dataset.h, val = inp.value.trim(), ant = S.ck.a[campo] || "";
    if (val === ant) return;
    W(() => store.updateHeader(S.ck.id, { [campo]: val }, `Cabeçalho: ${campo} "${ant}" → "${val}"`));
  });
  // Itens
  root.querySelectorAll(".item select").forEach(s => s.onchange = () => {
    const k = s.dataset.k, c = s.dataset.c, ant = S.ck.a.itens?.[k]?.[c] || "";
    s.className = selClass(s.value);
    const nome = { resp: "Responsável", elab: "Status Elaboração", anal: "Status Análise" }[c];
    W(() => store.updateItem(S.ck.id, k, c, s.value, `Item ${unkey(k)}: ${nome} "${ant}" → "${s.value}"`));
  });
  root.querySelectorAll(".item textarea").forEach(t => {
    const salvar = () => {
      clearTimeout(t._d);
      const k = t.dataset.k, ant = S.ck.a.itens?.[k]?.obs || "";
      if (t.value === ant) return;
      W(() => store.updateItem(S.ck.id, k, "obs", t.value, `Item ${unkey(k)}: observação alterada`));
    };
    t.oninput = () => { clearTimeout(t._d); t._d = setTimeout(salvar, 1500); autoGrow(t); };
    t.onchange = salvar; t.onblur = salvar;
  });
  root.querySelectorAll(".item").forEach(row => {
    row.addEventListener("focusin", () => setFocus(row.dataset.item));
    row.addEventListener("click", () => setFocus(row.dataset.item));
    row.addEventListener("dragover", e => { e.preventDefault(); row.classList.add("focus"); });
    row.addEventListener("drop", e => { e.preventDefault(); [...e.dataTransfer.files].filter(f => f.type.startsWith("image/")).forEach(f => addImg(row.dataset.item, f)); });
  });
  root.querySelectorAll(".sec-head").forEach(hd => hd.onclick = e => { if (e.target.tagName !== "SELECT") hd.parentElement.classList.toggle("closed"); });
  root.querySelectorAll(".sec-bulk").forEach(s => s.onchange = () => {
    if (!s.value) return;
    const [campo, val] = s.value.split("|"), sec = s.dataset.sec;
    const tit = CHECKLIST.find(x => x.id === sec).titulo;
    if (confirm(`Aplicar "${val}" em todos os itens da seção ${sec} – ${tit}?`)) {
      const patches = {}; SEC_KEYS[sec].forEach(k => patches[k] = { [campo]: val });
      W(() => store.updateItens(S.ck.id, patches, `Seção ${sec}: ${campo === "anal" ? "Status Análise" : "Status Elaboração"} → "${val}" (em lote)`));
    }
    s.value = "";
  });
  $("ckFiltro").querySelectorAll("button").forEach(b => b.onclick = () => { S.ckFiltro = b.dataset.f; applyFiltro(); });
  $("ckExp").onclick = () => root.querySelectorAll(".sec").forEach(s => s.classList.remove("closed"));
  $("ckCol").onclick = () => root.querySelectorAll(".sec").forEach(s => s.classList.add("closed"));
  $("ckHist").onclick = showHistorico;
  $("ckXlsx").onclick = () => exportAnaliseXlsx([S.ck.a]);
  $("ckNovaRev").onclick = () => novaAnalise(S.ck.a.segmento, S.ck.a);
  $("ckDel").onclick = excluirAnalise;
  renderRevTabs();
}
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 240) + "px"; }
function setFocus(k) {
  if (S.focusKey === k) return;
  document.querySelectorAll(".item.focus").forEach(r => r.classList.remove("focus"));
  S.focusKey = k; document.querySelector(`.item[data-item="${k}"]`)?.classList.add("focus");
}

function updateChecklist(a) {
  const root = $("checklistRoot"), act = document.activeElement;
  root.querySelectorAll("[data-h]").forEach(inp => { if (inp !== act) inp.value = a[inp.dataset.h] || ""; });
  root.querySelectorAll(".item select, .item textarea").forEach(el => {
    const it = a.itens?.[el.dataset.k] || {};
    const v = it[el.dataset.c] ?? (el.dataset.c === "obs" ? "" : el.options[0].value);
    if (el !== act && el.value !== v) { el.value = v; if (el.tagName === "TEXTAREA") autoGrow(el); }
    if (el.tagName === "SELECT") el.className = selClass(el.value);
  });
  root.querySelectorAll("[data-who]").forEach(w => { const it = a.itens?.[w.dataset.who]; w.textContent = it?.por ? `Alterado por ${it.por} em ${fmtDT(it.em)}` : ""; });
  const c = calc(a);
  $("ckElab").textContent = fmt(c.elab); $("ckElabBar").style.width = pct(c.elab) + "%";
  $("ckAnal").textContent = fmt(c.anal); $("ckAnalBar").style.width = pct(c.anal) + "%";
  const st = statusDoc(a);
  $("ckStatus").innerHTML = `<span class="status-pill ${st === "Aprovado" ? "status-good" : st === "Em análise" ? "status-mid" : "status-low"}">${st}</span>`;
  $("ckMeta").innerHTML = `Criada por ${esc(a.criadoPor || "—")} em ${fmtDT(a.criadoEm)}<br>Última alteração: ${esc(a.atualizadoPor || "—")} em ${fmtDT(a.atualizadoEm)}<br>
    ${c.counts["Aprovado"]} aprovados · ${c.counts["Não se Aplica"]} N/A · <b style="color:var(--red)">${c.counts["Reprovado"]} reprovados</b> · ${c.counts["Aguardando Conclusão"]} aguardando`;
  CHECKLIST.forEach(sec => { const v = calc(a, SEC_KEYS[sec.id]).anal; root.querySelector(`[data-secbar="${sec.id}"]`).style.width = pct(v) + "%"; root.querySelector(`[data-secpct="${sec.id}"]`).textContent = Math.round(pct(v)) + "%"; });
  const seg = S.segmentos.find(s => s.codigo === a.segmento);
  $("ckPacs").innerHTML = seg ? seg.pacotes.map(pacChip).join(" ") + " " + empChip(constSeg(seg)) : "";
  applyFiltro(); renderRevTabs();
}

function applyFiltro() {
  if (!S.ck?.a) return;
  const f = S.ckFiltro, a = S.ck.a;
  $("ckFiltro").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.f === f));
  document.querySelectorAll("#checklistRoot .item").forEach(row => {
    const it = a.itens?.[row.dataset.item] || {};
    const show = f === "todos" || (f === "pend" && (it.anal || "Aguardando Conclusão") === "Aguardando Conclusão") || (f === "rep" && it.anal === "Reprovado") || (f === "obs" && (it.obs || "").trim());
    row.style.display = show ? "" : "none";
  });
  document.querySelectorAll("#checklistRoot .sec").forEach(sec => {
    const vis = [...sec.querySelectorAll(".item")].some(r => r.style.display !== "none");
    sec.style.display = vis || f === "todos" ? "" : "none";
    sec.querySelectorAll(".sub-title,.item-h").forEach(x => x.style.display = f === "todos" ? "" : "none");
  });
}

function renderRevTabs() {
  if (!S.ck?.a || !$("revTabs")) return;
  const l = porSegmento(S.ck.a.segmento);
  $("revTabs").innerHTML = `<a class="btn btn-light btn-sm" href="#/segmentos">← Segmentos</a>` + l.map((r, i) =>
    `<a class="btn btn-sm ${r.id === S.ck.id ? "btn-primary" : "btn-light"}" href="#/checklist/${encodeURIComponent(r.id)}">Rev. ${esc(r.revisao || "—")}${i === l.length - 1 ? " (vigente)" : ""}</a>`).join("");
}

// Imagens
function renderImgs() {
  if (!S.ck?.built) return;
  const by = {}; S.ck.imgs.sort((a, b) => (a.em || "").localeCompare(b.em || "")).forEach(i => (by[i.item] ||= []).push(i));
  document.querySelectorAll("#checklistRoot [data-imgs]").forEach(box => {
    const k = box.dataset.imgs;
    box.innerHTML = (by[k] || []).map(i => `<div class="thumb" data-img="${i.id}" title="${esc(i.autor || "")} — ${fmtDT(i.em)}"><img src="${i.dataUrl}" alt=""><button class="x" data-del="${i.id}" title="Remover">✕</button></div>`).join("")
      + `<button class="add-img" data-add="${k}" title="Adicionar imagem (ou Ctrl+V)">＋<br>imagem</button>`;
  });
  document.querySelectorAll("#checklistRoot .thumb").forEach(t => t.onclick = e => {
    const img = S.ck.imgs.find(i => i.id === t.dataset.img);
    if (e.target.dataset.del) { e.stopPropagation(); if (confirm("Remover esta imagem?")) W(() => store.deleteImagem(S.ck.id, img.id, img.item)); return; }
    $("lightboxImg").src = img.dataUrl; $("lightboxCap").textContent = `Item ${unkey(img.item)} · ${img.autor || ""} · ${fmtDT(img.em)}`; $("lightbox").style.display = "grid";
  });
  document.querySelectorAll("#checklistRoot [data-add]").forEach(b => b.onclick = e => {
    e.stopPropagation(); setFocus(b.dataset.add);
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = () => [...inp.files].forEach(f => addImg(b.dataset.add, f)); inp.click();
  });
}
$("lightbox").onclick = () => $("lightbox").style.display = "none";
document.addEventListener("paste", e => {
  if (!S.ck?.built || !S.focusKey || $("view-checklist").style.display === "none") return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith("image/")).map(i => i.getAsFile());
  if (!files.length) return;
  e.preventDefault(); files.forEach(f => addImg(S.focusKey, f));
});
async function addImg(k, file) {
  try {
    const url = await compress(file);
    await W(() => store.addImagem(S.ck.id, k, url, file.name || "print"));
    toast(`Imagem adicionada ao item ${unkey(k)}`);
  } catch (e) { alert("Não foi possível adicionar a imagem: " + e.message); }
}
function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image(), fr = new FileReader();
    fr.onload = () => img.src = fr.result; fr.onerror = rej;
    img.onerror = () => rej(new Error("arquivo de imagem inválido"));
    img.onload = () => {
      let max = 1600, q = 0.78, out;
      do {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q); max *= 0.8; q = Math.max(0.5, q - 0.08);
      } while (out.length > 700000 && max > 300);
      res(out);
    };
    fr.readAsDataURL(file);
  });
}

function showHistorico() {
  modal(`<h3>Histórico de alterações</h3><div class="hist" id="histList">Carregando…</div><div class="actions"><button class="btn btn-light" id="mClose">Fechar</button></div>`);
  const un = store.watchHistorico(S.ck.id, l => {
    const el = $("histList"); if (!el) return;
    el.innerHTML = l.length ? l.map(h => `<div>${esc(h.texto)}<br><small>${esc(h.usuario)} · ${fmtDT(h.em)}</small></div>`).join("") : "Sem registros.";
  });
  $("mClose").onclick = () => { un(); closeModal(); };
}
function excluirAnalise() {
  const a = S.ck.a;
  modal(`<h3>Excluir análise</h3><p style="font-size:13px">Isto apaga definitivamente a <b>Rev. ${esc(a.revisao)}</b> do segmento <b>${esc(a.segmento)}</b>, com imagens e histórico. Recomenda-se baixar um backup antes.</p>
    <div class="row">Digite o segmento (${esc(a.segmento)}) para confirmar<input type="text" id="mConf"></div>
    <div class="actions"><button class="btn btn-light" id="mCancel">Cancelar</button><button class="btn btn-danger" id="mOk">Excluir</button></div>`);
  $("mCancel").onclick = closeModal;
  $("mOk").onclick = () => {
    if ($("mConf").value.trim() !== a.segmento) { $("mConf").focus(); return; }
    W(async () => { await store.deleteAnalise(a.id); closeModal(); toast("Análise excluída"); location.hash = "#/segmentos"; });
  };
}

// ---------------------------------------------------------------------
//  Exportação XLSX (layout da planilha original)
// ---------------------------------------------------------------------
const B = { top: { style: "thin", color: { rgb: "BFC9D4" } }, bottom: { style: "thin", color: { rgb: "BFC9D4" } }, left: { style: "thin", color: { rgb: "BFC9D4" } }, right: { style: "thin", color: { rgb: "BFC9D4" } } };
const FILL = { "Aprovado": "D9F2E3", "Reprovado": "FADBDB", "Não se Aplica": "E5E9EE", "Concluído": "D9F2E3", "Em andamento": "FFF0CC" };
function sheetAnalise(a) {
  const c = calc(a), rows = [], st = [];
  const put = (r, s) => { rows.push(r); st.push(s || {}); };
  put([`ANÁLISE DE DOCUMENTOS - AS BUILT`, "", "Disciplina", a.disciplina || APP_INFO.disciplina, "AVANÇO", "ELABORAÇÃO", "ANÁLISE"], { bold: true, head: true });
  put(["", "", "Data da última Análise", fmtD(a.dataAnalise), "", c.elab, c.anal], { pct: true });
  put(["Empresa", a.empresa || "", "Documento", a.documento || ""]);
  put(["Analista", a.analista || "", "Revisão", a.revisao || ""]);
  put(["Segmento", a.segmento, "Status", statusDoc(a)]);
  put(["CHECKLIST DE ANÁLISE"], { bold: true, head: true });
  put(["Item", "Descrição", "Imagens relacionadas", "Observações", "Responsável", "Status Elaboração", "Status Análise"], { bold: true, head: true });
  const nImg = {}; (a._imgs || []).forEach(i => nImg[i.item] = (nImg[i.item] || 0) + 1);
  CHECKLIST.forEach(sec => {
    put([+sec.id, sec.titulo], { bold: true, sec: true });
    if (sec.nota) put(["", sec.nota], { ital: true });
    let sub = null;
    sec.itens.forEach(it => {
      if (it.sub && it.sub !== sub) { sub = it.sub; put([it.id.split(".").slice(0, 2).join("."), it.sub], { bold: true }); }
      const v = a.itens?.[key(it.id)] || {};
      put([it.id, it.desc, nImg[key(it.id)] ? `${nImg[key(it.id)]} imagem(ns) no site` : "", v.obs || "", v.resp || "", v.elab || "Pendente", v.anal || "Aguardando Conclusão"], { item: true });
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  rows.forEach((r, ri) => {
    for (let ci = 0; ci < 7; ci++) {
      const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const s = st[ri], cell = ws[ref];
      cell.s = { font: { bold: !!s.bold, italic: !!s.ital, color: s.head ? { rgb: "FFFFFF" } : undefined, sz: 10 }, alignment: { wrapText: true, vertical: "center", horizontal: ci === 1 || ci === 3 ? "left" : "center" }, border: B };
      if (s.head) cell.s.fill = { fgColor: { rgb: "2F78B9" } };
      if (s.sec) cell.s.fill = { fgColor: { rgb: "DCE9F5" } };
      if (s.item && (ci === 5 || ci === 6) && FILL[cell.v]) cell.s.fill = { fgColor: { rgb: FILL[cell.v] } };
      if (s.pct && ci >= 5) cell.z = "0.0%";
    }
  });
  ws["!cols"] = [{ wch: 9 }, { wch: 70 }, { wch: 16 }, { wch: 45 }, { wch: 14 }, { wch: 17 }, { wch: 21 }];
  return ws;
}
function exportAnaliseXlsx(list, nome) {
  const wb = XLSX.utils.book_new(), used = new Set();
  list.forEach(a => {
    if (S.ck?.id === a.id) a._imgs = S.ck.imgs;
    let n = `${a.segmento} RV${a.revisao || "0"}`.replace(/[\\/?*[\]:]/g, "-").slice(0, 31), i = 2;
    while (used.has(n)) n = n.slice(0, 28) + "_" + i++;
    used.add(n); XLSX.utils.book_append_sheet(wb, sheetAnalise(a), n);
  });
  const a = list[0];
  XLSX.writeFile(wb, nome || `ANÁLISE AS BUILT - GEOMETRIA - SEG ${a.segmento} RV${a.revisao || "0"}.xlsx`);
}

// ---------------------------------------------------------------------
//  CONFIGURAÇÕES / BACKUP
// ---------------------------------------------------------------------
let cfgSegs = [], cfgConst = {};
function renderConfig() {
  cfgSegs = JSON.parse(JSON.stringify(S.segmentos));
  cfgConst = { ...S.construtoras };
  drawCfg();
  $("backupNotice").innerHTML = MODO === "firebase"
    ? "<b>Armazenamento:</b> Firebase Firestore (nuvem). Cada alteração é salva na hora, registrada no histórico com nome e data e sincronizada em tempo real com todos os usuários. O site também guarda uma cópia offline no navegador.<br><b>Recomendado:</b> baixar o backup .json periodicamente (ex.: semanal) e guardar na pasta do projeto."
    : "<b>Modo local:</b> os dados estão só neste navegador. Configure o Firebase para compartilhar com a equipe.";
}
function drawCfg() {
  $("segCfgTable").innerHTML = "<thead><tr><th>#</th><th>Segmento</th><th>Pacote(s)</th><th>Análises</th><th></th></tr></thead><tbody>" + cfgSegs.map((s, i) =>
    `<tr><td>${i + 1}</td><td><input type="text" data-i="${i}" data-f="codigo" value="${esc(s.codigo)}" style="width:90px"></td>
     <td><input type="text" data-i="${i}" data-f="pacotes" value="${esc(s.pacotes.join(", "))}"></td>
     <td class="num">${porSegmento(s.codigo).length}</td>
     <td style="white-space:nowrap"><button class="btn btn-light btn-sm" data-mv="${i}|-1">↑</button> <button class="btn btn-light btn-sm" data-mv="${i}|1">↓</button> <button class="btn btn-danger btn-sm" data-rm="${i}">✕</button></td></tr>`).join("") + "</tbody>";
  $("segCfgTable").querySelectorAll("input").forEach(inp => inp.onchange = () => {
    const s = cfgSegs[+inp.dataset.i];
    if (inp.dataset.f === "codigo") s.codigo = inp.value.trim(); else { s.pacotes = inp.value.split(",").map(x => x.trim()).filter(Boolean); drawConstCfg(); }
  });
  drawConstCfg();
  $("segCfgTable").querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const [i, d] = b.dataset.mv.split("|").map(Number); const j = i + d; if (j < 0 || j >= cfgSegs.length) return; [cfgSegs[i], cfgSegs[j]] = [cfgSegs[j], cfgSegs[i]]; drawCfg(); });
  $("segCfgTable").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { const s = cfgSegs[+b.dataset.rm]; if (porSegmento(s.codigo).length && !confirm(`O segmento ${s.codigo} possui análises. Remover da lista mesmo assim? (as análises não serão apagadas)`)) return; cfgSegs.splice(+b.dataset.rm, 1); drawCfg(); });
}
function drawConstCfg() {
  const pacs = uniq(cfgSegs.flatMap(s => s.pacotes));
  $("constCfgTable").innerHTML = "<thead><tr><th>Pacote</th><th>Construtora</th><th>Segmentos</th></tr></thead><tbody>" + pacs.map(p =>
    `<tr><td><b>${esc(p)}</b></td><td><input type="text" list="constList" data-pac="${esc(p)}" value="${esc(cfgConst[p] || "")}" style="width:140px"> ${cfgConst[p] ? empChip(cfgConst[p]) : ""}</td>
     <td class="muted">${cfgSegs.filter(s => s.pacotes.includes(p)).map(s => esc(s.codigo)).join(", ")}</td></tr>`).join("") + "</tbody>"
    + `<datalist id="constList">${Object.keys(CONSTRUTORAS).map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
  $("constCfgTable").querySelectorAll("input").forEach(inp => inp.onchange = () => { cfgConst[inp.dataset.pac] = inp.value.trim(); drawConstCfg(); });
}
$("addSegBtn").onclick = () => { cfgSegs.push({ codigo: "", pacotes: [] }); drawCfg(); $("segCfgTable").querySelector("tbody tr:last-child input").focus(); };
$("resetSegBtn").onclick = () => { cfgSegs = JSON.parse(JSON.stringify(SEGMENTOS_PADRAO)); cfgConst = { ...CONSTRUTORA_POR_PACOTE }; drawCfg(); toast("Lista padrão carregada — clique em Salvar para aplicar"); };
$("saveSegBtn").onclick = () => {
  const l = cfgSegs.filter(s => s.codigo);
  if (new Set(l.map(s => s.codigo)).size !== l.length) { alert("Há segmentos com código repetido."); return; }
  if (l.some(s => !s.pacotes.length)) { alert("Todo segmento precisa de ao menos um pacote."); return; }
  const pacs = uniq(l.flatMap(s => s.pacotes));
  if (pacs.some(p => !cfgConst[p])) { alert("Informe a construtora de todos os pacotes."); return; }
  const cons = Object.fromEntries(pacs.map(p => [p, cfgConst[p]]));
  W(async () => { await store.saveSegmentos(l, cons); toast("Segmentos e construtoras salvos"); });
};
$("exportJsonBtn").onclick = () => W(async () => {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `backup-asbuilt-geometria-${today()}.json`; a.click();
  toast(`Backup gerado: ${data.analises.length} análises, ${data.imagens.length} imagens`);
});
$("exportXlsxBtn").onclick = () => {
  if (!S.analises.length) { alert("Nenhuma análise para exportar."); return; }
  const ord = S.segmentos.map(s => s.codigo);
  const l = [...S.analises].sort((a, b) => (ord.indexOf(a.segmento) - ord.indexOf(b.segmento)) || (a.criadoEm || "").localeCompare(b.criadoEm || ""));
  exportAnaliseXlsx(l, `ANÁLISES AS BUILT - GEOMETRIA - TODAS - ${today()}.xlsx`);
};
$("importJsonBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.analises || !data.segmentos) throw new Error("arquivo não é um backup deste site");
    if (!confirm(`Restaurar backup de ${fmtDT(data.exportadoEm)}?\n${data.analises.length} análises e ${(data.imagens || []).length} imagens serão gravadas (registros com o mesmo ID serão substituídos).`)) return;
    await W(() => store.importAll(data)); toast("Backup restaurado");
  } catch (err) { alert("Falha ao restaurar: " + err.message); }
};

// ---------------------------------------------------------------------
//  Modal
// ---------------------------------------------------------------------
function modal(html) { $("modalBox").innerHTML = html; $("modal").style.display = "grid"; }
function closeModal() { $("modal").style.display = "none"; $("modalBox").innerHTML = ""; }
$("modal").addEventListener("mousedown", e => { if (e.target === $("modal")) closeModal(); });
addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); $("lightbox").style.display = "none"; } });
