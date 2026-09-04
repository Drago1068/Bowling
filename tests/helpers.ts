import {
  newEntityMetadata,
  newFrameId,
  newRollId,
  type Roll,
} from "../src/index.ts";

export const TEST_DEVICE_ID = "device-test-0001";

export function makeRoll(overrides: Partial<Roll> = {}): Roll {
  const base: Roll = {
    ...newEntityMetadata({ id: newRollId(), origin_device_id: TEST_DEVICE_ID }),
    entity_type: "Roll",
    frame_id: newFrameId(),
    roll_number: 1,
    pinfall: 10,
  };
  return { ...base, ...overrides };
}