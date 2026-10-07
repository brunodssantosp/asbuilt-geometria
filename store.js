// =====================================================================
//  Camada de dados: Firebase (compartilhado) ou Local (navegador)
// =====================================================================
import { FIREBASE_CONFIG, SEGMENTOS_PADRAO } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
export const MODO = FIREBASE_CONFIG.apiKey ? "firebase" : "local";

let api = null;
export async function initStore() {
  api = MODO === "firebase" ? await firebaseStore() : localStore();
  return api;
}
export const store = new Proxy({}, { get: (_, k) => api[k] });

// ---------------------------------------------------------------------
//  FIREBASE
// ---------------------------------------------------------------------
async function firebaseStore() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const A = await import(FB + "firebase-auth.js");
  const F = await import(FB + "firebase-firestore.js");
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { db = F.getFirestore(app); }

  const user = () => auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email, nome: auth.currentUser.displayName || auth.currentUser.email.split("@")[0], temNome: !!auth.currentUser.displayName } : null;
  const now = () => new Date().toISOString();
  const onErr = e => { console.error(e); if (auth.currentUser) alert("Erro de acesso ao banco de dados: " + e.message); };
  const log = (batch, analiseId, entry) => {
    const ref = F.doc(F.collection(db, "analises", analiseId, "historico"));
    batch.set(ref, { ...entry, usuario: user()?.nome || "?", email: user()?.email || "", em: now() });
  };

  return {
    modo: "firebase",
    onAuth(cb) { return A.onAuthStateChanged(auth, () => cb(user())); },
    async login(email, senha) { await A.signInWithEmailAndPassword(auth, email, senha); },
    async logout() { await A.signOut(auth); },
    async resetSenha(email) { await A.sendPasswordResetEmail(auth, email); },
    async setNome(nome) { await A.updateProfile(auth.currentUser, { displayName: nome }); },
    user,

    watchSegmentos(cb) {
      const ref = F.doc(db, "config", "segmentos");
      return F.onSnapshot(ref, s => cb(s.exists() ? s.data().lista : SEGMENTOS_PADRAO, s.exists() ? s.data().construtoras || null : null), onErr);
    },
    async saveSegmentos(lista, construtoras) {
      await F.setDoc(F.doc(db, "config", "segmentos"), { lista, construtoras, atualizadoPor: user()?.nome, atualizadoEm: now() });
    },

    watchAnalises(cb) {
      return F.onSnapshot(F.collection(db, "analises"), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    watchAnalise(id, cb) {
      return F.onSnapshot(F.doc(db, "analises", id), s => cb(s.exists() ? { id: s.id, ...s.data(), _pendente: s.metadata.hasPendingWrites } : null), onErr);
    },
    async createAnalise(data) {
      const ref = F.doc(F.collection(db, "analises"));
      const b = F.writeBatch(db);
      b.set(ref, { ...data, criadoPor: user()?.nome, criadoEm: now(), atualizadoPor: user()?.nome, atualizadoEm: now() });
      log(b, ref.id, { tipo: "criacao", texto: `Análise criada (segmento ${data.segmento}, rev. ${data.revisao})` });
      // não espera o servidor: funciona também offline (sincroniza ao reconectar)
      b.commit().catch(e => alert("Erro ao criar análise: " + e.message));
      return ref.id;
    },
    async updateHeader(id, patch, texto) {
      const b = F.writeBatch(db);
      b.update(F.doc(db, "analises", id), { ...patch, atualizadoPor: user()?.nome, atualizadoEm: now() });
      log(b, id, { tipo: "cabecalho", texto });
      await b.commit();
    },
    async updateItem(id, key, campo, valor, texto) {
      const b = F.writeBatch(db);
      b.update(F.doc(db, "analises", id), {
        [`itens.${key}.${campo}`]: valor,
        [`itens.${key}.por`]: user()?.nome, [`itens.${key}.em`]: now(),
        atualizadoPor: user()?.nome, atualizadoEm: now()
      });
      log(b, id, { tipo: "item", item: key, texto });
      await b.commit();
    },
    async updateItens(id, patches, texto) { // patches: {key:{campo:valor}}
      const b = F.writeBatch(db);
      const upd = { atualizadoPor: user()?.nome, atualizadoEm: now() };
      for (const [k, p] of Object.entries(patches)) {
        for (const [c, v] of Object.entries(p)) upd[`itens.${k}.${c}`] = v;
        upd[`itens.${k}.por`] = user()?.nome; upd[`itens.${k}.em`] = now();
      }
      b.update(F.doc(db, "analises", id), upd);
      log(b, id, { tipo: "lote", texto });
      await b.commit();
    },
    async deleteAnalise(id) {
      const imgs = await F.getDocs(F.query(F.collection(db, "imagens"), F.where("analiseId", "==", id)));
      const hist = await F.getDocs(F.collection(db, "analises", id, "historico"));
      const refs = [...imgs.docs.map(d => d.ref), ...hist.docs.map(d => d.ref), F.doc(db, "analises", id)];
      for (let i = 0; i < refs.length; i += 400) {
        const b = F.writeBatch(db);
        refs.slice(i, i + 400).forEach(r => b.delete(r));
        await b.commit();
      }
    },

    watchImagens(analiseId, cb) {
      return F.onSnapshot(F.query(F.collection(db, "imagens"), F.where("analiseId", "==", analiseId)),
        s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    async addImagem(analiseId, item, dataUrl, nome) {
      const b = F.writeBatch(db);
      b.set(F.doc(F.collection(db, "imagens")), { analiseId, item, dataUrl, nome: nome || "", autor: user()?.nome, em: now() });
      log(b, analiseId, { tipo: "imagem", item, texto: `Imagem adicionada ao item ${item.slice(1).replaceAll("_", ".")}` });
      await b.commit();
    },
    async deleteImagem(analiseId, imgId, item) {
      const b = F.writeBatch(db);
      b.delete(F.doc(db, "imagens", imgId));
      log(b, analiseId, { tipo: "imagem", item, texto: `Imagem removida do item ${item.slice(1).replaceAll("_", ".")}` });
      await b.commit();
    },

    watchHistorico(analiseId, cb) {
      return F.onSnapshot(F.query(F.collection(db, "analises", analiseId, "historico"), F.orderBy("em", "desc"), F.limit(300)),
        s => cb(s.docs.map(d => d.data())), onErr);
    },

    async exportAll() {
      const [an, im, cfg] = await Promise.all([
        F.getDocs(F.collection(db, "analises")), F.getDocs(F.collection(db, "imagens")), F.getDoc(F.doc(db, "config", "segmentos"))
      ]);
      return {
        versao: 1, exportadoEm: now(), exportadoPor: user()?.nome,
        segmentos: cfg.exists() ? cfg.data().lista : SEGMENTOS_PADRAO,
        construtoras: cfg.exists() ? cfg.data().construtoras || null : null,
        analises: an.docs.map(d => ({ id: d.id, ...d.data() })),
        imagens: im.docs.map(d => ({ id: d.id, ...d.data() }))
      };
    },
    async importAll(data) {
      await F.setDoc(F.doc(db, "config", "segmentos"), { lista: data.segmentos, construtoras: data.construtoras || null });
      const an = data.analises || [];
      for (let i = 0; i < an.length; i += 50) {
        const b = F.writeBatch(db);
        an.slice(i, i + 50).forEach(({ id, ...r }) => b.set(F.doc(db, "analises", id), r));
        await b.commit();
      }
      for (const { id, ...r } of (data.imagens || [])) await F.setDoc(F.doc(db, "imagens", id), r); // uma a uma (imagens são grandes)
    }
  };
}

// ---------------------------------------------------------------------
//  LOCAL (localStorage) — para testes sem Firebase
// ---------------------------------------------------------------------
function localStore() {
  const K = "asbuilt-geo-local-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
  let db = Object.assign({ segmentos: null, analises: {}, imagens: {}, historico: {}, user: null }, load());
  const subs = new Set();
  const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) { alert("Armazenamento local cheio: " + e.message); } subs.forEach(f => f()); };
  const sub = f => { subs.add(f); f(); return () => subs.delete(f); };
  const now = () => new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const user = () => db.user ? { ...db.user, temNome: true } : null;
  const log = (aid, e) => { (db.historico[aid] ||= []).unshift({ ...e, usuario: db.user?.nome, em: now() }); };
  const clone = o => JSON.parse(JSON.stringify(o));
  let authCb = null;

  return {
    modo: "local",
    onAuth(cb) { authCb = cb; cb(user()); return () => {}; },
    async login(email) { db.user = { uid: "local", email, nome: email.split("@")[0] }; save(); authCb?.(user()); },
    async logout() { db.user = null; save(); authCb?.(null); },
    async resetSenha() {},
    async setNome(nome) { db.user.nome = nome; save(); authCb?.(user()); },
    user,
    watchSegmentos(cb) { return sub(() => cb(db.segmentos || SEGMENTOS_PADRAO, db.construtoras || null)); },
    async saveSegmentos(lista, construtoras) { db.segmentos = lista; db.construtoras = construtoras; save(); },
    watchAnalises(cb) { return sub(() => cb(Object.entries(db.analises).map(([id, a]) => ({ id, ...clone(a) })))); },
    watchAnalise(id, cb) { return sub(() => cb(db.analises[id] ? { id, ...clone(db.analises[id]) } : null)); },
    async createAnalise(data) {
      const id = uid();
      db.analises[id] = { ...clone(data), criadoPor: user()?.nome, criadoEm: now(), atualizadoPor: user()?.nome, atualizadoEm: now() };
      log(id, { tipo: "criacao", texto: `Análise criada (segmento ${data.segmento}, rev. ${data.revisao})` });
      save(); return id;
    },
    async updateHeader(id, patch, texto) { Object.assign(db.analises[id], patch, { atualizadoPor: user()?.nome, atualizadoEm: now() }); log(id, { tipo: "cabecalho", texto }); save(); },
    async updateItem(id, key, campo, valor, texto) {
      const a = db.analises[id]; a.itens[key] = { ...a.itens[key], [campo]: valor, por: user()?.nome, em: now() };
      a.atualizadoPor = user()?.nome; a.atualizadoEm = now(); log(id, { tipo: "item", item: key, texto }); save();
    },
    async updateItens(id, patches, texto) {
      const a = db.analises[id];
      for (const [k, p] of Object.entries(patches)) a.itens[k] = { ...a.itens[k], ...p, por: user()?.nome, em: now() };
      a.atualizadoPor = user()?.nome; a.atualizadoEm = now(); log(id, { tipo: "lote", texto }); save();
    },
    async deleteAnalise(id) {
      delete db.analises[id]; delete db.historico[id];
      for (const [k, v] of Object.entries(db.imagens)) if (v.analiseId === id) delete db.imagens[k];
      save();
    },
    watchImagens(aid, cb) { return sub(() => cb(Object.entries(db.imagens).filter(([, v]) => v.analiseId === aid).map(([id, v]) => ({ id, ...v })))); },
    async addImagem(aid, item, dataUrl, nome) { db.imagens[uid()] = { analiseId: aid, item, dataUrl, nome, autor: user()?.nome, em: now() }; log(aid, { tipo: "imagem", item, texto: `Imagem adicionada ao item ${item.slice(1).replaceAll("_", ".")}` }); save(); },
    async deleteImagem(aid, imgId, item) { delete db.imagens[imgId]; log(aid, { tipo: "imagem", item, texto: `Imagem removida do item ${item.slice(1).replaceAll("_", ".")}` }); save(); },
    watchHistorico(aid, cb) { return sub(() => cb(clone(db.historico[aid] || []))); },
    async exportAll() {
      return { versao: 1, exportadoEm: now(), exportadoPor: user()?.nome, segmentos: db.segmentos || SEGMENTOS_PADRAO, construtoras: db.construtoras || null,
        analises: Object.entries(db.analises).map(([id, a]) => ({ id, ...a })), imagens: Object.entries(db.imagens).map(([id, a]) => ({ id, ...a })) };
    },
    async importAll(data) {
      db.segmentos = data.segmentos; db.construtoras = data.construtoras || null;
      (data.analises || []).forEach(({ id, ...r }) => db.analises[id] = r);
      (data.imagens || []).forEach(({ id, ...r }) => db.imagens[id] = r);
      save();
    }
  };
}
