import { expect, it } from "vitest";
import { toggleLayerSelection } from "./layer-selection";
it("enables parents, preserves unrelated layers and toggles groups from current state", () => {
  const state = { cctv: false, cctv_previews: false, flights: true };
  const layers = [{ key: "cctv_previews", parent: "cctv" }];
  expect(toggleLayerSelection(state, layers)).toEqual({
    ...state,
    cctv: true,
    cctv_previews: true,
  });
  expect(state.cctv).toBe(false);
  expect(
    toggleLayerSelection({ ...state, cctv_previews: true }, layers),
  ).toEqual(state);
  expect(
    toggleLayerSelection({ a: true, b: false }, [{ key: "a" }, { key: "b" }]),
  ).toEqual({ a: false, b: false });
});
