import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Blindness from "@shared/types/ability-types/spells/blindness";
import EnergyDrain from "@shared/types/ability-types/spells/energy-drain";
import Slow from "@shared/types/ability-types/spells/slow";
import ChangeSex from "@shared/types/ability-types/spells/change-sex";
import Plague from "@shared/types/ability-types/spells/plague";
import Weaken from "@shared/types/ability-types/spells/weaken";
import Curse from "@shared/types/ability-types/spells/curse";
import Poison from "@shared/types/ability-types/spells/poison";
import HeartBlight from "@shared/types/ability-types/spells/heart-blight";
import ServerCache from "@shared/cache/server-cache";

export class Maladictions implements IAbilityGroup {
  static instance: Maladictions;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Maladictions;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Blindness.GetInstance(),
      EnergyDrain.GetInstance(),
      Slow.GetInstance(),
      ChangeSex.GetInstance(),
      Plague.GetInstance(),
      Weaken.GetInstance(),
      Curse.GetInstance(),
      Poison.GetInstance(),
      HeartBlight.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Maladictions {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Maladictions.GetInstance() as T;
  }
}

export default Maladictions;
