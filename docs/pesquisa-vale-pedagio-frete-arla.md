# Pesquisa: vale-pedágio, frete bruto e ARLA 32

Data: 13/11/2026. Pedido do dono: descobrir quem paga o vale-pedágio (às vezes o dono do caminhão, às vezes a transportadora), o que é o frete bruto e como o ARLA 32 entra na conta.

**Como ler.** Cada afirmação tem um nível de confiança:
- **Oficial:** li o texto no site da ANTT (gov.br).
- **Setor:** blogs, notícias e artigos. Servem de pista, não de prova.
- **Não achei:** procurei e não encontrei fonte.

Isto é informação para o app, **não é aconselhamento jurídico nem contábil**. Para cobrar de alguém ou decidir sobre impostos, confirme com um advogado ou com o contador.

## Resumo em três respostas

1. **Vale-pedágio:** pela regra da ANTT, quem paga é o **contratante**, e isso inclui a transportadora que subcontrata o dono do caminhão. O dono só deveria pagar o pedágio dos trechos **vazios** (se o contrato não obrigar o contrário), em carga **fracionada** ou em **carga própria**. Quando o dono paga o pedágio de uma viagem carregada, o contratante está descumprindo a regra.
2. **Frete bruto:** é o valor total do frete, antes dos descontos. O vale-pedágio **não faz parte** dele. Os 80%/20% e a base da comissão **não são definidos por lei**: dependem do contrato.
3. **ARLA 32:** a ANTT usa **5% do consumo de diesel** na sua metodologia. Se o caminhão for Euro 5 (a partir de 2012), ele usa ARLA. O melhor número é o que o próprio caminhão gasta.

## 1. Vale-pedágio

### O que a regra diz (oficial)

Fonte: [Perguntas frequentes do VPO, ANTT](https://www.gov.br/antt/pt-br/assuntos/cargas/vale-pedagio-obrigatorio/perguntas-frequentes-vpo), atualizada em 30/06/2026. Lei 10.209/2001, regulamentada pela Resolução ANTT 6.024/2023.

| Ponto | O que a ANTT diz |
|---|---|
| O que é | O contratante deve **antecipar ao transportador** o valor do pedágio de toda a rota (todas as praças, pela categoria do veículo) |
| Quem é o contratante | O proprietário da carga, quando paga o frete, **ou a empresa que subcontratar** o transporte |
| Faz parte do frete? | **Não.** O valor do vale-pedágio não integra o frete, não é receita nem rendimento tributável, e não é base de contribuição (art. 2º da lei) |
| Em dinheiro? | **Não pode.** Só pelos modelos habilitados pela ANTT. Desde 31/12/2024, os cartões e cupons físicos foram trocados por modelos automáticos |
| Dá para dispensar por acordo? | **Não.** A regra é de ordem pública. Cláusula que dispensa o vale não vale para fins da ANTT |
| Multa | **R$ 3.000 por veículo e por viagem** para o contratante que não disponibilizar o vale até o momento do embarque (art. 23 da Resolução 6.024/2023) |
| Registro | O vale deve constar no MDF-e (campo IDVPO) |

### Quando o vale NÃO é obrigatório (oficial)

1. **Veículo vazio**, desde que não haja contrato que o obrigue a circular vazio no retorno ou na ida ao ponto de carga ou descarga.
2. **Carga fracionada** (mais de um embarcador).
3. **Transporte internacional** feito por empresa habilitada, com veículo da própria frota autorizada.
4. **Carga própria**, em veículo ou frota própria.

### Então, por que às vezes o dono paga?

| Situação | Quem deveria pagar | Confiança |
|---|---|---|
| Viagem **carregada**, frete contratado por transportadora ou dono da carga | **O contratante**, antes do embarque | Oficial |
| **Ida vazia até a coleta** ou **volta vazia** | Em regra **o dono do caminhão**, a menos que o contrato obrigue a circular vazio | Oficial |
| **Carga fracionada** | O pedágio é rateado e vem dentro do preço do frete | Oficial |
| Contratante **não deu** o vale | Continua sendo dele. Descumprir gera multa de R$ 3.000 por viagem | Oficial (multa). Direito do dono de cobrar: **setor** |
| Contratante **desconta** o pedágio do frete, ou "embute" no valor combinado | Não pode. O vale não integra o frete. Um artigo de 2026 diz que o STJ entende que nem com a concordância das partes | Oficial (não integra o frete). STJ: **setor** |
| O dono paga e depois pede **reembolso** | A regra é a antecipação, não o reembolso | Oficial |

### O que não consegui confirmar

- **"Indenização de duas vezes o valor do frete"** (art. 8º da lei). Aparece em vários blogs. Não consegui ler o texto da lei no site do Planalto (o servidor deles não respondeu). A jurisprudência pode reduzir esse valor (STJ, 2016, segundo a ConJur).
- **O acórdão do STJ sobre o trecho de volta** (3ª Turma, ministra Nancy Andrighi), contado pela [ConJur](https://www.conjur.com.br/2023-abr-16/obrigacao-vale-pedagio-trecho-volta-depende-contrato//?print=1). Bate com o que a ANTT diz sobre veículo vazio, mas eu não li a decisão.

### O que isso muda no app

- **Hoje** o app tem uma única opção "Quem paga o pedágio?", que vale para a viagem toda. A pesquisa mostra que o pedágio da **ida carregada** e o dos **trechos vazios** costumam ter pagadores diferentes.
- **Proposta:** separar em dois campos, "Pedágio da viagem carregada" e "Pedágio dos trechos vazios", cada um com a sua opção de quem paga. Sugestão de padrão: carregada, pelo contratante (vale-pedágio); vazios, por você. O dono pode mudar.
- **Aviso útil** quando o dono marcar que paga a viagem carregada: "Pela regra da ANTT, o contratante deve disponibilizar o vale-pedágio até o embarque. Se você vai pagar, o frete precisa cobrir esse valor e vale guardar os comprovantes."

## 2. Frete bruto

### O que é

É o **valor total contratado do frete**, antes dos descontos e retenções. No app, é o valor do frete (ou tarifa × peso carregado).

### O que não faz parte dele

| Item | Fica fora? | Confiança |
|---|---|---|
| Vale-pedágio | Sim. Não integra o frete | Oficial |
| Lucro, impostos, despesas administrativas e taxas | Ficam **fora do piso mínimo** e são negociados livremente | Oficial ([ANTT, pergunta 7.7](https://www.gov.br/antt/pt-br/assuntos/cargas/politica-nacional-de-pisos-minimos-de-frete/perguntas-frequentes-pmf/7-metodologia-de-calculo-2014-custos-fixos-variaveis-insumos-de-referencia-e-itens-nao-previstos/7-7-o-piso-minimo-de)) |
| Pedágio e tributos | A tabela do piso de 2018 não os incluía | Oficial (relatório da ESALQ para a ANTT) |

Consequência para comparar com o piso: **frete e piso estão na mesma base**, sem pedágio. Comparar o frete combinado com o piso é justo mesmo quando o vale-pedágio vem à parte.

### Descontos e retenções (confiança: setor)

Para o **autônomo (TAC)** contratado por empresa, os blogs e fóruns contábeis descrevem retenções calculadas sobre o **frete bruto**:

- INSS: 11% sobre uma base de **20%** do frete bruto.
- SEST/SENAT: 2,5% sobre a mesma base de 20%.
- Imposto de renda: base de 10% do rendimento bruto e tabela progressiva; um fórum diz que raramente é retido.

**Exemplo com R$ 10.060:** base de 20% = R$ 2.012,00. INSS: R$ 221,32. SEST/SENAT: R$ 50,30. Total: **R$ 271,62, cerca de 2,7% do frete**.

Atenção: as fontes são antigas (2009 a 2018), o INSS tem teto, e eu **não sei o perfil fiscal do dono** (autônomo, MEI ou empresa). Por isso o app **não calcula** esses valores. O campo "Descontos já combinados" serve para o dono lançar o que o demonstrativo da transportadora realmente retirar.

### 80% no início e 20% na descarga (confiança: não achei)

- Não encontrei **nenhuma regra** que defina esses percentuais. É prática do contrato.
- Aparecem outros percentuais: 70% de adiantamento em um exemplo de transportadora da Fretebras, e uma proposta de adiantamento mínimo de 70% que não consegui confirmar como regra vigente.
- Os blogs dizem que o pagamento do frete do autônomo é eletrônico e que o CIOT registra valor total, adiantamento, saldo e vale-pedágio **em campos separados**. Isso combina com o app: frete bruto, adiantamento, saldo e vale-pedágio são coisas distintas.
- **Em que base são os 80%?** Não achei. O mais provável é o frete total (bruto). Fica a confirmar num demonstrativo real.

### Comissão do motorista: base bruta ou líquida (confiança: não achei)

Não existe parâmetro legal. Nas decisões trabalhistas que encontrei, a comissão aparece calculada sobre o valor do frete ou da carga, mas isso depende do contrato. **Quem define é o dono.** O app já deixa escolher a base (bruto ou líquido de descontos).

## 3. ARLA 32

### O caminhão usa ARLA?

- O ARLA 32 faz parte do sistema de pós-tratamento (SCR) dos motores **Euro 5**, que no Brasil correspondem à fase P7 do Proconve. A Mercedes chama o sistema de BlueTec 5. A data de **2012** para o início dessa fase é do meu conhecimento geral, não de uma fonte que li: confira no manual do caminhão.
- A lista de preços da FIPE tem o **Actros 2646 LS 6x4 na versão "(E5)"**. Então, **se o caminhão do Rogério for de 2012 em diante, ele usa ARLA**. Se for mais antigo, não.
- Como conferir sem papel: olhar se o painel tem **marcador de nível de ARLA** e se existe um segundo bocal de abastecimento, em geral com tampa azul (isso também é de conhecimento geral, não de fonte).

### Quanto ele gasta (confiança por fonte)

| Fonte | Número | Confiança |
|---|---|---|
| **ANTT / ESALQ-LOG** (metodologia do piso, 2019) | **5% do consumo de diesel**. Parâmetro obtido com empresas e questionários, e conferido em sites especializados | **Oficial** |
| Guia de 2025 a 2026 | 3% a 5% para motores P7. Para P8 (Euro 6), varia por fabricante | Setor |
| Volvo, no lançamento do P7 | Cerca de 4% a 5% do diesel | Setor |
| Artigo técnico | 5% a 7% | Setor |
| **Mercedes, para o Actros 2646** | **Não achei número oficial** | Não achei |

O mesmo relatório da ANTT usou **R$ 2,40 por litro** como preço de referência do ARLA (levantamento de 2019: mínimo R$ 1,25, média R$ 3,01, máximo R$ 5,00). É dado **antigo**, serve só para ordem de grandeza.

### Cuidado

Levantamentos de 2016 a 2017 apontaram que o consumo real de ARLA ficou **muito abaixo** do necessário (45%, em uma notícia do SETCESP), e atribuíram isso a adulteração do sistema. Por isso, **não use um consumo "baixo" como base do cálculo**. Use o que o caminhão gasta de verdade, medido.

### O que isso muda no app

- **Quanto pesa:** no exemplo de R$ 10.060, o ARLA é cerca de R$ 59,50, ou **0,6 ponto de margem**. É pequeno.
- **Proposta:** manter o ARLA no modo detalhado, e no comentário do campo dizer "a ANTT usa 5% do diesel como referência. O melhor valor é o do seu caminhão: some os litros de ARLA e divida pelos litros de diesel de um mesmo período".
- **No futuro**, quando o app registrar abastecimentos, ele pode calcular esse percentual sozinho.

## 4. O que ficou certo e o que ficou incerto

| Pergunta | Resposta | Confiança |
|---|---|---|
| Quem paga o vale-pedágio da viagem carregada? | O contratante, antes do embarque | Oficial |
| E dos trechos vazios? | Em regra o dono, salvo contrato que obrigue o veículo a circular vazio | Oficial |
| O vale entra no frete bruto? | Não | Oficial |
| Multa do contratante que não dá o vale | R$ 3.000 por veículo e viagem | Oficial |
| O dono pode cobrar do contratante o que pagou? | Pode ter direito. Indenização de 2× o frete é citada por blogs | Setor (confirmar com advogado) |
| Em que base são os 80/20? | Não sei | Não achei |
| A comissão é sobre bruto ou líquido? | Depende do contrato | Não achei |
| Quais retenções incidem sobre o frete? | INSS e SEST/SENAT sobre 20% do bruto, para autônomo | Setor (confirmar com contador) |
| O caminhão usa ARLA? | Se for de 2012 em diante, sim | Setor + FIPE |
| Quanto de ARLA? | Cerca de 5% do diesel | Oficial (ANTT) |

## 5. Perguntas para o dono

1. **Em que ano é o caminhão?** (ou o painel tem marcador de ARLA?)
2. **Quando o dono paga pedágio de viagem carregada, o contratante reembolsa depois?** Isso é diferente de antecipar o vale.
3. **Os 80% são sobre o frete total?**
4. **O demonstrativo da transportadora traz INSS e SEST/SENAT?** Qual o perfil fiscal do dono (autônomo, MEI, empresa)?
5. **O contrato obriga o caminhão a circular vazio na ida à coleta ou na volta?**

## Fontes

Oficiais:
- [Perguntas frequentes do Vale-Pedágio Obrigatório, ANTT](https://www.gov.br/antt/pt-br/assuntos/cargas/vale-pedagio-obrigatorio/perguntas-frequentes-vpo)
- [7.1. Como é estruturada a metodologia do piso mínimo, ANTT](https://www.gov.br/antt/pt-br/assuntos/cargas/politica-nacional-de-pisos-minimos-de-frete/perguntas-frequentes-pmf/7-metodologia-de-calculo-2014-custos-fixos-variaveis-insumos-de-referencia-e-itens-nao-previstos/7-1-como-e-estruturada-a)
- [7.7. O piso contempla todos os custos?, ANTT](https://www.gov.br/antt/pt-br/assuntos/cargas/politica-nacional-de-pisos-minimos-de-frete/perguntas-frequentes-pmf/7-metodologia-de-calculo-2014-custos-fixos-variaveis-insumos-de-referencia-e-itens-nao-previstos/7-7-o-piso-minimo-de)
- [Relatório técnico 2, ESALQ-LOG/USP para a ANTT (seção 2.2.2, custo de ARLA)](https://www.gov.br/antt/pt-br/assuntos/cargas/arquivos/arquivos-politica-nacional-de-pisos-minimos-de-frete/arquivos-etapas-de-implementacao-da-pnpm-trc/relatorio-tecnico-2-fealq-esalq-log-usp.pdf)

Do setor (usar como pista):
- [Vale-pedágio obrigatório 2026, Contmatic](https://simplifique.contmatic.com.br/blogs/vale-pedagio-obrigatorio-saiba-agora-como-funciona)
- [Vale-pedágio: quem paga e como provar, Brudam](https://brudam.com.br/vale-pedagio-obrigatorio/)
- [Vale-pedágio obrigatório: quem paga e o que diz a lei, Zapay](https://blog.usezapay.com.br/transito/vale-pedagio-obrigatorio)
- [Obrigação do vale-pedágio no trecho de volta depende do contrato, ConJur](https://www.conjur.com.br/2023-abr-16/obrigacao-vale-pedagio-trecho-volta-depende-contrato//?print=1)
- [Impactos jurídicos do vale-pedágio, Mundo Logística](https://mundologistica.com.br/artigos/implicacoes-juridicas-de-compra-antecipada-de-vale-pedagios)
- [CIOT e pagamento eletrônico de frete, Bsoft](https://www.bsoft.com.br/blog/ciot-e-pagamento-eletronico-de-frete)
- [Retenção de INSS do transportador autônomo, Foco Tributário](https://focotributario.com.br/retencao-do-inss-do-transportador-autonomo-base-de-calculo-e-aliquotas)
- [Consumo de ARLA 32 está 45% abaixo do estimado, SETCESP](https://setcesp.org.br/noticias/consumo-de-arla-32-esta-45-abaixo-do-estimado-e-preocupa-mercado/)
- [ARLA 32: o que é e para que serve, Contmatic](https://simplifique.contmatic.com.br/blogs/arla-32-o-que-e-para-que-serve)
- [Actros 2646 LS 6x4 (E5), lista FIPE](https://magodoscarros.com/fipe/caminhoes/mercedes-benz/actros-2646-ls-6x4-2p-diesel-e5)
