# Fuso Reunião: ache o melhor horário para reuniões entre fusos horários (HTML + JS)

Marcar uma reunião com gente em Brasília, Lisboa e Nova York sempre termina em conta de cabeça, e o horário de verão de cada país muda em datas diferentes. O Fuso Reunião mostra as 24 horas do dia lado a lado, destaca quando todo mundo está no expediente e gera o convite com o horário de cada lugar, em português.

**Acesse online:** https://micdog22.github.io/fuso-reuniao/

## Recursos

- Escolha a data e os lugares: busca com todos os fusos do navegador e nomes em português para os mais comuns (Brasília, Manaus, Cuiabá, Rio Branco, Fernando de Noronha, Lisboa, Londres, Madri, Berlim, Nova York, Chicago, Denver, Los Angeles, Toronto, Cidade do México, Buenos Aires, Santiago, Bogotá, Tóquio, Sydney, Dubai, Índia, Singapura, Xangai e Joanesburgo).
- Grade de 24 horas alinhada pelo primeiro lugar (a referência), com o horário local de cada um.
- Cores para expediente (configurável, padrão das 9h às 18h), cedo ou tarde e noite, além de destaque para os horários em que todos estão no expediente.
- Sem horário comum? A grade marca os que reúnem mais gente no expediente.
- Clique num horário para ver a hora em cada lugar (com "+1 dia" ou "-1 dia" quando a data muda) e copiar um convite pronto.
- Horário de verão correto: tudo vem do banco de fusos horários do próprio navegador, nunca de deslocamentos fixos.
- Link compartilhável (`?tz=...&data=...`) e preferências salvas no navegador.

Padrão ao abrir: Brasília, Lisboa e Nova York, na data de hoje.

## Como usar

1. Escolha a data e adicione os lugares (digite o nome da cidade ou o fuso, como `Asia/Seoul`).
2. Ajuste o expediente, se precisar.
3. Clique no melhor horário da grade e copie o convite:

```
Reunião: quinta-feira, 8 de outubro de 2026

Horário em cada lugar:
• Brasília: 22:00 às 23:00
• Nova York: 21:00 às 22:00
• Tóquio: 10:00 às 11:00 (sexta-feira, 9 de outubro, +1 dia)
```

Para compartilhar a comparação, use **Copiar link desta comparação**. O endereço guarda os lugares, a data e o expediente, por exemplo:

```
https://micdog22.github.io/fuso-reuniao/?tz=America/Sao_Paulo,Europe/Lisbon,America/New_York&data=2026-10-08
```

## Como funciona

- **Deslocamentos:** para cada instante, o horário local de cada lugar vem de `Intl.DateTimeFormat`, que usa o banco de fusos (tzdata) do sistema. Por isso a ferramenta sabe, por exemplo, que Nova York está em UTC-5 em janeiro e UTC-4 em julho, e que o Brasil não tem horário de verão desde 2019.
- **Grade:** começa à meia-noite do lugar de referência e anda de hora em hora até a meia-noite seguinte. Em dias de troca de horário a grade tem 23 ou 25 linhas, como o relógio de verdade.
- **Cores:** expediente é o intervalo configurado; "cedo ou tarde" é fora do expediente, mas entre 7h e 22h; o resto é noite.
- **Horários com meia hora:** lugares como a Índia (UTC+5:30) aparecem com os minutos certos.

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`, com Node 18 ou mais recente). Os testes verificam os deslocamentos de Nova York, São Paulo e Lisboa em datas diferentes, a conversão de horários com troca de data, as trocas de horário de verão, a detecção de sobreposição de expediente e a leitura e escrita do estado na URL.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
