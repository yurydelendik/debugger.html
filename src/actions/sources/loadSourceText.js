// @flow
import { PROMISE } from "../../utils/redux/middleware/promise";
import { setEmptyLines, setSymbols } from "../ast";
import { getWasmPart } from "../../utils/wasm";
import type { Source } from "../../types";
import type { ThunkArgs } from "../types";
/**
 * @memberof actions/sources
 * @static
 */
export function loadSourceText(source: Source) {
  return async ({ dispatch, getState, client, sourceMaps }: ThunkArgs) => {
    // Fetch the source text only once.
    if (source.text) {
      return Promise.resolve(source);
    }

    await dispatch({
      type: "LOAD_SOURCE_TEXT",
      source: source,
      [PROMISE]: (async function() {
        if (source.fakeOf) {
          const { source: { binary } } = await client.sourceContents(
            source.fakeOf
          );
          var m = /\/([^\/]+)$/.exec(source.url);
          const text = getWasmPart(source.id, source.range, binary);

          return {
            id: source.id,
            text,
            contentType: "text/javascript"
          };
        }

        if (sourceMaps.isOriginalId(source.id)) {
          return await sourceMaps.getOriginalSourceText(source);
        }

        const response = await client.sourceContents(source.id);

        return {
          id: source.id,
          text: response.source,
          contentType: response.contentType || "text/javascript"
        };
      })()
    });

    await dispatch(setSymbols(source.id));
    await dispatch(setEmptyLines(source.id));
  };
}
