# Análise de mercado e variáveis do cálculo de frete

Data: 12/11/2026. Objetivo: saber se as contas do "Analisar frete" estão certas, se falta alguma variável e o que podemos ter que os outros não têm.

**Limites desta análise.** Li as descrições públicas dos apps e sites (lojas de aplicativos, notícias, blogs, textos técnicos). Não instalei nem testei nenhum deles, e não conferi as normas da ANTT nem a lei no texto oficial. Onde a fonte é um blog comercial, está dito. Valores de tarifa e coeficientes não foram copiados para o código, porque mudam.

## 1. O que o repositório "Relatorio-Caminhao" mostra que você quer

É um protótipo da **jornada inteira do frete**, não só da conta:

1. Simular a oferta ("Esse frete compensa?").
2. Aceitar e registrar a saída do caminhão com o **odômetro** inicial.
3. Carregamento, com o peso real.
4. Estrada: cada gasto lançado na viagem certa, dizendo quem pagou (dono ou motorista, para reembolso).
5. Entrega, com odômetro final e peso entregue.
6. Fechamento: descontos do demonstrativo da transportadora (cada um como "custo definitivo" ou "a conciliar com o contador"), depósitos recebidos, saldo do frete.
7. Acerto do motorista: comissão + reembolsos − adiantamentos − pagamentos.
8. Dois perfis: o **dono** vê tudo e aprova; o **motorista** vê só a viagem dele, lança gastos e informa peso e odômetro, e o dono confere.

Ponto importante: a "rota que o caminhão fez" é registrada **pelo odômetro e pelos marcos da viagem**, e não por GPS. Isso evita o limite do navegador no celular (GPS não grava de forma confiável com a tela apagada).

## 2. Quem já faz algo parecido

| Referência | O que a descrição pública diz que faz | Observação |
|---|---|---|
| WikiRota (app, mais de 500 mil downloads) | Rota com até 40 pontos, pedágios no mapa com valor, combustível, otimização de abastecimento, postos, ida e volta, custo extra e custo por km do veículo, Frete Mínimo ANTT para caminhão | É planejador de rota e custo. Não fala em registrar a viagem feita nem em financeiro. Cobre pedágio do Brasil, que nós não temos |
| Calculadora de custos da Fretebras | Valor do caminhão, viagens por mês e distância, para estimar custo total | Coberturas de 2021 a 2022 a descrevem como piloto; não confirmei se continua igual |
| Cálculo de Frete Autônomo | Diz se o frete compensa; preço por tonelada, por viagem e por km, com demonstrativo de custos | Gratuito, segundo a fonte |
| MEU BRUTO | Lucro ou prejuízo da oferta, pedágio por eixo (inclusive o retorno vazio) e desgaste de pneu por km | Só na App Store; sem avaliações ainda |
| Frete PRO | Valor por km e por tonelada, custos operacionais e despesas anuais | Fonte é página de venda |
| infraBR (governo) | Calculadora de frete pela resolução vigente da ANTT, jornada, consumo | Oficial |
| Calculadoras do piso ANTT (Bsoft, Transp.net e outras) | Piso = distância × CCD + CC | Sites privados; a calculadora oficial da ANTT é a referência |
| TCC da UnB (2023) | App para controlar viagens, gastos e receitas, com indicadores por tipo de carga e mês | Referência de requisitos |

**O que ninguém parece juntar numa coisa só:** decidir *antes* de aceitar, registrar a viagem real e depois comparar o previsto com o que realmente aconteceu.

## 3. Variáveis: o que a literatura e os apps usam, e como estamos

| Variável | Quem usa | Nosso app antes | Agora |
|---|---|---|---|
| Frete por tonelada ou fechado | Todos | Sim | Sim |
| Km vazio e carregado, com consumo diferente em cada um | Literatura técnica; poucos apps | Sim | Sim |
| Preço do diesel | Todos | Sim | Sim |
| **ARLA 32** | Literatura de custo de frota | **Não** | **Sim**, opcional (consumo como % do diesel e preço) |
| Pedágio | Todos | Digitado | Digitado, e agora **quem paga** (você ou vale-pedágio do contratante) |
| Pneus, manutenção, lubrificante por km | MEU BRUTO e literatura | Um campo só por km | Igual (um campo; separar fica para depois) |
| **Custos fixos por tempo** (parcela, seguro, IPVA, depreciação, rastreador, salário) | Literatura e Fretebras | **Não** | **Sim**, por dia × duração da viagem |
| **Duração com espera** | Literatura | Só o resultado por dia | **Sim**, entra no custo fixo |
| Comissão, com base bruta ou líquida | Protótipo | Sim | Sim |
| Descontos e retenções | Protótipo | Sim | Sim |
| Margem sobre o preço | Sebrae | Sim | Sim |
| **Piso mínimo ANTT** | WikiRota, infraBR, calculadoras | **Não** | **Sim**, com os coeficientes que você copia da calculadora oficial (não ficam gravados no código) |
| **Prazo de pagamento e custo do dinheiro** | Fontes não detalham | **Não** | **Sim** (adiantamento, prazo do saldo, custo do dinheiro) |
| Remuneração do capital | ESALQ/ANTT, Conab | Não | Pode ser informada dentro do custo fixo por dia |
| Quebra e diferença de peso | Seu documento | Não | **Falta** |
| Pedágio por eixo, carregado e vazio | MEU BRUTO, Maplink | Não | **Falta** (depende de fonte de dados) |
| Tempo parado cobrado (estadia) | ANTT | Não | **Falta**, deliberadamente: exige enquadramento |

## 4. Conferência das contas

**Estão certas e conferidas:**
- Diesel por trecho: km ÷ consumo × preço. Bate com o manual da NTC, com o exemplo do Melhor Envio e com o seu documento.
- Margem sobre o preço, não sobre o custo. Acrescentar 20% ao custo dá só 16,67% de margem, e o teste confirma.
- Preço mínimo = custo ÷ (1 − percentuais − margem), conferido centavo a centavo.
- Piso ANTT = distância carregada × CCD + CC. Com os números do exemplo público (500 km, CCD 5,2177, CC 541,86) o motor dá R$ 3.150,71, igual ao exemplo da fonte.
- Todos os exemplos do seu documento de cálculos (28 conferências).

**Pontos em que o protótipo faz diferente, e por que o nosso é mais seguro:**
1. **Diesel some se não houver abastecimento lançado.** O resultado do fechamento soma só as despesas lançadas; sem abastecimento, o combustível vira zero em silêncio (hoje só há um aviso de texto). No nosso motor, dado que falta vira pendência e o resultado fica "provisório".
2. **Um consumo médio para a viagem toda.** O protótipo usa um km/L único para vazio e carregado. Nós separamos.
3. **Reembolso do motorista digitado à mão.** No protótipo, o campo "reembolsos devidos" não é ligado aos gastos marcados como pagos pelo motorista. O gasto pode ficar de um lado sem o reembolso do outro. Na jornada que vamos construir, o reembolso sai dos próprios lançamentos, para cada gasto contar uma vez só.
4. **Peso faturável é sempre o carregado.** O contrato pode faturar pelo peso de destino. Isso precisa virar uma escolha.
5. **Dinheiro em decimal comum.** Nosso motor usa inteiros; o banco do app ainda usa decimal e entra na migração para centavos.

## 5. O que podemos ter e eles (aparentemente) não

Implementado agora na tela "Analisar frete":
- **Folga do diesel:** até quanto o diesel pode subir (ou o consumo piorar) sem o frete deixar de cumprir a meta e sem dar prejuízo. Decide com segurança, não só com o preço de hoje.
- **Dinheiro e prazo:** quanto dinheiro *seu* é preciso ter até receber (diesel, ARLA, pedágio e extras, menos o adiantamento), e quanto custa esperar o saldo. Aviso quando "compensa, mas só se o pagamento for rápido".
- **Resultado por dia:** com custo fixo por dia e a duração incluindo espera. Um frete bom por km pode ser ruim por dia.
- **Pendências honestas:** nada obrigatório vira zero em silêncio.
- **Vale-pedágio:** não conta como custo seu nem como lucro a mais, e pede conferência.

Planejado, ligado ao que o protótipo mostra:
- **Previsto × realizado:** guardar a oferta aceita (como foto fixa) e comparar com o que a viagem deu. Nenhum app que li faz esse fechamento do ciclo.
- **Aprender com as suas viagens:** consumo real medido por abastecimento com odômetro, custo por km real, pedágio por rota (guardado do que você já pagou) e tempo de espera por cliente. A calculadora passa a sugerir valores a partir do seu histórico, em vez de números genéricos.
- **Jornada completa com dono e motorista**, como no protótipo, com login e permissão conferida no servidor.

## 6. Plano

| Etapa | Estado |
|---|---|
| Motor de contas com testes e tela "Analisar frete" | Feito |
| Variáveis novas (ARLA, custo fixo por dia, duração, vale-pedágio, piso, prazo, folga) | Feito |
| Salvar a oferta aceita; migração do banco para centavos | Próximo |
| Viagem real pelo odômetro: saída, carregamento, estrada, entrega | Depois |
| Fechamento: descontos, depósitos, acerto do motorista (reembolso ligado aos gastos) | Depois |
| Previsto × realizado e sugestões a partir do histórico | Depois |
| Login, dono e motorista, permissões no servidor | Depois |
| Pedágio por rota guardado das suas viagens | Depois |

## 7. Perguntas que só o Rogério responde

1. A comissão é sobre o frete bruto ou sobre o valor depois dos descontos?
2. O contratante costuma dar vale-pedágio? Sempre, às vezes, nunca?
3. O caminhão usa ARLA 32? Quanto gasta por 100 L de diesel?
4. O frete é faturado pelo peso carregado ou pelo entregue?
5. Qual é o custo fixo por dia, somando parcela, seguro, IPVA, rastreador e salário?
6. Qual margem o dono considera boa?

## Fontes consultadas

- [WikiRota, Google Play](https://play.google.com/store/apps/details?id=com.wikirota&hl=pt_BR)
- [Fretebras lança calculadora de custos](https://mundologistica.com.br/noticias/negociacao-de-fretes-fretebras-lanca-calculadora-de-custos-para-caminhoneiros)
- [Cálculo de Frete Autônomo](https://mundologistica.com.br/noticias/calculo-de-frete-autonomo-revela-aos-caminhoneiros-se-um-frete-e-bom-ou-nao)
- [MEU BRUTO, App Store](https://apps.apple.com/us/app/id1613977256)
- [Calculadora oficial do piso mínimo de frete (ANTT)](https://calculadorafrete.antt.gov.br/)
- [Tabela de frete ANTT 2026 e piso, Contmatic](https://simplifique.contmatic.com.br/blogs/como-consultar-e-calcular-tabela-frete-antt-2026)
- [Lei 10.209/2001, vale-pedágio](https://legis.senado.leg.br/norma/552085/publicacao/15808710)
- [Gestão de custos de frota, Transp.net](https://www.transp.net/blog/posts/gestao-custos-frota-reduzir-despesas-transportadora/)
- [6 maiores custos de um caminhão rodoviário, SETCESP](https://setcesp.org.br/noticias/6-maiores-custos-de-um-caminhao-rodoviario/)
- [Composição de custos TRC, Imam](https://www.imam.com.br/consultoria/artigo/pdf/composicao-custos-trc.pdf)
- [Manual de custo operacional, Conab](https://www.gov.br/conab/pt-br/manutencao/descontinuado-estoques/remocao-de-estoques/normativos-e-regulamentos-de-transporte/30-202_norma-manual-de-calculo-de-custo-operacional)
- [TCC da UnB sobre app de controle de viagens](https://bdm.unb.br/bitstream/10483/36832/1/2023_IgorPaiva_ThiagoSantos_tcc.pdf)
- Protótipo do dono: repositório `itronicrioverde-pixel/Relatorio-Caminhao`
