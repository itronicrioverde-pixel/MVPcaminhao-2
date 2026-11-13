# O que rodar agora, e o que ajustar com o tempo

Data: 12/11/2026. Complementa `analise-mercado-e-variaveis.md`.

**Decisão em uma frase.** A primeira versão é a tela **Analisar frete no modo rápido**: cerca de 10 números, conta exata, resposta com faixa de segurança. Ela já dá um preço bem próximo do real. O resto (viagem real, fechamento, motorista, login) vem depois, na ordem em que reduz erro e risco.

## 1. O que é certo e o que é incerto

### Certo (a gente pode garantir)

| O quê | Por quê |
|---|---|
| As contas | Fórmulas e arredondamento em inteiros, conferidos por centenas de verificações, pelos 28 exemplos do seu documento, e por testes que quebram o código de propósito para ver se reclamam |
| Valor do frete, peso e condições do contrato | É dado do contratante |
| Que dado faltando nunca vira zero | Vira pendência e o resultado aparece como "provisório" |
| A estrutura do piso da ANTT (distância × CCD + CC) | Fórmula publicada; o exemplo público bate com o motor. Os coeficientes **não** ficam gravados |
| Em regra, o vale-pedágio é do contratante | Lei 10.209/2001 (li fontes secundárias, não o texto oficial) |

### Medido por você, com erro pequeno

| O quê | Como melhorar |
|---|---|
| Distância da rota | Mapa ou odômetro. Erro de poucos por cento |
| Consumo médio do caminhão | Anotar km e litros a cada tanque cheio |
| Custo do caminhão por km | Gastos do ano ÷ km do ano (o app tem uma ajuda para isso) |
| Comissão | Combinado com o motorista |

### Incerto (estimativa)

| O quê | Por que não dá para saber antes |
|---|---|
| Preço do diesel no dia em que abastecer | Muda de semana a semana e de posto para posto |
| Consumo desta viagem | Carga, relevo, trânsito, condutor |
| Pedágio exato | Não temos fonte de dados; vale o que você lançou na última vez |
| Duração, com espera para carregar e descarregar | Depende do cliente e da fila |
| Gasto futuro de manutenção e pneus | É média, não previsão |
| Qual margem o dono considera boa | Decisão sua |

### Ainda desconhecido

- Tributos e retenções do seu perfil fiscal (não calculamos de propósito).
- Se o piso da ANTT se aplica a esse frete e com quais coeficientes.
- A base dos 80/20 (bruto, líquido, valor fixo).
- Como o motorista vai usar o app na estrada (se vai lançar os dados).
- Como o login e a publicação funcionam no seu ambiente de produção.

## 2. Quanto cada número pesa (medido com o motor)

Viagem de referência: frete R$ 10.060, 600 km carregado e 120 km vazio, diesel R$ 6,79, pedágio R$ 450, custo do caminhão R$ 1,50/km, comissão 13%. Resultado: R$ 4.913,60, margem 48,84%.

**Se cada número errar ±10%:**

| Número | Efeito no resultado | Em pontos de margem |
|---|---|---|
| Km carregado | ± R$ 293,70 | 2,9 |
| Consumo (km/L) | − R$ 256,51 / + R$ 209,87 | 2,5 / 2,1 |
| Preço do diesel | ± R$ 230,86 | 2,3 |
| Comissão | ± R$ 130,78 | 1,3 |
| Custo do caminhão por km | ± R$ 108,00 | 1,1 |
| Km vazio | ± R$ 45,16 | 0,4 |
| Pedágio | ± R$ 45,00 | 0,4 |

Com custo fixo de R$ 500/dia e 1,5 dia, **errar a duração em 1 dia mexe R$ 500, ou 5 pontos de margem**. É a maior incerteza individual quando existe custo fixo por dia.

**Se todos errarem um pouco para pior** (consumo −5%, diesel +3%, km +2%, custo por km +10%, 12 h a mais de espera), o resultado cai 15,1% (de R$ 4.163,60 para R$ 3.536,71). Para um frete com margem de 40%, isso não muda a decisão. Para um com margem de 15%, pode mudar. É por isso que a tela mostra o pior caso.

**Se a variável for ignorada de vez** (viagem com 600 km de volta vazio, ARLA, custo fixo de R$ 500/dia por 2,5 dias, prazo de 30 dias a 3% ao mês). Resultado de referência: R$ 1.076,10 (10,7%).

| Esquecer… | Erro no resultado | Pontos de margem |
|---|---|---|
| O retorno vazio (600 km) | + R$ 2.293,00 | 22,8 |
| O custo do caminhão por km | + R$ 1.980,00 | 19,7 |
| A comissão | + R$ 1.307,80 | 13,0 |
| O custo fixo (parcela, seguro, IPVA) | + R$ 1.250,00 | 12,4 |
| O pedágio | + R$ 600,00 | 6,0 |
| O custo do prazo (30 dias) | + R$ 301,80 | 3,0 |
| O ARLA 32 | + R$ 94,50 | 0,9 |
| Outros custos (alimentação, chapa) | + R$ 85,00 | 0,8 |
| Usar um consumo único em vez de vazio e carregado | + R$ 83,58 | 0,8 |

**O que isso decide:**

- **Não dá para dispensar:** retorno vazio, custo do caminhão por km (com o fixo diluído), comissão e pedágio. Esquecer qualquer um erra mais de 6 pontos de margem.
- **Dá para dispensar na primeira versão:** ARLA, outros custos e separar consumo vazio de carregado. Cada um erra menos de 1 ponto.
- **Zona média:** o prazo de pagamento (3 pontos), que fica no modo detalhado.
- Esses números são de **uma viagem de exemplo**. Em outra rota a ordem pode mudar. A conclusão que se mantém é que o retorno vazio e o custo por km são os que mais pesam.

## 3. Perspectivas

| Perspectiva | O que importa | O que fizemos |
|---|---|---|
| Motorista no celular | Poucos campos, teclado numérico, uma resposta clara | Modo rápido com cerca de 10 números; resumo fixo na tela; leitura em português ("6,79", "50.300") |
| Dono / financeiro | Não aceitar frete que dá prejuízo; saber o preço mínimo | Decisão (compensa, abaixo da meta, prejuízo), frete mínimo para empatar e para a meta, resultado por km |
| Matemática do erro | O resultado só é tão bom quanto os números | Tabelas acima; faixa de segurança; folga do diesel |
| Jurídico e fiscal | Não afirmar o que não sabemos | Sem tributos automáticos; piso da ANTT só com coeficientes que você copia; vale-pedágio pede conferência |
| Produto e entrega | Entregar algo útil cedo, sem travar | Primeira versão só no navegador, sem login novo, sem banco novo |
| Técnica e risco | Não perder nem corromper dados | Nada novo no banco nesta versão; valores guardados só no aparelho |
| Confiança | O que acontece quando erramos | Pendências visíveis, pior caso, "provisório"; próxima etapa: comparar previsto com realizado |

## 4. Complexidade de cada peça

Esforço é **minha estimativa de ordem de grandeza** (P = dias, M = 1 a 2 semanas, G = várias semanas), não um prazo.

| Peça | Esforço | Valor | Risco | Depende de |
|---|---|---|---|---|
| Analisar frete (rápido e detalhado) | **Pronto** | Alto | Baixo | Nada |
| Salvar a análise e comparar com o realizado | M | Muito alto (fecha o ciclo e calibra) | Médio (banco, migração) | Migração para centavos |
| Migração do banco para centavos | M | Médio (exatidão) | **Alto** (mexe em dados reais) | Backup testado |
| Pedágio guardado das suas viagens, por rota | M | Alto | Baixo | Salvar viagens com rota |
| Consumo real medido por abastecimento | M | Alto | Médio (depende de lançar o odômetro) | Viagem real |
| Viagem real pelo odômetro | G | Alto | Médio | Salvar a análise |
| Fechamento (descontos, depósitos, acerto) | G | Alto | Médio (regras fiscais) | Viagem real |
| Dono e motorista, permissões | G | Alto para equipe | **Alto** (segurança) | Login |
| Login | G | Necessário para equipe | **Alto** (depende da hospedagem) | Decisão sua |
| Pedágio automático por fornecedor | G | Médio | Alto (custo, contrato, cobertura sem confirmar) | Decisão e orçamento |
| Tributos automáticos | Muito G | Médio | **Muito alto** (legal) | Contador |
| GPS contínuo | G | Baixo (odômetro resolve) | Alto (limite do celular) | Não recomendado agora |

## 5. O que entra na primeira versão

**Entra (já feito, com testes):**
- Modo rápido: frete, km carregado, km vazio, consumo médio, diesel, pedágio (ou vale-pedágio, ou sem pedágio), custo do caminhão por km "tudo incluso", comissão e margem.
- Ajuda para achar o custo por km a partir dos gastos do ano.
- Decisão com pendências visíveis.
- **Faixa de segurança:** "se os custos ficarem 10% maiores" (padrão que você pode mudar no modo detalhado), com o rótulo **Com folga** ou **Apertado**.
- Frete mínimo para empatar e para a meta; folga do diesel.
- Modo detalhado para quem quiser mais (custo fixo por dia, duração, ARLA, piso, prazo).

**Fica de fora, de propósito:** tributos, GPS, pedágio automático, login, motorista, banco novo, salvar a análise.

**O que isso não resolve (para ninguém se enganar):**
- No modo rápido o custo fixo está diluído **por km**. Uma viagem com muita espera custa mais do que a média e o modo rápido não vê isso. Para esse caso use o modo detalhado, que cobra por dia.
- O pedágio é o valor que você digita. Se errar, o preço erra.
- A precisão final depende de dois números seus: **consumo médio** e **custo por km**. Com os dois medidos do seu histórico, a conta é exata e o erro que sobra é o da estrada.

## 6. Como ir ajustando com o tempo

1. **Calibrar com a realidade.** Salvar a análise aceita e, ao fim da viagem, comparar com o que aconteceu. A tela passa a dizer "seu consumo real nas últimas 5 viagens foi 2,31 km/L, você está usando 2,12".
2. **Pedágio aprendido.** Cada pedágio lançado fica guardado por rota e eixos, e a próxima análise da mesma rota já vem preenchida.
3. **Duração real.** Guardar o tempo de espera por cliente para parar de chutar a duração.
4. **Só então** viagem real completa, fechamento e motorista.

A ordem é a que mais reduz erro por unidade de trabalho e a que menos mexe em dados reais no começo.

## 7. Respostas já recebidas do dono

| Pergunta | Resposta | O que mudou no app |
|---|---|---|
| Em que peso o frete é calculado? | **Peso carregado** | O campo é "Peso carregado (kg)". Sumiu o texto que dizia que podia ser o de destino |
| Como o frete é pago? | **80% logo no início e 20% na descarga** | Nos dois modos o adiantamento começa em 80% e o saldo cai na descarga. A tela mostra o adiantamento, o saldo e se o adiantamento cobre as despesas da estrada. Isso não muda o lucro, muda o dinheiro que o dono precisa ter no bolso |
| Quem define a margem? | **O dono** | O campo começa vazio, sem número pronto |
| Custo fixo por dia | **Só depois de o dono usar o app e alimentá-lo** | Em branco não trava mais a análise: aparece um aviso de que ele não entrou na conta. No modo rápido o "custo por km, tudo incluso" já cobre o fixo |

### Respostas de 13/11 e o que foi feito

| Resposta do dono | O que mudou no app |
|---|---|
| O caminhão é de **9 eixos**, mas o app tem que servir qualquer caminhão | Seletor "Eixos do conjunto" (de 2 a 9, padrão 9). Botão para usar o rendimento de referência da ANTT por eixos (9 eixos = 1,70 km/L), sempre com o aviso de que **não é o consumo do caminhão**. Para 8 eixos a ANTT não tem referência e o app não inventa |
| O dono é **pessoa física**, mas deve haver opção para **MEI** e **empresa** | Cartão "Seu perfil e as retenções": Autônomo, MEI ou Empresa, e quem paga o frete (empresa ou pessoa física). Só o autônomo contratado por empresa recebe a **estimativa** de INSS e SEST/SENAT (2,7% do frete bruto); nos outros casos o app só avisa e manda conferir o recibo |
| **Sem informação sobre o recibo** | A retenção **não entra no resultado por padrão**: aparece como estimativa, com quanto o resultado cairia. O dono liga "Contar as retenções estimadas no resultado" quando confirmar no recibo |
| O app tem que **medir o combustível sozinho**, pelo odômetro ou outra alternativa | Card "Medir meu consumo (odômetro e litros)": de tanque cheio a tanque cheio, separa **carregado**, **vazio** e **misto** (carregado e vazio juntos). O botão "Usar no cálculo" preenche o consumo; no modo rápido calcula a média da viagem com os km vazios e carregados informados. Os registros ficam só no aparelho |

**Ainda não feito:** separar o pedágio em carregado e vazio (cada um com o seu pagador) e guardar as medições de consumo no banco, junto com as viagens, para o app aprender com o tempo.

Confirmado pelo dono: os 80% são sobre o **frete total (bruto)**, não sobre o líquido.

Também confirmado: quando o dono paga o pedágio, o contratante **não reembolsa**; isso é combinado antes de aceitar o frete, então o frete precisa cobri-lo. E o contrato do dono **obriga o caminhão a rodar vazio**, por isso o rendimento vazio e carregado importa (ver `pesquisa-vale-pedagio-frete-arla.md`, parte 2).

**Plano para o custo fixo por dia.** Quando o dono tiver lançado as despesas fixas (parcela, seguro, IPVA, rastreador) e as viagens com a duração real, o app calcula o custo fixo por dia sozinho e passa a sugerir o valor. Até lá, vale o aviso e o modo rápido.

## 8. O que ainda precisa ser decidido

1. **Folga de segurança.** Hoje é 10% no modo rápido e pode ser mudada ou zerada no detalhado. Foi decidido manter por enquanto. Se o dono quiser outro percentual, ou não quiser esse aviso, é um ajuste pequeno.
2. **Como publicar.** O código está na branch `claude/eager-heisenberg-4r4fsn`. Para ir ao ar, precisa entrar na `main` e ser publicado pelo fluxo do dono.
3. **Login:** e-mail e senha, conta Google, ou manter o "Entrar com ChatGPT"? Só importa quando entrar o motorista.
4. **Perguntas que ainda faltam:** o contratante costuma dar vale-pedágio? A comissão é sobre o frete bruto? O caminhão usa ARLA 32?
