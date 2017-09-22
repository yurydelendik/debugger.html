// @flow
import type { Pause, Frame } from "../types";
import { get } from "lodash";
import { getOriginalLocation } from "./source-maps";
import { getSource } from "../selectors";

export function updateFrameLocations(
  frames: Frame[],
  getState: any,
  sourceMaps: any
): Promise<Frame[]> {
  if (!frames || frames.length == 0) {
    return Promise.resolve(frames);
  }

  return Promise.all(
    frames.map(frame => {
      const source = getSource(getState(), frame.location.sourceId).toJS();
      return getOriginalLocation(
        source,
        frame.location,
        sourceMaps
      ).then(loc => {
        return Object.assign({}, frame, {
          location: loc
        });
      });
    })
  );
}

// Map protocol pause "why" reason to a valid L10N key
// These are the known unhandled reasons:
// "breakpointConditionThrown", "clientEvaluated"
// "interrupted", "attached"
const reasons = {
  debuggerStatement: "whyPaused.debuggerStatement",
  breakpoint: "whyPaused.breakpoint",
  exception: "whyPaused.exception",
  resumeLimit: "whyPaused.resumeLimit",
  pauseOnDOMEvents: "whyPaused.pauseOnDOMEvents",
  breakpointConditionThrown: "whyPaused.breakpointConditionThrown",

  // V8
  DOM: "whyPaused.breakpoint",
  EventListener: "whyPaused.pauseOnDOMEvents",
  XHR: "whyPaused.xhr",
  promiseRejection: "whyPaused.promiseRejection",
  assert: "whyPaused.assert",
  debugCommand: "whyPaused.debugCommand",
  other: "whyPaused.other"
};

export function getPauseReason(pauseInfo: Pause): string | null {
  if (!pauseInfo) {
    return null;
  }

  const reasonType = get(pauseInfo, "why.type", null);
  if (!reasons[reasonType]) {
    console.log("Please file an issue: reasonType=", reasonType);
  }
  return reasons[reasonType];
}

export async function getPausedPosition(
  pauseInfo: Pause,
  getState: any,
  sourceMaps: any
) {
  let { frames } = pauseInfo;
  frames = await updateFrameLocations(frames, getState, sourceMaps);
  const frame = frames[0];
  const { location } = frame;
  return location;
}
