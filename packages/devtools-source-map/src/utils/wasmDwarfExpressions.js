/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow
/* eslint camelcase: 0*/

type Expr = string;

function toJS(buf, frame_base) {
  var readU8 = function () { return buf[i++]; };
  var readS8 = function () { return readU8() << 24 >> 24; };
  var readU16 = function () { var w = buf[i] | (buf[i +1] << 8); i += 2; return w; };
  var readS16 = function () { return readU16() << 16 >> 16; };
  var readS32 = function () { var w = buf[i] | (buf[i +1] << 8) | (buf[i +2] << 16) |(buf[i +3] << 24); i += 4; return w; };
  var readU32 = function () { return readS32() >>> 0; };
  var readU = function () {
    var n = 0, shift = 0, b;
    while ((b = readU8()) & 0x80) {
      n |= (b & 0x7F) << shift; shift += 7;
    }
    return n | (b << shift);
  };
  var readS = function () {
    var n = 0, shift = 0, b;
    while ((b = readU8()) & 0x80) {
      n |= (b & 0x7F) << shift; shift += 7;
    }
    n |= b << shift; shift += 7;
    return shift > 32 ? (n << (32 - shift)) >> (32 - shift) : n;
  };
  var heapExpr = function (addr, getter = "getUint32") {
    return `(new DataView(memory0.buffer).${getter}(${addr}, true))`;
  }
  var popLocation = function () {
    var loc = stack.pop();
    if (loc == "<value>") return "" + stack.pop();
    return heapExpr(loc);
  }
  var i = 0, a, b;
  var stack = [frame_base || "fp()"];
  while (i < buf.length) {
    var code = buf[i++];
    switch (code) {
      case 0x03: // DW_OP_addr
        stack.push(heapExpr(readU32()));
        break;
      case 0x08: // DW_OP_const1u 0x08 1 1-byte constant
        stack.push(readU8());
        break;
      case 0x09: // DW_OP_const1s 0x09 1 1-byte constant
        stack.push(readS8());
        break;
      case 0x0A: // DW_OP_const2u 0x0a 1 2-byte constant
        stack.push(readU16());
        break;
      case 0x0B: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS16());
        break;
      case 0x0C: // DW_OP_const2u 0x0a 1 2-byte constant
        stack.push(readU32());
        break;
      case 0x0D: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS32());
        break;
      case 0x10: // DW_OP_constu 0x10 1 ULEB128 constant
        stack.push(readU());
        break;
      case 0x11: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS());
        break;

      case 0x1c: // DW_OP_minus
        b = stack.pop(); a = stack.pop();
        stack.push(a + "-" + b);
        break;

      case 0x22: // DW_OP_plus
        b = stack.pop(); a =stack.pop();
        stack.push(a + "+" + b);
        break;

      case 0x23: // DW_OP_plus_uconst
        b = readU(); a =stack.pop();
        stack.push(a + "+" + b);
        break;

      case 0x30: case 0x31: case 0x32: case 0x33: // DW_OP_lit0..3
      case 0x34: case 0x35: case 0x36: case 0x37:
      case 0x38: case 0x39: case 0x3a: case 0x3b:
      case 0x3c: case 0x3d: case 0x3e: case 0x3f:
      case 0x40: case 0x41: case 0x42: case 0x43:
      case 0x44: case 0x45: case 0x46: case 0x47:
      case 0x48: case 0x49: case 0x4a: case 0x4b:
      case 0x4c: case 0x4d: case 0x4e: case 0x4f:
        stack.push("" + (code - 0x30));
        break;

      case 0x93: // DW_OP_piece
        a = readS();
        stack.push("piece(" + popLocation() + ", " + a + ")");
        break;

      case 0x9F: // DW_OP_stack_value
        stack.push("<value>");
        break;

      case 0xF6: // WASM ext (old) // FIXME phase out
      case 0xED: // WASM ext
        b = readU(); a = readS();
        switch (b) {
          case 0:
            return "var" + a;
        }
        return "ti" + b + "(" + a + ")";
      default:
        return null;
    }
  }
  return popLocation();
}

function decodeExpr(expr: string): Expr {
  if (expr.includes("//")) {
    expr = expr.slice(0, expr.indexOf=("//")).trim();
  }
  const code = new Uint8Array(expr.length >> 1);
  for (let i = 0; i < code.length; i++) {
    code[i] = parseInt(expr.substr(i << 1, 2), 16);
  }
  return toJS(code) || `dwarf("${expr}")`;
}

export type { Expr };

module.exports = {
  decodeExpr
};
