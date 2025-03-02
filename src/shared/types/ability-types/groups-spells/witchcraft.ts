import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CreateCauldron from "@shared/types/ability-types/spells/create-cauldron";
import FindFamiliar from "@shared/types/ability-types/spells/find-familiar";
import Silence from "@shared/types/ability-types/spells/silence";
import PossessFamiliar from "@shared/types/ability-types/spells/possess-familiar";
import Fear from "@shared/types/ability-types/spells/fear";
import Splinter from "@shared/types/ability-types/spells/splinter";
import ServerCache from "@shared/cache/server-cache";

export class Witchcraft implements IAbilityGroup {
  static instance: Witchcraft;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Witchcraft;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CreateCauldron.GetInstance(),
      FindFamiliar.GetInstance(),
      Silence.GetInstance(),
      PossessFamiliar.GetInstance(),
      Fear.GetInstance(),
      Splinter.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Witchcraft {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Witchcraft.GetInstance() as T;
  }
}

export default Witchcraft;
