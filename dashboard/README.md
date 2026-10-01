# APMix Dashboard

Painel local do proxy APMix, em Solid.js 2.0. Mostra o estado do proxy, o
catalogo de modelos e o uso da conta. A chave fica apenas na sessao do
navegador e e enviada como `Authorization: Bearer`.

## Executar

Com o proxy ja em `http://127.0.0.1:4500`:

```powershell
cd dashboard
bun install
bun run dev
```

Abra `http://127.0.0.1:5173`. O Vite encaminha `/v1` para o proxy.

Para publicar o painel junto do proxy:

```powershell
cd dashboard
bun run build
```

O resultado vai para `dashboard/dist/client`. Com o proxy em execucao, abra
`http://127.0.0.1:4500/`.
