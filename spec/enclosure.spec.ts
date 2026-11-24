import { describe, expect, it } from "bun:test";
import { 图形盒子 } from "../src/affine.js";
import type { 引用数据, 结构描述字符 } from "../src/data.js";
import { 包围内部范围表, 获取包围内部范围 } from "../src/enclosure.js";
import { 字形库 } from "../src/repertoire.js";
import { 仿射合并 } from "../src/utils.js";

const outer = 图形盒子.从笔画列表构建([
  {
    feature: "竖",
    start: [0, 0],
    curveList: [{ command: "v", parameterList: [100] }],
  },
]);
const inner = 图形盒子.从笔画列表构建([
  {
    feature: "横",
    start: [0, 0],
    curveList: [{ command: "h", parameterList: [100] }],
  },
]);
const render = (
  id: number,
  ref: 引用数据 = { id: 1 },
  op: 结构描述字符 = "⿸",
) => 仿射合并([outer, inner], [{ id }, ref], op).获取笔画列表().at(-1)!;

describe("包围内部范围", () => {
  it("广的内部使用已审核的全局范围", () => {
    expect(render(0x002a5)).toEqual({
      feature: "横",
      start: [23, 22],
      curveList: [{ command: "h", parameterList: [73] }],
    });
  });
  it("按原形和结构符自动使用户的内件范围", () => {
    expect(render(0x003e3, { id: 1 }, "⿸")).toEqual({
      feature: "横",
      start: [24, 38],
      curveList: [{ command: "h", parameterList: [72] }],
    });
    expect(获取包围内部范围({ id: 0x003e3 }, "⿴")).toBeUndefined();
  });
  it("未登记外框保留原来的半幅布局", () => {
    expect(render(999999)).toEqual({
      feature: "横",
      start: [40, 40],
      curveList: [{ command: "h", parameterList: [50] }],
    });
  });
  it("显式内件坐标优先，部分指定也能覆盖对应方向", () => {
    expect(
      render(0x002a5, { id: 1, xbegin: 4, ybegin: 10, xend: 20, yend: 50 })
        .start,
    ).toEqual([4, 10]);
    expect(render(0x002a5, { id: 1, ybegin: 60 }).start).toEqual([23, 60]);
  });
  it("同一字形作为普通左右结构的部分时不使用包围范围", () => {
    expect(render(0x002a5, { id: 1 }, "⿰")).toEqual(
      render(999999, { id: 1 }, "⿰"),
    );
    expect(获取包围内部范围({ id: 0x002a5 }, "⿱")).toBeUndefined();
  });
  it("外框本身缩放平移时，内件范围随同变换", () => {
    const r = 获取包围内部范围(
      { id: 0x002a5, xbegin: 10, ybegin: 20, xend: 90, yend: 80 },
      "⿸",
    )!;
    expect(r.xbegin).toBeCloseTo(28.4);
    expect(r.xend).toBeCloseTo(86.8);
    expect(r.ybegin).toBeCloseTo(33.2);
    expect(r.yend).toBeCloseTo(78.8);
  });
  it("外框布局同时替换轮廓和默认内件范围", () => {
    const 布局 = 0x00230;
    const 引用 = { id: 0x0022d };
    const 绘制 = 仿射合并([outer, inner], [引用, { id: 1 }], "⿺");
    const 笔画 = 绘制.获取笔画列表();
    const { xbegin, ybegin } = 包围内部范围表[布局]!.rectangle;
    expect(笔画.length).toBe(4);
    expect(笔画.at(-1)?.start).toEqual([xbegin, ybegin]);
    expect(
      仿射合并([outer, inner], [引用, { id: 1 }], "⿰").获取笔画列表(),
    ).toHaveLength(2);
  });
  it("千与乘字北重叠时使用乖字千轮廓，其他重叠仍绘制原形", () => {
    const 千 = { id: 0x00270 };
    const 笔画 = (内件: number) =>
      仿射合并([outer, inner], [千, { id: 内件 }], "⿻").获取笔画列表();
    expect(
      笔画(0x15217)
        .slice(0, 3)
        .map((笔) => 笔.start),
    ).toEqual([
      [81, 7],
      [8, 30],
      [50, 14],
    ]);
    expect(笔画(1)[0]).toEqual(outer.获取笔画列表()[0]);
  });
  it("复合体以原形取根，同时按包围布局展开笔画", () => {
    const 数据 = [
      {
        id: 0x0022d,
        type: "component",
        operator: undefined,
        references: undefined,
        strokes: outer.获取笔画列表(),
      },
      {
        id: 1,
        type: "component",
        operator: undefined,
        references: undefined,
        strokes: inner.获取笔画列表(),
      },
      {
        id: 0x05000,
        type: "compound",
        operator: "⿺",
        references: [{ id: 0x0022d }, { id: 1 }],
      },
    ] satisfies ConstructorParameters<typeof 字形库>[0];
    const 复合体 = new 字形库(数据).获取字形(0x05000);
    if (复合体?.type !== "compound") throw new Error("缺少测试复合体");
    expect(复合体.部分列表[0]!.id).toBe(0x0022d);
    expect(复合体.图形盒子.获取笔画列表()).toHaveLength(4);
  });
});
