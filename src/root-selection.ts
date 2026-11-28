import { isEqual } from "lodash-es";
import type { 组装条目 } from "./assembly.js";
import { 部件 } from "./component.js";
import { 复合体 } from "./compound.js";
import {
  type 决策空间,
  type 广义安排,
  是归并,
  type 非空安排,
} from "./config.js";
import {
  估计阶重码,
  分析原始重码,
  归并组装结果,
  type 离散分析配置,
} from "./dispersion.js";
import type { 字形 } from "./repertoire.js";
import {
  type 方案上下文,
  替换方案键盘,
  组装方案,
  选取当前组装条目,
} from "./scheme.js";
import { 字符 } from "./unicode.js";

export interface 字根改动 {
  name: string;
  value: 非空安排 | null;
}

export interface 选根评分表 extends 离散分析配置 {
  weight: number;
}

export interface 选根搜索配置 {
  rounds: number;
  add: boolean;
  remove: boolean;
  sources: ("frequency" | "components" | "collisions")[];
  candidates: string[];
  limit: number;
  codes: string[];
}

export interface 选根评分配置 {
  tables: 选根评分表[];
  rootPenalty: number;
}

const 默认字母表 = "abcdefghijklmnopqrstuvwxyz";

function 引用(安排: 广义安排) {
  if (是归并(安排)) return [安排.element];
  return Array.isArray(安排)
    ? 安排.flatMap((位) =>
        位 && typeof 位 === "object" && "element" in 位 ? [位.element] : [],
      )
    : [];
}

function 变更字根(方案: 方案上下文, 改动: readonly 字根改动[]) {
  const {
    配置: { form },
    名称映射,
  } = 方案;
  const 规范名 = (name: string) => 名称映射.get(name)?.获取名称() ?? name;
  const mapping = { ...form.mapping };
  const 决策键 = new Map(Object.keys(mapping).map((键) => [规范名(键), 键]));
  const 已删除 = new Set<string>();
  const 已指定 = new Map<string, 非空安排>();
  const 字母表 = new Set(form.alphabet ?? 默认字母表);
  for (const { name, value } of 改动) {
    const 名 = 规范名(name);
    const 键 = 决策键.get(名);
    if (value === null) {
      if (键 === undefined) throw new Error(`「${name}」没有安排`);
      delete mapping[键];
      决策键.delete(名);
      已指定.delete(名);
      已删除.add(名);
      continue;
    }
    if (!名称映射.has(name) && 键 === undefined)
      throw new Error(`找不到元素「${name}」`);
    const 码位 =
      typeof value === "string"
        ? [...value]
        : Array.isArray(value)
          ? value
          : undefined;
    if (
      码位 &&
      (!码位.length ||
        码位.some((位) => typeof 位 === "string" && !字母表.has(位)))
    ) {
      throw new Error(`「${name}」的键位不在方案字母表中，或安排为空`);
    }
    mapping[键 ?? 名] = value;
    决策键.set(名, 键 ?? 名);
    已指定.set(名, value);
    已删除.delete(名);
  }
  const 引用名 = (安排: 广义安排) => 引用(安排).map(规范名);
  // 活动决策的引用必须随目标一起移除，直到没有新的悬空引用。
  for (let 待查 = 已删除.size > 0; 待查; ) {
    待查 = false;
    for (const [键, 安排] of Object.entries(mapping)) {
      if (!引用名(安排).some((名) => 已删除.has(名))) continue;
      const 名 = 规范名(键);
      delete mapping[键];
      已删除.add(名);
      决策键.delete(名);
      待查 = true;
    }
  }
  for (const [名, 安排] of 已指定) {
    if (!决策键.has(名) || 引用名(安排).some((目标) => !决策键.has(目标))) {
      throw new Error(`「${名}」引用了没有安排的元素`);
    }
  }
  if (!form.mapping_space || 已删除.size === 0) return { ...form, mapping };

  const mapping_space: 决策空间 = { ...form.mapping_space };
  // 删除影响到的备选可继续保留有效选项。只有失去全部安排的元素才向外传播。
  const 仍可用 = new Set(决策键.keys());
  for (const [键, 选项] of Object.entries(mapping_space)) {
    if (选项.some(({ value }) => value !== null)) 仍可用.add(规范名(键));
  }
  const 不可用 = new Set([...已删除].filter((名) => !仍可用.has(名)));
  for (let 待查 = true; 待查; ) {
    待查 = false;
    for (const [键, 选项] of Object.entries(mapping_space)) {
      const 名 = 规范名(键);
      const 有效选项 = 选项.filter(
        ({ value }) => !引用名(value).some((目标) => 不可用.has(目标)),
      );
      if (有效选项.length === 选项.length && !不可用.has(名)) continue;
      if (决策键.has(名) || 有效选项.some(({ value }) => value !== null)) {
        mapping_space[键] = 有效选项;
      } else {
        delete mapping_space[键];
        if (!不可用.has(名)) {
          不可用.add(名);
          待查 = true;
        }
      }
    }
  }
  return { ...form, mapping, mapping_space };
}

function 取当前组装条目(方案: 方案上下文): 组装条目[] {
  const 结果 = 组装方案(方案);
  if (!结果.dynamic) return 结果.条目;
  return 选取当前组装条目(结果.条目, 方案.决策).filter(
    (项): 项 is 组装条目 => 项 !== undefined,
  );
}

function 全量评分(方案: 方案上下文, { tables, rootPenalty }: 选根评分配置) {
  const 码长 = 方案.配置.encoder.max_length;
  const 键数 = new Set(方案.配置.form.alphabet ?? 默认字母表).size;
  const 条目 = 归并组装结果(
    取当前组装条目(方案).filter(({ 元素序列 }) => 元素序列.元素序列.length > 0),
    方案.决策,
  );
  const 分组 = tables.map((表) => 分析原始重码(表, 条目, 码长));
  const 表分 = 分组.map((分布, i) =>
    估计阶重码(分布, 码长 - tables[i]!.position.length, 键数),
  );
  const 评分权重 = tables.reduce(
    (总分, 表, i) => 总分 + 表.weight * 表分[i]!,
    0,
  );
  const 根数 = Object.values(方案.配置.form.mapping).filter(
    (安排) => !是归并(安排),
  ).length;
  const 总分 = 评分权重 + rootPenalty * 根数;
  if (!Number.isFinite(总分)) throw new Error("选根评分超出数值范围");
  return { 分组, 表分, 总分, 根数, 条目 };
}

type 评分 = ReturnType<typeof 全量评分>;

function 读音覆盖({ 条目 }: 评分) {
  return new Set(
    条目.flatMap(({ 词, 拼音来源列表 }) =>
      拼音来源列表.map((拼音) =>
        JSON.stringify([词.map((字) => 字.获取名称()), 拼音]),
      ),
    ),
  );
}

function 比较分组(基线: 评分, 结果: 评分) {
  return 结果.分组.map((分组, i) => {
    const 原分组 = 基线.分组[i]!;
    return [...new Set([...原分组.keys(), ...分组.keys()])].flatMap((键) => {
      const 原组 = 原分组.get(键) ?? [];
      const 新组 = 分组.get(键) ?? [];
      if (原组.length < 2 && 新组.length < 2) return [];
      const 甲 = [...原组].sort();
      const 乙 = [...新组].sort();
      return isEqual(甲, 乙) ? [] : [{ 键, 原组, 新组 }];
    });
  });
}

function 选根候选(方案: 方案上下文, 基线: 评分, 搜索: 选根搜索配置) {
  const 候选 = new Set(搜索.candidates);
  const 字频 = new Map<string, number>();
  for (const { 词, 频率 } of 方案.过滤词典) {
    if (词.length !== 1) continue;
    const 名 = 词[0]!.获取名称();
    字频.set(名, (字频.get(名) ?? 0) + 频率);
  }
  const 频序 = [...字频].sort((甲, 乙) => 乙[1] - 甲[1]);
  const 取元素字形 = (元素: ReturnType<typeof 方案.名称映射.get>) => {
    if (元素 instanceof 字符) return 方案.字库.查询字符的字形(元素) ?? [];
    return 元素 instanceof 部件 || 元素 instanceof 复合体 ? [元素] : [];
  };
  const 已用字形 = new Set([...方案.决策.keys()].flatMap(取元素字形));
  const 可加 = (名: string) => {
    const 元素 = 方案.名称映射.get(名);
    return (
      元素 !== undefined &&
      !方案.决策.has(元素) &&
      (!(元素 instanceof 字符) ||
        (方案.字库.查询字符的字形(元素)?.length ?? 0) > 0)
    );
  };
  const 自动可加 = (名: string) =>
    可加(名) &&
    取元素字形(方案.名称映射.get(名)).some((字形) => !已用字形.has(字形));
  const 排分部 = (字列: Iterable<string>) => {
    const 频次 = new Map<string, number>();
    for (const 字 of 字列) {
      const 遍历 = (字形: 字形, 已见: Set<string>) => {
        const 名 = 字形.获取名称();
        if (已见.has(名)) return;
        已见.add(名);
        if (字形 instanceof 复合体) {
          for (const 子形 of 字形.部分列表) 遍历(子形, 已见);
        }
      };
      const 已见 = new Set<string>();
      for (const 字形 of 取元素字形(方案.名称映射.get(字))) {
        if (字形 instanceof 复合体) {
          for (const 分部 of 字形.部分列表) 遍历(分部, 已见);
        }
      }
      for (const 名 of 已见) 频次.set(名, (频次.get(名) ?? 0) + 1);
    }
    return [...频次].sort((甲, 乙) => 乙[1] - 甲[1]).map(([名]) => 名);
  };
  for (const 来源 of 搜索.sources) {
    let 名单: string[];
    if (来源 === "frequency") {
      名单 = 频序.map(([名]) => 名);
    } else if (来源 === "components") {
      名单 = 排分部(频序.map(([名]) => 名));
    } else {
      const 重码字 = new Set(
        基线.分组.flatMap((分布) =>
          [...分布.values()]
            .filter((组) => 组.length > 1)
            .flatMap((组) => 组.flatMap((词) => [...词])),
        ),
      );
      名单 = [
        ...排分部(重码字),
        ...频序.map(([名]) => 名).filter((名) => 重码字.has(名)),
      ];
    }
    for (const 名 of 名单.filter(自动可加).slice(0, 搜索.limit)) 候选.add(名);
  }
  return [...候选].filter(可加);
}

export interface 选根进度 {
  round: number;
  done: number;
  total: number;
  best: number;
}

export interface 选根轮次 {
  round: number;
  edit: 字根改动;
  score: number;
}

export function 分析选根(
  方案: 方案上下文,
  改动: 字根改动[],
  评分配置: 选根评分配置,
  搜索?: 选根搜索配置,
  报告?: (进度: 选根进度) => void,
  报告轮次?: (结果: 选根结果) => void,
): 选根结果 {
  const 码长 = 方案.配置.encoder.max_length;
  if (
    !评分配置.tables.length ||
    !Number.isFinite(评分配置.rootPenalty) ||
    评分配置.tables.some(
      ({ top, position, weight }) =>
        !Number.isSafeInteger(top) ||
        top < 0 ||
        !Number.isFinite(weight) ||
        weight < 0 ||
        new Set(position).size !== position.length ||
        position.some((位) => !Number.isInteger(位) || 位 < 0 || 位 >= 码长),
    )
  ) {
    throw new Error("评分表的范围、权重或保留码位无效");
  }

  const 基线 = 全量评分(方案, 评分配置);
  const 原覆盖 = 读音覆盖(基线);
  let 当前方案 = 改动.length ? 替换方案键盘(方案, 变更字根(方案, 改动)) : 方案;
  let 当前 = 改动.length ? 全量评分(当前方案, 评分配置) : 基线;
  const 轮次: 选根轮次[] = [];
  const 生成结果 = () => ({
    form: 当前方案.配置.form,
    changed: !isEqual(方案.配置.form, 当前方案.配置.form),
    before: 基线.总分,
    after: 当前.总分,
    rootsBefore: 基线.根数,
    rootsAfter: 当前.根数,
    tables: 基线.表分.map((before, i) => ({ before, after: 当前.表分[i]! })),
    groups: 比较分组(基线, 当前),
    missing: [...原覆盖].filter((名) => !读音覆盖结果.has(名)).length,
    rounds: [...轮次],
  });
  let 读音覆盖结果 = 读音覆盖(当前);
  if (!搜索) return 生成结果();

  if ([...原覆盖].some((名) => !读音覆盖结果.has(名))) {
    throw new Error("固定改动使部分字词失去编码，请先用手动分析检查");
  }
  const 字母表 = new Set(方案.配置.form.alphabet ?? 默认字母表);
  if (
    !Number.isSafeInteger(搜索.rounds) ||
    搜索.rounds < 1 ||
    !Number.isSafeInteger(搜索.limit) ||
    搜索.limit < 1 ||
    (搜索.add &&
      (!搜索.codes.length ||
        搜索.codes.some((码) => !码 || [...码].some((键) => !字母表.has(键)))))
  ) {
    throw new Error("搜索的轮数、候选数量或键位安排无效");
  }
  const 锁定 = 改动.map(({ name }) => 方案.名称映射.get(name));
  const 手选名 = new Set(搜索.candidates.map((名) => 方案.名称映射.get(名)));
  for (const 名 of 搜索.candidates) {
    if (!方案.名称映射.has(名)) throw new Error(`找不到候选元素「${名}」`);
  }
  for (let round = 1; round <= 搜索.rounds; round++) {
    const { 决策, 名称映射, 字库, 配置 } = 当前方案;
    const 候选改动: 字根改动[] = [];
    if (搜索.add) {
      for (const name of 选根候选(当前方案, 当前, 搜索)) {
        if (锁定.includes(名称映射.get(name))) continue;
        for (const value of 搜索.codes) 候选改动.push({ name, value });
      }
    }
    if (搜索.remove) {
      const 频次 = new Map<string, number>();
      for (const { 元素序列 } of 当前.条目) {
        for (const 位 of 元素序列.元素序列) {
          if (typeof 位 === "string") continue;
          const 名 = 位.element.获取名称();
          频次.set(名, (频次.get(名) ?? 0) + 1);
        }
      }
      const 可删 = Object.keys(配置.form.mapping).filter((名) => {
        const 元素 = 名称映射.get(名);
        return (
          !锁定.includes(元素) &&
          (元素 instanceof 部件 ||
            元素 instanceof 复合体 ||
            (元素 instanceof 字符 &&
              (字库.查询字符的字形(元素)?.length ?? 0) > 0))
        );
      });
      可删.sort(
        (甲, 乙) =>
          Number(手选名.has(名称映射.get(乙))) -
            Number(手选名.has(名称映射.get(甲))) ||
          (频次.get(名称映射.get(甲)!.获取名称()) ?? 0) -
            (频次.get(名称映射.get(乙)!.获取名称()) ?? 0),
      );
      for (const name of 可删.slice(0, 搜索.limit))
        候选改动.push({ name, value: null });
    }

    let 最优:
      | { edit: 字根改动; 方案: 方案上下文; 评分: 评分; 覆盖: Set<string> }
      | undefined;
    报告?.({ round, done: 0, total: 候选改动.length, best: 当前.总分 });
    for (const [i, edit] of 候选改动.entries()) {
      try {
        const 变体 = 替换方案键盘(当前方案, 变更字根(当前方案, [edit]));
        if (
          锁定.some(
            (元素) => 元素 && !isEqual(变体.决策.get(元素), 决策.get(元素)),
          )
        )
          continue;
        const 评分 = 全量评分(变体, 评分配置);
        const 上界 = 最优?.评分.总分 ?? 当前.总分;
        const 有改进 =
          评分.总分 < 上界 ||
          (edit.value === null &&
            评分.总分 === 上界 &&
            评分.根数 < (最优?.评分.根数 ?? 当前.根数));
        if (!有改进) continue;
        const 覆盖 = 读音覆盖(评分);
        if ([...读音覆盖结果].some((名) => !覆盖.has(名))) continue;
        最优 = { edit, 方案: 变体, 评分, 覆盖 };
      } catch {
        // 个别安排可能使组装无解，下一候选仍可继续评分。
      } finally {
        报告?.({
          round,
          done: i + 1,
          total: 候选改动.length,
          best: 最优?.评分.总分 ?? 当前.总分,
        });
      }
    }
    if (!最优) break;
    当前方案 = 最优.方案;
    当前 = 最优.评分;
    读音覆盖结果 = 最优.覆盖;
    轮次.push({ round, edit: 最优.edit, score: 当前.总分 });
    报告轮次?.(生成结果());
  }
  return 生成结果();
}

export interface 选根结果 {
  form: 方案上下文["配置"]["form"];
  changed: boolean;
  before: number;
  after: number;
  rootsBefore: number;
  rootsAfter: number;
  tables: { before: number; after: number }[];
  groups: { 键: string; 原组: string[]; 新组: string[] }[][];
  missing: number;
  rounds: 选根轮次[];
}
