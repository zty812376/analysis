import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  END,
  MemorySaver,
  MessagesValue,
  ReducedValue,
  START,
  StateGraph,
  StateSchema,
} from "@langchain/langgraph";
import { z } from "zod";

const DemoIntentSchema = z.enum(["build", "debug", "research", "general"]);

const DemoStateSchema = new StateSchema({
  messages: MessagesValue,
  intent: DemoIntentSchema.default("general"),
  focus: z.string().default(""),
  summary: z.string().default(""),
  notes: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),
    reducer: (current, next) => [...current, next],
  }),
});

type DemoState = typeof DemoStateSchema.State;
type DemoIntent = z.infer<typeof DemoIntentSchema>;

export type SerializedMessage = {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type DemoRunResult = {
  threadId: string;
  intent: DemoIntent;
  focus: string;
  summary: string;
  notes: string[];
  turnCount: number;
  messageCount: number;
  messages: SerializedMessage[];
};

function getLatestHumanMessage(state: DemoState) {
  const latestHumanMessage = [...state.messages]
    .reverse()
    .find((message) => HumanMessage.isInstance(message));

  if (!latestHumanMessage || !HumanMessage.isInstance(latestHumanMessage)) {
    throw new Error("LangGraph demo requires at least one user message.");
  }

  return latestHumanMessage;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function shorten(text: string, maxLength = 80) {
  const normalized = normalizeText(text);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function classifyIntent(text: string): DemoIntent {
  const normalized = text.toLowerCase();

  if (
    /报错|错误|异常|失败|崩溃|修复|排查|debug|bug|error|trace|stack/.test(
      normalized
    )
  ) {
    return "debug";
  }

  if (
    /为什么|原理|对比|方案|设计|架构|调研|研究|思路|why|compare|research/.test(
      normalized
    )
  ) {
    return "research";
  }

  if (
    /集成|接入|实现|开发|搭建|编排|接口|路由|组件|上线|workflow|route|api|next/.test(
      normalized
    )
  ) {
    return "build";
  }

  return "general";
}

function toMessageRole(
  message: BaseMessage
): SerializedMessage["role"] {
  if (HumanMessage.isInstance(message)) {
    return "user";
  }

  if (AIMessage.isInstance(message)) {
    return "assistant";
  }

  if (message.type === "system") {
    return "system";
  }

  return "tool";
}

function serializeMessage(message: BaseMessage): SerializedMessage {
  const text = message.text.trim();
  const content =
    text ||
    (typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2));

  return {
    id: message.id,
    role: toMessageRole(message),
    content,
  };
}

function getConversationStats(state: DemoState) {
  const humanMessages = state.messages.filter((message) =>
    HumanMessage.isInstance(message)
  );
  const latestHumanMessage = getLatestHumanMessage(state);
  const previousHumanMessage = humanMessages.at(-2);

  return {
    humanTurnCount: humanMessages.length,
    previousHumanFocus: previousHumanMessage
      ? shorten(previousHumanMessage.text, 56)
      : null,
    latestHumanFocus: shorten(latestHumanMessage.text, 72),
  };
}

const analyzeRequest: typeof DemoStateSchema.Node = (state) => {
  const latestHumanMessage = getLatestHumanMessage(state);
  const intent = classifyIntent(latestHumanMessage.text);

  return {
    intent,
    focus: shorten(latestHumanMessage.text),
    summary: `请求已进入 ${intent} 分支。`,
    notes: `analyze: classified request as ${intent}`,
  };
};

const buildSpecialist: typeof DemoStateSchema.Node = (state) => {
  const stats = getConversationStats(state);
  const memoryLine = stats.previousHumanFocus
    ? `MemorySaver 已记住上一轮用户焦点：${stats.previousHumanFocus}。`
    : "这是当前 thread 的首轮请求，后续继续使用同一个 threadId 会累积会话状态。";

  return {
    summary: "走开发集成分支，输出可落地的接入步骤。",
    notes: "build: generated integration plan",
    messages: [
      new AIMessage(
        [
          `这是一个 LangGraph build 分支响应，当前用户请求焦点是：${stats.latestHumanFocus}。`,
          memoryLine,
          "建议接入顺序：",
          "1. 把 graph 定义放进独立服务端模块，避免页面层和编排逻辑耦合。",
          "2. 用 Route Handler 包装 invoke，隔离输入校验、线程 ID 和错误处理。",
          "3. 用 ReducedValue/消息状态保存流程轨迹，方便后续接模型、工具和持久化。",
          "4. 在页面直接展示 intent、summary、notes 和消息历史，先把编排层跑通再接真实模型。",
        ].join("\n")
      ),
    ],
  };
};

const debugSpecialist: typeof DemoStateSchema.Node = (state) => {
  const stats = getConversationStats(state);

  return {
    summary: "走问题排查分支，优先缩小错误面。",
    notes: "debug: generated debugging checklist",
    messages: [
      new AIMessage(
        [
          `这是一个 LangGraph debug 分支响应，当前排查目标是：${stats.latestHumanFocus}。`,
          stats.previousHumanFocus
            ? `同一 thread 里上一轮提到的是：${stats.previousHumanFocus}。`
            : "当前还没有历史上下文污染，适合先验证最小复现。",
          "优先检查：",
          "1. 依赖版本是否和 lockfile 一致，尤其是 langgraph/core/provider 包是否同代。",
          "2. Route Handler 是否运行在 Node.js runtime，而不是 edge runtime。",
          "3. 输入状态和节点返回值是否满足 StateSchema，避免 reducer/update 类型不匹配。",
          "4. 先打印 notes 和最后一条消息，确认实际走进了哪个分支。",
        ].join("\n")
      ),
    ],
  };
};

const researchSpecialist: typeof DemoStateSchema.Node = (state) => {
  const stats = getConversationStats(state);

  return {
    summary: "走调研分支，解释为什么用 graph 而不是单链式流程。",
    notes: "research: generated architecture explanation",
    messages: [
      new AIMessage(
        [
          `这是一个 LangGraph research 分支响应，当前议题是：${stats.latestHumanFocus}。`,
          "选择 LangGraph 的核心原因通常不是“多一步封装”，而是明确的状态流和可控分支：",
          "1. 节点只关心输入状态和增量更新，流程拆分更稳定。",
          "2. 条件边天然适合做 agent 分流、人工审批和失败回退。",
          "3. Checkpointer 可以把 thread 状态独立出来，便于做记忆和可恢复执行。",
          "4. 当你后面接入模型、工具和持久化存储时，不需要把页面层一起重写。",
        ].join("\n")
      ),
    ],
  };
};

const generalSpecialist: typeof DemoStateSchema.Node = (state) => {
  const stats = getConversationStats(state);
  const priorTurns = Math.max(stats.humanTurnCount - 1, 0);

  return {
    summary: "走通用分支，返回当前 graph 对输入的结构化理解。",
    notes: "general: generated general response",
    messages: [
      new AIMessage(
        [
          `这是一个 LangGraph general 分支响应，当前焦点是：${stats.latestHumanFocus}。`,
          `这个 thread 当前累计了 ${priorTurns} 轮历史用户输入。`,
          "如果你继续用相同的 threadId 提问，MemorySaver 会把之前的消息继续带入图执行。",
          "下一步最常见的扩展是：把这里的静态分支节点替换成真实模型调用或 tool node。",
        ].join("\n")
      ),
    ],
  };
};

const demoWorkflow = new StateGraph(DemoStateSchema)
  .addNode("analyze", analyzeRequest)
  .addNode("build", buildSpecialist)
  .addNode("debug", debugSpecialist)
  .addNode("research", researchSpecialist)
  .addNode("general", generalSpecialist)
  .addEdge(START, "analyze")
  .addConditionalEdges("analyze", (state) => state.intent, {
    build: "build",
    debug: "debug",
    research: "research",
    general: "general",
  })
  .addEdge("build", END)
  .addEdge("debug", END)
  .addEdge("research", END)
  .addEdge("general", END)
  .compile({
    checkpointer: new MemorySaver(),
    name: "nextjs-langgraph-demo",
  });

export async function runLangGraphDemo(input: {
  threadId: string;
  message: string;
}): Promise<DemoRunResult> {
  const config = {
    configurable: {
      thread_id: input.threadId,
    },
  } as const;

  await demoWorkflow.invoke(
    {
      messages: [new HumanMessage(input.message)],
    },
    config
  );

  const snapshot = await demoWorkflow.getState(config);
  const state = snapshot.values as DemoState;

  return {
    threadId: input.threadId,
    intent: state.intent,
    focus: state.focus,
    summary: state.summary,
    notes: state.notes,
    turnCount: state.messages.filter((message) => HumanMessage.isInstance(message))
      .length,
    messageCount: state.messages.length,
    messages: state.messages.map(serializeMessage),
  };
}
