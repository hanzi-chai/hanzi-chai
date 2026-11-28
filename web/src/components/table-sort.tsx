import type { TableProps } from "antd";
import { Badge, Flex } from "antd";
import { atomWithStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";
import { useAtom, useAtomValue, 方案序列号原子 } from "~/atoms";

type 排序 = { key: string; order: "ascend" | "descend" };
const 排序存储 = atomFamily((id: string) =>
  atomWithStorage<排序[]>(`chai.table-sort:${id}`, []),
);

export function use多重排序<T>(表: string, 有效列?: readonly string[]) {
  const 方案 = useAtomValue(方案序列号原子);
  const [保存排序, 设排序] = useAtom(排序存储(`${方案}:${表}`));
  const 排序 = 有效列
    ? 保存排序.filter(({ key }) => 有效列.includes(key))
    : 保存排序;
  const 列排序 = (
    key: string,
    标题: string,
    compare: (a: T, b: T) => number,
  ) => {
    const i = 排序.findIndex((项) => 项.key === key);
    return {
      key,
      title:
        i < 0 ? (
          标题
        ) : (
          <Flex align="center" gap="small">
            {标题}
            <Badge count={i + 1} size="small" color="#1677ff" />
          </Flex>
        ),
      sortOrder: 排序[i]?.order ?? null,
      sorter: { compare, multiple: i < 0 ? 1 : 排序.length - i + 1 },
    };
  };
  const onChange: NonNullable<TableProps<T>["onChange"]> = (
    _,
    __,
    sorter,
    extra,
  ) => {
    if (extra.action !== "sort") return;
    const 项 = (Array.isArray(sorter) ? sorter : [sorter]).flatMap(
      ({ columnKey, order }) =>
        typeof columnKey === "string" && order
          ? [{ key: columnKey, order }]
          : [],
    );
    const 新次序 = new Map(项.map((x) => [x.key, x]));
    const 原列 = new Set(排序.map((x) => x.key));
    设排序([
      ...排序.flatMap(({ key }) => (新次序.has(key) ? [新次序.get(key)!] : [])),
      ...项.filter(({ key }) => !原列.has(key)),
    ]);
  };
  return { 列排序, onChange };
}
