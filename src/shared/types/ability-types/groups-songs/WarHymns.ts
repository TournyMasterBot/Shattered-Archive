import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfWar from "@shared/types/ability-types/songs/SongOfWar";
import Lullaby from "@shared/types/ability-types/songs/Lullaby";
import SongOfCharm from "@shared/types/ability-types/songs/SongOfCharm";
import GreenLeaf from "@shared/types/ability-types/songs/GreenLeaf";
import WeaknessWithin from "@shared/types/ability-types/songs/WeaknessWithin";
import Nightmare from "@shared/types/ability-types/songs/Nightmare";
import ScreechingBanshee from "@shared/types/ability-types/songs/ScreechingBanshee";
import WeCome from "@shared/types/ability-types/songs/WeCome";
import ReleaseMe from "@shared/types/ability-types/songs/ReleaseMe";
import RunRiot from "@shared/types/ability-types/songs/RunRiot";
import PiercingWinds from "@shared/types/ability-types/songs/PiercingWinds";
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
