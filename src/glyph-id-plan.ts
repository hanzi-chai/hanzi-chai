import type { 字形数据, 字符数据 } from "./data.js";
import { 溢出字形终点, 溢出字形起点 } from "./glyph-id.js";
import { 字形归部检索 } from "./glyph-radical.js";
import type { 康熙部首定义 } from "./kangxi-radicals.js";

export interface 字形ID迁移条目 {
  old_id: number;
  id: number;
  radical_number: number;
  remaining_strokes: number;
  stroke_bucket: number;
  stroke_sequence: string;
  ordinal: number;
  overflow: boolean;
}

/** 固定全库快照后分配一次；新增字形不能重新运行全库排序来改变已有 ID。 */
export function 规划字形ID迁移(
  字形列表: readonly 字形数据[],
  部首表: readonly 康熙部首定义[],
): 字形ID迁移条目[] {
  const 检索 = new 字形归部检索(字形列表, 部首表);
  const 分组 = new Map<number, 字形ID迁移条目[]>();
  for (const 字形 of 字形列表) {
    const 信息 = 检索.获取编号分组(字形.id);
    const 组ID = 信息.radical_number * 16 + 信息.stroke_bucket;
    const 组 = 分组.get(组ID) ?? [];
    组.push({
      old_id: 字形.id,
      id: -1,
      ...信息,
      ordinal: -1,
      overflow: false,
    });
    分组.set(组ID, 组);
  }
  let 溢出ID = 溢出字形起点;
  const 计划: 字形ID迁移条目[] = [];
  for (const [组ID, 组] of [...分组].sort(([a], [b]) => a - b)) {
    组.sort(
      (a, b) =>
        (a.stroke_sequence < b.stroke_sequence
          ? -1
          : a.stroke_sequence > b.stroke_sequence
            ? 1
            : 0) || a.old_id - b.old_id,
    );
    for (const [序号, 条目] of 组.entries()) {
      const 溢出 = 序号 >= 256;
      if (溢出 && 溢出ID > 溢出字形终点) throw new Error("字形 ID 溢出区已满");
      计划.push({
        ...条目,
        id: 溢出 ? 溢出ID++ : 组ID * 256 + 序号,
        ordinal: 序号,
        overflow: 溢出,
      });
    }
  }
  return 计划;
}

/** 仅改写字形 ID 与引用 ID；Unicode、坐标、笔画索引和来源保持原值。 */
export function 应用字形ID迁移(
  字形列表: readonly 字形数据[],
  字符列表: readonly 字符数据[],
  计划: readonly 字形ID迁移条目[],
) {
  const 映射 = new Map(计划.map((条目) => [条目.old_id, 条目.id]));
  if (
    映射.size !== 字形列表.length ||
    new Set(映射.values()).size !== 映射.size
  )
    throw new Error("字形 ID 迁移计划不完整或存在重复 ID");
  const 转换 = (id: number) => {
    const 新ID = 映射.get(id);
    if (新ID === undefined) throw new Error(`字形 ${id} 不在迁移计划中`);
    return 新ID;
  };
  return {
    glyphs: 字形列表.map((字形) => ({
      ...字形,
      id: 转换(字形.id),
      ...(字形.references
        ? {
            references: 字形.references.map((引用) => ({
              ...引用,
              id: 转换(引用.id),
            })),
          }
        : {}),
    })) as 字形数据[],
    characters: 字符列表.map((字符) => ({
      ...字符,
      glyphs: 字符.glyphs.map((字形) => ({ ...字形, id: 转换(字形.id) })),
    })),
  };
}
