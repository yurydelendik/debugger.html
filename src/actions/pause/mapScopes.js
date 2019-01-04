/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

import { getCurrentThread, getSelectedFrameId, getSource } from "../../selectors";
import { loadSourceText } from "../sources/loadSourceText";
import { PROMISE } from "../utils/middleware/promise";

import { features } from "../../utils/prefs";
import { log } from "../../utils/log";
import { isGenerated } from "../../utils/source";
import type { Frame, Scope } from "../../types";

import type { ThunkArgs } from "../types";

import { buildMappedScopes } from "../../utils/pause/mapScopes";

import type { OriginalScope } from "../../utils/pause/mapScopes";

export async function buildOriginalScopes(
  frame: Frame,
  client: any,
  frameId: any,
  thread: any
): Promise<?{
  mappings: {
    [string]: string
  },
  scope: OriginalScope
}> {
  const frameBase = frame.originalVariables.frameBase;
  const inputs = [];
  for (let i = 0; i < frame.originalVariables.vars.length; i++) {
    const expr = (frame.originalVariables.vars[i].expr || "void 0").replace(/\bfp\(\)/g, frameBase);
    inputs[i] = expr;
  }
  const results = await client.evaluateExpressions(inputs, {
    frameId,
    thread
  });

  const variables = {};
  for (let i = 0; i < frame.originalVariables.vars.length; i++) {
    const name = frame.originalVariables.vars[i].name
    variables[name] = { value: results[i].result };
  }
  const bindings = {
    arguments: [],
    variables,
  };
  const scope = {
    type: "function",
    actor: frame.actor,
    bindings,
    parent: null,
    function: null,
    block: null
  };
  return {
    mappings: {},
    scope,
  };
}

export function mapScopes(scopes: Promise<Scope>, frame: Frame) {
  return async function({ dispatch, getState, client, sourceMaps }: ThunkArgs) {
    const generatedSource = getSource(
      getState(),
      frame.generatedLocation.sourceId
    );

    const source = getSource(getState(), frame.location.sourceId);

    await dispatch({
      type: "MAP_SCOPES",
      thread: getCurrentThread(getState()),
      frame,
      [PROMISE]: (async function() {
        if (frame.isOriginal && frame.originalVariables) {
          const frameId = getSelectedFrameId(getState());
          const thread = getCurrentThread(getState());
          return buildOriginalScopes(frame, client, frameId, thread);
        }

        if (
          !features.mapScopes ||
          !source ||
          !generatedSource ||
          generatedSource.isWasm ||
          source.isPrettyPrinted ||
          isGenerated(source)
        ) {
          return null;
        }

        await dispatch(loadSourceText(source));

        try {
          return await buildMappedScopes(
            source,
            frame,
            await scopes,
            sourceMaps,
            client
          );
        } catch (e) {
          log(e);
          return null;
        }
      })()
    });
  };
}
