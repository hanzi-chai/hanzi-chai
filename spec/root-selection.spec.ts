import { describe, expect, it } from "bun:test";
import { 分析选根, 运行方案, type 选根评分配置 } from "../src/index.js";
import { fixtureConfig, fixtureContext } from "./fixtures/scheme.js";

const 前码: 选根评分配置 = {
  tables: [{ type: "single", position: [0], top: 0, weight: 1 }],
  rootPenalty: 0,
};

describe("智能选根", () => {
  it("按五位元素序列和实际键数计算零阶与一阶", () => {
    const config = fixtureConfig();
    config.encoder.max_length = 5;
    config.encoder.sources = {
      s0: { object: null, next: "s1" },
      s1: { object: { type: "固定", key: "a" }, next: "s2" },
      s2: { object: { type: "固定", key: "a" }, next: "s3" },
      s3: { object: { type: "固定", key: "a" }, next: "s4" },
      s4: { object: { type: "固定", key: "a" }, next: "s5" },
      s5: { object: { type: "字根", rootIndex: 1 }, next: null },
    };
    config.form.mapping.二 = "b";
    const result = 分析选根(fixtureContext(config), [], {
      tables: [
        { ...前码.tables[0]!, position: [0, 1, 2, 3, 4] },
        { ...前码.tables[0]!, position: [0, 1, 2, 3] },
      ],
      rootPenalty: 0,
    });
    expect(result.tables.map(({ before }) => before)).toEqual([0, 0.4]);
  });

  it("合并对删除、逐位和整体引用的改动，应用返回的键盘后可正常组装", () => {
    const config = fixtureConfig();
    config.form.mapping.二 = "ab";
    config.form.mapping.一 = [{ element: "二", index: 1 }];
    config.form.mapping["字形-00001"] = { element: "一" };
    config.form.mapping_space = {
      二: [{ value: null, score: 0 }],
      "字形-00002": [
        { value: { element: "一" }, score: 0 },
        { value: "b", score: 0 },
      ],
    };
    const result = 分析选根(
      fixtureContext(config),
      [{ name: "二", value: null }],
      前码,
    );
    expect(result.changed).toBe(true);
    expect(result.form.mapping.二).toBeUndefined();
    expect(result.form.mapping.一).toBeUndefined();
    expect(result.form.mapping["字形-00001"]).toBeUndefined();
    expect(result.form.mapping_space).toEqual({
      "字形-00002": [{ value: "b", score: 0 }],
    });
    expect(config.form.mapping.二).toBe("ab");
    expect(result.missing).toBe(0);
    const applied = fixtureContext({ ...config, form: result.form });
    expect(运行方案(applied).词列表).toHaveLength(2);
    expect(分析选根(applied, [], 前码).after).toBe(result.after);
  });

  it("动态方案按当前安排选择分支，搜索采用完整精度比较", () => {
    const config = fixtureConfig();
    config.analysis = { dynamic: true };
    config.form.mapping_space = { 二: [{ value: "b", score: 0 }] };
    const context = fixtureContext(config);
    const 手动 = 分析选根(context, [{ name: "二", value: "b" }], 前码);
    const 自动 = 分析选根(context, [], 前码, {
      rounds: 2,
      add: true,
      remove: false,
      sources: [],
      candidates: ["二"],
      codes: ["b"],
      limit: 1,
    });
    expect(手动.before).toBeCloseTo(0.016);
    expect(手动.after).toBeCloseTo(0.008);
    expect(自动.after).toBe(手动.after);
    expect(自动.rounds.map(({ edit }) => edit)).toEqual([
      { name: "二", value: "b" },
    ]);
    expect(自动.missing).toBe(0);

    const 临界 = 分析选根(
      context,
      [],
      {
        tables: [{ ...前码.tables[0]!, weight: 0.25 }],
        rootPenalty: 0.003,
      },
      {
        rounds: 1,
        add: true,
        remove: false,
        sources: [],
        candidates: ["二"],
        codes: ["b"],
        limit: 1,
      },
    );
    // 新方案的裸分为 0.002，收益 0.002 不足以抵掉 0.003 的罚分。
    expect(临界.rounds).toEqual([]);
  });

  it("试算按显式引用归并元素，拒绝找不到目标的安排", () => {
    const context = fixtureContext();
    const 直设 = 分析选根(context, [{ name: "二", value: "a" }], 前码);
    const 归并 = 分析选根(
      context,
      [{ name: "二", value: { element: "1" } }],
      前码,
    );
    expect(直设.after).toBeCloseTo(0.008);
    expect(归并.after).toBeCloseTo(0.016);
    expect(() =>
      分析选根(context, [{ name: "二", value: { element: "一" } }], 前码),
    ).toThrow("引用了没有安排的元素");
  });
});
