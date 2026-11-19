/* ===== CONFIGURAÇÃO: só estas 3 linhas mudam de um condomínio para outro ===== */
const SUPABASE_URL = "https://mgzfhyquwfrnfsuwkywr.supabase.co";
const SUPABASE_KEY = "sb_publishable_suHihPFQhfBNzUu_2_ih5Q_orWsgVDN";
const SLUG = "condominio-teste";
/* ============================================================================== */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);
const br = (k) => k.split("-").reverse().join("/");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const TIPOS = { festa_ar_condicionado: "Festa com ar-condicionado", somente_churrasqueira: "Somente churrasqueira" };
const now = new Date();
const HOJE = iso(now.getFullYear(), now.getMonth(), now.getDate());
const dh = (t) => { const d = new Date(t); return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
const longa = (k) => { const p = k.split("-"); return DIAS[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ", " + br(k); };

const S = { info: { nome: "Condomínio", blocos: [] }, modo: "morador", perfil: null, apto: null, y: now.getFullYear(), m: now.getMonth(), sel: null, tipo: null, org: "", agree: false, cal: [], minhas: [], lista: [], tab: "pendentes", msg: "", notifs: [], rec: null, motivo: "", sy: now.getFullYear(), sm: now.getMonth(), sdia: null };

/* ---------- início ---------- */
async function boot() {
  const r = await sb.rpc("info_login", { p_slug: SLUG });
  if (r.data) S.info = r.data;
  document.title = S.info.nome;
  const s = await sb.auth.getSession();
  if (s.data && s.data.session) await entrar(); else telaLogin();
}

async function entrar() {
  const u = await sb.auth.getUser();
  const user = u.data && u.data.user;
  if (!user) return telaLogin();
  const p = await sb.from("perfis").select("papel,apartamento_id,condominio_id").eq("id", user.id).maybeSingle();
  if (!p.data) { await sb.auth.signOut(); telaLogin(); setErro("Este acesso ainda não está ligado a um condomínio."); return; }
  S.perfil = p.data;
  if (S.perfil.papel === "sindico") { await carregaSindico(); telaSindico(); return; }
  const a = await sb.from("apartamentos").select("bloco,numero").eq("id", S.perfil.apartamento_id).single();
  S.apto = a.data;
  await carregaMorador();
  telaMorador();
}

function sair() { sb.auth.signOut().then(() => { S.perfil = null; S.msg = ""; telaLogin(); }); }
function setErro(t) { const e = $("#erro"); if (e) e.textContent = t; }

/* ---------- login ---------- */
function telaLogin() {
  const adm = S.modo === "adm";
  const fundo = S.info.foto_url ? "background-image:url('" + esc(S.info.foto_url) + "')" : "";
  const campos = adm
    ? '<div class="f"><label for="email">E-mail</label><input class="in" id="email" name="email" type="email" autocomplete="username"></div>'
    : '<div class="f"><label for="bloco">Bloco</label><select class="in" id="bloco" name="bloco"><option value="">Selecione o bloco</option>' +
      (S.info.blocos || []).map((b) => "<option value=\"" + esc(b) + "\">Bloco " + esc(b) + "</option>").join("") +
      '</select></div><div class="f"><label for="apto">Apartamento</label><input class="in" id="apto" name="apto" inputmode="numeric" placeholder="Ex.: 102" autocomplete="off"></div>';
  $("#app").innerHTML =
    '<div class="login"><div class="lp"><div class="lbg" style="' + fundo + '"></div><div class="lov"></div><div class="lt">' + esc(S.info.nome) + "</div></div>" +
    '<div class="lr"><div class="card"><h2 style="font-size:26px;margin-bottom:8px">Entrar</h2><p style="margin:0 0 28px;color:var(--mute);font-size:15px">' +
    (adm ? "Acesso da administração." : "Acesse com os dados do seu apartamento.") + '</p><form id="fl">' + campos +
    '<div class="f"><label for="senha">Senha</label><input class="in" id="senha" name="senha" type="password" autocomplete="current-password"></div>' +
    '<div class="err" id="erro" role="alert"></div><button class="btn" style="width:100%" id="bl">Entrar</button></form>' +
    '<div style="text-align:center;margin-top:12px"><button class="link" data-act="modo">' + (adm ? "Sou morador" : "Sou da administração") + "</button></div></div></div></div>";
  $("#fl").addEventListener("submit", fazLogin);
}

async function fazLogin(ev) {
  ev.preventDefault();
  const f = ev.target;
  let email;
  if (S.modo === "adm") email = f.email.value.trim();
  else {
    const b = f.bloco.value, a = f.apto.value.trim().toLowerCase();
    if (!b || !a) return setErro("Escolha o bloco e digite o apartamento.");
    email = b + "-" + a + "@" + SLUG + ".example.com";
  }
  if (!f.senha.value) return setErro("Digite a senha.");
  $("#bl").disabled = true;
  const r = await sb.auth.signInWithPassword({ email: email, password: f.senha.value });
  if (r.error) { $("#bl").disabled = false; return setErro("Dados inválidos. Confira e tente de novo."); }
  await entrar();
}

/* ---------- morador ---------- */
async function carregaMorador() {
  const ini = iso(S.y, S.m, 1), fim = iso(S.y, S.m, new Date(S.y, S.m + 1, 0).getDate());
  const r = await Promise.all([
    sb.rpc("calendario", { p_inicio: ini, p_fim: fim }),
    sb.from("reservas").select("data_reserva,tipo,status,motivo_recusa,criado_em,decidido_em").order("data_reserva", { ascending: false }),
    sb.from("notificacoes").select("id,titulo,mensagem,lida,criado_em").order("criado_em", { ascending: false }).limit(30)
  ]);
  S.cal = r[0].data || [];
  S.minhas = r[1].data || [];
  S.notifs = r[2].data || [];
}

function topo(rotulo) {
  return '<div class="top"><b style="font-size:18px">' + esc(S.info.nome) + "</b><span>" + rotulo + '<button data-act="sair">Sair</button></span></div>';
}

function telaMorador() {
  const mapa = {};
  S.cal.forEach((c) => { mapa[c.data_reserva] = c; });
  const primeiro = new Date(S.y, S.m, 1).getDay(), dias = new Date(S.y, S.m + 1, 0).getDate();
  let cel = "";
  for (let i = 0; i < primeiro; i++) cel += '<div class="dia"></div>';
  for (let d = 1; d <= dias; d++) {
    const k = iso(S.y, S.m, d), c = mapa[k];
    let cls = "", livre = false;
    if (k < HOJE) cls = "past";
    else if (c) cls = c.status === "aprovada" ? (c.minha ? "g" : "r") : "y";
    else livre = true;
    if (S.sel === k) cls = "sel";
    cel += '<div class="dia">' + (livre || S.sel === k ? '<button class="' + cls + '" data-act="dia" data-d="' + k + '">' + d + "</button>" : '<span class="' + cls + '">' + d + "</span>") + "</div>";
  }
  const ok = S.sel && S.tipo && S.org.trim() && S.agree;
  const opt = (v, t, desc) => '<label class="opt' + (S.tipo === v ? " on" : "") + '"><input type="radio" name="tipo" value="' + v + '"' + (S.tipo === v ? " checked" : "") + "><span><b>" + t + "</b><br>" + desc + "</span></label>";
  const form = S.sel
    ? '<div style="font-weight:600;margin-bottom:16px">' + esc(longa(S.sel)) + '</div><div class="f"><label for="org">Nome de quem organiza a festa</label><input class="in" id="org" value="' + esc(S.org) + '" placeholder="Nome completo"></div>' +
      '<div class="f"><div style="font-size:14px;font-weight:600;margin-bottom:8px">Tipo de uso</div>' +
      opt("festa_ar_condicionado", "Festa com ar-condicionado", "Salão com ar-condicionado e lista maior de convidados. Com taxa de uso (valor a definir).") +
      opt("somente_churrasqueira", "Somente churrasqueira", "Uso do salão com a churrasqueira, sem ar-condicionado. Sem taxa.") + "</div>" +
      '<label class="opt" style="border:0;padding:0"><input type="checkbox" id="agree"' + (S.agree ? " checked" : "") + "><span>Declaro que o organizador é maior de 18 anos e que o apartamento é responsável pela festa.</span></label>" +
      '<button class="btn" style="width:100%;margin-top:16px" data-act="enviar"' + (ok ? "" : " disabled") + ">Enviar solicitação</button>"
    : '<p style="margin:0;color:var(--mute);font-size:14px">Toque em uma data livre no calendário para começar.</p>';
  const ST = { pendente: ["s1", "Aguardando a administração"], aprovada: ["s2", "Aprovada"], recusada: ["s3", "Recusada"] };
  const minhas = S.minhas.slice(0, 15).map((r) =>
    '<div class="nt"><b>' + br(r.data_reserva) + "</b> · " + TIPOS[r.tipo] + ' <span class="st ' + ST[r.status][0] + '">' + ST[r.status][1] + "</span>" +
    '<div style="margin-top:6px;color:var(--mute);font-size:13px">Pedido feito em ' + dh(r.criado_em) + (r.decidido_em ? "<br>" + (r.status === "aprovada" ? "Aprovada" : "Recusada") + " em " + dh(r.decidido_em) : "") + "</div>" +
    (r.status === "recusada" ? '<div style="margin-top:6px;color:var(--mute)">Motivo: ' + esc(r.motivo_recusa || "não informado") + "</div>" : "") + "</div>").join("");
  const naoLidas = S.notifs.filter((n) => !n.lida).length;
  const notifs = S.notifs.map((n) =>
    '<div class="nt' + (n.lida ? "" : " new") + '"><b>' + esc(n.titulo) + "</b><br>" + esc(n.mensagem) + '<br><small style="color:var(--mute)">' + new Date(n.criado_em).toLocaleString("pt-BR") + "</small></div>").join("");
  const vazio = (t) => '<p style="margin:0;color:var(--mute);font-size:14px">' + t + "</p>";
  $("#app").innerHTML = topo("Bloco " + esc(S.apto && S.apto.bloco) + " · Apartamento " + esc(S.apto && S.apto.numero)) +
    '<div class="wrap"><div class="card main"><h1 style="font-size:24px">Salão de festas</h1><p style="margin:4px 0 0;color:var(--mute);font-size:14px">Escolha uma data livre para pedir a reserva.</p>' +
    '<div class="nav"><b style="font-size:20px">' + MESES[S.m] + " de " + S.y + '</b><span><button aria-label="Mês anterior" data-act="prev">‹</button><button aria-label="Próximo mês" data-act="next">›</button></span></div>' +
    '<div class="grid">' + ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((w) => '<div class="wd">' + w + "</div>").join("") + cel + "</div>" +
    '<div class="leg"><span><i style="background:#17794B"></i>Sua reserva aprovada</span><span><i style="background:#F2B705"></i>Pendente</span><span><i style="background:#C62F2F"></i>Já reservada</span><span><i></i>Livre</span></div></div>' +
    '<div class="side"><div class="card"><h2 style="font-size:18px;margin-bottom:12px">Pedir reserva</h2>' + (S.msg ? '<div class="msg">' + esc(S.msg) + "</div>" : "") + form + "</div>" +
    '<div class="card"><h2 style="font-size:18px;margin-bottom:12px">Notificações' + (naoLidas ? " (" + naoLidas + (naoLidas > 1 ? " novas" : " nova") + ")" : "") + "</h2>" + (notifs || vazio("Nenhuma notificação ainda.")) + (naoLidas ? '<button class="link" data-act="lidas">Marcar como lidas</button>' : "") + "</div>" +
    '<div class="card"><h2 style="font-size:18px;margin-bottom:12px">Minhas reservas</h2>' + (minhas || vazio("Você ainda não tem reservas.")) + "</div></div></div>";
}

async function enviar() {
  if (!(S.sel && S.tipo && S.org.trim() && S.agree)) return;
  const r = await sb.from("reservas").insert({ condominio_id: S.perfil.condominio_id, apartamento_id: S.perfil.apartamento_id, data_reserva: S.sel, tipo: S.tipo, organizador: S.org.trim(), declarou_maior_18: true });
  if (r.error) S.msg = r.error.code === "23505" ? "Essa data acabou de ser pedida por outro apartamento. Escolha outra." : "Não foi possível enviar o pedido. Tente de novo.";
  else { S.msg = "Solicitação enviada para " + br(S.sel) + ". A administração vai analisar."; S.sel = null; S.tipo = null; S.org = ""; S.agree = false; }
  await carregaMorador();
  telaMorador();
}

/* ---------- síndico ---------- */
async function carregaSindico() {
  const r = await sb.from("reservas").select("id,data_reserva,tipo,organizador,status,criado_em,decidido_em,apartamentos(bloco,numero)").order("data_reserva");
  S.lista = r.data || [];
}

function telaSindico() {
  const f = {
    pendentes: (r) => r.status === "pendente",
    confirmadas: (r) => r.status === "aprovada" && r.data_reserva >= HOJE,
    historico: (r) => r.status === "aprovada" && r.data_reserva < HOJE,
    recusadas: (r) => r.status === "recusada"
  };
  const nome = { pendentes: "Pendentes", confirmadas: "Confirmadas", historico: "Histórico", recusadas: "Recusadas" };
  const tabs = Object.keys(f).map((t) => '<button class="' + (S.tab === t ? "on" : "") + '" data-act="tab" data-t="' + t + '">' + nome[t] + " (" + S.lista.filter(f[t]).length + ")</button>").join("");
  const linha = (r, acoes) => {
    const ap = r.apartamentos || {}, fest = r.tipo === "festa_ar_condicionado";
    const stt = { pendente: ["s1", "Pendente"], aprovada: ["s2", r.data_reserva < HOJE ? "Realizada" : "Aprovada"], recusada: ["s3", "Recusada"] }[r.status];
    return '<div class="row"><div><b>' + esc(longa(r.data_reserva)) + '</b> <span class="st ' + stt[0] + '">' + stt[1] + '</span><div style="margin-top:4px;font-size:14px">Bloco ' + esc(ap.bloco) + " · Apto " + esc(ap.numero) + " · responsável pela festa: " + esc(r.organizador) +
      '</div><span class="tag ' + (fest ? "t1" : "t2") + '">' + TIPOS[r.tipo] + "</span><small>" + (fest ? "Usa o ar-condicionado · com taxa" : "Sem ar-condicionado · sem taxa") + "</small>" +
      '<div style="margin-top:6px;font-size:13px;color:var(--mute)">Pedido feito em ' + dh(r.criado_em) + (r.decidido_em ? " · " + (r.status === "aprovada" ? "Aprovada" : "Recusada") + " em " + dh(r.decidido_em) : "") + "</div>" +
      (r.status === "recusada" ? '<div style="margin-top:6px;font-size:14px;color:var(--mute)">Motivo: ' + esc(r.motivo_recusa || "não informado") + "</div>" : "") + "</div>" + (acoes || "") + "</div>";
  };
  const acoesDe = (r) => S.tab !== "pendentes" ? "" : S.rec === r.id
    ? '<div style="flex:1 1 100%"><label for="motivo">Motivo da recusa (o morador vai ler)</label><textarea class="in" id="motivo" placeholder="Ex.: data reservada para evento do condomínio">' + esc(S.motivo) + '</textarea><div class="acts" style="margin-top:8px"><button class="btn out" data-act="cancelarec">Voltar</button><button class="btn ok" style="background:#B02626" id="confrec" data-act="confirmarec" data-id="' + r.id + '"' + (S.motivo.trim() ? "" : " disabled") + ">Confirmar recusa</button></div></div>"
    : '<div class="acts"><button class="btn out" data-act="recusar" data-id="' + r.id + '">Recusar</button><button class="btn ok" data-act="decide" data-s="aprovada" data-id="' + r.id + '">Aprovar</button></div>';
  let rows = S.lista.filter(f[S.tab]);
  if (S.tab === "historico" || S.tab === "recusadas") rows = rows.slice().reverse();
  const html = rows.map((r) => linha(r, acoesDe(r))).join("");
  const mapa = {};
  S.lista.forEach((r) => { if (r.status !== "recusada") mapa[r.data_reserva] = r; });
  const prim = new Date(S.sy, S.sm, 1).getDay(), nd = new Date(S.sy, S.sm + 1, 0).getDate();
  let cel = "";
  for (let i = 0; i < prim; i++) cel += '<div class="dia"></div>';
  for (let d = 1; d <= nd; d++) {
    const k = iso(S.sy, S.sm, d), r = mapa[k];
    const cls = (r ? (r.status === "pendente" ? "y" : k < HOJE ? "d" : "r") : "") + (S.sdia === k ? " pick" : "");
    cel += '<div class="dia"><button class="' + cls + '" data-act="sdia" data-d="' + k + '">' + d + "</button></div>";
  }
  const doDia = S.sdia ? S.lista.filter((r) => r.data_reserva === S.sdia && r.status !== "recusada") : [];
  const detalhe = S.sdia ? '<div style="margin-top:16px"><b>' + esc(longa(S.sdia)) + "</b><div style=\"margin-top:8px\">" + (doDia.map((r) => linha(r)).join("") || '<p style="margin:0;color:var(--mute);font-size:14px">Nenhuma reserva nesta data.</p>') + "</div></div>" : "";
  $("#app").innerHTML = topo("Administração") + '<div class="wrap"><div class="card main"><h1 style="font-size:24px;margin-bottom:20px">Reservas do salão de festas</h1>' +
    (S.msg ? '<div class="msg">' + esc(S.msg) + "</div>" : "") + '<div class="tabs">' + tabs + "</div>" + (html || '<p style="margin:0;color:var(--mute)">Nenhuma reserva nesta lista.</p>') + "</div>" +
    '<div class="side"><div class="card"><div class="nav" style="margin-top:0"><b style="font-size:18px">' + MESES[S.sm] + " de " + S.sy + '</b><span><button aria-label="Mês anterior" data-act="sprev">‹</button><button aria-label="Próximo mês" data-act="snext">›</button></span></div>' +
    '<div class="grid">' + ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((w) => '<div class="wd">' + w + "</div>").join("") + cel + "</div>" +
    '<div class="leg"><span><i style="background:#F2B705"></i>Pendente</span><span><i style="background:#C62F2F"></i>Confirmada</span><span><i style="background:#5B6B7A"></i>Realizada</span></div>' + detalhe + "</div></div></div>";
}

async function decide(id, status, motivo) {
  const dados = { status: status };
  if (status === "recusada") dados.motivo_recusa = motivo;
  const r = await sb.from("reservas").update(dados).eq("id", id);
  S.rec = null; S.motivo = "";
  S.msg = r.error ? "Não foi possível salvar a decisão. Tente de novo." : status === "aprovada" ? "Reserva aprovada. O morador vai ver o aviso no site." : "Solicitação recusada. A data voltou a ficar livre e o morador vai ver o motivo no site.";
  await carregaSindico();
  telaSindico();
}

/* ---------- cliques e campos ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const a = b.dataset.act;
  if (a === "modo") { S.modo = S.modo === "adm" ? "morador" : "adm"; telaLogin(); }
  else if (a === "sair") sair();
  else if (a === "dia") { S.sel = b.dataset.d; S.msg = ""; telaMorador(); }
  else if (a === "prev" || a === "next") { S.m += a === "next" ? 1 : -1; if (S.m < 0) { S.m = 11; S.y--; } if (S.m > 11) { S.m = 0; S.y++; } await carregaMorador(); telaMorador(); }
  else if (a === "enviar") { b.disabled = true; await enviar(); }
  else if (a === "tab") { S.tab = b.dataset.t; S.msg = ""; S.rec = null; telaSindico(); }
  else if (a === "lidas") { await sb.from("notificacoes").update({ lida: true }).eq("lida", false); await carregaMorador(); telaMorador(); }
  else if (a === "recusar") { S.rec = b.dataset.id; S.motivo = ""; telaSindico(); const t = $("#motivo"); if (t) t.focus(); }
  else if (a === "cancelarec") { S.rec = null; telaSindico(); }
  else if (a === "confirmarec") { b.disabled = true; await decide(b.dataset.id, "recusada", S.motivo.trim()); }
  else if (a === "sdia") { S.sdia = b.dataset.d; telaSindico(); }
  else if (a === "sprev" || a === "snext") { S.sm += a === "snext" ? 1 : -1; if (S.sm < 0) { S.sm = 11; S.sy--; } if (S.sm > 11) { S.sm = 0; S.sy++; } telaSindico(); }
  else if (a === "decide") { b.disabled = true; await decide(b.dataset.id, b.dataset.s); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "motivo") { S.motivo = e.target.value; const c = $("#confrec"); if (c) c.disabled = !S.motivo.trim(); }
  if (e.target.id === "org") { S.org = e.target.value; const bt = document.querySelector('[data-act="enviar"]'); if (bt) bt.disabled = !(S.sel && S.tipo && S.org.trim() && S.agree); }
});
document.addEventListener("change", (e) => {
  if (e.target.name === "tipo") { S.tipo = e.target.value; telaMorador(); }
  else if (e.target.id === "agree") { S.agree = e.target.checked; telaMorador(); }
});

boot();
