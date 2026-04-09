# Analysis Demo

这个仓库现在包含两部分可运行能力：

1. LangGraph + Next.js 16 的服务端状态图示例
2. SiliconFlow Embeddings 的服务端封装与测试界面

## 启动

先配置环境变量：

```bash
cp .env.example .env.local
```

在 `.env.local` 或 `.env` 中填入：

```bash
SILICONFLOW_API_KEY=your_siliconflow_token_here
SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
```

然后启动开发环境：

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## Embedding 接口

项目新增了服务端接口：

```bash
POST /api/embeddings
```

请求体：

```json
{
  "input": "Silicon flow embedding online: fast, affordable, and high-quality embedding services. come try it out!"
}
```

本地调用示例：

```bash
curl --request POST \
  --url http://localhost:3000/api/embeddings \
  --header 'Content-Type: application/json' \
  --data '{
    "input": "Silicon flow embedding online: fast, affordable, and high-quality embedding services. come try it out!"
  }'
```

## 代码位置

- `lib/embeddings/siliconflow.ts`: SiliconFlow embedding client
- `app/api/embeddings/route.ts`: Embedding API Route Handler
- `components/embedding-playground.tsx`: 前端测试面板
- `lib/langgraph/demo-graph.ts`: LangGraph 示例图
- `app/api/langgraph/route.ts`: LangGraph API Route Handler
