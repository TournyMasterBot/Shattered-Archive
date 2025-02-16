//import IWorldCoord from "../coord-models/world-coord";
//import { BeastiaryItem } from "./beastiary-model";
//import { RecordRoomExits } from "./record-room-model";

export interface IArea {
  continent_id: string;
  area_id: string;
  area_name: string;
  starting_location: string;
  alignment: string;
  recommended_min_level: string;
  recommended_max_level: string;
  directions: string;
  autopilot_level: string;
  //beastiary: BeastiaryItem[];
  /** Data format: `${X}.${Y}.${Z}` */
  areaRooms: { [coordinate: string]: IAreaDetails };
}

export interface IAreaDetails {
  continent_id?: string;
  area_id?: string;
  //worldCoords?: IWorldCoord | null;
  subAreaName?: string;
  terrain?: string;
  rawName?: string;
  rawDesc?: string;
  //rawExits?: RecordRoomExits | null;
}

export default IArea;
