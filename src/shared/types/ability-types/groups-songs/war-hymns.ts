import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfWar from "../songs/song-of-war";
import Lullaby from "../songs/lullaby";
import SongOfCharm from "../songs/song-of-charm";
import GreenLeaf from "../songs/green-leaf";
import WeaknessWithin from "../songs/weakness-within";
import Nightmare from "../songs/nightmare";
import ScreechingBanshee from "../songs/screeching-banshee";
import WeCome from "../songs/we-come";
import ReleaseMe from "../songs/release-me";
import RunRiot from "../songs/run-riot";
import PiercingWinds from "../songs/piering-winds";

export class WarHymns implements IAbilityGroup {
  static instance: WarHymns;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.WarHymns;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      SongOfWar.GetInstance().Get(),
      Lullaby.GetInstance().Get(),
      SongOfCharm.GetInstance().Get(),
      GreenLeaf.GetInstance().Get(),
      PiercingWinds.GetInstance().Get(),
      WeaknessWithin.GetInstance().Get(),
      Nightmare.GetInstance().Get(),
      ScreechingBanshee.GetInstance().Get(),
      WeCome.GetInstance().Get(),
      ReleaseMe.GetInstance().Get(),
      RunRiot.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarHymns {
    if (!WarHymns.instance) {
      WarHymns.instance = new WarHymns();
    }
    return WarHymns.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarHymns.GetInstance() as T;
  }
}

export default WarHymns;
