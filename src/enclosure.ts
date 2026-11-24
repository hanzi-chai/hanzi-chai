import outlines from "../data/enclosure-outlines.json" with { type: "json" };
import type { 引用数据, 矢量图形数据, 结构描述字符 } from "./data.js";
import table from "./enclosure-layouts.json" with { type: "json" };

export type 包围内部范围 = Required<
  Pick<引用数据, "xbegin" | "ybegin" | "xend" | "yend">
>;
export interface 包围布局规则 {
  rectangle: 包围内部范围;
  rectangles?: Partial<Record<结构描述字符, 包围内部范围>>;
}

export const 包围结构列表 = [
  "⿴",
  "⿵",
  "⿶",
  "⿷",
  "⿸",
  "⿹",
  "⿺",
  "⿼",
  "⿽",
] as const;
export const 是包围结构 = (
  operator?: 结构描述字符,
): operator is (typeof 包围结构列表)[number] =>
  operator !== undefined &&
  (包围结构列表 as readonly string[]).includes(operator);

export const 包围内部范围表: Readonly<Record<string, 包围布局规则>> =
  table.rules;

const 外框轮廓表 = outlines as unknown as Readonly<
  Partial<Record<number, 矢量图形数据>>
>;

/** 原变形外框的编号已退役，字库分配新 ID 时避开。 */
export const 包围变形字形ID: readonly number[] =
  Object.keys(外框轮廓表).map(Number);

const 包围结构外框表 = table.operators as Readonly<
  Partial<Record<结构描述字符, Readonly<Partial<Record<number, number>>>>>
>;

function 获取包围布局编号(
  outer: 引用数据 | undefined,
  operator?: 结构描述字符,
): number | undefined {
  if (outer && 是包围结构(operator))
    return 包围结构外框表[operator]?.[outer.id];
}

/** 外框轮廓以原字形的画布为坐标系，与内件矩形一起参与仿射布局。 */
export function 获取包围外框笔画(
  outer: 引用数据 | undefined,
  operator?: 结构描述字符,
  inner?: 引用数据,
): 矢量图形数据 | undefined {
  if (operator === "⿻" && outer && inner) {
    const 重叠轮廓表: Readonly<
      Record<string, Readonly<Record<string, number>>>
    > = table.overlaps;
    const 编号 = 重叠轮廓表[outer.id]?.[inner.id];
    return 编号 === undefined ? undefined : 外框轮廓表[编号];
  }
  const 布局 = 获取包围布局编号(outer, operator);
  if (布局 !== undefined) return 外框轮廓表[布局];
}

/** 显式引用坐标仍由调用方优先采用；此表提供内件的默认范围。 */
export function 获取包围内部范围(
  outer: 引用数据 | undefined,
  operator?: 结构描述字符,
): 包围内部范围 | undefined {
  if (!outer || !是包围结构(operator)) return undefined;
  const 布局 = 获取包围布局编号(outer, operator) ?? outer.id;
  const rule = 包围内部范围表[布局];
  if (!rule) return undefined;
  const r = rule.rectangles?.[operator] ?? rule.rectangle;
  const xb = outer.xbegin ?? 0,
    yb = outer.ybegin ?? 0;
  const width = (outer.xend ?? 100) - xb,
    height = (outer.yend ?? 100) - yb;
  return {
    xbegin: xb + (r.xbegin * width) / 100,
    xend: xb + (r.xend * width) / 100,
    ybegin: yb + (r.ybegin * height) / 100,
    yend: yb + (r.yend * height) / 100,
  };
}
