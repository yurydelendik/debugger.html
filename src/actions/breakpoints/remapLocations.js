import { getOriginalLocation } from "../../utils/source-maps";

export default function remapLocations(breakpoints, sourceId, sourceMaps) {
  const sourceBreakpoints = breakpoints.map(async breakpoint => {
    if (breakpoint.location.sourceId !== sourceId) {
      return breakpoint;
    }
    const location = await getOriginalLocation(
      undefined,
      breakpoint.location,
      sourceMaps
    );
    return { ...breakpoint, location };
  });

  return Promise.all(sourceBreakpoints.valueSeq());
}
