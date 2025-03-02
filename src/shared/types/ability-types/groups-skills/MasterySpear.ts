import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Spin from "@shared/types/ability-types/skills/Spin";
import Impale from "@shared/types/ability-types/skills/Impale";
import Legsweep from "@shared/types/ability-types/skills/Legsweep";
import ServerCache from "@shared/cache/server-cache";

export class MasterySpear implements IAbilityGroup {
  static instance: MasterySpear;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MasterySpear;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Spin.GetInstance(), 
      Impale.GetInstance(), 
      Legsweep.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasterySpear {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasterySpear.GetInstance() as T;
  }
}

export default MasterySpear;
