# Analysis Demo

这个仓库当前的示例页面支持：

1. 上传 `doc` / `docx`
2. 服务端抽取 Word 正文
3. 使用 `doubao-seed-2-0-pro-260215` 做语义分块
4. 展示 chunk 结果、切分原因和抽取预览

## 启动

先配置环境变量：

```bash
cp .env.example .env.local
```

在 `.env.local` 或 `.env` 中填入：

```bash
ARK_API_KEY=your_doubao_ark_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DASHSCOPE_API_KEY=your_dashscope_api_key_here
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v4
DASHSCOPE_EMBEDDING_DIMENSIONS=2048
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/analysis
```

然后启动开发环境：

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 文档语义分块接口

项目新增了服务端接口：

```bash
POST /api/document-chunks
```

请求方式：`multipart/form-data`

字段：

- `file`: `.doc` 或 `.docx`

本地调用示例：

```bash
curl --request POST \
  --url http://localhost:3000/api/document-chunks \
  --form 'file=@/absolute/path/to/example.docx'
```

分块完成后，接口会自动把结果写入 PostgreSQL 的 `document_chunk_runs`
和 `document_chunk_items` 表，并在响应中返回：

- `storage.provider`: 固定为 `postgresql`
- `storage.recordId`: 本次分析记录 ID
- `storage.savedAt`: 写入时间（ISO 8601）

其中 `document_chunk_items` 会按页面展示字段逐块保存：

- `title`
- `core_viewpoint`
- `reason`
- `chunk_info`
- `tags` (`jsonb`，JSON 列表)
- `keywords` (`jsonb`，JSON 列表)
- `content` (`vector(2048)`，阿里云百炼 `text-embedding-v4` 向量)
- 以及 `char_count`、`unit_count`、`start_unit`、`end_unit`、`start_line`、`end_line`、`break_reason`

注意：

- `content` 存的是阿里云百炼 `text-embedding-v4` 向量，不是可逆的原始文本。
- 完整原文仍保存在 `document_chunk_runs.chunks` 这份 JSON 中。

## 代码位置

- `lib/llm/doubao.ts`: Doubao Chat client
- `lib/llm/bailian-embeddings.ts`: Bailian Embeddings client
- `lib/documents/extract-word-text.ts`: Word 文本抽取
- `lib/documents/semantic-chunker.ts`: 基于 Doubao 的语义分块实现
- `lib/postgres/client.ts`: PostgreSQL 连接池
- `lib/postgres/document-chunk-records.ts`: 分块结果落库逻辑
- `app/api/document-chunks/route.ts`: 文档上传与分块接口
- `components/document-chunk-playground.tsx`: 首页上传与结果展示
- `lib/langgraph/demo-graph.ts`: LangGraph 示例图
- `app/api/langgraph/route.ts`: LangGraph API Route Handler
