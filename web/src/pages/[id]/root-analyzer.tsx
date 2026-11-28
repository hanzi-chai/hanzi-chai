import {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Flex,
  Input,
  InputNumber,
  Modal,
  message,
  Select,
  Table,
  Typography,
} from "antd";
import type {
  元素位或编码,
  字根改动,
  选根结果,
  选根评分表,
  选根进度,
  非空安排,
} from "hanzi-chai";
import { isEqual } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAtom,
  useAtomValue,
  useStore,
  原始词典原子,
  字形列表原子,
  字符列表原子,
  自定义分析数据库,
  配置原子,
} from "~/atoms";
import type { 选根响应, 选根请求 } from "~/root-selection.worker";
import { getCurrentId } from "~/utils";

const 数字 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 });
const 词类 = [
  { value: "single", label: "一字词" },
  { value: "multi", label: "多字词" },
  { value: "all", label: "全部" },
];
const 候选来源 = [
  { value: "frequency", label: "高频字" },
  { value: "components", label: "字形分部" },
  { value: "collisions", label: "重码组" },
] as const;

function 解析改动(文本: string): 字根改动[] {
  return 文本.split(/\r?\n/).flatMap<字根改动>((行, i) => {
    const 文 = 行.trim();
    if (!文) return [];
    const 移除 = /^-\s*([^\s=]+)$/u.exec(文);
    if (移除) return [{ name: 移除[1]!, value: null }];
    const 归并 = /^([^\s=]+)\s*=>\s*([^\s=]+)$/u.exec(文);
    if (归并) return [{ name: 归并[1]!, value: { element: 归并[2]! } }];
    const 设置 = /^([^\s=]+)\s*=\s*([^=]+)$/u.exec(文);
    if (!设置) throw new Error(`第 ${i + 1} 行无法解析`);
    const 槽 = 设置[2]!.trim().split(/\s+/u);
    const 解析槽 = (位: string): 元素位或编码 => {
      const 引用 = /^(.+)@([1-9]\d*)$/u.exec(位);
      if (引用 && Number.isSafeInteger(Number(引用[2]))) {
        return { element: 引用[1]!, index: Number(引用[2]) - 1 };
      }
      if ([...位].length !== 1)
        throw new Error(`第 ${i + 1} 行的码位「${位}」无效`);
      return 位;
    };
    const value =
      槽.length === 1 && !/^.+@[1-9]\d*$/u.test(槽[0]!)
        ? 槽[0]!
        : 槽.map(解析槽);
    if (!value.length) throw new Error(`第 ${i + 1} 行缺少键位安排`);
    return [{ name: 设置[1]!, value }];
  });
}

function 显示安排(value: 非空安排 | null) {
  if (value === null) return "删除";
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return `归并到 ${value.element}`;
  return value
    .map((位) =>
      typeof 位 === "string" ? 位 : `${位.element}@${位.index + 1}`,
    )
    .join(" ");
}

function 选根面板() {
  const [配置, 设配置] = useAtom(配置原子);
  const store = useStore();
  const 字符列表 = useAtomValue(字符列表原子);
  const 字形列表 = useAtomValue(字形列表原子);
  const 原始词典 = useAtomValue(原始词典原子);
  const 自定义元素条目 = useAtomValue(自定义分析数据库.entries);
  const 码长 = 配置.encoder.max_length;
  const [改动文本, 设改动文本] = useState("");
  const [候选文本, 设候选文本] = useState("");
  const [键位文本, 设键位文本] = useState("");
  const [轮数, 设轮数] = useState(3);
  const [上限, 设上限] = useState(8);
  const [加, 设加] = useState(true);
  const [减, 设减] = useState(false);
  const [来源, 设来源] = useState<
    ("frequency" | "components" | "collisions")[]
  >(["frequency", "collisions"]);
  const [罚分, 设罚分] = useState(0);
  const [自定义表, 设自定义表] = useState<选根评分表[]>();
  const 全码位 = useMemo(
    () => Array.from({ length: 码长 }, (_, i) => i),
    [码长],
  );
  const 默认表 = useMemo<选根评分表[]>(
    () => [{ type: "single", top: 0, position: 全码位, weight: 1 }],
    [全码位],
  );
  const 表 = 自定义表 ?? 默认表;
  const 更新表 = (i: number, patch: Partial<选根评分表>) =>
    设自定义表(表.map((项, index) => (index === i ? { ...项, ...patch } : 项)));
  const 快照 = useMemo(
    () => ({
      配置,
      字符列表,
      字形列表,
      原始词典,
      自定义元素条目,
      改动文本,
      候选文本,
      键位文本,
      轮数,
      上限,
      加,
      减,
      来源,
      罚分,
      表,
    }),
    [
      配置,
      字符列表,
      字形列表,
      原始词典,
      自定义元素条目,
      改动文本,
      候选文本,
      键位文本,
      轮数,
      上限,
      加,
      减,
      来源,
      罚分,
      表,
    ],
  );

  const worker = useRef<Worker | null>(null);
  const [任务, 设任务] = useState<typeof 快照>();
  const [运行中, 设运行中] = useState(false);
  const [错误, 设错误] = useState("");
  const [进度, 设进度] = useState<选根进度>();
  const [结果, 设结果] = useState<选根结果>();
  const [表明细, 设表明细] = useState<number>();
  const 可见结果 = 任务 === 快照 ? 结果 : undefined;
  const 映射变化 = useMemo(() => {
    if (!可见结果?.changed) return [];
    const 原表 = 配置.form.mapping;
    const 新表 = 可见结果.form.mapping;
    return [...new Set([...Object.keys(原表), ...Object.keys(新表)])].flatMap(
      (name) => {
        const before = Object.hasOwn(原表, name) ? 原表[name] : undefined;
        const after = Object.hasOwn(新表, name) ? 新表[name] : undefined;
        return isEqual(before, after) ? [] : [{ name, before, after }];
      },
    );
  }, [可见结果, 配置.form.mapping]);

  useEffect(() => () => worker.current?.terminate(), []);
  const 停止 = () => {
    worker.current?.terminate();
    worker.current = null;
    设运行中(false);
    设进度(undefined);
  };
  const 开始 = (自动: boolean) => {
    停止();
    设任务(快照);
    设错误("");
    设结果(undefined);
    设表明细(undefined);
    try {
      const 首键 =
        [...(配置.form.alphabet ?? "abcdefghijklmnopqrstuvwxyz")][0] ?? "";
      const 默认键位 = 首键.repeat(配置.form.mapping_type ?? 1);
      const request: 选根请求 = {
        配置,
        字符列表,
        字形列表,
        原始词典,
        自定义元素集合: Object.fromEntries(自定义元素条目),
        改动: 解析改动(改动文本),
        评分: { tables: 表, rootPenalty: 罚分 },
        搜索: 自动
          ? {
              rounds: 轮数,
              limit: 上限,
              add: 加,
              remove: 减,
              sources: 来源,
              candidates: [
                ...new Set(候选文本.trim().split(/\s+/u).filter(Boolean)),
              ],
              codes: [...new Set((键位文本.trim() || 默认键位).split(/\s+/u))],
            }
          : undefined,
      };
      const w = new Worker(
        new URL("../../root-selection.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = ({ data }: MessageEvent<选根响应>) => {
        if (worker.current !== w) return;
        switch (data.type) {
          case "progress":
            设进度(data.value);
            break;
          case "round":
            设结果(data.value);
            break;
          case "complete":
            设结果(data.value);
            停止();
            break;
          case "error":
            设错误(data.message);
            停止();
            break;
        }
      };
      w.onerror = (error) => {
        if (worker.current !== w) return;
        设错误(error.message || "选根计算无法运行");
        停止();
      };
      w.postMessage(request);
      设运行中(true);
    } catch (error) {
      停止();
      设错误(error instanceof Error ? error.message : String(error));
    }
  };
  const 应用 = () => {
    if (!可见结果?.changed || 可见结果.missing || 运行中) return;
    if (
      store.get(配置原子) !== 配置 ||
      store.get(原始词典原子) !== 原始词典 ||
      store.get(自定义分析数据库.entries) !== 自定义元素条目
    ) {
      message.warning("方案或词典已变更，请重新分析");
      return;
    }
    设配置({ ...配置, form: 可见结果.form });
    设任务(undefined);
    设改动文本("");
    message.success("已应用选根结果");
  };

  return (
    <Flex vertical gap="middle">
      <Typography.Title level={2} className="m-0!">
        智能选根
      </Typography.Title>
      <ConfigProvider componentDisabled={运行中}>
        <Card size="small" title="试算改动">
          <Flex vertical gap="small">
            <Typography.Text type="secondary">
              每行一条。用「二=ab」设置键位、「丁=&gt;二」整体归并、「木=a
              二@2」引用第二码、「-丁」删除。自动搜索会固定这些改动。
            </Typography.Text>
            <Input.TextArea
              aria-label="试算改动"
              value={改动文本}
              onChange={(e) => 设改动文本(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 8 }}
            />
          </Flex>
        </Card>
        <Card size="small" title="评分表">
          <Flex vertical gap="small">
            <Typography.Text type="secondary">
              按归并后的元素序列估计重码。空位越多，阶数越高。
            </Typography.Text>
            {表.map((项, i) => (
              <Flex key={i} gap="small" align="center" wrap>
                <Select
                  aria-label={`表 ${i + 1} 的统计对象`}
                  value={项.type}
                  options={词类}
                  onChange={(type) => 更新表(i, { type })}
                />
                <Select
                  aria-label={`表 ${i + 1} 的空位`}
                  mode="multiple"
                  placeholder="空位（留空为零阶）"
                  style={{ minWidth: 200 }}
                  value={全码位.filter((位) => !项.position.includes(位))}
                  options={全码位.map((value) => ({
                    value,
                    label: `第 ${value + 1} 码`,
                  }))}
                  onChange={(空位) =>
                    更新表(i, {
                      position: 全码位.filter((位) => !空位.includes(位)),
                    })
                  }
                />
                <label htmlFor={`root-selection-top-${i}`}>
                  前 N 条{" "}
                  <InputNumber
                    id={`root-selection-top-${i}`}
                    aria-label="前 N 条"
                    min={0}
                    precision={0}
                    value={项.top}
                    onChange={(top) => 更新表(i, { top: top ?? 0 })}
                  />
                </label>
                <label htmlFor={`root-selection-weight-${i}`}>
                  权重{" "}
                  <InputNumber
                    id={`root-selection-weight-${i}`}
                    aria-label="权重"
                    min={0}
                    value={项.weight}
                    onChange={(weight) => 更新表(i, { weight: weight ?? 1 })}
                  />
                </label>
                <Button
                  disabled={表.length === 1}
                  onClick={() =>
                    设自定义表(表.filter((_, index) => index !== i))
                  }
                >
                  删除此表
                </Button>
              </Flex>
            ))}
            <Flex gap="middle" align="center" wrap>
              <Button
                onClick={() =>
                  设自定义表([
                    ...表,
                    { ...默认表[0]!, position: 全码位.slice(0, -1) },
                  ])
                }
              >
                添加评分表
              </Button>
              <label htmlFor="root-selection-penalty">
                每根罚分{" "}
                <InputNumber
                  id="root-selection-penalty"
                  aria-label="每根罚分"
                  value={罚分}
                  onChange={(value) => 设罚分(value ?? 0)}
                />
              </label>
              <Typography.Text type="secondary">
                前 N 条填 0 时统计全部。
              </Typography.Text>
            </Flex>
          </Flex>
        </Card>
        <Card size="small" title="自动搜索">
          <Flex vertical gap="small">
            <Flex gap="middle" align="center" wrap>
              <Checkbox checked={加} onChange={(e) => 设加(e.target.checked)}>
                加根
              </Checkbox>
              <Checkbox checked={减} onChange={(e) => 设减(e.target.checked)}>
                减根
              </Checkbox>
              <label htmlFor="root-selection-rounds">
                最多轮数{" "}
                <InputNumber
                  id="root-selection-rounds"
                  min={1}
                  precision={0}
                  value={轮数}
                  onChange={(value) => 设轮数(value ?? 1)}
                />
              </label>
              <label htmlFor="root-selection-limit">
                每类候选上限{" "}
                <InputNumber
                  id="root-selection-limit"
                  min={1}
                  precision={0}
                  value={上限}
                  onChange={(value) => 设上限(value ?? 1)}
                />
              </label>
            </Flex>
            <Flex gap="small" wrap>
              {候选来源.map(({ value, label }) => (
                <Checkbox
                  key={value}
                  disabled={!加}
                  checked={来源.includes(value)}
                  onChange={(e) =>
                    设来源(
                      e.target.checked
                        ? [...来源, value]
                        : 来源.filter((项) => 项 !== value),
                    )
                  }
                >
                  {label}
                </Checkbox>
              ))}
            </Flex>
            <Input
              aria-label="手选候选"
              value={候选文本}
              onChange={(e) => 设候选文本(e.target.value)}
              placeholder="手选候选，元素名称以空格分隔"
            />
            <Input
              aria-label="加根键位"
              disabled={!加}
              value={键位文本}
              onChange={(e) => 设键位文本(e.target.value)}
              placeholder="加根键位，多个安排以空格分隔，留空使用字母表首键"
            />
          </Flex>
        </Card>
      </ConfigProvider>
      <Flex gap="small" align="center" wrap>
        <Button type="primary" disabled={运行中} onClick={() => 开始(false)}>
          手动分析
        </Button>
        <Button disabled={运行中 || (!加 && !减)} onClick={() => 开始(true)}>
          开始搜索
        </Button>
        {运行中 && (
          <Button danger onClick={停止}>
            停止
          </Button>
        )}
        <Button
          disabled={运行中 || !可见结果?.changed || 可见结果.missing > 0}
          onClick={应用}
        >
          应用到方案
        </Button>
        {运行中 && (
          <Typography.Text role="status">
            {进度
              ? `第 ${进度.round} 轮 · ${进度.done}/${进度.total} · 当前最佳 ${数字.format(进度.best)}`
              : "正在准备字库和评分基线…"}
          </Typography.Text>
        )}
      </Flex>
      {任务 === 快照 && 错误 && <Alert type="error" showIcon message={错误} />}
      {可见结果 && (
        <Card size="small" title="试算结果">
          <Flex vertical gap="small">
            <Typography.Text>
              总分 {数字.format(可见结果.before)} →{" "}
              {数字.format(可见结果.after)}
              {" · "}根数 {可见结果.rootsBefore} → {可见结果.rootsAfter}
            </Typography.Text>
            {可见结果.missing > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${可见结果.missing} 个词条读音失去编码`}
              />
            )}
            {映射变化.length > 0 && (
              <details>
                <summary>字根映射有 {映射变化.length} 项改动</summary>
                <Table
                  size="small"
                  rowKey="name"
                  dataSource={映射变化}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  columns={[
                    { title: "元素", dataIndex: "name" },
                    {
                      title: "原安排",
                      render: (_, { before }) =>
                        before === undefined ? "—" : 显示安排(before),
                    },
                    {
                      title: "新安排",
                      render: (_, { after }) =>
                        after === undefined ? "—" : 显示安排(after),
                    },
                  ]}
                />
                {!isEqual(
                  配置.form.mapping_space,
                  可见结果.form.mapping_space,
                ) && (
                  <Typography.Text type="secondary">
                    应用时会同步清理关联的备选安排。
                  </Typography.Text>
                )}
              </details>
            )}
            <Table
              size="small"
              pagination={false}
              rowKey="index"
              dataSource={可见结果.tables.map((项, index) => ({
                ...项,
                index,
              }))}
              columns={[
                {
                  title: "评分表",
                  render: (_, { index }) => `表 ${index + 1}`,
                },
                {
                  title: "初态",
                  render: (_, { before }) => 数字.format(before),
                },
                { title: "末态", render: (_, { after }) => 数字.format(after) },
                {
                  title: "变化",
                  render: (_, { before, after }) => 数字.format(after - before),
                },
                {
                  title: "重码组",
                  render: (_, { index }) => (
                    <Button
                      type="link"
                      disabled={!可见结果.groups[index]?.length}
                      onClick={() => 设表明细(index)}
                    >
                      {可见结果.groups[index]?.length ?? 0} 组变化
                    </Button>
                  ),
                },
              ]}
            />
            {可见结果.rounds.length > 0 && (
              <Table
                size="small"
                pagination={false}
                rowKey="round"
                dataSource={可见结果.rounds}
                columns={[
                  { title: "轮次", dataIndex: "round" },
                  { title: "元素", render: (_, { edit }) => edit.name },
                  {
                    title: "安排",
                    render: (_, { edit }) => 显示安排(edit.value),
                  },
                  {
                    title: "总分",
                    render: (_, { score }) => 数字.format(score),
                  },
                ]}
              />
            )}
          </Flex>
        </Card>
      )}
      <Modal
        title={`表 ${(表明细 ?? 0) + 1} 的重码组变化`}
        open={表明细 !== undefined && !!可见结果}
        onCancel={() => 设表明细(undefined)}
        footer={null}
        width={850}
      >
        <Table
          size="small"
          rowKey="键"
          dataSource={可见结果?.groups[表明细 ?? -1] ?? []}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: "元素序列",
              render: (_, { 键 }) => 显示安排(JSON.parse(键) as 元素位或编码[]),
            },
            { title: "初态", render: (_, { 原组 }) => 原组.join("、") || "—" },
            { title: "末态", render: (_, { 新组 }) => 新组.join("、") || "—" },
          ]}
        />
      </Modal>
    </Flex>
  );
}

export default function RootAnalyzerPage() {
  return <选根面板 key={getCurrentId()} />;
}
