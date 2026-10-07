// =====================================================================
//  CONFIGURAÇÃO DO SITE
// =====================================================================

// 1) Cole aqui a configuração do seu projeto Firebase
//    (Console Firebase > Configurações do projeto > Seus apps > Web).
//    Enquanto "apiKey" estiver vazio, o site roda em MODO LOCAL
//    (os dados ficam só no navegador, útil para testar).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAztVUmt644vUHdKhR0sAVe6_AnI90h-Hc",
  authDomain: "as-built---fico.firebaseapp.com",
  projectId: "as-built---fico",
  storageBucket: "as-built---fico.firebasestorage.app",
  messagingSenderId: "300632530171",
  appId: "1:300632530171:web:0ae16b261232706710e45e"
};

// 2) Identificação do painel
export const APP_INFO = {
  titulo: "Análise As Built — Geometria",
  subtitulo: "FICO • Lote 01 • Checklist de análise de documentos",
  disciplina: "Geometria"
};

// 3) Lista inicial de segmentos e pacotes.
//    Pode ser alterada depois pelo próprio site (aba Configurações).
export const SEGMENTOS_PADRAO = [
  { codigo: "Alça", pacotes: ["PCT 1"] },
  { codigo: "1.1",  pacotes: ["PCT 1"] },
  { codigo: "1.2",  pacotes: ["PCT 1"] },
  { codigo: "1.3",  pacotes: ["PCT 1"] },
  { codigo: "1.4A", pacotes: ["PCT 1"] },
  { codigo: "1.4B", pacotes: ["PCT 2"] },
  { codigo: "1.5",  pacotes: ["PCT 2"] },
  { codigo: "1.6",  pacotes: ["PCT 2"] },
  { codigo: "1.7",  pacotes: ["PCT 3"] },
  { codigo: "1.8",  pacotes: ["PCT 3"] },
  { codigo: "2.1",  pacotes: ["PCT 3"] },
  { codigo: "2.2A", pacotes: ["PCT 3"] },
  { codigo: "2.2B", pacotes: ["PCT 4"] },
  { codigo: "2.3",  pacotes: ["PCT 4"] },
  { codigo: "2.4",  pacotes: ["PCT 5"] },
  { codigo: "2.5",  pacotes: ["PCT 5"] },
  { codigo: "3.1",  pacotes: ["PCT 5"] },
  { codigo: "3.2",  pacotes: ["PCT 6"] },
  { codigo: "3.3",  pacotes: ["PCT 6"] },
  { codigo: "3A.1", pacotes: ["PCT 7"] },
  { codigo: "3A.2", pacotes: ["PCT 7"] },
  { codigo: "4.1",  pacotes: ["PCT 8"] },
  { codigo: "4.2",  pacotes: ["PCT 8"] },
  { codigo: "4.3",  pacotes: ["PCT 8"] },
  { codigo: "4.4",  pacotes: ["PCT 8"] }
];

// 4) Construtora responsável por cada pacote (editável na aba Configurações)
export const CONSTRUTORA_POR_PACOTE = {
  "PCT 1": "EMPA",
  "PCT 2": "ATERPA",
  "PCT 3": "ÁPIA",
  "PCT 4": "ÁPIA",
  "PCT 5": "ÁPIA",
  "PCT 6": "R&D",
  "PCT 7": "ATERPA",
  "PCT 8": "ATERPA"
};

// 5) Cores e logos das construtoras (usadas nos gráficos e etiquetas)
export const CONSTRUTORAS = {
  "EMPA":   { cor: "#ffde00", logo: "assets/logo-empa.png" },
  "ATERPA": { cor: "#cf2235", logo: "assets/logo-aterpa.png" },
  "ÁPIA":   { cor: "#003966", logo: "assets/logo-apia.png" },
  "R&D":    { cor: "#20a464", logo: "" }
};

// Pacotes antigos que foram unificados (convertidos automaticamente)
export const PACOTES_UNIFICADOS = { "PCT 1A": "PCT 1", "PCT 1B": "PCT 1" };
