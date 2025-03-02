import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfWar from "@shared/types/ability-types/songs/song-of-war";
import Lullaby from "@shared/types/ability-types/songs/lullaby";
import SongOfCharm from "@shared/types/ability-types/songs/song-of-charm";
import GreenLeaf from "@shared/types/ability-types/songs/green-leaf";
import WeaknessWithin from "@shared/types/ability-types/songs/weakness-within";
import Nightmare from "@shared/types/ability-types/songs/nightmare";
import ScreechingBanshee from "@shared/types/ability-types/songs/screeching-banshee";
import WeCome from "@shared/types/ability-types/songs/we-come";
import ReleaseMe from "@shared/types/ability-types/songs/release-me";
import RunRiot from "@shared/types/ability-types/songs/run-riot";
import PiercingWinds from "@shared/types/ability-types/songs/piering-winds";
import ServerCache from "@shared/cache/server-cache";

export class WarHymns implements IAbilityGroup {
  static instance: WarHymns;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WarHymns;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      SongOfWar.GetInstance(),
      Lullaby.GetInstance(),
      SongOfCharm.GetInstance(),
      GreenLeaf.GetInstance(),
      PiercingWinds.GetInstance(),
      WeaknessWithin.GetInstance(),
      Nightmare.GetInstance(),
      ScreechingBanshee.GetInstance(),
      WeCome.GetInstance(),
      ReleaseMe.GetInstance(),
      RunRiot.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarHymns {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarHymns.GetInstance() as T;
  }
}

export default WarHymns;
