/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow
/* eslint camelcase: 0*/

import type { SourceLocation, SourceId } from "debugger-html";
import type { Expr } from "./wasmDwarfExpressions";

const { getSourceMap } = require("./sourceMapRequests");
const { generatedToOriginalId } = require("./index");
const { decodeExpr } = require("./wasmDwarfExpressions");

const xScopes = new Map();

type XScopeItem = any;
type XScopeItemsIndex = Map<string, XScopeItem>;

function indexLinkingNames(items: XScopeItem[]): XScopeItemsIndex {
  const result = new Map();
  let queue = [...items];
  while (queue.length > 0) {
    const item = queue.shift();
    if ("linkage_name" in item) {
      result.set(item.linkage_name, item);
    }
    if ("children" in item) {
      queue = [...queue, ...item.children];
    }
  }
  return result;
}

type XScopeData = {
  code_section_offset: number,
  debug_info: Array<XScopeItem>,
  idIndex: XScopeItemsIndex,
  sources: Array<string>
};

async function getXScopes(sourceId: SourceId): Promise<?XScopeData> {
  if (xScopes.has(sourceId)) {
    return xScopes.get(sourceId);
  }
  const map = await getSourceMap(sourceId);
  if (!map || !map.xScopes) {
    xScopes.set(sourceId, null);
    return null;
  }
  const { code_section_offset, debug_info } = map.xScopes;
  const xScope = {
    code_section_offset,
    debug_info,
    idIndex: indexLinkingNames(debug_info),
    sources: map.sources
  };
  xScopes.set(sourceId, xScope);
  return xScope;
}

function isInRange(item: XScopeItem, pc: number): boolean {
  if ("ranges" in item) {
    return item.ranges.some(r => r[0] <= pc && pc < r[1]);
  }
  if ("high_pc" in item) {
    return item.low_pc <= pc && pc < item.high_pc;
  }
  return false;
}

type XScopeVariable = {
  name: string,
  expr?: Expr
};

type XScopeVariables = {
  vars: XScopeVariable[],
  frameBase?: Expr
};

type FoundScope = {
  id: string,
  name?: string,
  variables: XScopeVariables,
  file?: number,
  line?: number
};

type EncodedExpr =
  | string
  | Array<{
      expr: string,
      range: number[]
    }>;

function decodeExprAt(expr: EncodedExpr, pc: number): ?Expr {
  if (typeof expr === "string") {
    return decodeExpr(expr);
  }
  const foundAt = expr.find(i => i.range[0] <= pc && pc < i.range[1]);
  return foundAt ? decodeExpr(foundAt.expr) : null;
}

function getVariables(items: XScopeItem[], pc: number): XScopeVariables {
  const vars = items.children
    ? items.children.reduce((result, item) => {
        switch (item.tag) {
          case "variable":
          case "formal_parameter":
            result.push({
              name: item.name || "",
              expr: item.location ? decodeExprAt(item.location, pc) : null
            });
            break;
        }
        return result;
      }, [])
    : [];
  const frameBase = items.frame_base ? decodeExpr(items.frame_base) : null;
  return {
    vars,
    frameBase
  };
}

function filterScopes(
  items: XScopeItem[],
  pc: number,
  lastItem: ?FoundScope,
  index: XScopeItemsIndex
): FoundScope[] {
  if (!items) {
    return [];
  }
  return items.reduce((result, item) => {
    switch (item.tag) {
      case "compile_unit":
        if (isInRange(item, pc)) {
          result = [
            ...result,
            ...filterScopes(item.children, pc, lastItem, index)
          ];
        }
        break;
      case "namespace":
      case "structure_type":
      case "union_type":
        result = [
          ...result,
          ...filterScopes(item.children, pc, lastItem, index)
        ];
        break;
      case "subprogram":
        if (isInRange(item, pc)) {
          const s: FoundScope = {
            id: item.linkage_name,
            name: item.name,
            variables: getVariables(item, pc)
          };
          result = [...result, s, ...filterScopes(item.children, pc, s, index)];
        }
        break;
      case "inlined_subroutine":
        if (isInRange(item, pc)) {
          const linkedItem = index.get(item.abstract_origin);
          const s: FoundScope = {
            id: item.abstract_origin,
            name: linkedItem ? linkedItem.name : void 0,
            variables: getVariables(item, pc)
          };
          if (lastItem) {
            lastItem.file = item.call_file;
            lastItem.line = item.call_line;
          }
          result = [...result, s, ...filterScopes(item.children, pc, s, index)];
        }
        break;
    }
    return result;
  }, []);
}

class XScope {
  xScope: XScopeData;

  constructor(xScopeData: XScopeData) {
    this.xScope = xScopeData;
  }

  search(
    generatedLocation: SourceLocation
  ): Array<{
    displayName: string,
    variables: XScopeVariables,
    location?: SourceLocation
  }> {
    const { code_section_offset, debug_info, sources, idIndex } = this.xScope;
    const pc = generatedLocation.line - (code_section_offset || 0);
    const scopes = filterScopes(debug_info, pc, null, idIndex);
    scopes.reverse();

    return scopes.map(i => {
      if (!("file" in i)) {
        return {
          displayName: i.name || "",
          variables: i.variables
        };
      }
      const sourceId = generatedToOriginalId(
        generatedLocation.sourceId,
        sources[i.file || 0]
      );
      return {
        displayName: i.name || "",
        variables: i.variables,
        location: {
          line: i.line || 0,
          sourceId
        }
      };
    });
  }
}

async function getWasmXScopes(sourceId: SourceId): Promise<?XScope> {
  const xScopeData = await getXScopes(sourceId);
  if (!xScopeData) {
    return null;
  }
  return new XScope(xScopeData);
}

function clearWasmXScopes() {
  xScopes.clear();
}

module.exports = {
  getWasmXScopes,
  clearWasmXScopes
};
