import type { 强类型元素位或编码, 部分目标类型 } from "hanzi-chai";
import type { 联合条目 } from "~/atoms";

export const 词名 = (项: 联合条目) => 项.词.map((字) => 字.获取名称()).join("");

export function 码表范围(条目: readonly 联合条目[], 类型: 部分目标类型) {
  const 全码 = 类型.endsWith("_full");
  const 单字 = 类型.startsWith("characters");
  return 条目
    .filter(({ 词 }) => (词.length === 1) === 单字)
    .sort((甲, 乙) => 乙.频率 - 甲.频率)
    .map((条目, id) => ({
      id,
      条目,
      词: 词名(条目),
      频率: 条目.频率,
      码: 全码 ? 条目.全码 : 条目.简码,
      排名: 全码 ? 条目.全码排名 : 条目.简码排名,
    }));
}

export type 原码条目 = ReturnType<typeof 码表范围>[number];

// 与 libchai 0.4.0 指法标记的标准键盘定义一致。这里只统计码表原码中的实际键对。
const 布局 = [
  ["54321", "trewq", "gfdsa", "bvcxz"],
  ["67890-=", "yuiop[]", "hjkl;'", "nm,./"],
];
const 指位 = [1, 1, 2, 3, 4, 4, 4];
const 键位 = new Map(
  布局.flatMap((手, side) =>
    手.flatMap((行, row) =>
      [...行].map(
        (key, col) => [key, { side, row, col, finger: 指位[col]! }] as const,
      ),
    ),
  ),
);

export function 统计原码指法(码: string) {
  const keys = [...码];
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 1; i < keys.length; i++) {
    if (i > 1 && keys[i] === keys[i - 1] && keys[i] === keys[i - 2])
      counts[5]!++;
    const a = 键位.get(keys[i - 1]!);
    const b = 键位.get(keys[i]!);
    if (!a || !b || a.side !== b.side) continue;
    counts[0]!++;
    const rows = Math.abs(a.row - b.row);
    if (a.finger === b.finger) {
      if (rows >= 2) counts[1]!++;
      else if (rows === 1 || Math.abs(a.col - b.col) === 1) counts[2]!++;
    }
    if ((a.finger === 4 && b.finger >= 2) || (b.finger === 4 && a.finger >= 2))
      counts[3]!++;
    const 长指 = (finger: number) => finger === 2 || finger === 3;
    if (
      (长指(a.finger) && a.row > b.row + 1) ||
      (长指(b.finger) && b.row > a.row + 1)
    )
      counts[4]!++;
  }
  return counts;
}

interface 重码分布行 {
  id: string;
  键: string;
  根1: 强类型元素位或编码;
  根2: 强类型元素位或编码;
  数量: number;
  例: string[];
}

const 位键 = (位: 强类型元素位或编码) =>
  typeof 位 === "string"
    ? JSON.stringify([位])
    : JSON.stringify([位.element.获取名称(), 位.index]);

export function 统计重码分布(条目: readonly 联合条目[]) {
  const 按码 = new Map<string, 联合条目[]>();
  for (const 项 of 条目) {
    if (!项.全码) continue;
    const 组 = 按码.get(项.全码);
    if (组) 组.push(项);
    else 按码.set(项.全码, [项]);
  }
  const 行 = new Map<string, 重码分布行>();
  let 重码数 = 0;
  for (const [码, 组] of 按码) {
    if (组.length < 2) continue;
    重码数 += 组.length - 1;
    组.sort((甲, 乙) => 乙.频率 - 甲.频率);
    for (const [i, 键] of [...码].entries()) {
      const 分部 = new Map<string, { 位: 强类型元素位或编码; 词: string[] }>();
      for (const 项 of 组) {
        const 位 = 项.元素序列.元素序列[i];
        if (位 === undefined) continue;
        const id = 位键(位);
        const 桶 = 分部.get(id);
        if (桶) 桶.词.push(词名(项));
        else 分部.set(id, { 位, 词: [词名(项)] });
      }
      const 桶列 = [...分部].sort(([甲], [乙]) =>
        甲 < 乙 ? -1 : 甲 > 乙 ? 1 : 0,
      );
      for (const [a, [名1, 甲]] of 桶列.entries()) {
        for (let b = a + 1; b < 桶列.length; b++) {
          const [名2, 乙] = 桶列[b]!;
          const id = JSON.stringify([键, 名1, 名2]);
          const 当前 = 行.get(id) ?? {
            id,
            键,
            根1: 甲.位,
            根2: 乙.位,
            数量: 0,
            例: [],
          };
          当前.数量 += 甲.词.length * 乙.词.length;
          // 仅保存详情预览用的前几例。大重码组按分桶乘积计数。
          if (当前.例.length < 12) {
            for (const 词1 of 甲.词.slice(0, 12 - 当前.例.length)) {
              const 示例 = 乙.词
                .slice(0, 12 - 当前.例.length)
                .map((词2) => `${词1} / ${词2}`);
              当前.例.push(...示例);
            }
          }
          行.set(id, 当前);
        }
      }
    }
  }
  return { 重码数, 分布: [...行.values()].sort((a, b) => b.数量 - a.数量) };
}
