import {
  准备方案,
  分析选根,
  type 原始词典,
  type 基本字形数据,
  type 字根改动,
  type 字符数据,
  构建字库,
  type 自定义分析,
  type 选根搜索配置,
  type 选根结果,
  type 选根评分配置,
  type 选根进度,
  type 配置,
} from "hanzi-chai";

export interface 选根请求 {
  配置: 配置;
  字符列表: 字符数据[];
  字形列表: 基本字形数据[];
  原始词典: 原始词典;
  自定义元素集合: Record<string, 自定义分析>;
  改动: 字根改动[];
  评分: 选根评分配置;
  搜索?: 选根搜索配置;
}

export type 选根响应 =
  | { type: "progress"; value: 选根进度 }
  | { type: "round" | "complete"; value: 选根结果 }
  | { type: "error"; message: string };

self.onmessage = ({ data }: MessageEvent<选根请求>) => {
  const post = (response: 选根响应) => self.postMessage(response);
  try {
    const {
      配置,
      字符列表,
      字形列表,
      原始词典,
      自定义元素集合,
      改动,
      评分,
      搜索,
    } = data;
    const 方案 = 准备方案(配置, {
      字库: 构建字库(配置, 字符列表, 字形列表),
      原始词典,
      自定义元素集合,
    });
    const value = 分析选根(
      方案,
      改动,
      评分,
      搜索,
      (value) => post({ type: "progress", value }),
      (value) => post({ type: "round", value }),
    );
    post({ type: "complete", value });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
