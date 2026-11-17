import { expect, test } from "bun:test";
import type { 字形数据, 字符数据 } from "../src/data.js";
import {
  创建字形ID分配器,
  字形溢出表,
  格式化字形ID,
  解析字形ID,
} from "../src/glyph-id.js";
import { 补全字形溢出表, 规划新增字形ID } from "../src/glyph-id-allocation.js";
import { 应用字形ID迁移, 规划字形ID迁移 } from "../src/glyph-id-plan.js";

test("字形 ID 的五位十六进制文本无歧义，包含零与上限", () => {
  for (const id of [0, 0xabcd, 0xfffff])
    expect(解析字形ID(格式化字形ID(id))).toBe(id);
  expect(格式化字形ID(0)).toBe("00000");
  expect(解析字形ID("字形-01abc")).toBe(0x01abc);
  expect(解析字形ID("12345")).toBe(0x12345);
  expect(解析字形ID("字形-123")).toBeUndefined();
  for (const text of ["", "123xyz", "100000", "-1", " 123 "])
    expect(解析字形ID(text)).toBeUndefined();
  expect(() => 格式化字形ID(0x100000)).toThrow();
});

test("生成字形从独立生成区分配，跳过既有字形并拒绝溢出", () => {
  const 分配 = 创建字形ID分配器([0xe0000, 0xf0000]);
  expect(分配()).toBe(0xe0001);
  expect(分配()).toBe(0xe0002);
  const 满区 = 创建字形ID分配器([0xeffff], 0xeffff, 0xeffff);
  expect(() => 满区()).toThrow("已满");
});

test("同组第 257 个字形进入溢出区，保留完整排序信息", () => {
  const 字形: 字形数据[] = Array.from({ length: 257 }, (_, index) => ({
    id: index + 1,
    type: "component",
    strokes: Array.from({ length: 4 }, () => ({
      feature: "横",
      start: [1, 2],
      curveList: [{ command: "h", parameterList: [3] }],
    })),
  }));
  const 计划 = 规划字形ID迁移(字形.toReversed(), []);
  expect(计划[0]).toMatchObject({
    old_id: 1,
    id: 0x00300,
    ordinal: 0,
    overflow: false,
  });
  expect(计划[255]).toMatchObject({ old_id: 256, id: 0x003ff, ordinal: 255 });
  expect(计划[256]).toMatchObject({
    old_id: 257,
    id: 0xd7000,
    ordinal: 256,
    remaining_strokes: 4,
    overflow: true,
  });
  const 字符: 字符数据[] = [
    { unicode: 1, glyphs: [{ id: 257, sources: ["G"] }] },
  ];
  const 结果 = 应用字形ID迁移(字形, 字符, 计划);
  expect(结果.characters[0]).toEqual({
    unicode: 1,
    glyphs: [{ id: 0xd7000, sources: ["G"] }],
  });
  expect(结果.glyphs[0]!.strokes).toEqual(字形[0]!.strokes);
  expect(字形[0]!.id).toBe(1);
});

const 两横 = {
  type: "component" as const,
  strokes: [20, 80].map((y) => ({
    feature: "横" as const,
    start: [10, y] as [number, number],
    curveList: [{ command: "h" as const, parameterList: [80] as [number] }],
  })),
};

test("新增按分组尾部追加，同批按笔顺分配，既有编号和输入顺序保持不变", () => {
  const 已有 = [
    { ...两横, id: 0x00100 },
    { ...两横, id: 0x00102 },
  ];
  const 输入快照 = structuredClone(已有);
  const 两点 = {
    ...两横,
    strokes: 两横.strokes.map((s) => ({ ...s, feature: "点" as const })),
  };
  const 结果 = 规划新增字形ID(已有, [两点, 两横], []);
  expect(结果.map((x) => x.id)).toEqual([0x00104, 0x00103]);
  expect(结果.map((x) => x.stroke_sequence)).toEqual(["44", "11"]);
  expect(已有).toEqual(输入快照);
});

test("新增复合体与全库迁移复用同一归部、余笔和笔顺计算", () => {
  const 已有: 字形数据[] = [
    { ...两横, id: 0x00100 },
    { ...两横, id: 0x00101 },
  ];
  const 新增 = {
    type: "compound" as const,
    operator: "⿰" as const,
    references: [{ id: 0x00100 }, { id: 0x00101 }],
  };
  const 部首表 = [{ number: 18, name: "测试", glyph_ids: [0x00100] }];
  const [结果] = 规划新增字形ID(已有, [新增], 部首表);
  expect(结果).toMatchObject({
    id: 0x12100,
    radical_number: 18,
    remaining_strokes: 2,
    stroke_sequence: "1111",
  });
  const 迁移 = 规划字形ID迁移([...已有, { ...新增, id: 0xf0000 }], 部首表);
  expect(迁移.find((x) => x.old_id === 0xf0000)).toMatchObject({
    radical_number: 结果!.radical_number,
    remaining_strokes: 结果!.remaining_strokes,
    stroke_sequence: 结果!.stroke_sequence,
  });
});

test("满组进入溢出区，重载后识别动态溢出字形，始终避开方案生成区", () => {
  const 已有: 字形数据[] = Array.from({ length: 256 }, (_, i) => ({
    ...两横,
    id: 0x00100 + i,
  }));
  const 首个溢出 =
    Math.max(...Object.keys(字形溢出表).map((id) => Number.parseInt(id, 16))) +
    1;
  const [第一] = 规划新增字形ID(已有, [两横], []);
  expect(第一).toMatchObject({ id: 首个溢出, ordinal: 256, overflow: true });
  已有.push({ ...两横, id: 第一!.id });
  const [第二] = 规划新增字形ID(已有, [两横], []);
  expect(第二).toMatchObject({
    id: 首个溢出 + 1,
    ordinal: 257,
    overflow: true,
  });
  expect(第二!.id).toBeLessThan(0xe0000);
  expect(补全字形溢出表(已有, [])[格式化字形ID(第一!.id)]).toMatchObject({
    radical_number: 0,
    remaining_strokes: 2,
    stroke_sequence: "11",
    ordinal: 256,
  });
  已有.push({ ...两横, id: 0xdffff });
  expect(() => 规划新增字形ID(已有, [两横], [])).toThrow("溢出区已满");
});

test("新增拒绝空部件、缺失引用和循环引用，不分配部分结果", () => {
  expect(() =>
    规划新增字形ID([], [{ type: "component", strokes: [] }], []),
  ).toThrow("余笔数为 0");
  const 新增 = {
    type: "compound" as const,
    operator: "⿰" as const,
    references: [{ id: 1 }, { id: 2 }],
  };
  expect(() => 规划新增字形ID([], [两横, 新增], [])).toThrow("不存在");
  const 循环 = { ...新增, id: 1, references: [{ id: 1 }, { id: 1 }] };
  expect(() => 规划新增字形ID([循环], [新增], [])).toThrow("循环引用");
});
