import type { Settings } from '../store/useStore';
import type { VehicleParts } from './VehicleView';

/** The parts of the vehicles the display settings show. */
export function vehicleParts(settings: Settings): VehicleParts {
  return {
    walls: settings.showBodyWalls,
    posts: settings.showBodyPosts,
    floorMarks: settings.showFloorMarks,
    chassis: settings.showChassis,
  };
}

/** Display settings that change only what the vehicles show (no rebuild needed). */
export function partsChanged(a: Settings, b: Settings): boolean {
  return (
    a.showBodyWalls !== b.showBodyWalls ||
    a.showBodyPosts !== b.showBodyPosts ||
    a.showFloorMarks !== b.showFloorMarks ||
    a.showChassis !== b.showChassis
  );
}
