import { getSource } from "../selectors";
import { getWasmFunctionsIndex } from "./wasm";

export async function getGeneratedLocation(
  state: Object,
  source: SourceRecord,
  location: Location,
  sourceMaps: Object
) {
  if (!sourceMaps.isOriginalId(location.sourceId)) {
    return location;
  }

  if (source.fakeOf) {
    const originalSource = getSource(state, location.sourceId);
    const sourceUrl = originalSource.get("url");
    return {
      line: location.line,
      sourceId: sourceMaps.originalToGeneratedId(location.sourceId),
      column: undefined,
      sourceUrl: sourceUrl.replace(/\?parts\/.*$/)
    };
  }

  const { line, sourceId, column } = await sourceMaps.getGeneratedLocation(
    location,
    source
  );

  const generatedSource = getSource(state, sourceId);
  const sourceUrl = generatedSource.get("url");
  return {
    line,
    sourceId,
    column: column === 0 ? undefined : column,
    sourceUrl
  };
}

export async function getOriginalLocation(
  source: SourceRecord,
  location: Location,
  sourceMaps: Object
) {
  if (source.isWasm) {
    const { binary } = (source.text: any);
    const generatedSourceUrl = source.url;
    const index = getWasmFunctionsIndex(binary);
    const { line, sourceId } = location;
    const found = index.find(e => e.start <= line && line < e.end);
    const originalUrl =
      generatedSourceUrl + "?parts/" + (found ? found.id : "");
    return {
      line,
      sourceId: sourceMaps.generatedToOriginalId(sourceId, originalUrl),
      column: undefined,
      sourceUrl: originalUrl
    };
  }

  return sourceMaps.getOriginalLocation(location, source);
}
