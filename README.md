# Análise As Built — Geometria (FICO • Lote 01)

Site para a equipe de As Built analisar os documentos de Geometria por segmento, usando o checklist da planilha
**ANÁLISE DE DOCUMENTOS - AS BUILT - GEOMETRIA.xlsx** (71 itens em 12 disciplinas).

- **Dashboard**: avanço por segmento, por disciplina do checklist e por pacote, distribuição dos itens e matriz de avanço (exporta XLSX).
- **Segmentos / Análises**: cards por pacote; clique no segmento para abrir o checklist (ou criar a primeira análise).
- **Checklist**: cabeçalho (documento, revisão, empresa, analista, data), Responsável / Status Elaboração / Status Análise / Observações por item, imagens por item (anexar, arrastar ou **Ctrl+V** para colar print), ações em lote por seção, filtros (aguardando, reprovados, com observação), histórico de alterações, revisões (RV0, RV1…) e exportação XLSX no layout da planilha.
- **Configurações e backup**: lista de segmentos/pacotes e construtora de cada pacote (PCT 1 EMPA · PCT 2 ATERPA · PCT 3-5 ÁPIA · PCT 6 R&D · PCT 7-8 ATERPA), editável, backup completo (.json), exportação de todas as análises (.xlsx) e restauração.

Cálculos iguais aos da planilha:
- **Elaboração** = (Concluído + 0,5 × Em andamento) ÷ nº de itens
- **Análise** = (Aprovado + Não se Aplica) ÷ nº de itens
- O dashboard usa sempre a **revisão vigente** (a mais recente) de cada segmento.

---

## 1. Criar o banco de dados (Firebase — gratuito)

1. Acesse <https://console.firebase.google.com> com uma conta Google e clique em **Adicionar projeto** (ex.: `asbuilt-fico`). O Google Analytics pode ficar desativado.
2. **Firestore Database** → *Criar banco de dados* → modo **produção** → local `southamerica-east1 (São Paulo)`.
3. Na aba **Regras** do Firestore, apague o conteúdo e cole o arquivo [`firestore.rules`](firestore.rules) deste repositório → **Publicar**.
4. **Authentication** → *Vamos começar* → **E-mail/senha** → Ativar → Salvar.
5. Ainda em Authentication → **Usuários** → *Adicionar usuário*: cadastre o e-mail e uma senha inicial para cada membro da equipe.
   (Cada pessoa pode trocar a senha pelo link "Esqueci minha senha" na tela de login.)
6. **Configurações do projeto** (engrenagem) → *Seus apps* → ícone **Web `</>`** → registre o app (sem Hosting).
   Copie o objeto `firebaseConfig` exibido.
7. Abra `js/config.js` e cole os valores em `FIREBASE_CONFIG` (apiKey, authDomain, projectId…).

> A `apiKey` do Firebase não é secreta — quem protege os dados são as regras + login. Só usuários cadastrados no passo 5 leem e gravam.

## 2. Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser privado se sua conta/organização permitir Pages privado; senão público — os dados continuam protegidos pelo login).
2. Envie todos os arquivos desta pasta para a raiz do repositório (pelo site: *Add file → Upload files*, arrastando a pasta inteira).
3. **Settings → Pages** → *Source*: `Deploy from a branch` → Branch `main` / pasta `/ (root)` → Save.
4. Em ~1 minuto o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.
5. No Firebase → **Authentication → Configurações → Domínios autorizados** → adicione `SEU-USUARIO.github.io`.

## 3. Uso no dia a dia

- Cada alteração é salva na hora e aparece em tempo real para todos que estiverem com o site aberto.
- Cada item mostra quem alterou por último e quando; o botão **Histórico** mostra todas as alterações da análise.
- Sem internet o site continua funcionando com a cópia local e envia as alterações ao reconectar ("Offline — alterações serão enviadas…").
- **Nova revisão**: copia status e observações da revisão anterior (opcionalmente reabrindo os itens reprovados) e passa a ser a revisão vigente no dashboard. As revisões antigas ficam acessíveis pelas abas no topo do checklist.

## 4. Backup

- Os dados ficam no Firestore (Google Cloud), com redundância própria.
- Em **Configurações e backup → Baixar backup completo (.json)** gera uma cópia com todas as análises, imagens e a lista de segmentos. Recomendado semanalmente (guardar na pasta do contrato).
- **Restaurar backup** grava de volta o conteúdo do .json (substitui registros com o mesmo ID).

## 5. Modo local (teste)

Com `apiKey` vazio em `js/config.js`, o site roda em **modo local**: os dados ficam só no navegador, sem senha. Serve para testar antes de configurar o Firebase.
Para abrir localmente use um servidor (módulos JS não funcionam via `file://`), por exemplo: `python -m http.server` na pasta e acesse `http://localhost:8000`.

## Estrutura

```
index.html               página única
css/style.css            visual (mesmo padrão do Painel de Avanço As Built)
js/config.js             Firebase, segmentos/pacotes padrão e cores
js/checklist-template.js checklist gerado da planilha (71 itens)
js/store.js              camada de dados (Firebase ou local)
js/app.js                dashboard, segmentos, checklist, exportações
js/vendor/               Chart.js, datalabels e SheetJS (xlsx-js-style)
firestore.rules          regras de segurança do Firestore
```

Limites do plano gratuito (Spark): 1 GiB de dados, 50 mil leituras e 20 mil gravações por dia — folgado para a equipe.
As imagens são comprimidas (máx. ~700 KB cada) e gravadas no próprio Firestore.
