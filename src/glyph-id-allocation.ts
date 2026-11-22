import type { 复合体数据, 字形数据, 部件数据 } from "./data.js";
import { 包围变形字形ID } from "./enclosure.js";
import {
  type 字形溢出信息,
  字形溢出表,
  格式化字形ID,
  溢出字形终点,
  溢出字形起点,
} from "./glyph-id.js";
import { 字形归部检索, type 字形编号分组 } from "./glyph-radical.js";
import { type 康熙部首定义, 康熙部首表 } from "./kangxi-radicals.js";

export type 新增字形数据 = Omit<部件数据, "id"> | Omit<复合体数据, "id">;
export interface 字形ID分配结果 extends 字形编号分组 {
  id: number;
  ordinal: number;
  overflow: boolean;
}

const 分组键 = (信息: Pick<字形编号分组, "radical_number" | "stroke_bucket">) =>
  信息.radical_number * 16 + 信息.stroke_bucket;
const 已退役编号 = new Set(包围变形字形ID);

function 编号状态(字形列表: readonly 字形数据[], 检索: 字形归部检索) {
  const 下个序号 = new Map<number, number>();
  const 溢出表 = { ...字形溢出表 };
  let 溢出ID = 溢出字形起点;
  const 记录 = (组: number, 序号: number) =>
    下个序号.set(组, Math.max(下个序号.get(组) ?? 0, 序号 + 1));
  // 冻结表中的已删除编号也保留，避免复用历史溢出 ID。
  for (const [id, 信息] of Object.entries(溢出表)) {
    溢出ID = Math.max(溢出ID, Number.parseInt(id, 16) + 1);
    记录(
      信息.radical_number * 16 + Math.min(16, 信息.remaining_strokes) - 1,
      信息.ordinal,
    );
  }
  const 动态溢出: number[] = [];
  for (const { id } of 字形列表) {
    if (id < 溢出字形起点) 记录(id >>> 8, id & 255);
    else if (id <= 溢出字形终点) {
      溢出ID = Math.max(溢出ID, id + 1);
      if (!溢出表[格式化字形ID(id)]) 动态溢出.push(id);
    }
  }
  // 线上新增的溢出字形无需等待静态表发布，按实际引用树恢复所属分组。
  for (const id of 动态溢出.sort((a, b) => a - b)) {
    const 信息 = 检索.获取编号分组(id);
    const 组 = 分组键(信息);
    const ordinal = Math.max(256, 下个序号.get(组) ?? 0);
    溢出表[格式化字形ID(id)] = { ...信息, ordinal };
    记录(组, ordinal);
  }
  return { 下个序号, 溢出表, 溢出ID };
}

/** 补充冻结快照之后由线上 API 创建的溢出字形信息，不改变已有编号。 */
export function 补全字形溢出表(
  字形列表: readonly 字形数据[],
  部首表: readonly 康熙部首定义[] = 康熙部首表,
): Readonly<Record<string, 字形溢出信息>> {
  return 编号状态(字形列表, new 字形归部检索(字形列表, 部首表)).溢出表;
}

/** 按部首、余笔分组追加正式编号；同批同组按笔顺排序，不重排既有 ID。 */
export function 规划新增字形ID(
  已有字形: readonly 字形数据[],
  新增字形: readonly 新增字形数据[],
  部首表: readonly 康熙部首定义[] = 康熙部首表,
): 字形ID分配结果[] {
  // 负数仅在本函数内定位待创建项，不接受它们作为正式引用。
  const 临时字形 = 新增字形.map(
    (字形, index) => ({ ...字形, id: -index - 1 }) as 字形数据,
  );
  if (已有字形.some(({ id }) => id < 0)) throw new Error("既有字形 ID 不合法");
  for (const 字形 of 临时字形)
    if (字形.references?.some(({ id }) => id < 0))
      throw new Error("新增字形必须引用已有正式字形");
  const 检索 = new 字形归部检索([...已有字形, ...临时字形], 部首表);
  const 状态 = 编号状态(已有字形, 检索);
  const 待分配 = 临时字形
    .map((字形, index) => ({
      index,
      ...检索.获取编号分组(字形.id),
    }))
    .sort(
      (a, b) =>
        分组键(a) - 分组键(b) ||
        (a.stroke_sequence < b.stroke_sequence
          ? -1
          : a.stroke_sequence > b.stroke_sequence
            ? 1
            : 0) ||
        a.index - b.index,
    );
  const 结果: 字形ID分配结果[] = [];
  for (const { index, ...信息 } of 待分配) {
    const 组 = 分组键(信息);
    let ordinal = 状态.下个序号.get(组) ?? 0;
    while (ordinal < 256 && 已退役编号.has(组 * 256 + ordinal)) ordinal++;
    const overflow = ordinal >= 256;
    if (overflow) while (已退役编号.has(状态.溢出ID)) 状态.溢出ID++;
    if (overflow && 状态.溢出ID > 溢出字形终点)
      throw new Error("字形 ID 溢出区已满");
    const id = overflow ? 状态.溢出ID++ : 组 * 256 + ordinal;
    状态.下个序号.set(组, ordinal + 1);
    结果[index] = { ...信息, id, ordinal, overflow };
  }
  return 结果;
}
