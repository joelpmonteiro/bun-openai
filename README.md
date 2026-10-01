# APMix Proxy

Proxy em Bun/TypeScript para usar os modelos da APMix no Copilot Chat do VS Code.
Chat Completions e Responses usam o contrato OpenAI, incluindo ferramentas,
entradas multimodais, respostas JSON e streaming SSE.

## Executar

```powershell
bun install
Copy-Item .env.example .env
bun run start
```

Configure `APMIX_API_KEY` em `.env`. O servidor atende em
`http://127.0.0.1:4500/v1`. Para validar o projeto:

```powershell
bun run typecheck
bun test
```

### Autenticacao

- Com `APMIX_API_KEY` ou `APMIX_API_KEYS`, o servidor usa suas credenciais.
  Configure `PROXY_API_KEY` para exigir uma chave local especifica.
- Sem chave no servidor, a chave enviada pelo cliente e repassada para a APMix.
- Todas as rotas exigem `Authorization: Bearer <chave>` ou `x-api-key`.
- `PROXY_API_KEY` exige uma chave APMix no servidor. Sem ela, inferencia e uso
  retornam 503.
- `APMIX_API_KEYS` aceita chaves separadas por virgula e tem prioridade sobre
  `APMIX_API_KEY`. Chamadas de inferencia alternam as chaves; respostas 429
  colocam a chave em cooldown. Nao ha repeticao automatica de chamadas pagas.
  Use chaves da mesma conta/plano, pois a descoberta usa a primeira chave.
- Sem `PROXY_API_KEY`, qualquer token nao vazio acessa as chaves do servidor.
  Mantenha o bind local ou configure a chave local antes de expor o servico.

## GitHub Copilot Chat

No VS Code, abra **Chat: Manage Language Models**, adicione **Custom Endpoint**
e use a configuracao de [examples/chatLanguageModels.json](examples/chatLanguageModels.json).
A configuracao explicita inclui todos os modelos do snapshot, pois algumas
versoes do Custom Endpoint nao resolvem modelos por descoberta automatica.
Para regenerar a lista a partir do catalogo autorizado da chave no servidor:

```powershell
bun run copilot:export
```

Sem chave, o comando usa o snapshot publico. A exportacao usa limites locais
conservadores de 16.384 tokens de entrada e 4.096 de saida, habilita chamadas
de ferramentas e desabilita imagens por padrao. Esses valores sao configuracao
do cliente, nao capacidades maximas verificadas de cada modelo. Ajuste limites,
`toolCalling` e `vision` conforme o modelo e seu plano.
Na entrada da chave, use `PROXY_API_KEY` quando configurada; caso contrario,
use sua chave APMix.

O arquivo exportado oferece duas entradas para cada modelo: **APMix** usa o
comportamento normal do provedor, e **APMix Thinking** envia `reasoning_effort:
"high"` em Chat Completions. Use Thinking somente com modelos que aceitam esse
campo. Essa entrada nao garante que todo modelo suporte raciocinio nem desativa
um raciocinio que o proprio provedor aplique por padrao.

O formato padrao e **Chat Completions**. Para um modelo com Responses,
configure `apiType: "responses"`. O proxy preserva `tool_calls`,
`tool_call_id`, ferramentas, imagens, uso de tokens e os eventos SSE originais.
Os parametros de raciocinio enviados ao endpoint normal passam sem alteracao.
Para usar o modo Thinking com Responses, aponte o endpoint para
`/v1/thinking/responses`; o proxy envia `reasoning.effort: "high"`.

Esta integracao atende chat e agentes. Sugestoes inline, busca semantica e
embeddings continuam sujeitos aos recursos do GitHub Copilot. Modelos sem
suporte a ferramentas podem nao aparecer no seletor de agentes.

## Modelos

O snapshot publico inclui os **45 modelos** publicados em 2026-10-01 em
[APMix Models](https://apmix.ai/models), com seus IDs completos em
[src/catalog/public-models.ts](src/catalog/public-models.ts).

Com uma chave, `GET /v1/models` consulta o catalogo autorizado para o plano,
preserva metadados e atualiza automaticamente, sem restringir modelos novos a
uma lista fixa. O cache e separado por chave e dura 60 segundos por padrao.
Em falha temporaria, preserva o ultimo catalogo valido; sem cache, retorna o
snapshot publico. O header `x-model-catalog-source` distingue `upstream`,
`stale` e `public-snapshot`. O snapshot nao garante acesso pelo seu plano.
Erros de autenticacao e permissao da APMix sao retornados ao cliente.

## Dashboard

O painel em [dashboard](dashboard) mostra status, catalogo e uso. A chave fica
somente na sessao do navegador.

```powershell
bun run dashboard:build
bun run start
```

Abra `http://127.0.0.1:4500/`. Durante o desenvolvimento, `bun run dashboard`
sobe o Vite em `http://127.0.0.1:5173` e encaminha `/v1` para o proxy.

## Rotas

| Metodo | Rota | Finalidade |
| --- | --- | --- |
| GET | `/v1/models` | Catalogo OpenAI compativel |
| POST | `/v1/chat/completions` | Chat, ferramentas e SSE |
| POST | `/v1/responses` | Responses JSON e SSE |
| GET | `/v1/usage` | Uso real da conta na APMix |
| GET | `/v1/status` | Estado do proxy e origem do catalogo |

As respostas preservam status HTTP, erros do provedor, `retry-after` e
headers `x-apmix-*`. O proxy nao armazena quotas ou chaves em banco local.

## Docker

```powershell
docker compose up --build -d
```

A porta publicada e `127.0.0.1:4500`. As variaveis completas estao em
[.env.example](.env.example).

## Referencias

- [Documentacao APMix](https://apmix.ai/docs)
- [Modelos APMix](https://apmix.ai/models)
- [Custom Endpoint no VS Code](https://code.visualstudio.com/docs/agent-customization/language-models)
