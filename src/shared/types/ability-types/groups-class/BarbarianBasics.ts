import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/Mace";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import ServerCache from "@shared/cache/server-cache";

export class BarbarianBasics implements IAbilityGroup {
  static instance: BarbarianBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BarbarianBasics;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Mace.GetInstance(), 
      SecondAttack.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BarbarianBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BarbarianBasics.GetInstance() as T;
  }
}

export default BarbarianBasics;
