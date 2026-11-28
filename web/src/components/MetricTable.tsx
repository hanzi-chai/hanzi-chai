import type { TableColumnsType } from "antd";
import { Button, Flex, Modal, message, Select, Table, Typography } from "antd";
import {
  type 层级指标,
  指法标签列表,
  type 部分指标,
  type 部分目标类型,
} from "hanzi-chai";
import { useMemo, useState } from "react";
import {
  useAtomValue,
  useAtomValueUnwrapped,
  如编码结果原子,
  方案序列号原子,
  联合结果原子,
  部分目标类型名称映射,
} from "~/atoms";
import { type 原码条目, 码表范围, 统计原码指法 } from "~/encoding-insights";
import { 清除编码快照 } from "~/encoding-snapshot";
import { use多重排序 } from "./table-sort";

const 分组选项 = ["效率", "离散", "手感"] as const;
type 分组 = (typeof 分组选项)[number];
const 类型列 = Object.keys(部分目标类型名称映射) as 部分目标类型[];
const 排名格式 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });
const 比例格式 = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 3,
});

interface 指标行 {
  id: string;
  名称: string;
  指标: 层级指标 | 部分指标;
}
interface 指标列 {
  标签: string;
  值: (指标: 层级指标 | 部分指标) => number | null | undefined;
  匹配: (项: 原码条目) => boolean;
  比例?: boolean;
}

function 原码明细({
  类型,
  列,
  行,
}: {
  类型: 部分目标类型;
  列: 指标列;
  行: 指标行;
}) {
  const 条目 = useAtomValueUnwrapped(联合结果原子);
  const 范围 = useMemo(() => {
    const data = 码表范围(条目, 类型);
    const top = 行.指标.top;
    return (top == null ? data : data.slice(0, top)).filter(列.匹配);
  }, [条目, 类型, 列, 行]);
  return (
    <>
      <Typography.Paragraph type="secondary">
        共 {范围.length}{" "}
        条。明细按码表原码列出相关词条，汇总值由编码引擎按实际按键计算。
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        dataSource={范围}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "字词", dataIndex: "词" },
          { title: "原码", dataIndex: "码" },
          {
            title: "排名",
            dataIndex: "排名",
            render: (rank: number) => Math.abs(rank) + 1,
          },
          { title: "词频", dataIndex: "频率" },
        ]}
      />
    </>
  );
}

export default function MetricTable() {
  const 方案 = useAtomValue(方案序列号原子);
  const [, 评估] = useAtomValueUnwrapped(如编码结果原子);
  const 可用类型 = 类型列.filter((x) => 评估[x] != null);
  const [类型选择, 设类型] = useState<部分目标类型>();
  const [分组, 设分组] = useState<分组[]>([...分组选项]);
  const [明细, 设明细] = useState<{
    行: 指标行;
    列: 指标列;
    类型: 部分目标类型;
  }>();
  const { 列排序, onChange } = use多重排序<指标行>("指标");
  const 类型 = 类型选择 && 可用类型.includes(类型选择) ? 类型选择 : 可用类型[0];
  if (类型 === undefined)
    return <Typography.Text>暂无编码指标</Typography.Text>;
  const 指标 = 评估[类型]!;
  const 行: 指标行[] = [
    ...(指标.tiers ?? []).map((项, i) => ({
      id: `tier-${i}`,
      名称: 项.top == null ? "全部" : `前 ${项.top}`,
      指标: 项,
    })),
    { id: "weighted", 名称: "加权", 指标 },
  ];
  const 内容: Record<分组, 指标列[]> = {
    效率: (指标.levels ?? []).map(({ length }) => ({
      标签: `${length} 键`,
      值: (项) =>
        项.levels?.find((level) => level.length === length)?.frequency,
      匹配: ({ 码 }) => [...码].length === length,
      比例: true,
    })),
    离散: [
      {
        标签: "重码",
        值: (项) => 项.duplication,
        匹配: ({ 排名 }) => 排名 !== 0,
        比例: true,
      },
    ],
    手感: [
      {
        标签: "当量",
        值: (项) =>
          "pair_equivalence" in 项 ? 项.pair_equivalence : undefined,
        匹配: ({ 码 }) => [...码].length > 1,
      },
      ...指法标签列表.slice(0, 6).flatMap((标签, i): 指标列[] =>
        指标.fingering?.[i] == null
          ? []
          : [
              {
                标签,
                值: (项) => 项.fingering?.[i],
                匹配: ({ 码 }) => 统计原码指法(码)[i]! > 0,
                比例: true,
              },
            ],
      ),
    ],
  };
  const 列: TableColumnsType<指标行> = [
    { title: "层级", dataIndex: "名称", fixed: "left", width: 100 },
    ...分组选项
      .filter((组) => 分组.includes(组) && 内容[组].length > 0)
      .map((组) => ({
        title: 组,
        children: 内容[组].map((项, i) => ({
          ...列排序(
            `${组}-${i}`,
            项.标签,
            (a, b) =>
              (项.值(a.指标) ?? -Infinity) - (项.值(b.指标) ?? -Infinity),
          ),
          width: 115,
          render: (_: unknown, record: 指标行) => {
            const value = 项.值(record.指标);
            if (value == null || !Number.isFinite(value)) return "—";
            const 显示值 =
              record.id === "weighted" && 项.比例
                ? 比例格式.format(value)
                : 排名格式.format(value);
            return (
              <Button
                type="link"
                size="small"
                onClick={() => 设明细({ 行: record, 列: 项, 类型 })}
              >
                {显示值}
              </Button>
            );
          },
        })),
      })),
  ];
  return (
    <Flex vertical gap="small">
      <Flex gap="small" wrap>
        <Select
          aria-label="编码范围"
          value={类型}
          onChange={设类型}
          options={可用类型.map((value) => ({
            value,
            label: 部分目标类型名称映射[value],
          }))}
        />
        <Select
          mode="multiple"
          aria-label="显示指标"
          value={分组}
          onChange={设分组}
          options={分组选项.map((value) => ({ value, label: value }))}
          style={{ minWidth: 200 }}
        />
        <Button
          onClick={() => {
            void 清除编码快照(方案).then(
              () => message.success("已清除该方案的浏览器编码快照"),
              () => message.error("无法清除浏览器编码快照"),
            );
          }}
        >
          清除编码快照
        </Button>
      </Flex>
      <Table
        rowKey="id"
        size="small"
        columns={列}
        dataSource={行}
        onChange={onChange}
        scroll={{ x: "max-content" }}
        pagination={false}
      />
      <Modal
        open={明细 !== undefined}
        title={明细 && `${明细.行.名称} · ${明细.列.标签}原码明细`}
        onCancel={() => 设明细(undefined)}
        footer={null}
      >
        {明细 && <原码明细 {...明细} />}
      </Modal>
    </Flex>
  );
}
