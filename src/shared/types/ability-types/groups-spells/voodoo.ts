import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Leprosy from "@shared/types/ability-types/spells/leprosy";
import Spiritwalk from "@shared/types/ability-types/spells/spiritwalk";
import Snakebite from "@shared/types/ability-types/spells/snakebite";
import Hex from "@shared/types/ability-types/spells/hex";
import BrainFever from "@shared/types/ability-types/spells/brain-fever";
import VoodooDoll from "@shared/types/ability-types/spells/voodoo-doll";
import Wither from "@shared/types/ability-types/spells/wither";
import Poultice from "@shared/types/ability-types/spells/poultice";
import AnimalSpirit from "@shared/types/ability-types/spells/animal-spirit";
import CorrosiveSkin from "@shared/types/ability-types/spells/corrosive-skin";
import Embalm from "@shared/types/ability-types/spells/embalm";
import Soulsight from "@shared/types/ability-types/spells/soulsight";
import Thunderclap from "@shared/types/ability-types/spells/thunderclap";
import ShrinkHead from "@shared/types/ability-types/spells/shrink-head";
import ShrinkSkull from "@shared/types/ability-types/spells/shrink-skull";
import Haunt from "@shared/types/ability-types/spells/haunt";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import Beastform from "@shared/types/ability-types/spells/beast-form";

export class Voodoo implements IAbilityGroup {
  static instance: Voodoo;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
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
    if (!Voodoo.instance) {
      Voodoo.instance = new Voodoo();
    }
    return Voodoo.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Voodoo.GetInstance() as T;
  }
}

export default Voodoo;
