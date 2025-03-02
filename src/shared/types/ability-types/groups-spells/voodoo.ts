import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Leprosy from "@shared/types/ability-types/spells/Leprosy";
import Spiritwalk from "@shared/types/ability-types/spells/Spiritwalk";
import Snakebite from "@shared/types/ability-types/spells/Snakebite";
import Hex from "@shared/types/ability-types/spells/Hex";
import BrainFever from "@shared/types/ability-types/spells/BrainFever";
import VoodooDoll from "@shared/types/ability-types/spells/VoodooDoll";
import Wither from "@shared/types/ability-types/spells/Wither";
import Poultice from "@shared/types/ability-types/spells/Poultice";
import AnimalSpirit from "@shared/types/ability-types/spells/AnimalSpirit";
import CorrosiveSkin from "@shared/types/ability-types/spells/CorrosiveSkin";
import Embalm from "@shared/types/ability-types/spells/Embalm";
import Soulsight from "@shared/types/ability-types/spells/Soulsight";
import Thunderclap from "@shared/types/ability-types/spells/Thunderclap";
import ShrinkHead from "@shared/types/ability-types/spells/ShrinkHead";
import ShrinkSkull from "@shared/types/ability-types/spells/ShrinkSkull";
import Haunt from "@shared/types/ability-types/spells/Haunt";
import ContinualLight from "@shared/types/ability-types/spells/ContinualLight";
import Beastform from "@shared/types/ability-types/spells/Beastform";
import ServerCache from "@shared/cache/server-cache";

export class Voodoo implements IAbilityGroup {
  static instance: Voodoo;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Voodoo;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Leprosy.GetInstance(),
      Spiritwalk.GetInstance(),
      Snakebite.GetInstance(),
      Hex.GetInstance(),
      BrainFever.GetInstance(),
      VoodooDoll.GetInstance(),
      Wither.GetInstance(),
      Beastform.GetInstance(),
      Poultice.GetInstance(),
      AnimalSpirit.GetInstance(),
      CorrosiveSkin.GetInstance(),
      Embalm.GetInstance(),
      Soulsight.GetInstance(),
      Thunderclap.GetInstance(),
      ShrinkHead.GetInstance(),
      ShrinkSkull.GetInstance(),
      Haunt.GetInstance(),
      ContinualLight.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Voodoo {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Voodoo.GetInstance() as T;
  }
}

export default Voodoo;
