import type { 目标配置, 编码结果, 编码输入, 评估指标 } from "hanzi-chai";

type 结果 = [编码结果, 评估指标];
type 快照 = { key: string; result: 结果 };
const 数据表 = "results";

// 每份方案只保留最近一次编码。快照是可丢弃的缓存，读写失败时继续实时计算。
let 数据库: Promise<IDBDatabase> | undefined;
function 打开数据库() {
  数据库 ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("chai-encoding", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(数据表);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("编码快照数据库被占用"));
  });
  return 数据库;
}

export async function 读取编码快照(
  方案: string,
  { 配置, ...输入 }: 编码输入,
  目标: 目标配置,
): Promise<{ key?: string; result?: 结果 }> {
  if (!方案 || !globalThis.crypto?.subtle) return {};
  // 将所有实际送入引擎的输入纳入签名，并排除纯展示配置。
  const { form, encoder, generated_mapping_space } = 配置;
  try {
    const bytes = new TextEncoder().encode(
      JSON.stringify(
        [
          APP_VERSION,
          import.meta.env.MODE,
          "libchai-0.4.0",
          form,
          encoder,
          generated_mapping_space,
          输入,
          目标,
        ],
        (_, value) => (value instanceof Map ? [...value] : value),
      ),
    );
    const key = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    const db = await 打开数据库();
    const 快照 = await new Promise<快照 | undefined>((resolve, reject) => {
      const request = db.transaction(数据表).objectStore(数据表).get(方案);
      request.onsuccess = () => resolve(request.result as 快照 | undefined);
      request.onerror = () => reject(request.error);
    });
    return { key, result: 快照?.key === key ? 快照.result : undefined };
  } catch {
    return {};
  }
}

export async function 保存编码快照(方案: string, key: string, result: 结果) {
  try {
    const db = await 打开数据库();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(数据表, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.objectStore(数据表).put({ key, result }, 方案);
    });
  } catch {
    // 沙盒浏览器和存储禁用模式继续使用本次实时结果。
  }
}

export async function 清除编码快照(方案: string) {
  const db = await 打开数据库();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(数据表, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.objectStore(数据表).delete(方案);
  });
}
