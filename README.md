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

## 代码位置

- `lib/llm/doubao.ts`: Doubao Chat client
- `lib/documents/extract-word-text.ts`: Word 文本抽取
- `lib/documents/semantic-chunker.ts`: 基于 Doubao 的语义分块实现
- `app/api/document-chunks/route.ts`: 文档上传与分块接口
- `components/document-chunk-playground.tsx`: 首页上传与结果展示
- `lib/langgraph/demo-graph.ts`: LangGraph 示例图
- `app/api/langgraph/route.ts`: LangGraph API Route Handler
