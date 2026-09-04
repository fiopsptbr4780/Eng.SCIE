# Engenharia & SCIE — Portfólio e Ferramentas

![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-181717?style=flat&logo=github)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🌐 Site Publicado
👉 [https://fiopsptbr4780.github.io/Eng.SCIE/](https://fiopsptbr4780.github.io/Eng.SCIE/)

## Sobre Este Projeto
Site profissional de consultoria em Engenharia Mecânica e Segurança Contra Incêndio em Edifícios (SCIE), desenvolvido com HTML5, CSS3 e JavaScript puro, alojado via GitHub Pages.

Destina-se a projetistas, escritórios de projeto, empresas de construção e promotores imobiliários que necessitam de consultoria especializada conforme RT-SCIE e Regime Jurídico vigente.

## Estrutura do Repositório

| Ficheiro | Descrição |
|----------|-----------|
| `index.html` | Página principal — serviços, sobre, processo e contacto |
| `projetos.html` | Estudos de caso e experiência aplicada em SCIE |
| `blog.html` | Artigos técnicos sobre SCIE, sprinklers, SADI, piping |
| `ferramentas.html` | Calculadoras online (sprinklers, queda pressão, RT-SCIE, extintores) |
| `calculadora-rtscie.html` | Calculadora avançada RT-SCIE (efetivo, saídas, UPs) |
| `faq.html` | Perguntas frequentes sobre regulamentação e processos |
| `privacidade.html` | Política de privacidade conforme RGPD |
| `404.html` | Página de erro 404 personalizada |
| `portfolio_engenharia_scie.html` | Página legacy (noindex) — redireciona para `index.html` |
| `favicon.svg` | Ícone SVG do site |
| `sitemap.xml` | Mapa do site para motores de busca |
| `robots.txt` | Diretivas para crawlers (com `Disallow` para legacy) |

## Melhorias Recentes (set. 2026)

### SEO
- `canonical` em todas as páginas públicas
- Open Graph + Twitter Card meta tags
- `og-image.png` referenciado (criar imagem 1200×630 e colocar em `/`)
- `sitemap.xml` atualizado com `calculadora-rtscie.html` e datas corretas
- `robots.txt` com `Disallow: /portfolio_engenharia_scie.html` para evitar canibalização
- `lang="pt-PT"` em todas as páginas
- Página 404 personalizada

### Acessibilidade (WCAG 2.1)
- Skip-to-content link em todas as páginas
- Foco visível (`:focus-visible`) com outline de 3px accent
- `<main id="main-content" tabindex="-1">` para gestão de foco
- Labels reais no formulário de contacto (não apenas `placeholder`/`aria-label`)
- Estrutura semântica: `<ul>` em tags de projetos

### RGPD / Privacidade
- Banner de consentimento de cookies (apenas essenciais) no `index.html`
- Aceitação persistente em `localStorage`

## Serviços Abordados
- Projeto de Especialidade SCIE (RT-SCIE / Portaria 1532/2008)
- Sistemas de Sprinklers (EN 12845 / NFPA 13)
- Sistemas de Espuma (NFPA 11 / EN 13565)
- SADI — Deteção e Alarme (EN 54 / NP 4428)
- Piping Industrial (AutoCAD Plant 3D / P&ID / ASME B31.1)
- Consultoria Técnica e Pareceres

## Normas Referenciadas
| Norma / Diploma | Âmbito |
|-----------------|--------|
| DL 220/2008 | Regime Jurídico da SCIE (na redação atual) |
| Portaria 1532/2008 | Regulamento Técnico de SCIE (RT-SCIE) |
| EN 12845 | Sistemas fixos de sprinklers |
| EN 54 / NP 4428 | Sistemas de deteção e alarme |
| NFPA 13 | Standard for Sprinkler Systems |
| NFPA 11 | Standard for Low-, Medium-, High-Expansion Foam |
| EN 13565 | Sistemas de extinção por espuma |

## Tecnologias
- HTML5 semântico
- CSS3 (Custom Properties, Flexbox, Grid)
- JavaScript vanilla
- GitHub Pages
- FormSubmit (formulário de contacto)
- Schema.org JSON-LD (ProfessionalService, Organization, FAQPage, ItemList)

## Como Adicionar uma Nova Página
1. Copiar a estrutura `<head>` de `index.html` (canonical, OG, favicon, skip-link)
2. Usar `<main id="main-content" tabindex="-1">` à volta do conteúdo
4. Inserir cookie banner apenas em `index.html` (ou replicar nas páginas com formulários)
5. Adicionar entrada no `sitemap.xml`

## Pendente / Próximas Fases
- [ ] Criar `og-image.png` (1200×630 px) com branding do site
- [ ] Criar `favicon-32.png` e `apple-touch-icon.png` (alternativas ao SVG)
- [ ] **Fase B**: centralizar CSS e JS em `assets/style.css` e `assets/main.js`
- [ ] Adicionar imagens reais nos cards (substituir emojis grandes)
- [ ] Google Analytics 4 (após consentimento do cookie banner)
- [ ] Página dedicada "Sobre"

## Autor
Engenheiro Mecânico e Técnico Especialista em SCIE reconhecido pela ANEPC. Membro da Ordem dos Engenheiros. Baseado em Aveiro, Portugal.

## Licença
MIT License — © 2026 Engenharia & SCIE
