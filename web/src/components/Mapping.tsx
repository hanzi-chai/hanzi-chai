import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import MenuOutlined from "@ant-design/icons/MenuOutlined";
import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Alert,
  Button,
  Divider,
  Flex,
  Input,
  List,
  notification,
  Popconfirm,
  Popover,
  Select,
  Typography,
} from "antd";
import {
  type 元素,
  可打印字符列表,
  字符,
  type 强类型安排描述,
  type 强类型广义安排,
  type 强类型非归并安排,
  type 强类型非空安排,
  拼音元素,
  是强类型归并,
  是部件,
  读取表格,
  默认分类器,
} from "hanzi-chai";
import { atomWithStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";
import { sortBy } from "lodash-es";
import { type ComponentProps, memo, useState } from "react";
import {
  useAtom,
  useAtomValue,
  useAtomValueUnwrapped,
  useMapAddAtom,
  useMapRemoveAtom,
  useSetAtom,
  全部合法元素原子,
  决策图原子,
  字库原子,
  字母表原子,
  强类型决策与决策空间原子,
  强类型决策原子,
  强类型决策空间原子,
  强类型线性化决策原子,
  强类型翻转决策原子,
  当前元素原子,
  方案序列号原子,
  编码类型原子,
} from "~/atoms";
import { exportTSV } from "~/utils";
import ElementInsights from "./ElementInsights";
import MappingSpace, { RulesForm } from "./MappingSpace";
import {
  BoxedElementWithTooltip,
  CodePositionDisplay,
  DeleteButton,
  ElementDisplay,
  Uploader,
} from "./Utils";
import ValueEditor from "./Value";

export const ElementDetail = ({
  element,
  onClose,
}: {
  element: 元素;
  onClose: () => void;
}) => {
  const addMapping = useMapAddAtom(强类型决策原子);
  const removeMapping = useMapRemoveAtom(强类型决策原子);
  const mapping = useAtomValueUnwrapped(强类型决策原子);
  const 决策图 = useAtomValueUnwrapped(决策图原子);
  const affiliates = 决策图.获取被归并元素(element);
  const alphabet = useAtomValue(字母表原子);
  const { 笔画列表 } = useAtomValueUnwrapped(全部合法元素原子);
  const keys = mapping.get(element)!;

  // 将修改先保存在本地，而非立即触发 addMapping。
  // 如此，用户可以调整多个编码而不会每次都刷新字根表
  const [currentValue, setCurrentValue] = useState<强类型非空安排>(keys);
  const [otherValue, setOtherValue] = useState<强类型非空安排>(
    是强类型归并(keys) ? alphabet[0]! : { element: 笔画列表[0]! },
  );

  // 只有在用户点击「确定」时才更新字根表
  const handleConfirm = () => {
    if (currentValue === null) {
      if (affiliates.length === 0) {
        removeMapping(element);
        onClose();
      } else {
        notification.error({ message: "无法删除有归并关系的元素" });
      }
    } else {
      addMapping(element, currentValue);
      onClose();
    }
  };

  const handleDelete = () => {
    const referenced: 元素[] = [];
    for (const [k, v] of mapping) {
      if (是强类型归并(v)) {
        if (v.element === element) referenced.push(k);
      } else if (Array.isArray(v)) {
        if (v.some((x) => typeof x === "object" && x.element === element))
          referenced.push(k);
      }
    }
    if (referenced.length === 0) {
      removeMapping(element);
      onClose();
    } else {
      notification.error({
        message: (
          <span>
            无法删除元素，因为元素被其他元素引用：
            {referenced.map((x) => (
              <ElementDisplay key={x.获取名称()} element={x} />
            ))}
          </span>
        ),
      });
    }
  };

  if (!element) return null;

  return (
    <Flex vertical gap="middle">
      <Flex gap="small" align="center">
        <BoxedElementWithTooltip element={element} />
        <ValueEditor
          value={currentValue}
          onChange={(newValue) => {
            setCurrentValue(newValue as 强类型非空安排);
          }}
          isCurrent
        />
        <Button onClick={handleConfirm}>确定</Button>
        <ElementInsights 元素={element} />
        <DeleteButton onClick={handleDelete} disabled={affiliates.length > 0} />
      </Flex>
      <Flex align="center" gap="small">
        或改为：
        <ValueEditor
          value={otherValue}
          onChange={(newValue) => {
            setOtherValue(newValue as 强类型非空安排);
          }}
          isCurrent
        />
        <Button
          onClick={() => {
            addMapping(element, otherValue);
            onClose();
          }}
        >
          确定
        </Button>
      </Flex>
      <Divider size="small" />
      <RulesForm element={element} />
    </Flex>
  );
};

export const ElementLabelWrapper = ({
  $shouldHighlight,
  className,
  ...props
}: { $shouldHighlight: boolean } & ComponentProps<"span">) => (
  <span
    className={`items-baseline cursor-pointer leading-none py-2 px-0 rounded-sm hover:bg-[#ddd] ${
      $shouldHighlight
        ? "bg-[#91caff] [outline:3px_solid_#1677ff]!"
        : "bg-transparent outline-none"
    } ${className ?? ""}`}
    {...props}
  />
);

export const AdjustableElementGroup = ({
  element,
  value,
  displayMode,
}: {
  element: 元素;
  value: 强类型非归并安排;
  displayMode?: boolean;
}) => {
  const 决策图 = useAtomValueUnwrapped(决策图原子);
  const affiliates = 决策图.获取被归并元素(element);
  const currentElement = useAtomValue(当前元素原子);
  const mappingSpace = useAtomValueUnwrapped(强类型决策空间原子);
  const isOptional = (e: 元素) =>
    mappingSpace.get(e)?.some((x) => x.value === null) ?? false;
  const rest = value.slice(1);
  const [openPopover, setOpenPopover] = useState(false);
  const [openAffiliatePopover, setOpenAffiliatePopover] = useState<
    Map<元素, boolean>
  >(new Map());

  return (
    <Flex align="center">
      <Popover
        title="编辑决策"
        trigger="click"
        open={openPopover}
        onOpenChange={setOpenPopover}
        content={
          <ElementDetail
            element={element}
            onClose={() => setOpenPopover(false)}
          />
        }
      >
        <ElementLabelWrapper $shouldHighlight={element === currentElement}>
          <ElementDisplay
            element={element}
            hideTypeNames={displayMode}
            className={
              !displayMode && isOptional(element)
                ? "text-[#9d9d9d]"
                : "text-black"
            }
          />
        </ElementLabelWrapper>
      </Popover>
      {affiliates.map(({ from, to }) => (
        <Popover
          key={`${from.获取名称()}-${to.获取名称()}`}
          title="编辑决策"
          trigger="click"
          open={openAffiliatePopover.get(from) ?? false}
          onOpenChange={(open) =>
            setOpenAffiliatePopover(
              new Map([...openAffiliatePopover, [from, open]]),
            )
          }
          content={
            <ElementDetail
              element={from}
              onClose={() =>
                setOpenAffiliatePopover(
                  new Map([...openAffiliatePopover, [from, false]]),
                )
              }
            />
          }
        >
          <ElementLabelWrapper
            $shouldHighlight={from === currentElement}
            className="text-[0.85em]"
          >
            {!displayMode && <sup title="整体归并">3</sup>}
            <ElementDisplay
              key={from.获取名称()}
              hideTypeNames={displayMode}
              element={from}
              className={
                !displayMode && isOptional(from)
                  ? "text-[#9d9d9d]"
                  : "text-black"
              }
            />
          </ElementLabelWrapper>
        </Popover>
      ))}
      {
        /* 第二码及之后的编码 */ rest.length > 0 && (
          <span className="text-[0.85em] pl-0.5 flex items-baseline">
            {typeof rest === "string"
              ? rest
              : rest.map((x, i) => {
                  return <CodePositionDisplay key={i} element={x} />;
                })}
          </span>
        )
      }
    </Flex>
  );
};

interface ImportResult {
  success: number;
  unknownKeys: string[];
  unknownValues: string[];
}

const ImportResultAlert = ({
  success,
  unknownKeys,
  unknownValues,
}: ImportResult) => {
  const successFeedback = `${success} 个字根已导入。`;
  const unknownKeysFeedback = `${
    unknownKeys.length
  } 个字根无法被系统识别：${unknownKeys.join("、")}。`;
  const unknownValuesFeedback = `${
    unknownValues.length
  } 个字根的键位无法被系统识别：${unknownValues.join(", ")}。`;
  return (
    <Alert
      showIcon
      closable
      type="warning"
      message="导入完成"
      description={
        <>
          <p>{successFeedback}</p>
          {unknownKeys.length > 0 && <p>{unknownKeysFeedback}</p>}
          {unknownValues.length > 0 && <p>{unknownValuesFeedback}</p>}
        </>
      }
    />
  );
};

const MappingUploader = ({
  setImportResult,
}: {
  setImportResult: (a: any) => void;
}) => {
  const repertoire = useAtomValue(字库原子);
  const mapping = useAtomValueUnwrapped(强类型决策原子);
  const setMapping = useSetAtom(强类型决策原子);
  const mappingType = useAtomValue(编码类型原子);
  const alphabet = useAtomValue(字母表原子);
  return (
    <Uploader
      action={(result) => {
        const record = new Map<元素, string>();
        const tsv = 读取表格(result);
        const unknownKeys: string[] = [];
        const unknownValues: string[] = [];
        for (const line of tsv) {
          const [key, value] = line;
          if (key === undefined || value === undefined) continue;
          const ch = repertoire.校验字符(key)?.character;
          if (!ch) {
            unknownKeys.push(key);
            continue;
          }
          const glyphs = repertoire.查询字符的字形(ch);
          if (glyphs === undefined || ch.是私用区()) {
            unknownKeys.push(key);
            continue;
          }
          let isSingleStroke = false;
          for (const glyph of glyphs) {
            if (是部件(glyph) && glyph.获取笔画序列(默认分类器).length === 1) {
              unknownKeys.push(key);
              isSingleStroke = true;
              break;
            }
          }
          if (isSingleStroke) continue;
          if (Array.from(value).some((x) => !alphabet.includes(x))) {
            unknownValues.push(key);
            continue;
          }
          record.set(ch, value.slice(0, mappingType));
        }
        setMapping(new Map([...mapping, ...record]));
        setImportResult({
          success: record.size,
          unknownKeys,
          unknownValues,
        });
      }}
      text="导入键盘映射"
      type=".txt"
    />
  );
};

const MappingExporter = () => {
  const flatMapping = useAtomValueUnwrapped(强类型线性化决策原子);
  return (
    <Button
      onClick={() =>
        exportTSV(
          [...flatMapping].map(([k, v]) => [k.获取名称(), v]),
          "键盘映射.txt",
        )
      }
    >
      导出键盘映射
    </Button>
  );
};

const PUAExporter = () => {
  const mapping = useAtomValueUnwrapped(强类型决策原子);
  return (
    <Button
      onClick={() => {
        const 私用区字符列表 = [...mapping.keys()].filter(
          (x) => x instanceof 字符 && x.是私用区(),
        ) as 字符[];
        私用区字符列表.sort((a, b) => a.toNumber() - b.toNumber());
        const tsv: string[][] = [];
        for (const 字符 of 私用区字符列表) {
          tsv.push([字符.获取名称(), 字符.十六进制()]);
        }
        exportTSV(tsv, "PUA 映射.txt");
      }}
    >
      导出 PUA 映射
    </Button>
  );
};

const LegacyPUAUpdater = () => {
  const repertoire = useAtomValue(字库原子);
  const { 决策, 决策空间 } = useAtomValueUnwrapped(强类型决策与决策空间原子);
  const setMapping = useSetAtom(强类型决策原子);
  const setMappingSpace = useSetAtom(强类型决策空间原子);

  let hasLegacyPUA = false;
  for (const key of [...决策.keys(), ...决策空间.keys()]) {
    if (key instanceof 字符 && key.是私用区()) {
      hasLegacyPUA = true;
      break;
    }
  }

  const convertElement = (element: 元素): 元素 => {
    if (element instanceof 字符 && element.是私用区()) {
      const glyphs = repertoire.查询字符的字形(element);
      if (glyphs && glyphs.length > 0) {
        return glyphs[0]!;
      }
    }
    return element;
  };
  const convertValue = (value: 强类型广义安排): 强类型广义安排 => {
    if (typeof value === "string" || value === null) {
      return value;
    } else if (是强类型归并(value)) {
      return { element: convertElement(value.element) };
    } else {
      return value.map((x) => {
        if (typeof x === "object" && x !== null && "element" in x) {
          return { ...x, element: convertElement(x.element) };
        } else {
          return x;
        }
      });
    }
  };
  if (!hasLegacyPUA) return null;
  return (
    <Flex justify="center" align="baseline" gap="small">
      <Button
        type="primary"
        onClick={() => {
          const newMapping = new Map<元素, 强类型非空安排>();
          for (const [key, value] of 决策) {
            newMapping.set(
              convertElement(key),
              convertValue(value) as 强类型非空安排,
            );
          }
          const newMappingSpace = new Map<元素, 强类型安排描述[]>();
          for (const [key, value] of 决策空间) {
            const newValue: 强类型安排描述[] = [];
            for (const desc of value) {
              newValue.push({
                ...desc,
                value: convertValue(desc.value),
                condition: desc.condition?.map((x) => ({
                  ...x,
                  element: convertElement(x.element),
                })),
              });
            }
            newMappingSpace.set(convertElement(key), newValue);
          }
          setMapping(newMapping);
          setMappingSpace(newMappingSpace);
        }}
      >
        检测到有旧版 PUA，一键迁移
      </Button>
    </Flex>
  );
};

const MappingHeader = () => {
  const [order, setOrder] = useState("");
  const [char, setChar] = useState<string | undefined>(undefined);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [mappingType, setMappingType] = useAtom(编码类型原子);
  const [alphabet, setAlphabet] = useAtom(字母表原子);
  return (
    <>
      <Typography.Title level={3}>键盘映射</Typography.Title>
      <Flex justify="center" align="baseline" gap="small">
        编码类型：
        <Select
          value={mappingType}
          onChange={(event) => setMappingType(event)}
          options={[
            { label: "单编码", value: 1 },
            { label: "双编码", value: 2 },
            { label: "三编码", value: 3 },
            { label: "四编码", value: 4 },
          ]}
        />
        添加按键：
        <Select
          className="w-16"
          value={char}
          onChange={setChar}
          options={可打印字符列表
            .filter((x) => !alphabet.includes(x))
            .map((v) => ({
              label: v,
              value: v,
            }))}
        />
        <Button
          type="primary"
          disabled={char === undefined}
          onClick={() => setAlphabet(alphabet + char)}
        >
          添加
        </Button>
        <Popconfirm
          title="请输入排列顺序"
          description={
            <Input
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            />
          }
          onConfirm={() =>
            setAlphabet(
              sortBy(Array.from(alphabet), (x) => order.indexOf(x)).join(""),
            )
          }
        >
          <Button>自定义排列顺序</Button>
        </Popconfirm>
      </Flex>
      <Flex justify="center" align="baseline" gap="small">
        <MappingUploader setImportResult={setImportResult} />
        <MappingExporter />
        <PUAExporter />
      </Flex>
      <LegacyPUAUpdater />
      {importResult && <ImportResultAlert {...importResult} />}
    </>
  );
};

type 映射项 = { 元素: 元素; 安排: 强类型非归并安排 };
type 拖动目标 = { 键: string; 根?: string };
type 行顺序 = Record<string, string[]>;
const 行顺序存储 = atomFamily((id: string) =>
  atomWithStorage<行顺序>(`chai.row-order:${id}`, {}),
);
const 拖动ID = ({ 键, 根 }: 拖动目标) => JSON.stringify([键, 根]);
const 可搬运 = ({ 元素, 安排 }: 映射项) =>
  !(元素 instanceof 拼音元素) && typeof 安排[0] === "string";

const 分簇 = (elements: 映射项[]) => {
  const 簇: 映射项[][] = [];
  for (const 项 of elements) {
    // 翻转决策按引用关系展开，引用首码的元素紧跟其主根。
    if (typeof 项.安排[0] === "string" || !簇.length) 簇.push([项]);
    else 簇.at(-1)!.push(项);
  }
  return 簇;
};

const 簇名 = (簇: 映射项[]) => 簇[0]!.元素.获取名称();

function 拖动手柄({
  目标,
  标签,
  children,
}: {
  目标: 拖动目标;
  标签: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: 拖动ID(目标),
    data: 目标,
  });
  return (
    <Button
      ref={setNodeRef}
      size="small"
      type="text"
      aria-label={标签}
      title={标签}
      className="touch-none cursor-grab"
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      {children}
    </Button>
  );
}

function 字根簇({ symbol, 簇 }: { symbol: string; 簇: 映射项[] }) {
  const 目标 = { 键: symbol, 根: 簇名(簇) };
  const { setNodeRef, isOver } = useDroppable({ id: 拖动ID(目标), data: 目标 });
  const 可拖 = 可搬运(簇[0]!);
  return (
    <Flex
      ref={setNodeRef}
      align="center"
      gap="small"
      className={isOver ? "outline rounded outline-blue-400" : undefined}
    >
      {可拖 && (
        <拖动手柄 目标={目标} 标签={`拖动 ${目标.根}`}>
          <MenuOutlined />
        </拖动手柄>
      )}
      {簇.map(({ 元素, 安排 }) => (
        <Flex key={元素.获取名称()} align="center">
          {typeof 安排[0] !== "string" && <sup title="引用首码">2</sup>}
          <AdjustableElementGroup element={元素} value={安排} />
        </Flex>
      ))}
    </Flex>
  );
}

const MappingRow = memo(
  ({ symbol, clusters }: { symbol: string; clusters: 映射项[][] }) => {
    const [alphabet, setAlphabet] = useAtom(字母表原子);
    const 目标 = { 键: symbol };
    const { setNodeRef, isOver } = useDroppable({
      id: 拖动ID(目标),
      data: 目标,
    });
    return (
      <Flex
        ref={setNodeRef}
        className={`border-t border-[#aaa] min-h-9 ${isOver ? "bg-blue-50" : ""}`}
      >
        <Button
          shape="circle"
          type="text"
          danger
          disabled={clusters.length > 0}
          onClick={() =>
            setAlphabet([...alphabet].filter((x) => x !== symbol).join(""))
          }
          icon={<DeleteOutlined />}
        />
        <拖动手柄 目标={目标} 标签={`对换 ${symbol} 行`}>
          {symbol}
        </拖动手柄>
        <Flex align="center" wrap="wrap" gap="small">
          {clusters.map((簇) => (
            <字根簇 key={簇名(簇)} symbol={symbol} 簇={簇} />
          ))}
        </Flex>
      </Flex>
    );
  },
);

const 查找落点: CollisionDetection = (args) => {
  const 行拖动 =
    (args.active.data.current as 拖动目标 | undefined)?.根 === undefined;
  const 目标 = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) =>
        container.id !== args.active.id &&
        (!行拖动 || !container.data.current?.根),
    ),
  };
  if (!args.pointerCoordinates) return closestCenter(目标);
  return pointerWithin(目标).sort(
    (a, b) =>
      Number(
        Boolean(
          目标.droppableContainers.find((x) => x.id === b.id)?.data.current?.根,
        ),
      ) -
      Number(
        Boolean(
          目标.droppableContainers.find((x) => x.id === a.id)?.data.current?.根,
        ),
      ),
  );
};

export default function MappingComponent() {
  const 翻转决策 = useAtomValueUnwrapped(强类型翻转决策原子);
  const 决策 = useAtomValueUnwrapped(强类型决策原子);
  const 设决策 = useSetAtom(强类型决策原子);
  const 方案 = useAtomValue(方案序列号原子);
  const [顺序, 设顺序] = useAtom(行顺序存储(方案));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const 行 = new Map(
    [...翻转决策].map(([键, 元素]) => {
      const 优先 = new Map((顺序[键] ?? []).map((name, i) => [name, i]));
      return [
        键,
        sortBy(分簇(元素), (簇) => 优先.get(簇名(簇)) ?? Infinity),
      ] as const;
    }),
  );

  function 拖动结束({ active, over }: DragEndEvent) {
    const 起点 = active.data.current as 拖动目标 | undefined;
    const 落点 = over?.data.current as 拖动目标 | undefined;
    if (!起点 || !落点 || active.id === over?.id) return;
    const { 键: 原键, 根 } = 起点;
    const { 键: 新键 } = 落点;
    const 原行 = 行.get(原键) ?? [];
    const 新行 = 行.get(新键) ?? [];
    const 新决策 = new Map(决策);
    const 移首键 = ([项]: 映射项[], 键: string) => {
      if (!项 || !可搬运(项)) return;
      const 原 = 项.安排;
      新决策.set(
        项.元素,
        typeof 原 === "string"
          ? 键 + [...原].slice(1).join("")
          : [键, ...原.slice(1)],
      );
    };
    if (根 === undefined) {
      if (原键 === 新键) return;
      const A = 原行.filter(([项]) => 项 && 可搬运(项));
      const B = 新行.filter(([项]) => 项 && 可搬运(项));
      if (!A.length && !B.length) return;
      for (const 簇 of A) 移首键(簇, 新键);
      for (const 簇 of B) 移首键(簇, 原键);
      设顺序({
        ...顺序,
        [原键]: [...B, ...原行.filter((x) => !A.includes(x))].map(簇名),
        [新键]: [...A, ...新行.filter((x) => !B.includes(x))].map(簇名),
      });
      设决策(新决策);
      return;
    }
    const i = 原行.findIndex((簇) => 簇名(簇) === 根);
    const 簇 = 原行[i];
    if (!簇 || !可搬运(簇[0]!)) return;
    const j = 新行.findIndex((项) => 簇名(项) === 落点.根);
    if (原键 === 新键) {
      设顺序({
        ...顺序,
        [原键]: arrayMove(原行, i, j < 0 ? 原行.length - 1 : j).map(簇名),
      });
      return;
    }
    const 目标顺序 = 新行.map(簇名);
    目标顺序.splice(j < 0 ? 目标顺序.length : j, 0, 根);
    移首键(簇, 新键);
    设顺序({
      ...顺序,
      [原键]: 原行.filter((项) => 项 !== 簇).map(簇名),
      [新键]: 目标顺序,
    });
    设决策(新决策);
  }

  return (
    <Flex vertical gap="small">
      <MappingHeader />
      <DndContext
        sensors={sensors}
        collisionDetection={查找落点}
        onDragEnd={拖动结束}
      >
        <List
          dataSource={[...行]}
          renderItem={([key, clusters]) => (
            <MappingRow key={key} symbol={key} clusters={clusters} />
          )}
        />
      </DndContext>
      <MappingSpace />
    </Flex>
  );
}
