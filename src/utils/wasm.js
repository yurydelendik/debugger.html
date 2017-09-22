/* @flow */

import {
  BinaryReader,
  BinaryReaderState,
  ExternalKind
} from "wasmparser/dist/WasmParser";
import { WasmDisassembler } from "wasmparser/dist/WasmDis";

type WasmState = {
  lines: Array<number>,
  offsets: Array<number>
};

var wasmStates: { [string]: WasmState } = Object.create(null);

/**
 * @memberof utils/wasm
 * @static
 */
function getWasmText(sourceId: string, data: Uint8Array) {
  const parser = new BinaryReader();
  parser.setData(data.buffer, 0, data.length);
  const dis = new WasmDisassembler();
  dis.addOffsets = true;
  const done = dis.disassembleChunk(parser);
  let result = dis.getResult();
  if (result.lines.length === 0) {
    result = { lines: ["No luck with wast conversion"], offsets: [0], done };
  }

  const offsets = result.offsets;
  const lines = [];
  for (let i = 0; i < offsets.length; i++) {
    lines[offsets[i]] = i;
  }

  wasmStates[sourceId] = { offsets, lines };

  return { lines: result.lines, done: result.done };
}

function stringToBinary(binary: string): Uint8Array {
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = binary.charCodeAt(i);
  }
  return data;
}

function getWasmFunctionsIndex(
  binary: string
): Array<{ id: string, start: number, end: number }> {
  const data = stringToBinary(binary);
  const parser = new BinaryReader();
  parser.setData(data.buffer, 0, data.length);
  const index = [];
  let first = 0;
  let count = 0;
  let lastPosition = 0;
  l1: while (parser.read()) {
    switch (parser.state) {
      case BinaryReaderState.IMPORT_SECTION_ENTRY:
        if (parser.result.kind === ExternalKind.Function) {
          first++;
        }
        break;
      case BinaryReaderState.BEGIN_FUNCTION_BODY:
        index.push({
          id: `func${first + count}`,
          start: lastPosition,
          end: lastPosition
        });
        parser.skipFunctionBody();
        break;
      case BinaryReaderState.END_FUNCTION_BODY:
        count++;
        index[index.length - 1].end = parser.position;
        break;
      case BinaryReaderState.END_WASM:
      case BinaryReaderState.ERROR:
        break l1;
      // TODO case NAME_SECTION_ENTRY
    }
    lastPosition = parser.position;
  }
  return index;
}

function getWasmPart(sourceId: string, part: any, binary: string): string {
  const data = stringToBinary(binary);
  const parser = new BinaryReader();
  parser.setData(data.buffer, 0, data.length);
  const dis = new WasmDisassembler();
  dis.addOffsets = true;
  const done = dis.disassembleChunk(parser);
  let result = dis.getResult();
  if (result.lines.length === 0) {
    result = { lines: ["No luck with wast conversion"], offsets: [0], done };
  }

  let textLines = [],
    offsets = [];
  if (!Array.isArray(part)) {
    for (let i = 0; i < result.lines.length; i++) {
      if (
        (result.offsets[i] >= part.start && result.offsets[i] < part.end) ||
        (result.offsets[i] == part.end && result.offsets[i - 1] != part.end)
      ) {
        textLines.push(result.lines[i]);
        offsets.push(result.offsets[i]);
      }
    }
  } else {
    const excludeStart = part.reduce(function(acc, value) {
      return Math.min(acc, value.start);
    }, Infinity);
    const excludeEnd = part.reduce(function(acc, value) {
      return Math.max(acc, value.end);
    }, 0);
    for (let i = 0; i < result.lines.length; i++) {
      if (
        (result.offsets[i] < excludeStart || result.offsets[i] >= excludeEnd) &&
        (result.offsets[i] != excludeEnd || result.offsets[i - 1] == excludeEnd)
      ) {
        textLines.push(result.lines[i]);
        offsets.push(result.offsets[i]);
      }
    }
  }

  const lines = [];
  for (let i = 0; i < offsets.length; i++) {
    lines[offsets[i]] = i;
  }

  wasmStates[sourceId] = { offsets, lines };

  return textLines.join("\n");
}

/**
 * @memberof utils/wasm
 * @static
 */
function getWasmLineNumberFormatter(sourceId: string) {
  const codeOf0 = 48,
    codeOfA = 65;
  const buffer = [
    codeOf0,
    codeOf0,
    codeOf0,
    codeOf0,
    codeOf0,
    codeOf0,
    codeOf0,
    codeOf0
  ];
  let last0 = 7;
  return function(number: number) {
    const offset = lineToWasmOffset(sourceId, number - 1);
    if (offset == undefined) {
      return "";
    }
    let i = 7;
    for (let n = offset; n !== 0 && i >= 0; n >>= 4, i--) {
      const nibble = n & 15;
      buffer[i] = nibble < 10 ? codeOf0 + nibble : codeOfA - 10 + nibble;
    }
    for (let j = i; j > last0; j--) {
      buffer[j] = codeOf0;
    }
    last0 = i;
    return String.fromCharCode.apply(null, buffer);
  };
}

/**
 * @memberof utils/wasm
 * @static
 */
function isWasm(sourceId: string) {
  return sourceId in wasmStates;
}

/**
 * @memberof utils/wasm
 * @static
 */
function lineToWasmOffset(sourceId: string, number: number): ?number {
  const wasmState = wasmStates[sourceId];
  if (!wasmState) {
    return undefined;
  }
  let offset = wasmState.offsets[number];
  while (offset === undefined && number > 0) {
    offset = wasmState.offsets[--number];
  }
  return offset;
}

/**
 * @memberof utils/wasm
 * @static
 */
function wasmOffsetToLine(sourceId: string, offset: number): ?number {
  const wasmState = wasmStates[sourceId];
  if (!wasmState) {
    return undefined;
  }
  return wasmState.lines[offset];
}

/**
 * @memberof utils/wasm
 * @static
 */
function clearWasmStates() {
  wasmStates = Object.create(null);
}

function renderWasmText(sourceId: string, { binary }: Object) {
  // binary does not survive as Uint8Array, converting from string
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = binary.charCodeAt(i);
  }
  const { lines } = getWasmText(sourceId, data);
  const MAX_LINES = 100000;
  if (lines.length > MAX_LINES) {
    lines.splice(MAX_LINES, lines.length - MAX_LINES);
    lines.push(";; .... text is truncated due to the size");
  }
  return lines;
}

export {
  getWasmText,
  getWasmFunctionsIndex,
  getWasmPart,
  getWasmLineNumberFormatter,
  isWasm,
  lineToWasmOffset,
  wasmOffsetToLine,
  clearWasmStates,
  renderWasmText
};
