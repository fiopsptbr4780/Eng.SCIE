# Modernização da Secção "Serviços Especializados"

A secção **Serviços Especializados** no ficheiro [`index.html`](file:///C:/Users/Fiops/GitHub/Eng.SCIE/index.html) foi completamente modernizada com foco em design industrial de engenharia, acessibilidade e desempenho nativo de animação.

---

## 1. Ícones SVG Minimalistas (Engenharia Mecânica & SCIE)

Os emojis genéricos foram substituídos por ícones vetoriais SVG minimalistas desenhados sob uma grelha de `24x24`, espessura de traço consistente (`stroke-width: 2`), cantos arredondados e inseridos dentro de contentores estilizados (`.service-icon-box`):

| Serviço | Conceito do Ícone SVG | Elementos de Engenharia |
| :--- | :--- | :--- |
| **Projeto de Especialidade SCIE** | Escudo de segurança contra incêndio e chama técnica | Proteção passiva/ativa e conformidade RT-SCIE |
| **Sistemas de Sprinklers** | Cabeça de aspersor (*sprinkler head*) com defletor e leque de água | Conexão roscada, ampola térmica e padrão de descarga EN 12845 |
| **Sistemas de Espuma** | Reservatório pressurizado com manómetro de pressão e bocal | Sistema de agente extintor e bocal de aplicação NFPA 11 |
| **SADI — Deteção de Incêndio** | Detetor de teto pontual ótico/térmico com pulsos de sinal | Câmara de amostragem de fumo e sinalização EN 54 |
| **Piping Industrial** | Junção em T de tubagem flangeada com volante de válvula | Tubagens industriais, flanges e isométricos P&ID |
| **Consultoria Técnica** | Prancheta técnica de verificação e aprovação de projeto | Validação regulamentar, conformidade ANEPC e revisão |

---

## 2. Melhorias Visuais e Interatividade nos Cartões

- **Acabamento visual**: Cantos arredondados (`16px`), bordas suaves em `#e2e8f0`, fundo limpo e elevação com sombras calculadas.
- **Barra de acento dinâmica**: Destaque linear gradiente no topo do cartão (`--accent` a `#ff8447`) revelado suavemente no estado `:hover`.
- **Micro-interações no ícone**: Ao passar o cursor, a caixa do ícone ganha fundo vibrante gradiente, roda ligeiramente (`rotate(-2deg)`) e projeta uma sombra alaranjada suave.
- **Etiquetas técnicas**: Otimizadas com visual de *pills* modernos que também reagem ao hover.

---

## 3. Animação de Entrada ao Fazer Scroll (Scroll-Driven Animations)

Em conformidade com as melhores práticas de desenvolvimento web moderno:

1. **CSS Scroll-Driven Animations nativo**:
   - Utiliza a propriedade `animation-timeline: view()` e `animation-range: entry 10% cover 32%`.
   - Execução direta na *compositor thread* do browser, sem *layout thrashing* ou impacto no consumo de CPU.
2. **Fallback Progressivo**:
   - Para browsers que ainda não suportem a especificação nativa completa, um `IntersectionObserver` leve ativa a classe `.is-visible` com desfasamento escalonado (`staggered delay`).
3. **Acessibilidade e A11y**:
   - Compatível com a preferência do utilizador via `@media (prefers-reduced-motion: no-preference)`.

---

## 4. Vídeo Demonstrativo do Resultado

O teste foi executado e gravado no browser Microsoft Edge (Chromium) a 30 FPS em resolução HD:

- 🎬 **Ficheiro de Vídeo gerado**: [`resultado_servicos.mp4`](file:///C:/Users/Fiops/GitHub/Eng.SCIE/resultado_servicos.mp4)
- Localização local no projeto: `C:\Users\Fiops\GitHub\Eng.SCIE\resultado_servicos.mp4`
