import {
  Alert,
  Button,
  Flex,
  Modal,
  Select,
  Skeleton,
  Table,
  Tabs,
  Typography,
} from "antd";
import {
  type 元素,
  归并组装结果,
  指法标签列表,
  生成,
  type 编码结果,
  type 评估指标,
  type 部分目标类型,
} from "hanzi-chai";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useAtomValue,
  useAtomValueUnwrapped,
  全部合法元素原子,
  如前端输入原子,
  字母表原子,
  强类型决策原子,
  联合结果原子,
  部分目标类型名称映射,
  默认目标原子,
  默认目标类型原子,
} from "~/atoms";
import { 码表范围, 统计原码指法 } from "~/encoding-insights";
import { thread } from "~/utils";
import { ErrorBoundary } from "./Error";

type 预测项 = { key: string; 重码?: number; 当量?: number };
const 百分比 = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 3,
});
const 数字 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 });

function 落键试算({ 元素, 类型 }: { 元素: 元素; 类型: 部分目标类型 }) {
  const 输入 = useAtomValueUnwrapped(如前端输入原子);
  const 字母 = useAtomValue(字母表原子);
  const 目标 = useAtomValue(默认目标原子);
  const { 名称映射 } = useAtomValueUnwrapped(全部合法元素原子);
  const 安排 = Object.entries(输入.配置.form.mapping).find(
    ([名称]) => 名称映射.get(名称) === 元素,
  );
  const 直接安排 = 安排?.[1];
  const 首键 =
    typeof 直接安排 === "string"
      ? [...直接安排][0]
      : Array.isArray(直接安排)
        ? 直接安排[0]
        : undefined;
  const [试算键, 设试算键] = useState<string[]>([]);
  const [结果, 设结果] = useState<{
    输入: typeof 输入;
    类型: 部分目标类型;
    rows: 预测项[];
  }>();
  const [错误, 设错误] = useState("");
  const [运行中, 设运行中] = useState(false);
  const 作业 = useRef<AbortController>();
  useEffect(() => () => 作业.current?.abort(), []);

  const 运行 = async () => {
    if (!安排 || typeof 首键 !== "string" || !目标[类型]) return;
    const [名称, 原] = 安排;
    const job = new AbortController();
    作业.current = job;
    设结果({ 输入, 类型, rows: [] });
    设运行中(true);
    设错误("");
    const { tiers: _, ...部分目标 } = 目标[类型]!;
    const 结果列: 预测项[] = [];
    try {
      for (const key of new Set([首键, ...试算键])) {
        if (job.signal.aborted) return;
        const 新安排 =
          typeof 原 === "string"
            ? key + [...原].slice(1).join("")
            : Array.isArray(原)
              ? [key, ...原.slice(1)]
              : 原;
        const 配置 = 生成({
          ...输入.配置,
          form: {
            ...输入.配置.form,
            mapping: { ...输入.配置.form.mapping, [名称]: 新安排 },
          },
        });
        const [, 评估] = await thread.spawn<[编码结果, 评估指标]>("encode", [
          { ...输入, 配置 },
          { [类型]: 部分目标 },
        ]);
        if (job.signal.aborted) return;
        结果列.push({
          key,
          重码: 评估[类型]?.duplication,
          当量: 评估[类型]?.pair_equivalence,
        });
        设结果({ 输入, 类型, rows: [...结果列] });
      }
    } catch (e) {
      if (!job.signal.aborted)
        设错误(e instanceof Error ? e.message : String(e));
    } finally {
      if (!job.signal.aborted) 设运行中(false);
    }
  };
  if (typeof 首键 !== "string")
    return (
      <Typography.Text>
        请选择首码直接安排到键位的元素进行试算。
      </Typography.Text>
    );
  const rows = 结果?.输入 === 输入 && 结果.类型 === 类型 ? 结果.rows : [];
  const 显示 = (value: number | undefined, formatter: Intl.NumberFormat) =>
    value != null && Number.isFinite(value) ? formatter.format(value) : "—";
  return (
    <Flex vertical gap="small">
      <Typography.Text type="secondary">
        固定当前组装结果，使用编码引擎重算首码换键后的加权指标。
      </Typography.Text>
      <Flex gap="small">
        <Select
          mode="multiple"
          aria-label="候选键位"
          placeholder="选择候选键位"
          style={{ minWidth: 180 }}
          disabled={运行中}
          value={试算键}
          onChange={设试算键}
          options={[...new Set(字母)]
            .filter((value) => value !== 首键)
            .map((value) => ({ value, label: value }))}
        />
        <Button
          onClick={() => void 运行()}
          loading={运行中}
          disabled={!试算键.length}
        >
          落键试算
        </Button>
        {运行中 && (
          <Button
            onClick={() => {
              作业.current?.abort();
              设运行中(false);
            }}
          >
            停止
          </Button>
        )}
      </Flex>
      {错误 && <Alert message={错误} type="error" showIcon />}
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: "首键",
            render: (_, { key }) => (key === 首键 ? `${key}（当前）` : key),
          },
          { title: "加权重码", render: (_, { 重码 }) => 显示(重码, 百分比) },
          { title: "组合当量", render: (_, { 当量 }) => 显示(当量, 数字) },
        ]}
      />
    </Flex>
  );
}

function 当前洞察({ 元素 }: { 元素: 元素 }) {
  const 条目 = useAtomValueUnwrapped(联合结果原子);
  const 决策 = useAtomValueUnwrapped(强类型决策原子);
  const 类型列 = useAtomValue(默认目标类型原子);
  const [类型选择, 设类型] = useState<部分目标类型>();
  const 类型 = 类型选择 && 类型列.includes(类型选择) ? 类型选择 : 类型列[0]!;
  const [页签, 设页签] = useState("重码");
  const 概览 = useMemo(() => {
    if (页签 === "预测") return undefined;
    const 范围 = 码表范围(条目, 类型);
    const 匹配 = (
      项: Pick<(typeof 范围)[number]["条目"], "元素序列">,
      码长: number,
    ) =>
      项.元素序列.元素序列.some(
        (位, i) => i < 码长 && typeof 位 !== "string" && 位.element === 元素,
      );
    const 明细 = 范围.filter((项) => 项.码.length > 0);
    const 归并 = 归并组装结果(
      明细.map((项) => 项.条目),
      决策,
    );
    const 次数 = new Map<string, number>();
    for (const { 码 } of 明细) 次数.set(码, (次数.get(码) ?? 0) + 1);
    const 相关 = 明细.filter(({ 条目, 码 }, i) => {
      const 码长 = [...码].length;
      return 匹配(条目, 码长) || 匹配(归并[i]!, 码长);
    });
    const 重码 = 相关.flatMap((项) => {
      const count = 次数.get(项.码) ?? 0;
      return count > 1 ? [{ ...项, count }] : [];
    });
    const 手感 =
      页签 === "手感"
        ? 相关.flatMap((项) => {
            const 标记 = 统计原码指法(项.码)
              .slice(1)
              .flatMap((n, i) =>
                n > 0 ? [`${指法标签列表[i + 1]} × ${n}`] : [],
              );
            return 标记.length ? [{ ...项, 标记 }] : [];
          })
        : [];
    return { 相关: 相关.length, 重码, 手感 };
  }, [条目, 决策, 元素, 类型, 页签]);
  return (
    <Flex vertical gap="small">
      <Select
        aria-label="洞察编码范围"
        value={类型}
        onChange={设类型}
        options={类型列.map((value) => ({
          value,
          label: 部分目标类型名称映射[value],
        }))}
      />
      <Tabs
        activeKey={页签}
        onChange={设页签}
        items={[
          { key: "重码", label: "选重" },
          { key: "手感", label: "手感" },
          { key: "预测", label: "预测" },
        ]}
      />
      {页签 === "预测" && <落键试算 key={类型} 元素={元素} 类型={类型} />}
      {页签 === "重码" && 概览 && (
        <>
          <Typography.Text>
            相关条目 {概览.相关}，原码重码条目 {概览.重码.length}。
          </Typography.Text>
          <Table
            rowKey="id"
            size="small"
            dataSource={概览.重码}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: "词", dataIndex: "词" },
              { title: "原码", dataIndex: "码" },
              { title: "同码条目", dataIndex: "count" },
              { title: "词频", dataIndex: "频率" },
            ]}
          />
        </>
      )}
      {页签 === "手感" && 概览 && (
        <>
          <Typography.Text>按含此元素的条目统计其原码指法。</Typography.Text>
          <Table
            rowKey="id"
            size="small"
            dataSource={概览.手感}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: "词", dataIndex: "词" },
              { title: "原码", dataIndex: "码" },
              { title: "指法", render: (_, { 标记 }) => 标记.join("、") },
              { title: "词频", dataIndex: "频率" },
            ]}
          />
        </>
      )}
    </Flex>
  );
}

export default function ElementInsights({ 元素 }: { 元素: 元素 }) {
  const [打开, 设打开] = useState(false);
  return (
    <>
      <Button onClick={() => 设打开(true)}>洞察</Button>
      <Modal
        open={打开}
        onCancel={() => 设打开(false)}
        title={`「${元素.获取名称()}」的编码洞察`}
        width={700}
        footer={null}
      >
        {打开 && (
          <ErrorBoundary>
            <Suspense fallback={<Skeleton active />}>
              <当前洞察 元素={元素} />
            </Suspense>
          </ErrorBoundary>
        )}
      </Modal>
    </>
  );
}
