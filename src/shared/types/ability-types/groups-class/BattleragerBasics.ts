import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Axe from "@shared/types/ability-types/skills/Axe";
import KillingRage from "@shared/types/ability-types/skills/KillingRage";
import Mace from "@shared/types/ability-types/skills/Mace";
import ServerCache from "@shared/cache/server-cache";

export class BattleragerBasics implements IAbilityGroup {
  static instance: BattleragerBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BattleragerBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
       Axe.GetInstance(), 
       KillingRage.GetInstance(), 
       Mace.GetInstance()
      ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BattleragerBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BattleragerBasics.GetInstance() as T;
  }
}

export default BattleragerBasics;
